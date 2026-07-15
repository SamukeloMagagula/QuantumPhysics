import os

from quantumbreach.db import get_db
from quantumbreach.auth.service import create_user
from quantumbreach.progress.ranks import rank_for_points
from quantumbreach.progress import service
from quantumbreach.rooms.loader import load_room

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "content")


def test_rank_thresholds():
    assert rank_for_points(0) == "Script Kiddie"
    assert rank_for_points(49) == "Script Kiddie"
    assert rank_for_points(50) == "Codebreaker"
    assert rank_for_points(1000) == "Quantum Operative"


def test_record_answer_awards_points_once_and_completes_room(app):
    with app.app_context():
        db = get_db()
        uid = create_user(db, "eve", "pw")
        room = load_room("demo-room", FIXTURES)
        q = room.tasks[0].questions[0]

        r1 = service.record_answer(db, uid, room, "intro", q, correct=True)
        assert r1["correct"] and not r1["alreadySolved"]
        assert r1["pointsAwarded"] == 10
        assert r1["totalPoints"] == 10
        assert r1["roomComplete"] is True
        assert any(b["id"] == "first-clear" for b in r1["newBadges"])

        # Re-answering the same question awards nothing.
        r2 = service.record_answer(db, uid, room, "intro", q, correct=True)
        assert r2["alreadySolved"] is True
        assert r2["pointsAwarded"] == 0
        assert r2["totalPoints"] == 10


def test_leaderboard_orders_by_points(app):
    with app.app_context():
        db = get_db()
        a = create_user(db, "a", "pw")
        b = create_user(db, "b", "pw")
        db.execute("UPDATE user_stats SET points=30 WHERE user_id=?", (a,))
        db.execute("UPDATE user_stats SET points=90 WHERE user_id=?", (b,))
        db.commit()
        board = service.leaderboard(db, limit=10)
    assert [row["username"] for row in board[:2]] == ["b", "a"]
    assert board[0]["rank"] == "Codebreaker"
