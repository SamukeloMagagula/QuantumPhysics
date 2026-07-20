import io
from quantumbreach import create_app


def _app(tmp_path):
    app = create_app({"TESTING": True, "DB_PATH": str(tmp_path / "t.db"),
                      "CONTENT_DIR": "content", "QKD_FILE_DIR": str(tmp_path / "files")})
    from quantumbreach.db import init_db
    init_db(app)
    return app


def test_upload_roundtrip(tmp_path):
    c = _app(tmp_path).test_client()
    data = {"file": (io.BytesIO(b"hello-cipher-bytes"), "secret.bin")}
    r = c.post("/api/qkd/file", data=data, content_type="multipart/form-data")
    assert r.status_code == 200
    handle = r.get_json()["handle"]
    g = c.get(f"/api/qkd/file/{handle}")
    assert g.data == b"hello-cipher-bytes"


def test_oversize_rejected(tmp_path):
    c = _app(tmp_path).test_client()
    big = io.BytesIO(b"x" * (262144 + 1))
    r = c.post("/api/qkd/file", data={"file": (big, "big.bin")}, content_type="multipart/form-data")
    assert r.status_code == 400


def test_sample_handle(tmp_path):
    c = _app(tmp_path).test_client()
    r = c.post("/api/qkd/file", json={"sample": "mission"})
    assert r.status_code == 200
    assert r.get_json()["mime"].startswith("text/")
