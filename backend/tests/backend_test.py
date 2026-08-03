"""Iteration 3: Subscription mgmt, Profiles, Admin Users, Media qualities/featured_order."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://stream-portal-182.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@yourmovies.app"
ADMIN_PASSWORD = "Admin123!"
USER_EMAIL = "user@yourmovies.app"
USER_PASSWORD = "User1234!"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Admin auth failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def user_token():
    r = requests.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD})
    if r.status_code == 200:
        return r.json()["token"]
    # try register
    rr = requests.post(f"{API}/auth/register", json={"email": USER_EMAIL, "password": USER_PASSWORD, "name": "Test User"})
    if rr.status_code == 200:
        return rr.json()["token"]
    pytest.skip(f"User auth failed: {rr.status_code} {rr.text}")


@pytest.fixture(scope="session")
def user_headers(user_token):
    return {"Authorization": f"Bearer {user_token}"}


# ---------- Subscription ----------
class TestSubscription:
    def test_current_admin_premium(self, admin_headers):
        r = requests.get(f"{API}/subscription/current", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        for k in ["plan", "interval", "premium_until", "cancel_at_period_end", "next_billing_date"]:
            assert k in data
        # Admin was manually flagged premium
        assert data["plan"] == "premium", f"expected premium plan, got {data}"

    def test_current_requires_auth(self):
        r = requests.get(f"{API}/subscription/current")
        assert r.status_code == 401

    def test_cancel_no_stripe_sub(self, admin_headers):
        r = requests.post(f"{API}/subscription/cancel", headers=admin_headers)
        assert r.status_code == 400, r.text

    def test_resume_no_stripe_sub(self, admin_headers):
        r = requests.post(f"{API}/subscription/resume", headers=admin_headers)
        assert r.status_code == 400, r.text


# ---------- Profiles ----------
class TestProfiles:
    def test_list_requires_auth(self):
        r = requests.get(f"{API}/profiles")
        assert r.status_code == 401

    def test_non_premium_cannot_create(self, user_headers):
        # Ensure the "user" is not premium
        me = requests.get(f"{API}/auth/me", headers=user_headers).json()
        if me.get("premium"):
            pytest.skip("test user is premium, cannot test 403")
        r = requests.post(f"{API}/profiles", headers=user_headers,
                          json={"name": "TEST_kid", "avatar_emoji": "🧒", "avatar_color": "#fff", "is_kid": True})
        assert r.status_code == 403, r.text

    def test_premium_create_up_to_4(self, admin_headers):
        # cleanup existing profiles for admin (TEST_ prefixed only, safer to delete all)
        existing = requests.get(f"{API}/profiles", headers=admin_headers).json()
        for p in existing:
            requests.delete(f"{API}/profiles/{p['id']}", headers=admin_headers)

        created = []
        for i in range(4):
            r = requests.post(f"{API}/profiles", headers=admin_headers,
                              json={"name": f"TEST_p{i}", "avatar_emoji": "🎬", "avatar_color": "#123456"})
            assert r.status_code == 200, r.text
            created.append(r.json()["id"])
        # 5th should fail
        r5 = requests.post(f"{API}/profiles", headers=admin_headers, json={"name": "TEST_p5"})
        assert r5.status_code == 400
        # list
        lst = requests.get(f"{API}/profiles", headers=admin_headers).json()
        assert len(lst) == 4

        # PUT
        pid = created[0]
        rp = requests.put(f"{API}/profiles/{pid}", headers=admin_headers,
                          json={"name": "TEST_p0_upd", "avatar_emoji": "😀", "avatar_color": "#000", "is_kid": True})
        assert rp.status_code == 200
        after = requests.get(f"{API}/profiles", headers=admin_headers).json()
        upd = next((x for x in after if x["id"] == pid), None)
        assert upd and upd["name"] == "TEST_p0_upd" and upd["is_kid"] is True

        # DELETE
        for pid in created:
            rd = requests.delete(f"{API}/profiles/{pid}", headers=admin_headers)
            assert rd.status_code == 200
        assert requests.get(f"{API}/profiles", headers=admin_headers).json() == []


# ---------- Admin Users ----------
class TestAdminUsers:
    def test_requires_admin(self, user_headers):
        r = requests.get(f"{API}/admin/users", headers=user_headers)
        assert r.status_code == 403

    def test_list_users(self, admin_headers):
        r = requests.get(f"{API}/admin/users", headers=admin_headers)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list) and len(users) >= 1
        u = users[0]
        for k in ["user_id", "email", "is_admin", "premium"]:
            assert k in u

    def test_toggle_admin_and_delete(self, admin_headers):
        # Create a throwaway user
        email = f"TEST_del_{os.urandom(3).hex()}@x.com"
        reg = requests.post(f"{API}/auth/register", json={"email": email, "password": "Aaaaa123!", "name": "Del"})
        assert reg.status_code == 200
        target_id = reg.json()["user"]["user_id"]

        # toggle admin -> true
        r = requests.post(f"{API}/admin/users/{target_id}/toggle-admin", headers=admin_headers)
        assert r.status_code == 200 and r.json()["is_admin"] is True
        # toggle back
        r2 = requests.post(f"{API}/admin/users/{target_id}/toggle-admin", headers=admin_headers)
        assert r2.status_code == 200 and r2.json()["is_admin"] is False

        # delete
        rd = requests.delete(f"{API}/admin/users/{target_id}", headers=admin_headers)
        assert rd.status_code == 200

        # verify gone
        users = requests.get(f"{API}/admin/users", headers=admin_headers).json()
        assert target_id not in [u["user_id"] for u in users]

    def test_cannot_delete_self(self, admin_headers):
        me = requests.get(f"{API}/auth/me", headers=admin_headers).json()
        r = requests.delete(f"{API}/admin/users/{me['user_id']}", headers=admin_headers)
        assert r.status_code == 400


# ---------- Media qualities & featured_order ----------
class TestMediaQualities:
    def test_media_has_qualities_and_featured_order(self, admin_headers):
        items = requests.get(f"{API}/media").json()
        assert len(items) >= 1
        bbb = items[0]
        assert "qualities" in bbb
        assert "featured_order" in bbb
        assert isinstance(bbb["qualities"], list)

    def test_update_media_qualities(self, admin_headers):
        items = requests.get(f"{API}/media").json()
        mid = items[0]["id"]
        payload = {
            "qualities": [
                {"quality": "720p", "url": "https://example.com/720.mp4", "file_path": ""},
                {"quality": "1080p", "url": "https://example.com/1080.mp4", "file_path": ""},
                {"quality": "4k", "url": "https://example.com/4k.mp4", "file_path": ""},
            ],
            "featured": True,
            "featured_order": 1,
        }
        r = requests.put(f"{API}/media/{mid}", headers=admin_headers, json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["qualities"]) == 3
        assert data["featured_order"] == 1
        assert data["featured"] is True

        # GET to verify persistence
        got = requests.get(f"{API}/media/{mid}").json()
        assert len(got["qualities"]) == 3
        assert got["featured_order"] == 1
