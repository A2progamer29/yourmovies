"""Small, explicit security boundaries shared by the API and its tests."""
import base64
import hashlib
import hmac
import ipaddress
import os
import re
from urllib.parse import quote


def jwt_secret():
    value = os.environ.get("JWT_SECRET", "").strip()
    if len(value.encode()) < 32:
        raise RuntimeError("JWT_SECRET must be configured with at least 32 random bytes")
    return value


def client_ip(request):
    # Uvicorn MUST run with --no-proxy-headers: only this function interprets XFF.
    peer = request.client.host if request.client else "unknown"
    networks = [ipaddress.ip_network(n.strip()) for n in
                os.environ.get("TRUSTED_PROXY_CIDRS", "").split(",") if n.strip()]

    def trusted(value):
        try:
            return any(ipaddress.ip_address(value) in network for network in networks)
        except ValueError:
            return False

    if not trusted(peer):
        return peer
    chain = request.headers.get("x-forwarded-for", "").split(",")
    for value in reversed(chain):
        value = value.strip()
        try:
            ipaddress.ip_address(value)
        except ValueError:
            return peer  # malformed chains do not create arbitrary quota buckets
        if not trusted(value):
            return value
    return peer


def fingerprint(value, secret):
    return hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest()


def public_playability(doc):
    tracks = doc.get("language_tracks") or []
    primary = bool(doc.get("bunny_video_id") or doc.get("video_url") or
                   doc.get("video_file_path") or doc.get("api_player_url") or doc.get("qualities"))
    return {
        "has_video": primary or any(isinstance(t, dict) and t.get("bunny_video_id") for t in tracks),
        "has_primary_video": primary,
        "language_tracks": [{"label": t["label"], "available": True} for t in tracks
                            if isinstance(t, dict) and t.get("label") and t.get("bunny_video_id")],
        "qualities": [{"quality": q["quality"]} for q in doc.get("qualities") or []
                      if isinstance(q, dict) and q.get("quality")],
    }


def public_seasons(seasons):
    result = []
    for season in seasons or []:
        if not isinstance(season, dict):
            continue
        episodes = []
        for episode in season.get("episodes") or []:
            if not isinstance(episode, dict):
                continue
            item = {k: episode[k] for k in ("ep_number", "title", "description", "duration",
                    "duration_minutes", "release_date", "air_date", "still_url") if k in episode}
            item.update(public_playability(episode))
            episodes.append(item)
        result.append({"season_number": season.get("season_number"), "episodes": episodes})
    return result


def sign_bunny_directory(host, video_id, secret, expires):
    if not secret or not host or not re.fullmatch(r"[A-Za-z0-9.-]+", host):
        raise ValueError("Bunny CDN signing is not configured")
    if not re.fullmatch(r"[A-Za-z0-9-]{12,80}", video_id):
        raise ValueError("Invalid video identifier")
    path = f"/{video_id}/"
    digest = hashlib.sha256(f"{secret}{path}{expires}token_path={path}".encode()).digest()
    token = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    # Path tokens survive relative HLS playlist, segment and key resolution.
    return f"https://{host}/bcdn_token={token}&token_path={quote(path, safe='')}&expires={expires}{path}playlist.m3u8"
