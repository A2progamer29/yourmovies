"""Aperçu local sans Mongo : catalogue YourMovies en ligne + UQFlex."""
from __future__ import annotations

import json
import os
import time
from typing import Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from uqflex_catalog import (
    configured,
    fetch_items,
    find_item,
    list_docs,
    partner_stream_url,
    partner_stream_path,
    current_base,
    ssh_stream,
    _headers,
    is_uqflex_id,
    raw_id,
    to_media_doc,
)

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

UPSTREAM = (os.environ.get("YOURMOVIES_UPSTREAM") or "https://yourmovies-backend.onrender.com").rstrip("/")
CACHE_PATH = os.path.join(os.path.dirname(__file__), "data", "local_catalog.json")
CACHE_TTL = 300

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Length", "Content-Range", "Accept-Ranges"],
)

_local_items: list[dict] = []
_local_at = 0.0


def _read_disk() -> list[dict]:
    try:
        with open(CACHE_PATH, encoding="utf-8") as handle:
            rows = json.load(handle)
        return [row for row in rows if isinstance(row, dict) and row.get("id")]
    except Exception:
        return []


def _write_disk(rows: list[dict]) -> None:
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    with open(CACHE_PATH, "w", encoding="utf-8") as handle:
        json.dump(rows, handle, ensure_ascii=False)


def refresh_local(force: bool = False) -> list[dict]:
    global _local_items, _local_at
    now = time.time()
    if not force and _local_items and now - _local_at < CACHE_TTL:
        return _local_items
    if not _local_items:
        _local_items = _read_disk()
    try:
        resp = requests.get("%s/api/media" % UPSTREAM, params={"limit": 500}, timeout=45)
        resp.raise_for_status()
        data = resp.json()
        rows = data if isinstance(data, list) else data.get("items") or []
        items = [row for row in rows if isinstance(row, dict) and row.get("id")]
        if items:
            _local_items = items
            _local_at = now
            _write_disk(items)
    except Exception as exc:
        print("upstream catalog fetch failed: %s" % type(exc).__name__, flush=True)
        if not _local_items:
            _local_items = _read_disk()
        _local_at = now
    return _local_items


def _base(request: Request) -> str:
    return (os.environ.get("PUBLIC_API_URL") or str(request.base_url)).rstrip("/")


def _merge(local_docs: list[dict], request: Request, media_type: Optional[str], query: Optional[str], featured: Optional[bool]) -> list[dict]:
    if featured is True or not configured():
        return local_docs
    existing_tmdb = set()
    existing_titles = set()
    for doc in local_docs:
        tmdb = doc.get("tmdb_id")
        try:
            if tmdb not in (None, ""):
                existing_tmdb.add(int(tmdb))
        except (TypeError, ValueError):
            pass
        existing_titles.add(
            (str(doc.get("title") or "").strip().lower(), str(doc.get("year") or ""), str(doc.get("type") or "movie"))
        )
    extra = []
    for doc in list_docs(_base(request), media_type, query):
        tmdb = doc.get("tmdb_id")
        try:
            tmdb_n = int(tmdb) if tmdb not in (None, "") else 0
        except (TypeError, ValueError):
            tmdb_n = 0
        if tmdb_n and tmdb_n in existing_tmdb:
            continue
        key = (str(doc.get("title") or "").strip().lower(), str(doc.get("year") or ""), str(doc.get("type") or "movie"))
        if key in existing_titles:
            continue
        extra.append(doc)
    return local_docs + extra


def _filter(items: list[dict], media_type: Optional[str], query: Optional[str], featured: Optional[bool]) -> list[dict]:
    needle = (query or "").strip().lower()
    out = []
    for doc in items:
        if media_type and str(doc.get("type") or "") != media_type:
            continue
        if featured is True and not doc.get("featured"):
            continue
        title = str(doc.get("title") or "")
        if needle and needle not in title.lower():
            continue
        out.append(doc)
    if featured is True:
        out.sort(key=lambda doc: (doc.get("featured_order") is None, int(doc.get("featured_order") or 10**9)))
    return out


def _catalog(request: Request, media_type: Optional[str] = None, q: Optional[str] = None, featured: Optional[bool] = None, limit: int = 200) -> list[dict]:
    local = _filter(refresh_local(), media_type, q, featured)
    merged = _merge(local, request, media_type, q, featured)
    return merged[: max(1, min(limit, 500))]


def _find_local(media_id: str) -> Optional[dict]:
    wanted = str(media_id or "")
    for doc in refresh_local():
        if str(doc.get("id") or "") == wanted:
            return doc
    return None


@app.on_event("startup")
def _startup():
    refresh_local(force=True)
    uqflex = fetch_items(force=True) if configured() else []
    print("local catalog items: %s | uqflex items: %s" % (len(_local_items), len(uqflex)), flush=True)


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "local": len(refresh_local()),
        "uqflex": configured(),
        "uqflex_items": len(list_docs("http://127.0.0.1:8001")) if configured() else 0,
    }


@app.get("/api/media")
def media_list(
    request: Request,
    type: Optional[str] = None,
    q: Optional[str] = None,
    featured: Optional[bool] = None,
    limit: int = 100,
):
    return _catalog(request, type, q, featured, limit)


@app.get("/api/media/{media_id}")
def media_detail(media_id: str, request: Request):
    local = _find_local(media_id)
    if local:
        return local
    item = find_item(media_id)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return to_media_doc(item, _base(request))


@app.get("/api/media/{media_id}/reviews")
def media_reviews(media_id: str):
    return []


@app.get("/api/media/{media_id}/similar")
def media_similar(media_id: str, request: Request, limit: int = 8):
    current = _find_local(media_id) or (to_media_doc(find_item(media_id), _base(request)) if find_item(media_id) else None)
    docs = _catalog(request, None, None, None, 80)
    out = [doc for doc in docs if doc.get("id") != media_id]
    if current:
        genres = set(current.get("genres") or [])
        out.sort(key=lambda doc: len(set(doc.get("genres") or []) & genres), reverse=True)
    return out[:limit]


@app.get("/api/media/{media_id}/timeline")
def media_timeline(media_id: str, request: Request):
    item = _find_local(media_id)
    if not item:
        raw = find_item(media_id) or {}
        return {"title": raw.get("title") or "", "items": []}
    return {"title": item.get("title") or "", "items": item.get("timeline") or []}


@app.get("/api/trending")
def trending(request: Request, limit: int = 10):
    return _catalog(request, None, None, None, limit)


@app.get("/api/genres")
def genres(request: Request, limit: int = 16):
    names = []
    for doc in _catalog(request, None, None, None, 400):
        for genre in doc.get("genres") or []:
            if genre not in names:
                names.append(genre)
    return [{"name": name} for name in names[:limit]]


@app.get("/api/watch-progress")
def watch_progress():
    return []


@app.get("/api/recommendations")
def recommendations(request: Request, limit: int = 20):
    return _catalog(request, None, None, None, limit)


@app.get("/api/auth/me")
def auth_me():
    raise HTTPException(status_code=401, detail="Aperçu local")


@app.get("/api/playback/verification")
def playback_verification():
    return {"required": False, "site_key": ""}


@app.post("/api/playback/verify")
@app.post("/api/playback/verify/skip")
def playback_verify():
    return {"ok": True, "pass": None, "required": False}


def _bunny_ref(doc: Optional[dict]) -> tuple[str, str]:
    if not isinstance(doc, dict):
        return "", ""
    video_id = str(doc.get("bunny_video_id") or "").strip()
    library_id = str(doc.get("bunny_library_id") or "719915").strip()
    if video_id:
        return library_id, video_id
    for piste in doc.get("language_tracks") or []:
        if not isinstance(piste, dict):
            continue
        video_id = str(piste.get("bunny_video_id") or "").strip()
        if video_id:
            return str(piste.get("bunny_library_id") or library_id), video_id
    return "", ""


def _episode_doc(doc: dict, season_number: Optional[str], episode_number: Optional[str]) -> dict:
    if str(doc.get("type") or "") == "movie":
        return doc
    seasons = doc.get("seasons") or []
    if season_number is not None and episode_number is not None:
        for season in seasons:
            if str(season.get("season_number")) != str(season_number):
                continue
            for episode in season.get("episodes") or []:
                if str(episode.get("ep_number")) == str(episode_number):
                    return episode
        raise HTTPException(status_code=404, detail="Épisode introuvable")
    for season in seasons:
        for episode in season.get("episodes") or []:
            if _bunny_ref(episode)[1] or episode.get("video_url") or episode.get("video_file_path"):
                return episode
    raise HTTPException(status_code=404, detail="Aucun fichier vidéo associé à cet épisode")


@app.get("/api/bunny/playback/{media_id}")
def bunny_playback(
    media_id: str,
    request: Request,
    season_number: Optional[str] = None,
    episode_number: Optional[str] = None,
    track: Optional[str] = None,
):
    if is_uqflex_id(media_id):
        item = find_item(media_id)
        if not item:
            raise HTTPException(status_code=404, detail="Contenu introuvable")
        doc = to_media_doc(item, _base(request))
    else:
        doc = _find_local(media_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Contenu introuvable")
    playback_doc = _episode_doc(doc, season_number, episode_number)
    if track:
        for piste in playback_doc.get("language_tracks") or []:
            if isinstance(piste, dict) and piste.get("label") == track and piste.get("bunny_video_id"):
                playback_doc = piste
                break
    library_id, video_id = _bunny_ref(playback_doc)
    if not video_id:
        raise HTTPException(status_code=404, detail="Aucun fichier vidéo associé à ce contenu")
    url = "https://iframe.mediadelivery.net/embed/%s/%s?autoplay=true&preload=true&responsive=true" % (
        library_id,
        video_id,
    )
    return {
        "url": url,
        "manifest_url": None,
        "playback_type": "embed",
        "expires": None,
        "signed": False,
        "libraryId": library_id,
        "videoId": video_id,
        "tokenAuthenticationConfigured": False,
        "libraryMatchesUploadConfig": True,
    }


@app.get("/api/promo/config")
def promo_config():
    return {"enabled": False}


@app.get("/api/support-banner")
def support_banner():
    return {"enabled": False}


@app.post("/api/site/ping")
def site_ping():
    return {"ok": True}


@app.get("/api/wishboard")
def wishboard():
    return []


@app.get("/api/referral/config")
def referral_config():
    return {"enabled": False}


@app.api_route("/api/uqflex/stream", methods=["GET", "HEAD"])
async def stream(request: Request, id: str, episodeId: Optional[str] = Query(default=None)):
    if not configured():
        raise HTTPException(status_code=503, detail="Clé partenaire absente")
    item = find_item(id)
    if not item:
        raise HTTPException(status_code=404, detail="Flux introuvable")
    media_type = "tv" if str(item.get("type") or "") == "series" else "movie"
    item_id = raw_id(id) if is_uqflex_id(id) else id
    upstream = partner_stream_url(item_id, episodeId or "", media_type)
    headers = dict(_headers())
    if request.headers.get("range"):
        headers["Range"] = request.headers["range"]
    if str(current_base() or "").startswith("http"):
        try:
            upstream_resp = await run_in_threadpool(
                lambda: requests.get(upstream, headers=headers, stream=True, timeout=60)
            )
            if upstream_resp.status_code < 400:
                outgoing = {
                    key: upstream_resp.headers[key]
                    for key in ("Content-Type", "Content-Length", "Content-Range", "Accept-Ranges")
                    if key in upstream_resp.headers
                }
                return StreamingResponse(
                    upstream_resp.iter_content(64 * 1024),
                    status_code=upstream_resp.status_code,
                    headers=outgoing,
                    media_type=upstream_resp.headers.get("Content-Type", "video/mp4"),
                )
        except Exception:
            pass
    proc = ssh_stream(partner_stream_path(item_id, episodeId or "", media_type), request.headers.get("range") or "")
    if not proc or not proc.stdout:
        raise HTTPException(status_code=502, detail="Flux partenaire injoignable")
    header_buf = b""
    while b"\r\n\r\n" not in header_buf and b"\n\n" not in header_buf:
        chunk = await run_in_threadpool(proc.stdout.read, 1024)
        if not chunk:
            break
        header_buf += chunk
    sep = b"\r\n\r\n" if b"\r\n\r\n" in header_buf else b"\n\n"
    head, _, rest = header_buf.partition(sep)
    first = (head.split(b"\n", 1)[0] if head else b"").decode("ascii", "replace")
    try:
        status = int(first.split(" ", 2)[1])
    except (IndexError, ValueError):
        status = 502
    if status >= 400:
        proc.kill()
        raise HTTPException(status_code=status, detail="Flux partenaire refuse")
    header_map = {}
    for line in head.decode("latin-1", "replace").splitlines()[1:]:
        if ":" in line:
            name, value = line.split(":", 1)
            header_map[name.strip().lower()] = value.strip()
    outgoing = {
        key: header_map[key.lower()]
        for key in ("Content-Type", "Content-Length", "Content-Range", "Accept-Ranges")
        if key.lower() in header_map
    }

    def _iter():
        if rest:
            yield rest
        while True:
            chunk = proc.stdout.read(64 * 1024)
            if not chunk:
                break
            yield chunk
        proc.wait()

    return StreamingResponse(
        _iter(),
        status_code=status,
        headers=outgoing,
        media_type=header_map.get("content-type", "video/mp4"),
    )
