import json
import random
import secrets

from .engine import resolve_round, score_round, computer_strategy
from . import botnet, files
from ..progress.service import _award_badge

ROLES = ("alice", "bob", "eve")
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous chars


class GameError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def _new_code(db):
    for _ in range(20):
        code = "".join(secrets.choice(_ALPHABET) for _ in range(4))
        if not db.execute("SELECT 1 FROM qkd_games WHERE code=?", (code,)).fetchone():
            return code
    raise GameError("could not allocate a game code", 500)


def _game(db, code):
    g = db.execute("SELECT * FROM qkd_games WHERE code=?", (code.upper(),)).fetchone()
    if not g:
        raise GameError("no such game", 404)
    return g


def _seats(db, game_id):
    return db.execute("SELECT * FROM qkd_game_seats WHERE game_id=? ORDER BY role", (game_id,)).fetchall()


def _seat_for_user(db, game_id, user_id):
    return db.execute("SELECT * FROM qkd_game_seats WHERE game_id=? AND user_id=?", (game_id, user_id)).fetchone()


def create_game(db, user, role):
    if role not in ROLES:
        raise GameError("bad role")
    code = _new_code(db)
    cur = db.execute("INSERT INTO qkd_games (code, phase, round) VALUES (?, 'lobby', 0)", (code,))
    gid = cur.lastrowid
    for r in ROLES:
        if r == role:
            db.execute("INSERT INTO qkd_game_seats (game_id, role, kind, user_id, display_name) VALUES (?,?, 'human', ?, ?)",
                       (gid, r, user["id"], user["display_name"]))
        else:
            db.execute("INSERT INTO qkd_game_seats (game_id, role, kind, display_name) VALUES (?,?, 'computer', 'Computer')", (gid, r))
    db.commit()
    return {"code": code, "role": role}


def join_game(db, code, user, role):
    if role not in ROLES:
        raise GameError("bad role")
    g = _game(db, code)
    if g["phase"] != "lobby":
        raise GameError("game already started", 409)
    if _seat_for_user(db, g["id"], user["id"]):
        raise GameError("already seated in this game", 409)
    cur = db.execute(
        "UPDATE qkd_game_seats SET kind='human', user_id=?, display_name=? "
        "WHERE game_id=? AND role=? AND kind='computer'",
        (user["id"], user["display_name"], g["id"], role))
    if cur.rowcount == 0:
        raise GameError("role already taken", 409)
    db.commit()
    return {"code": g["code"], "role": role}


def start_game(db, code):
    g = _game(db, code)
    if g["phase"] == "lobby":
        cur = db.execute(
            "UPDATE qkd_games SET phase='alice_setup', round=1, updated_at=CURRENT_TIMESTAMP "
            "WHERE id=? AND phase='lobby'", (g["id"],))
        if cur.rowcount == 1:
            db.execute("UPDATE qkd_game_seats SET action=NULL WHERE game_id=?", (g["id"],))
            db.commit()
            advance(db, _game(db, code))
        else:
            db.commit()
    return game_state(db, code, None)


def game_state(db, code, user):
    g = _game(db, code)
    _maybe_timeout(db, g)
    g = _game(db, code)
    seats = _seats(db, g["id"])
    your = _seat_for_user(db, g["id"], user["id"]) if user else None
    your_role = your["role"] if your else None
    cfg = json.loads(g["config"] or "{}")
    view = {
        "code": g["code"], "phase": g["phase"], "round": g["round"],
        "yourRole": your_role,
        "seats": [{"role": s["role"], "kind": s["kind"], "name": s["display_name"],
                   "submitted": s["action"] is not None} for s in seats],
        "scores": [{"role": s["role"], "name": s["display_name"], "score": s["score"]} for s in seats],
        "youAreUpNow": _is_up(g["phase"], your_role, seats),
    }
    # Bob sees the sample QBER only during his decision phase.
    if g["phase"] == "bob_decision" and your_role == "bob" and "result" in cfg:
        view["sampleQBER"] = cfg["result"]["sampleQBER"]
    # Full reveal only at resolve/ended.
    if g["phase"] in ("resolve", "ended") and "lastResult" in cfg:
        view["lastResult"] = cfg["lastResult"]
    return view


def _is_up(phase, role, seats):
    if role is None:
        return False
    need = {"alice_setup": "alice", "eve_move": "eve", "bob_decision": "bob"}.get(phase)
    if need and need == role:
        by_role = {s["role"]: s for s in seats}
        return by_role[role]["action"] is None
    return phase == "resolve"  # any human may advance to the next round


ROUNDS = 3          # rounds per game (tunable)
TIMEOUT_SECONDS = 60


def _set_config(db, game_id, cfg):
    db.execute("UPDATE qkd_games SET config=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
               (json.dumps(cfg), game_id))


def _seat(db, game_id, role):
    return db.execute("SELECT * FROM qkd_game_seats WHERE game_id=? AND role=?", (game_id, role)).fetchone()


def _claim_action(db, game_id, role, action):
    """Atomically set a seat's action only if still unset. Returns rows changed (1=claimed, 0=already set)."""
    cur = db.execute(
        "UPDATE qkd_game_seats SET action=? WHERE game_id=? AND role=? AND action IS NULL",
        (json.dumps(action), game_id, role))
    return cur.rowcount


def _clean_action(role, action):
    """Validate + coerce a human seat's action for its phase; GameError(400) on bad shape."""
    try:
        if role == "alice":
            n = max(8, min(64, int(action.get("n", 24))))
            s = max(0, min(n, int(action.get("s", 6))))
            out = {"n": n, "s": s}
            fh = action.get("file")
            if isinstance(fh, str) and (fh in ("mission", "codes", "photo") or (len(fh) <= 32 and fh.isalnum())):
                out["file"] = fh
            return out
        if role == "eve":
            w = max(0, min(100, int(action.get("workers", 0) or 0)))
            return {"p": min(1.0, max(0.0, float(action.get("p", 0) or 0))), "workers": w}
        return {"decision": "abort" if action.get("decision") == "abort" else "keep"}
    except (TypeError, ValueError):
        raise GameError("bad action", 400)


def submit_action(db, code, user, action):
    g = _game(db, code)
    seat = _seat_for_user(db, g["id"], user["id"])
    if not seat:
        raise GameError("not seated in this game", 403)
    if not isinstance(action, dict):
        raise GameError("bad action", 400)
    role = seat["role"]
    phase = g["phase"]
    if phase == "resolve":
        if action.get("next"):
            _next_round(db, g)
        return game_state(db, code, user)
    expected = {"alice_setup": "alice", "eve_move": "eve", "bob_decision": "bob"}.get(phase)
    if expected != role:
        raise GameError("not your turn", 409)
    if seat["action"] is not None:
        return game_state(db, code, user)  # idempotent: already submitted
    action = _clean_action(expected, action)
    _claim_action(db, g["id"], role, action)  # atomic; a concurrent double-submit is a no-op for the loser
    db.commit()
    advance(db, _game(db, code))
    return game_state(db, code, user)


def _computer_public(cfg, phase):
    if phase == "bob_decision" and "result" in cfg:
        return {"sampleQBER": cfg["result"]["sampleQBER"]}
    return {}


def advance(db, game):
    """Drive the phase machine as far as computer seats allow, resolving when Alice+Eve are in.

    Every phase transition is a guarded UPDATE (WHERE phase=<current>) so that under
    Waitress's thread pool at most one request performs each non-idempotent step; a
    loser re-reads the advanced state and moves on.
    """
    gid = game["id"]
    for _ in range(6):  # bounded: at most a few transitions per call
        g = _game(db, game["code"])
        phase = g["phase"]
        cfg = json.loads(g["config"] or "{}")
        if phase in ("lobby", "resolve", "ended"):
            return
        expected = {"alice_setup": "alice", "eve_move": "eve", "bob_decision": "bob"}[phase]
        seat = _seat(db, gid, expected)
        if seat["action"] is None:
            if seat["kind"] == "computer":
                _claim_action(db, gid, expected,
                              computer_strategy(expected, _computer_public(cfg, phase), random.random))
                db.commit()  # winner or loser, the committed action is read back below
            else:
                return  # waiting on a human
        act = json.loads(_seat(db, gid, expected)["action"])
        if phase == "alice_setup":
            cfg["alice"] = {"n": int(act.get("n", 24)), "s": int(act.get("s", 6))}
            if act.get("file"):
                cfg["alice"]["file"] = act["file"]
            cur = db.execute(
                "UPDATE qkd_games SET config=?, phase='eve_move', updated_at=CURRENT_TIMESTAMP "
                "WHERE id=? AND phase='alice_setup'", (json.dumps(cfg), gid))
            db.commit()
            if cur.rowcount == 0:
                continue  # another request already advanced this phase
        elif phase == "eve_move":
            cfg["eve"] = {"p": float(act.get("p", 0) or 0), "workers": int(act.get("workers", 0) or 0)}
            result = resolve_round({"n": cfg["alice"]["n"], "s": cfg["alice"]["s"], "p": cfg["eve"]["p"]}, random.random)
            cfg["result"] = result
            cur = db.execute(
                "UPDATE qkd_games SET config=?, phase='bob_decision', updated_at=CURRENT_TIMESTAMP "
                "WHERE id=? AND phase='eve_move'", (json.dumps(cfg), gid))
            db.commit()
            if cur.rowcount == 0:
                continue  # lost the race; our locally-computed result is discarded
        elif phase == "bob_decision":
            decision = "abort" if act.get("decision") == "abort" else "keep"
            _resolve_scoring(db, g, cfg, decision)
            return


def _resolve_scoring(db, g, cfg, decision):
    gid = g["id"]
    # Atomic claim: only the request that flips bob_decision -> resolve applies scoring.
    cur = db.execute(
        "UPDATE qkd_games SET phase='resolve', updated_at=CURRENT_TIMESTAMP "
        "WHERE id=? AND phase='bob_decision'", (gid,))
    if cur.rowcount == 0:
        db.commit()
        return  # another request already resolved this round
    result = cfg["result"]
    eve_workers = int((cfg.get("eve") or {}).get("workers", 0) or 0)
    final_key = int(result.get("finalKey") or 0)
    file_cracked = eve_workers > 0 and botnet.crackable_within(final_key, eve_workers, botnet.ROUND_WINDOW)
    result["fileCracked"] = file_cracked   # engine.score_round adds HEIST_BONUS on KEEP when set
    _sample = (cfg.get("alice") or {}).get("file") or "mission"
    _mime = files.SAMPLES.get(_sample, {}).get("mime")
    if _mime is None:
        _sample = None  # unknown/stray handle -> no payload
    per_role = {}
    for role in ROLES:
        sc = score_round(role, result, decision)
        per_role[role] = sc["delta"]
        db.execute("UPDATE qkd_game_seats SET score=score+? WHERE game_id=? AND role=?", (sc["delta"], gid, role))
    cfg["lastResult"] = {
        "eveHit": result["eveHit"], "sampleQBER": result["sampleQBER"], "finalKey": result["finalKey"],
        "stolen": result["stolen"], "sifted": result["sifted"], "bobDecision": decision,
        "aliceConfig": cfg["alice"], "eveConfig": cfg["eve"], "perRole": per_role, "round": g["round"],
        "file": {"sample": _sample, "mime": _mime, "cracked": file_cracked},
    }
    _set_config(db, gid, cfg)
    db.commit()


def _next_round(db, g):
    gid = g["id"]
    fresh = _game(db, g["code"])
    if fresh["phase"] != "resolve":
        return  # already advanced by another request
    if fresh["round"] >= ROUNDS:
        _end_game(db, fresh)
        return
    # Atomic claim: only one request advances resolve -> next round.
    cur = db.execute(
        "UPDATE qkd_games SET round=round+1, phase='alice_setup', updated_at=CURRENT_TIMESTAMP "
        "WHERE id=? AND phase='resolve'", (gid,))
    if cur.rowcount == 0:
        db.commit()
        return  # lost the race
    db.execute("UPDATE qkd_game_seats SET action=NULL WHERE game_id=?", (gid,))
    cfg = json.loads(fresh["config"] or "{}")
    for k in ("alice", "eve", "result"):
        cfg.pop(k, None)
    _set_config(db, gid, cfg)
    db.commit()
    advance(db, _game(db, g["code"]))


def _end_game(db, g):
    # Atomic claim: only one request transitions resolve -> ended, so scores post exactly once.
    cur = db.execute(
        "UPDATE qkd_games SET phase='ended', updated_at=CURRENT_TIMESTAMP "
        "WHERE id=? AND phase='resolve'", (g["id"],))
    if cur.rowcount == 0:
        db.commit()
        return  # another request already ended the game
    for s in _seats(db, g["id"]):
        if s["kind"] == "human" and s["user_id"] is not None and s["score"] > 0:
            db.execute("INSERT INTO qkd_scores (user_id, score) VALUES (?,?)", (s["user_id"], s["score"]))
            _award_badge(db, s["user_id"], "qkd-operative")
    db.commit()


def _maybe_timeout(db, g):
    if g["phase"] not in ("alice_setup", "eve_move", "bob_decision"):
        return
    stale = db.execute(
        "SELECT (strftime('%s','now') - strftime('%s', updated_at)) AS age FROM qkd_games WHERE id=?",
        (g["id"],)).fetchone()["age"]
    if stale is not None and stale > TIMEOUT_SECONDS:
        expected = {"alice_setup": "alice", "eve_move": "eve", "bob_decision": "bob"}[g["phase"]]
        seat = _seat(db, g["id"], expected)
        if seat["kind"] == "human" and seat["action"] is None:
            cfg = json.loads(g["config"] or "{}")
            claimed = _claim_action(db, g["id"], expected,
                                    computer_strategy(expected, _computer_public(cfg, g["phase"]), random.random))
            db.commit()
            if claimed:  # only the request that actually took over drives the machine
                advance(db, _game(db, g["code"]))
