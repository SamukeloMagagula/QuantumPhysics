def test_nav_has_guest_chip_and_controls(client):
    html = client.get("/").get_data(as_text=True)
    assert 'id="fx-toggle"' in html
    assert 'id="nav-name"' in html
    assert 'id="nav-points"' in html
    assert "Log in" not in html and "Sign up" not in html  # login removed


def test_leaderboard_uses_display_name(app):
    # a renamed guest shows their display_name on the leaderboard
    from quantumbreach.db import get_db
    from quantumbreach.progress.service import leaderboard
    with app.app_context():
        db = get_db()
        db.execute("INSERT INTO users (username, password_hash, display_name, is_guest) VALUES ('operative_x','','GhostRider',1)")
        uid = db.execute("SELECT id FROM users WHERE username='operative_x'").fetchone()["id"]
        db.execute("INSERT INTO user_stats (user_id, points) VALUES (?, 50)", (uid,))
        db.commit()
        board = leaderboard(db, 10)
    assert any(row["username"] == "GhostRider" for row in board)
