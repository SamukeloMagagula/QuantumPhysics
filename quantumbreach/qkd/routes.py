from flask import Blueprint, jsonify, request

from ..db import get_db
from ..identity import current_user
from . import service

bp = Blueprint("qkd", __name__)


def _err(e):
    return jsonify({"error": e.message}), e.status


@bp.route("/api/qkd/game", methods=["POST"])
def create():
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(service.create_game(get_db(), current_user(), data.get("role")))
    except service.GameError as e:
        return _err(e)


@bp.route("/api/qkd/game/<code>/join", methods=["POST"])
def join(code):
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(service.join_game(get_db(), code, current_user(), data.get("role")))
    except service.GameError as e:
        return _err(e)


@bp.route("/api/qkd/game/<code>/start", methods=["POST"])
def start(code):
    try:
        return jsonify(service.start_game(get_db(), code))
    except service.GameError as e:
        return _err(e)


@bp.route("/api/qkd/game/<code>", methods=["GET"])
def state(code):
    try:
        return jsonify(service.game_state(get_db(), code, current_user()))
    except service.GameError as e:
        return _err(e)
