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


def test_seat_action_coerces_botnet_fields(app):
    c, code = _solo_game(app, "eve")   # computer Alice auto-plays -> phase eve_move
    st = c.get(f"/api/qkd/game/{code}").get_json()
    assert st["phase"] == "eve_move"
    # out-of-range workers (9999) and out-of-range p (5) must be clamped, not rejected;
    # computer Bob then auto-decides in the same advance(), so the round proceeds cleanly.
    r = c.post(f"/api/qkd/game/{code}/act", json={"action": {"p": 5, "workers": 9999}})
    assert r.status_code == 200
    body = r.get_json()
    assert body["phase"] in ("resolve", "ended")  # advanced, not bricked


def test_alice_file_field_validated_not_bricking(app):
    from quantumbreach.qkd import service
    # a known sample id is accepted and carried through
    assert service._clean_action("alice", {"n": 16, "s": 2, "file": "mission"}) == {"n": 16, "s": 2, "file": "mission"}
    # a path-traversal / junk handle is silently omitted (not raised) so the round is never bricked
    out = service._clean_action("alice", {"n": 16, "s": 2, "file": "../etc/passwd"})
    assert "file" not in out
    assert out == {"n": 16, "s": 2}


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


# ---- multiplayer file-heist + botnet ----
from quantumbreach.qkd.engine import resolve_round
import random


def _play_full_round_human_bob(app, alice_file, eve_workers, decision, eve_p=0):
    """Seat a HUMAN Bob (computer Alice+Eve auto-advance to bob_decision), then override cfg
    so file/workers/key/intercept are deterministic, and let Bob decide. Returns (client, code);
    the client's cookie IS Bob's seat identity, so c.get(state) yields Bob's per-seat view.
    eve_p seeds the resolved round's intercept (eveHit) so scoring paths are controllable."""
    c, code = _solo_game(app, "bob")
    with app.app_context():
        db = get_db()
        g = service._game(db, code)
        cfg = json.loads(g["config"] or "{}")
        cfg["alice"] = {"n": 8, "s": 0, "file": alice_file}          # short key + chosen sample
        cfg["eve"] = {"p": eve_p, "workers": eve_workers}            # intercept + N crack workers
        cfg["result"] = resolve_round({"n": 8, "s": 0, "p": eve_p}, random.Random(1).random)
        service._set_config(db, g["id"], cfg)
        db.commit()
    c.post(f"/api/qkd/game/{code}/act", json={"action": {"decision": decision}})
    return c, code


def _raw_cfg(app, code):
    with app.app_context():
        return json.loads(service._game(get_db(), code)["config"] or "{}")


def test_mp_eve_botnet_cracks_short_key_and_scores(app):
    # Eve intercepts (eveHit) AND deploys 100 workers; Bob keeps anyway -> stolen + heist bonus.
    c, code = _play_full_round_human_bob(app, "mission", eve_workers=100, decision="keep", eve_p=1)
    lr = _raw_cfg(app, code)["lastResult"]          # raw stored form (pre per-seat rewrite)
    assert lr["file"]["cracked"] is True            # 100 workers crack an <=8-bit key
    assert lr["file"]["sample"] == "mission"
    assert lr["perRole"]["eve"] >= 20               # Eve banked the heist bonus on a KEEP


def test_mp_no_workers_no_crack(app):
    c, code = _play_full_round_human_bob(app, "mission", eve_workers=0, decision="keep", eve_p=1)
    assert _raw_cfg(app, code)["lastResult"]["file"]["cracked"] is False


def _bob_file_view(c, code):
    return (c.get(f"/api/qkd/game/{code}").get_json().get("lastResult") or {}).get("file")


def test_mp_bob_sees_file_on_clean_keep(app):
    c, code = _play_full_round_human_bob(app, "mission", eve_workers=0, decision="keep", eve_p=0)
    f = _bob_file_view(c, code)             # clean channel (p=0) + keep -> Bob earns it
    assert f["visible"] is True and f["sample"] == "mission"


def test_mp_bob_scrambled_on_abort(app):
    c, code = _play_full_round_human_bob(app, "mission", eve_workers=0, decision="abort", eve_p=0)
    f = _bob_file_view(c, code)
    assert f["visible"] is False and f["sample"] is None    # no leak of the sample id to a non-earner


def test_mp_eve_sees_file_only_when_cracked(app):
    # Seat a HUMAN Eve; computer Alice auto-plays -> eve_move. Override Alice's cfg to a short
    # key + a sample, then Eve deploys 100 workers; computer Bob auto-keeps a clean channel.
    c, code = _solo_game(app, "eve")
    with app.app_context():
        db = get_db()
        g = service._game(db, code)
        cfg = json.loads(g["config"] or "{}")
        cfg["alice"] = {"n": 8, "s": 0, "file": "mission"}
        service._set_config(db, g["id"], cfg)
        db.commit()
    c.post(f"/api/qkd/game/{code}/act", json={"action": {"p": 0, "workers": 100}})
    f = (c.get(f"/api/qkd/game/{code}").get_json().get("lastResult") or {}).get("file")
    assert f["visible"] is True and f["cracked"] is True and f["sample"] == "mission"
