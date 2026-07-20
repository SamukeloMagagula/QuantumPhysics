from quantumbreach import create_app


def _client(tmp_path):
    app = create_app({"TESTING": True, "DB_PATH": str(tmp_path / "t.db"),
                      "CONTENT_DIR": "content"})
    from quantumbreach.db import init_db
    init_db(app)
    return app.test_client()


def test_app_pages_have_sidebar(tmp_path):
    c = _client(tmp_path)
    for path in ("/dashboard", "/terminal", "/qkd", "/leaderboard"):
        html = c.get(path).get_data(as_text=True)
        assert 'class="sidebar"' in html, f"{path} missing sidebar"
        # matrix canvas retained
        assert 'id="fx-bg"' in html, f"{path} missing matrix canvas"


def test_landing_has_no_sidebar(tmp_path):
    c = _client(tmp_path)
    html = c.get("/").get_data(as_text=True)
    assert 'class="sidebar"' not in html
