# QKD Multiplayer → "Among Us for QKD" Redesign — Design Spec

**Date:** 2026-07-30
**Status:** Approved (design); ready for implementation planning
**Builds on:** Quantum Channel Heist MP (network-map stage, per-qubit Eve taps,
botnet brute-force, secrecy-safe replay — all merged to `main`,
`docs/superpowers/specs/2026-07-21-quantum-channel-heist-design.md`).

## Summary

The current multiplayer QKD game has three fixed, openly-labeled roles — every
player sees who is Alice, who is Bob, and who is Eve, in the lobby and
throughout the round. This redesign hides that mapping: players know their own
role but not each other's, and over three rounds of key exchange they gather
evidence (QBER, error-shape) to guess who's who. Eve secretly tries to steal
the key — by directly tapping qubits, by impersonating Bob's receiver for a
stretch of the stream, or by brute-forcing the sifted key afterwards — while
Alice and Bob try to read the evidence and correctly name her at a final
accusation. It's Among Us's "hidden impostor + accumulate suspicion + vote"
arc, built entirely from mechanics the engine already has.

Solo mode is untouched. The BB84 engine, secrecy model, file store, and
scoring are untouched. This is a service-layer (anonymity + accusation phase)
and UI (codenames instead of role labels, a method picker for Eve, an
accusation screen, a reveal screen) change.

## Goals

- **Hide role↔identity** from other players for the duration of a game; each
  player only ever sees their own true role. Reveal real names/roles/kind only
  at the final results screen.
- **Three named Eve methods** — Tap, Spoof Bob, Brute-force — each mapped onto
  existing engine capabilities (per-qubit taps, windowed taps, botnet workers)
  with a distinct detection signature, not new physics.
- **Evidence, not per-round scores, drives the vote.** Alice and Bob both see
  `sampleQBER` and an `errorShape` (`scattered` / `clustered` / `none`) each
  round; no other round-by-round win/lose.
- **One accusation at the end of 3 rounds.** Alice and Bob each name which of
  the other two (anonymized) seats they believe is Eve. Crew wins only if
  *both* are correct; otherwise Eve wins.
- Reuse the existing phase machine, action-submission plumbing, botnet, file
  store, and secrecy guarantees. No new DB schema.

## Non-Goals (this spec)

- Solo mode changes — stays the shipped network-heist teaching game.
- New sabotage/impostor powers beyond the three Eve methods (e.g. faking
  Bob's timer or QBER reading) — rejected as scope creep; not requested.
- Supporting more than 3 seats (spectator/juror voters) — explicitly ruled out;
  keeps the 2-suspect vote simple.
- Changing BB84 physics, sifting, QBER computation, `finalKey`, botnet crack
  odds, or the per-seat file-secrecy guarantees from the prior feature.
- New DB tables/columns — everything new lives inside the existing `cfg` JSON
  blob.
- Partial-credit or per-round scoring deciding the outcome — the accusation
  vote is the only win condition (per explicit decision below).

## Background

`/qkd` multiplayer today (`quantumbreach/qkd/service.py`) runs a single round
per game through `lobby → alice_setup → eve_move → bob_decision → resolve →
ended`, with `ROLES = ("alice", "bob", "eve")`. `create_game`/`join_game` let a
player pick an explicit role; `game_state` returns `seats: [{role, kind, name,
submitted}]` and `qkd-multi.js` renders these directly as `"<role>: <name>"`
chips — i.e. every player currently sees exactly who holds which role. Eve's
action today is `{p, taps, workers}` — `p`/random-path for a computer, explicit
per-qubit `taps` (`{i, basis}`) for a human, and botnet `workers` for a
post-hoc crack attempt, all combinable in one round. Only Bob sees
`sampleQBER`, only during `bob_decision`. Games run `ROUNDS = 3` rounds
(`_next_round` loops back to `alice_setup`); nothing today happens after the
last round beyond the phase machine returning to `alice_setup` again — there is
no game-level conclusion, only per-round `lastResult`.

This redesign adds an anonymity layer over the existing seats, splits Eve's
grab-bag action into one named method per round, adds an `errorShape`
classification to `lastResult`, and — after round 3 — a new `accusation` phase
followed by a reveal-bearing `ended` state.

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Roles | Keep the existing 3 fixed seats (alice/bob/eve) | Explicitly decided against adding spectator/juror seats — 2-suspect vote stays simple |
| Identity | Server assigns random **codenames** per seat; UI shows codename not role/kind/name for *other* seats | "hide who's who"; you always know your own role, never anyone else's until reveal |
| Eve's action | One of three **named methods** per round: Tap / Spoof Bob / Brute-force | "pretending to be Bob, IP spoofing, brute force" as distinct risk/reward choices, not flavor text |
| Engine change | **None.** All three methods resolve through the existing `eveTaps`/`workers` engine paths | Tap = today's scattered `eveTaps`; Spoof = a contiguous window of `eveTaps` sharing one basis; Brute-force = today's botnet `workers`, no qubit interception |
| Evidence | `lastResult` gains `errorShape` (`scattered`/`clustered`/`none`); **both** Alice and Bob see `sampleQBER` + `errorShape` every round | They both vote at the end, so they both need clues, not just Bob |
| Win condition | **Vote accuracy alone.** Crew wins iff both Alice's and Bob's accusations name the true Eve seat | Explicit decision — simpler than layering in heist-outcome, mirrors Among Us's ejection-decides-it logic |
| Game arc | 3 rounds of evidence-gathering, then one `accusation` phase, then reveal | Explicit decision — "building tension over time" over a single-round flip |
| Solo | Unchanged | Explicit decision — redesign is MP-only |
| Data model | Everything new lives in `cfg` JSON | No schema/migration; matches the codebase's existing pattern for round state |

## Architecture

### 1. Anonymity (`service.py`, `qkd-multi.js`)

At `start_game`, generate `cfg["anon"] = {"alice": "<codename>", "bob":
"<codename>", "eve": "<codename>"}` by shuffling a fixed pool of codenames
(e.g. `Node-Cyan`, `Node-Amber`, `Node-Violet`) onto the three roles with
`random.sample`. `game_state(db, code, user)` changes its `seats` projection:
for the requesting `user`'s own seat, include `role` and `name` as today; for
every *other* seat, replace `role`/`name`/`kind` with just `codename` and
`submitted`. This is the load-bearing change — today's `"<role>: <name>"`
chip render in `qkd-multi.js` becomes `"<codename>" [+ "(you)" on your own]`,
and the terminal log narrates events by codename (`"Node-Amber taps qubit
7…"`) rather than role, so the log itself can't be used to infer who's who
before the reveal. `scores` are dropped from the mid-game view entirely (they
were role-labeled and per-round score no longer decides anything); a
cumulative "rounds completed" indicator replaces them.

Only at `phase == "ended"` does `game_state` include a `reveal` block: `{alice:
{name, codename}, bob: {...}, eve: {...}}`, unmasking everything for the
results screen.

### 2. Eve's three methods (`service.py` `_clean_action`, no engine change)

Eve's action becomes `{method: "tap" | "spoof" | "bruteforce", ...}`; exactly
one method is active per round (mutually exclusive, unlike today's combinable
`{p, taps, workers}`).

- **`tap`** — `{method: "tap", taps: [{i, basis}, ...]}`. Validated exactly as
  today's `taps` list (deduped, capped, in-range). Resolves via the existing
  `eveTaps` engine path — scattered indices, whatever basis Eve picked per
  qubit.
- **`spoof`** — `{method: "spoof", start: int, len: int, basis: "+" | "x"}`.
  Server validates `0 <= start`, `1 <= len <= n - start`, `basis in {"+",
  "x"}`, then **expands this into an `eveTaps` map** — every index in
  `[start, start+len)` mapped to the single chosen `basis` — before calling
  `resolve_round`. From the engine's point of view this is just `eveTaps`; no
  engine change needed. The *contiguous, single-basis* shape is what produces
  a clustered error signature (see below), simulating "impersonate Bob's
  receiver for a stretch of the stream" — Eve isn't reading each qubit's
  optimal basis, she's guessing one basis for a whole window, so a wrong guess
  disturbs every mismatched qubit in that window.
- **`bruteforce`** — `{method: "bruteforce", workers: int}`. Identical to
  today's botnet `workers` field and `botnet.py` crack-odds model; `eveTaps`
  is absent so the round has **zero qubit interception** — no QBER impact at
  all, only a background chance (scored exactly as today) to crack the
  sifted key/file after the fact. Lowest detection risk, lowest reliability,
  by construction (no engine work required — it's the existing path with
  taps omitted).
- Computer Eve keeps today's random-`p` fallback when no human action is
  present (unchanged); for spectacle it may still pick a small random `tap`
  set, per the prior spec's optional note.

### 3. Evidence: `errorShape` (`engine.py` or `service.py` post-processing)

After `resolve_round` returns the existing `sampleErrors`/sampled-index array,
classify the pattern with a simple positional check (no engine change; this is
a post-processing step over already-public sampled data):

- `none` — no sampled errors.
- `clustered` — the sampled error indices, sorted, span a run where the
  max-gap between consecutive error positions is small relative to the total
  spread (i.e. errors bunch inside one contiguous region) — the `spoof`
  signature.
- `scattered` — sampled errors exist but are spread across the index range
  without a tight run — the `tap` (and computer random-`p`) signature.

Store `cfg["lastResult"]["errorShape"]` alongside the existing `sampleQBER`.
**Both** Alice's and Bob's `game_state` view include `sampleQBER` +
`errorShape` for the round just resolved (today only Bob sees `sampleQBER`,
and only during `bob_decision`) — both players are gathering evidence for the
same eventual vote. `bruteforce` rounds naturally show `errorShape: "none"`
and `sampleQBER: 0` — itself a clue (no visible tampering that round).

### 4. Accusation phase (`service.py`, new phase; `qkd-multi.js`, new screen)

After round `ROUNDS` (3) resolves and a human calls `next` as today, instead
of looping back to `alice_setup`, the phase machine transitions to a new
**`accusation`** phase (only reachable when `round == ROUNDS`). In this phase:

- Each of Alice's and Bob's seats submits `{accuse: "<codename>"}` via the
  existing `submit_action` plumbing, naming one of the *other two* seats'
  codenames. Server validation: the named codename must belong to a seat that
  is not the accuser's own; self-accusation or an unknown codename is a
  `GameError(400)` (same "bad action, round never bricks" contract as
  `_clean_action` today).
- Eve's seat also submits `{accuse: "<codename>"}` (any valid other codename)
  so the UI flow is identical for all three seats and no seat's screen
  betrays "you don't need to vote" — Eve's vote is recorded but never counted.
- Once Alice's and Bob's votes are both in, the phase resolves to `ended` and
  computes `cfg["accusationResult"] = {aliceAccused: <codename>, bobAccused:
  <codename>, eveCodename: <codename>, crewWon: bool}` — `crewWon` iff **both**
  `aliceAccused` and `bobAccused` equal `eveCodename`.
- `game_state` at `ended` includes both `accusationResult` and the `reveal`
  block (real names/roles unmasked) described in §1, plus per-round
  history (`sampleQBER`/`errorShape`/method-used per round, no key bits) so
  the results screen can show the full evidence trail against the reveal.

### Data flow (one full game, multiplayer)

1. `start_game`: assigns `cfg["anon"]` codenames (once, game-level).
2. Rounds 1–3: `alice_setup → eve_move → bob_decision → resolve` exactly as
   today, except Eve's action is `{method, ...}` and `resolve` additionally
   computes/stores `errorShape`; both Alice and Bob see the round's evidence.
3. After round 3's `resolve`, the next-round call transitions to `accusation`
   instead of `alice_setup`.
4. `accusation`: Alice and Bob submit `{accuse}`; Eve's vote is accepted but
   ignored for scoring.
5. `ended`: `accusationResult` + `reveal` computed once and stored in `cfg`;
   every client's `game_state` shows the full reveal.

### Error handling / edge cases

- Missing/malformed `method` from a human Eve: treated as `bruteforce` with
  `workers: 0` (today's "malformed action never bricks the round" contract,
  extended) rather than rejecting.
- `spoof` window out of range (`start+len > n`) or non-`+`/`x` basis: clamped
  / `GameError(400)` the same way today's `_clean_action` handles bad shapes.
- Accusation naming your own codename or a nonexistent one: `GameError(400)`,
  same contract as other bad actions — the accusation is simply not recorded
  and the client re-submits.
- A player disconnecting before submitting an accusation: covered by the
  existing `_maybe_timeout`/`TIMEOUT_SECONDS` mechanism — an unanswered
  accusation phase times out the same way an unanswered round phase does
  today (exact timeout behavior — auto-abstain vs auto-lose for crew — is a
  tunable at implementation, not a new mechanism).
- Computer-controlled Bob/Alice seats in the accusation phase: the existing
  `computer_strategy` gains a trivial `accusation` case (e.g. random guess
  between the two non-self codenames) so mixed human/computer games still
  reach `ended`.

## Data Model Changes (SQLite)

None. `cfg` gains `anon` (set once at start), each round's `lastResult` gains
`errorShape`, and the game gains `accusationResult` + `reveal` once `ended`.
No schema/migration. `qkd_games.phase` gains one new valid value:
`accusation`.

## Testing

- **Server (`test_qkd_multiplayer.py`):**
  - Anonymity: a seat's `game_state` never includes another seat's `role`,
    `kind`, or real `name` before `phase == "ended"`; only `codename` +
    `submitted`. Terminal-log / lastResult narration references codenames,
    not roles, before reveal.
  - `spoof` validation: out-of-range `start`/`len`, bad `basis` rejected the
    same way `_clean_action` rejects other bad shapes; a valid spoof window
    expands to the expected `eveTaps` map (unit-testable independent of the
    engine).
  - `errorShape` classification: a seeded all-scattered sample set → `
    scattered`; a seeded contiguous-window sample set → `clustered`; no
    errors → `none`.
  - `bruteforce` rounds: zero `eveTaps` reach the engine, `sampleQBER == 0`,
    `errorShape == "none"`, existing botnet crack-odds math unchanged.
  - Accusation: self-accusation and unknown-codename rejected; `crewWon` true
    only when both Alice's and Bob's accusations name the real Eve seat;
    Eve's own accusation never affects the outcome; computer-seat accusation
    fallback resolves the game to `ended` without a human vote.
  - Regression: existing single-round engine/secrecy/file-visibility tests
    stay green (engine itself is unchanged).
- **Browser (Playwright, `tests/browser_utils.py`):** lobby renders codenames
  not roles for other seats; a full 3-round game reaches the accusation
  screen; submitting accusations reaches the reveal screen and unmasks real
  names/roles; the evidence trail (QBER/errorShape/method per round) renders
  against the reveal.
- **Browser-drive (`drive.py`):** screenshot the anonymized lobby, an
  in-round evidence view, the accusation screen, and the reveal screen.
  Non-blank.

## Sequencing (4 phases, each shippable)

1. **Anonymity layer:** `cfg["anon"]`, `game_state` seat projection change,
   `qkd-multi.js` codename rendering (lobby + in-round + log). Ships hidden
   identities with the existing single-round game otherwise unchanged.
2. **Eve's three methods:** `{method, ...}` action shape, `spoof` window
   expansion, `bruteforce` as the existing botnet path with no taps,
   `errorShape` classification, both Alice+Bob seeing evidence each round.
   Ships the risk/reward method choice.
3. **Accusation + reveal:** new `accusation` phase after round 3, vote
   validation, `accusationResult` + `reveal` computation, results screen UI,
   computer-seat accusation fallback, timeout handling. Ships the full arc.
4. **Polish:** codename pool/theming, evidence-trail UI on the reveal screen,
   `drive.py` screenshots, `docs/QKD_MULTIPLAYER.md` + FOLLOWUPS/memory
   updates.

## Open Questions

None blocking. Resolved defaults: 3 fixed seats (no spectator/juror seats);
codename-based anonymity hiding role/kind/name until reveal; three named Eve
methods (tap/spoof/bruteforce) mapped onto existing engine paths with no
engine change; both Alice and Bob see per-round evidence; 3 rounds then one
accusation; win condition is vote accuracy alone; Solo unchanged. Tunable at
implementation: codename pool/theme, exact clustered-vs-scattered threshold,
accusation-phase timeout behavior (auto-abstain vs auto-lose), computer
accusation strategy, results-screen copy/animation.
