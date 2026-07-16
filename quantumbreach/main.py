from flask import Blueprint, current_app, jsonify, render_template, request

from .identity import current_user
from .db import get_db
from .progress import service as progress
from .rooms.loader import list_paths

bp = Blueprint("main", __name__)


@bp.route("/")
def home():
    content_dir = current_app.config["CONTENT_DIR"]
    paths = list_paths(content_dir)
    user = current_user()
    completed = set()
    if user:
        rows = get_db().execute(
            "SELECT room_id FROM room_progress WHERE user_id=?", (user["id"],)).fetchall()
        completed = {r["room_id"] for r in rows}
    path_cards = []
    for p in paths:
        rooms = p.rooms(content_dir)
        done = sum(1 for r in rooms if r.id in completed)
        path_cards.append({"path": p, "rooms": rooms, "done": done, "total": len(rooms)})
    return render_template("home.html", path_cards=path_cards, user=user)


@bp.route("/leaderboard")
def leaderboard():
    board = progress.leaderboard(get_db(), limit=10)
    qkd = get_db().execute(
        "SELECT COALESCE(u.display_name,u.username) AS name, MAX(s.score) AS score "
        "FROM qkd_scores s JOIN users u ON u.id=s.user_id GROUP BY s.user_id "
        "ORDER BY score DESC LIMIT 10").fetchall()
    return render_template("leaderboard.html", board=board, qkd=[dict(r) for r in qkd], user=current_user())


@bp.route("/terminal")
def terminal():
    return render_template("terminal.html", user=current_user())


@bp.route("/qkd")
def qkd():
    return render_template("qkd.html", user=current_user())


@bp.route("/api/rooms")
def api_rooms():
    cd = current_app.config["CONTENT_DIR"]
    rooms = []
    for p in list_paths(cd):
        for r in p.rooms(cd):
            rooms.append({"id": r.id, "title": r.title})
    return jsonify({"rooms": rooms})


@bp.route("/api/qkd/score", methods=["POST"])
def qkd_score():
    u = current_user()
    data = request.get_json(silent=True) or {}
    try:
        score = int(data.get("score"))
    except (TypeError, ValueError):
        score = -1
    if score < 0 or score > 100000:
        return jsonify({"error": "bad score"}), 400
    db = get_db()
    db.execute("INSERT INTO qkd_scores (user_id, score) VALUES (?,?)", (u["id"], score))
    new_badge = False
    if score >= 1:
        new_badge = progress._award_badge(db, u["id"], "qkd-operative") is not None
    db.commit()
    best = db.execute("SELECT MAX(score) AS b FROM qkd_scores WHERE user_id=?", (u["id"],)).fetchone()["b"]
    return jsonify({"best": best or 0, "newBadge": new_badge})


@bp.route("/api/qkd/leaderboard")
def qkd_leaderboard():
    rows = get_db().execute(
        "SELECT COALESCE(u.display_name,u.username) AS name, MAX(s.score) AS score "
        "FROM qkd_scores s JOIN users u ON u.id=s.user_id "
        "GROUP BY s.user_id ORDER BY score DESC LIMIT 10").fetchall()
    return jsonify({"top": [dict(r) for r in rows]})
