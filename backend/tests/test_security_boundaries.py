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
from unittest.mock import AsyncMock, Mock
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
    appmod.party_service.rooms.clear()
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
    monkeypatch.setattr(appmod, "TURNSTILE_CONFIGURED", True)
    monkeypatch.setattr(appmod.requests, "post", lambda *a, **k: SimpleNamespace(ok=True, json=lambda: {"success": True, "hostname": "yourmovies.space"}))
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
        assert (await c.post("/api/playback/verify", json={"token": "test"})).status_code == 403
        first = (await c.post("/api/playback/access/step", json={"action": "start", "ticket": access["step_ticket"]})).json()
        assert (await c.post("/api/playback/access/step", json={"action": "complete", "ticket": access["step_ticket"], "challenge": "fake-challenge-that-cannot-work", "done": 2})).status_code == 403
        assert (await c.post("/api/playback/access/step", json={"action": "complete", "ticket": access["step_ticket"], "challenge": first["challenge"]})).status_code == 429
        past = datetime.now(timezone.utc) - timedelta(seconds=1)
        await appmod.db.playback_grants.update_many({}, {"$set": {"ready_at": past}})
        completed = (await c.post("/api/playback/access/step", json={"action": "complete", "ticket": access["step_ticket"], "challenge": first["challenge"]})).json()
        access["step_ticket"] = completed["next_step_ticket"]
        second = (await c.post("/api/playback/access/step", json={"action": "start", "ticket": access["step_ticket"]})).json()
        await appmod.db.playback_grants.update_many({}, {"$set": {"ready_at": past}})
        completed = (await c.post("/api/playback/access/step", json={"action": "complete", "ticket": access["step_ticket"], "challenge": second["challenge"]})).json()
        assert completed["remaining_steps"] == 0 and "done" not in completed
        preroll = (await c.post("/api/playback/access/preroll", json={"action": "start"})).json()
        assert (await c.post("/api/playback/verify", json={"token": "test"})).status_code == 403
        assert (await c.post("/api/playback/access/preroll", json={"action": "complete", "challenge": preroll["challenge"]})).status_code == 429
        await appmod.db.playback_grants.update_many({}, {"$set": {"ready_at": past}})
        assert (await c.post("/api/playback/access/preroll", json={"action": "complete", "challenge": preroll["challenge"]})).status_code == 200
        assert (await c.post("/api/playback/access/complete")).status_code == 403
        monkeypatch.setattr(appmod.requests, "post", lambda *a, **k: SimpleNamespace(ok=True, json=lambda: {
            "success": True, "hostname": "yourmovies.space", "action": "playback", "cdata": access["captcha_context"]}))
        assert (await c.post("/api/playback/verify", json={"token": "test"})).status_code == 200
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
            assert (await c.request(method, "/api/uqflex/stream?id=uq_movie1")).status_code == 403
        assert not probe.called


@pytest.mark.asyncio
async def test_partner_stream_requires_issuing_session_and_preserves_range(monkeypatch):
    from unittest.mock import Mock
    from urllib.parse import urlsplit, parse_qs
    monkeypatch.setattr(appmod.uqflex_catalog, "configured", lambda: True)
    monkeypatch.setattr(appmod.uqflex_catalog, "find_cached_item", lambda _: {"id": "movie1", "type": "movie"})
    monkeypatch.setattr(appmod.uqflex_catalog, "find_item", lambda _: {"id": "movie1", "type": "movie"})
    monkeypatch.setattr(appmod.uqflex_catalog, "partner_stream_url", lambda *args: "https://partner.example/stream")
    monkeypatch.setattr(appmod.uqflex_catalog, "_headers", lambda: {"X-Api-Key": "test-private-key"})
    monkeypatch.setattr(appmod, "UQFLEX_API_BASE", "https://testserver")
    upstream = Mock(status_code=206, headers={"content-type": "video/mp4", "content-range": "bytes 0-3/100", "content-length": "4", "content-disposition": "attachment", "X-Api-Key": "never-forward"})
    upstream.iter_content.return_value = iter([b"test"])
    get = Mock(return_value=upstream)
    head = Mock(return_value=upstream)
    monkeypatch.setattr(appmod.requests, "get", get)
    monkeypatch.setattr(appmod.requests, "head", head)
    async with client() as c:
        await account(c, premium=True)
        r = await c.get("/api/media/uq_movie1/playback")
        assert r.status_code == 200, r.text
        url = r.json()["qualities"][0]["url"]
        assert url.startswith("https://testserver/api/uqflex/stream?")
        async with client() as other:
            for method in ("GET", "HEAD"):
                assert (await other.request(method, url)).status_code == 403
            await account(other, uid="other", premium=True)
            assert (await other.get(url)).status_code == 403
        assert not get.called and not head.called
        r = await c.get(url, headers={"Range": "bytes=0-3"})
        assert r.status_code == 206 and r.content == b"test"
        assert r.headers["content-range"] == "bytes 0-3/100"
        assert r.headers["content-disposition"] == "inline"
        assert r.headers["cache-control"] == "private, no-store"
        assert "x-api-key" not in r.headers
        assert get.call_args.kwargs["headers"] == {"X-Api-Key": "test-private-key", "Range": "bytes=0-3"}
        assert get.call_args.kwargs["allow_redirects"] is False
        assert get.call_args.kwargs["timeout"] == (10, 90)
        assert (await c.head(url, headers={"Range": "bytes=0-3"})).status_code == 206
        assert (await c.get(url.replace("id=uq_movie1", "id=uq_other"))).status_code == 403
        claims = jwt.decode(parse_qs(urlsplit(url).query)["access"][0], appmod.JWT_SECRET, algorithms=["HS256"])
        claims["exp"] = 1
        expired = jwt.encode(claims, appmod.JWT_SECRET, algorithm="HS256")
        assert (await c.get("/api/uqflex/stream", params={"id": "uq_movie1", "access": expired})).status_code == 403
        await c.post("/api/auth/logout")
        assert (await c.get(url)).status_code == 403
        assert get.call_count == 1 and head.call_count == 1


@pytest.mark.asyncio
async def test_free_uqflex_capability_stops_when_server_grant_is_revoked(monkeypatch):
    monkeypatch.setattr(appmod, "TURNSTILE_CONFIGURED", True)
    monkeypatch.setattr(appmod.requests, "post", lambda *a, **k: SimpleNamespace(
        ok=True, json=lambda: {"success": True, "hostname": "yourmovies.space"}))
    monkeypatch.setattr(appmod.uqflex_catalog, "configured", lambda: True)
    monkeypatch.setattr(appmod.uqflex_catalog, "find_item", lambda _: {"id": "movie1", "type": "movie"})
    upstream = Mock(side_effect=AssertionError("revoked grant must not contact partner"))
    monkeypatch.setattr(appmod.requests, "get", upstream)
    async with client() as c:
        await account(c)
        access = (await c.post("/api/playback/access", json={"media_id": "uq_movie1"})).json()
        c.headers["X-Playback-Grant"] = access["grant"]
        monkeypatch.setattr(appmod.requests, "post", lambda *a, **k: SimpleNamespace(ok=True, json=lambda: {
            "success": True, "hostname": "yourmovies.space", "action": "playback", "cdata": access["captcha_context"]}))
        assert (await c.post("/api/playback/verify", json={"token": "test"})).status_code == 200
        assert (await c.post("/api/playback/access/complete")).status_code == 200
        playback = await c.get("/api/media/uq_movie1/playback")
        assert playback.status_code == 200
        stream_url = playback.json()["qualities"][0]["url"]
        await appmod.db.playback_grants.update_many({}, {"$set": {"completed": False}})
        assert (await c.get(stream_url)).status_code == 403
        assert not upstream.called


@pytest.mark.asyncio
async def test_anonymous_partner_stream_is_bound_to_visitor_cookie(monkeypatch):
    from unittest.mock import Mock
    upstream = Mock(return_value=None)
    monkeypatch.setattr(appmod.requests, "get", upstream)
    visitor = "test-visitor-cookie"
    claims = {"typ": "uqflex-stream", "media_id": "uq_movie1", "season": "", "episode": "",
              "binding": appmod.fingerprint(visitor, appmod.JWT_SECRET),
              "grant_id": "test-completed-grant",
              "exp": datetime.now(timezone.utc) + timedelta(minutes=1)}
    token = jwt.encode(claims, appmod.JWT_SECRET, algorithm="HS256")
    await appmod.db.playback_grants.insert_one({
        "_id": "test-completed-grant", "binding": claims["binding"], "media_id": "uq_movie1",
        "season_number": None, "episode_number": None, "completed": True, "captcha_verified": True,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
    })
    monkeypatch.setattr(appmod.uqflex_catalog, "configured", lambda: False)
    async with client() as c:
        path = "/api/uqflex/stream?id=uq_movie1&access=" + token
        assert (await c.get(path)).status_code == 403
        c.cookies.set(appmod.VISITOR_COOKIE, "different-visitor", domain="testserver.local", path="/")
        assert (await c.get(path)).status_code == 403
        c.cookies.set(appmod.VISITOR_COOKIE, visitor, domain="testserver.local", path="/")
        # Correct session reaches the configured-service check, without network.
        assert (await c.get(path)).status_code == 503
        assert not upstream.called


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
    monkeypatch.setattr(appmod, "TURNSTILE_CONFIGURED", True)
    monkeypatch.setattr(appmod.requests, "post", lambda *a, **k: SimpleNamespace(ok=True, json=lambda: {"success": True, "hostname": "yourmovies.space"}))
    monkeypatch.setattr(appmod, "_effective_ads", AsyncMock(return_value={"enabled": True, "gate": {
        "enabled": True, "steps": 1, "seconds": 0, "frequency_minutes": 30, "direct_link": "https://ad.example"}}))
    async with client() as c:
        await account(c)
        grant = (await c.post("/api/playback/access", json={"media_id": "movie1"})).json()
        assert grant["gate_steps"] == 1
        c.headers["X-Playback-Grant"] = grant["grant"]
        started = (await c.post("/api/playback/access/step", json={"action": "start", "ticket": grant["step_ticket"]})).json()
        await appmod.db.playback_grants.update_one(
            {"_id": appmod._token_fingerprint(grant["grant"])},
            {"$set": {"ready_at": datetime.now(timezone.utc) - timedelta(seconds=1)}})
        assert (await c.post("/api/playback/access/step", json={"action": "complete", "ticket": grant["step_ticket"], "challenge": started["challenge"]})).status_code == 200
        monkeypatch.setattr(appmod.requests, "post", lambda *a, **k: SimpleNamespace(ok=True, json=lambda: {
            "success": True, "hostname": "yourmovies.space", "action": "playback", "cdata": grant["captcha_context"]}))
        assert (await c.post("/api/playback/verify", json={"token": "test"})).status_code == 200
        assert (await c.post("/api/playback/access/complete")).status_code == 200
        following = (await c.post("/api/playback/access", json={"media_id": "movie2"})).json()
        assert following["gate_steps"] == 0
        c.headers["X-Playback-Grant"] = following["grant"]
        assert (await c.post("/api/playback/access/complete")).status_code == 403


@pytest.mark.asyncio
async def test_cloudflare_is_required_for_free_accounts_and_proof_is_grant_bound(monkeypatch):
    monkeypatch.setattr(appmod, "TURNSTILE_CONFIGURED", True)
    monkeypatch.setattr(appmod, "TURNSTILE_SITE_KEY", "public-test-site-key")
    monkeypatch.setattr(appmod.requests, "post", lambda *a, **k: SimpleNamespace(ok=True, json=lambda: {"success": True, "hostname": "yourmovies.space"}))
    async with client() as c:
        await account(c)
        assert (await c.get("/api/playback/verification")).json()["required"] is True
        old_pass = (await c.post("/api/playback/verify", json={"token": "legacy-test-token"})).json()["pass"]
        grant = (await c.post("/api/playback/access", json={"media_id": "movie1"})).json()
        assert grant["verification_required"] is True
        c.headers.update({"X-Playback-Grant": grant["grant"], "X-Playback-Pass": old_pass})
        assert (await c.post("/api/playback/access/complete")).status_code == 403
        monkeypatch.setattr(appmod.requests, "post", lambda *a, **k: SimpleNamespace(ok=True, json=lambda: {"success": False}))
        assert (await c.post("/api/playback/verify", json={"token": "invalid-token"})).status_code == 403
        assert (await c.post("/api/playback/access/complete")).status_code == 403
        monkeypatch.setattr(appmod.requests, "post", lambda *a, **k: SimpleNamespace(ok=True, json=lambda: {
            "success": True, "hostname": "yourmovies.space", "action": "playback", "cdata": grant["captcha_context"]}))
        assert (await c.post("/api/playback/verify", json={"token": "fresh-token"})).status_code == 200
        assert (await c.post("/api/playback/access/complete")).status_code == 200
        following = (await c.post("/api/playback/access", json={"media_id": "movie2"})).json()
        c.headers["X-Playback-Grant"] = following["grant"]
        assert (await c.post("/api/playback/access/complete")).status_code == 403
    async with client() as premium:
        await account(premium, uid="premium", premium=True)
        assert (await premium.get("/api/playback/verification")).json()["required"] is False


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


@pytest.mark.asyncio
async def test_party_codes_are_generated_and_unknown_codes_never_create_rooms():
    from watch_party import CODE
    await media()
    async with client() as c:
        assert (await c.post("/api/party/create", json={"media_id": "movie1"})).status_code == 401
        await account(c)
        assert (await c.post("/api/party/create", json={"media_id": "movie1", "code": "NAKED"})).status_code == 422
        assert (await c.post("/api/party/create", json={"media_id": "missing"})).status_code == 404
        for code in ["NAKED", "ABCDEF", "00000000"]:
            assert (await c.get(f"/api/party/{code}")).status_code == 404
        assert await appmod.db.parties.count_documents({}) == 0
        result = await c.post("/api/party/create", json={"media_id": "movie1"})
        assert result.status_code == 200, result.text
        room = result.json()
        assert len(room["code"]) == 8 and CODE.fullmatch(room["code"])
        assert room["is_public"] is False and "secret-" not in result.text
        assert (await c.get(f"/api/party/{room['code']}" )).status_code == 200


@pytest.mark.asyncio
async def test_party_directory_privacy_and_host_only_settings():
    from unittest.mock import AsyncMock
    await media()
    async with client() as host, client() as guest:
        await account(host, "host")
        await account(guest, "guest")
        data = (await host.post("/api/party/create", json={"media_id": "movie1"})).json()
        code = data["code"]
        room = await appmod.party_service.load(code)
        room.connections.append({"id": "host-connection", "account_id": "host", "ws": AsyncMock()})
        assert (await guest.get("/api/party/public")).json() == {"rooms": []}
        settings = {"name": "Soirée cinéma", "is_public": True, "max_members": 6}
        assert (await guest.patch(f"/api/party/{code}/settings", json=settings)).status_code == 403
        assert (await host.patch(f"/api/party/{code}/settings", json={**settings, "code": "CUSTOM"})).status_code == 422
        result = await host.patch(f"/api/party/{code}/settings", json=settings)
        assert result.status_code == 200, result.text
        assert result.json()["code"] == code
        directory = await guest.get("/api/party/public")
        assert directory.json()["rooms"][0]["name"] == "Soirée cinéma"
        assert directory.json()["rooms"][0]["participants_count"] == 1
        assert "host_id" not in directory.text and "secret-" not in directory.text
        await host.patch(f"/api/party/{code}/settings", json={**settings, "is_public": False})
        assert (await guest.get("/api/party/public")).json()["rooms"] == []


@pytest.mark.asyncio
async def test_party_guest_commands_and_invalid_numbers_never_mutate_playback():
    from fastapi import HTTPException
    from unittest.mock import AsyncMock
    await media()
    async with client() as c:
        await account(c, "host")
        code = (await c.post("/api/party/create", json={"media_id": "movie1"})).json()["code"]
        room = await appmod.party_service.load(code)
        guest = {"account_id": "guest", "ws": AsyncMock(), "ready": True}
        for kind in ["sync", "episode", "start", "kick", "close"]:
            with pytest.raises(HTTPException) as error:
                await appmod.party_service.command(room, guest, {"type": kind, "playback_rate": 1.25})
            assert error.value.status_code == 403
        host = {**guest, "account_id": "host"}
        for position, rate in [(float("nan"), 1), (float("inf"), 1), (-5, 1), (3, 100), (True, 1)]:
            with pytest.raises(HTTPException):
                await appmod.party_service.command(room, host, {"type": "sync", "position_seconds": position, "playback_rate": rate, "playing": True})
        assert room.state["position_seconds"] == 0 and not room.doc["started"]


@pytest.mark.asyncio
async def test_party_start_and_episode_state_survive_reload():
    from unittest.mock import AsyncMock
    from fastapi import HTTPException
    doc = await media()
    await appmod.db.media.update_one({"id": "movie1"}, {"$set": {"type": "series", "seasons.0.episodes": [doc["seasons"][0]["episodes"][0], {"ep_number": 2, "video_url": "secret-video-2"}]}})
    async with client() as c:
        await account(c, "host", premium=True)
        response = await c.post("/api/party/create", json={"media_id": "movie1", "season_number": "1", "episode_number": "1"})
        assert response.status_code == 200, response.text
        code = response.json()["code"]
        room = await appmod.party_service.load(code)
        conn = {"id": "host", "account_id": "host", "name": "Host", "ws": AsyncMock(), "ready": False, "needs_ads": False}
        room.connections.append(conn)
        with pytest.raises(HTTPException):
            await appmod.party_service.command(room, conn, {"type": "start"})
        conn["ready"] = True
        await appmod.party_service.command(room, conn, {"type": "start"})
        await appmod.party_service.command(room, conn, {"type": "sync", "position_seconds": 30, "playing": True, "playback_rate": 1.25, "season_number": "1", "episode_number": "1"})
        assert room.state["playback_rate"] == 1.25 and room.state["season_number"] == "1"
        appmod.party_service.rooms.clear()
        restored = await appmod.party_service.load(code)
        assert restored.doc["started"] and restored.state["position_seconds"] == 30
        assert restored.state["playing"] is False  # No phantom playback after deployment.
        await appmod.party_service.command(room, conn, {"type": "episode", "season_number": "1", "episode_number": "2"})
        assert room.state["episode_number"] == "2" and room.state["playback_rate"] == 1.25
        assert not room.doc["started"] and not conn["ready"]
        with pytest.raises(HTTPException):
            await appmod.party_service.command(room, conn, {"type": "episode", "season_number": "1", "episode_number": "999"})


@pytest.mark.asyncio
async def test_party_ready_requires_completed_grant_bound_to_session_and_media():
    await media()
    async with client() as c:
        token = await account(c, "host")
        access = (await c.post("/api/playback/access", json={"media_id": "movie1"})).json()
        code = (await c.post("/api/party/create", json={"media_id": "movie1"})).json()["code"]
        room = await appmod.party_service.load(code)
        request = Request({"type": "http", "headers": [(b"cookie", f"{appmod.AUTH_COOKIE}={token}".encode())]})
        conn = {"ws": request, "user": {"user_id": "host"}}
        assert not await appmod._party_ready(conn, room, access["grant"])
        await appmod.db.playback_grants.update_many({}, {"$set": {"completed": True, "captcha_verified": True}})
        assert await appmod._party_ready(conn, room, access["grant"])
        await appmod.db.playback_grants.update_many({}, {"$set": {"media_id": "other"}})
        assert not await appmod._party_ready(conn, room, access["grant"])
        await appmod.db.playback_grants.update_many({}, {"$set": {"media_id": "movie1", "binding": "another-session"}})
        assert not await appmod._party_ready(conn, room, access["grant"])


@pytest.mark.asyncio
async def test_party_websocket_checks_session_origin_capacity_and_guest_commands(monkeypatch):
    from starlette.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect
    await media()
    async with client() as host, client() as guest:
        host_token = await account(host, "host", premium=True)
        guest_token = await account(guest, "guest", premium=True)
        code = (await host.post("/api/party/create", json={"media_id": "movie1"})).json()["code"]
        monkeypatch.setattr(appmod.party_service, "host_grace", AsyncMock())
        web = TestClient(appmod.app)
        def headers(token, origin="https://yourmovies.space"):
            return {"origin": origin, "cookie": f"{appmod.AUTH_COOKIE}={token}"}
        for token, origin in [("fake", "https://yourmovies.space"), (host_token, "https://evil.example")]:
            with pytest.raises(WebSocketDisconnect):
                with web.websocket_connect(f"/api/party/{code}/ws", headers=headers(token, origin)):
                    pass
        with web.websocket_connect(f"/api/party/{code}/ws", headers=headers(host_token)) as ws:
            ws.send_json({"type": "auth"})
            assert ws.receive_json()["you"]["is_host"] is True
            assert len(ws.receive_json()["participants"]) == 1
            with web.websocket_connect(f"/api/party/{code}/ws", headers=headers(guest_token)) as member:
                member.send_json({"type": "auth"})
                assert member.receive_json()["you"]["is_host"] is False
                assert len(member.receive_json()["participants"]) == 2
                ws.receive_json()
                member.send_json({"type": "sync", "position_seconds": 20, "playing": True, "playback_rate": 2})
                assert member.receive_json()["type"] == "error"
                member.send_json({"type": "ready", "done": True})
                assert member.receive_json()["participants"][1]["ready"] is True
                ws.receive_json()
                ws.send_json({"type": "ready", "done": True})
                assert all(p["ready"] for p in ws.receive_json()["participants"])
                member.receive_json()
                ws.send_json({"type": "start"})
                assert ws.receive_json()["type"] == "started"
                assert member.receive_json()["state"]["playing"] is True
                ws.send_json({"type": "sync", "position_seconds": 30, "playing": False, "playback_rate": 1.25})
                sync = member.receive_json()
                assert sync["state"]["position_seconds"] == 30 and sync["state"]["playback_rate"] == 1.25


@pytest.mark.asyncio
async def test_party_expiration_checks_memory_and_creation_is_rate_limited():
    await media()
    async with client() as c:
        await account(c)
        rooms = []
        for _ in range(5):
            r = await c.post("/api/party/create", json={"media_id": "movie1"})
            assert r.status_code == 200
            rooms.append(r.json()["code"])
        assert (await c.post("/api/party/create", json={"media_id": "movie1"})).status_code == 429
        room = await appmod.party_service.load(rooms[0])
        room.doc["expires_at"] = datetime.now(timezone.utc) - timedelta(seconds=1)
        assert (await c.get(f"/api/party/{rooms[0]}" )).status_code == 404


@pytest.mark.asyncio
async def test_uqflex_cold_cache_fetches_and_global_sort_does_not_starve_partner(monkeypatch):
    partner_item = {"id": "partner-new", "type": "movie", "title": "Partner new",
                    "created_at": "2026-08-31T20:00:00Z", "video_url": "upstream-secret"}
    monkeypatch.setattr(appmod.uqflex_catalog, "configured", lambda: True)
    monkeypatch.setattr(appmod.uqflex_catalog, "_cache_items", [])
    fetch = Mock(return_value=[partner_item])
    monkeypatch.setattr(appmod.uqflex_catalog, "fetch_items", fetch)
    await appmod.db.media.insert_many([
        {"id": "local-old", "title": "Old", "type": "movie", "created_at": "2025-01-01T00:00:00Z"},
        {"id": "local-new", "title": "New", "type": "movie", "created_at": "2026-08-30T00:00:00Z"},
    ])
    async with client() as c:
        result = await c.get("/api/media", params={"limit": 2, "uqflex": "true"})
        assert result.status_code == 200, result.text
        assert [item["id"] for item in result.json()] == ["uq_partner-new", "local-new"]
        assert "upstream-secret" not in result.text
    fetch.assert_called_once_with(False)


@pytest.mark.asyncio
async def test_uqflex_episode_cache_is_revalidated_and_temporary_empty_result_is_safe(monkeypatch):
    item = {"id": "show", "type": "series", "title": "Show"}
    old = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    await appmod.db.uqflex_episode_cache.insert_one({"id": "uq_show", "resolved_at": old,
        "seasons": [{"season_number": 1, "episodes": [{"ep_number": 1, "title": "Keep"}]}]})
    monkeypatch.setattr(appmod, "_uqflex_enrich_doc", AsyncMock())
    monkeypatch.setattr(appmod.uqflex_catalog, "resolve_full_series_item", lambda value: {**value, "episodes": []})
    await appmod._uqflex_update_details([item], enrichment_limit=0, episode_limit=1)
    cached = await appmod.db.uqflex_episode_cache.find_one({"id": "uq_show"})
    assert cached["seasons"][0]["episodes"][0]["title"] == "Keep"
    assert cached["resolved_at"] == old

    monkeypatch.setattr(appmod.uqflex_catalog, "resolve_full_series_item", lambda value: {
        **value, "episodes": [{"season": 1, "episode": 1, "title": "Keep"},
                               {"season": 1, "episode": 2, "title": "New episode"}]})
    await appmod._uqflex_update_details([item], enrichment_limit=0, episode_limit=1)
    cached = await appmod.db.uqflex_episode_cache.find_one({"id": "uq_show"})
    assert [episode["ep_number"] for episode in cached["seasons"][0]["episodes"]] == [1, 2]


@pytest.mark.asyncio
async def test_uqflex_healthy_snapshot_survives_a_fresh_process(monkeypatch):
    rows = [{"id": str(index), "title": "Title %s" % index, "type": "movie"} for index in range(12)]
    monkeypatch.setattr(appmod.uqflex_catalog, "_last_sync_at", datetime.now(timezone.utc).timestamp())
    monkeypatch.setattr(appmod.uqflex_catalog, "_last_raw_count", 15)
    monkeypatch.setattr(appmod.uqflex_catalog, "_active_base", "https://partner.example/api")
    await appmod._uqflex_store_snapshot(rows)

    monkeypatch.setattr(appmod.uqflex_catalog, "_cache_items", [])
    monkeypatch.setattr(appmod.uqflex_catalog, "_cache_at", 0.0)
    monkeypatch.setattr(appmod.uqflex_catalog, "_last_sync_at", 0.0)
    monkeypatch.setattr(appmod.uqflex_catalog, "_last_raw_count", 0)
    restored = await appmod._uqflex_restore_snapshot()

    assert restored == rows
    assert appmod.uqflex_catalog._last_raw_count == 15
    meta = await appmod.db.uqflex_catalog_cache_meta.find_one({"_id": "healthy"})
    assert meta["count"] == 12
