import os
import tempfile

import pytest

from quantumbreach import create_app

REAL_CONTENT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "content")


@pytest.fixture
def real_client():
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    app = create_app({"TESTING": True, "DB_PATH": db_path, "SECRET_KEY": "test",
                      "CONTENT_DIR": REAL_CONTENT})
    yield app.test_client()
    os.close(db_fd)
    os.unlink(db_path)


def test_full_happy_path(real_client):
    # Home + path pages work anonymously.
    assert real_client.get("/").status_code == 200
    assert real_client.get("/paths/symmetric").status_code == 200

    # Sign up, open a room, solve it, become non-empty on the leaderboard.
    real_client.post("/auth/signup", data={"username": "neo", "password": "pw12"})
    assert real_client.get("/rooms/the-shift").status_code == 200

    r = real_client.post("/rooms/the-shift/answer",
                         json={"taskId": "solve", "questionId": "plaintext",
                               "answer": "hello world"})
    body = r.get_json()
    assert body["correct"] is True
    assert body["pointsAwarded"] == 15

    r2 = real_client.post("/rooms/the-shift/answer",
                          json={"taskId": "solve", "questionId": "key",
                                "answer": "25"})
    assert r2.get_json()["roomComplete"] is True

    lb = real_client.get("/leaderboard").get_data(as_text=True)
    assert "neo" in lb


def test_all_symmetric_rooms_render(real_client):
    real_client.post("/auth/signup", data={"username": "trin", "password": "pw12"})
    for rid in ["the-shift", "brute-force", "frequency-analysis", "xor-otp"]:
        assert real_client.get(f"/rooms/{rid}").status_code == 200
