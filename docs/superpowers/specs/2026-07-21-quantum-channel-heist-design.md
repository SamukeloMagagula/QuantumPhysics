# Quantum Intercept → "Quantum Channel Heist" Redesign — Design Spec

**Date:** 2026-07-21
**Status:** Approved (design); ready for implementation planning
**Builds on:** QKD game + multiplayer file-heist/botnet (all merged to `main`,
`docs/superpowers/specs/2026-07-20-mp-file-botnet-design.md`). BB84 engine audited
correct against the reference `cipher.py` on 2026-07-21 (no physics change needed).

## Summary

The Quantum Intercept game currently visualizes a round as an abstract strip of
photons crossing a bar — it teaches little and isn't fun. This redesign replaces
that with an **interactive real-world "network heist"**: a network map (Alice →
fiber quantum channel → Bob, with Eve's tap on the wire), a **real file** that
visibly encrypts, streams as qubits, and decrypts (or shatters into noise), a
**terminal log** that narrates every event, and — the core mechanic — **Eve taps
individual qubits and picks a measuring basis**, so children directly feel *why*
measuring an eavesdropped qubit gets you caught. It's framed as a **timed heist**
(steal vs protect the classified file) with live tension and a dramatic
file-de-scramble reveal.

The proven BB84 engine, server-authoritative phase machine, file store, botnet,
and per-seat secrecy all stay. The engine gains one capability: **Eve's explicit
per-qubit taps drive the resolution** (falling back to the current random model
for the computer). Solo runs the heist real-time client-side; multiplayer submits
Eve's taps and every player watches a **synchronized, secrecy-safe replay** on the
shared map — the "intercept a live network with your friends" feeling.

Stack unchanged: Flask + Waitress + SQLite, server-rendered Jinja + vanilla ES5
JS, DOM/SVG + CSS animation (no canvas game-loop, no new deps, no Node), HTTP
polling for multiplayer. Approach A (shared visual stage + minimal engine
extension). Delivered in 4 shippable phases.

## Goals

- Replace the photon strip with a **network-map stage**: Alice/Bob nodes, a fiber
  "quantum channel", Eve's tap device on the wire, a payload thumbnail, and a
  narrating terminal log — one shared module used by Solo and Multiplayer.
- **Show a real file** (image / PDF / text / data) encrypt at Alice, travel the
  wire as qubits, and **de-scramble for the winner** / shatter to noise for the loser.
- **Hands-on Eve:** the player taps individual qubits and chooses a measuring basis
  (⊕/⊗); a right guess reads cleanly, a wrong guess disturbs the qubit and shows up
  as an error at Bob. Teaching the measurement-disturbance by doing.
- **Timed heist** framing with live tension, a clear win/lose, and a dramatic reveal.
- **Multiplayer that feels like intercepting a live network:** Eve's real taps drive
  the server resolution; all players watch a synced replay of the interception.
- Fully interactive UI; `prefers-reduced-motion` respected; no new dependencies.

## Non-Goals (this spec)

- Changing the BB84 physics/algorithm (audited correct; only the *input source* for
  Eve changes — explicit taps instead of a random fraction).
- Real-time socket sync for multiplayer (still HTTP polling; MP "live feel" comes
  from a synchronized *replay*, not frame-by-frame human racing).
- A separate calm "Learn mode" (the timed heist is the experience; the timer is
  generous + the log explains each step, and an FX/reduced-motion path covers
  classroom projection). YAGNI unless later requested.
- Uploads in multiplayer (still bundled samples only, per the prior feature).
- Replacing the phase machine, file store, botnet, scoring, or leaderboard.
- A canvas/game-engine rewrite (rejected Approach B — risks parity/secrecy).

## Background

`/qkd` hosts Solo and Multiplayer Quantum Intercept. A round is
`alice_setup → eve_move → bob_decision → resolve`. Today the animation is
`#qkd-photons`/`#qm-photons` filled with `.photon` spans that CSS-animate across a
bar; a `.qber-fill` meter shows the sample QBER; the recently-added file-reveal
panes show the decrypted/scrambled payload. The engine (`quantumbreach/qkd/engine.py`
+ `static/js/qkd.js` `resolveRound`, sharing a 7-draws-per-photon RNG contract for
JS↔Python parity) resolves a round from `{n, s, p}`: per photon it draws Alice's
bit/basis, an intercept decision (`d2 < p`) with a random Eve basis, Bob's basis,
and mismatch bits, then sifts (positions where Alice's & Bob's bases match) and
computes the sample QBER. Multiplayer is server-authoritative
(`quantumbreach/qkd/service.py`): Eve's action is `{p, workers}`, the server resolves
and builds a per-seat `lastResult` (secrecy: raw bits/bases never serialized;
file visible only to the earning seat). This redesign keeps all of that and changes
the presentation + Eve's input.

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Centerpiece | **Network map stage + terminal log**, one shared module | The "intercept a network" feeling + a hacker narration; reused by Solo & MP |
| File | The payload visibly **encrypts → streams → de-scrambles**; per-type reveal | "show images/pdf/text encrypted/decrypted"; the dramatic payoff |
| Eve mechanic | **Tap individual qubits + pick a basis** (⊕/⊗) | "see HOW Eve intercepts"; teaches measurement-disturbance by doing |
| Framing | **Timed heist** (steal vs protect), live tension, win/lose | "make it fun … play with friends" |
| Engine change | `resolve_round` accepts optional **`eveTaps`** (index→basis); else random-`p` | Make Eve's real taps drive the physics without breaking computer/legacy paths or parity |
| Solo | **Real-time client-side** heist; other roles computer | Snappy, no server round-trips; all interaction local |
| Multiplayer | Eve submits **real taps**; server resolves with them; **synced secrecy-safe replay** | "give the feeling of intercepting a live network"; keeps server authority |
| Replay secrecy | Serialize only **public BB84 info** (all bases, sampled bits) + Eve's taps; never key bits | Bases are public in BB84 (sifting); preserves the key-secrecy guarantee |
| Tech | DOM/SVG + CSS animation, vanilla ES5, no deps; `prefers-reduced-motion` | No Node/build; matches the codebase; classroom-safe |
| Structure | Shared `qkd-stage.js`; keep phase machine/files/botnet/scoring | Approach A; lowest risk, DRY |

## Architecture

### 1. Shared stage — `quantumbreach/static/js/qkd-stage.js` (`window.QuantumStage`)

A self-contained visual+interaction module. The only global is
**`window.QuantumStage.mount(rootEl, opts)`**, which builds the network-map DOM
into `rootEl` (Alice node, fiber channel, Bob node, Eve tap device, a payload
thumbnail slot, an intrusion meter, a countdown slot, and a terminal-log panel)
and **returns a stage handle** — an instance object whose methods are listed
below (so Solo and Multiplayer can each mount their own independent handle). No
game rules live here — the handle renders state and emits interaction events:

- **`handle.setPayload(mime, bytesOrThumb)`** — show the file at Alice (thumbnail
  for an image, a doc glyph + name for pdf/text/data).
- **`handle.streamQubits(states, opts)`** — render `n` qubit tokens travelling
  Alice→Bob, each showing a basis/state glyph; drives the per-qubit tap affordance
  when `opts.tappable` (Eve's turn).
- **`handle.onTap(cb)`** — register a callback fired when the player taps a qubit
  and picks a basis; yields `{index, basis}`. The stage marks the qubit "grabbed"
  and updates a live "footprint"/intrusion hint.
- **`handle.log(line, kind)`** — append a narrated line to the terminal panel
  (`kind` = info/eve/bob/alert) — e.g. "Alice encrypting secret.jpg…", "Eve taps
  qubit 7 in ⊗ — basis mismatch!", "Bob: intrusion 14%".
- **`handle.setIntrusion(pct, abortLine)`** — animate the intrusion meter (abort
  line 11%).
- **`handle.revealFile(paneEl, bytes, mime, mode)`** — the de-scramble reveal into
  `paneEl`: `mode` `decrypt` (image unblurs/line-reveals, text types out, pdf embed
  appears after a decrypt bar) or `scramble` (hex/noise). Reuses
  `QkdFile.renderInto`/`scrambleInto` for the final render; the stage adds the
  progressive animation wrapper.
- **`handle.playReplay(replay, opts)`** — for multiplayer: given a secrecy-safe
  `replay` payload (see §4), animate the whole interception deterministically on
  every client (qubits fly, Eve's tap flashes land, sampled errors light up,
  intrusion meter climbs), then hand off to `revealFile`.

Pure-ish: state comes in via method args; interaction goes out via `onTap`. The
BB84 math is **not** here — Solo calls `QuantumIntercept.resolveRound` and MP gets
the server result. Reduced-motion: all animations check the effects/reduced-motion
flag and degrade to instant end-state.

### 2. Engine — explicit Eve taps (`engine.py` + `qkd.js`)

`resolve_round(config, rng)` gains an optional `config["eveTaps"]`: a mapping of
photon index → chosen basis (`"+"`/`"x"`). Per photon `i`:

- If `i` in `eveTaps`: `intercepted = True`, `e_basis = eveTaps[i]` (Eve's chosen
  basis). Eve's read/resend then follows the existing `bb84_measure` semantics
  (`e_bit = a_bit if e_basis == a_basis else <random>`; resend `(e_bit, e_basis)`).
- Else: the **current random path** (`intercepted = d2 < p`, `e_basis = basis(d3)`).

The 7-draw-per-photon RNG order is preserved for parity: for a tapped photon the
draws that would have picked intercept/eve-basis (`d2`,`d3`) are still consumed
(and ignored) so JS and Python stay bit-identical on the non-tapped draws. **The
game uses exactly one input per round:** a human Eve supplies `eveTaps` (and no
`p`); a computer Eve supplies `p` (and no `eveTaps`). The engine resolves each
round from whichever is present — when `eveTaps` is present it governs every
photon (a photon's index is tapped ⇒ intercepted in its chosen basis, otherwise
not intercepted) and `p` is ignored; when `eveTaps` is absent it uses the current
random-`p` path. JS `resolveRound` mirrors this exactly. No change to sifting,
QBER, `finalKey`, `stolen`, `eveHit`, or scoring.

### 3. Solo — the timed heist (`qkd.js` + `qkd.html`, real-time client-side)

Replaces the solo photon/panel flow. Round as a MISSION with a countdown:

1. **Alice** picks the payload file + key length (as today).
2. The stage **streams qubits** across the fiber on the timer. When the human plays
   **Eve**, qubits are tappable: she clicks a qubit, picks ⊕/⊗, and the tap is
   recorded (`{index, basis}`); wrong-basis taps raise her visible footprint.
3. **Bob** watches the intrusion meter and calls **TRUST (keep) / ABORT**.
4. On resolve, `QuantumIntercept.resolveRound({n, s, eveTaps})` runs with the
   human's taps (computer roles auto-fill), the stage animates the outcome, and the
   winner's file **de-scrambles** via `revealFile`. Scoring/badges/botnet reuse the
   existing Solo path (Eve's botnet/workers stay available in the Eve panel).
- Timer expiry auto-resolves with taps collected so far. Non-Eve human roles just
  watch the stream + act on their turn (no tapping).

### 4. Multiplayer — real taps + synced replay (`qkd-multi.js` + `service.py`)

- **Eve's action** becomes `{taps: [{i, basis}], workers}` (botnet workers kept).
  `_clean_action` validates: each `i` an int in `[0, n)`, `basis` in `{"+","x"}`,
  the list de-duplicated and capped at `n`; malformed entries dropped (round never
  bricks — same contract as the existing coercion). `advance()` stores `eveTaps` in
  `cfg["eve"]`; server `resolve_round` uses them. A missing/empty taps list ⇒ no
  interception (or the computer's random path for a computer Eve).
- **Replay payload** in `lastResult` (secrecy-safe — public BB84 info only):
  `{n, aliceBases: [...], bobBases: [...], eveTaps: {i: basis}, sampleIndices: [...],
  sampleErrors: [...]}`. Bases are **public** in BB84 (announced during sifting), so
  serializing all bases leaks nothing; per-qubit error is revealed **only** for the
  sampled positions (which are publicly compared for the QBER check). The secret key
  bits are **never** serialized — unchanged guarantee. The per-seat file visibility
  from the prior feature is unchanged.
- **Every client** calls its stage handle's `playReplay(replay)` at resolve: the
  same deterministic animation runs for all players (qubits fly, Eve's taps flash on
  the wire, sampled errors light, intrusion meter climbs), then the per-seat file
  reveal. This delivers the shared "intercept a live network" moment without live
  sockets.

### Data flow (one round, multiplayer)

1. `alice_setup`: Alice → `{n, s, file}` (existing).
2. `eve_move`: Eve taps qubits on the stage → `{taps, workers}` submitted; validated;
   stored in `cfg["eve"]`.
3. `bob_decision`: Bob → `{decision}`; `_resolve_scoring` resolves with `eveTaps`,
   computes QBER/finalKey/stolen/eveHit + fileCracked (botnet) as today, and writes
   `lastResult` including the secrecy-safe `replay` block.
4. Each client polls `game_state`, plays the synced replay, then the per-seat reveal.

### Error handling / edge cases

- Computer Eve: no taps → random-`p` path (unchanged). Or the computer may pick a
  small random tap set for spectacle (plan-time optional, off by default).
- Malformed/oversized taps: clamped/dropped in `_clean_action`; round proceeds.
- Timer expiry (Solo): resolve with taps so far. Reduced-motion: skip animation,
  show end-state + log summary. Empty sifted key / tiny `n`: existing engine edge
  behavior (unchanged).
- PDF/generic payloads that can't "de-scramble" visually: show a decrypt progress
  bar then the `<embed>`/download; images line-reveal; text types out.

## Data Model Changes (SQLite)

None. `cfg` (JSON in `qkd_games.config`) gains `cfg["eve"]["eveTaps"]` and
`lastResult.replay`; no schema/migration. Badges/leaderboard unchanged.

## Testing

- **Engine (pytest + JS↔Py parity):** explicit `eveTaps` produce the expected
  physics — a right-basis tap reads cleanly (no added error at that qubit); a
  wrong-basis tap disturbs it; a seeded vector gives identical results in
  `engine.resolve_round` and `qkd.js resolveRound`. Random-`p` path unchanged
  (existing parity tests stay green).
- **Server (`test_qkd_multiplayer.py`):** Eve's submitted taps drive resolution
  (an all-wrong-basis tap set raises QBER; matching taps don't); `_clean_action`
  drops malformed taps without bricking; `lastResult.replay` contains bases +
  sample data and **no raw key bits** (extend the existing secrecy assertion);
  per-seat file visibility still holds.
- **Browser (Playwright, real Chrome via `tests/browser_utils.py`):** Solo — stream
  qubits, tap ≥1 qubit with a basis, resolve, the file de-scrambles in the reveal
  pane. Multiplayer — Eve submits taps, all clients render `playReplay` and the
  per-seat reveal (assert the stage + reveal populate, non-blank). Stage unit checks
  (`streamQubits` renders `n` tokens; `onTap` fires `{index, basis}`).
- **Regression:** all existing QKD Solo/MP tests remain green.
- **Browser-drive (`drive.py`):** screenshot the network-map heist (Solo tap + file
  de-scramble) and the multiplayer replay. Non-blank.

## Sequencing (4 phases, each shippable)

1. **Engine taps + shared stage:** `resolve_round` `eveTaps` (JS+Py parity) +
   `qkd-stage.js` (network map, qubit stream, tap→basis, terminal log, intrusion
   meter, de-scramble reveal) with engine + stage-unit tests. Ships the foundation.
2. **Solo timed heist:** wire the stage into the solo flow (replace the photon
   strip), timer + tapping + reveal + scoring. Ships the full single-player game.
3. **Multiplayer taps + replay:** Eve tap submission + `_clean_action` validation +
   secrecy-safe `lastResult.replay` + `playReplay` on every client. Ships MP.
4. **Polish:** timer/scoring/captions tuning, reduced-motion pass, `drive.py`
   screenshots, `docs/QKD_MULTIPLAYER.md` + FOLLOWUPS/memory updates.

## Open Questions

None blocking. Resolved defaults: shared stage (map + log); real-file de-scramble;
per-qubit tapping with basis choice; timed heist; MP real taps + secrecy-safe synced
replay; Approach A. Tunable at implementation: countdown length, qubit stream speed,
scoring weights, exact reveal animation per file type, terminal-log copy, and whether
computer Eve deploys a token tap set for spectacle.
