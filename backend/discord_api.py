"""Private API used by the YourMovie's Discord bot.

The bot never receives MongoDB credentials. It authenticates with a dedicated
service key and all economy decisions stay server-side.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
import random
import secrets
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

try:
    from .discord_economy import RewardPolicy, premium_plan_for_boosts
except ImportError:
    from discord_economy import RewardPolicy, premium_plan_for_boosts


ACTIVITY_TYPES = {"message", "reaction", "command"}
LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def api_error(status: int, code: str, message: str, action: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message, "action": action})


def _env_int(name: str, default: int, minimum: int = 0) -> int:
    try:
        return max(minimum, int(os.environ.get(name, default)))
    except (TypeError, ValueError):
        return default


class LinkCompleteInput(BaseModel):
    code: str = Field(min_length=6, max_length=16)
    discord_user_id: str = Field(pattern=r"^\d{15,22}$")
    discord_name: str = Field(min_length=1, max_length=100)
    guild_id: str = Field(pattern=r"^\d{15,22}$")


class RewardInput(BaseModel):
    discord_user_id: str = Field(pattern=r"^\d{15,22}$")
    guild_id: str = Field(pattern=r"^\d{15,22}$")
    event_id: str = Field(min_length=3, max_length=160)
    event_type: Literal["message", "reaction", "command", "bump"]


class BoostEventInput(BaseModel):
    discord_user_id: str = Field(pattern=r"^\d{15,22}$")
    guild_id: str = Field(pattern=r"^\d{15,22}$")
    event_id: str = Field(min_length=3, max_length=160)


class BoostStatusInput(BaseModel):
    discord_user_id: str = Field(pattern=r"^\d{15,22}$")
    guild_id: str = Field(pattern=r"^\d{15,22}$")
    is_boosting: bool


class BoostReconcileInput(BaseModel):
    guild_id: str = Field(pattern=r"^\d{15,22}$")
    boosting_discord_user_ids: list[str] = Field(max_length=5000)


class BoostSetInput(BaseModel):
    discord_user_id: str = Field(pattern=r"^\d{15,22}$")
    guild_id: str = Field(pattern=r"^\d{15,22}$")
    boost_count: int = Field(ge=0, le=20)


def create_discord_router(
    *,
    db,
    award_coins: Callable[..., Awaitable[float]],
    get_current_user,
    get_coin_plans: Callable[[], Awaitable[dict]],
) -> APIRouter:
    router = APIRouter(tags=["discord"])
    index_lock = asyncio.Lock()
    indexes_ready = False

    activity_min = _env_int("DISCORD_ACTIVITY_REWARD_MIN", 1, 1)
    activity_max = max(activity_min, _env_int("DISCORD_ACTIVITY_REWARD_MAX", 3, 1))
    activity_cooldown = _env_int("DISCORD_ACTIVITY_COOLDOWN_SECONDS", 180, 10)
    activity_daily_cap = _env_int("DISCORD_ACTIVITY_DAILY_CAP", 60, 1)
    bump_reward = _env_int("DISCORD_BUMP_REWARD", 5, 1)
    bump_cooldown = _env_int("DISCORD_BUMP_COOLDOWN_SECONDS", 7200, 60)
    bump_daily_cap = _env_int("DISCORD_BUMP_DAILY_CAP", 15, 1)
    link_ttl_minutes = 5
    activity_policy = RewardPolicy(activity_min, activity_max, activity_cooldown, activity_daily_cap)
    bump_policy = RewardPolicy(bump_reward, bump_reward, bump_cooldown, bump_daily_cap)

    async def ensure_indexes() -> None:
        nonlocal indexes_ready
        if indexes_ready:
            return
        async with index_lock:
            if indexes_ready:
                return
            await db.discord_link_codes.create_index("expires_at", expireAfterSeconds=0)
            await db.discord_links.create_index("user_id", unique=True)
            await db.discord_links.create_index("discord_user_id", unique=True)
            await db.discord_reward_events.create_index("event_id", unique=True)
            await db.discord_reward_events.create_index("created_at", expireAfterSeconds=60 * 60 * 24 * 180)
            await db.discord_boost_events.create_index("event_id", unique=True)
            indexes_ready = True

    async def require_service_key(
        x_yourmovies_service_key: Optional[str] = Header(None, alias="X-YourMovies-Service-Key"),
    ) -> None:
        expected = os.environ.get("DISCORD_SERVICE_KEY", "")
        if not expected:
            raise api_error(503, "YM-CONFIG-SERVICE-KEY", "DISCORD_SERVICE_KEY n’est pas configurée sur le backend.", "Ajoute la variable sur Render puis redémarre le service.")
        if not x_yourmovies_service_key or not hmac.compare_digest(x_yourmovies_service_key, expected):
            raise api_error(401, "YM-AUTH-SERVICE-KEY", "La clé de service du bot ne correspond pas à celle du backend.", "Utilise exactement la même DISCORD_SERVICE_KEY des deux côtés puis redémarre les services.")

    async def linked_user(discord_user_id: str) -> Optional[dict]:
        return await db.discord_links.find_one({"discord_user_id": discord_user_id}, {"_id": 0})

    def link_code_hash(code: str) -> str:
        pepper = os.environ.get("DISCORD_LINK_CODE_PEPPER") or os.environ.get("DISCORD_SERVICE_KEY", "")
        return hashlib.sha256(f"{pepper}:{code.upper()}".encode()).hexdigest()

    def rule_for(event_type: str) -> dict:
        if event_type in ACTIVITY_TYPES:
            return {
                "group": "activity",
                "amount": random.randint(activity_min, activity_max),
                "cooldown": activity_cooldown,
                "daily_cap": activity_daily_cap,
            }
        return {
            "group": "bump",
            "amount": bump_reward,
            "cooldown": bump_cooldown,
            "daily_cap": bump_daily_cap,
        }

    async def apply_boost_entitlement(link: dict, guild_id: str, count: int, active: bool) -> dict:
        now = datetime.now(timezone.utc)
        count = max(0, count) if active else 0
        plan = premium_plan_for_boosts(count)
        link_update = {
            "boost_count": count,
            "is_boosting": bool(active and plan),
            "boost_guild_id": guild_id,
            "boost_updated_at": now,
        }
        await db.discord_links.update_one({"user_id": link["user_id"]}, {"$set": link_update})
        if plan:
            until = (now + timedelta(days=30)).isoformat()
            await db.users.update_one(
                {"user_id": link["user_id"]},
                {"$set": {
                    "discord_premium_plan": plan,
                    "discord_premium_until": until,
                    "discord_premium_boost_count": count,
                }},
            )
        else:
            until = None
            await db.users.update_one(
                {"user_id": link["user_id"]},
                {"$set": {
                    "discord_premium_plan": None,
                    "discord_premium_until": None,
                    "discord_premium_boost_count": 0,
                }},
            )
        return {"plan": plan, "boost_count": count, "premium_until": until}

    @router.post("/discord/link-code")
    async def create_link_code(user: dict = Depends(get_current_user)):
        await ensure_indexes()
        now = datetime.now(timezone.utc)
        code = "".join(secrets.choice(LINK_CODE_ALPHABET) for _ in range(8))
        expires_at = now + timedelta(minutes=link_ttl_minutes)
        await db.discord_link_codes.delete_many({"user_id": user["user_id"]})
        await db.discord_link_codes.insert_one({
            "user_id": user["user_id"],
            "code_hash": link_code_hash(code),
            "created_at": now,
            "expires_at": expires_at,
        })
        return {"code": code, "expires_at": expires_at.isoformat(), "expires_in_minutes": link_ttl_minutes}

    @router.delete("/discord/link")
    async def unlink_discord(user: dict = Depends(get_current_user)):
        await ensure_indexes()
        await db.discord_links.delete_one({"user_id": user["user_id"]})
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {
                "discord_user_id": None,
                "discord_premium_plan": None,
                "discord_premium_until": None,
                "discord_premium_boost_count": 0,
            }},
        )
        return {"ok": True}

    @router.post("/internal/discord/link", dependencies=[Depends(require_service_key)])
    async def complete_link(inp: LinkCompleteInput):
        await ensure_indexes()
        now = datetime.now(timezone.utc)
        code = inp.code.strip().upper()
        code_doc = await db.discord_link_codes.find_one_and_delete({
            "code_hash": link_code_hash(code),
            "expires_at": {"$gt": now},
        })
        if not code_doc:
            raise api_error(400, "YM-LINK-CODE-INVALID", "Le code de liaison est invalide ou expiré.", "Ouvre Paramètres > Discord et utilise le code affiché avant son renouvellement automatique de 5 minutes.")
        other = await db.discord_links.find_one({"discord_user_id": inp.discord_user_id}, {"_id": 0})
        if other and other.get("user_id") != code_doc["user_id"]:
            raise api_error(409, "YM-LINK-DISCORD-USED", "Ce compte Discord est déjà lié à un autre compte.", "Dissocie d’abord l’ancienne liaison depuis les paramètres du compte concerné.")
        try:
            await db.discord_links.update_one(
                {"user_id": code_doc["user_id"]},
                {"$set": {
                    "user_id": code_doc["user_id"],
                    "discord_user_id": inp.discord_user_id,
                    "discord_name": inp.discord_name,
                    "guild_id": inp.guild_id,
                    "linked_at": now,
                }, "$setOnInsert": {"boost_count": 0, "is_boosting": False}},
                upsert=True,
            )
        except DuplicateKeyError as exc:
            raise api_error(409, "YM-LINK-CONFLICT", "La liaison existe déjà.", "Dissocie l’ancien compte puis génère un nouveau code.") from exc
        await db.users.update_one(
            {"user_id": code_doc["user_id"]},
            {"$set": {"discord_user_id": inp.discord_user_id}},
        )
        user = await db.users.find_one({"user_id": code_doc["user_id"]}, {"_id": 0, "name": 1, "coins": 1})
        return {"ok": True, "name": (user or {}).get("name"), "coins": float((user or {}).get("coins", 0) or 0)}

    @router.get("/internal/discord/member/{discord_user_id}", dependencies=[Depends(require_service_key)])
    async def discord_member(discord_user_id: str):
        await ensure_indexes()
        link = await linked_user(discord_user_id)
        if not link:
            raise api_error(404, "YM-MEMBER-NOT-LINKED", "Ton compte Discord n’est pas lié à YourMovie's.", "Va dans Paramètres > Discord, génère un code puis utilise /lier.")
        user = await db.users.find_one({"user_id": link["user_id"]}, {"_id": 0, "name": 1, "coins": 1})
        if not user:
            raise api_error(404, "YM-MEMBER-NOT-FOUND", "Le compte YourMovie's associé est introuvable.", "Dissocie puis relie à nouveau Discord, ou contacte le staff.")
        return {
            "name": user.get("name"),
            "coins": round(float(user.get("coins", 0) or 0), 1),
            "boost_count": int(link.get("boost_count", 0) or 0),
            "is_boosting": bool(link.get("is_boosting")),
        }

    @router.get("/internal/discord/economy", dependencies=[Depends(require_service_key)])
    async def economy_config():
        return {
            "activity": {
                "reward_min": activity_min,
                "reward_max": activity_max,
                "cooldown_seconds": activity_cooldown,
                "daily_cap": activity_daily_cap,
            },
            "bump": {
                "reward": bump_reward,
                "cooldown_seconds": bump_cooldown,
                "daily_cap": bump_daily_cap,
            },
            "premium_costs": await get_coin_plans(),
        }

    @router.post("/internal/discord/reward", dependencies=[Depends(require_service_key)])
    async def reward_discord_activity(inp: RewardInput):
        await ensure_indexes()
        now = datetime.now(timezone.utc)
        event_doc = {
            "event_id": inp.event_id,
            "discord_user_id": inp.discord_user_id,
            "guild_id": inp.guild_id,
            "event_type": inp.event_type,
            "status": "processing",
            "created_at": now,
        }
        try:
            await db.discord_reward_events.insert_one(event_doc)
        except DuplicateKeyError:
            previous = await db.discord_reward_events.find_one({"event_id": inp.event_id}, {"_id": 0})
            return previous or {"awarded": 0, "reason": "duplicate"}

        link = await linked_user(inp.discord_user_id)
        if not link:
            result = {"awarded": 0, "reason": "not_linked"}
            await db.discord_reward_events.update_one({"event_id": inp.event_id}, {"$set": {**result, "status": "rejected"}})
            return result

        rule = rule_for(inp.event_type)
        day = now.date().isoformat()
        window_id = f"{inp.guild_id}:{inp.discord_user_id}:{rule['group']}:{day}"
        state_before = await db.discord_reward_windows.find_one({"_id": window_id}, {"earned": 1, "last_awarded_at": 1})
        already_earned = int((state_before or {}).get("earned", 0) or 0)
        remaining = max(0, rule["daily_cap"] - already_earned)
        policy = activity_policy if rule["group"] == "activity" else bump_policy
        amount = policy.clamp(rule["amount"], already_earned)
        if amount <= 0:
            result = {"awarded": 0, "reason": "daily_cap", "daily_cap": rule["daily_cap"]}
            await db.discord_reward_events.update_one({"event_id": inp.event_id}, {"$set": {**result, "status": "rejected"}})
            return result

        cutoff = now - timedelta(seconds=rule["cooldown"])
        try:
            state = await db.discord_reward_windows.find_one_and_update(
                {
                    "_id": window_id,
                    "$and": [
                        {"$or": [{"last_awarded_at": {"$lte": cutoff}}, {"last_awarded_at": {"$exists": False}}]},
                        {"$or": [{"earned": {"$lte": rule["daily_cap"] - amount}}, {"earned": {"$exists": False}}]},
                    ],
                },
                {
                    "$inc": {"earned": amount},
                    "$set": {"last_awarded_at": now, "updated_at": now},
                    "$setOnInsert": {"created_at": now, "day": day, "group": rule["group"]},
                },
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )
        except DuplicateKeyError:
            state = None

        if not state:
            current = await db.discord_reward_windows.find_one({"_id": window_id}) or {}
            last_at = current.get("last_awarded_at")
            cooldown_remaining = 0
            if last_at:
                cooldown_remaining = max(0, int(rule["cooldown"] - (now - last_at).total_seconds()))
            reason = "cooldown" if cooldown_remaining else "daily_cap"
            result = {"awarded": 0, "reason": reason, "cooldown_remaining": cooldown_remaining}
            await db.discord_reward_events.update_one({"event_id": inp.event_id}, {"$set": {**result, "status": "rejected"}})
            return result

        try:
            balance = await award_coins(
                link["user_id"],
                amount,
                f"+{amount} YM Coins via Discord",
                f"Activité Discord : {inp.event_type}",
                notify=False,
            )
        except Exception:
            await db.discord_reward_windows.update_one({"_id": window_id}, {"$inc": {"earned": -amount}})
            await db.discord_reward_events.delete_one({"event_id": inp.event_id})
            raise

        result = {
            "awarded": amount,
            "balance": balance,
            "reason": "awarded",
            "daily_earned": int(state.get("earned", 0) or 0),
            "daily_cap": rule["daily_cap"],
        }
        await db.discord_reward_events.update_one({"event_id": inp.event_id}, {"$set": {**result, "status": "completed"}})
        return result

    @router.post("/internal/discord/boost/event", dependencies=[Depends(require_service_key)])
    async def record_boost_event(inp: BoostEventInput):
        await ensure_indexes()
        try:
            await db.discord_boost_events.insert_one({
                "event_id": inp.event_id,
                "discord_user_id": inp.discord_user_id,
                "guild_id": inp.guild_id,
                "created_at": datetime.now(timezone.utc),
            })
        except DuplicateKeyError:
            return {"ok": True, "duplicate": True}
        link = await linked_user(inp.discord_user_id)
        if not link:
            return {"ok": False, "reason": "not_linked"}
        count = max(1, int(link.get("boost_count", 0) or 0) + 1)
        return {"ok": True, **await apply_boost_entitlement(link, inp.guild_id, count, True)}

    @router.post("/internal/discord/boost/status", dependencies=[Depends(require_service_key)])
    async def sync_boost_status(inp: BoostStatusInput):
        await ensure_indexes()
        link = await linked_user(inp.discord_user_id)
        if not link:
            return {"ok": False, "reason": "not_linked"}
        count = max(1, int(link.get("boost_count", 0) or 0)) if inp.is_boosting else 0
        return {"ok": True, **await apply_boost_entitlement(link, inp.guild_id, count, inp.is_boosting)}

    @router.post("/internal/discord/boost/reconcile", dependencies=[Depends(require_service_key)])
    async def reconcile_boosters(inp: BoostReconcileInput):
        await ensure_indexes()
        boosting = {str(value) for value in inp.boosting_discord_user_ids if str(value).isdigit()}
        links = await db.discord_links.find({"guild_id": inp.guild_id}, {"_id": 0}).to_list(10000)
        activated = 0
        removed = 0
        for link in links:
            active = link["discord_user_id"] in boosting
            count = max(1, int(link.get("boost_count", 0) or 0)) if active else 0
            await apply_boost_entitlement(link, inp.guild_id, count, active)
            activated += int(active)
            removed += int(not active and bool(link.get("is_boosting")))
        return {"ok": True, "linked": len(links), "activated": activated, "removed": removed}

    @router.post("/internal/discord/boost/set", dependencies=[Depends(require_service_key)])
    async def set_boost_count(inp: BoostSetInput):
        await ensure_indexes()
        link = await linked_user(inp.discord_user_id)
        if not link:
            raise api_error(404, "YM-BOOST-NOT-LINKED", "Ce membre n’a pas lié son compte Discord.", "Demande-lui de générer un code sur le site puis d’utiliser /lier.")
        return {"ok": True, **await apply_boost_entitlement(link, inp.guild_id, inp.boost_count, inp.boost_count > 0)}

    return router
