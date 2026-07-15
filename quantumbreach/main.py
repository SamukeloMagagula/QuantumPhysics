from flask import Blueprint, current_app, render_template

from .auth.service import current_user
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
    return render_template("leaderboard.html", board=board, user=current_user())
