"""Security regressions against the actual ASGI routes, with an isolated database."""
import asyncio
import base64
import hashlib
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from urllib.parse import urljoin

import httpx
import jwt
import pytest
from mongomock_motor import AsyncMongoMockClient
from starlette.requests import Request

sys.path.insert(0, str(Path(__file__).parents[1]))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "security_tests")
os.environ.setdefault("JWT_SECRET", "security-tests-only-not-a-production-secret-12345")
import server as appmod
from security import client_ip, jwt_secret, sign_bunny_directory


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    monkeypatch.setattr(appmod, "db", AsyncMongoMockClient(tz_aware=True).security)
    monkeypatch.setattr(appmod, "BUNNY_TOKEN_AUTH_KEY", "test-signing-key")
    monkeypatch.setattr(appmod, "BUNNY_CDN_HOST", "test.b-cdn.net")
    monkeypatch.setattr(appmod, "BUNNY_LIBRARY_ID", "123")
    monkeypatch.setenv("TRUSTED_PROXY_CIDRS", "")
    monkeypatch.delenv("CLIENT_IP_SOURCE", raising=False)


def edge_request(value=None):
    headers = [(b"x-forwarded-for", b"192.0.2.99")]
    if value is not None:
        headers.append((b"cf-connecting-ip", value.encode()))
    return Request({"type": "http", "client": ("10.0.0.2", 1234), "headers": headers})


def test_cloudflare_header_is_not_trusted_by_default(monkeypatch):
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setenv("RENDER_SERVICE_TYPE", "web")
    assert client_ip(edge_request("203.0.113.5")) == "10.0.0.2"


def test_render_edge_trust_requires_public_render_runtime(monkeypatch):
    monkeypatch.setenv("CLIENT_IP_SOURCE", "render-cloudflare")
    monkeypatch.setenv("RENDER", "false")
    monkeypatch.setenv("RENDER_SERVICE_TYPE", "web")
    assert client_ip(edge_request("203.0.113.5")) == "10.0.0.2"
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setenv("RENDER_SERVICE_TYPE", "pserv")
    assert client_ip(edge_request("203.0.113.5")) == "10.0.0.2"


def test_render_edge_uses_single_verified_address_not_xff(monkeypatch):
    monkeypatch.setenv("CLIENT_IP_SOURCE", "render-cloudflare")
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setenv("RENDER_SERVICE_TYPE", "web")
    assert client_ip(edge_request("203.0.113.5")) == "203.0.113.5"
    assert client_ip(edge_request("2001:db8::5")) == "2001:db8::5"


def test_render_edge_malformed_header_never_falls_back_to_xff(monkeypatch):
    monkeypatch.setenv("CLIENT_IP_SOURCE", "render-cloudflare")
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setenv("RENDER_SERVICE_TYPE", "web")
    monkeypatch.setenv("TRUSTED_PROXY_CIDRS", "10.0.0.0/24")
    for value in (None, "", "not-an-ip", "203.0.113.5, 192.0.2.99", "fe80::1%spoof"):
        assert client_ip(edge_request(value)) == "10.0.0.2"


def client():
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=appmod.app), base_url="https://testserver",
                             headers={"X-YM-Request": "1"})


async def account(c, uid="user1", premium=False, admin=False):
    user = {"user_id": uid, "name": uid, "email": uid + "@example.com", "is_admin": admin,
            "password_hash": appmod.hash_password("test-password")}
    if premium:
        user.update(premium_plan="premium", premium_until=(datetime.now(timezone.utc) + timedelta(days=1)).isoformat())
    await appmod.db.users.insert_one(user)
    token = await appmod.create_jwt(uid)
    c.cookies.set(appmod.AUTH_COOKIE, token, domain="testserver.local", path="/")
    return token


async def media():
    episode = {"ep_number": 1, "title": "Episode", "bunny_video_id": "secret-video-123456", "video_url": "https://secret.example/video", "video_file_path": "secret-path",
               "qualities": [{"quality": "720p", "url": "secret-quality"}],
               "language_tracks": [{"label": "VO", "bunny_video_id": "secret-track-12345", "bunny_library_id": "secret-library"}], "unknown_source": "secret-new-field"}
    doc = {"id": "movie1", "title": "Movie", "type": "movie", **{k: v for k, v in episode.items() if k not in {"title", "ep_number"}},
           "bunny_library_id": "123", "seasons": [{"season_number": 1, "episodes": [episode]}]}
    await appmod.db.media.insert_one(doc)
    return doc


@pytest.mark.asyncio
async def test_public_routes_never_return_sources():
    await media()
    async with client() as c:
        for path in ["/api/media?uqflex=false", "/api/media/movie1", "/api/media/movie1/similar"]:
            r = await c.get(path)
            assert r.status_code == 200, r.text
            assert "secret-" not in r.text
            assert "bunny_video_id" not in r.text
            assert r.headers["cache-control"] == "private, no-store"
        detail = (await c.get("/api/media/movie1")).json()
        assert detail["has_video"]
        assert detail["seasons"][0]["episodes"][0]["language_tracks"] == [{"label": "VO", "available": True}]
        assert (await c.get("/api/admin/media/movie1")).status_code == 401
        await account(c, admin=True)
        assert "secret-video" in (await c.get("/api/admin/media/movie1")).text


@pytest.mark.asyncio
async def test_maintenance_bootstrap_is_minimal_and_checks_admin_session():
    await appmod.db.settings.insert_one({"id": "maintenance", "enabled": True, "private_note": "never-public"})
    async with client() as c:
        result = await c.get("/api/maintenance")
        assert result.status_code == 200
        assert set(result.json()) == {"enabled", "message", "discord_url", "can_bypass"}
        assert result.json()["can_bypass"] is False
        assert result.headers["cache-control"] == "private, no-store"
        await account(c)
        assert (await c.get("/api/maintenance")).json()["can_bypass"] is False
        await account(c, uid="admin", admin=True)
        result = await c.get("/api/maintenance")
        assert result.json()["can_bypass"] is True
        assert "user_id" not in result.text and "email" not in result.text and "token" not in result.text
        await appmod.db.users.update_one({"user_id": "admin"}, {"$set": {"blocked_at": "blocked"}})
        assert (await c.get("/api/maintenance")).json()["can_bypass"] is False


@pytest.mark.asyncio
async def test_maintenance_invalid_or_revoked_credentials_do_not_open_the_app():
    await appmod.db.settings.insert_one({"id": "maintenance", "enabled": True})
    async with client() as c:
        await account(c, admin=True)
        await appmod.db.auth_sessions.delete_many({})
        result = await c.get("/api/maintenance")
        assert result.status_code == 200 and result.json()["can_bypass"] is False
        result = await c.get("/api/maintenance", headers={"Authorization": "Bearer forged"})
        assert result.status_code == 200 and result.json()["can_bypass"] is False


@pytest.mark.asyncio
async def test_cookie_login_logout_revocation_and_legacy_rejection():
    async with client() as c:
        await account(c)
        c.cookies.clear()
        r = await c.post("/api/auth/login", json={"email": "user1@example.com", "password": "test-password"})
        assert r.status_code == 200, r.text
        assert "token" not in r.json()
        cookie = r.headers["set-cookie"]
        assert "HttpOnly" in cookie and "Secure" in cookie and "SameSite=none" in cookie
        token = c.cookies.get(appmod.AUTH_COOKIE)
        assert (await c.get("/api/auth/me")).status_code == 200
        assert (await c.post("/api/auth/logout")).status_code == 200
        assert (await c.get("/api/auth/me")).status_code == 401
        assert (await c.get("/api/auth/me", headers={"Authorization": "Bearer " + token})).status_code == 401
        legacy = jwt.encode({"user_id": "user1", "jti": "old", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}, appmod.JWT_SECRET, algorithm="HS256")
        assert (await c.get("/api/auth/me", headers={"Authorization": "Bearer " + legacy})).status_code == 401


@pytest.mark.asyncio
async def test_csrf_and_cors():
    async with client() as c:
        await account(c)
        c.headers.pop("X-YM-Request")
        assert (await c.post("/api/auth/logout")).status_code == 403
        assert (await c.post("/api/auth/logout", headers={"X-YM-Request": "1", "Origin": "https://evil.example"})).status_code == 403
        r = await c.options("/api/auth/logout", headers={"Origin": "https://yourmovies.space", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "X-YM-Request"})
        assert r.status_code == 200
        assert r.headers["access-control-allow-origin"] == "https://yourmovies.space"


@pytest.mark.asyncio
async def test_free_playback_requires_completed_resource_and_session_bound_grant(monkeypatch):
    await media()
    ads = {"enabled": True, "gate": {"enabled": True, "steps": 2, "seconds": 15, "direct_link": "https://ad.example"}, "preroll": {"enabled": True, "skip_after": 5, "vast_tag_url": "https://ad.example/vast"}}
    monkeypatch.setattr(appmod, "_effective_ads", AsyncMock(return_value=ads))
    async with client() as c:
        await account(c)
        for path in ["/api/media/movie1/playback", "/api/bunny/playback/movie1"]:
            assert (await c.get(path)).status_code == 403
        access = (await c.post("/api/playback/access", json={"media_id": "movie1"})).json()
        c.headers["X-Playback-Grant"] = access["grant"]
        assert (await c.post("/api/playback/access/complete")).status_code == 403
        assert (await c.post("/api/playback/access/step")).status_code == 200
        assert (await c.post("/api/playback/access/step")).status_code == 429
        past = datetime.now(timezone.utc) - timedelta(seconds=1)
        await appmod.db.playback_grants.update_many({}, {"$set": {"ready_at": past}})
        assert (await c.post("/api/playback/access/step")).status_code == 200
        assert (await c.post("/api/playback/access/complete")).status_code == 429
        await appmod.db.playback_grants.update_many({}, {"$set": {"ready_at": past}})
        assert (await c.post("/api/playback/access/complete")).status_code == 200
        r = await c.get("/api/media/movie1/playback")
        assert r.status_code == 200, r.text
        assert "/bcdn_token=" in r.json()["manifest_url"]
        assert (await c.get("/api/media/movie2/playback")).status_code == 403
        assert (await c.get("/api/media/movie1/playback?season_number=1&episode_number=1")).status_code == 403
        async with client() as other:
            await account(other, uid="user2")
            assert (await other.get("/api/media/movie1/playback", headers={"X-Playback-Grant": access["grant"]})).status_code == 403


@pytest.mark.asyncio
async def test_premium_signing_and_offline_fail_closed(monkeypatch):
    await media()
    async with client() as c:
        await account(c, premium=True)
        assert (await c.get("/api/media/movie1/playback")).status_code == 200
        assert (await c.get("/api/offline/movie1/source")).status_code == 200
        monkeypatch.setattr(appmod, "BUNNY_TOKEN_AUTH_KEY", None)
        monkeypatch.delenv("BUNNY_CDN_TOKEN_AUTH_KEY", raising=False)
        assert (await c.get("/api/media/movie1/playback")).status_code == 503
        assert (await c.get("/api/offline/movie1/source")).status_code == 503
        await appmod.db.users.update_one({"user_id": "user1"}, {"$set": {"premium_until": "2000-01-01T00:00:00+00:00"}})
        assert (await c.get("/api/media/movie1/playback")).status_code == 403
        assert (await c.get("/api/offline/movie1/source")).status_code == 403


@pytest.mark.asyncio
async def test_captcha_cannot_be_skipped_or_replayed_between_clients(monkeypatch):
    monkeypatch.setattr(appmod, "TURNSTILE_CONFIGURED", True)
    monkeypatch.setattr(appmod.requests, "post", lambda *a, **k: SimpleNamespace(ok=True, json=lambda: {"success": True, "hostname": "yourmovies.space"}))
    async with client() as c:
        assert (await c.post("/api/playback/verify/skip", json={"code": "110100"})).status_code == 403
        token = (await c.post("/api/playback/verify", json={"token": "provider-test-token"})).json()["pass"]
        request = Request({"type": "http", "headers": [(b'user-agent', c.headers['user-agent'].encode())], "client": ("127.0.0.1", 123)})
        assert appmod._laissez_passer_valide(token, request)
        request.scope["client"] = ("203.0.113.1", 123)
        assert not appmod._laissez_passer_valide(token, request)
        monkeypatch.setattr(appmod, "TURNSTILE_CONFIGURED", False)
        assert (await c.post("/api/playback/verify", json={"token": "test"})).status_code == 503
        assert not appmod._laissez_passer_valide(token, request)


@pytest.mark.asyncio
async def test_unauthorized_partner_stream_never_contacts_upstream(monkeypatch):
    probe = AsyncMock(side_effect=AssertionError("network must not be reached"))
    monkeypatch.setattr(appmod, "run_in_threadpool", probe)
    async with client() as c:
        for method in ["GET", "HEAD"]:
            assert (await c.request(method, "/api/uqflex/stream?id=uqflex_movie1")).status_code == 403
        assert not probe.called


@pytest.mark.asyncio
async def test_profile_ownership_including_delete_side_effects():
    async with client() as c:
        await account(c)
        await appmod.db.profiles.insert_one({"id": "other-profile", "user_id": "other"})
        await appmod.db.favorites.insert_one({"profile_id": "other-profile", "user_id": "other", "media_id": "movie1"})
        assert (await c.get("/api/favorites", headers={"X-Profile-Id": "other-profile"})).status_code == 403
        await c.delete("/api/profiles/other-profile")
        assert await appmod.db.favorites.count_documents({"user_id": "other"}) == 1


@pytest.mark.asyncio
async def test_session_and_playback_tokens_are_not_interchangeable():
    await media()
    async with client() as c:
        await account(c)
        c.cookies.clear()
        wrong = jwt.encode({"typ": "playback", "user_id": "user1", "jti": "test",
                            "iat": datetime.now(timezone.utc), "exp": datetime.now(timezone.utc) + timedelta(hours=1)}, appmod.JWT_SECRET, algorithm="HS256")
        c.cookies.set(appmod.AUTH_COOKIE, wrong, domain="testserver.local", path="/")
        assert (await c.get("/api/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_ad_frequency_is_server_side(monkeypatch):
    monkeypatch.setattr(appmod, "_effective_ads", AsyncMock(return_value={"enabled": True, "gate": {
        "enabled": True, "steps": 1, "seconds": 0, "frequency_minutes": 30, "direct_link": "https://ad.example"}}))
    async with client() as c:
        await account(c)
        grant = (await c.post("/api/playback/access", json={"media_id": "movie1"})).json()
        assert grant["gate_steps"] == 1
        c.headers["X-Playback-Grant"] = grant["grant"]
        assert (await c.post("/api/playback/access/step")).status_code == 200
        assert (await c.post("/api/playback/access/complete")).status_code == 200
        following = (await c.post("/api/playback/access", json={"media_id": "movie2"})).json()
        assert following["gate_steps"] == 0


def test_partner_key_is_only_sent_to_explicit_https_destinations(monkeypatch):
    monkeypatch.setattr(appmod.uqflex_catalog, "_active_base", "")
    monkeypatch.setenv("UQFLEX_PARTNER_BASE", "https://partner.example/api")
    monkeypatch.setenv("UQFLEX_PARTNER_FALLBACKS", "")
    assert appmod.uqflex_catalog.partner_bases() == ["https://partner.example/api"]
    monkeypatch.setenv("UQFLEX_PARTNER_FALLBACKS", "http://insecure.example/api")
    with pytest.raises(ValueError):
        appmod.uqflex_catalog.partner_bases()


def test_proxy_headers_require_explicit_trust(monkeypatch):
    request = Request({"type": "http", "headers": [(b'x-forwarded-for', b'198.51.100.66, 203.0.113.5')], "client": ("10.0.0.2", 123)})
    assert client_ip(request) == "10.0.0.2"
    monkeypatch.setenv("TRUSTED_PROXY_CIDRS", "10.0.0.0/24")
    assert client_ip(request) == "203.0.113.5"
    request.scope["headers"] = [(b'x-forwarded-for', b'invalid')]
    assert client_ip(Request(request.scope)) == "10.0.0.2"


@pytest.mark.asyncio
async def test_shared_rate_limit_is_atomic_and_fails_closed(monkeypatch):
    request = Request({"type": "http", "headers": [], "client": ("203.0.113.5", 123)})
    async def attempt():
        try:
            await appmod._enforce_rate_limit(request, "test", 5, 60)
            return 200
        except appmod.HTTPException as e:
            return e.status_code
    results = await asyncio.gather(*(attempt() for _ in range(20)))
    assert results.count(200) == 5
    assert results.count(429) == 15
    assert not hasattr(appmod, "RATE_BUCKETS")
    monkeypatch.setattr(appmod, "db", SimpleNamespace(rate_limits=SimpleNamespace(find_one_and_update=AsyncMock(side_effect=RuntimeError("offline")))))
    assert await attempt() == 503


def test_signing_covers_relative_hls_resources():
    url = sign_bunny_directory("test.b-cdn.net", "video-123456789", "key", 2000000000)
    path = "/video-123456789/"
    expected = base64.urlsafe_b64encode(hashlib.sha256(f"key{path}2000000000token_path={path}".encode()).digest()).decode().rstrip("=")
    assert f"bcdn_token={expected}" in url
    assert f"bcdn_token={expected}" in urljoin(url, "720p/video.m3u8")
    assert f"bcdn_token={expected}" in urljoin(urljoin(url, "720p/video.m3u8"), "segment.ts")


def test_missing_or_weak_secret_stops_startup(monkeypatch):
    for value in ["", "short"]:
        monkeypatch.setenv("JWT_SECRET", value)
        with pytest.raises(RuntimeError):
            jwt_secret()
