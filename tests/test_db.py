from quantumbreach.db import get_db


def test_schema_tables_exist(app):
    with app.app_context():
        db = get_db()
        names = {r["name"] for r in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    for t in ["users", "user_stats", "room_progress",
              "question_submissions", "badges", "user_badges"]:
        assert t in names


def test_badges_seeded(app):
    with app.app_context():
        db = get_db()
        count = db.execute("SELECT COUNT(*) AS c FROM badges").fetchone()["c"]
    assert count >= 2
