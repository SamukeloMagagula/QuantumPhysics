import time

from flask import (Blueprint, abort, current_app, jsonify, render_template,
                   request)

from ..auth.service import current_user, login_required
from ..db import get_db
from ..progress import service as progress
from ..widgets import is_widget, script_for
from .answers import check_answer
from .loader import find_question, load_path, load_room

bp = Blueprint("rooms", __name__)

# In-memory sliding-window rate limiter: {(user_id, question_id): [timestamps]}
_ATTEMPTS: dict = {}
_WINDOW = 60.0
_MAX = 12


def _rate_limited(user_id, question_id) -> bool:
    now = time.time()
    key = (user_id, question_id)
    hits = [t for t in _ATTEMPTS.get(key, []) if now - t < _WINDOW]
    hits.append(now)
    _ATTEMPTS[key] = hits
    return len(hits) > _MAX


def _load_room_or_404(room_id):
    content_dir = current_app.config["CONTENT_DIR"]
    try:
        return load_room(room_id, content_dir)
    except FileNotFoundError:
        abort(404)


@bp.route("/paths/<path_id>")
def path_view(path_id):
    content_dir = current_app.config["CONTENT_DIR"]
    try:
        path = load_path(path_id, content_dir)
    except FileNotFoundError:
        abort(404)
    rooms = path.rooms(content_dir)
    user = current_user()
    completed = set()
    if user:
        rows = get_db().execute(
            "SELECT room_id FROM room_progress WHERE user_id=?", (user["id"],)).fetchall()
        completed = {r["room_id"] for r in rows}
    return render_template("path.html", path=path, rooms=rooms,
                           completed=completed, user=user)


@bp.route("/rooms/<room_id>")
@login_required
def room_view(room_id):
    room = _load_room_or_404(room_id)
    user = current_user()
    answered = progress.answered_question_ids(get_db(), user["id"], room.id)
    return render_template("room.html", room=room, answered=answered, user=user,
                           is_widget=is_widget, script_for=script_for)


@bp.route("/rooms/<room_id>/answer", methods=["POST"])
@login_required
def submit_answer(room_id):
    room = _load_room_or_404(room_id)
    user = current_user()
    data = request.get_json(silent=True) or {}
    task_id = data.get("taskId")
    question_id = data.get("questionId")
    submitted = data.get("answer", "")
    question = find_question(room, task_id, question_id)
    if question is None:
        return jsonify({"error": "Unknown question."}), 404
    if _rate_limited(user["id"], question_id):
        return jsonify({"error": "Too many attempts. Wait a moment."}), 429
    correct = check_answer(
        submitted=submitted, stored=question.answer, answer_type=question.answer_type,
        case_insensitive=question.case_insensitive, trim=question.trim)
    result = progress.record_answer(get_db(), user["id"], room, task_id, question, correct)
    return jsonify(result)
