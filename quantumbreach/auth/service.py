import functools

from flask import g, redirect, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from ..db import get_db


def create_user(db, username, password, display_name=None) -> int:
    cur = db.execute(
        "INSERT INTO users (username, password_hash, display_name) VALUES (?,?,?)",
        (username, generate_password_hash(password), display_name or username),
    )
    db.execute("INSERT OR IGNORE INTO user_stats (user_id, points) VALUES (?, 0)",
               (cur.lastrowid,))
    db.commit()
    return cur.lastrowid


def verify_user(db, username, password):
    row = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if row and check_password_hash(row["password_hash"], password):
        return row
    return None


def get_user(db, user_id):
    return db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def current_user():
    if "user" not in g:
        uid = session.get("user_id")
        g.user = get_user(get_db(), uid) if uid is not None else None
    return g.user


def login_required(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        if current_user() is None:
            return redirect(url_for("auth.login"))
        return view(*args, **kwargs)
    return wrapped
