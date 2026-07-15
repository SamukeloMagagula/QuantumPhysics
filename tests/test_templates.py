def test_home_shows_brand_and_paths(content_client):
    html = content_client.get("/").get_data(as_text=True)
    assert "PhantomQ" in html
    assert "Demo Path" in html


def test_leaderboard_renders(content_client):
    assert content_client.get("/leaderboard").status_code == 200


def test_nav_shows_login_when_anonymous(content_client):
    html = content_client.get("/").get_data(as_text=True)
    assert "Log in" in html


def test_nav_shows_points_and_logout_when_logged_in(content_client):
    content_client.post("/auth/signup", data={"username": "navuser", "password": "pw12"})
    html = content_client.get("/").get_data(as_text=True)
    assert "Log out" in html
    assert "Script Kiddie" in html   # rank chip for a fresh 0-XP user
    assert "0 XP" in html
