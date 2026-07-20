import os
import secrets
import time

MAX_BYTES = 262144  # 256 KB
ALLOWED_MIME = {"text/plain", "image/png", "image/jpeg", "application/pdf", "application/octet-stream"}

SAMPLES = {
    "mission": {"mime": "text/plain", "file": "mission.txt"},
    "codes": {"mime": "text/plain", "file": "codes.txt"},
    "photo": {"mime": "image/png", "file": "photo.png"},
}


class FileError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def _samples_dir():
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static", "qkd-samples")


def _ensure(store_dir):
    os.makedirs(store_dir, exist_ok=True)


def save_bytes(store_dir, mime, data):
    if mime not in ALLOWED_MIME:
        raise FileError("unsupported file type")
    if len(data) > MAX_BYTES:
        raise FileError("file too large (max 256 KB)")
    _ensure(store_dir)
    handle = secrets.token_hex(8)
    with open(os.path.join(store_dir, handle), "wb") as f:
        f.write(data)
    with open(os.path.join(store_dir, handle + ".mime"), "w", encoding="utf-8") as f:
        f.write(mime)
    return handle


def save_sample(store_dir, sample_id):
    s = SAMPLES.get(sample_id)
    if not s:
        raise FileError("unknown sample")
    with open(os.path.join(_samples_dir(), s["file"]), "rb") as f:
        data = f.read()
    return save_bytes(store_dir, s["mime"], data)


def load(store_dir, handle):
    if not handle or "/" in handle or "\\" in handle or "." in handle:
        raise FileError("bad handle", 404)
    p = os.path.join(store_dir, handle)
    if not os.path.exists(p):
        raise FileError("not found", 404)
    with open(p, "rb") as f:
        data = f.read()
    mime = "application/octet-stream"
    if os.path.exists(p + ".mime"):
        with open(p + ".mime", encoding="utf-8") as f:
            mime = f.read().strip()
    return mime, data


def cleanup(store_dir, ttl_seconds=3600):
    if not os.path.isdir(store_dir):
        return
    now = time.time()
    for name in os.listdir(store_dir):
        p = os.path.join(store_dir, name)
        try:
            if now - os.path.getmtime(p) > ttl_seconds:
                os.remove(p)
        except OSError:
            pass
