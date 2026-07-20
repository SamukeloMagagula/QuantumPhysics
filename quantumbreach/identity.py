import secrets
import sqlite3

from flask import current_app, g, request
from itsdangerous import URLSafeSerializer, BadSignature, BadData

from .db import get_db

COOKIE = "guest_id"


def _serializer():
    return URLSafeSerializer(current_app.config["SECRET_KEY"], salt="phantomq-guest")


def _new_handle():
    return "operative_" + secrets.token_hex(3)


def _create_guest(db):
    for _ in range(5):
        handle = _new_handle()
        try:
            cur = db.execute(
                "INSERT INTO users (username, password_hash, display_name, is_guest) "
                "VALUES (?, '', ?, 1)", (handle, handle))
            break
        except sqlite3.IntegrityError:
            continue
    else:
        raise RuntimeError("could not allocate guest handle")
    db.execute("INSERT OR IGNORE INTO user_stats (user_id, points) VALUES (?, 0)",
               (cur.lastrowid,))
    db.commit()
    return cur.lastrowid


def _get(db, uid):
    return db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()


def current_user():
    if "user" in g:
        return g.user
    db = get_db()
    raw = request.cookies.get(COOKIE)
    row = None
    if raw:
        try:
            uid = _serializer().loads(raw)
            row = _get(db, int(uid))
        except (BadSignature, BadData, ValueError, TypeError):
            row = None
    if row is None:
        uid = _create_guest(db)
        row = _get(db, uid)
        g.guest_cookie = _serializer().dumps(uid)  # signal to set the cookie on the response
    g.user = row
    return row


def peek_user():
    """Like current_user(), but never provisions a guest. Returns the cached/cookie
    user if one already exists, else None. Used by contexts (e.g. the global
    template context processor) that run on every render — including anonymous
    pages like landing — and must not silently create a guest + Set-Cookie."""
    if "user" in g:
        return g.user
    raw = request.cookies.get(COOKIE)
    if not raw:
        return None
    db = get_db()
    try:
        uid = _serializer().loads(raw)
        return _get(db, int(uid))
    except (BadSignature, BadData, ValueError, TypeError):
        return None


def rename(db, user_id, new_name):
    if not isinstance(new_name, str):
        return None
    name = new_name.strip()
    if not name or len(name) > 40:
        return None
    db.execute("UPDATE users SET display_name=? WHERE id=?", (name, user_id))
    db.commit()
    return name


APP_PREFIXES = ("/dashboard", "/rooms", "/terminal", "/qkd", "/leaderboard", "/api")


def init_app(app):
    @app.before_request
    def _ensure_guest():
        path = request.path
        if path.startswith("/static/") or path == "/" or path == "/healthz":
            return
        if path.startswith(APP_PREFIXES):
            current_user()

    @app.after_request
    def _persist_guest(resp):
        cookie = g.pop("guest_cookie", None)
        if cookie is not None:
            resp.set_cookie(COOKIE, cookie, max_age=60 * 60 * 24 * 365,
                            samesite="Lax", httponly=True)
        return resp

    from flask import Blueprint, jsonify, request as req
    bp = Blueprint("identity", __name__)

    @bp.route("/api/rename", methods=["POST"])
    def api_rename():
        u = current_user()
        data = req.get_json(silent=True) or {}
        name = rename(get_db(), u["id"], data.get("name"))
        if name is None:
            return jsonify({"error": "Name must be 1-40 characters."}), 400
        return jsonify({"displayName": name})

    app.register_blueprint(bp)
