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
