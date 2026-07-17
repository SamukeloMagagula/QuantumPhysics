import json
import secrets

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
        db.execute("UPDATE qkd_games SET phase='alice_setup', round=1, updated_at=CURRENT_TIMESTAMP WHERE id=?", (g["id"],))
        db.execute("UPDATE qkd_game_seats SET action=NULL WHERE game_id=?", (g["id"],))
        db.commit()
        advance(db, _game(db, code))  # no-op placeholder in Task 4; the real machine lands in Task 5
    return game_state(db, code, None)


def game_state(db, code, user):
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


# Placeholder so start_game's import resolves before Task 5 lands its real body.
def advance(db, game):  # replaced/expanded in Task 5
    return
