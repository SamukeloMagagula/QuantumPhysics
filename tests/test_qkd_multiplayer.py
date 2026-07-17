import json

from quantumbreach.db import get_db
from quantumbreach.qkd import service


def _guest(app):
    c = app.test_client()
    c.get("/")  # provision a guest + cookie
    return c


def _solo_game(app, role):
    """A 1-human game: the human takes `role`, computer plays the other two."""
    c = _guest(app)
    code = c.post("/api/qkd/game", json={"role": role}).get_json()["code"]
    c.post(f"/api/qkd/game/{code}/start")
    return c, code


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


def test_full_round_as_bob_scores_and_reveals(app):
    c, code = _solo_game(app, "bob")
    # computer Alice + Eve auto-submit; we should now be at bob_decision with a QBER visible to Bob
    st = c.get(f"/api/qkd/game/{code}").get_json()
    assert st["phase"] == "bob_decision"
    assert "sampleQBER" in st and st["youAreUpNow"] is True
    c.post(f"/api/qkd/game/{code}/act", json={"action": {"decision": "abort"}})
    st = c.get(f"/api/qkd/game/{code}").get_json()
    assert st["phase"] in ("resolve", "ended")
    assert "lastResult" in st and "bobDecision" in st["lastResult"]


def test_act_is_idempotent(app):
    c, code = _solo_game(app, "bob")
    a = c.post(f"/api/qkd/game/{code}/act", json={"action": {"decision": "keep"}}).get_json()
    b = c.post(f"/api/qkd/game/{code}/act", json={"action": {"decision": "abort"}}).get_json()  # ignored
    assert a["phase"] == b["phase"]  # second submit for the same already-decided phase does not re-resolve


def test_bob_qber_hidden_from_eve(app):
    # Human Eve; computer Bob. Eve must never receive sampleQBER in any state view.
    c = _guest(app)
    code = c.post("/api/qkd/game", json={"role": "eve"}).get_json()["code"]
    c.post(f"/api/qkd/game/{code}/start")
    st = c.get(f"/api/qkd/game/{code}").get_json()
    assert st["phase"] == "eve_move" and "sampleQBER" not in st
    c.post(f"/api/qkd/game/{code}/act", json={"action": {"p": 1.0}})
    body = c.get(f"/api/qkd/game/{code}").get_data(as_text=True)
    # After resolve Eve sees the reveal, but there is no separate Bob-only leak before it.
    assert "sampleQBER" in body  # present inside lastResult at reveal is fine


def test_bad_action_is_rejected_not_bricking(app):
    c, code = _solo_game(app, "bob")   # computer Alice+Eve auto-play -> phase bob_decision
    # A bare string instead of {"decision": ...} must be a clean 400, not a 500, and must not brick the round.
    r = c.post(f"/api/qkd/game/{code}/act", json={"action": "abort"})
    assert r.status_code == 400
    assert c.get(f"/api/qkd/game/{code}").get_json()["phase"] == "bob_decision"  # still Bob's turn
    # A proper decision still advances the round.
    c.post(f"/api/qkd/game/{code}/act", json={"action": {"decision": "abort"}})
    assert c.get(f"/api/qkd/game/{code}").get_json()["phase"] in ("resolve", "ended")


def test_game_end_writes_qkd_score_iff_positive(app):
    # Play a full game as Bob, ABORTing every round (correct whenever computer-Eve intercepted).
    # Assert the exact persistence invariant regardless of the server's randomness:
    #   a qkd_scores row exists  <=>  the human seat finished with a positive score.
    c = _guest(app)
    code = c.post("/api/qkd/game", json={"role": "bob"}).get_json()["code"]
    c.post(f"/api/qkd/game/{code}/start")
    for _ in range(30):  # bounded; ROUNDS is small so this always reaches 'ended'
        st = c.get(f"/api/qkd/game/{code}").get_json()
        if st["phase"] == "ended":
            break
        if st["phase"] == "bob_decision":
            c.post(f"/api/qkd/game/{code}/act", json={"action": {"decision": "abort"}})
        elif st["phase"] == "resolve":
            c.post(f"/api/qkd/game/{code}/act", json={"action": {"next": True}})
    final = c.get(f"/api/qkd/game/{code}").get_json()
    assert final["phase"] == "ended"
    bob_score = next(s["score"] for s in final["scores"] if s["role"] == "bob")
    with app.app_context():
        rows = get_db().execute("SELECT COUNT(*) AS n FROM qkd_scores").fetchone()["n"]
    assert (rows >= 1) == (bob_score > 0)  # written iff the human actually scored


def test_double_resolve_applies_scoring_once(app):
    # A losing thread replaying a stale bob_decision snapshot must not double-apply scoring.
    c = _guest(app)
    code = c.post("/api/qkd/game", json={"role": "bob"}).get_json()["code"]
    c.post(f"/api/qkd/game/{code}/start")
    assert c.get(f"/api/qkd/game/{code}").get_json()["phase"] == "bob_decision"
    with app.app_context():
        db = get_db()
        snap = service._game(db, code)                     # phase == bob_decision
        cfg = json.loads(snap["config"] or "{}")
        service._resolve_scoring(db, snap, cfg, "keep")     # the winner
        first = {s["role"]: s["score"] for s in service._seats(db, snap["id"])}
        service._resolve_scoring(db, snap, cfg, "keep")     # stale replay -> guarded no-op
        second = {s["role"]: s["score"] for s in service._seats(db, snap["id"])}
    assert first == second   # scoring applied exactly once, not doubled


def test_double_next_at_final_round_writes_score_once(app):
    # A losing thread replaying a stale final-round resolve must not insert a 2nd qkd_scores row.
    c = _guest(app)
    code = c.post("/api/qkd/game", json={"role": "bob"}).get_json()["code"]
    c.post(f"/api/qkd/game/{code}/start")
    for _ in range(30):
        st = c.get(f"/api/qkd/game/{code}").get_json()
        if st["phase"] == "resolve" and st["round"] >= service.ROUNDS:
            break
        if st["phase"] == "bob_decision":
            c.post(f"/api/qkd/game/{code}/act", json={"action": {"decision": "abort"}})
        elif st["phase"] == "resolve":
            c.post(f"/api/qkd/game/{code}/act", json={"action": {"next": True}})
        elif st["phase"] == "ended":
            break
    with app.app_context():
        db = get_db()
        snap = service._game(db, code)
        assert snap["phase"] == "resolve" and snap["round"] >= service.ROUNDS
        service._next_round(db, snap)   # ends the game, posts scores once
        service._next_round(db, snap)   # stale replay -> guarded no-op
        rows = db.execute("SELECT COUNT(*) AS n FROM qkd_scores").fetchone()["n"]
        bob = next(s for s in service._seats(db, snap["id"]) if s["role"] == "bob")
    assert rows <= 1                       # never a duplicate row
    assert (rows == 1) == (bob["score"] > 0)
