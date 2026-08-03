"""Iteration 4 backend tests: Settings, PIN, Profile PIN, Watch Party, Media (title_logo_url + age_rating)."""
import os
import json
import asyncio
import pytest
import requests
import websockets

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://stream-portal-182.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"
WS_BASE = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://')

ADMIN_EMAIL = "admin@yourmovies.app"
ADMIN_PASS = "Admin123!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def media_id(admin_headers):
    r = requests.get(f"{API}/media", headers=admin_headers)
    assert r.status_code == 200
    lst = r.json()
    assert len(lst) > 0, "No media in DB"
    return lst[0]["id"]


# ------------- Settings -------------
class TestSettings:
    def test_patch_settings_basic(self, admin_headers):
        r = requests.patch(f"{API}/settings", headers=admin_headers,
                           json={"name": "Admin Iter4", "bio": "hello world",
                                 "preferred_quality": "1080p", "autoplay_hero": True})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "Admin Iter4"
        assert data["bio"] == "hello world"
        assert data["preferred_quality"] == "1080p"
        assert data["autoplay_hero"] is True

    def test_patch_settings_accent_premium(self, admin_headers):
        # admin is premium per iteration context
        r = requests.patch(f"{API}/settings", headers=admin_headers, json={"accent_color": "#ff0055"})
        assert r.status_code == 200, r.text
        assert r.json().get("accent_color") == "#ff0055"

    def test_accent_forbidden_for_non_premium(self):
        # Create a fresh non-premium user
        email = f"nonprem_{os.urandom(3).hex()}@test.io"
        rr = requests.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "Np"})
        assert rr.status_code == 200, rr.text
        tok = rr.json()["token"]
        h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        r = requests.patch(f"{API}/settings", headers=h, json={"accent_color": "#123456"})
        assert r.status_code == 403, r.text
        # But other fields OK
        r2 = requests.patch(f"{API}/settings", headers=h, json={"bio": "hi"})
        assert r2.status_code == 200


# ------------- User PIN -------------
class TestUserPin:
    def test_set_verify_delete_pin(self, admin_headers):
        # Try setting; if PIN exists from earlier tests, remove first
        r = requests.post(f"{API}/settings/pin", headers=admin_headers, json={"pin": "1234"})
        if r.status_code == 401:
            # PIN already set, provide current_pin
            r = requests.post(f"{API}/settings/pin", headers=admin_headers, json={"pin": "1234", "current_pin": "1234"})
        assert r.status_code == 200, r.text

        # Verify correct pin
        r = requests.post(f"{API}/settings/verify-pin", headers=admin_headers, json={"pin": "1234"})
        assert r.status_code == 200

        # Wrong pin -> 401
        r = requests.post(f"{API}/settings/verify-pin", headers=admin_headers, json={"pin": "9999"})
        assert r.status_code == 401

        # /auth/me exposes has_pin true and NOT pin_hash
        me = requests.get(f"{API}/auth/me", headers=admin_headers).json()
        assert me.get("has_pin") is True
        assert "pin_hash" not in me

        # DELETE with wrong pin -> 401
        r = requests.delete(f"{API}/settings/pin", headers=admin_headers, json={"pin": "0000"})
        assert r.status_code == 401
        # DELETE with correct pin -> 200
        r = requests.delete(f"{API}/settings/pin", headers=admin_headers, json={"pin": "1234"})
        assert r.status_code == 200


# ------------- Profile PIN -------------
class TestProfilePin:
    def test_profile_pin_flow(self, admin_headers):
        # Create profile
        r = requests.post(f"{API}/profiles", headers=admin_headers,
                          json={"name": "KidTest", "is_kid": True, "min_age": 10})
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        try:
            # Set PIN
            r = requests.post(f"{API}/profiles/{pid}/pin", headers=admin_headers, json={"pin": "5678"})
            assert r.status_code == 200

            # GET profiles: has_pin True, no pin_hash exposed
            r = requests.get(f"{API}/profiles", headers=admin_headers).json()
            entry = next(p for p in r if p["id"] == pid)
            assert entry["has_pin"] is True
            assert "pin_hash" not in entry

            # Verify correct
            r = requests.post(f"{API}/profiles/{pid}/verify-pin", headers=admin_headers, json={"pin": "5678"})
            assert r.status_code == 200
            # Wrong -> 401
            r = requests.post(f"{API}/profiles/{pid}/verify-pin", headers=admin_headers, json={"pin": "0000"})
            assert r.status_code == 401
        finally:
            requests.delete(f"{API}/profiles/{pid}", headers=admin_headers)


# ------------- Media title_logo_url + age_rating -------------
class TestMediaFields:
    def test_update_media_new_fields(self, admin_headers, media_id):
        r = requests.put(f"{API}/media/{media_id}", headers=admin_headers,
                         json={"title_logo_url": "https://example.com/logo.png", "age_rating": "PG-13"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("title_logo_url") == "https://example.com/logo.png"
        assert data.get("age_rating") == "PG-13"

        # GET returns same
        g = requests.get(f"{API}/media/{media_id}").json()
        assert g["title_logo_url"] == "https://example.com/logo.png"
        assert g["age_rating"] == "PG-13"


# ------------- Watch Party -------------
class TestWatchParty:
    def test_create_party_and_ws(self, admin_headers, admin_token, media_id):
        r = requests.post(f"{API}/party/create", headers=admin_headers, json={"media_id": media_id})
        assert r.status_code == 200, r.text
        code = r.json()["code"]
        assert r.json()["media_id"] == media_id
        assert len(code) == 6

        # GET info
        g = requests.get(f"{API}/party/{code}")
        assert g.status_code == 200
        assert g.json()["code"] == code

        # WS flow
        asyncio.get_event_loop().run_until_complete(self._ws_flow(code, admin_token))

    async def _ws_flow(self, code, token):
        url = f"{WS_BASE}/api/party/{code}/ws?token={token}"
        # Host connects
        async with websockets.connect(url) as ws1:
            hello1 = json.loads(await asyncio.wait_for(ws1.recv(), timeout=10))
            assert hello1["type"] == "hello"
            assert hello1["code"] == code
            # Participants broadcast
            try:
                p1 = json.loads(await asyncio.wait_for(ws1.recv(), timeout=3))
                assert p1["type"] == "participants"
            except asyncio.TimeoutError:
                pass

            # Second guest (anonymous, no token)
            url_guest = f"{WS_BASE}/api/party/{code}/ws"
            async with websockets.connect(url_guest) as ws2:
                hello2 = json.loads(await asyncio.wait_for(ws2.recv(), timeout=10))
                assert hello2["type"] == "hello"

                # Drain participants messages
                await asyncio.sleep(0.5)

                # Host sends sync
                await ws1.send(json.dumps({"type": "sync", "position_seconds": 42.0, "playing": True}))
                # Guest should receive
                for _ in range(5):
                    msg = json.loads(await asyncio.wait_for(ws2.recv(), timeout=5))
                    if msg["type"] == "sync":
                        assert msg["state"]["position_seconds"] == 42.0
                        assert msg["state"]["playing"] is True
                        break

                # Guest sends chat -> host receives
                await ws2.send(json.dumps({"type": "chat", "text": "hello from guest"}))
                for _ in range(5):
                    msg = json.loads(await asyncio.wait_for(ws1.recv(), timeout=5))
                    if msg["type"] == "chat":
                        assert msg["text"] == "hello from guest"
                        break
                else:
                    pytest.fail("Chat not received by host")
