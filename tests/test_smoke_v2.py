def test_no_auth_gate_all_pages(client):
    client.get("/")  # provision guest
    for path in ["/", "/leaderboard", "/terminal", "/qkd"]:
        assert client.get(path).status_code == 200
    assert client.get("/auth/login").status_code == 404


def test_rename_then_qkd_flow(client):
    client.get("/")
    assert client.post("/api/rename", json={"name": "Ghost"}).get_json()["displayName"] == "Ghost"
    client.post("/api/qkd/score", json={"score": 42})
    board = client.get("/api/qkd/leaderboard").get_json()["top"]
    assert any(r["name"] == "Ghost" and r["score"] == 42 for r in board)
