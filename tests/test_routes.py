def _signup(client, name="zoe"):
    return client.post("/auth/signup", data={"username": name, "password": "pw12"},
                       follow_redirects=False)


def test_home_renders(content_client):
    assert content_client.get("/").status_code == 200


def test_room_requires_login(content_client):
    r = content_client.get("/rooms/demo-room", follow_redirects=False)
    assert r.status_code == 302  # redirect to login


def test_answer_wrong_then_right(content_client):
    _signup(content_client)
    # 'foo' is the demo answer (sha256('foo')); wrong first
    wrong = content_client.post("/rooms/demo-room/answer",
                                json={"taskId": "intro", "questionId": "q1", "answer": "bar"})
    assert wrong.status_code == 200
    assert wrong.get_json()["correct"] is False

    right = content_client.post("/rooms/demo-room/answer",
                                json={"taskId": "intro", "questionId": "q1", "answer": "foo"})
    body = right.get_json()
    assert body["correct"] is True
    assert body["pointsAwarded"] == 10
    assert body["roomComplete"] is True


def test_answer_unknown_question_404(content_client):
    _signup(content_client, "quinn")
    r = content_client.post("/rooms/demo-room/answer",
                            json={"taskId": "intro", "questionId": "nope", "answer": "x"})
    assert r.status_code == 404


def test_answer_rate_limited_after_12_attempts(content_client):
    from quantumbreach.rooms import routes
    routes._ATTEMPTS.clear()  # isolate from other tests' accumulated attempts
    _signup(content_client, "rlimit")
    codes = []
    for _ in range(13):
        r = content_client.post(
            "/rooms/demo-room/answer",
            json={"taskId": "intro", "questionId": "q1", "answer": "wrong"},
        )
        codes.append(r.status_code)
    assert codes[:12] == [200] * 12  # first 12 attempts allowed
    assert codes[12] == 429          # 13th attempt is rate-limited
    assert "error" in r.get_json()
