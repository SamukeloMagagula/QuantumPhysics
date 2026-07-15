from flask import Flask

from .config import Config


def create_app(config_overrides: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)
    if config_overrides:
        app.config.update(config_overrides)

    @app.route("/healthz")
    def healthz():
        return {"status": "ok", "app": "PhantomQ"}

    return app
