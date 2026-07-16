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


def test_tampered_guest_cookie_cannot_hijack(app):
    # Seed a victim guest with a known id + name.
    with app.app_context():
        db = get_db()
        db.execute("INSERT INTO users (id, username, password_hash, display_name, is_guest) "
                   "VALUES (1, 'operative_victim', '', 'VICTIM', 1)")
        db.execute("INSERT INTO user_stats (user_id, points) VALUES (1, 0)")
        db.commit()
    # A forged raw cookie for the victim's id must NOT resolve as the victim:
    # the attacker gets a fresh guest, and the victim is left untouched.
    c = app.test_client()
    c.post("/api/rename", json={"name": "PWNED"}, headers={"Cookie": "guest_id=1"})
    with app.app_context():
        name = get_db().execute("SELECT display_name FROM users WHERE id=1").fetchone()["display_name"]
    assert name == "VICTIM"  # unsigned/forged cookie rejected; victim unchanged


def test_rename_rejects_non_string(client):
    client.get("/")
    assert client.post("/api/rename", json={"name": 123}).status_code == 400
