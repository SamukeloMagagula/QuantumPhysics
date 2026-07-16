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

> **Question ids must be unique within a room** (across all its tasks). Progress
> and room-completion are tracked by `question_id` alone, so a duplicate id in
> another task of the same room would let one answer mark both solved.

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
