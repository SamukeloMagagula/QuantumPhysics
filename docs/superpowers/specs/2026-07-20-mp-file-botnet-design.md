# Multiplayer File-Heist + Botnet UI — Design Spec

**Date:** 2026-07-20
**Status:** Approved (design); ready for implementation planning
**Builds on:** PhantomQ v3 "Academy" (`docs/superpowers/specs/2026-07-20-phantomq-v3-design.md`),
now merged to `main`. Closes the top v3 gap noted in `docs/FOLLOWUPS.md`.

## Summary

Quantum Intercept's file-heist and Eve botnet are live in **Solo** play but not in
**same-network Multiplayer**: the server already accepts and stores Alice's file
(sample id) and Eve's worker count as plumbing (v3 Task 14), but the multiplayer
client (`static/js/qkd-multi.js`) never renders a file picker, a botnet panel, or
a file reveal, and the server never scores the heist. This spec brings the full
mechanic into multiplayer, **server-authoritatively**: the server decides per seat
who "earned" the decrypted file and applies Eve's heist bonus; the client renders
the real file for earners and scrambled bytes for everyone else.

Stack unchanged: Flask + Waitress + SQLite, server-rendered Jinja + vanilla ES5
JS, `python app.py`, HTTP polling (~1.5s), no WebSockets/new deps. Approach A
(in-place extension) with one DRY improvement: extract the Solo botnet-grid render
into a shared helper both modes call.

## Goals

- Multiplayer Alice picks a **bundled sample** file to protect; multiplayer Eve
  deploys a **botnet** (workers) alongside her intercept choice, with the same
  animated worker grid + keys/sec·ETA·detection readout as Solo.
- On resolve, each seat sees a **per-seat reveal**: the real file decrypts for the
  seat that earned it (Bob on a clean KEEP; Eve if her botnet cracked; Alice always
  her own); everyone else sees scrambled bytes.
- Eve's **heist bonus** scores in multiplayer via the existing shared
  `engine.score_round` (no scoring fork).
- One shared botnet-render helper used by both Solo and Multiplayer (no drift).
- Reuse the existing file store + `GET /api/qkd/file/<handle>`, `QkdFile`
  (`renderInto`/`scrambleInto`), and `PhantomBotnet` — all already loaded on `/qkd`.

## Non-Goals (this spec)

- **Uploads in multiplayer** — bundled samples only for this version (uploads add a
  plaintext-storage + privacy surface across peers; deferred).
- Client-side key-bit decryption / exposing raw BB84 key arrays from the server
  (rejected in favor of server-authoritative visibility — no key material leaves
  the server).
- Making Eve's heist **score** bonus decision-independent (it stays KEEP-only per
  the shared engine; see Key Decisions). Eve's file *reveal* is already
  decision-independent (cracked ⇒ she sees it).
- Changing the Solo game's behavior beyond extracting the shared botnet render.
- Live multiplayer for the crypto *rooms* (unrelated).

## Background

Multiplayer Quantum Intercept is a server-authoritative phase machine
(`quantumbreach/qkd/service.py` + `routes.py`, tables `qkd_games`/`qkd_game_seats`)
with a thin polling client (`static/js/qkd-multi.js`). Phases: `lobby → alice_setup
→ eve_move → bob_decision → resolve → (next round | ended)`. `game_state(db, code,
user)` returns a per-seat view with secrecy already enforced (Bob's sample QBER
only during his decision; full `lastResult` only at resolve/ended). v3 Task 14
extended `_clean_action` to accept + coerce Alice's `file` (sample id or hex handle,
`isalnum`-validated) and Eve's `workers` (clamped 0–100), and `advance()` threads
them into `cfg["alice"]["file"]` / `cfg["eve"]["workers"]`. But `_resolve_scoring`
ignores them and the client renders neither. The v3 file store (`qkd/files.py` +
endpoints), `QkdFile`, and `PhantomBotnet` (JS model, loaded on `/qkd`) all exist
and are reusable.

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Decrypt model | **Server-authoritative visibility** — server marks a per-seat `fileVisible`; client renders real file (earner) or scrambled (others) | No key material leaves the server; reuses the botnet model server-side; small change |
| File source | **Bundled samples only** (mission/codes/photo) | Server already stores/serves them; every peer fetches by sample id; no upload/plaintext-privacy surface |
| Eve botnet UI | **Full animated worker grid** (workers slider + tiles + keys/sec·ETA·detection), reusing the Solo render | The "wall of machines" is the selling point; DRY via a shared helper |
| Eve's move shape | Intercept chips **select** + workers slider + one **Commit move** button → `act({p, workers})` | Eve now submits two dimensions in one action; a commit button avoids instant-submit-on-chip |
| Heist scoring | Via the existing `engine.score_round` (`HEIST_BONUS` on KEEP when `result["fileCracked"]`) | No scoring fork; consistent with Solo |
| Eve reveal vs score | Eve **sees** the file whenever cracked (any decision); **scores** the bonus only on KEEP | Matches Solo exactly; "detection ≠ confidentiality" for the reveal, without changing shared scoring |
| Missing file | Default to the `mission` sample server-side | Mirrors Solo's preloaded default; always a payload |
| Render reuse | Extract Solo botnet grid render into a shared helper | One implementation for both modes |

## Architecture

### 1. Server — `quantumbreach/qkd/service.py`

Import the botnet model: `from . import botnet`.

**`_resolve_scoring(db, g, cfg, decision)`** (the atomic `bob_decision → resolve`
claimer) gains, before the per-role scoring loop:

```python
eve_workers = int((cfg.get("eve") or {}).get("workers", 0) or 0)
final_key = int(result.get("finalKey") or 0)
file_cracked = eve_workers > 0 and botnet.crackable_within(final_key, eve_workers, botnet.ROUND_WINDOW)
result["fileCracked"] = file_cracked   # engine.score_round adds HEIST_BONUS on KEEP
```

`score_round(role, result, decision)` is unchanged and now awards Eve the bonus on
KEEP automatically. The `lastResult` dict gains a `file` block:

```python
sample = (cfg.get("alice") or {}).get("file") or "mission"
mime = files.SAMPLES.get(sample, {}).get("mime", "text/plain")
cfg["lastResult"]["file"] = {"sample": sample, "mime": mime, "cracked": file_cracked}
```

(`from . import files` for `files.SAMPLES`. If `sample` is not a known sample id —
e.g. a stray upload handle that slipped through — treat it as no payload: store
`{"sample": None, "mime": None, "cracked": file_cracked}`; the client renders
nothing/"no payload".)

**`game_state(db, code, user)`** — where it already injects `lastResult` at
resolve/ended, compute the requesting seat's visibility and rewrite the `file`
block so non-earners never receive the real sample id:

```python
if g["phase"] in ("resolve", "ended") and "lastResult" in cfg:
    lr = dict(cfg["lastResult"])                 # copy; don't mutate stored cfg
    f = dict(lr.get("file") or {})
    cracked = bool(f.get("cracked"))
    ev = bool(lr.get("eveHit"))
    dec = lr.get("bobDecision")
    visible = (
        your_role == "alice" or
        (your_role == "bob" and dec == "keep" and not ev) or
        (your_role == "eve" and cracked)
    )
    lr["file"] = {"visible": visible, "cracked": cracked,
                  "sample": f.get("sample") if visible else None,
                  "mime": f.get("mime") if visible else None}
    view["lastResult"] = lr
```

Secrecy: the real `sample`/`mime` are included only when `visible`; others get
`{visible:false, cracked}` and scramble locally. `cracked` is shown to all (it is
already reflected in the visible scores). No BB84 key material is ever serialized.

### 2. Client — `quantumbreach/static/js/qkd-multi.js`

**Alice setup controls** (`renderControls`, `phase === "alice_setup"`): add a
sample `<select id="qm-file">` with options mission/codes/photo. Submit:
`act({ n, s, file: value })`.

**Eve move controls** (`phase === "eve_move"`): replace the instant-submit intercept
chips with a combined panel:
- Intercept chips (None/Light/Heavy/Full) that set a local `pIntercept` (default 0)
  and toggle a `.on` highlight (no submit on click).
- A workers slider `#qm-w` (0–100) + a botnet grid `#qm-grid` + a readout
  (`#qm-rate`/`#qm-eta`/`#qm-detect`), rendered by the shared helper (§3) using
  `PhantomBotnet` and the current key-length estimate (Alice's `n` isn't visible to
  Eve pre-resolve; use the slider's `max`/a fixed estimate for the ETA display, or
  the last known key length — a display-only figure).
- A **Commit move** button → `act({ p: pIntercept, workers: sliderValue })`.

**Resolve reveal** (`renderControls`, `st.lastResult` branch): add a file pane
`#qm-file-view` and a caption. Given `lastResult.file`:
- `visible` → fetch bytes via the existing flow (`POST /api/qkd/file {sample}` →
  `GET /api/qkd/file/<handle>` → `arrayBuffer`) and `QkdFile.renderInto(pane, bytes,
  mime)`. Caption: Alice "Your file." / Bob "Delivered — you hold the key." / Eve
  "Your botnet cracked it!".
- not `visible` → `QkdFile.scrambleInto(pane, null)`. Caption: Bob (abort) "Aborted —
  no delivery." / Bob (eve present) "Corrupted — key mismatch." / Eve "Botnet didn't
  crack it in time." (choose caption from `cracked`/`eveHit`/`bobDecision`).

Poll cadence, seat/score/QBER/photon rendering, and the `mounted`/listener-guard
are unchanged.

### 3. Shared botnet render helper

The Solo grid/readout render (added in v3 Task 13, currently inline in
`static/js/qkd.js`) is extracted to a shared function so Solo and Multiplayer share
one implementation. Signature (final name/params fixed at plan time):

```
PhantomBotnet.renderPanel(els, workers, keyBitsEstimate, interceptP)
  els = { grid, rate, eta, detect }   // DOM elements (any may be null)
```

It renders N `<span class="worker">` tiles into `els.grid`, sets `els.rate` from
`keysPerSec`, `els.eta` from `crackEta` (Infinity → "∞ (heat death)", finite →
`Ns`), and `els.detect` from `detectionDelta(interceptP)`. `qkd.js` is refactored to
call it (behavior-preserving); `qkd-multi.js` calls it in Eve's panel. The
`prefers-reduced-motion` CSS gate on `.worker` (already in `shell.css`) covers both.

### Data flow (one round)

1. `alice_setup`: Alice submits `{n, s, file}` → `_clean_action` validates → stored
   in `cfg["alice"]` (existing).
2. `eve_move`: Eve submits `{p, workers}` → `_clean_action` clamps → `cfg["eve"]`
   (existing).
3. `bob_decision`: Bob submits `{decision}`; `_resolve_scoring` computes
   `file_cracked`, sets `result["fileCracked"]`, scores all roles (Eve gets
   `HEIST_BONUS` on KEEP), writes `lastResult.file`.
4. Each client polls `game_state`, which injects that seat's `fileVisible` + the
   real sample only for earners; the client renders the reveal pane.

### Error handling / edge cases

- No file chosen → default `mission` (server).
- 0 workers → `file_cracked` False → Eve scrambled, no bonus.
- `finalKey == 0` (short key fully sampled) → `crackable_within(0, w)`:
  `crack_eta(0, w) = 2**0 / kps = 1/kps ≈ 0s ≤ window` → crackable (a zero-length
  key is trivially "cracked"); acceptable — a degenerate key offers no protection.
- Unknown/stray `sample` id → `{sample:None}` → reveal shows "(no payload)".
- Computer-filled Eve seat: `computer_strategy` returns no `workers` → defaults 0 →
  no crack (computer Eve doesn't run a botnet; acceptable, matches "workers missing →
  0"). Optionally a plan-time tweak could let computer Eve pick a small worker count
  for spectacle — out of scope unless trivial.

## Data Model Changes (SQLite)

None. `cfg` (JSON in `qkd_games.config`) gains a `lastResult.file` sub-object; no
schema/migration. `file-heist` badge already seeded (v3). No new tables.

## Testing

- **pytest (`tests/test_qkd_multiplayer.py`)**, server-side (fast, no browser):
  - Full round, human Eve deploys many workers on a short key + Bob KEEP → the
    game reaches `ended`/`resolve`; `lastResult.file.cracked` True; Eve's seat score
    includes the heist bonus (compare to a no-workers control round).
  - Per-seat visibility via `game_state` as different users: clean KEEP → Bob's view
    `lastResult.file.visible True` with a real `sample`; Bob ABORT (or Eve present) →
    Bob `visible False`, `sample None`; Eve with a successful crack → Eve `visible
    True`; a non-earner never receives the sample id.
  - Reuse `_solo_game(app, role)` / the existing fixtures + `/api/qkd/game/<code>/act`.
- **Browser (`tests/test_ui_qkd_multi.py`)**, `two_player_pages` harness: Alice picks
  a sample, Eve deploys the botnet (grid renders), Bob keeps → a reveal pane
  (`#qm-file-view`) shows a real file or scramble; assert the pane is non-empty.
- **Shared render**: after extraction, the existing Solo QKD tests
  (`test_ui_qkd.py`, `test_ui_qkd_file.py`) must still pass unchanged (behavior
  preserved).
- **Browser-drive (`.claude/skills/run-phantomq/drive.py`)**: extend the multiplayer
  tour (or add one) to screenshot Alice's sample picker, Eve's botnet grid, and a
  file reveal pane. Every screenshot non-blank.

## Sequencing (suggested; refined in the plan)

1. **Server**: `_resolve_scoring` file_cracked + heist bonus + `lastResult.file`;
   `game_state` per-seat visibility. Ships the scored, secrecy-correct backend with
   pytest coverage (no UI yet).
2. **Shared botnet render**: extract `PhantomBotnet.renderPanel`, refactor `qkd.js`
   to use it (Solo tests still green).
3. **Client**: `qkd-multi.js` Alice sample picker, Eve botnet panel, per-seat file
   reveal; browser test + drive screenshots.

## Open Questions

None blocking. Resolved defaults: server-authoritative visibility; bundled samples
only; full animated grid via a shared render; heist bonus via the existing engine
(KEEP-only score, cracked-based reveal). Tunable at implementation: exact reveal
captions, the ETA key-length estimate shown to Eve pre-resolve, and whether computer
Eve deploys a token botnet for spectacle.
