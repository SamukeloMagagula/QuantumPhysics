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

    @app.route("/healthz")
    def healthz():
        return {"status": "ok", "app": "PhantomQ"}

    return app
