"""Catalogue partenaire UQFlex — fusionné au site sans toucher aux fiches locales."""
from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import threading
import time
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Optional
from urllib.parse import parse_qsl, quote, urlencode, urljoin, urlsplit, urlunsplit

import requests

CACHE_TTL = max(30, min(3600, int(os.environ.get("UQFLEX_CACHE_TTL", "120"))))
SYNC_INTERVAL = max(60, min(3600, int(os.environ.get("UQFLEX_SYNC_INTERVAL", "300"))))
CACHE_PATH = os.path.join(os.path.dirname(__file__), "runtime_data", "uqflex_catalog.json")
_cache_at = 0.0
_cache_items: list[dict] = []
_active_base = ""
_last_sync_at = 0.0
_last_sync_error = ""
_last_sync_warning = ""
_last_attempt_at = 0.0
_last_raw_count = 0
_fetch_lock = threading.RLock()
MAX_CATALOG_PAGES = 50
MAX_CATALOG_ITEMS = 20_000


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
    ordered = [configured_base or "https://watch.scoope.fr/api/partner"]
    for extra in extras:
        value = extra.strip().rstrip("/")
        if value:
            ordered.append(value)
    seen = set()
    unique = []
    for base in ordered:
        parsed = urlsplit(base)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("UQFlex partner endpoints must use HTTPS without URL credentials")
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
    if not key or os.environ.get("UQFLEX_ENABLE_SSH") != "true":
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
        print("uqflex ssh empty stdout rc=%s" % proc.returncode, flush=True)
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


def _catalog_page(data) -> tuple[list[dict], dict]:
    """Accept the partner's historic array and common paginated envelopes."""
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict) and row.get("id")], {}
    if not isinstance(data, dict):
        return [], {}
    rows = None
    for key in ("items", "results", "catalog", "content"):
        if isinstance(data.get(key), list):
            rows = data[key]
            break
    if rows is None and isinstance(data.get("data"), list):
        rows = data["data"]
    if rows is None and isinstance(data.get("data"), dict):
        nested, nested_meta = _catalog_page(data["data"])
        return nested, {**data, **nested_meta}
    meta = data.get("pagination") if isinstance(data.get("pagination"), dict) else {}
    meta = {**data, **meta}
    return [row for row in rows or [] if isinstance(row, dict) and row.get("id")], meta


def _parse_items(data) -> list[dict]:
    rows, _ = _catalog_page(data)
    return [row for row in rows or [] if isinstance(row, dict) and row.get("id")]


def _integer(meta: dict, *keys: str) -> Optional[int]:
    for key in keys:
        value = meta.get(key)
        if isinstance(value, bool):
            continue
        try:
            return int(value)
        except (TypeError, ValueError):
            continue
    return None


def _safe_continuation(base: str, current_url: str, value) -> str:
    """Follow pagination only on the configured partner origin."""
    if not isinstance(value, str) or not value.strip():
        return ""
    value = value.strip()
    candidate = urljoin(current_url, value) if value.startswith(("/", "http://", "https://")) else ""
    if not candidate:
        parts = urlsplit(current_url)
        query = dict(parse_qsl(parts.query, keep_blank_values=True))
        query["cursor"] = value
        candidate = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), ""))
    wanted, parsed = urlsplit(base), urlsplit(candidate)
    if parsed.scheme != "https" or parsed.hostname != wanted.hostname or parsed.port != wanted.port:
        return ""
    if parsed.username or parsed.password or parsed.fragment:
        return ""
    return candidate


def _next_page_url(base: str, current_url: str, meta: dict, rows_count: int, collected: int) -> tuple[str, Optional[int]]:
    expected = _integer(meta, "total", "totalItems", "total_items")
    count_hint = _integer(meta, "count")
    if expected is None and count_hint is not None and count_hint > rows_count:
        expected = count_hint
    continuation = meta.get("nextUrl") or meta.get("next_url") or meta.get("next") or meta.get("nextCursor") or meta.get("next_cursor")
    if isinstance(continuation, dict):
        continuation = continuation.get("url") or continuation.get("href") or continuation.get("cursor")
    next_url = _safe_continuation(base, current_url, continuation)
    if next_url:
        return next_url, expected
    page = _integer(meta, "page", "currentPage", "current_page") or 1
    pages = _integer(meta, "pages", "totalPages", "total_pages", "lastPage", "last_page")
    has_more = meta.get("hasMore") if "hasMore" in meta else meta.get("has_more")
    if (pages and page < pages) or has_more is True or (expected is not None and collected < expected and rows_count > 0):
        parts = urlsplit(current_url)
        query = dict(parse_qsl(parts.query, keep_blank_values=True))
        query["page"] = str(page + 1)
        return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), "")), expected
    return "", expected


def _dedupe_items(rows: list[dict]) -> list[dict]:
    by_id: dict[str, dict] = {}
    order: list[str] = []
    for row in rows:
        item_id = str(row.get("id") or "")
        if not item_id:
            continue
        if item_id not in by_id:
            order.append(item_id)
            by_id[item_id] = dict(row)
        else:
            by_id[item_id].update({key: value for key, value in row.items() if value not in (None, "", [], {})})
    return [by_id[item_id] for item_id in order]


def _fetch_http_catalog(base: str, media_type: str = "", resource: str = "/v1/catalog") -> tuple[list[dict], Optional[int], str]:
    query = {"limit": "500", "page": "1"}
    if media_type:
        query["type"] = media_type
    url = "%s%s?%s" % (base, resource, urlencode(query))
    rows: list[dict] = []
    expected = None
    seen_urls = set()
    for _ in range(MAX_CATALOG_PAGES):
        if url in seen_urls:
            return rows, expected, "pagination loop"
        seen_urls.add(url)
        try:
            response = requests.get(url, headers=_headers(), timeout=12, allow_redirects=False)
        except Exception as exc:
            return rows, expected, type(exc).__name__
        if response.status_code != 200:
            return rows, expected, "HTTP %s" % response.status_code
        try:
            page_rows, meta = _catalog_page(response.json())
        except Exception:
            return rows, expected, "invalid JSON"
        before = len({str(row.get("id")) for row in rows})
        rows.extend(page_rows)
        unique_count = len({str(row.get("id")) for row in rows})
        next_url, page_expected = _next_page_url(base, url, meta, len(page_rows), unique_count)
        expected = page_expected if page_expected is not None else expected
        if len(rows) >= MAX_CATALOG_ITEMS:
            return rows[:MAX_CATALOG_ITEMS], expected, "catalog limit reached"
        if not next_url:
            break
        if unique_count == before:
            return rows, expected, "pagination returned no new items"
        url = next_url
    rows = _dedupe_items(rows)
    if not rows:
        return [], expected, "empty catalog"
    if expected is not None and len(rows) < expected:
        return rows, expected, "partial catalog %s/%s" % (len(rows), expected)
    return rows, expected, ""


def _read_disk() -> list[dict]:
    try:
        with open(CACHE_PATH, encoding="utf-8") as handle:
            rows = json.load(handle)
        return [row for row in rows if isinstance(row, dict) and row.get("id")]
    except Exception:
        return []


def _write_disk(rows: list[dict]) -> None:
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    temporary = "%s.%s.tmp" % (CACHE_PATH, os.getpid())
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(rows, handle, ensure_ascii=False)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, CACHE_PATH)


def _titre_normalise(valeur: Optional[str]) -> str:
    texte = unicodedata.normalize("NFKD", str(valeur or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "", texte.lower())


def group_series_by_title(items: list[dict]) -> list[dict]:
    """Le catalogue partenaire indexe apparemment les séries par saison :
    plusieurs entrées différentes partagent le même titre. On les regroupe
    en une seule fiche par titre, en gardant la liste des identifiants
    d'origine (`_variant_ids`) pour pouvoir aller chercher tous les
    épisodes ensuite. Les films ne sont jamais regroupés."""
    groupes: dict[tuple, dict] = {}
    resultat: list[dict] = []
    for item in items:
        kind = item_kind(item)
        if kind == "movie":
            resultat.append(item)
            continue
        identity = str(item.get("tmdb_id") or item.get("anilist_id") or "").strip()
        titre = _titre_normalise(item.get("title"))
        cle = (kind, identity or "%s:%s" % (titre, item.get("year") or ""))
        if not titre:
            resultat.append(item)
            continue
        if cle not in groupes:
            fusion = dict(item)
            fusion["_variant_ids"] = [str(item.get("id") or "")]
            groupes[cle] = fusion
            resultat.append(fusion)
        else:
            groupes[cle]["_variant_ids"].append(str(item.get("id") or ""))
            # On garde les champs les plus complets rencontrés (poster,
            # résumé...), au cas où une variante soit mieux renseignée.
            for champ in ("poster_url", "backdrop_url", "overview", "genres", "year"):
                if not groupes[cle].get(champ) and item.get(champ):
                    groupes[cle][champ] = item.get(champ)
    return resultat


def fetch_items(force: bool = False) -> list[dict]:
    global _cache_at, _cache_items, _active_base, _last_sync_at, _last_sync_error, _last_sync_warning, _last_attempt_at, _last_raw_count
    if not configured():
        return []
    with _fetch_lock:
        current_time = time.time()
        if not force and _cache_items and current_time - _cache_at < CACHE_TTL:
            return list(_cache_items)
        if not _cache_items:
            _cache_items = _read_disk()
            _last_raw_count = len(_cache_items)
        _last_attempt_at = current_time
        last_error = ""
        raw_items: list[dict] = []
        source = ""
        status, body = _ssh_curl("/v1/catalog?limit=500&page=1", timeout=40)
        if status == 200 and body:
            try:
                raw_items, meta = _catalog_page(json.loads(body.decode("utf-8")))
                expected = _integer(meta, "total", "totalItems", "total_items")
                if expected is not None and len(raw_items) < expected:
                    last_error = "ssh partial catalog %s/%s" % (len(raw_items), expected)
                    raw_items = []
                else:
                    source = "ssh"
            except Exception:
                last_error = "ssh invalid JSON"
        elif status:
            last_error = "ssh HTTP %s" % status
        for base in partner_bases():
            if raw_items:
                break
            if base == "ssh" or "127.0.0.1" in base or "100.109." in base or "192.168.1.95" in base:
                continue
            candidate, _, error = _fetch_http_catalog(base)
            if error:
                last_error = error
                continue
            # Some partner deployments expose anime (or even each medium) only
            # when the type filter is explicit. Probe missing rails and merge
            # by stable provider id; endpoints that return the same full dump
            # are harmless because deduplication follows.
            present = {item_kind(item) for item in candidate}
            warnings = []
            for requested_type in ("movie", "series", "anime"):
                if requested_type in present:
                    continue
                typed, _, typed_error = _fetch_http_catalog(base, requested_type)
                if not typed_error:
                    known_ids = {str(item.get("id") or "") for item in candidate}
                    candidate.extend({**row, "_uqflex_media_type": requested_type} for row in typed
                                     if str(row.get("id") or "") not in known_ids)
                else:
                    warnings.append("%s rail: %s" % (requested_type, typed_error))
            if "anime" not in {item_kind(item) for item in candidate}:
                anime_errors = []
                for resource in ("/v1/animes", "/v1/anime", "/v1/catalog/anime"):
                    typed, _, typed_error = _fetch_http_catalog(base, resource=resource)
                    if typed_error:
                        anime_errors.append(typed_error)
                        continue
                    known_ids = {str(item.get("id") or "") for item in candidate}
                    new_rows = [{**row, "_uqflex_media_type": "anime"} for row in typed
                                if str(row.get("id") or "") not in known_ids]
                    candidate.extend(new_rows)
                    if new_rows:
                        break
                if not any(item_kind(item) == "anime" for item in candidate) and anime_errors:
                    warnings.append("anime endpoints: %s" % ", ".join(dict.fromkeys(anime_errors)))
            _last_sync_warning = "; ".join(warnings)
            raw_items, source = candidate, base
        if not raw_items:
            _last_sync_error = last_error or "empty catalog"
            print("uqflex catalog fetch failed: %s" % _last_sync_error, flush=True)
            return list(_cache_items)
        raw_items = _dedupe_items(raw_items)
        grouped = group_series_by_title(raw_items)
        # A truncated partner response must not erase a previously healthy
        # snapshot. The diagnostic error makes a real bulk removal visible so
        # it can be confirmed rather than applied silently.
        if _cache_items and len(grouped) < max(1, int(len(_cache_items) * 0.6)):
            _last_sync_error = "suspicious catalog shrink %s/%s" % (len(grouped), len(_cache_items))
            print("uqflex catalog rejected: %s" % _last_sync_error, flush=True)
            return list(_cache_items)
        _last_raw_count = len(raw_items)
        if source == "ssh":
            _last_sync_warning = ""
        _cache_items = grouped
        _cache_at = current_time
        _last_sync_at = current_time
        _last_sync_error = ""
        _active_base = source
        _write_disk(grouped)
        print("uqflex catalog ok via %s: %s raw, %s grouped" % (source, len(raw_items), len(grouped)), flush=True)
        return list(_cache_items)


def seed_cache(rows: list[dict], synced_at: float = 0.0, raw_count: int = 0) -> list[dict]:
    """Restore the last healthy private snapshot before contacting partner."""
    global _cache_items, _cache_at, _last_sync_at, _last_raw_count
    clean = [dict(row) for row in rows or [] if isinstance(row, dict) and row.get("id")]
    if not clean:
        return list(_cache_items)
    with _fetch_lock:
        if not _cache_items or len(clean) > len(_cache_items):
            _cache_items = clean
            _last_raw_count = max(_last_raw_count, int(raw_count or 0), len(clean))
            if synced_at:
                _last_sync_at = synced_at
                _cache_at = synced_at
    return list(_cache_items)


def is_uqflex_id(media_id: str) -> bool:
    return str(media_id or "").startswith("uq_")


def raw_id(media_id: str) -> str:
    value = str(media_id or "")
    return value[3:] if value.startswith("uq_") else value


def media_kind(raw_kind: str) -> str:
    value = str(raw_kind or "").strip().lower()
    if value in {"anime", "animé", "animes", "animation", "anime_series", "anime-series"}:
        return "anime"
    if value in {"series", "série", "serie", "tv", "show", "tvshow", "tv_show", "tv-series", "tv_series"}:
        return "series"
    return "movie"


def item_kind(item: dict) -> str:
    if item.get("is_anime") is True or item.get("anime") is True:
        return "anime"
    candidates = (item.get("_uqflex_media_type"), item.get("type"), item.get("media_type"), item.get("mediaType"), item.get("category"), item.get("kind"))
    for value in candidates:
        normalized = str(value or "").strip().lower()
        if normalized in {"anime", "animé", "animes", "anime_series", "anime-series"}:
            return "anime"
    for value in candidates:
        normalized = str(value or "").strip().lower()
        if normalized in {"series", "série", "serie", "tv", "show", "tvshow", "tv_show", "tv-series", "tv_series"}:
            return "series"
    return media_kind(item.get("type"))


def _episode_rows(item: dict) -> list[dict]:
    direct = item.get("episodes")
    if isinstance(direct, list):
        return [row for row in direct if isinstance(row, dict)]
    rows = []
    seasons = item.get("seasons")
    if isinstance(seasons, list):
        for season in seasons:
            if not isinstance(season, dict):
                continue
            season_number = season.get("season_number") or season.get("season") or season.get("number") or 1
            for episode in season.get("episodes") or []:
                if isinstance(episode, dict):
                    rows.append({"season": season_number, **episode})
    return rows


def _positive_int(value, default: int) -> int:
    try:
        number = int(value)
        return number if number > 0 else default
    except (TypeError, ValueError):
        return default


def _stream_url(base: str, item_id: str, episode_id: str = "", season: str = "", episode: str = "") -> str:
    url = "%s/api/uqflex/stream?id=%s" % (base.rstrip("/"), quote(item_id, safe=""))
    if season and episode:
        url += "&season=%s&episode=%s" % (quote(str(season), safe=""), quote(str(episode), safe=""))
    return url


def to_media_doc(item: dict, api_base: str) -> dict:
    item_id = str(item.get("id") or "")
    kind = item_kind(item)
    cast = item.get("cast") or item.get("actors") or item.get("starring") or []
    if isinstance(cast, str):
        cast = [part.strip() for part in cast.split(",") if part.strip()]
    director = item.get("director") or item.get("directors")
    if isinstance(director, list):
        director = ", ".join(str(part) for part in director if part)
    duration = item.get("duration_minutes") or item.get("runtime") or item.get("duration")
    seasons = []
    if kind in {"series", "anime"}:
        grouped: dict[int, list] = defaultdict(list)
        for episode in _episode_rows(item):
            season_n = _positive_int(episode.get("season") or episode.get("season_number"), 1)
            episode_n = _positive_int(episode.get("episode") or episode.get("episode_number") or episode.get("ep_number") or episode.get("number"), 1)
            grouped[season_n].append(
                {
                    "ep_number": episode_n,
                    "title": episode.get("title") or episode.get("name") or ("Épisode %s" % episode_n),
                    "description": episode.get("overview") or episode.get("description") or "",
                    "still_url": episode.get("still_url") or episode.get("stillUrl") or episode.get("image") or episode.get("thumbnail"),
                    "video_url": _stream_url(
                        api_base,
                        item_id,
                        str(episode.get("id") or ""),
                        str(season_n),
                        str(episode_n),
                    ),
                }
            )
        seasons = [
            {"season_number": season_n, "episodes": sorted(episodes, key=lambda row: row["ep_number"])}
            for season_n, episodes in sorted(grouped.items())
        ]
    return {
        "id": "uq_%s" % item_id,
        "title": item.get("title") or "",
        "description": item.get("overview") or item.get("description") or item.get("synopsis") or "",
        "type": kind,
        "year": item.get("year"),
        "duration_minutes": duration,
        "genres": item.get("genres") or item.get("genre") or [],
        "poster_url": item.get("poster_url") or item.get("posterUrl") or item.get("poster") or item.get("cover"),
        "banner_url": item.get("backdrop_url") or item.get("backdropUrl") or item.get("backdrop") or item.get("banner") or item.get("poster_url"),
        "trailer_youtube_id": item.get("trailer_youtube_id") or item.get("trailerId"),
        "trailer_video_url": item.get("trailer_video_url") or item.get("trailer_url"),
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
        "age_rating": item.get("age_rating") or item.get("certification") or item.get("rating_certification"),
        "cast": cast,
        "director": director,
        "country": item.get("country") or item.get("origin_country"),
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
        "created_at": item.get("created_at") or item.get("createdAt") or item.get("added_at") or item.get("addedAt") or item.get("updated_at") or "",
    }


def _unwrap_item(data) -> dict:
    if not isinstance(data, dict):
        return {}
    for key in ("item", "data", "result"):
        if isinstance(data.get(key), dict):
            return data[key]
    return data


def _fetch_series_detail(raw_id_value: str, kind: str = "series") -> dict:
    """Va chercher le détail (avec épisodes) d'une entrée du catalogue,
    peu importe la base actuellement active."""
    for base in partner_bases():
        if base == "ssh" or "127.0.0.1" in base or "100.109." in base or "192.168.1.95" in base:
            continue
        resources = ("anime", "animes", "series") if kind == "anime" else ("series", "shows")
        for resource in resources:
            try:
                response = requests.get(
                    "%s/v1/%s/%s" % (base, resource, quote(raw_id_value, safe="")),
                    headers=_headers(), timeout=10, allow_redirects=False,
                )
                if response.status_code != 200:
                    continue
                detail = _unwrap_item(response.json())
                if detail:
                    return detail
            except Exception:
                continue
    return {}


def resolve_full_series_item(canonical_item: dict) -> dict:
    """Le catalogue indexe apparemment chaque saison sous un identifiant
    séparé. On va chercher les épisodes de CHAQUE variante regroupée sous
    ce titre et on les fusionne en une seule liste : `to_media_doc` sait
    déjà répartir des épisodes par saison à partir de leur propre champ
    "season", donc peu importe l'ordre dans lequel on les rassemble ici."""
    variantes = canonical_item.get("_variant_ids") or [str(canonical_item.get("id") or "")]
    tous_episodes = list(_episode_rows(canonical_item))
    kind = item_kind(canonical_item)
    for variant_id in variantes:
        detail = _fetch_series_detail(variant_id, kind)
        tous_episodes.extend(_episode_rows(detail))
    fusion = dict(canonical_item)
    fusion["episodes"] = _dedupe_episodes(tous_episodes)
    return fusion


def _dedupe_episodes(rows: list[dict]) -> list[dict]:
    by_key = {}
    for row in rows:
        season = _positive_int(row.get("season") or row.get("season_number"), 1)
        episode = _positive_int(row.get("episode") or row.get("episode_number") or row.get("ep_number") or row.get("number"), 1)
        key = (season, episode)
        normalized = {**row, "season": season, "episode": episode}
        if key not in by_key:
            by_key[key] = normalized
        else:
            by_key[key].update({name: value for name, value in normalized.items() if value not in (None, "", [], {})})
    return [by_key[key] for key in sorted(by_key)]


def find_item(media_id: str) -> Optional[dict]:
    wanted = raw_id(media_id)
    for item in fetch_items():
        variants = [str(value) for value in item.get("_variant_ids") or []]
        if str(item.get("id") or "") == wanted or wanted in variants:
            kind = item_kind(item)
            if kind in {"series", "anime"}:
                return resolve_full_series_item(item)
            for base in partner_bases():
                if base == "ssh" or "127.0.0.1" in base or "100.109." in base or "192.168.1.95" in base:
                    continue
                for resource in ("movies", "movie"):
                    try:
                        response = requests.get(
                            "%s/v1/%s/%s" % (base, resource, quote(wanted, safe="")),
                            headers=_headers(), timeout=10, allow_redirects=False,
                        )
                        if response.status_code != 200:
                            continue
                        detail = _unwrap_item(response.json())
                        if detail:
                            return {**item, **detail}
                    except Exception:
                        continue
            return item
    return None


def list_docs(api_base: str, media_type: Optional[str] = None, query: Optional[str] = None) -> list[dict]:
    needle = (query or "").strip().lower()
    out = []
    for item in fetch_items():
        kind = item_kind(item)
        if media_type and media_type != kind:
            continue
        title = str(item.get("title") or "")
        if needle and needle not in title.lower():
            continue
        out.append(to_media_doc(item, api_base))
    return out


def partner_stream_url(item_id: str, season: str = "", episode: str = "", media_type: str = "movie", episode_id: str = "") -> str:
    kind = "tv" if media_type in ("series", "anime", "tv") else "movie"
    url = "%s/stream?type=%s&id=%s" % (current_base(), kind, quote(item_id, safe=""))
    if season and episode:
        url += "&season=%s&episode=%s" % (quote(str(season), safe=""), quote(str(episode), safe=""))
    elif episode_id:
        url += "&episodeId=%s" % quote(str(episode_id), safe="")
    return url


def partner_stream_path(item_id: str, season: str = "", episode: str = "", media_type: str = "movie", episode_id: str = "") -> str:
    kind = "tv" if media_type in ("series", "anime", "tv") else "movie"
    path = "/stream?type=%s&id=%s" % (kind, quote(item_id, safe=""))
    if season and episode:
        path += "&season=%s&episode=%s" % (quote(str(season), safe=""), quote(str(episode), safe=""))
    elif episode_id:
        path += "&episodeId=%s" % quote(str(episode_id), safe="")
    return path


def ssh_stream(path: str, range_header: str = ""):
    key = _partner_key()
    if not key or os.environ.get("UQFLEX_ENABLE_SSH") != "true":
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
