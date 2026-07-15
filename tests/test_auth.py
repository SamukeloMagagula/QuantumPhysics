from quantumbreach.auth.service import create_user, verify_user
from quantumbreach.db import get_db


def test_create_and_verify_user(app):
    with app.app_context():
        db = get_db()
        uid = create_user(db, "alice", "secret")
        assert isinstance(uid, int)
        assert verify_user(db, "alice", "secret")["id"] == uid
        assert verify_user(db, "alice", "wrong") is None


def test_signup_then_logout_flow(client):
    r = client.post("/auth/signup", data={"username": "bob", "password": "hunter2"},
                    follow_redirects=False)
    assert r.status_code == 302
    r = client.post("/auth/logout", follow_redirects=False)
    assert r.status_code == 302


def test_login_page_renders(client):
    assert client.get("/auth/login").status_code == 200
