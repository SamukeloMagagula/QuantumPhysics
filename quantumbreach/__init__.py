from flask import Flask

from .config import Config


def create_app(config_overrides: dict | None = None) -> Flask:
    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.config.from_object(Config)
    if config_overrides:
        app.config.update(config_overrides)

    from . import db
    db.init_app(app)

    from .auth import bp as auth_bp
    app.register_blueprint(auth_bp)

    from .main import bp as main_bp
    app.register_blueprint(main_bp)

    from .rooms.routes import bp as rooms_bp
    app.register_blueprint(rooms_bp)

    from .auth.service import current_user
    from .db import get_db
    from .progress.service import get_points
    from .progress.ranks import rank_for_points

    @app.context_processor
    def inject_user():
        u = current_user()
        if not u:
            return {"user": None, "user_points": 0, "user_rank": "Script Kiddie"}
        pts = get_points(get_db(), u["id"])
        return {"user": u, "user_points": pts, "user_rank": rank_for_points(pts)}

    @app.route("/healthz")
    def healthz():
        return {"status": "ok", "app": "PhantomQ"}

    return app
