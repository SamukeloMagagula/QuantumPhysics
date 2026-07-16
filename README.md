# PhantomQ

A self-hosted, browser-based cryptography learning platform — TryHackMe-style
**rooms** where you learn by encrypting, attacking, and capturing flags. Covers
symmetric crypto now; asymmetric and quantum key distribution are on the way.

## Run it (Windows)

```
pip install -r requirements.txt
python app.py
```

Then open http://localhost:8000 — a guest identity is auto-provisioned, no
sign up needed — and start the **Symmetric Cryptography** path.

## What's here

- **Rooms engine** — rooms are authored as content (`content/rooms/<id>/`), not
  code. See `docs/AUTHORING_ROOMS.md`.
- **Symmetric path** — The Shift, Brute Force, Frequency Analysis, XOR & the
  One-Time Pad.
- **Gamification** — points, ranks (Script Kiddie → Quantum Operative), badges,
  leaderboard.
- **Auth** — no login required; see `docs/AUTH_CONTRACT.md` for the guest
  identity model and how a real login could layer on top later.

## v2

- **Guest identity** — visiting the site auto-provisions a guest handle
  (rename anytime); no login or signup.
- **Ghost Protocol theme** — a redesigned terminal/hacker aesthetic with an
  effects toggle for reduced-motion / low-fx preferences.
- **GHOST chatbot** — an in-page assistant that answers questions about the
  content and points you toward what to try next.
- **PhantomShell terminal** (`/terminal`) — a command-line crypto sandbox
  (`caesar`, `xor`, etc.) with `lab` authoring for saving and exporting
  custom exercises.
- **Quantum Intercept** (`/qkd`) — a BB84 quantum-key-distribution
  mini-game with its own score and leaderboard.

## Develop

```
python -m pytest -v
```

## Tech

Python 3.10+ · Flask · Waitress · SQLite · Jinja · vanilla JS. No build step,
no npm.
