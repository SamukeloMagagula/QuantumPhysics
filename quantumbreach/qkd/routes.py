import io
import sqlite3
from functools import wraps

from flask import Blueprint, current_app, jsonify, request, send_file

from ..db import get_db
from ..identity import current_user
from . import files, service

bp = Blueprint("qkd", __name__)


def _api(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return jsonify(fn(*args, **kwargs))
        except service.GameError as e:
            return jsonify({"error": e.message}), e.status
        except sqlite3.Error:
            return jsonify({"error": "database is busy, please retry"}), 503
    return wrapper


@bp.route("/api/qkd/game", methods=["POST"])
@_api
def create():
    data = request.get_json(silent=True) or {}
    return service.create_game(get_db(), current_user(), data.get("role"))


@bp.route("/api/qkd/game/<code>/join", methods=["POST"])
@_api
def join(code):
    data = request.get_json(silent=True) or {}
    return service.join_game(get_db(), code, current_user(), data.get("role"))


@bp.route("/api/qkd/game/<code>/start", methods=["POST"])
@_api
def start(code):
    return service.start_game(get_db(), code)


@bp.route("/api/qkd/game/<code>", methods=["GET"])
@_api
def state(code):
    return service.game_state(get_db(), code, current_user())


@bp.route("/api/qkd/game/<code>/act", methods=["POST"])
@_api
def act(code):
    data = request.get_json(silent=True) or {}
    return service.submit_action(get_db(), code, current_user(), data.get("action") or {})


@bp.route("/api/qkd/file", methods=["POST"])
def qkd_file_upload():
    store = current_app.config["QKD_FILE_DIR"]
    try:
        if "file" in request.files:
            f = request.files["file"]
            data = f.read()
            mime = f.mimetype or "application/octet-stream"
            if mime not in files.ALLOWED_MIME:
                mime = "application/octet-stream"
            handle = files.save_bytes(store, mime, data)
            return jsonify({"handle": handle, "mime": mime, "size": len(data)})
        body = request.get_json(silent=True) or {}
        handle = files.save_sample(store, body.get("sample"))
        mime, data = files.load(store, handle)
        return jsonify({"handle": handle, "mime": mime, "size": len(data)})
    except files.FileError as e:
        return jsonify({"error": e.message}), e.status


@bp.route("/api/qkd/file/<handle>", methods=["GET"])
def qkd_file_get(handle):
    store = current_app.config["QKD_FILE_DIR"]
    try:
        mime, data = files.load(store, handle)
    except files.FileError as e:
        return jsonify({"error": e.message}), e.status
    files.cleanup(store)
    resp = send_file(io.BytesIO(data), mimetype=mime, download_name=handle)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp
