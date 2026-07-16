---
name: run-phantomq
description: Launch the PhantomQ Flask app and drive it in a real browser (home + auto-provisioned guest identity, open a room, use the Caesar widget, submit an answer, then tour the v2 terminal, QKD game, and GHOST chatbot) with screenshots. Use when asked to run, start, or screenshot PhantomQ, or to confirm the UI works end-to-end.
---

# Run PhantomQ

PhantomQ is a Flask + Waitress + SQLite web app. This skill launches it and
drives the real UI in system Chrome via Playwright — the verified way to see it
working as a user would, not just curl a route.

## Prerequisites (already met in this dev environment)

- `pip install -r requirements.txt` (Flask, Waitress, PyYAML, Markdown).
- `pip install playwright` — the Python package. The driver uses **system Chrome**
  via `channel="chrome"`, so no `playwright install chromium` download is needed
  (Chrome or Edge must be installed, which they are on this machine).

## One-command launch + drive (recommended)

From the repo root:

```bash
python .claude/skills/run-phantomq/drive.py
```

This boots `python app.py` on an isolated port (8130) with a throwaway DB, waits
for `/healthz`, then in a headless browser: loads the home page (a guest
identity is auto-provisioned — no sign up, no login), opens the **The Shift**
room, checks the Caesar-wheel widget rendered its live output, submits
`hello world` to the first question, and confirms the "Correct! +15 XP" result
and the nav XP chip updating. It then tours the v2 surface: the PhantomShell
terminal (`/terminal`, runs `caesar -d 3 Khoor`), the Quantum Intercept QKD
game (`/qkd`, plays a round via the ABORT control), and the GHOST chatbot
(launched from its floating button, asks "how do I start"). It writes 8
screenshots (`1-home.png` … `8-chatbot.png`) to a temp dir and prints their
path, then tears the server down.

Options: `--port <N>` and `--out <dir>`.

**Look at the screenshots** — `4-room.png` (the interactive Caesar wheel + question
forms) and `5-answered.png` (the green "Correct! +15 XP" result) are the proof the
core stack works; `6-terminal.png`, `7-qkd.png`, and `8-chatbot.png` cover the v2
pages (terminal, QKD game, GHOST chatbot). A blank frame means the launch failed.

## Just launch it (no browser)

```bash
python app.py            # serves on http://localhost:8000 (LAN: 0.0.0.0)
```

Set `PHANTOMQ_SECRET_KEY` to keep guest sessions across restarts; otherwise a
random key is used each run (a startup line warns about this). `PHANTOMQ_PORT`
and `PHANTOMQ_DB` override the port and database file.

## Smoke it with curl (no browser)

```bash
curl -s localhost:8000/healthz            # {"app":"PhantomQ","status":"ok"}
curl -s -o /dev/null -w "%{http_code}\n" localhost:8000/          # 200 (home)
curl -s -o /dev/null -w "%{http_code}\n" localhost:8000/paths/symmetric   # 200
# Full flow needs a cookie jar (session): GET / to provision a guest, then POST an answer as JSON.
```

## Notes / gotchas

- **Windows console:** run with `PYTHONUNBUFFERED=1` if you want the startup
  banner to appear immediately (Python block-buffers stdout when piped).
- **Answer submission** is a client-side `fetch` POST handled by
  `static/js/app.js`; it only works in a real browser, not with a bare page load —
  which is why this skill drives Chrome rather than just fetching HTML.
- **Content lives in `content/`** (rooms as YAML + Markdown). To add a room, see
  `docs/AUTHORING_ROOMS.md` — no app code change needed.
