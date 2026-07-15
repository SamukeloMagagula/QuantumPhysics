# PhantomQ Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build PhantomQ — a self-hosted, browser-based TryHackMe-style crypto learning platform — through its full platform plus one complete Symmetric learning path (4 rooms).

**Architecture:** A Flask app (application-factory pattern) served by Waitress over SQLite. Rooms are authored as **content** (`content/rooms/<id>/room.yaml` + Markdown), loaded and rendered by a single room engine; the DB stores only user progress and stats. Server-rendered Jinja templates plus small vanilla-JS widgets provide the UI. Answers are checked server-side against SHA-256 hashes.

**Tech Stack:** Python 3.10+, Flask, Waitress, SQLite (stdlib `sqlite3`), Jinja2, PyYAML, Python-Markdown, Werkzeug security, pytest.

## Global Constraints

- Runs on a fresh Windows machine with `python app.py` — no npm, no build step, no external services (verbatim goal from spec).
- Product name is **PhantomQ** everywhere in user-facing copy.
- Rooms/paths are **content files** under `content/`, never database rows. The DB stores user data only.
- Answers are stored **hashed** (SHA-256 of the normalized answer) in `room.yaml`, except `regex`-type answers which store a plaintext pattern. Answers are **never** sent to the client.
- Password hashing uses Werkzeug `generate_password_hash` / `check_password_hash`.
- Server-side sessions; `SESSION_COOKIE_SAMESITE = "Lax"`.
- Python 3.10+ only.
- All new Python files live under the `quantumbreach/` package except `app.py` (entry point) and `tests/`.

---

### Task 1: Project scaffolding, app factory, and entry point

**Files:**
- Create: `requirements.txt`
- Create: `.gitignore`
- Create: `quantumbreach/__init__.py`
- Create: `quantumbreach/config.py`
- Create: `app.py`
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`
- Test: `tests/test_app.py`

**Interfaces:**
- Produces: `quantumbreach.create_app(config_overrides: dict | None = None) -> flask.Flask` — the application factory. `quantumbreach.config.Config` — config object with `SECRET_KEY`, `DB_PATH`, `CONTENT_DIR`, `PORT`, `SESSION_COOKIE_SAMESITE`.

- [ ] **Step 1: Create `requirements.txt`**

```
Flask>=3.0
Waitress>=3.0
PyYAML>=6.0
Markdown>=3.5
pytest>=8.0
```

- [ ] **Step 2: Create `.gitignore`**

```
__pycache__/
*.pyc
*.db
.pytest_cache/
.venv/
venv/
instance/
```

- [ ] **Step 3: Create `quantumbreach/config.py`**

```python
import os

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(HERE)


class Config:
    SECRET_KEY = os.environ.get("PHANTOMQ_SECRET_KEY") or "dev-only-change-me"
    DB_PATH = os.environ.get("PHANTOMQ_DB") or os.path.join(PROJECT_ROOT, "phantomq.db")
    CONTENT_DIR = os.path.join(PROJECT_ROOT, "content")
    PORT = int(os.environ.get("PHANTOMQ_PORT") or 8000)
    SESSION_COOKIE_SAMESITE = "Lax"
```

- [ ] **Step 4: Create `quantumbreach/__init__.py` (factory returns a minimal app for now)**

```python
from flask import Flask

from .config import Config


def create_app(config_overrides: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)
    if config_overrides:
        app.config.update(config_overrides)

    @app.route("/healthz")
    def healthz():
        return {"status": "ok", "app": "PhantomQ"}

    return app
```

- [ ] **Step 5: Create `app.py` entry point**

```python
"""PhantomQ — run with: python app.py"""
from quantumbreach import create_app
from quantumbreach.config import Config

app = create_app()


def main():
    port = Config.PORT
    print("=" * 56)
    print("  PhantomQ — running")
    print("=" * 56)
    print(f"  Open:  http://localhost:{port}")
    print("  Press Ctrl+C to stop.")
    print("=" * 56)
    try:
        from waitress import serve
        serve(app, host="0.0.0.0", port=port, threads=8)
    except ImportError:
        app.run(host="0.0.0.0", port=port, debug=False)


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Create `tests/__init__.py` (empty) and `tests/conftest.py`**

```python
import os
import tempfile

import pytest

from quantumbreach import create_app


@pytest.fixture
def app():
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    app = create_app({"TESTING": True, "DB_PATH": db_path, "SECRET_KEY": "test"})
    yield app
    os.close(db_fd)
    os.unlink(db_path)


@pytest.fixture
def client(app):
    return app.test_client()
```

- [ ] **Step 7: Write the failing test `tests/test_app.py`**

```python
def test_app_boots_and_healthz(client):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.get_json()["app"] == "PhantomQ"
```

- [ ] **Step 8: Run test to verify it passes**

Run: `python -m pytest tests/test_app.py -v`
Expected: PASS

- [ ] **Step 9: Verify the entry point boots**

Run: `python -c "import app; print('import ok')"`
Expected: prints `import ok` with no exception.

- [ ] **Step 10: Commit**

```bash
git add requirements.txt .gitignore quantumbreach/ app.py tests/
git commit -m "feat: project scaffolding and app factory"
```

---

### Task 2: Database layer

**Files:**
- Create: `quantumbreach/db.py`
- Create: `quantumbreach/schema.sql`
- Modify: `quantumbreach/__init__.py`
- Test: `tests/test_db.py`

**Interfaces:**
- Consumes: `create_app` from Task 1.
- Produces:
  - `quantumbreach.db.get_db() -> sqlite3.Connection` (per-request, `row_factory = sqlite3.Row`, `PRAGMA foreign_keys = ON`).
  - `quantumbreach.db.init_db(app)` — creates schema, seeds badge catalogue.
  - `quantumbreach.db.init_app(app)` — registers teardown + calls `init_db`.
  - Tables: `users`, `room_progress`, `question_submissions`, `user_stats`, `badges`, `user_badges`.

- [ ] **Step 1: Create `quantumbreach/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_stats (
    user_id INTEGER PRIMARY KEY,
    points INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS room_progress (
    user_id INTEGER NOT NULL,
    room_id TEXT NOT NULL,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, room_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS question_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    room_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    correct INTEGER NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sub_user_q
    ON question_submissions(user_id, room_id, question_id);

CREATE TABLE IF NOT EXISTS badges (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS user_badges (
    user_id INTEGER NOT NULL,
    badge_id TEXT NOT NULL,
    awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, badge_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (badge_id) REFERENCES badges(id)
);
```

- [ ] **Step 2: Create `quantumbreach/db.py`**

```python
import os
import sqlite3

import click
from flask import current_app, g

BADGE_SEED = [
    ("first-clear", "First Blood", "Complete your first room.", "🩸"),
    ("symmetric-path", "Symmetric Specialist", "Complete every room in the Symmetric path.", "🔑"),
]


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DB_PATH"])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(e=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db(app):
    schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")
    with open(schema_path, "r", encoding="utf-8") as f:
        schema = f.read()
    with app.app_context():
        db = sqlite3.connect(app.config["DB_PATH"])
        db.executescript(schema)
        db.executemany(
            "INSERT OR IGNORE INTO badges (id, name, description, icon) VALUES (?,?,?,?)",
            BADGE_SEED,
        )
        db.commit()
        db.close()


def init_app(app):
    app.teardown_appcontext(close_db)
    init_db(app)
```

Note: `click` ships with Flask; the import is safe. (No CLI command is required for Phase 1 — remove the `import click` line if unused to keep the linter quiet.)

- [ ] **Step 3: Remove the unused import**

Delete the `import click` line from `quantumbreach/db.py` (it was listed only as a note; it is not used).

- [ ] **Step 4: Wire `init_app` into the factory — modify `quantumbreach/__init__.py`**

Add, immediately after `app.config.update(...)` handling and before the `@app.route("/healthz")` block:

```python
    from . import db
    db.init_app(app)
```

- [ ] **Step 5: Write the failing test `tests/test_db.py`**

```python
from quantumbreach.db import get_db


def test_schema_tables_exist(app):
    with app.app_context():
        db = get_db()
        names = {r["name"] for r in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    for t in ["users", "user_stats", "room_progress",
              "question_submissions", "badges", "user_badges"]:
        assert t in names


def test_badges_seeded(app):
    with app.app_context():
        db = get_db()
        count = db.execute("SELECT COUNT(*) AS c FROM badges").fetchone()["c"]
    assert count >= 2
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `python -m pytest tests/test_db.py -v`
Expected: PASS (both tests).

- [ ] **Step 7: Commit**

```bash
git add quantumbreach/db.py quantumbreach/schema.sql quantumbreach/__init__.py tests/test_db.py
git commit -m "feat: sqlite schema and db layer"
```

---

### Task 3: Crypto module (Caesar, XOR, frequency)

**Files:**
- Create: `quantumbreach/crypto/__init__.py`
- Create: `quantumbreach/crypto/caesar.py`
- Create: `quantumbreach/crypto/xor.py`
- Create: `quantumbreach/crypto/frequency.py`
- Test: `tests/test_crypto.py`

**Interfaces:**
- Produces:
  - `caesar_encrypt(text: str, key: int) -> str`
  - `caesar_decrypt(text: str, key: int) -> str`
  - `caesar_crack_all(text: str) -> list[tuple[int, str]]` (25 candidates, keys 1..25)
  - `xor_bytes(data: bytes, key: bytes) -> bytes` (repeating key)
  - `single_byte_xor(data: bytes, key: int) -> bytes`
  - `letter_frequencies(text: str) -> dict[str, float]` (a–z, values sum to 1.0 over letters; empty dict if no letters)

- [ ] **Step 1: Write the failing test `tests/test_crypto.py`**

```python
from quantumbreach.crypto import (
    caesar_encrypt, caesar_decrypt, caesar_crack_all,
    xor_bytes, single_byte_xor, letter_frequencies,
)


def test_caesar_roundtrip():
    assert caesar_encrypt("Hello, World!", 3) == "Khoor, Zruog!"
    assert caesar_decrypt("Khoor, Zruog!", 3) == "Hello, World!"


def test_caesar_wraps_and_preserves_nonalpha():
    assert caesar_encrypt("xyz XYZ 123", 3) == "abc ABC 123"


def test_caesar_crack_all_contains_plaintext():
    ct = caesar_encrypt("attack at dawn", 7)
    candidates = dict(caesar_crack_all(ct))
    assert candidates[7] == "attack at dawn"
    assert len(candidates) == 25


def test_xor_bytes_roundtrip():
    ct = xor_bytes(b"secret", b"KEY")
    assert xor_bytes(ct, b"KEY") == b"secret"


def test_single_byte_xor():
    assert single_byte_xor(single_byte_xor(b"hi", 0x42), 0x42) == b"hi"


def test_letter_frequencies_sums_to_one():
    freqs = letter_frequencies("aabbc")
    assert abs(sum(freqs.values()) - 1.0) < 1e-9
    assert abs(freqs["a"] - 0.4) < 1e-9
    assert letter_frequencies("123 !!!") == {}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_crypto.py -v`
Expected: FAIL with `ModuleNotFoundError: quantumbreach.crypto`.

- [ ] **Step 3: Create `quantumbreach/crypto/caesar.py`**

```python
def caesar_encrypt(text: str, key: int) -> str:
    k = key % 26
    out = []
    for ch in text:
        o = ord(ch)
        if 65 <= o <= 90:
            out.append(chr((o - 65 + k) % 26 + 65))
        elif 97 <= o <= 122:
            out.append(chr((o - 97 + k) % 26 + 97))
        else:
            out.append(ch)
    return "".join(out)


def caesar_decrypt(text: str, key: int) -> str:
    return caesar_encrypt(text, -key)


def caesar_crack_all(text: str) -> list[tuple[int, str]]:
    return [(k, caesar_decrypt(text, k)) for k in range(1, 26)]
```

- [ ] **Step 4: Create `quantumbreach/crypto/xor.py`**

```python
def xor_bytes(data: bytes, key: bytes) -> bytes:
    if not key:
        raise ValueError("key must be non-empty")
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))


def single_byte_xor(data: bytes, key: int) -> bytes:
    return bytes(b ^ (key & 0xFF) for b in data)
```

- [ ] **Step 5: Create `quantumbreach/crypto/frequency.py`**

```python
def letter_frequencies(text: str) -> dict[str, float]:
    counts: dict[str, int] = {}
    total = 0
    for ch in text.lower():
        if "a" <= ch <= "z":
            counts[ch] = counts.get(ch, 0) + 1
            total += 1
    if total == 0:
        return {}
    return {ch: n / total for ch, n in counts.items()}
```

- [ ] **Step 6: Create `quantumbreach/crypto/__init__.py`**

```python
from .caesar import caesar_encrypt, caesar_decrypt, caesar_crack_all
from .xor import xor_bytes, single_byte_xor
from .frequency import letter_frequencies

__all__ = [
    "caesar_encrypt", "caesar_decrypt", "caesar_crack_all",
    "xor_bytes", "single_byte_xor", "letter_frequencies",
]
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `python -m pytest tests/test_crypto.py -v`
Expected: PASS (all tests).

- [ ] **Step 8: Commit**

```bash
git add quantumbreach/crypto/ tests/test_crypto.py
git commit -m "feat: crypto module (caesar, xor, frequency)"
```

---

### Task 4: Answer engine (normalization, hashing, checking)

**Files:**
- Create: `quantumbreach/rooms/__init__.py` (empty)
- Create: `quantumbreach/rooms/answers.py`
- Test: `tests/test_answers.py`

**Interfaces:**
- Produces:
  - `normalize_answer(raw, *, case_insensitive=True, trim=True, numeric=False) -> str`
  - `hash_answer(raw, *, case_insensitive=True, trim=True, numeric=False) -> str` (SHA-256 hex)
  - `check_answer(*, submitted: str, stored: str, answer_type: str, case_insensitive: bool, trim: bool) -> bool`
  - Valid `answer_type` values: `"exact"`, `"number"`, `"flag"`, `"regex"`.
- Consumed by: Task 5 (loader stores these fields), Task 9 (submit endpoint).

- [ ] **Step 1: Write the failing test `tests/test_answers.py`**

```python
from quantumbreach.rooms.answers import normalize_answer, hash_answer, check_answer


def test_normalize_trims_and_lowercases():
    assert normalize_answer("  Hello ") == "hello"


def test_normalize_numeric_canonicalizes():
    assert normalize_answer("007", numeric=True) == "7"
    assert normalize_answer(" 3 ", numeric=True) == "3"


def test_hash_is_stable():
    assert hash_answer("Hello") == hash_answer("  hello ")


def test_check_exact():
    stored = hash_answer("photon")
    assert check_answer(submitted="PHOTON", stored=stored, answer_type="exact",
                        case_insensitive=True, trim=True)
    assert not check_answer(submitted="proton", stored=stored, answer_type="exact",
                            case_insensitive=True, trim=True)


def test_check_number():
    stored = hash_answer("3", numeric=True)
    assert check_answer(submitted="3", stored=stored, answer_type="number",
                        case_insensitive=True, trim=True)


def test_check_regex_uses_pattern_not_hash():
    assert check_answer(submitted="flag{abc123}", stored=r"flag\{[a-z0-9]+\}",
                        answer_type="regex", case_insensitive=True, trim=True)
    assert not check_answer(submitted="nope", stored=r"flag\{[a-z0-9]+\}",
                            answer_type="regex", case_insensitive=True, trim=True)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_answers.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Create `quantumbreach/rooms/__init__.py`** (empty file)

- [ ] **Step 4: Create `quantumbreach/rooms/answers.py`**

```python
import hashlib
import re

VALID_TYPES = {"exact", "number", "flag", "regex"}


def normalize_answer(raw, *, case_insensitive=True, trim=True, numeric=False) -> str:
    s = str(raw)
    if trim:
        s = s.strip()
    if numeric:
        try:
            f = float(s)
            return str(int(f)) if f.is_integer() else str(f)
        except ValueError:
            return s
    if case_insensitive:
        s = s.lower()
    return s


def hash_answer(raw, *, case_insensitive=True, trim=True, numeric=False) -> str:
    norm = normalize_answer(raw, case_insensitive=case_insensitive, trim=trim, numeric=numeric)
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()


def check_answer(*, submitted, stored, answer_type, case_insensitive, trim) -> bool:
    if answer_type == "regex":
        norm = normalize_answer(submitted, case_insensitive=case_insensitive, trim=trim)
        try:
            return re.fullmatch(stored, norm) is not None
        except re.error:
            return False
    numeric = answer_type == "number"
    return hash_answer(submitted, case_insensitive=case_insensitive,
                       trim=trim, numeric=numeric) == stored
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_answers.py -v`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add quantumbreach/rooms/__init__.py quantumbreach/rooms/answers.py tests/test_answers.py
git commit -m "feat: answer normalization, hashing, and checking"
```

---

### Task 5: Room content loader and models

**Files:**
- Create: `quantumbreach/rooms/models.py`
- Create: `quantumbreach/rooms/loader.py`
- Create: `tests/fixtures/content/paths/demo.yaml`
- Create: `tests/fixtures/content/rooms/demo-room/room.yaml`
- Create: `tests/fixtures/content/rooms/demo-room/task-1.md`
- Test: `tests/test_loader.py`

**Interfaces:**
- Consumes: nothing from prior tasks (pure loader).
- Produces:
  - Dataclasses `Question`, `Task`, `Room`, `Path` (see code).
  - `load_room(room_id: str, content_dir: str) -> Room`
  - `load_path(path_id: str, content_dir: str) -> Path`
  - `list_paths(content_dir: str) -> list[Path]`
  - `Room.total_points -> int` (sum of question points)
  - `Path.rooms(content_dir) -> list[Room]`
  - `Question` fields consumed by Task 9: `id, prompt, answer, answer_type, points, hint, case_insensitive, trim`.

- [ ] **Step 1: Create the test fixture `tests/fixtures/content/rooms/demo-room/task-1.md`**

```markdown
# Hello

This is **demo** task content.
```

- [ ] **Step 2: Create `tests/fixtures/content/rooms/demo-room/room.yaml`**

```yaml
id: demo-room
title: Demo Room
summary: A room used only in tests.
difficulty: Easy
estimated_minutes: 5
tags: [demo, test]
prerequisites: []
tasks:
  - id: intro
    title: Intro
    body: task-1.md
    widget: caesar-wheel
    questions:
      - id: q1
        prompt: What word is emphasised?
        answer_type: exact
        answer: 2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae
        points: 10
        hint: It is bold.
```

(The hash above is `sha256("foo")`; the test only checks structure, not correctness.)

- [ ] **Step 3: Create `tests/fixtures/content/paths/demo.yaml`**

```yaml
id: demo
title: Demo Path
description: For tests.
rooms:
  - demo-room
```

- [ ] **Step 4: Write the failing test `tests/test_loader.py`**

```python
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
```

- [ ] **Step 5: Run test to verify it fails**

Run: `python -m pytest tests/test_loader.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 6: Create `quantumbreach/rooms/models.py`**

```python
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
```

- [ ] **Step 7: Create `quantumbreach/rooms/loader.py`**

```python
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
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `python -m pytest tests/test_loader.py -v`
Expected: PASS (all three tests).

- [ ] **Step 9: Commit**

```bash
git add quantumbreach/rooms/models.py quantumbreach/rooms/loader.py tests/fixtures/ tests/test_loader.py
git commit -m "feat: room content loader and models"
```

---

### Task 6: Widget registry

**Files:**
- Create: `quantumbreach/widgets.py`
- Test: `tests/test_widgets.py`

**Interfaces:**
- Produces:
  - `WIDGET_IDS: frozenset[str]` = `{"caesar-wheel", "brute-force", "frequency", "xor-tool"}`
  - `is_widget(widget_id: str) -> bool`
  - `script_for(widget_id: str) -> str | None` returns `"js/widgets/<id>.js"` if valid else `None`.

- [ ] **Step 1: Write the failing test `tests/test_widgets.py`**

```python
from quantumbreach.widgets import WIDGET_IDS, is_widget, script_for


def test_known_widgets():
    assert "caesar-wheel" in WIDGET_IDS
    assert is_widget("xor-tool")
    assert not is_widget("nope")


def test_script_path():
    assert script_for("frequency") == "js/widgets/frequency.js"
    assert script_for("nope") is None
```

- [ ] **Step 2: Create `quantumbreach/widgets.py`**

```python
WIDGET_IDS = frozenset({"caesar-wheel", "brute-force", "frequency", "xor-tool"})


def is_widget(widget_id: str) -> bool:
    return widget_id in WIDGET_IDS


def script_for(widget_id: str):
    return f"js/widgets/{widget_id}.js" if widget_id in WIDGET_IDS else None
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `python -m pytest tests/test_widgets.py -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add quantumbreach/widgets.py tests/test_widgets.py
git commit -m "feat: widget registry"
```

---

### Task 7: Auth (service, blueprint, dev login pages) + contract doc

**Files:**
- Create: `quantumbreach/auth/__init__.py`
- Create: `quantumbreach/auth/service.py`
- Create: `quantumbreach/auth/routes.py`
- Create: `quantumbreach/templates/base.html` (minimal; expanded in Task 10)
- Create: `quantumbreach/templates/auth/login.html`
- Create: `quantumbreach/templates/auth/signup.html`
- Create: `docs/AUTH_CONTRACT.md`
- Modify: `quantumbreach/__init__.py`
- Test: `tests/test_auth.py`

**Interfaces:**
- Consumes: `get_db` (Task 2).
- Produces:
  - `quantumbreach.auth.service.create_user(db, username, password, display_name=None) -> int`
  - `quantumbreach.auth.service.verify_user(db, username, password) -> sqlite3.Row | None`
  - `quantumbreach.auth.service.get_user(db, user_id) -> sqlite3.Row | None`
  - `quantumbreach.auth.service.current_user() -> sqlite3.Row | None` (reads `session["user_id"]`)
  - `quantumbreach.auth.service.login_required(view)` decorator (redirects to `/auth/login`)
  - Blueprint `bp` registered at `/auth` with routes `GET/POST /auth/login`, `GET/POST /auth/signup`, `POST /auth/logout`.
  - Session key: `session["user_id"] = <users.id>`.

- [ ] **Step 1: Create `quantumbreach/auth/__init__.py`**

```python
from .routes import bp  # noqa: F401
```

- [ ] **Step 2: Create `quantumbreach/auth/service.py`**

```python
import functools

from flask import g, redirect, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from ..db import get_db


def create_user(db, username, password, display_name=None) -> int:
    cur = db.execute(
        "INSERT INTO users (username, password_hash, display_name) VALUES (?,?,?)",
        (username, generate_password_hash(password), display_name or username),
    )
    db.execute("INSERT OR IGNORE INTO user_stats (user_id, points) VALUES (?, 0)",
               (cur.lastrowid,))
    db.commit()
    return cur.lastrowid


def verify_user(db, username, password):
    row = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if row and check_password_hash(row["password_hash"], password):
        return row
    return None


def get_user(db, user_id):
    return db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def current_user():
    if "user" not in g:
        uid = session.get("user_id")
        g.user = get_user(get_db(), uid) if uid is not None else None
    return g.user


def login_required(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        if current_user() is None:
            return redirect(url_for("auth.login"))
        return view(*args, **kwargs)
    return wrapped
```

- [ ] **Step 3: Create `quantumbreach/auth/routes.py`**

```python
import sqlite3

from flask import (Blueprint, flash, redirect, render_template, request,
                   session, url_for)

from ..db import get_db
from .service import create_user, verify_user

bp = Blueprint("auth", __name__, url_prefix="/auth")


@bp.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        if not username or len(username) > 40:
            flash("Username must be 1–40 characters.")
        elif len(password) < 4:
            flash("Password must be at least 4 characters.")
        else:
            try:
                uid = create_user(get_db(), username, password)
            except sqlite3.IntegrityError:
                flash("That username is taken.")
            else:
                session.clear()
                session["user_id"] = uid
                return redirect(url_for("main.home"))
    return render_template("auth/signup.html")


@bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        row = verify_user(get_db(), username, password)
        if row is None:
            flash("Wrong username or password.")
        else:
            session.clear()
            session["user_id"] = row["id"]
            return redirect(url_for("main.home"))
    return render_template("auth/login.html")


@bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("main.home"))
```

- [ ] **Step 4: Create `quantumbreach/templates/base.html` (minimal placeholder; Task 10 rewrites the body)**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{% block title %}PhantomQ{% endblock %}</title>
  <link rel="stylesheet" href="{{ url_for('static', filename='css/app.css') }}">
</head>
<body>
  {% block nav %}{% endblock %}
  <main class="container">
    {% with messages = get_flashed_messages() %}
      {% if messages %}<div class="flash">{{ messages[0] }}</div>{% endif %}
    {% endwith %}
    {% block content %}{% endblock %}
  </main>
  {% block scripts %}{% endblock %}
</body>
</html>
```

- [ ] **Step 5: Create `quantumbreach/templates/auth/login.html`**

```html
{% extends "base.html" %}
{% block title %}Log in — PhantomQ{% endblock %}
{% block content %}
<h1>Log in</h1>
<form method="post" class="auth-form">
  <label>Username <input name="username" autofocus required></label>
  <label>Password <input name="password" type="password" required></label>
  <button type="submit">Log in</button>
</form>
<p>No account? <a href="{{ url_for('auth.signup') }}">Sign up</a>.</p>
{% endblock %}
```

- [ ] **Step 6: Create `quantumbreach/templates/auth/signup.html`**

```html
{% extends "base.html" %}
{% block title %}Sign up — PhantomQ{% endblock %}
{% block content %}
<h1>Create account</h1>
<form method="post" class="auth-form">
  <label>Username <input name="username" autofocus required></label>
  <label>Password <input name="password" type="password" required></label>
  <button type="submit">Sign up</button>
</form>
<p>Already have an account? <a href="{{ url_for('auth.login') }}">Log in</a>.</p>
{% endblock %}
```

- [ ] **Step 7: Register the blueprint and set the Jinja/static folders — modify `quantumbreach/__init__.py`**

Change the `Flask(__name__)` line to point at the package's template/static dirs, and register the auth blueprint. The factory should now read:

```python
from flask import Flask

from .config import Config


def create_app(config_overrides: dict | None = None) -> Flask:
    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.config.from_object(Config)
    if config_overrides:
        app.config.update(config_overrides)

    from . import db
    db.init_app(app)

    from .auth import bp as auth_bp
    app.register_blueprint(auth_bp)

    @app.route("/healthz")
    def healthz():
        return {"status": "ok", "app": "PhantomQ"}

    return app
```

- [ ] **Step 8: Create the static CSS directory with a stub so `url_for('static', ...)` resolves**

Create `quantumbreach/static/css/app.css` with a single line (expanded in Task 10):

```css
/* PhantomQ styles — expanded in Task 10 */
```

- [ ] **Step 9: Write the failing test `tests/test_auth.py`**

```python
from quantumbreach.auth.service import create_user, verify_user
from quantumbreach.db import get_db


def test_create_and_verify_user(app):
    with app.app_context():
        db = get_db()
        uid = create_user(db, "alice", "secret")
        assert isinstance(uid, int)
        assert verify_user(db, "alice", "secret")["id"] == uid
        assert verify_user(db, "alice", "wrong") is None


def test_signup_then_logout_flow(client):
    r = client.post("/auth/signup", data={"username": "bob", "password": "hunter2"},
                    follow_redirects=False)
    assert r.status_code == 302
    r = client.post("/auth/logout", follow_redirects=False)
    assert r.status_code == 302


def test_login_page_renders(client):
    assert client.get("/auth/login").status_code == 200
```

Note: `test_signup_then_logout_flow` requires the `main.home` endpoint to exist for the redirect target to build. If Task 8 is not yet implemented, temporarily assert `r.status_code in (302, 500)`; once Task 8 lands, tighten it back to `302`. (Subagent note: implement Task 8 immediately after and re-run.)

- [ ] **Step 10: Create `docs/AUTH_CONTRACT.md`**

```markdown
# PhantomQ Auth Contract

PhantomQ owns the user model, sessions, and auth endpoints. A teammate may
replace the login/signup **UI**. This document is the integration contract.

## Users table (SQLite)

```
users(
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,   -- Werkzeug generate_password_hash
  display_name  TEXT,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

Every new user must also get a `user_stats(user_id, points)` row (points = 0).

## Session

A logged-in user is identified solely by `session["user_id"] = users.id`
(Flask server-side signed cookie). Clearing the session logs out.

## Endpoints (current dev implementation)

- `GET/POST /auth/signup` — form fields `username`, `password`.
- `GET/POST /auth/login` — form fields `username`, `password`.
- `POST /auth/logout`.

## Two integration options

1. **Restyle the pages.** Keep posting to `/auth/login` and `/auth/signup`;
   only the templates `templates/auth/login.html` and `.../signup.html` change.
2. **Own the route.** Implement your own login view; on success, create the
   `users` (+ `user_stats`) row via `auth.service.create_user` and set
   `session["user_id"]`. Nothing else in the app needs to change.
```

- [ ] **Step 11: Run tests**

Run: `python -m pytest tests/test_auth.py -v`
Expected: `test_create_and_verify_user` and `test_login_page_renders` PASS. `test_signup_then_logout_flow` passes once Task 8 exists (see note in Step 9).

- [ ] **Step 12: Commit**

```bash
git add quantumbreach/auth/ quantumbreach/templates/ quantumbreach/static/ quantumbreach/__init__.py docs/AUTH_CONTRACT.md tests/test_auth.py
git commit -m "feat: auth service, dev login pages, and auth contract"
```

---

### Task 8: Progress, points, ranks, badges, leaderboard

**Files:**
- Create: `quantumbreach/progress/__init__.py`
- Create: `quantumbreach/progress/ranks.py`
- Create: `quantumbreach/progress/service.py`
- Test: `tests/test_progress.py`

**Interfaces:**
- Consumes: `get_db` (Task 2), `Room` model (Task 5).
- Produces:
  - `ranks.rank_for_points(points: int) -> str`
  - `ranks.RANKS: list[tuple[int, str]]`
  - `service.get_points(db, user_id) -> int`
  - `service.answered_question_ids(db, user_id, room_id) -> set[str]`
  - `service.record_answer(db, user_id, room, task_id, question, correct) -> dict` returning keys: `correct, alreadySolved, pointsAwarded, totalPoints, rank, roomComplete, newBadges` (`newBadges` = list of `{id,name,icon}`).
  - `service.leaderboard(db, limit=10) -> list[dict]` (`username, points, rank`).
  - `service.user_badges(db, user_id) -> list[dict]`.
  - Badge award rules: `first-clear` (first room completed), `symmetric-path` (all rooms in `content/paths/symmetric.yaml` complete).

- [ ] **Step 1: Create `quantumbreach/progress/__init__.py`** (empty file)

- [ ] **Step 2: Create `quantumbreach/progress/ranks.py`**

```python
# (threshold, title) sorted ascending; highest threshold <= points wins.
RANKS = [
    (0, "Script Kiddie"),
    (50, "Codebreaker"),
    (120, "Keymaster"),
    (220, "Cipherpunk"),
    (350, "Quantum Operative"),
]


def rank_for_points(points: int) -> str:
    title = RANKS[0][1]
    for threshold, name in RANKS:
        if points >= threshold:
            title = name
    return title
```

- [ ] **Step 3: Write the failing test `tests/test_progress.py`**

```python
import os

from quantumbreach.db import get_db
from quantumbreach.auth.service import create_user
from quantumbreach.progress.ranks import rank_for_points
from quantumbreach.progress import service
from quantumbreach.rooms.loader import load_room

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "content")


def test_rank_thresholds():
    assert rank_for_points(0) == "Script Kiddie"
    assert rank_for_points(49) == "Script Kiddie"
    assert rank_for_points(50) == "Codebreaker"
    assert rank_for_points(1000) == "Quantum Operative"


def test_record_answer_awards_points_once_and_completes_room(app):
    with app.app_context():
        db = get_db()
        uid = create_user(db, "eve", "pw")
        room = load_room("demo-room", FIXTURES)
        q = room.tasks[0].questions[0]

        r1 = service.record_answer(db, uid, room, "intro", q, correct=True)
        assert r1["correct"] and not r1["alreadySolved"]
        assert r1["pointsAwarded"] == 10
        assert r1["totalPoints"] == 10
        assert r1["roomComplete"] is True
        assert any(b["id"] == "first-clear" for b in r1["newBadges"])

        # Re-answering the same question awards nothing.
        r2 = service.record_answer(db, uid, room, "intro", q, correct=True)
        assert r2["alreadySolved"] is True
        assert r2["pointsAwarded"] == 0
        assert r2["totalPoints"] == 10


def test_leaderboard_orders_by_points(app):
    with app.app_context():
        db = get_db()
        a = create_user(db, "a", "pw")
        b = create_user(db, "b", "pw")
        db.execute("UPDATE user_stats SET points=30 WHERE user_id=?", (a,))
        db.execute("UPDATE user_stats SET points=90 WHERE user_id=?", (b,))
        db.commit()
        board = service.leaderboard(db, limit=10)
    assert [row["username"] for row in board[:2]] == ["b", "a"]
    assert board[0]["rank"] == "Codebreaker"
```

- [ ] **Step 4: Run test to verify it fails**

Run: `python -m pytest tests/test_progress.py -v`
Expected: FAIL with `ModuleNotFoundError: quantumbreach.progress.service`.

- [ ] **Step 5: Create `quantumbreach/progress/service.py`**

```python
import os

from flask import current_app

from .ranks import rank_for_points


def get_points(db, user_id) -> int:
    row = db.execute("SELECT points FROM user_stats WHERE user_id=?", (user_id,)).fetchone()
    return row["points"] if row else 0


def answered_question_ids(db, user_id, room_id) -> set:
    rows = db.execute(
        "SELECT DISTINCT question_id FROM question_submissions "
        "WHERE user_id=? AND room_id=? AND correct=1",
        (user_id, room_id),
    ).fetchall()
    return {r["question_id"] for r in rows}


def _room_complete(db, user_id, room) -> bool:
    answered = answered_question_ids(db, user_id, room.id)
    ids = set(room.question_ids)
    return bool(ids) and ids.issubset(answered)


def _award_badge(db, user_id, badge_id) -> dict | None:
    exists = db.execute(
        "SELECT 1 FROM user_badges WHERE user_id=? AND badge_id=?",
        (user_id, badge_id)).fetchone()
    if exists:
        return None
    db.execute("INSERT INTO user_badges (user_id, badge_id) VALUES (?,?)",
               (user_id, badge_id))
    b = db.execute("SELECT id, name, icon FROM badges WHERE id=?", (badge_id,)).fetchone()
    return dict(b) if b else None


def _check_path_badges(db, user_id) -> list:
    """Award symmetric-path badge if every room in that path is complete."""
    from ..rooms.loader import load_path, load_room
    content_dir = current_app.config["CONTENT_DIR"]
    awarded = []
    path_file = os.path.join(content_dir, "paths", "symmetric.yaml")
    if not os.path.exists(path_file):
        return awarded
    path = load_path("symmetric", content_dir)
    all_done = True
    for rid in path.room_ids:
        room = load_room(rid, content_dir)
        if not _room_complete(db, user_id, room):
            all_done = False
            break
    if all_done and path.room_ids:
        b = _award_badge(db, user_id, "symmetric-path")
        if b:
            awarded.append(b)
    return awarded


def record_answer(db, user_id, room, task_id, question, correct) -> dict:
    already = question.id in answered_question_ids(db, user_id, room.id)
    db.execute(
        "INSERT INTO question_submissions (user_id, room_id, question_id, correct) "
        "VALUES (?,?,?,?)",
        (user_id, room.id, question.id, 1 if correct else 0),
    )
    points_awarded = 0
    new_badges = []
    room_complete = False
    if correct and not already:
        points_awarded = question.points
        db.execute("UPDATE user_stats SET points = points + ? WHERE user_id=?",
                   (points_awarded, user_id))
        if _room_complete(db, user_id, room):
            room_complete = True
            newly = db.execute(
                "SELECT 1 FROM room_progress WHERE user_id=? AND room_id=?",
                (user_id, room.id)).fetchone() is None
            db.execute(
                "INSERT OR IGNORE INTO room_progress (user_id, room_id) VALUES (?,?)",
                (user_id, room.id))
            if newly:
                first = _award_badge(db, user_id, "first-clear")
                if first:
                    new_badges.append(first)
                new_badges.extend(_check_path_badges(db, user_id))
    db.commit()
    total = get_points(db, user_id)
    return {
        "correct": bool(correct),
        "alreadySolved": bool(already),
        "pointsAwarded": points_awarded,
        "totalPoints": total,
        "rank": rank_for_points(total),
        "roomComplete": room_complete,
        "newBadges": new_badges,
    }


def leaderboard(db, limit=10) -> list:
    rows = db.execute(
        "SELECT u.username AS username, s.points AS points "
        "FROM user_stats s JOIN users u ON u.id = s.user_id "
        "WHERE s.points > 0 ORDER BY s.points DESC, u.username LIMIT ?",
        (limit,)).fetchall()
    return [{"username": r["username"], "points": r["points"],
             "rank": rank_for_points(r["points"])} for r in rows]


def user_badges(db, user_id) -> list:
    rows = db.execute(
        "SELECT b.id, b.name, b.icon FROM user_badges ub "
        "JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id=? ORDER BY ub.awarded_at",
        (user_id,)).fetchall()
    return [dict(r) for r in rows]
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `python -m pytest tests/test_progress.py -v`
Expected: PASS (all three tests).

- [ ] **Step 7: Commit**

```bash
git add quantumbreach/progress/ tests/test_progress.py
git commit -m "feat: progress, points, ranks, badges, leaderboard"
```

---

### Task 9: Main + rooms blueprints (home, path, room, submit, leaderboard)

**Files:**
- Create: `quantumbreach/main.py`
- Create: `quantumbreach/rooms/routes.py`
- Modify: `quantumbreach/__init__.py`
- Test: `tests/test_routes.py`

**Interfaces:**
- Consumes: `list_paths`, `load_path`, `load_room`, `find_question` (Task 5); `answers.check_answer` (Task 4); `progress.service` (Task 8); `auth.service.current_user`, `login_required` (Task 7); `widgets.is_widget`, `script_for` (Task 6).
- Produces:
  - `main` blueprint: `GET /` → `main.home`; `GET /leaderboard` → `main.leaderboard`.
  - `rooms` blueprint: `GET /paths/<path_id>`, `GET /rooms/<room_id>` (login required), `POST /rooms/<room_id>/answer` (login required, JSON in/out, rate-limited).
  - Answer endpoint request JSON: `{"taskId": str, "questionId": str, "answer": str}`.
  - Answer endpoint response JSON: the dict from `record_answer` plus `{"error": ...}` on failure (400/404/429).
  - Rate limit: max 12 submissions per `(user, question)` per 60s → HTTP 429.

- [ ] **Step 1: Create `quantumbreach/main.py`**

```python
from flask import Blueprint, current_app, render_template

from .auth.service import current_user
from .db import get_db
from .progress import service as progress
from .rooms.loader import list_paths

bp = Blueprint("main", __name__)


@bp.route("/")
def home():
    content_dir = current_app.config["CONTENT_DIR"]
    paths = list_paths(content_dir)
    user = current_user()
    completed = set()
    if user:
        rows = get_db().execute(
            "SELECT room_id FROM room_progress WHERE user_id=?", (user["id"],)).fetchall()
        completed = {r["room_id"] for r in rows}
    path_cards = []
    for p in paths:
        rooms = p.rooms(content_dir)
        done = sum(1 for r in rooms if r.id in completed)
        path_cards.append({"path": p, "rooms": rooms, "done": done, "total": len(rooms)})
    return render_template("home.html", path_cards=path_cards, user=user)


@bp.route("/leaderboard")
def leaderboard():
    board = progress.leaderboard(get_db(), limit=10)
    return render_template("leaderboard.html", board=board, user=current_user())
```

- [ ] **Step 2: Create `quantumbreach/rooms/routes.py`**

```python
import time

from flask import (Blueprint, abort, current_app, jsonify, render_template,
                   request)

from ..auth.service import current_user, login_required
from ..db import get_db
from ..progress import service as progress
from ..widgets import is_widget, script_for
from .answers import check_answer
from .loader import find_question, load_path, load_room

bp = Blueprint("rooms", __name__)

# In-memory sliding-window rate limiter: {(user_id, question_id): [timestamps]}
_ATTEMPTS: dict = {}
_WINDOW = 60.0
_MAX = 12


def _rate_limited(user_id, question_id) -> bool:
    now = time.time()
    key = (user_id, question_id)
    hits = [t for t in _ATTEMPTS.get(key, []) if now - t < _WINDOW]
    hits.append(now)
    _ATTEMPTS[key] = hits
    return len(hits) > _MAX


def _load_room_or_404(room_id):
    content_dir = current_app.config["CONTENT_DIR"]
    try:
        return load_room(room_id, content_dir)
    except FileNotFoundError:
        abort(404)


@bp.route("/paths/<path_id>")
def path_view(path_id):
    content_dir = current_app.config["CONTENT_DIR"]
    try:
        path = load_path(path_id, content_dir)
    except FileNotFoundError:
        abort(404)
    rooms = path.rooms(content_dir)
    user = current_user()
    completed = set()
    if user:
        rows = get_db().execute(
            "SELECT room_id FROM room_progress WHERE user_id=?", (user["id"],)).fetchall()
        completed = {r["room_id"] for r in rows}
    return render_template("path.html", path=path, rooms=rooms,
                           completed=completed, user=user)


@bp.route("/rooms/<room_id>")
@login_required
def room_view(room_id):
    room = _load_room_or_404(room_id)
    user = current_user()
    answered = progress.answered_question_ids(get_db(), user["id"], room.id)
    return render_template("room.html", room=room, answered=answered, user=user,
                           is_widget=is_widget, script_for=script_for)


@bp.route("/rooms/<room_id>/answer", methods=["POST"])
@login_required
def submit_answer(room_id):
    room = _load_room_or_404(room_id)
    user = current_user()
    data = request.get_json(silent=True) or {}
    task_id = data.get("taskId")
    question_id = data.get("questionId")
    submitted = data.get("answer", "")
    question = find_question(room, task_id, question_id)
    if question is None:
        return jsonify({"error": "Unknown question."}), 404
    if _rate_limited(user["id"], question_id):
        return jsonify({"error": "Too many attempts. Wait a moment."}), 429
    correct = check_answer(
        submitted=submitted, stored=question.answer, answer_type=question.answer_type,
        case_insensitive=question.case_insensitive, trim=question.trim)
    result = progress.record_answer(get_db(), user["id"], room, task_id, question, correct)
    return jsonify(result)
```

- [ ] **Step 3: Register both blueprints — modify `quantumbreach/__init__.py`**

After the auth blueprint registration, add:

```python
    from .main import bp as main_bp
    app.register_blueprint(main_bp)

    from .rooms.routes import bp as rooms_bp
    app.register_blueprint(rooms_bp)
```

- [ ] **Step 4: Point the app's content dir at the test fixtures for route tests — add to `tests/conftest.py`**

Add a fixture that overrides `CONTENT_DIR` to the fixtures folder:

```python
@pytest.fixture
def app_with_content():
    import os
    fixtures = os.path.join(os.path.dirname(__file__), "fixtures", "content")
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    app = create_app({"TESTING": True, "DB_PATH": db_path, "SECRET_KEY": "test",
                      "CONTENT_DIR": fixtures})
    yield app
    os.close(db_fd)
    os.unlink(db_path)


@pytest.fixture
def content_client(app_with_content):
    return app_with_content.test_client()
```

- [ ] **Step 5: Write the failing test `tests/test_routes.py`**

```python
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `python -m pytest tests/test_routes.py -v`
Expected: PASS (all four tests).

- [ ] **Step 7: Re-run the full suite (Task 7's signup test should now be green)**

Run: `python -m pytest -v`
Expected: all tests PASS. If `tests/test_auth.py::test_signup_then_logout_flow` was loosened in Task 7 Step 9, tighten it back to `assert r.status_code == 302` now and re-run.

- [ ] **Step 8: Commit**

```bash
git add quantumbreach/main.py quantumbreach/rooms/routes.py quantumbreach/__init__.py tests/conftest.py tests/test_routes.py tests/test_auth.py
git commit -m "feat: main and rooms blueprints with answer submission"
```

---

### Task 10: Design system, base layout, home + leaderboard templates

**Files:**
- Modify: `quantumbreach/static/css/app.css` (full design system)
- Modify: `quantumbreach/templates/base.html` (real nav)
- Create: `quantumbreach/templates/_nav.html`
- Create: `quantumbreach/templates/home.html`
- Create: `quantumbreach/templates/leaderboard.html`
- Test: `tests/test_templates.py`

**Interfaces:**
- Consumes: `main.home`, `main.leaderboard`, `path_cards`, `board`, `user`, `current_user`.
- Produces: rendered pages. Nav shows PhantomQ brand, Home/Leaderboard links, and either points+rank+logout (logged in) or Log in/Sign up.

- [ ] **Step 1: Replace `quantumbreach/static/css/app.css` with the design system**

```css
:root{
  --bg:#0b0f14; --bg-2:#121821; --panel:#161d28; --border:#222c3a;
  --text:#e6edf3; --muted:#8b98a9; --accent:#3fe0c5; --accent-2:#7c5cff;
  --good:#39d98a; --bad:#ff6b6b; --radius:12px; --mono:"JetBrains Mono",ui-monospace,Consolas,monospace;
  --sans:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(1200px 600px at 70% -10%,#152030,transparent),var(--bg);
  color:var(--text);font-family:var(--sans);line-height:1.6}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.container{max-width:960px;margin:0 auto;padding:2rem 1.25rem}
.nav{display:flex;align-items:center;gap:1.25rem;padding:.9rem 1.25rem;
  border-bottom:1px solid var(--border);background:var(--bg-2);position:sticky;top:0;z-index:10}
.brand{font-family:var(--mono);font-weight:700;font-size:1.15rem;letter-spacing:.5px}
.brand .q{color:var(--accent)}
.nav .spacer{flex:1}
.nav .chip{font-family:var(--mono);font-size:.8rem;color:var(--muted);
  border:1px solid var(--border);padding:.25rem .6rem;border-radius:999px}
.btn{display:inline-block;background:var(--accent);color:#04120f;border:0;cursor:pointer;
  font-weight:600;padding:.55rem 1rem;border-radius:10px;font-family:var(--sans)}
.btn.ghost{background:transparent;color:var(--text);border:1px solid var(--border)}
.btn:hover{filter:brightness(1.08)}
h1{font-size:1.9rem;margin:.2rem 0 1rem}
.flash{background:#3a1d24;border:1px solid var(--bad);color:#ffd7d7;
  padding:.6rem .9rem;border-radius:10px;margin-bottom:1rem}
.grid{display:grid;gap:1rem}
.path-card{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem}
.path-card h2{margin:.1rem 0 .3rem;font-size:1.25rem}
.muted{color:var(--muted)}
.progress{height:8px;background:#0e141d;border-radius:999px;overflow:hidden;margin:.6rem 0}
.progress>span{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2))}
.room-list{list-style:none;padding:0;margin:.6rem 0 0;display:grid;gap:.5rem}
.room-row{display:flex;align-items:center;gap:.7rem;padding:.6rem .8rem;
  background:var(--bg-2);border:1px solid var(--border);border-radius:10px}
.room-row .diff{font-family:var(--mono);font-size:.7rem;padding:.1rem .5rem;border-radius:999px;
  border:1px solid var(--border);color:var(--muted)}
.room-row .status{margin-left:auto;font-family:var(--mono);font-size:.8rem}
.status.done{color:var(--good)} .status.todo{color:var(--muted)}
.auth-form{display:grid;gap:.8rem;max-width:340px}
.auth-form label{display:grid;gap:.3rem;font-size:.9rem}
.auth-form input{background:#0e141d;border:1px solid var(--border);color:var(--text);
  padding:.55rem .7rem;border-radius:8px;font-family:var(--mono)}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:.6rem .5rem;border-bottom:1px solid var(--border)}
th{color:var(--muted);font-weight:600;font-size:.85rem}
/* Room page */
.task{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);
  padding:1.25rem 1.4rem;margin-bottom:1.2rem}
.task h3{margin-top:0}
.task .body :is(code,pre){font-family:var(--mono)}
.task pre{background:#0e141d;padding:.8rem;border-radius:8px;overflow:auto}
.widget{background:#0e141d;border:1px dashed var(--border);border-radius:10px;padding:1rem;margin:1rem 0}
.widget label{font-size:.85rem;color:var(--muted)}
.widget input,.widget textarea,.widget select{width:100%;background:#0b1017;color:var(--text);
  border:1px solid var(--border);border-radius:8px;padding:.5rem;font-family:var(--mono)}
.widget .out{font-family:var(--mono);white-space:pre-wrap;word-break:break-word;margin-top:.5rem;color:var(--accent)}
.q{border-top:1px solid var(--border);padding-top:1rem;margin-top:1rem}
.q .row{display:flex;gap:.5rem;flex-wrap:wrap}
.q input.answer{flex:1;min-width:220px;background:#0e141d;border:1px solid var(--border);
  color:var(--text);border-radius:8px;padding:.5rem;font-family:var(--mono)}
.q .result{font-family:var(--mono);font-size:.85rem;margin-top:.4rem}
.q .result.ok{color:var(--good)} .q .result.no{color:var(--bad)}
.q .hint{color:var(--muted);font-size:.85rem;margin-top:.3rem}
.solved{color:var(--good);font-family:var(--mono);font-size:.85rem}
.toast{position:fixed;right:1rem;bottom:1rem;background:var(--panel);border:1px solid var(--accent);
  border-radius:10px;padding:.8rem 1rem;font-family:var(--mono);max-width:320px}
.bar-freq{display:flex;align-items:flex-end;gap:2px;height:120px;margin-top:.5rem}
.bar-freq .b{flex:1;background:linear-gradient(180deg,var(--accent),var(--accent-2));border-radius:3px 3px 0 0}
```

- [ ] **Step 2: Create `quantumbreach/templates/_nav.html`**

```html
<nav class="nav">
  <a class="brand" href="{{ url_for('main.home') }}">Phantom<span class="q">Q</span></a>
  <a href="{{ url_for('main.home') }}">Home</a>
  <a href="{{ url_for('main.leaderboard') }}">Leaderboard</a>
  <span class="spacer"></span>
  {% if user %}
    <span class="chip" id="nav-points" data-points="{{ points }}">{{ rank }} · {{ points }} XP</span>
    <form method="post" action="{{ url_for('auth.logout') }}">
      <button class="btn ghost" type="submit">Log out</button>
    </form>
  {% else %}
    <a class="btn ghost" href="{{ url_for('auth.login') }}">Log in</a>
    <a class="btn" href="{{ url_for('auth.signup') }}">Sign up</a>
  {% endif %}
</nav>
```

- [ ] **Step 3: Rewrite `quantumbreach/templates/base.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{% block title %}PhantomQ{% endblock %}</title>
  <link rel="stylesheet" href="{{ url_for('static', filename='css/app.css') }}">
</head>
<body>
  {% set points = (user_points if user_points is defined else 0) %}
  {% set rank = (user_rank if user_rank is defined else 'Script Kiddie') %}
  {% include "_nav.html" %}
  <main class="container">
    {% with messages = get_flashed_messages() %}
      {% if messages %}<div class="flash">{{ messages[0] }}</div>{% endif %}
    {% endwith %}
    {% block content %}{% endblock %}
  </main>
  {% block scripts %}{% endblock %}
</body>
</html>
```

- [ ] **Step 4: Provide `user_points`/`user_rank` to all templates via a context processor — modify `quantumbreach/__init__.py`**

Add inside `create_app`, after blueprints are registered:

```python
    from .auth.service import current_user
    from .db import get_db
    from .progress.service import get_points
    from .progress.ranks import rank_for_points

    @app.context_processor
    def inject_user():
        u = current_user()
        if not u:
            return {"user": None, "user_points": 0, "user_rank": "Script Kiddie"}
        pts = get_points(get_db(), u["id"])
        return {"user": u, "user_points": pts, "user_rank": rank_for_points(pts)}
```

- [ ] **Step 5: Create `quantumbreach/templates/home.html`**

```html
{% extends "base.html" %}
{% block title %}PhantomQ — Learn cryptography by breaking it{% endblock %}
{% block content %}
<h1>Learn cryptography by breaking it</h1>
<p class="muted">Work through hands-on rooms. Encrypt, attack, and capture flags — from Caesar to quantum key distribution.</p>
<div class="grid">
  {% for card in path_cards %}
  <section class="path-card">
    <h2><a href="{{ url_for('rooms.path_view', path_id=card.path.id) }}">{{ card.path.title }}</a></h2>
    <p class="muted">{{ card.path.description }}</p>
    <div class="progress"><span style="width: {{ (100 * card.done / card.total) if card.total else 0 }}%"></span></div>
    <p class="muted">{{ card.done }} / {{ card.total }} rooms complete</p>
    <ul class="room-list">
      {% for room in card.rooms %}
      <li class="room-row">
        <span class="diff">{{ room.difficulty }}</span>
        <a href="{{ url_for('rooms.room_view', room_id=room.id) }}">{{ room.title }}</a>
      </li>
      {% endfor %}
    </ul>
  </section>
  {% endfor %}
</div>
{% endblock %}
```

- [ ] **Step 6: Create `quantumbreach/templates/leaderboard.html`**

```html
{% extends "base.html" %}
{% block title %}Leaderboard — PhantomQ{% endblock %}
{% block content %}
<h1>Leaderboard</h1>
<table>
  <thead><tr><th>#</th><th>Operative</th><th>Rank</th><th>XP</th></tr></thead>
  <tbody>
    {% for row in board %}
    <tr><td>{{ loop.index }}</td><td>{{ row.username }}</td><td>{{ row.rank }}</td><td>{{ row.points }}</td></tr>
    {% else %}
    <tr><td colspan="4" class="muted">No scores yet. Be the first.</td></tr>
    {% endfor %}
  </tbody>
</table>
{% endblock %}
```

- [ ] **Step 7: Write the failing test `tests/test_templates.py`**

```python
def test_home_shows_brand_and_paths(content_client):
    html = content_client.get("/").get_data(as_text=True)
    assert "PhantomQ" in html
    assert "Demo Path" in html


def test_leaderboard_renders(content_client):
    assert content_client.get("/leaderboard").status_code == 200


def test_nav_shows_login_when_anonymous(content_client):
    html = content_client.get("/").get_data(as_text=True)
    assert "Log in" in html
```

- [ ] **Step 8: Run tests**

Run: `python -m pytest tests/test_templates.py -v`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add quantumbreach/static/css/app.css quantumbreach/templates/ quantumbreach/__init__.py tests/test_templates.py
git commit -m "feat: design system, nav, home and leaderboard"
```

---

### Task 11: Room page template + answer-submit JS

**Files:**
- Create: `quantumbreach/templates/room.html`
- Create: `quantumbreach/templates/path.html`
- Create: `quantumbreach/static/js/app.js`
- Test: `tests/test_room_page.py`

**Interfaces:**
- Consumes: `room`, `answered`, `is_widget`, `script_for` (Task 9 room_view); the answer endpoint (Task 9).
- Produces: the room UI. Each question renders a form with `data-room`, `data-task`, `data-question`; `app.js` posts JSON to `/rooms/<room_id>/answer` and renders the result, updates the nav XP chip, and shows badge toasts.

- [ ] **Step 1: Create `quantumbreach/templates/path.html`**

```html
{% extends "base.html" %}
{% block title %}{{ path.title }} — PhantomQ{% endblock %}
{% block content %}
<h1>{{ path.title }}</h1>
<p class="muted">{{ path.description }}</p>
<ul class="room-list">
  {% for room in rooms %}
  <li class="room-row">
    <span class="diff">{{ room.difficulty }}</span>
    <a href="{{ url_for('rooms.room_view', room_id=room.id) }}">{{ room.title }}</a>
    <span class="muted">· {{ room.estimated_minutes }} min · {{ room.total_points }} XP</span>
    <span class="status {{ 'done' if room.id in completed else 'todo' }}">
      {{ '✓ complete' if room.id in completed else 'not started' }}
    </span>
  </li>
  {% endfor %}
</ul>
{% endblock %}
```

- [ ] **Step 2: Create `quantumbreach/templates/room.html`**

```html
{% extends "base.html" %}
{% block title %}{{ room.title }} — PhantomQ{% endblock %}
{% block content %}
<p class="muted"><a href="{{ url_for('main.home') }}">← All paths</a></p>
<h1>{{ room.title }}</h1>
<p class="muted">{{ room.difficulty }} · {{ room.estimated_minutes }} min · {{ room.total_points }} XP</p>
<p>{{ room.summary }}</p>

{% for task in room.tasks %}
<section class="task">
  <h3>{{ task.title }}</h3>
  <div class="body">{{ task.body_html | safe }}</div>

  {% if task.widget and is_widget(task.widget) %}
    <div class="widget" data-widget="{{ task.widget }}"
         data-config='{{ task.widget_config | tojson }}'></div>
  {% endif %}

  {% for q in task.questions %}
  <div class="q" data-room="{{ room.id }}" data-task="{{ task.id }}" data-question="{{ q.id }}">
    <p><strong>{{ q.prompt }}</strong></p>
    {% if q.id in answered %}
      <p class="solved">✓ Solved (+{{ q.points }} XP)</p>
    {% else %}
      <div class="row">
        <input class="answer" placeholder="Your answer" autocomplete="off">
        <button class="btn submit" type="button">Submit</button>
      </div>
      <div class="result"></div>
      {% if q.hint %}<details class="hint"><summary>Hint</summary>{{ q.hint }}</details>{% endif %}
    {% endif %}
  </div>
  {% endfor %}
</section>
{% endfor %}

{% set scripts = [] %}
{% for task in room.tasks %}
  {% if task.widget and script_for(task.widget) and script_for(task.widget) not in scripts %}
    {% set _ = scripts.append(script_for(task.widget)) %}
  {% endif %}
{% endfor %}
{% block scripts %}
  {% for s in scripts %}
    <script src="{{ url_for('static', filename=s) }}"></script>
  {% endfor %}
  <script src="{{ url_for('static', filename='js/app.js') }}"></script>
{% endblock %}
{% endblock %}
```

- [ ] **Step 3: Create `quantumbreach/static/js/app.js`**

```javascript
(function () {
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4000);
  }

  document.querySelectorAll(".q .submit").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var q = btn.closest(".q");
      var input = q.querySelector(".answer");
      var result = q.querySelector(".result");
      var payload = {
        taskId: q.dataset.task,
        questionId: q.dataset.question,
        answer: input.value,
      };
      fetch("/rooms/" + q.dataset.room + "/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          var d = res.d;
          if (!res.ok) {
            result.className = "result no";
            result.textContent = d.error || "Error.";
            return;
          }
          if (d.correct) {
            result.className = "result ok";
            result.textContent = d.alreadySolved
              ? "Correct (already solved)."
              : "Correct! +" + d.pointsAwarded + " XP";
            var chip = document.getElementById("nav-points");
            if (chip) chip.textContent = d.rank + " · " + d.totalPoints + " XP";
            (d.newBadges || []).forEach(function (b) {
              toast("🏅 Badge unlocked: " + b.name);
            });
            if (d.roomComplete) toast("✅ Room complete!");
          } else {
            result.className = "result no";
            result.textContent = "Not quite — try again.";
          }
        })
        .catch(function () {
          result.className = "result no";
          result.textContent = "Network error.";
        });
    });
  });
})();
```

- [ ] **Step 4: Write the failing test `tests/test_room_page.py`**

```python
def _signup(client, name="rae"):
    client.post("/auth/signup", data={"username": name, "password": "pw12"})


def test_room_page_renders_tasks_and_widget(content_client):
    _signup(content_client)
    html = content_client.get("/rooms/demo-room").get_data(as_text=True)
    assert "Demo Room" in html
    assert 'data-widget="caesar-wheel"' in html
    assert 'data-question="q1"' in html
    assert "js/app.js" in html
    assert "js/widgets/caesar-wheel.js" in html


def test_path_page_renders(content_client):
    html = content_client.get("/paths/demo").get_data(as_text=True)
    assert "Demo Path" in html
    assert "Demo Room" in html
```

- [ ] **Step 5: Run tests**

Run: `python -m pytest tests/test_room_page.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add quantumbreach/templates/room.html quantumbreach/templates/path.html quantumbreach/static/js/app.js tests/test_room_page.py
git commit -m "feat: room and path pages with answer-submit JS"
```

---

### Task 12: Interactive widgets (caesar-wheel, brute-force, frequency, xor-tool)

**Files:**
- Create: `quantumbreach/static/js/widgets/caesar-wheel.js`
- Create: `quantumbreach/static/js/widgets/brute-force.js`
- Create: `quantumbreach/static/js/widgets/frequency.js`
- Create: `quantumbreach/static/js/widgets/xor-tool.js`
- Test: `tests/test_widget_files.py`

**Interfaces:**
- Each widget script finds mount points via `document.querySelectorAll('[data-widget="<id>"]')` and builds its UI into that element. No server calls; pure client-side tools.

- [ ] **Step 1: Create `quantumbreach/static/js/widgets/caesar-wheel.js`**

```javascript
(function () {
  function caesar(text, k) {
    k = ((k % 26) + 26) % 26;
    return text.replace(/[a-z]/gi, function (c) {
      var base = c <= "Z" ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + k) % 26) + base);
    });
  }
  document.querySelectorAll('[data-widget="caesar-wheel"]').forEach(function (el) {
    el.innerHTML =
      '<label>Text</label><input class="cw-text" value="Hello, World!">' +
      '<label>Shift: <span class="cw-k">3</span></label>' +
      '<input class="cw-shift" type="range" min="0" max="25" value="3">' +
      '<div class="out"></div>';
    var text = el.querySelector(".cw-text");
    var shift = el.querySelector(".cw-shift");
    var klabel = el.querySelector(".cw-k");
    var out = el.querySelector(".out");
    function render() {
      klabel.textContent = shift.value;
      out.textContent = caesar(text.value, parseInt(shift.value, 10));
    }
    text.addEventListener("input", render);
    shift.addEventListener("input", render);
    render();
  });
})();
```

- [ ] **Step 2: Create `quantumbreach/static/js/widgets/brute-force.js`**

```javascript
(function () {
  function caesar(text, k) {
    k = ((k % 26) + 26) % 26;
    return text.replace(/[a-z]/gi, function (c) {
      var base = c <= "Z" ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + k) % 26) + base);
    });
  }
  document.querySelectorAll('[data-widget="brute-force"]').forEach(function (el) {
    el.innerHTML =
      '<label>Ciphertext</label><input class="bf-text" value="Esp dpncpe qwlr td BFLYEFX">' +
      '<div class="out bf-out"></div>';
    var text = el.querySelector(".bf-text");
    var out = el.querySelector(".bf-out");
    function render() {
      var lines = [];
      for (var k = 1; k <= 25; k++) {
        lines.push(String(k).padStart(2, "0") + ": " + caesar(text.value, -k));
      }
      out.textContent = lines.join("\n");
    }
    text.addEventListener("input", render);
    render();
  });
})();
```

- [ ] **Step 3: Create `quantumbreach/static/js/widgets/frequency.js`**

```javascript
(function () {
  document.querySelectorAll('[data-widget="frequency"]').forEach(function (el) {
    el.innerHTML =
      '<label>Text to analyse</label><textarea class="fq-text" rows="3"></textarea>' +
      '<div class="bar-freq"></div><div class="out fq-out"></div>';
    var text = el.querySelector(".fq-text");
    var bars = el.querySelector(".bar-freq");
    var out = el.querySelector(".fq-out");
    function render() {
      var counts = {}, total = 0;
      (text.value.toLowerCase().match(/[a-z]/g) || []).forEach(function (ch) {
        counts[ch] = (counts[ch] || 0) + 1; total++;
      });
      bars.innerHTML = "";
      var max = 0;
      "abcdefghijklmnopqrstuvwxyz".split("").forEach(function (ch) {
        max = Math.max(max, counts[ch] || 0);
      });
      "abcdefghijklmnopqrstuvwxyz".split("").forEach(function (ch) {
        var b = document.createElement("div");
        b.className = "b";
        b.style.height = (max ? (100 * (counts[ch] || 0) / max) : 0) + "%";
        b.title = ch + ": " + (counts[ch] || 0);
        bars.appendChild(b);
      });
      if (total) {
        var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
        out.textContent = "Most common letter: '" + top + "' (" +
          ((100 * counts[top] / total).toFixed(1)) + "%). In English that is usually 'e'.";
      } else {
        out.textContent = "";
      }
    }
    text.addEventListener("input", render);
    render();
  });
})();
```

- [ ] **Step 4: Create `quantumbreach/static/js/widgets/xor-tool.js`**

```javascript
(function () {
  function hexToBytes(h) {
    h = h.replace(/\s+/g, "");
    var out = [];
    for (var i = 0; i + 1 < h.length; i += 2) out.push(parseInt(h.substr(i, 2), 16));
    return out;
  }
  document.querySelectorAll('[data-widget="xor-tool"]').forEach(function (el) {
    el.innerHTML =
      '<label>Ciphertext (hex)</label><input class="xt-hex" value="242e2325393a2d301d2b311d3027342730312b202e273f">' +
      '<label>Single-byte key (0–255)</label><input class="xt-key" type="number" min="0" max="255" value="66">' +
      '<div class="out xt-out"></div>' +
      '<button class="btn ghost xt-all" type="button">Try all 256 keys</button>' +
      '<div class="out xt-brute"></div>';
    var hex = el.querySelector(".xt-hex");
    var key = el.querySelector(".xt-key");
    var out = el.querySelector(".xt-out");
    var brute = el.querySelector(".xt-brute");
    function decode(bytes, k) {
      return bytes.map(function (b) { return String.fromCharCode(b ^ k); }).join("");
    }
    function render() {
      var bytes = hexToBytes(hex.value);
      out.textContent = decode(bytes, parseInt(key.value, 10) & 0xff);
    }
    hex.addEventListener("input", render);
    key.addEventListener("input", render);
    el.querySelector(".xt-all").addEventListener("click", function () {
      var bytes = hexToBytes(hex.value);
      var lines = [];
      for (var k = 0; k < 256; k++) {
        var s = decode(bytes, k);
        if (/^[\x20-\x7e]+$/.test(s)) lines.push(k + ": " + s);
      }
      brute.textContent = lines.join("\n");
    });
    render();
  });
})();
```

- [ ] **Step 5: Write the failing test `tests/test_widget_files.py`**

```python
import os

WIDGET_DIR = os.path.join("quantumbreach", "static", "js", "widgets")


def test_all_widget_scripts_exist():
    for name in ["caesar-wheel", "brute-force", "frequency", "xor-tool"]:
        path = os.path.join(WIDGET_DIR, name + ".js")
        assert os.path.exists(path), path
        with open(path, encoding="utf-8") as f:
            body = f.read()
        assert 'data-widget="' + name + '"' in body
```

- [ ] **Step 6: Run test**

Run: `python -m pytest tests/test_widget_files.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add quantumbreach/static/js/widgets/ tests/test_widget_files.py
git commit -m "feat: interactive widgets (caesar, brute-force, frequency, xor)"
```

---

### Task 13: Symmetric path content (4 rooms) + authoring doc

**Files:**
- Create: `content/paths/symmetric.yaml`
- Create: `content/rooms/the-shift/room.yaml` + `task-1.md` + `task-2.md`
- Create: `content/rooms/brute-force/room.yaml` + `task-1.md`
- Create: `content/rooms/frequency-analysis/room.yaml` + `task-1.md`
- Create: `content/rooms/xor-otp/room.yaml` + `task-1.md`
- Create: `docs/AUTHORING_ROOMS.md`
- Test: `tests/test_content.py`

**Interfaces:**
- Consumes: the loader (Task 5), answer engine (Task 4), widget ids (Task 6).
- Produces: the live Symmetric path. Hashes below were generated with `sha256(answer.strip().lower())` (numeric answers use canonical numeric normalization) — matching `hash_answer`.

- [ ] **Step 1: Create `content/paths/symmetric.yaml`**

```yaml
id: symmetric
title: Symmetric Cryptography
description: One shared secret key. Learn the classic ciphers, then break them — Caesar, brute force, frequency analysis, and XOR/one-time pads.
rooms:
  - the-shift
  - brute-force
  - frequency-analysis
  - xor-otp
```

- [ ] **Step 2: Create `content/rooms/the-shift/task-1.md`**

```markdown
# The Caesar cipher

Symmetric cryptography means both sides share **one secret key**. The oldest
example is the **Caesar cipher**: shift every letter forward by a fixed number
of positions. With a shift of 3, `A → D`, `B → E`, and `HELLO → KHOOR`.

Use the wheel below. Set the shift and watch the text transform. To **decrypt**,
shift back by the same key — that shared number is the whole secret.
```

- [ ] **Step 3: Create `content/rooms/the-shift/task-2.md`**

```markdown
# Your turn

Below is a message encrypted with a Caesar shift of **3**:

```
KHOOR ZRUOG
```

Decrypt it by shifting each letter back by 3, then answer the questions.
```

- [ ] **Step 4: Create `content/rooms/the-shift/room.yaml`**

```yaml
id: the-shift
title: The Shift
summary: Meet the Caesar cipher — the simplest shared-key cipher there is.
difficulty: Easy
estimated_minutes: 10
tags: [caesar, symmetric, beginner]
prerequisites: []
tasks:
  - id: learn
    title: What is a Caesar cipher?
    body: task-1.md
    widget: caesar-wheel
    questions: []
  - id: solve
    title: Decrypt the message
    body: task-2.md
    questions:
      - id: plaintext
        prompt: What does "KHOOR ZRUOG" decrypt to? (shift 3)
        answer_type: exact
        answer: b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
        points: 15
        hint: Shift each letter back by three positions.
      - id: key
        prompt: A Caesar cipher has how many possible non-zero keys?
        answer_type: number
        answer: b7a56873cd771f2c446d369b649430b65a756ba278ff97ec81bb6f55b2e73569
        points: 10
        hint: There are 26 letters and a shift of 0 does nothing, so how many non-zero shifts remain?
```

(The `answer` above is `sha256` of the numeric-normalized string `"25"`, matching
`hash_answer("25", numeric=True)`.)

- [ ] **Step 5: Create `content/rooms/brute-force/task-1.md`**

```markdown
# 25 keys is nothing

The Caesar cipher's fatal flaw: there are only **25 possible keys**. A computer
tries them all instantly. This is a **brute-force attack** — no cleverness
required, just try everything and read whichever output makes sense.

The tool below shows all 25 decryptions of a ciphertext at once. Paste an
intercepted message and read down the list for the line that turns into English.

Intercepted message:

```
Esp dpncpe qwlr td BFLYEFX
```
```

- [ ] **Step 6: Create `content/rooms/brute-force/room.yaml`**

```yaml
id: brute-force
title: Brute Force
summary: If there are only 25 keys, you don't need to be clever — try them all.
difficulty: Easy
estimated_minutes: 10
tags: [caesar, brute-force, symmetric]
prerequisites: [the-shift]
tasks:
  - id: crack
    title: Crack it without the key
    body: task-1.md
    widget: brute-force
    questions:
      - id: secret
        prompt: The message hides a single secret word in capitals. What is it?
        answer_type: exact
        answer: 8fb7cf7a46995c95da6ad4cca750efb66946b771aca070d5948ea80ca33237b4
        points: 20
        hint: Read down the brute-force list for the line that becomes English.
```

- [ ] **Step 7: Create `content/rooms/frequency-analysis/task-1.md`**

```markdown
# When brute force isn't enough

A **substitution cipher** replaces each letter with a different fixed letter
(not just a shift). Now there are 26! ≈ 4×10²⁶ keys — far too many to brute
force. But the cipher leaks a pattern: **letter frequencies survive**.

In English, `e` is the most common letter, then `t`, `a`, `o`. Count letters in
the ciphertext, line the peaks up with the expected English order, and the
message falls apart. That is **frequency analysis**.

The tool below plots how often each letter appears. Analyse this intercept:

```
Of eknhzgukqhin yktjxtfen qfqsnlol ol zit lzxrn gy igv gyztf stzztkl qhhtqk.
Zit dglz egddgf stzztk of Tfusoli ol fgkdqssn zit stzztk t. Xlofu zitlt egxfzl
qf qzzqeatk eqf lsgvsn ktwxosr zit dqhhofu qfr ktqr zit dtllqut. Zit iorrtf
hqllvgkr ol tfzkghn.
```
```

- [ ] **Step 8: Create `content/rooms/frequency-analysis/room.yaml`**

```yaml
id: frequency-analysis
title: Frequency Analysis
summary: Substitution ciphers have too many keys to brute force — but letters betray them.
difficulty: Medium
estimated_minutes: 15
tags: [substitution, frequency-analysis, symmetric]
prerequisites: [brute-force]
tasks:
  - id: analyse
    title: Break the substitution
    body: task-1.md
    widget: frequency
    questions:
      - id: password
        prompt: The decrypted message ends by revealing a hidden password. What is it?
        answer_type: exact
        answer: 67671a2f53dd910a8b35840edb6a0a1e751ae5532178ca7f025b823eee317992
        points: 30
        hint: Map the most common cipher letter to 'e', then work outwards. The password is one word.
```

- [ ] **Step 9: Create `content/rooms/xor-otp/task-1.md`**

```markdown
# XOR and the one-time pad

Modern symmetric crypto is built on **XOR**. XOR each bit of the message with a
key bit: `c = m ⊕ k`. Because XOR is its own inverse, `c ⊕ k = m` — the same key
both encrypts and decrypts.

If the key is **truly random, as long as the message, and never reused**, this
is a **one-time pad** — provably unbreakable. The catch is practicality: you
need to securely share a key as long as everything you'll ever send. Reuse the
key, or use a short repeating key, and the guarantee collapses.

Here, a message was XOR'd with a **single repeating byte** — only 256
possibilities. The tool below decrypts hex with a key you choose, or tries all
256 keys at once. Recover the flag:

```
242e2325393a2d301d2b311d3027342730312b202e273f
```
```

- [ ] **Step 10: Create `content/rooms/xor-otp/room.yaml`**

```yaml
id: xor-otp
title: XOR & the One-Time Pad
summary: XOR is perfect — if the key is random, long, and never reused. Watch what happens when it isn't.
difficulty: Medium
estimated_minutes: 15
tags: [xor, one-time-pad, symmetric]
prerequisites: [frequency-analysis]
tasks:
  - id: recover
    title: Recover the flag
    body: task-1.md
    widget: xor-tool
    questions:
      - id: flag
        prompt: Decrypt the hex above (single-byte XOR key). What is the flag?
        answer_type: flag
        answer: 0d857849630d3e54c823c37aff13c235101a235f142c5f450bf6532edd889955
        points: 35
        hint: Click "Try all 256 keys" and read the line that looks like flag{...}.
```

- [ ] **Step 11: Create the authoring helper `quantumbreach/rooms/author.py`**

```python
"""Compute the stored answer hash for a room.yaml question.

Usage:
    python -m quantumbreach.rooms.author "photon"
    python -m quantumbreach.rooms.author --number 25
"""
import sys

from .answers import hash_answer


def main(argv):
    numeric = False
    args = []
    for a in argv:
        if a == "--number":
            numeric = True
        else:
            args.append(a)
    if not args:
        print('Usage: python -m quantumbreach.rooms.author [--number] "<answer>"')
        return 1
    print(hash_answer(args[0], numeric=numeric))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
```

- [ ] **Step 12: Verify the answer hashes with the authoring helper**

All five answer hashes in this task were generated with `hash_answer`. Confirm
the helper reproduces them (spot-check two):

Run: `python -m quantumbreach.rooms.author --number 25`
Expected: `b7a56873cd771f2c446d369b649430b65a756ba278ff97ec81bb6f55b2e73569`
Run: `python -m quantumbreach.rooms.author "hello world"`
Expected: `b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9`
If either differs, the `answers.py` normalization drifted from the plan — stop
and reconcile before continuing.

- [ ] **Step 13: Create `docs/AUTHORING_ROOMS.md`**

```markdown
# Authoring PhantomQ rooms

A room is content, not code. To add one:

1. Create `content/rooms/<room-id>/room.yaml`.
2. Write one Markdown file per task (e.g. `task-1.md`) in the same folder.
3. Add the room id to a path file in `content/paths/`.

## room.yaml

```yaml
id: my-room
title: My Room
summary: One sentence shown in listings.
difficulty: Easy        # Easy | Medium | Hard
estimated_minutes: 10
tags: [example]
prerequisites: []        # room ids recommended first (display only)
tasks:
  - id: task1
    title: First task
    body: task-1.md       # Markdown file in this folder (optional)
    widget: caesar-wheel  # optional; one of the registered widgets
    questions:
      - id: q1
        prompt: Ask something.
        answer_type: exact   # exact | number | flag | regex
        answer: <hash>        # see below
        points: 10
        hint: Optional hint.
        case_insensitive: true  # optional (default true)
        trim: true              # optional (default true)
```

## Answers

Answers are stored **hashed** so plaintext never lives in the repo or reaches
the browser. Generate the hash:

```
python -m quantumbreach.rooms.author "the answer"
python -m quantumbreach.rooms.author --number 25
```

Paste the printed hash as `answer:`. For `answer_type: regex`, put the **plain
regex pattern** in `answer:` instead (regex answers are matchers, not secrets).

## Widgets

Registered widget ids: `caesar-wheel`, `brute-force`, `frequency`, `xor-tool`.
Add a new one by creating `quantumbreach/static/js/widgets/<id>.js` (it must
mount on `[data-widget="<id>"]`) and adding `<id>` to `WIDGET_IDS` in
`quantumbreach/widgets.py`.
```

- [ ] **Step 14: Write the failing test `tests/test_content.py`**

```python
import os

from quantumbreach.rooms.answers import check_answer
from quantumbreach.rooms.loader import load_path, load_room

CONTENT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "content")


def _q(room, task_id, qid):
    from quantumbreach.rooms.loader import find_question
    return find_question(room, task_id, qid)


def test_symmetric_path_has_four_rooms():
    path = load_path("symmetric", CONTENT)
    assert path.room_ids == ["the-shift", "brute-force", "frequency-analysis", "xor-otp"]
    for rid in path.room_ids:
        load_room(rid, CONTENT)  # must parse without error


def test_known_answers_validate():
    cases = [
        ("the-shift", "solve", "plaintext", "hello world"),
        ("the-shift", "solve", "key", "25"),
        ("brute-force", "crack", "secret", "QUANTUM"),
        ("frequency-analysis", "analyse", "password", "entropy"),
        ("xor-otp", "recover", "flag", "flag{xor_is_reversible}"),
    ]
    for room_id, task_id, qid, answer in cases:
        room = load_room(room_id, CONTENT)
        q = _q(room, task_id, qid)
        assert q is not None, f"{room_id}/{task_id}/{qid} missing"
        assert check_answer(submitted=answer, stored=q.answer,
                            answer_type=q.answer_type,
                            case_insensitive=q.case_insensitive, trim=q.trim), \
            f"answer for {room_id}/{qid} did not validate"


def test_wrong_answer_rejected():
    room = load_room("brute-force", CONTENT)
    q = _q(room, "crack", "secret")
    assert not check_answer(submitted="classical", stored=q.answer,
                            answer_type=q.answer_type,
                            case_insensitive=q.case_insensitive, trim=q.trim)
```

- [ ] **Step 15: Run tests**

Run: `python -m pytest tests/test_content.py -v`
Expected: PASS. If `test_known_answers_validate` fails on `the-shift/key`, the
Step 12 regeneration was missed — regenerate the `25` hash and paste it in.

- [ ] **Step 16: Commit**

```bash
git add content/ docs/AUTHORING_ROOMS.md quantumbreach/rooms/author.py tests/test_content.py
git commit -m "feat: symmetric path content (4 rooms) and authoring guide"
```

---

### Task 14: End-to-end smoke test, README, and manual verification

**Files:**
- Create: `tests/test_smoke.py`
- Create: `README.md`
- Test: `tests/test_smoke.py`

**Interfaces:**
- Consumes: the whole app against real `content/` (not fixtures).

- [ ] **Step 1: Write `tests/test_smoke.py` (runs against real content)**

```python
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
```

- [ ] **Step 2: Run the smoke test**

Run: `python -m pytest tests/test_smoke.py -v`
Expected: PASS (both tests).

- [ ] **Step 3: Run the FULL suite**

Run: `python -m pytest -v`
Expected: every test PASS.

- [ ] **Step 4: Manually boot the app and click through**

Run: `python app.py`
Then in a browser: open `http://localhost:8000`, sign up, open **The Shift**,
use the Caesar wheel, submit `hello world` and `25`, confirm the XP chip
updates and a "Room complete" toast appears, then check `/leaderboard`.
Stop with Ctrl+C.

- [ ] **Step 5: Create `README.md`**

```markdown
# PhantomQ

A self-hosted, browser-based cryptography learning platform — TryHackMe-style
**rooms** where you learn by encrypting, attacking, and capturing flags. Covers
symmetric crypto now; asymmetric and quantum key distribution are on the way.

## Run it (Windows)

```
pip install -r requirements.txt
python app.py
```

Then open http://localhost:8000, sign up, and start the **Symmetric
Cryptography** path.

## What's here

- **Rooms engine** — rooms are authored as content (`content/rooms/<id>/`), not
  code. See `docs/AUTHORING_ROOMS.md`.
- **Symmetric path** — The Shift, Brute Force, Frequency Analysis, XOR & the
  One-Time Pad.
- **Gamification** — points, ranks (Script Kiddie → Quantum Operative), badges,
  leaderboard.
- **Auth** — dev login included; the real login page integrates via
  `docs/AUTH_CONTRACT.md`.

## Develop

```
python -m pytest -v
```

## Tech

Python 3.10+ · Flask · Waitress · SQLite · Jinja · vanilla JS. No build step,
no npm.
```

- [ ] **Step 6: Commit**

```bash
git add tests/test_smoke.py README.md
git commit -m "test: end-to-end smoke test; docs: README"
```

---

## Self-Review Notes

- **Spec coverage:** Room engine (Tasks 5–6, 9), content-as-data (5, 13), paths
  (5, 9, 10), Jinja multi-page + widgets (10–12), SQLite user-only data (2),
  auth contract + dev login (7), gamification points/ranks/badges/leaderboard
  (8, 10), Symmetric path 4 rooms (13), hashed answers + rate limiting (4, 9),
  pytest incl. smoke (every task + 14). All spec sections map to tasks.
- **Deferred (per spec, correctly absent):** Asymmetric/QKD paths, live
  multiplayer, daily challenge, real login UI.
- **Known ordering note:** Task 7's signup-flow test depends on `main.home`
  (Task 9). Handled explicitly in Task 7 Step 9 and tightened in Task 9 Step 7.
- **Content hash note:** one placeholder hash (`the-shift`/`key`) is flagged for
  regeneration in Task 13 Step 12 with a test guard in Step 15.
```
