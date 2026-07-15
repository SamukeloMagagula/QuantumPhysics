import os

from quantumbreach.rooms.loader import load_room, load_path, list_paths, find_question

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "content")


def test_load_room_parses_metadata_and_markdown():
    room = load_room("demo-room", FIXTURES)
    assert room.id == "demo-room"
    assert room.title == "Demo Room"
    assert room.difficulty == "Easy"
    assert len(room.tasks) == 1
    task = room.tasks[0]
    assert task.widget == "caesar-wheel"
    assert "<strong>demo</strong>" in task.body_html
    assert task.questions[0].answer_type == "exact"
    assert task.questions[0].points == 10
    assert room.total_points == 10


def test_load_path_and_rooms():
    path = load_path("demo", FIXTURES)
    assert path.title == "Demo Path"
    rooms = path.rooms(FIXTURES)
    assert [r.id for r in rooms] == ["demo-room"]


def test_list_paths():
    paths = list_paths(FIXTURES)
    assert any(p.id == "demo" for p in paths)


def test_question_fields_fully_parsed():
    room = load_room("demo-room", FIXTURES)
    q = room.tasks[0].questions[0]
    assert q.id == "q1"
    assert q.answer == "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae"
    assert q.hint == "It is bold."
    assert q.case_insensitive is True
    assert q.trim is True
    assert room.question_ids == ["q1"]


def test_find_question_hits_and_misses():
    room = load_room("demo-room", FIXTURES)
    assert find_question(room, "intro", "q1") is room.tasks[0].questions[0]
    assert find_question(room, "intro", "nope") is None
    assert find_question(room, "nope", "q1") is None
