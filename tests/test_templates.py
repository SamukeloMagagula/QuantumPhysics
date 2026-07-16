def test_home_shows_brand_and_paths(content_client):
    html = content_client.get("/").get_data(as_text=True)
    assert "PhantomQ" in html
    assert "Demo Path" in html


def test_leaderboard_renders(content_client):
    assert content_client.get("/leaderboard").status_code == 200
