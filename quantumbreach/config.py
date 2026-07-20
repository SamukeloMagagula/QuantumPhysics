import os
import secrets

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(HERE)


class Config:
    SECRET_KEY = os.environ.get("PHANTOMQ_SECRET_KEY") or secrets.token_hex(32)
    DB_PATH = os.environ.get("PHANTOMQ_DB") or os.path.join(PROJECT_ROOT, "phantomq.db")
    CONTENT_DIR = os.environ.get("PHANTOMQ_CONTENT") or os.path.join(PROJECT_ROOT, "content")
    QKD_FILE_DIR = os.environ.get("PHANTOMQ_QKD_FILES") or os.path.join(PROJECT_ROOT, "qkd_files")
    PORT = int(os.environ.get("PHANTOMQ_PORT") or 8000)
    SESSION_COOKIE_SAMESITE = "Lax"
    # 1 MB: comfortably above the 256 KB QKD file limit + multipart overhead, so
    # legitimate <=256 KB uploads still reach the friendly "max 256 KB" 400 path
    # in files.save_bytes, while truly huge request bodies get rejected (413)
    # before Flask buffers them into memory.
    MAX_CONTENT_LENGTH = 1024 * 1024
