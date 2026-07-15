import os

from quantumbreach.rooms.loader import load_room, load_path, list_paths

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
