import os
import secrets

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(HERE)


class Config:
    SECRET_KEY = os.environ.get("PHANTOMQ_SECRET_KEY") or secrets.token_hex(32)
    DB_PATH = os.environ.get("PHANTOMQ_DB") or os.path.join(PROJECT_ROOT, "phantomq.db")
    CONTENT_DIR = os.path.join(PROJECT_ROOT, "content")
    PORT = int(os.environ.get("PHANTOMQ_PORT") or 8000)
    SESSION_COOKIE_SAMESITE = "Lax"
