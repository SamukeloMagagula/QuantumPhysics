import os

import markdown
import yaml

from .models import Question, Task, Room, Path


def _read_yaml(path):
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_room(room_id: str, content_dir: str) -> Room:
    room_dir = os.path.join(content_dir, "rooms", room_id)
    data = _read_yaml(os.path.join(room_dir, "room.yaml"))
    tasks = []
    for t in data.get("tasks", []):
        body_html = ""
        if t.get("body"):
            with open(os.path.join(room_dir, t["body"]), "r", encoding="utf-8") as f:
                body_html = markdown.markdown(f.read(), extensions=["fenced_code", "tables"])
        questions = [
            Question(
                id=q["id"],
                prompt=q["prompt"],
                answer=str(q["answer"]),
                answer_type=q.get("answer_type", "exact"),
                points=int(q.get("points", 10)),
                hint=q.get("hint", ""),
                case_insensitive=bool(q.get("case_insensitive", True)),
                trim=bool(q.get("trim", True)),
            )
            for q in t.get("questions", [])
        ]
        tasks.append(Task(
            id=t["id"],
            title=t["title"],
            body_html=body_html,
            widget=t.get("widget", ""),
            widget_config=t.get("widget_config", {}) or {},
            questions=questions,
        ))
    return Room(
        id=data["id"],
        title=data["title"],
        summary=data.get("summary", ""),
        difficulty=data.get("difficulty", "Easy"),
        estimated_minutes=int(data.get("estimated_minutes", 10)),
        tags=data.get("tags", []) or [],
        prerequisites=data.get("prerequisites", []) or [],
        tasks=tasks,
    )


def load_path(path_id: str, content_dir: str) -> Path:
    data = _read_yaml(os.path.join(content_dir, "paths", f"{path_id}.yaml"))
    return Path(
        id=data["id"],
        title=data["title"],
        description=data.get("description", ""),
        room_ids=data.get("rooms", []) or [],
    )


def list_paths(content_dir: str) -> list:
    paths_dir = os.path.join(content_dir, "paths")
    out = []
    if not os.path.isdir(paths_dir):
        return out
    for name in sorted(os.listdir(paths_dir)):
        if name.endswith(".yaml"):
            out.append(load_path(name[:-5], content_dir))
    return out


def find_question(room: Room, task_id: str, question_id: str):
    for t in room.tasks:
        if t.id == task_id:
            for q in t.questions:
                if q.id == question_id:
                    return q
    return None
