import os

from flask import current_app

from .ranks import rank_for_points


def get_points(db, user_id) -> int:
    row = db.execute("SELECT points FROM user_stats WHERE user_id=?", (user_id,)).fetchone()
    return row["points"] if row else 0


def answered_question_ids(db, user_id, room_id) -> set:
    rows = db.execute(
        "SELECT DISTINCT question_id FROM question_submissions "
        "WHERE user_id=? AND room_id=? AND correct=1",
        (user_id, room_id),
    ).fetchall()
    return {r["question_id"] for r in rows}


def _room_complete(db, user_id, room) -> bool:
    answered = answered_question_ids(db, user_id, room.id)
    ids = set(room.question_ids)
    return bool(ids) and ids.issubset(answered)


def _award_badge(db, user_id, badge_id) -> dict | None:
    exists = db.execute(
        "SELECT 1 FROM user_badges WHERE user_id=? AND badge_id=?",
        (user_id, badge_id)).fetchone()
    if exists:
        return None
    db.execute("INSERT INTO user_badges (user_id, badge_id) VALUES (?,?)",
               (user_id, badge_id))
    b = db.execute("SELECT id, name, icon FROM badges WHERE id=?", (badge_id,)).fetchone()
    return dict(b) if b else None


def _check_path_badges(db, user_id) -> list:
    """Award symmetric-path badge if every room in that path is complete."""
    from ..rooms.loader import load_path, load_room
    content_dir = current_app.config["CONTENT_DIR"]
    awarded = []
    path_file = os.path.join(content_dir, "paths", "symmetric.yaml")
    if not os.path.exists(path_file):
        return awarded
    path = load_path("symmetric", content_dir)
    all_done = True
    for rid in path.room_ids:
        room = load_room(rid, content_dir)
        if not _room_complete(db, user_id, room):
            all_done = False
            break
    if all_done and path.room_ids:
        b = _award_badge(db, user_id, "symmetric-path")
        if b:
            awarded.append(b)
    return awarded


def record_answer(db, user_id, room, task_id, question, correct) -> dict:
    already = question.id in answered_question_ids(db, user_id, room.id)
    db.execute(
        "INSERT INTO question_submissions (user_id, room_id, question_id, correct) "
        "VALUES (?,?,?,?)",
        (user_id, room.id, question.id, 1 if correct else 0),
    )
    points_awarded = 0
    new_badges = []
    room_complete = False
    if correct and not already:
        points_awarded = question.points
        db.execute("UPDATE user_stats SET points = points + ? WHERE user_id=?",
                   (points_awarded, user_id))
        if _room_complete(db, user_id, room):
            room_complete = True
            newly = db.execute(
                "SELECT 1 FROM room_progress WHERE user_id=? AND room_id=?",
                (user_id, room.id)).fetchone() is None
            db.execute(
                "INSERT OR IGNORE INTO room_progress (user_id, room_id) VALUES (?,?)",
                (user_id, room.id))
            if newly:
                first = _award_badge(db, user_id, "first-clear")
                if first:
                    new_badges.append(first)
                new_badges.extend(_check_path_badges(db, user_id))
    db.commit()
    total = get_points(db, user_id)
    return {
        "correct": bool(correct),
        "alreadySolved": bool(already),
        "pointsAwarded": points_awarded,
        "totalPoints": total,
        "rank": rank_for_points(total),
        "roomComplete": room_complete,
        "newBadges": new_badges,
    }


def leaderboard(db, limit=10) -> list:
    rows = db.execute(
        "SELECT COALESCE(u.display_name, u.username) AS username, s.points AS points "
        "FROM user_stats s JOIN users u ON u.id = s.user_id "
        "WHERE s.points > 0 ORDER BY s.points DESC, u.username LIMIT ?",
        (limit,)).fetchall()
    return [{"username": r["username"], "points": r["points"],
             "rank": rank_for_points(r["points"])} for r in rows]


def qkd_leaderboard(db, limit=10) -> list:
    rows = db.execute(
        "SELECT COALESCE(u.display_name, u.username) AS name, MAX(s.score) AS score "
        "FROM qkd_scores s JOIN users u ON u.id = s.user_id "
        "GROUP BY s.user_id ORDER BY score DESC LIMIT ?",
        (limit,)).fetchall()
    return [dict(r) for r in rows]


def user_badges(db, user_id) -> list:
    rows = db.execute(
        "SELECT b.id, b.name, b.icon FROM user_badges ub "
        "JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id=? ORDER BY ub.awarded_at",
        (user_id,)).fetchall()
    return [dict(r) for r in rows]
