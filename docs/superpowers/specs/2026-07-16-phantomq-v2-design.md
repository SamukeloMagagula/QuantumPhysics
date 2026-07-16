# PhantomQ v2 — "Ghost Protocol" Design Spec

**Date:** 2026-07-16
**Status:** Approved (design); ready for implementation planning
**Builds on:** Phase 1 (`docs/superpowers/specs/2026-07-15-phantomq-platform-design.md`)

## Summary

PhantomQ v2 removes the login/signup gate, gives the whole app a strong-but-
tasteful "hacker" aesthetic with motion, and adds three interactive features: a
rule-based navigation **chatbot** (no external API), a simulated in-browser
**terminal** (PhantomShell) that can also author personal "labs", and a
standalone **QKD (BB84) mini-game**. It builds directly on the Phase 1 platform
(Flask + Waitress + SQLite, server-rendered Jinja + vanilla JS, `python app.py`)
and keeps the rooms engine, the 4 Symmetric rooms, and the progress/XP/badge/
leaderboard systems intact.

Delivered in four shippable phases on a new branch `phantomq-v2` off
`phantomq-platform`.

## Goals

- No login gate: a visitor is playing instantly under an auto-assigned guest
  identity, renameable anytime.
- A cohesive, dramatic-yet-readable "Ghost Protocol" hacker look with animation
  throughout, honoring `prefers-reduced-motion` and offering a reduce-effects
  toggle.
- A helpful, entirely client-side (no API) navigation assistant.
- A convincing simulated terminal that gives real CLI feel, including authoring
  personal practice labs (browser-stored, with a YAML export path).
- A fun standalone BB84 mini-game that teaches eavesdropper detection.

## Non-Goals (this spec)

- Real accounts/passwords/OAuth (guest identity only; a real login could be
  layered on later).
- Server-side persistence of user-created labs (they live in the browser;
  `lab export` prints YAML to graduate a lab into `content/` manually).
- The Asymmetric and QKD *learning paths* (the QKD **game** is in scope; a
  guided QKD room path remains future work).
- Multiplayer / live sessions.
- A JavaScript unit-test runner (Node is unavailable; JS logic is written as
  testable pure functions and verified by Playwright browser-drive + Python
  tests — see Testing).

## Background

Phase 1 shipped the platform + Symmetric path with a dev login + an auth
contract for a teammate's real login page. v2 changes course on auth: the user
wants login/signup removed. This **supersedes** the Phase 1 plan for a
teammate-owned login page — auth becomes optional. `docs/AUTH_CONTRACT.md` will
be updated to reflect that guest identity is the default and a real login is an
optional future addition.

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Identity | Auto-assigned guest handle (`operative_<hex>`) via signed cookie; renameable | Removes the login gate; keeps progress + leaderboard working |
| Aesthetic | Full hacker theme, tastefully done (readable, perf-capped, reduced-motion aware) | User wants "more of a hacking feeling," not unreadable chaos |
| Chatbot | Rule-based client-side intent engine over a JSON knowledge base; no API | "No API"; easy to extend; zero network |
| Terminal labs | Stored in browser localStorage now; `lab export` prints room.yaml YAML | "Local now, export later"; safe, no browser→server file writes |
| QKD game | Standalone BB84 mini-game at `/qkd`, reachable from nav | "On the side"; interactive, not part of the linear path |
| QKD scoring | Separate QKD high-score board (guest-based) + a one-time QKD badge; does NOT mix into the main crypto-rooms XP | Keeps rooms XP meaningful; still rewards + recognizes QKD play |
| Terminal command set | Nav/util + real crypto tools + `lab` authoring subcommands (see §3) | Real CLI feel + the requested lab authoring |
| Branch | New `phantomq-v2` off `phantomq-platform`, 4 phased increments | Separable from Phase 1; each phase shippable |

## Architecture

### 0. Identity (replaces login/signup)

- Remove the `/auth/login` and `/auth/signup` routes/templates and the
  `login_required` redirect gate.
- **Guest auto-provision:** a `before_request` / `current_user()` path issues a
  signed `guest_id` cookie on first visit and inserts a `users` row with a
  generated handle `operative_<6-hex>`, `is_guest = 1`, `password_hash = NULL`,
  plus its `user_stats` row. Every request thereafter resolves that guest.
- **Rename:** `POST /api/rename` (JSON `{name}`) validates 1–40 chars, updates
  `display_name`. Exposed via a nav control and the terminal `rename` command.
- Schema migration (idempotent): add `users.is_guest INTEGER NOT NULL DEFAULT 0`;
  make `password_hash` nullable (SQLite: new inserts pass NULL; existing NOT NULL
  constraint relaxed by leaving the column but allowing NULL via table already
  permitting — implement by not enforcing at app level; if the Phase 1 schema
  declared NOT NULL, add a migration that recreates the table or, simpler,
  always store an empty string for guests). Decision: store `password_hash = ''`
  for guests to avoid a table rebuild; `is_guest` distinguishes them.
- `docs/AUTH_CONTRACT.md` updated: guest identity is default; real login optional.

### 1. Reshell — "Ghost Protocol" aesthetic (`effects.js`, CSS)

- **Boot sequence:** a skippable typewriter overlay on first load per session
  (`sessionStorage` flag), e.g. `INITIALIZING PHANTOMQ… ACCESS GRANTED`.
- **Animated background:** a low-opacity matrix/particle `<canvas>`, FPS-capped,
  disabled under `prefers-reduced-motion` or when effects are toggled off.
- **CRT layer:** CSS scanline overlay + subtle glow/flicker; intensified neon
  palette on the existing token system.
- **Motion:** typewriter headings, glitch-hover on links/buttons, count-up XP,
  animated badge/room-complete toasts, progress-bar fills, card entrances —
  CSS-driven where possible.
- **Reduce-effects toggle:** persisted in `localStorage`; also auto-on when the
  OS requests reduced motion. All heavy effects gate on it.

### 2. Navigation chatbot — "GHOST" (`chatbot.js`, knowledge base JSON)

- A floating, dockable assistant styled as an AI terminal companion.
- **Intent engine:** normalize input → score against a knowledge base of intents
  (each: trigger keywords/patterns, an answer, optional action). Best match above
  a threshold answers; otherwise a fallback with suggestion chips.
- **Actions:** some intents navigate (`window.location` to `/`, `/terminal`,
  `/qkd`, a room, the leaderboard).
- **Knowledge base** covers: getting started, XP/ranks/badges, leaderboard,
  what each cipher is (Caesar/brute-force/frequency/XOR-OTP), what QKD/BB84 is,
  using the terminal, creating/exporting a lab, renaming, reduce-effects.
- Pure functions (`normalize`, `matchIntent`) are unit-testable in isolation.

### 3. Simulated terminal — "PhantomShell" (`terminal.js`, `labs.js`, `crypto.js`)

- Page at `/terminal` (nav link); the terminal is a reusable component.
- **Command parser** (pure function: string → {cmd, args, flags}) with a command
  registry. Commands:
  - Util/nav: `help`, `clear`, `whoami`, `rename <name>`, `ls [paths|rooms]`,
    `open <room-id>`, `leaderboard`, `banner`.
  - Crypto tools (reuse `crypto.js`): `caesar -e|-d <key> <text>`,
    `xor <keyhex> <text>`, `freq <text>`, `brute <text>`, `b64 -e|-d <text>`.
  - Lab authoring: `lab create` (interactive wizard: title → prompt → type
    [caesar|xor|freeform] → answer → hint), `lab list`, `lab play <id>`,
    `lab delete <id>`, `lab export <id>` (prints room.yaml-compatible YAML).
- **Labs store** (`labs.js`): CRUD over `localStorage`; a lab is
  `{id, title, prompt, type, answer, hint, createdAt}`. Answer-checking for labs
  is client-side (sandbox; earns no leaderboard XP — self-authored). `lab export`
  serializes to the room.yaml shape (hashed answer via SHA-256 in the browser, so
  exported YAML matches the server engine's format).
- **UX:** command history (↑/↓), tab-completion over the command registry,
  typewriter output, "connecting…" flourishes, error styling.

### 4. QKD side game — "Quantum Intercept" / BB84 (`qkd.js`, `crypto.js`)

- Standalone page `/qkd` (nav link).
- **BB84 simulation in JS** (ported from Phase 1's `cipher.py` BB84 helpers):
  Alice random bits+bases → optional Eve intercept-resend → Bob random-basis
  measure → sift matching bases → compute QBER.
- **Gameplay:** each round, photons animate across the channel; Eve may or may
  not be present; the player inspects the **animated QBER meter** (abort line at
  ~11%) and decides **KEEP or ABORT**. Correct call scores; wrong call loses. A
  clean sifted key with a correct KEEP builds "key bits". Rounds ramp difficulty
  (channel noise). 
- **Scoring:** local best in `localStorage`; final score posted to a dedicated
  server-side **QKD leaderboard** (`POST /api/qkd/score`, guest-based, top-N via
  `GET /api/qkd/leaderboard`). A one-time `qkd-operative` badge on first win.
- QKD scores are separate from crypto-rooms XP.

### Cross-cutting

- **Shared browser modules** under `quantumbreach/static/js/`: `crypto.js`
  (Caesar/XOR/base64/frequency/BB84 — the single source the widgets, terminal,
  and QKD game import via `<script>`), `effects.js`, `chatbot.js`, `terminal.js`,
  `labs.js`, `qkd.js`. Existing per-widget crypto is refactored to call
  `crypto.js` (DRY).
- **New routes:** `GET /terminal`, `GET /qkd`; `POST /api/rename`;
  `POST /api/qkd/score`, `GET /api/qkd/leaderboard`. Guest auto-provision in the
  request path.
- **Removed:** auth login/signup routes + templates; the login gate.
- **Nav:** add Terminal and QKD links, a rename control, an effects toggle, and
  the GHOST assistant launcher.

## Data Model Changes (SQLite)

- `users`: add `is_guest INTEGER NOT NULL DEFAULT 0`; guests stored with
  `password_hash = ''` and a generated `username`/`display_name`.
- New `qkd_scores(user_id, score, created_at)` for the QKD leaderboard.
- New badge seed: `qkd-operative` ("Quantum Operative — win a QKD round").
- Everything else (user_stats, room_progress, question_submissions, badges,
  user_badges) unchanged.

## Testing

- **Python/pytest:**
  - Guest auto-provision: first request sets a `guest_id` cookie and creates a
    guest user; a second request with that cookie resolves the same user.
  - No login gate: `/`, `/rooms/<id>`, `/terminal`, `/qkd` all reachable without
    signup; the old `/auth/login`/`/auth/signup` are gone (404) .
  - `POST /api/rename` updates `display_name`; validation.
  - QKD score post + leaderboard ordering; `qkd-operative` badge award.
  - `/terminal` and `/qkd` render.
- **JS logic** is written as pure, exported functions (command parser, chatbot
  intent matcher, BB84 sim, labs serialization). Since Node isn't available,
  these are verified by **Playwright browser-drive** against the running app
  (extend the `run-phantomq` skill): drive the terminal (run `caesar -d`, create
  and export a lab), the chatbot (ask a question, get the right answer/nav), and
  the QKD game (play a round, catch Eve), screenshotting each. A blank frame is a
  failure.

## Sequencing (4 phases, each shippable)

1. **Reshell + de-auth:** remove login/signup, guest identity + rename, the full
   Ghost Protocol aesthetic/animation system, effects toggle, updated nav.
2. **GHOST chatbot:** intent engine + knowledge base + floating UI.
3. **PhantomShell terminal:** command system + crypto tools + `lab` authoring
   (localStorage) + `lab export`.
4. **Quantum Intercept (QKD game):** BB84 sim + animated gameplay + QKD
   leaderboard + badge.

## Open Questions

None blocking. Resolved defaults: QKD scores use a **separate** leaderboard (not
main XP) + a one-time badge; the terminal command set is as listed in §3. Exact
effect timings, chatbot copy, and QKD difficulty curve are tunable during
implementation.
