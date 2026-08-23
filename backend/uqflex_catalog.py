"""Catalogue partenaire UQFlex — fusionné au site sans toucher aux fiches locales."""
from __future__ import annotations

import json
import os
import shlex
import subprocess
import time
from collections import defaultdict
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import requests

CACHE_TTL = 90
CACHE_PATH = os.path.join(os.path.dirname(__file__), "data", "uqflex_catalog.json")
_cache_at = 0.0
_cache_items: list[dict] = []
_active_base = ""


def _partner_key() -> str:
    return (os.environ.get("UQFLEX_PARTNER_KEY") or "").strip()


def configured() -> bool:
    return bool(_partner_key())


def _headers() -> dict[str, str]:
    key = _partner_key()
    return {
        "Authorization": "Bearer %s" % key,
        "x-api-key": key,
        "Accept": "application/json",
        "User-Agent": "YourMovies/1.0",
    }


def partner_bases() -> list[str]:
    configured_base = (os.environ.get("UQFLEX_PARTNER_BASE") or "").strip().rstrip("/")
    extras = (os.environ.get("UQFLEX_PARTNER_FALLBACKS") or "").split(",")
    ordered = [
        configured_base or "https://watch.scoope.fr/api/partner",
        "http://127.0.0.1:3080/api/partner",
        "https://watch.scoope.fr/api/partner",
        "http://100.109.198.118:3080/api/partner",
        "http://192.168.1.95:3080/api/partner",
    ]
    for extra in extras:
        value = extra.strip().rstrip("/")
        if value:
            ordered.append(value)
    seen = set()
    unique = []
    for base in ordered:
        if base and base not in seen:
            seen.add(base)
            unique.append(base)
    if _active_base:
        unique = [_active_base] + [base for base in unique if base != _active_base]
    return unique


def current_base() -> str:
    return _active_base or partner_bases()[0]


def _ssh_target() -> str:
    user = os.environ.get("NAS_USER") or "Maxence"
    host = os.environ.get("NAS_HOST") or "100.109.198.118"
    return "%s@%s" % (user, host)


def _ssh_curl(path: str, extra_headers: Optional[list[str]] = None, timeout: int = 40) -> tuple[int, bytes]:
    key = _partner_key()
    if not key:
        return 0, b""
    ssh = "ssh"
    identity = str(Path.home() / ".ssh" / "id_ed25519")
    headers = [
        "Authorization: Bearer %s" % key,
        "x-api-key: %s" % key,
        "Accept: application/json",
        "User-Agent: YourMovies/1.0",
    ]
    headers.extend(extra_headers or [])
    header_args = " ".join("-H %s" % shlex.quote(header) for header in headers)
    remote = "curl -sS -i --max-time %s %s %s" % (
        max(5, timeout - 5),
        header_args,
        shlex.quote("http://127.0.0.1:3080/api/partner%s" % path),
    )
    cmd = [
        ssh, "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
        "-i", identity, _ssh_target(), remote,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=timeout)
    except Exception as exc:
        print("uqflex ssh failed: %s" % type(exc).__name__, flush=True)
        return 0, b""
    raw = proc.stdout or b""
    if not raw:
        err = (proc.stderr or b"").decode("utf-8", "replace")[:160]
        print("uqflex ssh empty stdout rc=%s %s" % (proc.returncode, err), flush=True)
        return 0, b""
    head, _, body = raw.partition(b"\r\n\r\n")
    if not body and b"\n\n" in raw:
        head, _, body = raw.partition(b"\n\n")
    first = (head.split(b"\n", 1)[0] if head else b"").decode("ascii", "replace")
    try:
        status = int(first.split(" ", 2)[1])
    except (IndexError, ValueError):
        status = 0
    return status, body


def _parse_items(data) -> list[dict]:
    rows = data.get("items") if isinstance(data, dict) else data
    return [row for row in rows or [] if isinstance(row, dict) and row.get("id")]


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


def fetch_items(force: bool = False) -> list[dict]:
    global _cache_at, _cache_items, _active_base
    if not configured():
        return []
    now = time.time()
    if not force and _cache_items and now - _cache_at < CACHE_TTL:
        return _cache_items
    if not _cache_items:
        _cache_items = _read_disk()
    last_error = ""
    status, body = _ssh_curl("/v1/catalog", timeout=40)
    if status == 200 and body:
        try:
            items = _parse_items(json.loads(body.decode("utf-8")))
        except Exception:
            items = []
        if items:
            _cache_items = items
            _cache_at = now
            _active_base = "ssh"
            _write_disk(items)
            print("uqflex catalog ok via ssh: %s items" % len(items), flush=True)
            return items
        last_error = "ssh empty"
    elif status:
        last_error = "ssh HTTP %s" % status
    for base in partner_bases():
        if "127.0.0.1" in base or "100.109." in base or "192.168.1.95" in base:
            continue
        try:
            resp = requests.get(
                "%s/v1/catalog" % base,
                headers=_headers(),
                timeout=8,
            )
            if resp.status_code >= 400:
                last_error = "HTTP %s" % resp.status_code
                continue
            data = resp.json()
        except Exception as exc:
            last_error = type(exc).__name__
            continue
        items = _parse_items(data)
        if not items:
            last_error = "empty"
            continue
        _cache_items = items
        _cache_at = now
        _active_base = base
        _write_disk(items)
        print("uqflex catalog ok: %s items" % len(items), flush=True)
        return items
    print("uqflex catalog fetch failed: %s" % (last_error or "unknown"), flush=True)
    _cache_at = now
    return list(_cache_items)


def is_uqflex_id(media_id: str) -> bool:
    return str(media_id or "").startswith("uq_")


def raw_id(media_id: str) -> str:
    value = str(media_id or "")
    return value[3:] if value.startswith("uq_") else value


def _stream_url(base: str, item_id: str, episode_id: str = "") -> str:
    url = "%s/api/uqflex/stream?id=%s" % (base.rstrip("/"), quote(item_id, safe=""))
    if episode_id:
        url += "&episodeId=%s" % quote(str(episode_id), safe="")
    return url


def to_media_doc(item: dict, api_base: str) -> dict:
    item_id = str(item.get("id") or "")
    raw_kind = str(item.get("type") or "").lower()
    kind = "anime" if raw_kind == "anime" else "series" if raw_kind == "series" else "movie"
    seasons = []
    if kind in {"series", "anime"}:
        grouped: dict[int, list] = defaultdict(list)
        for episode in item.get("episodes") or []:
            if not isinstance(episode, dict):
                continue
            season_n = int(episode.get("season") or 1)
            grouped[season_n].append(
                {
                    "ep_number": int(episode.get("episode") or 1),
                    "title": episode.get("title") or ("Épisode %s" % (episode.get("episode") or "")),
                    "video_url": _stream_url(api_base, item_id, str(episode.get("id") or "")),
                }
            )
        seasons = [
            {"season_number": season_n, "episodes": sorted(episodes, key=lambda row: row["ep_number"])}
            for season_n, episodes in sorted(grouped.items())
        ]
    return {
        "id": "uq_%s" % item_id,
        "title": item.get("title") or "",
        "description": item.get("overview") or "",
        "type": "anime" if raw_kind == "anime" else "series" if raw_kind == "series" else "movie",
        "year": item.get("year"),
        "duration_minutes": None,
        "genres": item.get("genres") or [],
        "poster_url": item.get("poster_url"),
        "banner_url": item.get("backdrop_url") or item.get("poster_url"),
        "trailer_youtube_id": None,
        "trailer_video_url": None,
        "video_file_path": None,
        "video_url": None if kind in {"series", "anime"} else _stream_url(api_base, item_id),
        "api_player_url": next((item.get(key) for key in (
            "player_url", "playerUrl", "embed_url", "embedUrl", "iframe_url", "iframeUrl"
        ) if item.get(key)), None),
        "bunny_video_id": None,
        "language_tracks": [],
        "bunny_library_id": None,
        "qualities": [],
        "title_logo_url": None,
        "age_rating": None,
        "cast": [],
        "director": None,
        "country": None,
        "rating": item.get("rating"),
        "seasons": seasons,
        "tmdb_id": item.get("tmdb_id"),
        "tmdb_kind": "tv" if kind in {"series", "anime"} else "movie",
        "saga_title": None,
        "timeline": [],
        "featured": False,
        "featured_order": None,
        "in_theaters": False,
        "player_broken": False,
        "player_notice": "",
        "reports_open": 0,
        "source": "uqflex",
        "created_at": item.get("created_at") or item.get("createdAt") or item.get("added_at") or item.get("addedAt") or "",
    }


def find_item(media_id: str) -> Optional[dict]:
    wanted = raw_id(media_id)
    for item in fetch_items():
        if str(item.get("id") or "") == wanted:
            return item
    return None


def list_docs(api_base: str, media_type: Optional[str] = None, query: Optional[str] = None) -> list[dict]:
    if media_type == "anime":
        return []
    needle = (query or "").strip().lower()
    out = []
    for item in fetch_items():
        raw_kind = str(item.get("type") or "").lower()
        kind = "anime" if raw_kind == "anime" else "series" if raw_kind == "series" else "movie"
        if media_type and media_type != kind:
            continue
        title = str(item.get("title") or "")
        if needle and needle not in title.lower():
            continue
        out.append(to_media_doc(item, api_base))
    return out


def partner_stream_url(item_id: str, episode_id: str = "", media_type: str = "movie") -> str:
    kind = "tv" if media_type in ("series", "anime", "tv") else "movie"
    url = "%s/stream?type=%s&id=%s" % (current_base(), kind, quote(item_id, safe=""))
    if episode_id:
        url += "&episodeId=%s" % quote(episode_id, safe="")
    return url


def partner_stream_path(item_id: str, episode_id: str = "", media_type: str = "movie") -> str:
    kind = "tv" if media_type in ("series", "anime", "tv") else "movie"
    path = "/stream?type=%s&id=%s" % (kind, quote(item_id, safe=""))
    if episode_id:
        path += "&episodeId=%s" % quote(episode_id, safe="")
    return path


def ssh_stream(path: str, range_header: str = ""):
    key = _partner_key()
    if not key:
        return None
    headers = [
        "Authorization: Bearer %s" % key,
        "x-api-key: %s" % key,
        "Accept: */*",
        "User-Agent: YourMovies/1.0",
    ]
    if range_header:
        headers.append("Range: %s" % range_header)
    header_args = " ".join("-H %s" % shlex.quote(header) for header in headers)
    remote = "curl -sS -i --max-time 3600 %s %s" % (
        header_args,
        shlex.quote("http://127.0.0.1:3080/api/partner%s" % path),
    )
    cmd = [
        "ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
        "-i", str(Path.home() / ".ssh" / "id_ed25519"),
        _ssh_target(),
        remote,
    ]
    try:
        return subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    except Exception:
        return None
