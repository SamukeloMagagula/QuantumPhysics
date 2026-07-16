from quantumbreach.db import get_db


def test_guest_autoprovisioned_and_stable(client):
    r1 = client.get("/")
    assert r1.status_code == 200
    # A guest cookie is set on first visit
    assert "guest_id" in r1.headers.get("Set-Cookie", "")
    # A second request (test client resends the cookie) resolves the same guest
    client.get("/")
    with client.application.app_context():
        n = get_db().execute("SELECT COUNT(*) AS c FROM users WHERE is_guest=1").fetchone()["c"]
    assert n == 1


def test_rename_updates_display_name(client):
    client.get("/")
    r = client.post("/api/rename", json={"name": "Neo"})
    assert r.status_code == 200
    assert r.get_json()["displayName"] == "Neo"


def test_rename_rejects_bad_name(client):
    client.get("/")
    assert client.post("/api/rename", json={"name": ""}).status_code == 400
    assert client.post("/api/rename", json={"name": "x" * 41}).status_code == 400


def test_no_login_gate_and_auth_routes_gone(client):
    assert client.get("/rooms/the-shift").status_code in (200, 404)  # reachable (no redirect to login)
    assert client.get("/auth/login").status_code == 404
    assert client.get("/auth/signup").status_code == 404
