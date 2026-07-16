def test_qkd_score_and_leaderboard(client):
    client.get("/")  # provision guest
    r = client.post("/api/qkd/score", json={"score": 30})
    assert r.status_code == 200
    body = r.get_json()
    assert body["best"] == 30 and body["newBadge"] is True
    # a lower score doesn't lower best; no new badge second time
    r2 = client.post("/api/qkd/score", json={"score": 10}).get_json()
    assert r2["best"] == 30 and r2["newBadge"] is False
    board = client.get("/api/qkd/leaderboard").get_json()["top"]
    assert board and board[0]["score"] == 30


def test_qkd_score_validates(client):
    client.get("/")
    assert client.post("/api/qkd/score", json={"score": -5}).status_code == 400
