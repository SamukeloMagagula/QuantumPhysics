from quantumbreach.db import get_db


def _guest(app):
    c = app.test_client()
    c.get("/")  # provision a guest + cookie
    return c


def test_create_join_start_and_lobby_state(app):
    host = _guest(app)
    r = host.post("/api/qkd/game", json={"role": "alice"})
    assert r.status_code == 200
    code = r.get_json()["code"]
    assert r.get_json()["role"] == "alice"

    bob = _guest(app)
    assert bob.post(f"/api/qkd/game/{code}/join", json={"role": "bob"}).get_json()["role"] == "bob"
    # taking a claimed role fails
    assert bob.post(f"/api/qkd/game/{code}/join", json={"role": "alice"}).status_code == 409
    # unknown game
    assert bob.post("/api/qkd/game/ZZZZ/join", json={"role": "eve"}).status_code == 404

    state = host.get(f"/api/qkd/game/{code}").get_json()
    assert state["phase"] == "lobby"
    assert state["yourRole"] == "alice"
    seats = {s["role"]: s for s in state["seats"]}
    assert seats["alice"]["kind"] == "human" and seats["bob"]["kind"] == "human"
    assert seats["eve"]["kind"] == "computer"     # unfilled seat is computer

    host.post(f"/api/qkd/game/{code}/start")
    assert host.get(f"/api/qkd/game/{code}").get_json()["phase"] == "alice_setup"


def test_state_hides_secrets_in_lobby(app):
    host = _guest(app)
    code = host.post("/api/qkd/game", json={"role": "eve"}).get_json()["code"]
    body = host.get(f"/api/qkd/game/{code}").get_data(as_text=True)
    assert "aBits" not in body and "aBases" not in body   # never leak raw round data
