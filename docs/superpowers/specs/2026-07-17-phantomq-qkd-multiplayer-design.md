# PhantomQ QKD — Role-Based & Multiplayer "Quantum Intercept" Design Spec

**Date:** 2026-07-17
**Status:** Approved (design); ready for implementation planning
**Builds on:** PhantomQ v2 "Ghost Protocol" (`docs/superpowers/specs/2026-07-16-phantomq-v2-design.md`),
specifically the single-player Quantum Intercept game (`/qkd`, `qkd.js`, `qkd_scores`).

## Summary

Turns the single-player Quantum Intercept mini-game into a **role-based BB84 game**
where a player takes one of three seats — **Alice** (sender), **Bob** (receiver), or
**Eve** (eavesdropper) — each with a distinct strategic choice, and the round
auto-resolves from those choices. It ships in two modes on the same `/qkd` page:

- **Solo** — pick a seat, the computer plays the other two. Runs entirely
  client-side (fast, no networking), reusing and extending `qkd.js`.
- **Multiplayer** — up to three students on the **same network** join one game via a
  short **code**; the server coordinates a phase-based round over the existing
  Flask + SQLite stack by **HTTP polling**. Any unfilled seat is played by the
  computer, which unifies the two modes (solo = all other seats are computer, no
  code).

It stays entirely within the current stack: **no new dependencies, no WebSockets,
still `python app.py`**. The existing single QKD leaderboard and `qkd-operative`
badge are reused.

## Goals

- Let a player choose to play **Alice, Bob, or Eve**, each with a meaningful,
  distinct lever, so the game teaches the actual BB84 idea (eavesdropper detection
  via disturbance), not just a keep/abort guess.
- A **Solo** mode against the computer that is snappy and needs no setup.
- A **same-network Multiplayer** mode for **up to 3 students** playing each other,
  with the computer filling any empty seat.
- Preserve the current stack constraints: local Flask + Waitress + SQLite,
  server-rendered Jinja + vanilla JS, `python app.py`, no external/remote resources.
- Reuse the existing `qkd_scores` leaderboard and `qkd-operative` badge.

## Non-Goals (this spec)

- **Cross-internet / real-time** play (WebSockets, matchmaking across networks).
  Multiplayer is same-LAN, coordinated by polling. Chosen explicitly.
- Photon-by-photon manual play. Interaction is **strategy-based**: each seat commits
  one choice per round and the round auto-resolves. Chosen explicitly.
- More than 3 human players, spectators, persistent accounts, or cross-session
  game history beyond the leaderboard.
- Chat between players (the GHOST chatbot and terminal already exist elsewhere).
- Reconciliation / privacy-amplification cryptographic post-processing. The game
  models sifting + QBER estimation + the keep/abort decision, which is the
  pedagogically important core.

## Background

The v2 game (`quantumbreach/static/js/qkd.js`, `window.QuantumIntercept`) is a
single-player "detective" round: `newRound()` builds a BB84 round (via
`PhantomCrypto.bb84`) with a random hidden Eve, and `judge(round, decision)` scores a
KEEP/ABORT call against an 11% abort line. There is no role choice and no
multiplayer. This spec generalizes that into three playable seats and adds a
same-network multiplayer layer, while keeping the v2 leaderboard/badge backend
(`/api/qkd/score`, `/api/qkd/leaderboard`, `qkd_scores`, `qkd-operative`) intact.

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Roles | Three seats — Alice / Bob / Eve — each with one strategic lever | The user's request; each seat gets a genuine, distinct decision |
| Interaction | Strategy-based: one committed choice per seat per round, auto-resolve | User choice; also the cleanest unit to coordinate over polling |
| Multiplayer transport | Same-network game **code** + server room + **HTTP polling** (no WebSockets) | User choice; fits Flask + SQLite; `python app.py` unchanged; app already binds `0.0.0.0` |
| Empty seats | Filled by the **computer** | 1–3 humans all work; unifies solo (all-computer others) with multiplayer |
| Solo architecture | **Client-side** JS resolution (reuse/extend `qkd.js`); Multiplayer is **server-authoritative** | Solo stays instant; multiplayer must hide secrets + be authoritative |
| Resolver | Extend the existing `PhantomCrypto.bb84` helpers (partial-intercept Eve + check-sample QBER); mirror the algorithm in Python for the server | Reuse the v2 BB84 code; one precise algorithm, two implementations kept in sync by spec + parallel tests |
| Leaderboard/badge | Reuse `qkd_scores`, `/api/qkd/score`, `qkd-operative` | The v2 backend already exists and is separate from crypto-rooms XP |
| Page | `/qkd` gains a **mode + role selector**; the current auto-start round becomes "Solo as Bob" | Evolution of the existing page, not a new URL |

## Architecture

### 1. The game model (BB84 with three levers)

A **round** runs the BB84 protocol over `n` photons. Each seat commits one choice:

- **Alice (sender)** chooses:
  - **key length `n`** — number of photons sent (bounded, e.g. 8–64).
  - **check-sample size `s`** — how many of the sifted bits to sacrifice to estimate
    the error rate. Larger `s` ⇒ a more reliable QBER estimate (Eve is easier to
    catch) but a **shorter final key** (`final = sifted − s`). A real trade-off.
  Alice's bits and bases are otherwise random (as in real BB84).
- **Eve (eavesdropper)** chooses:
  - **intercept fraction `p` ∈ [0, 1]** — the fraction of photons she
    intercept-resends (offered as a few levels, e.g. None 0 / Light 0.25 /
    Heavy 0.5 / Full 1.0, or a slider). Each intercept in the wrong basis injects
    ~25% expected error on the matching-basis (sifted) bits, so heavy interception
    spikes the QBER and gets her caught. Steal vs. stealth.
- **Bob (receiver)** measures in random bases, then sees the **sample QBER** and
  chooses **KEEP** or **ABORT**.

**Resolution algorithm** (authoritative; both the JS and Python implementations MUST
follow this exactly):

1. Alice: `bits[i] ∈ {0,1}`, `aBases[i] ∈ {+,×}`, both uniform random, for `i` in `0..n-1`.
2. Eve: for each `i`, with probability `p` intercept-resend: Eve picks a random basis
   `eBasis`, measures (`measure(bit, aBasis, eBasis)`), and the photon travelling on
   to Bob now carries `(eBit, eBasis)`; with probability `1−p` the photon is
   untouched, carrying `(bits[i], aBases[i])`. Eve records `(intercepted[i],
   eBasis[i], eBit[i])`.
3. Bob: `bBases[i] ∈ {+,×}` uniform random; `bBits[i] = measure(channelBit,
   channelBasis, bBases[i])`.
4. Sift: keep positions where `aBases[i] == bBases[i]`. Let the sifted index list be
   `S`, `m = len(S)`.
5. Check sample: take the first `min(s, m)` positions of `S` as the sample; the
   remaining `m − min(s, m)` are the **final key** positions. `sampleQBER =
   mismatches(aBit, bBit over sample) / max(1, sampleSize)`.
6. Bob decides `KEEP | ABORT` from `sampleQBER` (a human, or the computer policy).
7. Outcome & scoring (see §2). Reveal full state to all players.

Expected `sampleQBER ≈ p × 0.25` on the sifted bits (Eve is in the wrong basis half
the time; of those, half flip Bob's result). So `p=1.0 → ~25%`, `p=0.5 → ~12.5%`,
`p=0.25 → ~6.25%`. The detection line is **0.11** (matching the v2 game).

Determinism for tests: the resolver takes an injectable RNG (JS: a function returning
`[0,1)`, defaulting to `Math.random`; Python: a `random.Random` instance, seedable),
so known-seed rounds are reproducible on both sides.

### 2. Win conditions & scoring (referenced from §1 step 7)

Let `final` = final-key length (0 if ABORT), `eveHit` = whether `p > 0` and Eve
actually intercepted ≥1 photon.

| Channel | Bob decision | Defenders (Alice, Bob) | Eve |
|---|---|---|---|
| Eve intercepted | ABORT | **win** — caught her: `+DETECT` (e.g. 25) each | **loss** — 0 |
| Eve intercepted | KEEP | **loss** — fooled: 0 | **win** — `+stolen` key bits she learned |
| Clean (p=0) | KEEP | **win** — secure key: `+final` each | 0 (didn't play) |
| Clean (p=0) | ABORT | **loss** — false alarm: 0 | 0 |

- `stolen` = count of final-key positions Eve intercepted **and** measured in Alice's
  basis (so she learned the bit correctly), counted only when defenders KEEP.
- Exact point values (`DETECT`, per-bit weights) are **tunable during
  implementation**; the table fixes the *sign* and *relative* incentives, which are
  the pedagogy.
- **Leaderboard:** each human's per-round points accumulate into a game score; the
  score is posted to the existing `qkd_scores` (via `/api/qkd/score` in solo, or a
  direct server-side insert per human seat at game end in multiplayer). First score
  ≥ 1 awards the existing `qkd-operative` badge. QKD scores remain isolated from
  crypto-rooms XP.

### 3. Solo mode (client-side)

- On `/qkd`, a **mode selector** offers **Solo** and **Multiplayer**. Solo shows a
  **role picker** (Alice / Bob / Eve).
- Extend `window.QuantumIntercept` with:
  - `resolveRound(config, rng?) -> result` — the §1 algorithm as a pure function.
    `config = {n, s, p}`; `result = {sifted, sampleSize, sampleQBER, finalKey,
    intercepted, stolen, eveHit}`.
  - `computerStrategy(role, publicInfo, rng?)` — sensible randomized play for a
    computer seat (computer Alice picks `n`,`s`; computer Eve picks `p`; computer Bob
    aborts iff `sampleQBER > 0.11`, with small tunable noise).
  - `scoreRound(role, result, bobDecision) -> {delta, youWon}` — the §2 table.
- Flow: player picks role → sets their own lever (if Alice/Eve) or waits → computer
  fills others → animate photons + QBER meter (reuse existing CSS/animation) →
  reveal outcome + who-won + running score. Repeat. On leaving/`pagehide` and on new
  personal best ≥ 1, post the best score via the existing `postScore` path (already
  fixed in v2 to post the real peak).
- The current `newRound`/`judge` are **subsumed** by `resolveRound`/`scoreRound`
  ("Solo as Bob" reproduces today's keep/abort experience). Keep the animated
  photon stream, QBER meter, KEEP/ABORT controls; add Alice/Eve control panels.

### 4. Multiplayer mode (server-authoritative game room)

**Transport:** same-network. A student runs (or a teacher hosts) `python app.py`;
others open `http://<host-ip>:8000/qkd` on the classroom network. One creates a game
and shares the **code**; others join with it.

**Data model (new SQLite tables):**

- `qkd_games(id INTEGER PK, code TEXT UNIQUE, phase TEXT NOT NULL, round INTEGER NOT
  NULL DEFAULT 0, config TEXT, created_at, updated_at)` — `phase` ∈
  `lobby | alice_setup | eve_move | bob_decision | resolve | ended`; `config` is JSON
  round state (server-secret bits/bases live here, never sent raw to clients).
- `qkd_game_seats(game_id INTEGER, role TEXT, kind TEXT NOT NULL, user_id INTEGER,
  display_name TEXT, action TEXT, score INTEGER NOT NULL DEFAULT 0, PRIMARY KEY
  (game_id, role))` — `role` ∈ `alice|bob|eve`; `kind` ∈ `human|computer`; `action`
  is the JSON choice submitted for the current phase (idempotent per phase).

**Endpoints (all under the `main` blueprint, guest-authenticated via `current_user`):**

- `POST /api/qkd/game` `{role}` → creates a game, seats the caller in `role`, fills
  the other two seats as `computer` initially. Returns `{code, role}`.
- `POST /api/qkd/game/<code>/join` `{role}` → claims a free (currently `computer`)
  seat for the caller as `human`. Returns `{code, role}`; 409 if the role is already
  human-held, 404 if no such game.
- `POST /api/qkd/game/<code>/start` → host advances `lobby → alice_setup` and begins
  round 1. (Any human may start; computer seats are ready by default.)
- `POST /api/qkd/game/<code>/act` `{action}` → submits the caller's choice for the
  current phase (Alice `{n,s}`, Eve `{p}`, Bob `{decision}`). Validates it's the
  caller's turn/phase; idempotent. When the acting seat(s) for a phase are all
  submitted (humans) — computer seats auto-submit via `computerStrategy` — the server
  advances the phase, and at `bob_decision→resolve` runs the §1 resolver and §2
  scoring server-side.
- `GET /api/qkd/game/<code>` → **poll** endpoint. Returns a **role/phase-filtered**
  view: `{phase, round, yourRole, seats:[{role, kind, name, submitted}], publicInfo,
  yourPrompt, sampleQBER?, lastResult?, scores, youAreUpNow}`. Secrets are hidden by
  phase and role: Alice's raw bits/bases are never returned; `sampleQBER` is returned
  only to Bob during `bob_decision`; Eve's intercept and the full round are returned
  to everyone only at `resolve`.

**Phase state machine (per round):** `lobby → alice_setup → eve_move →
bob_decision → resolve → (next round) alice_setup … | ended`. Computer seats
auto-submit the moment their phase begins; a human seat submits via `/act`. The
server advances only when the current phase's required action is present.

**Polling & liveness:** clients `GET` state every ~1.5 s and render "waiting for
Eve…" / "your move" accordingly. Each human phase has a **soft timeout** (e.g. 60 s):
on expiry the server plays the computer default for that seat so one idle student
can't freeze the game. Games with no activity for ~30 min are marked `ended` and
skipped by cleanup; a lightweight prune runs opportunistically on create.

**Concurrency:** `/act`, `/join`, and phase advancement run inside a single SQLite
transaction that re-reads `phase` and the seat's `action`, making submits idempotent
and race-safe (double-clicks and two clients advancing at once resolve to one
transition). SQLite's default serialized access plus a short transaction is
sufficient at classroom scale (≤3 players + polling).

**Scoring:** at `resolve`, each seat's `score` is incremented per §2. At `ended` (or
per round), each human seat's accumulated score is written to `qkd_scores` for that
`user_id`, awarding `qkd-operative` on first score ≥ 1 — reusing the v2 award path.

### 5. UI / flow

- `/qkd` (`qkd.html`) renders a **mode selector** (Solo / Multiplayer). Its
  `{% block scripts %}` stays a top-level sibling of `{% block content %}` (the v2
  double-render guard), loading `crypto.js` (already global) then the game scripts.
- **Solo:** role picker → per-role control panel (Alice: key-length + sample-size
  sliders; Eve: intercept-level control; Bob: KEEP/ABORT buttons) → animated
  resolution (existing photon stream + QBER meter) → outcome + score. Reuses v2 CSS.
- **Multiplayer:** create/join panel (enter code or "Create game" → shows the code +
  a "same-Wi-Fi" hint and the host URL) → **lobby** showing the three seats (human
  names / "computer") → round view with the same per-role panels but gated by
  `youAreUpNow`, plus "waiting for <role>…" states driven by the poll → shared
  reveal + scoreboard → next round.
- New JS: `qkd-multi.js` (the multiplayer client: create/join, poll loop, render
  seats/phase, submit actions) alongside the extended `qkd.js` (solo + shared
  resolver/strategy/scoring pure functions on `window.QuantumIntercept`).

## Data Model Changes (SQLite)

- New `qkd_games` and `qkd_game_seats` tables (schema in §4). Added to `schema.sql`
  with `CREATE TABLE IF NOT EXISTS`; a matching idempotent migration in `db.py` so
  existing databases upgrade on boot (consistent with the v2 `is_guest` migration).
- No change to `qkd_scores`, `user_stats`, badges, or any v2 table. The
  `qkd-operative` badge seed already exists.

## API Surface (summary)

New: `POST /api/qkd/game`, `POST /api/qkd/game/<code>/join`,
`POST /api/qkd/game/<code>/start`, `POST /api/qkd/game/<code>/act`,
`GET /api/qkd/game/<code>`. Unchanged/reused: `POST /api/qkd/score`,
`GET /api/qkd/leaderboard`, `GET /qkd`.

## Testing

- **Python/pytest (server, no browser):**
  - Resolver known-answer cases with a **seeded RNG**: `p=0` clean → `sampleQBER 0`;
    `p=1.0` → high QBER; sift/final-key/stolen counts match hand-computed values.
  - Game lifecycle: create → join (role claim + 409 on taken role + 404 on bad code)
    → start → act through `alice_setup/eve_move/bob_decision/resolve` → scores update.
  - Computer fills empty seats; a solo-shaped game (1 human + 2 computer) resolves.
  - Poll view **secrecy**: Alice's raw bits never appear in any client view; Bob's
    `sampleQBER` only during `bob_decision`; Eve's intercept only at `resolve`.
  - Idempotent `/act` (double-submit) and soft-timeout computer takeover.
  - Multiplayer score written to `qkd_scores`; `qkd-operative` awarded on first win.
- **JS logic (pure functions on `window.QuantumIntercept`)** verified by Playwright
  `page.evaluate` with the same seeded-RNG known-answer vectors as the Python tests,
  so both resolvers provably agree: `resolveRound`, `computerStrategy`, `scoreRound`.
- **Browser drives** (gated by `requires_browser`): a Solo round as each of Alice /
  Bob / Eve reaches a reveal with a score; a **two-page** multiplayer round (two
  browser contexts join one game by code, the third seat is computer, the round
  resolves and both see the scoreboard). Screenshots each. A blank frame is a failure.
- Extend the `run-phantomq` drive tour with a Solo role-based round.

## Sequencing (phases, each shippable)

1. **Shared resolver + Solo.** Extend `PhantomCrypto.bb84` (partial-intercept Eve +
   check-sample QBER) and add `resolveRound`/`computerStrategy`/`scoreRound` to
   `window.QuantumIntercept`; rebuild `/qkd` Solo with the mode/role selector and
   per-role panels; port the animation. Pytest + Playwright for the JS resolver.
   (Fully playable single-player deliverable.)
2. **Multiplayer backend.** `qkd_games`/`qkd_game_seats` schema + migration; the
   Python resolver (mirroring §1, seeded-RNG tested to match the JS vectors);
   create/join/start/act/state endpoints; the phase machine; computer seat
   auto-submit; scoring → `qkd_scores`. Pytest for the whole lifecycle + secrecy.
3. **Multiplayer client + polish.** `qkd-multi.js` (create/join, poll loop, seat &
   phase rendering, waiting states, reveal/scoreboard); lobby/join UI + same-network
   hint; soft-timeout takeover; two-page browser test; `run-phantomq` tour update;
   docs (README + a short `docs/QKD_MULTIPLAYER.md` on hosting on a classroom LAN).

## Open Questions

None blocking. Resolved defaults: same-network polling (no WebSockets); strategy-based
one-choice-per-seat rounds; computer fills empty seats (unifying solo/multiplayer);
solo resolves client-side while multiplayer is server-authoritative with a
mirrored-and-cross-tested resolver; the existing single `qkd_scores` leaderboard and
`qkd-operative` badge are reused. Exact point values, the intercept-level presets,
slider ranges, poll interval, and timeout durations are tunable during implementation.
