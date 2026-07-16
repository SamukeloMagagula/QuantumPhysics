import os
import sqlite3

from flask import current_app, g

BADGE_SEED = [
    ("first-clear", "First Blood", "Complete your first room.", "🩸"),
    ("symmetric-path", "Symmetric Specialist", "Complete every room in the Symmetric path.", "🔑"),
    ("qkd-operative", "Quantum Operative", "Win a round of Quantum Intercept.", "🛰️"),
]


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DB_PATH"])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(e=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db(app):
    schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")
    with open(schema_path, "r", encoding="utf-8") as f:
        schema = f.read()
    with app.app_context():
        db = sqlite3.connect(app.config["DB_PATH"])
        db.executescript(schema)
        for stmt in ("ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0",):
            try:
                db.execute(stmt)
            except sqlite3.OperationalError:
                pass
        db.executemany(
            "INSERT OR IGNORE INTO badges (id, name, description, icon) VALUES (?,?,?,?)",
            BADGE_SEED,
        )
        db.commit()
        db.close()


def init_app(app):
    app.teardown_appcontext(close_db)
    init_db(app)
