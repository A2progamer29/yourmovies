"""Authenticated, server-authoritative watch rooms (one WebSocket worker)."""
import asyncio
import json
import math
import re
import secrets
import time
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator
from pymongo.errors import DuplicateKeyError

CODE = re.compile(r"^(?:[A-F0-9]{6}|[A-F0-9]{8})$")
RATES = {0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0}


class RoomSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=60)
    is_public: StrictBool = False
    max_members: int = Field(default=12, ge=2, le=20, strict=True)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        value = " ".join(value.split())
        if not value or any(ord(c) < 32 for c in value):
            raise ValueError("Nom de salon invalide")
        return value


class CreateRoom(BaseModel):
    model_config = ConfigDict(extra="forbid")
    media_id: str = Field(min_length=1, max_length=200)
    season_number: str | None = Field(default=None, max_length=10)
    episode_number: str | None = Field(default=None, max_length=10)


def now():
    return datetime.now(timezone.utc)


def timestamp(value):
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class Room:
    def __init__(self, doc):
        self.doc = doc
        self.connections = []
        self.lock = asyncio.Lock()
        self.closed = False

    @property
    def state(self):
        return self.doc["state"]

    def snapshot(self):
        return {**self.state, "server_time": time.time()}

    def host(self, conn):
        return conn["account_id"] == self.doc["host_id"]

    def participants(self):
        return [{"user_id": c["id"], "name": c["name"], "is_host": self.host(c),
                 "ready": c["ready"], "needs_ads": c["needs_ads"], "ads_done": c["ready"]}
                for c in self.connections]

    def info(self):
        return {key: self.doc[key] for key in ("code", "media_id", "name", "is_public", "max_members", "media")}

    async def broadcast(self, payload, exclude=None):
        for conn in list(self.connections):
            if conn is exclude:
                continue
            try:
                await conn["ws"].send_json(payload)
            except (RuntimeError, OSError, WebSocketDisconnect):
                pass  # The receive loop performs disconnect cleanup.


class PartyService:
    def __init__(self, database, authenticate, premium, limit, media, ready, origins):
        self.database, self.authenticate, self.premium = database, authenticate, premium
        self.limit, self.media, self.ready, self.origins = limit, media, ready, origins
        self.rooms = {}
        self.load_lock = asyncio.Lock()

    async def indexes(self):
        await self.database().parties.create_index("code", unique=True)
        await self.database().parties.create_index("expires_at", expireAfterSeconds=0)

    async def load(self, code):
        code = code.upper()
        if not CODE.fullmatch(code):
            raise HTTPException(404, "Code de salon invalide ou introuvable")
        async with self.load_lock:
            room = self.rooms.get(code)
            if room is None:
                doc = await self.database().parties.find_one({"code": code}, {"_id": 0})
                if not doc:
                    raise HTTPException(404, "Salon introuvable")
                doc.setdefault("expires_at", timestamp(doc["created_at"]) + timedelta(hours=12))
                doc.setdefault("name", "Watch Party")
                doc.setdefault("is_public", False)
                doc.setdefault("max_members", 12)
                doc.setdefault("media", {"title": "Watch Party"})
                doc.setdefault("banned", [])
                doc.setdefault("started", False)
                doc["state"].setdefault("playback_rate", 1.0)
                doc["state"].setdefault("revision", 0)
                # After a server restart nobody should continue on a stale clock.
                doc["state"]["playing"] = False
                room = Room(doc)
                self.rooms[code] = room
            if room.closed or timestamp(room.doc["expires_at"]) <= now():
                await self.close(room, "Le salon a expiré.")
                raise HTTPException(404, "Ce salon a expiré")
            return room

    async def prune(self):
        for room in list(self.rooms.values()):
            if timestamp(room.doc["expires_at"]) <= now():
                async with room.lock:
                    if not room.closed:
                        await self.close(room, "Le salon a expiré.")

    async def save(self, room):
        await self.database().parties.update_one({"code": room.doc["code"]}, {"$set": room.doc})

    async def close(self, room, reason):
        room.closed = True
        await room.broadcast({"type": "party_closed", "reason": reason})
        for conn in list(room.connections):
            try:
                await conn["ws"].close(code=4410)
            except (RuntimeError, OSError):
                pass
        self.rooms.pop(room.doc["code"], None)
        await self.database().parties.delete_one({"code": room.doc["code"]})

    def update_state(self, room, **changes):
        room.doc["state"] = {**room.state, **changes, "updated_at": time.time(),
                             "revision": room.state.get("revision", 0) + 1}

    async def publish_state(self, room, kind="sync", exclude=None):
        await self.save(room)
        await room.broadcast({"type": kind, "state": room.snapshot(), "started": room.doc["started"]}, exclude)

    async def valid_episode(self, media_id, season, episode):
        media = await self.media(media_id)
        if media.get("player_broken") or (media.get("type") == "movie" and not media.get("has_video")):
            raise HTTPException(400, "Ce contenu n'est pas disponible en Watch Party")
        if media.get("type") == "movie":
            if season is not None or episode is not None:
                raise HTTPException(400, "Ce film n'a pas d'épisodes")
            return media, None, None
        episodes = [(str(s["season_number"]), str(e["ep_number"])) for s in media.get("seasons", [])
                    for e in s.get("episodes", []) if e.get("has_video")]
        if not episodes:
            raise HTTPException(400, "Aucun épisode disponible")
        selected = (str(season), str(episode)) if season is not None and episode is not None else episodes[0]
        if selected not in episodes:
            raise HTTPException(400, "Épisode introuvable")
        return media, *selected

    async def command(self, room, conn, data):
        kind = data.get("type")
        if kind in {"sync", "episode", "start", "close", "kick"} and not room.host(conn):
            raise HTTPException(403, "Commande réservée à l'hôte")
        if kind == "ping":
            await conn["ws"].send_json({"type": "pong", "nonce": data.get("nonce")})
        elif kind == "request_state":
            await conn["ws"].send_json({"type": "sync", "state": room.snapshot(), "started": room.doc["started"]})
        elif kind == "sync":
            position, rate = data.get("position_seconds"), data.get("playback_rate", 1)
            if (type(position) not in (int, float) or not math.isfinite(position) or not 0 <= position <= 604800
                    or type(rate) not in (int, float) or rate not in RATES or type(data.get("playing")) is not bool):
                raise HTTPException(400, "État de lecture invalide")
            if (str(data.get("season_number") or ""), str(data.get("episode_number") or "")) != (
                    str(room.state.get("season_number") or ""), str(room.state.get("episode_number") or "")):
                return  # An old player can send an event while an episode is changing.
            if not conn["ready"] or not room.doc["started"]:
                return
            self.update_state(room, position_seconds=position, playback_rate=rate, playing=data["playing"])
            await self.publish_state(room, exclude=conn)
        elif kind == "episode":
            _, season, episode = await self.valid_episode(room.doc["media_id"], data.get("season_number"), data.get("episode_number"))
            if (season, episode) == (room.state.get("season_number"), room.state.get("episode_number")):
                return
            room.doc["started"] = False
            self.update_state(room, position_seconds=0, playing=False, season_number=season, episode_number=episode)
            for member in room.connections:
                member["ready"] = False
            await self.publish_state(room, "episode")
            await room.broadcast({"type": "participants", "participants": room.participants()})
        elif kind == "ready":
            if conn["ready"] and data.get("done") is True:
                return
            conn["ready"] = bool(data.get("done") is True and await self.ready(conn, room, data.get("grant")))
            await room.broadcast({"type": "participants", "participants": room.participants()})
        elif kind == "start":
            if not room.connections or not all(c["ready"] for c in room.connections):
                raise HTTPException(409, "Les participants ne sont pas encore prêts")
            if room.doc["started"]:
                return
            room.doc["started"] = True
            self.update_state(room, playing=True)
            await self.publish_state(room, "started")
        elif kind == "close":
            await self.close(room, "L'hôte a fermé le salon.")
        elif kind == "kick":
            for member in list(room.connections):
                if member["id"] != data.get("user_id") or room.host(member):
                    continue
                room.doc["banned"].append(member["account_id"])
                await self.save(room)
                await member["ws"].send_json({"type": "kicked"})
                await member["ws"].close(code=4410)
                room.connections.remove(member)
        elif kind == "request_pause" and not room.host(conn):
            for host in room.connections:
                if room.host(host):
                    await host["ws"].send_json({"type": "pause_request", "name": conn["name"]})
        elif kind == "chat":
            message = data.get("text")
            if isinstance(message, str) and message.strip():
                await room.broadcast({"type": "chat", "user_id": conn["id"], "name": conn["name"], "text": message.strip()[:500]})
        else:
            raise HTTPException(400, "Commande inconnue")

    async def host_grace(self, room):
        await asyncio.sleep(60)
        async with room.lock:
            if not room.closed and not any(room.host(c) for c in room.connections):
                await self.close(room, "L'hôte a quitté le salon.")

    async def receive(self, ws):
        raw = await ws.receive_text()
        if len(raw) > 4096:
            raise ValueError("message too large")
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("object required")
        return data

    def install(self, app, router):
        authenticate = self.authenticate

        @router.post("/party/create")
        async def create(inp: CreateRoom, request: Request, user=Depends(authenticate)):
            await self.limit(request, "party-create", 5, 3600, identity=user["user_id"])
            await self.prune()
            media, season, episode = await self.valid_episode(inp.media_id, inp.season_number, inp.episode_number)
            for _ in range(8):
                doc = {"code": secrets.token_hex(4).upper(), "media_id": inp.media_id, "host_id": user["user_id"],
                       "name": (media.get("title") or "Watch Party")[:60], "is_public": False, "max_members": 12,
                       "media": {k: media.get(k) for k in ("title", "poster_url", "type", "year")}, "banned": [],
                       "created_at": now(), "expires_at": now() + timedelta(hours=12), "started": False,
                       "state": {"position_seconds": 0, "playing": False, "playback_rate": 1,
                                 "season_number": season, "episode_number": episode, "revision": 0, "updated_at": time.time()}}
                try:
                    await self.database().parties.insert_one(dict(doc))
                    room = Room(doc)
                    self.rooms[doc["code"]] = room
                    return {**room.info(), "state": room.snapshot()}
                except DuplicateKeyError:
                    continue
            raise HTTPException(503, "Impossible de générer un salon, réessayez")

        @router.get("/party/public")
        async def public(request: Request):
            """Room Party directory: only public rooms with a connected host; no playback sources."""
            await self.limit(request, "party-directory", 90, 60)
            await self.prune()
            return {"rooms": [{**r.info(), "participants_count": len(r.connections), "started": r.doc["started"],
                               "state": r.snapshot()} for r in list(self.rooms.values())
                              if r.doc["is_public"] and not r.closed and timestamp(r.doc["expires_at"]) > now()
                              and any(r.host(c) for c in r.connections)][:100]}

        @router.get("/party/{code}")
        async def get(code: str, request: Request, user=Depends(authenticate)):
            await self.limit(request, "party-lookup", 40, 60, identity=user["user_id"])
            room = await self.load(code)
            if user["user_id"] in room.doc["banned"]:
                raise HTTPException(403, "Vous avez été retiré de ce salon")
            return {**room.info(), "state": room.snapshot(), "started": room.doc["started"],
                    "participants_count": len(room.connections)}

        @router.patch("/party/{code}/settings")
        async def settings(code: str, inp: RoomSettings, user=Depends(authenticate)):
            room = await self.load(code)
            async with room.lock:
                if room.doc["host_id"] != user["user_id"]:
                    raise HTTPException(403, "Paramètres réservés à l'hôte")
                if inp.max_members < len(room.connections):
                    raise HTTPException(409, "La capacité ne peut pas être inférieure au nombre de participants")
                room.doc.update(inp.model_dump())
                await self.save(room)
                await room.broadcast({"type": "room", "room": room.info()})
                return room.info()

        @app.websocket("/api/party/{code}/ws")
        async def socket(ws: WebSocket, code: str):
            if ws.headers.get("origin") not in self.origins():
                await ws.close(code=4403)
                return
            try:
                user = await authenticate(ws, None)
                await self.limit(ws, "party-connect", 30, 60, identity=user["user_id"])
                room = await self.load(code)
            except HTTPException as exc:
                await ws.close(code={401: 4401, 404: 4404, 429: 4429}.get(exc.status_code, 4403))
                return
            await ws.accept()
            conn = None
            try:
                auth = await asyncio.wait_for(self.receive(ws), 10)
                if auth.get("type") != "auth":
                    raise ValueError("auth required")
                profile = auth.get("profile")
                name = user.get("name") or "Participant"
                if profile:
                    if not isinstance(profile, str):
                        raise ValueError("invalid profile")
                    owned = await self.database().profiles.find_one({"id": profile, "user_id": user["user_id"]})
                    if not owned:
                        await ws.close(code=4403)
                        return
                    name = owned.get("name") or name
                async with room.lock:
                    if room.closed or user["user_id"] in room.doc["banned"]:
                        await ws.close(code=4403)
                        return
                    if len(room.connections) >= room.doc["max_members"]:
                        await ws.close(code=4409)
                        return
                    if any(c["account_id"] == user["user_id"] and (room.host(c) or c["profile"] == profile) for c in room.connections):
                        await ws.close(code=4409)
                        return
                    conn = {"ws": ws, "id": secrets.token_hex(8), "account_id": user["user_id"], "profile": profile,
                            "name": str(name)[:60], "user": user, "needs_ads": not self.premium(user), "ready": False}
                    room.connections.append(conn)
                    await ws.send_json({"type": "hello", "room": room.info(), "state": room.snapshot(),
                                        "started": room.doc["started"], "you": {"is_host": room.host(conn)}})
                    await room.broadcast({"type": "participants", "participants": room.participants()})
                times, checked = [], time.monotonic()
                while not room.closed:
                    data = await asyncio.wait_for(self.receive(ws), 45)
                    tick = time.monotonic()
                    times = [t for t in times if tick - t < 10]
                    if len(times) >= 30:
                        await ws.close(code=4429)
                        break
                    times.append(tick)
                    if tick - checked > 60:
                        conn["user"] = await authenticate(ws, None)
                        checked = tick
                    if timestamp(room.doc["expires_at"]) <= now():
                        await self.close(room, "Le salon a expiré.")
                        break
                    async with room.lock:
                        if conn not in room.connections or room.closed:
                            break
                        try:
                            await self.command(room, conn, data)
                        except HTTPException as exc:
                            await ws.send_json({"type": "error", "message": exc.detail})
            except (ValueError, asyncio.TimeoutError):
                await ws.close(code=4400)
            except HTTPException:
                await ws.close(code=4401)
            except (WebSocketDisconnect, RuntimeError):
                pass
            finally:
                if conn is not None:
                    async with room.lock:
                        if conn in room.connections:
                            room.connections.remove(conn)
                        if not room.closed:
                            if room.host(conn):
                                elapsed = max(0, time.time() - room.state["updated_at"]) if room.state["playing"] else 0
                                self.update_state(room, playing=False, position_seconds=room.state["position_seconds"] + elapsed * room.state["playback_rate"])
                                await self.publish_state(room)
                                asyncio.create_task(self.host_grace(room))
                            await room.broadcast({"type": "participants", "participants": room.participants()})
