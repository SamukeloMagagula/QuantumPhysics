from dataclasses import dataclass, field


@dataclass
class Question:
    id: str
    prompt: str
    answer: str
    answer_type: str = "exact"
    points: int = 10
    hint: str = ""
    case_insensitive: bool = True
    trim: bool = True


@dataclass
class Task:
    id: str
    title: str
    body_html: str
    widget: str = ""
    widget_config: dict = field(default_factory=dict)
    questions: list = field(default_factory=list)


@dataclass
class Room:
    id: str
    title: str
    summary: str
    difficulty: str
    estimated_minutes: int
    tags: list = field(default_factory=list)
    prerequisites: list = field(default_factory=list)
    tasks: list = field(default_factory=list)

    @property
    def total_points(self) -> int:
        return sum(q.points for t in self.tasks for q in t.questions)

    @property
    def question_ids(self) -> list:
        return [q.id for t in self.tasks for q in t.questions]


@dataclass
class Path:
    id: str
    title: str
    description: str
    room_ids: list = field(default_factory=list)

    def rooms(self, content_dir):
        from .loader import load_room
        return [load_room(rid, content_dir) for rid in self.room_ids]
