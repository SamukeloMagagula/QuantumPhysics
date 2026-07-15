# PhantomQ — Design Spec

**Date:** 2026-07-15
**Status:** Approved (design); ready for implementation planning
**Author:** Samukelo Magagula (+ team)

## Summary

PhantomQ is a self-hosted, browser-based cryptography learning platform in the
TryHackMe mold, focused on classical/symmetric crypto, public-key/asymmetric
crypto, and Quantum Key Distribution (QKD). Learners work through self-paced
**rooms** — short lessons with hands-on interactive tools and submit-the-flag
questions — organized into **learning paths**. The experience is progressive
(beginner → advanced), gamified (points, ranks, badges, leaderboard), and runs
with a single command: `python app.py`.

This spec covers **Phase 1**: the full platform plus one complete learning path
(**Symmetric**). Asymmetric and QKD paths, and a later live multiplayer mode,
are out of scope for this spec but the architecture is designed to accommodate
them without rework.

## Goals

- A polished, professional platform that meets the "recognition" bar — good
  enough to stand alongside TryHackMe-style tooling.
- Self-paced and single-player: works alone, any time, no teacher or peers
  required.
- Runs on a fresh Windows machine with `python app.py` — no npm, no build step,
  no external services.
- Content (rooms) is **authored as data**, not code, so the team can add rooms
  without touching the engine.
- A clean auth contract so a teammate's separately-built login page integrates
  without rework.

## Non-Goals (this phase)

- The Asymmetric and QKD learning paths (content only; the engine already
  supports them — they are follow-on work).
- The live 3-player "intercept" multiplayer mode (Phase 2).
- The real login/signup UI (owned by a teammate; we ship a dev login + a
  documented contract).
- A daily-challenge feature (noted for later).
- Any cloud hosting / multi-tenant concerns — PhantomQ is self-hosted on a LAN.

## Background

The team's prior repo (`Phantom_Quantum`) was a Flask "shell" (`app.py`) plus a
crypto helper module (`cipher.py`), designed around a **live, in-person
classroom game**: players were shuffled into groups of three (Alice / Bob / Eve)
who played crypto scenarios against each other. Critically, the repo as
committed is a **broken skeleton** — `app.py` imports a `labs/` package and
serves a `static/` single-page app, but **neither directory exists in the
repo**, so it cannot start. Most of what its README describes is absent.

Decision: rather than repair that model, PhantomQ adopts the **self-paced,
single-player, guided-room** model (like TryHackMe), which better fits the goal
of an impressive, always-available learning tool. The salvageable asset is the
crypto logic in `cipher.py` (Caesar, toy RSA, BB84 helpers), which we clean up
and reuse for server-side answer checking. The prior live-multiplayer concept is
preserved as a deliberate **Phase 2** on top of the room engine.

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Core model | Self-paced rooms first (Phase 1); live multiplayer later (Phase 2) | Rooms are the backbone, work solo, and earn recognition; multiplayer slots in on top later |
| Audience | Progressive beginner → advanced | Widest appeal; each path ramps easy → hard |
| Delivery | Local Flask web app, browser-based | Matches `python app.py` and the TryHackMe feel |
| Auth | Teammate owns login UI; we own the user model, auth API, and a dev login | Login built separately; a documented contract lets it drop in later |
| Frontend | Server-rendered Jinja multi-page + small vanilla-JS widgets | Simpler and more robust for a team than a SPA; polish comes from CSS. (The old repo's SPA was part of what made it confusing.) |
| Rooms | Authored as **content/data** (YAML manifest + Markdown), rendered by one engine | Adding a room never touches the engine; the whole team can author |
| Persistence | SQLite | Zero external services; works on a fresh Windows box |
| v1 scope | Full platform + complete **Symmetric** path (4 rooms) | Prove the model end-to-end, then replicate for other paths |

## Architecture

### The Room (core unit)

A **room** is the atomic unit of learning. It is an ordered list of **tasks**.
Each task has:

- **Markdown content** — the lesson (text, diagrams, images).
- An optional **interactive widget** — the hands-on element, referenced by id
  (e.g. `caesar-wheel`, `brute-force`, `xor-tool`).
- Zero or more **questions** — each with a hashed answer. Answers are submitted
  and checked **server-side**; correct answers award points and mark progress.

A room is **complete** when all of its questions are answered correctly. Room
metadata: `id`, `title`, `difficulty` (Easy / Medium / Hard), `tags`,
`estimated_minutes`, `points`, `prerequisites`, short intro/summary.

### Rooms as content, not code

Each room lives under `content/rooms/<room-id>/`:

- **`room.yaml`** — metadata, ordered tasks, and for each task its widget id and
  its questions. Each question stores a **hashed** answer plus an answer `type`
  (`exact` | `number` | `regex` | `flag`) and normalization options
  (case-insensitive, trim whitespace).
- **`task-N.md`** — the Markdown body for each task.

A single **room engine** (`quantumbreach/rooms/`) loads any room from its
manifest, renders it, and checks submitted answers. Adding a room = adding a
content folder (+ optionally one new widget). The engine is never edited to add
content.

### Learning paths

A **path** (`content/paths/<path>.yaml`) is an ordered list of room ids with a
title and description. The path overview page shows each room's status and an
overall progress bar. Phase 1 ships `content/paths/symmetric.yaml`.

### Interactive widgets

Widgets are small, self-contained **vanilla-JS components** under
`static/js/widgets/`, each mounting into a placeholder emitted by the room
template. A server-side **widget registry** (`quantumbreach/widgets/`) maps a
widget id to its template partial + script so `room.yaml` can reference widgets
by id. Phase 1 widgets: `caesar-wheel`, `brute-force` (crack-all-25),
`frequency` (histogram + substitution solver), `xor-tool`.

### Backend

- **Flask** application-factory pattern, served by **Waitress** (falls back to
  the Flask dev server if Waitress is unavailable), listening on a fixed port.
- **SQLite** for all user data. Rooms/paths are **not** in the DB — they are
  source-controlled content files. The DB stores only progress and stats.
- **Blueprints:** `auth`, `rooms`, `progress`. Supporting packages: `crypto`
  (cleaned-up `cipher.py` + XOR/OTP), `widgets`, `db`, `config`.

### Frontend

Server-rendered **Jinja** templates (`base`, `home`, `path`, `room`,
`leaderboard`, plus auth pages) with a token-based CSS design system for a
polished, modern dark aesthetic. Interactivity is provided by the vanilla-JS
widgets only — no SPA, no framework, no build step.

## Data Model (SQLite)

The DB stores **user data only**. Room/path definitions live in `content/`.

- **`users`** — `id`, `username` (unique), `password_hash`, `display_name`,
  `created_at`, `is_admin`. *This table is the shared contract with the login
  teammate.*
- **`room_progress`** — `user_id`, `room_id`, `completed_at` (nullable),
  per-room completion state.
- **`question_submissions`** — `user_id`, `room_id`, `question_id`, `correct`,
  `submitted_at`. Records attempts (drives progress + rate-limiting).
- **`user_stats`** — `user_id`, `points`, `rank`, `streak`, `last_active`.
- **`badges`** / **`user_badges`** — badge catalogue + per-user awards.

## Auth Contract

Login/signup UI is built separately by a teammate. PhantomQ provides:

- **`docs/AUTH_CONTRACT.md`** documenting: the `users` table schema; the
  session / "current user" mechanism (server-side session cookie, `user_id` in
  session); and the endpoints `POST /auth/signup`, `POST /auth/login`,
  `POST /auth/logout`.
- A minimal built-in **dev login** page so the platform is fully usable during
  development and testing.

Integration options (both documented so either works with no rework):
1. The teammate restyles/replaces the login *page* but posts to the same
   `/auth/*` endpoints.
2. The teammate owns the `/login` route entirely and integrates by inserting
   into `users` and setting the session `user_id` per the contract.

## Gamification

- **Points** per question, difficulty-weighted; room completion may grant a
  bonus.
- **Rank ladder** by total points: `Script Kiddie → Codebreaker → Keymaster →
  Cipherpunk → Quantum Operative`.
- **Badges** for path completion, streaks, and first-clears.
- **Leaderboard** — top N users by points, visible to all.
- (Later, not this phase) a **daily challenge** for a return hook.

## Phase 1 Content — the Symmetric Path

Progressive, beginner → advanced. Each ends by motivating the next.

1. **The Shift** *(Easy)* — Caesar cipher. Widget: `caesar-wheel`. Flags:
   decrypt a given ciphertext; identify the key.
2. **Brute Force** *(Easy/Medium)* — why 25 keys is nothing. Widget:
   `brute-force` (show all 25 shifts). Flag: crack an unknown-key ciphertext.
3. **Frequency Analysis** *(Medium)* — monoalphabetic substitution. Widget:
   `frequency` (letter histogram + substitution solver). Flag: break a
   substitution cipher.
4. **XOR & the One-Time Pad** *(Medium/Hard)* — XOR, why the OTP is
   perfect-but-impractical, and the **key-reuse** trap. Widget: `xor-tool`.
   Flag: exploit key reuse to recover plaintext. Closes by framing *key
   distribution* as the unsolved problem that Asymmetric and QKD paths address.

## Project Structure

```
QuantumPhysics/
  app.py                        # entry point: python app.py
  requirements.txt
  quantumbreach/
    __init__.py                 # application factory
    config.py
    db.py                       # SQLite connection + schema
    auth/                       # auth blueprint, dev login
    rooms/                      # room engine: load manifest, render, check answers
    progress/                   # progress, points, ranks, badges, leaderboard
    crypto/                     # cleaned cipher.py: caesar, rsa, bb84, xor
    widgets/                    # widget registry (id -> template + script)
    templates/                  # base, home, path, room, leaderboard, auth
    static/
      css/                      # design tokens + components
      js/widgets/               # caesar-wheel.js, brute-force.js, frequency.js, xor-tool.js
      img/
  content/
    paths/symmetric.yaml
    rooms/
      the-shift/                { room.yaml, task-*.md }
      brute-force/              { room.yaml, task-*.md }
      frequency-analysis/       { room.yaml, task-*.md }
      xor-otp/                  { room.yaml, task-*.md }
  docs/
    AUTH_CONTRACT.md            # for the login teammate
    AUTHORING_ROOMS.md          # how to write a new room
  tests/
```

## Security

- Answers are stored **hashed** in `room.yaml` and **never sent to the client**;
  submissions are checked server-side with normalization (case, whitespace) per
  the question's answer type.
- **Attempt rate-limiting** per user/question so flags cannot be brute-forced.
- Passwords hashed with Werkzeug (`generate_password_hash` /
  `check_password_hash`), per the existing repo's approach.
- Server-side sessions; `SESSION_COOKIE_SAMESITE = "Lax"`.

## Testing

- **pytest** covering:
  - `crypto` — Caesar/XOR/RSA/BB84 round-trips and known vectors.
  - `rooms` engine — manifest loading, rendering, and answer checking for each
    answer type (exact/number/regex/flag) incl. normalization.
  - `progress` — points, rank thresholds, badge awards, leaderboard ordering.
  - A **smoke test** that the app boots and serves the home page, a path page,
    and one room.

## Sequencing

- **Phase 1 (this spec):** full platform (room engine, auth contract + dev
  login, progress/points/ranks/badges, leaderboard, design system) + the
  complete **Symmetric** path (4 rooms).
- **Phase 2 (future):** author the **Asymmetric** and **QKD** paths as content;
  then add the polished live 3-player **intercept** mode as its own module,
  designed to slot in without disturbing the room engine.

## Open Questions

None blocking. Naming of individual badges/ranks and exact point values can be
tuned during implementation.
