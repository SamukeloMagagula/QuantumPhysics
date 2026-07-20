from quantumbreach import create_app


def _client(tmp_path):
    app = create_app({"TESTING": True, "DB_PATH": str(tmp_path / "t.db"),
                      "CONTENT_DIR": "content"})
    from quantumbreach.db import init_db
    init_db(app)
    return app.test_client()


def test_landing_is_anonymous(tmp_path):
    c = _client(tmp_path)
    r = c.get("/")
    assert r.status_code == 200
    # landing must NOT set the guest cookie
    assert "guest_id" not in r.headers.get("Set-Cookie", "")


def test_dashboard_provisions_guest(tmp_path):
    c = _client(tmp_path)
    r = c.get("/dashboard")
    assert r.status_code == 200
    assert "guest_id" in r.headers.get("Set-Cookie", "")
