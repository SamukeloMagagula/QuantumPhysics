def test_qkd_endpoints_reachable(client):
    client.get("/")  # guest
    r = client.post("/api/qkd/game", json={"role": "bob"})
    assert r.status_code == 200
    code = r.get_json()["code"]
    assert client.get(f"/api/qkd/game/{code}").status_code == 200
    client.post(f"/api/qkd/game/{code}/start")
    st = client.get(f"/api/qkd/game/{code}").get_json()
    assert st["phase"] in ("alice_setup", "eve_move", "bob_decision")  # computer seats advanced play


def test_qkd_page_has_both_modes(client):
    html = client.get("/qkd").get_data(as_text=True)
    assert "Solo (vs computer)" in html and "Multiplayer" in html
    assert html.count("js/qkd.js") == 1  # no double render
