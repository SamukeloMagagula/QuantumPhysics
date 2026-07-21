# QKD Uploads + Full Terminal Play + Ciphertext Crack Tool — Design Spec

**Date:** 2026-07-21
**Status:** Approved (design); ready for implementation planning
**Builds on:** Quantum Channel Heist (`docs/superpowers/specs/2026-07-21-quantum-channel-heist-design.md`,
merged to `main`) and the multiplayer file-heist/botnet feature
(`docs/superpowers/specs/2026-07-20-mp-file-botnet-design.md`).

## Summary

Six additions to Quantum Intercept, all client-JS-first with the Python
surface held to the minimum the architecture actually requires:

1. **Uploads everywhere.** Solo already supports uploading a personal
   image/text/PDF as the round's payload (100% client-side, no server
   round-trip). Multiplayer gets the same upload option in Alice's panel —
   the backend (`POST /api/qkd/file`) already accepts a real multipart
   upload generically; this was built in the original file-heist work and
   never wired to the MP client. Adding it is a frontend-only change.
2. **Full terminal parity for Solo.** Today, typing a terminal command
   (`shell-qkd.js` → `QkdActions`) does not move the visible game at all —
   `qkd.js`'s Solo flow keeps its own local `pending`/timer state and only
   *mirrors into* `QkdActions` after the fact, for state-inspection parity.
   This spec makes `QkdActions` the **one real game state**: `qkd.js`
   becomes a subscriber that renders the stage/score/reveal from it, and
   both mouse clicks and terminal commands drive it through the same intent
   functions. The terminal grows a tap-based command set (`eve tap`,
   `eve commit`) matching the Channel Heist mechanic, plus `alice upload`.
3. **A standalone ciphertext crack tool.** `qkd export` (terminal) produces
   a portable ciphertext blob (works with the terminal's existing `>`
   redirection into the VFS); `qkd crack <path>` or `qkd crack --upload`
   brute-forces it — a **real** brute force (every candidate key-bit pattern
   up to a length cap, validated against the plaintext's expected shape),
   not a fake progress bar. This satisfies "upload an encrypted file and
   try to crack it," entirely client-side.
4. **Upload preview.** Whoever uploads a file (Solo's `#al-upload`, the new
   MP `#qm-upload`, or the terminal's `alice upload`/`qkd crack --upload`)
   immediately sees what they picked, before it's staked/encrypted —
   **only for the uploader**; Bob/Eve's earn-to-reveal secrecy is
   unaffected, since nobody else's view changes.
5. **A persistent live activity feed** on the `/qkd` page — a sidebar
   showing a running, readable log of what's happening in the round
   ("Alice staked secret.jpg", "Eve tapped qubit 7 in ⊗", "Bob KEEPS the
   key", "File decrypted!"), shared by Solo and Multiplayer, replacing the
   small in-stage log box with a proper, always-visible panel.
6. **A `/qkd` page layout rework** to host the feed sidebar alongside the
   stage cleanly (two-column layout; the rest of the site is unchanged —
   this is not a repeat of the earlier site-wide HTB restructure).

## Goals

- Multiplayer Alice can upload her own file, exactly like Solo already can.
- The entire Solo heist (Alice setup incl. upload, Eve's per-qubit taps +
  botnet, Bob's decision) is **fully playable by typing terminal commands**
  — the terminal drives the real stage/score/reveal, not a shadow copy.
- A standalone, terminal-first tool: export a round's ciphertext, then
  brute-force it (your own export, or any uploaded file) with a genuine
  keystream attack — teaching why short keys fall and long ones don't.
- All new logic is JavaScript. Python is touched only where the MP upload
  path structurally requires it — and given the backend already accepts
  generic uploads, that may end up being **zero new Python code**.
- Anyone who uploads a file sees a preview of exactly what they picked,
  immediately, before it's encrypted — across every upload entry point
  (Solo panel, MP panel, both terminal upload commands).
- `/qkd` has a persistent, readable live activity feed (Solo and MP) so a
  player (or a classroom watching one screen) can follow what's happening
  without squinting at the small in-stage log.
- The `/qkd` page layout accommodates the feed without cramping the stage.

## Non-Goals (this spec)

- No BB84 physics change (unchanged from the audited engine).
- No change to multiplayer secrecy (`lastResult.replay` stays public-only;
  no key bits ever serialized — unchanged guarantee from the prior spec).
- The crack tool does not affect Solo/MP scoring, XP, or badges — it is a
  standalone practice tool. (Easy to wire in later if wanted.)
- No live-streaming brute-force progress inside a single terminal command
  (the command runs to completion and prints one final result — matches
  every other terminal command's request/response shape). Deferred.
- No change to the file store's size/MIME limits (still 256 KB,
  `text/plain`/`image/png`/`image/jpeg`/`application/pdf`/`application/octet-stream`).
- Multiplayer terminal-driven play is **not** in scope — `QkdActions` (and
  therefore the terminal commands that call it) only exists on the client
  playing Solo; this was already a known, accepted cross-page/cross-mode
  limitation before this spec and remains one.
- The upload preview shown to **other** players (Bob/Eve in MP) is
  unchanged — still nothing, until they earn the reveal at resolve. Only
  the uploader's own view gains a preview.
- The terminal's upload preview is a **text summary** (filename, MIME,
  size, and a short text snippet for `text/plain`) — not a rendered image
  thumbnail inside the terminal DOM. Visual thumbnail previews are scoped
  to the two on-page upload panels (Solo, MP), which already have a natural
  place to render one.
- The live feed is **not** a spectator feature — it shows only the current
  player's own game (Solo round, or the MP game they're seated in), not
  other users' games elsewhere on the site. No new realtime transport is
  introduced; the feed is driven by the same client-side state changes
  (Solo) and the existing ~1.5s HTTP poll (MP) already in place — "live"
  means "kept up to date automatically," not push/websocket-real-time.
- The layout rework is scoped to `/qkd` only. The rest of the site
  (landing, dashboard, terminal, rooms, leaderboard) is unchanged — this is
  not a repeat of the earlier site-wide restructure.

## Background

`quantumbreach/static/js/qkd-actions.js` is the shared action layer
introduced for button/terminal parity (v3). Its `bobDecide(decision,
presolved)` accepts an already-resolved result and just *records* it;
`qkd.js`'s Solo `DOMContentLoaded` block computes the actual round via its
own `pending` object and calls `resolveAndAwaitBob()`, mirroring into
`QkdActions` afterward purely so `QkdActions.state()` reflects reality for
inspection. `shell-qkd.js`'s `eve intercept <pct>` therefore only ever
updates `QkdActions.state().eve.p` — a value `qkd.js`'s real resolve path
never reads. The Channel Heist redesign (this session, merged) replaced
button-driven interception with per-qubit tapping (`stage.onTap`,
`pending.eveTaps`), but `QkdActions` was never updated to carry taps, so the
terminal's Eve commands are now doubly stale — pre-tap syntax, driving
nothing visible.

The MP file/botnet backend (`quantumbreach/qkd/routes.py`
`qkd_file_upload`) already branches on `"file" in request.files` vs. a
JSON `{sample}` body — genuine upload support has existed since that
feature shipped; `qkd-multi.js`'s Alice panel simply never offered an
upload control, only the sample `<select>`.

PhantomShell's virtual filesystem (`static/js/vfs.js`, `PhantomVFS`) and its
existing `>`/`>>` output-redirection in `terminal.js`'s `run()` are reused
as-is for the export/crack tool — no terminal-core changes needed.

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Terminal parity mechanism | **QkdActions becomes the single source of truth**; `qkd.js` subscribes and renders from it | The only way terminal commands genuinely play the game instead of writing to an unread mirror (rejected: a bridge/back-door into `qkd.js`'s closures — reintroduces the dual-state-drift bug already fixed once) |
| Eve's terminal input | `eve tap <i> <basis>` + `eve commit [--workers N]`, replacing `eve intercept <pct>` | Matches the Channel Heist tap mechanic; `<pct>` has no meaning in the tap model |
| MP upload | Add an upload control to the existing sample `<select>`; reuse `POST /api/qkd/file`'s existing multipart branch | Backend already supports it generically; zero-to-minimal Python |
| "Encrypted key" ask | A **ciphertext export/crack tool**, standalone from live rounds | Matches "upload an encrypted file and try to crack it" most literally; keeps live-round secrecy model untouched |
| Crack algorithm | **Real brute force**: try every key length 1..cap, every candidate bit-pattern at each length, validate plausibility per mime | A genuine demonstration (short keys fall, long ones don't) rather than a scripted animation — matches the game's teaching goal |
| Export format | `{v:1, mime, cipher: base64}`, no declared key length | A real attacker doesn't know the key length either; the crack tool must discover it, which also makes the format usable against non-export files |
| Crack tool scope | Standalone JS module, not wired to scoring | YAGNI; avoids entangling a practice tool with the scored game loop |
| Language split | New logic is JS; Python touched only if structurally required | Explicit user preference; MP upload may require zero new Python since the endpoint already exists |
| Preview visibility | **Uploader-only** — Bob/Eve's view never changes before resolve | Protects the game's core earn-to-reveal lesson; showing the raw file to everyone on upload would spoil the round before it starts |
| Preview rendering | Reuse `QkdFile.renderInto` directly (no decrypt-animation wrapper) for the two on-page panels; a text summary line for the two terminal upload commands | One tested render path, no new renderer; terminal has no visual-thumbnail affordance today, so a text summary is the honest, low-risk scope |
| "Live stream" meaning | A **persistent activity feed** sidebar (Solo + MP), not spectator mode or real video | Matches what the codebase can actually support today (HTTP polling, one client's own game) without new transport or discovery infrastructure |
| Feed data source | The `QkdActions` subscriber (Solo) / the existing MP poll handler emit log lines on state transitions — **one log call site per event**, not scattered across every button handler | Consistent with QkdActions-as-source-of-truth (this spec's Architecture §1); avoids the log drifting out of sync with what the buttons/terminal actually did |
| Feed host element | **One shared `#qkd-feed` sidebar** in `qkd.html`, passed to both the Solo and MP `QuantumStage.mount()` calls as `opts.feedEl` | Only one mode is visible at a time (existing hidden-attribute toggle); avoids two independent log panels that could show stale/wrong content |
| Redesign scope | `/qkd` page layout only | Explicit user confirmation — not a repeat of the site-wide HTB restructure |

## Architecture

### 1. `qkd-actions.js` — real game state

Extends the existing state shape (`{phase, payload, alice:{n,s}, eve:{p,workers},
lastResult}`) with `eve.taps` (array of `{i, basis}`) and adds:

- `setPayloadFromBytes(mime, bytes)` — sets `st.payload` directly (used by
  both the upload UI and `alice upload` terminal command; distinct from the
  existing sample-fetching `loadPayload`, which stays for the sample
  dropdown path).
- `eveTap(i, basis)` — pushes `{i, basis}` onto `st.eve.taps` (de-duplicated
  by index; last basis for a given index wins), `emit()`s.
- `eveCommit(o)` — resolves the round via `QuantumIntercept.resolveRound({n,
  s, eveTaps: st.eve.taps})` (using the real tap list, not a random `p`),
  applies the existing botnet `fileCracked` logic, sets `lastResult`,
  `phase = "resolve"`, `emit()`s. This absorbs what `qkd.js`'s
  `resolveAndAwaitBob()` does today for the Eve-as-human path.
- `bobDecide(decision, presolved)` — unchanged signature; still accepts a
  presolved result for the case where Alice/Eve are computer and the round
  was already resolved before Bob's turn (mirrors current behavior).

`subscribe(fn)` (already present, currently unused) becomes load-bearing:
`qkd.js`'s Solo block registers one subscriber that renders the stage
(`streamQubits`, tap wiring via `stage.onTap` calling `QkdActions.eveTap`),
the score chip, and the file-reveal panes purely from `QkdActions.state()`.
The countdown timer stays a `qkd.js`-local concern (view-only; it calls
`QkdActions.eveCommit()` on expiry, same as the terminal's `eve commit` or a
manual click would).

**Migration shape:** `qkd.js`'s Solo `DOMContentLoaded` block currently
holds `pending`, `myRole`, `score`, `peak`, `currentPayload`, `evTimer` as
closures and computes the round directly. After this change: `myRole` stays
local (role selection is a view concern, not game state — QkdActions has no
notion of "which role am I playing," since Solo lets one person embody
different roles across rounds); `pending`/`currentPayload`/the resolved
`result` move into `QkdActions.state()`; `score`/`peak` can stay in `qkd.js`
(scoring/XP posting is a view-side concern reading `state().lastResult`,
same pattern as today's mirror, just now reading the *authoritative* copy
instead of a stale one). Button click handlers (`#al-send`, `.stage
onTap`-driven taps, `#ev-commit`, `#btn-keep`/`#btn-abort`) call `QkdActions`
functions directly instead of building `pending` locally.

### 2. `shell-qkd.js` — full command set

```
alice set --len N --sample S --file <name>   (existing; <name> also
                                                accepts a real upload handle)
alice upload                                  (NEW: opens a native file
                                                picker, reads via FileReader,
                                                calls setPayloadFromBytes)
eve tap <index> <basis>                       (NEW: index is 0-based,
                                                matching the qubit's
                                                position in the stream;
                                                basis is "+" or "x"; calls
                                                QkdActions.eveTap)
eve commit [--workers N]                      (NEW: replaces "eve intercept
                                                <pct>"; calls eveCommit)
bob keep|abort                                (existing; now drives the
                                                real, visible round)
qkd status                                    (existing)
qkd export                                    (NEW: prints the current
                                                round's ciphertext export as
                                                JSON text — see §3)
qkd crack <path> [--maxbits N]                (NEW: reads a file from the
                                                VFS and brute-forces it)
qkd crack --upload [--maxbits N]              (NEW: same, against a freshly
                                                uploaded OS file)
```

`eve intercept <pct>` is removed (no longer meaningful under the tap
model); `man`/`help` text updated to match. All commands guard with the
existing "qkd: open the QKD page first" message when `QkdActions` is
undefined (unchanged cross-page limitation).

### 3. `qkd-crack.js` — standalone ciphertext export + brute force

New file, no dependency on `QkdActions`, the phase machine, or the server
(beyond reusing `QkdFile`'s existing keystream functions, already loaded on
`/qkd`).

- `exportCiphertext(payload, keyBits)` → `{v: 1, mime: payload.mime,
  cipher: base64(QkdFile.encrypt(payload.bytes, keyBits))}`. Called by `qkd
  export` against the current round's `lastResult` (Alice's final key bits
  and payload — both already client-side in the Solo game).
- `bruteForce(bytes, mime, opts)` → a Promise resolving to `{cracked: bool,
  keyBits: [...]|null, attempts: n, elapsedMs: n}`. For `length` from 1 to
  `opts.maxBits` (default 22): enumerate all `2^length` bit patterns
  (chunked across `setTimeout(0, ...)` batches — e.g. 50,000 attempts per
  tick — so the tab stays responsive and the terminal command awaits one
  Promise); for each, XOR-decrypt via `QkdFile.decrypt(bytes, candidate)`
  and test **plausibility**:
  - `text/plain`: ≥90% of bytes are printable ASCII (0x20–0x7E) or common
    whitespace.
  - `image/png`: first 8 bytes match the PNG magic number.
  - `application/pdf`: first 4 bytes are `%PDF`.
  - other/`application/octet-stream`: falls back to the text heuristic
    (best-effort; declared as a known limitation, not a hard requirement).

  First plausible hit stops the search and resolves `cracked: true` with
  the winning bits; exhausting `maxBits` resolves `cracked: false`. A
  length cap above ~22–24 is deliberately impractical in-browser (matches
  the existing `PhantomBotnet` "heat death" teaching point) — `maxBits` is
  overridable via `--maxbits` for demonstration purposes but the terminal
  help text notes the practical ceiling.
- `qkd export` (terminal) requires an existing `lastResult` (a round must
  have resolved) and prints the JSON string — piping it through the
  terminal's existing `>`/`>>` redirection (already implemented in
  `terminal.js`) writes it into the VFS with no new redirection code.
- `qkd crack <path>` reads the file via `PhantomVFS.readFile` (VFS content
  is always a JS string). If the string parses as JSON matching `{v:1,
  mime, cipher}`, decode `cipher` from base64 to bytes and use `mime` for
  plausibility checks. Otherwise, treat the raw string as the ciphertext
  itself: convert it to bytes via `charCodeAt` per character (the same
  string↔bytes convention `QkdFile`/`PhantomCrypto` already use elsewhere
  in this codebase), defaulting `mime` to `application/octet-stream`. This
  lets an arbitrary VFS file (e.g. one written by `echo`/`cat >`) also be
  thrown at the cracker, not just our own export format.
- `qkd crack --upload` triggers a hidden `<input type=file>`, reads the
  picked file as raw bytes via `FileReader.readAsArrayBuffer`, and runs
  `bruteForce` directly against those bytes (mime guessed from the
  browser-reported file type, defaulting to octet-stream).

### 4. Multiplayer upload (`qkd-multi.js`)

Alice's `#qm-file` control gains an `"upload"` option; selecting it reveals
a hidden `<input type=file>` (mirroring Solo's existing `#al-file`/`#al-upload`
pattern exactly). On change, the file is POSTed as multipart form data to
the existing `/api/qkd/file` endpoint (no JSON body — the endpoint already
branches on `"file" in request.files`), and the returned `handle` is
submitted via the existing `act({..., file: handle})` path — identical to
how a sample id is submitted today, since `_clean_action`'s alice branch
already accepts any string that is `len<=32 and isalnum()`, which every
real upload handle (`secrets.token_hex(8)`, 16 hex chars) satisfies.
**No Python changes anticipated** for this piece; confirmed at
implementation time by grep before assuming so.

### 5. Upload preview

Applies to all four upload entry points once they exist (Solo `#al-upload`
already ships today; MP `#qm-upload` from §4; `alice upload` and `qkd crack
--upload` from §2/§3).

- **Solo/MP panels:** a small preview pane (`#al-preview` / `#qm-preview`)
  sits next to the upload control. On file selection — using the bytes
  already read locally via `FileReader` for the existing upload flow, no
  new I/O — call `QkdFile.renderInto(previewEl, bytes, mime)` directly
  (the same low-level renderer the post-resolve reveal uses, but WITHOUT
  the `stage.revealFile` decrypt-animation wrapper — this is an immediate
  confirmation, not a dramatic reveal). The preview updates every time a
  new file is picked; switching back to a bundled sample clears it.
- **Terminal (`alice upload`, `qkd crack --upload`):** after the native
  file picker resolves, print a one-line text summary: filename, MIME type,
  size in bytes, and — for `text/plain` only — the first ~100 characters of
  the decoded content as a quoted snippet. No image/PDF rendering inside
  the terminal DOM (declared boundary; see Non-Goals).
- This preview is **local and immediate** — it happens before any upload
  POST (MP) or round resolution (Solo/terminal), using bytes the browser
  already has in hand. Nothing about it changes what Bob/Eve can see.

### 6. `/qkd` page layout rework

The Solo (`#qkd-solo`) and Multiplayer (`#qkd-multi`) containers are
wrapped in a shared two-column grid: the existing stage/controls/panels
column stays as-is (left, wider), and a new `<aside id="qkd-feed">`
sidebar sits alongside it (right). Both `#qkd-solo` and `#qkd-multi` keep
their existing `hidden`-attribute mode-toggle (only one visible at a
time); `#qkd-feed` is a **single shared element** outside both, always
visible once a mode is chosen, so switching Solo↔Multiplayer doesn't
recreate or duplicate the feed. Below the site's existing narrow-viewport
breakpoint (matching the pattern already used for the app shell), the grid
collapses to a single column with the feed stacked below the stage rather
than beside it. No other page's layout changes.

### 7. Live activity feed (`#qkd-feed`, shared by Solo + MP)

Extends `QuantumStage.mount(root, opts)` (the shared stage module built in
the Channel Heist work) to accept `opts.feedEl`: an external element to
render log lines
into, replacing the internal `.stage-log` box when provided (falls back to
the existing internal log if `opts.feedEl` is omitted — no behavior change
for any other caller). Both the Solo and MP `mount()` calls in `qkd.js`/
`qkd-multi.js` pass the same `#qkd-feed` reference from §6, so there is one
feed, one source of truth, no duplicate/independent log state.

**Log call sites** (all via the existing `handle.log(line, kind)`, no new
logging mechanism): the `QkdActions` subscriber added in Architecture §1
logs a line on every meaningful state transition it already observes —
`alice` phase entered with a payload (`"Alice staked <filename-or-sample>."`),
each `eveTap` (`"Eve tapped qubit <i> in <basis>."`, already present via the
existing `stage.onTap` wiring — kept as-is), `eveCommit`/resolve
(`"Round resolved — intrusion <pct>%."`, already present), and the
reveal outcome (`"Bob KEEPS/ABORTS the key."`, `"File decrypted!"` /
`"File cracked!"` / `"Delivery failed."` depending on `lastResult`/`file`).
This consolidates logging at the state layer instead of scattering
`stage.log()` calls across every button handler, so the feed can never
show something that didn't actually happen to the shared state. The feed
is append-only across rounds within a session (not cleared by `advance()`,
unlike the qubit lane), capped at the last ~200 lines with auto-scroll to
the newest entry, so a full session's history is browsable without
unbounded DOM growth.

**Multiplayer's equivalent log sites:** MP has no `QkdActions` (see
Non-Goals), so its log lines are added at the parallel points in
`qkd-multi.js`'s existing `render()`/`renderControls()` poll handler —
the same functions that already detect a phase change or a new
`lastResult` each poll. Concretely: when `render()` observes the phase
just became `"alice_setup"`→`"eve_move"` with a payload set, log
`"Alice staked <sample/filename>."`; `playReplay` already logs each
tapped qubit (unchanged, existing behavior from the Channel Heist work);
when a fresh `lastResult` appears, log the decision and reveal outcome the
same way §7's Solo side does. This mirrors the Solo log lines
event-for-event without requiring MP to adopt `QkdActions` — the feed
looks and behaves the same in both modes even though the two modes'
underlying state layers stay separate, as already decided.

### Error handling / edge cases

- `alice upload`/`qkd crack --upload` with no file picked: the picker
  promise never resolves further action; command effectively no-ops
  (matches native file-input UX — no error needed).
- `eve tap` with an out-of-range index or invalid basis: rejected with a
  usage string, no state mutation (consistent with every other malformed-
  input path in this codebase — coerce or reject, never crash).
- `qkd export` with no resolved round yet: returns a usage/error string,
  writes nothing.
- `qkd crack` on an unreadable/missing VFS path: existing `PhantomVFS`
  error surfaces as the command's printed result (consistent with `cat`,
  `grep`, etc.).
- Very large `--maxbits`: no hard cap enforced beyond a sane implementation
  ceiling (documented, not silently rejected) — a user who wants to watch
  the tab churn for a long time may.
- Preview render failure (e.g. a corrupt/truncated image the browser can't
  decode): `QkdFile.renderInto` already falls back to a "binary payload"
  message for unrenderable content (existing behavior) — the preview pane
  shows that fallback rather than erroring.
- MP upload rejected by the file store (oversized/disallowed MIME): the
  existing `POST /api/qkd/file` error response (`{error: ...}`) is shown
  next to the upload control, same pattern as any other MP action failure;
  no payload is staked, Alice's setup control stays open for another try.
- Feed overflow: once past ~200 lines, the oldest lines are dropped from
  the DOM (not from any persisted state — the feed has no server-side
  backing) as new ones are appended, so memory stays bounded across a long
  session.

## Data Model Changes (SQLite)

None. This spec touches no server-side schema. MP upload (if it requires
any Python change at all) only reuses the existing `qkd_files`/temp-store
mechanism already in place.

## Testing

- **Browser (Playwright, real Chrome via `tests/browser_utils.py`):**
  - Solo regression: every existing Solo test (role selection, tap-and-
    commit, file reveal, botnet crack) must pass unchanged after the
    `QkdActions`-as-source-of-truth refactor — this is the main regression
    surface.
  - Terminal drives the real game: run `alice set`, `eve tap`, `eve commit`,
    `bob keep` via `PhantomShell.run(...)` and assert the **stage and score
    actually update** (not just `QkdActions.state()`) — the test that
    proves this spec's core claim.
  - `qkd export` + `qkd crack` round-trip: export a resolved round's
    ciphertext to the VFS, crack it back, assert the recovered plaintext
    matches (short key, so it's crackable within the test's `--maxbits`).
  - A long-key export does **not** crack within a small `--maxbits` (proves
    the tool is a real search, not decorative).
  - MP upload: Alice picks "Upload file…", the file reaches Bob/Eve's
    reveal exactly as a sample would.
  - Upload preview: picking a file in Solo/MP populates the preview pane
    with the SAME bytes (assert rendered content matches, e.g. text
    content or an `<img>` with a matching data URL) before any round
    resolves; `alice upload`/`qkd crack --upload` print a summary line
    containing the filename and size.
  - Live feed: playing a round (Solo) produces the expected sequence of
    feed lines (stake → taps → resolve → reveal outcome) in `#qkd-feed`;
    switching Solo→Multiplayer→Solo does not duplicate or clear feed
    content mid-session; the same assertions hold for an MP round via the
    poll-driven path.
  - Layout: `/qkd` renders the two-column grid with `#qkd-feed` present and
    non-empty after a round; a narrow-viewport render collapses to a
    single column (existing breakpoint pattern).
- **Regression:** the full existing suite (engine, MP secrecy, Channel
  Heist stage, all prior QKD tests) stays green.

## Sequencing (8 phases, each shippable)

1. **QkdActions refactor:** `eveTap`/`eveCommit`/`setPayloadFromBytes`,
   `qkd.js` becomes a subscriber. Ships with all existing Solo tests green
   (proves the refactor is behavior-preserving) before anything terminal-
   specific is added.
2. **Terminal command set:** `alice upload`, `eve tap`, `eve commit`,
   updated `bob`/`qkd status`, removal of `eve intercept`. Ships genuine
   terminal-driven Solo play.
3. **Ciphertext crack tool:** `qkd-crack.js` + `qkd export`/`qkd crack`
   terminal commands. Ships the standalone brute-force feature.
4. **Multiplayer upload:** `qkd-multi.js` Alice panel upload option.
   Ships upload parity between Solo and MP.
5. **Upload preview:** the Solo/MP preview panes (§5) plus the terminal
   text-summary output for `alice upload` and `qkd crack --upload` —
   sequenced last among the upload work since it touches all four upload
   entry points from phases 1–4.
6. **`/qkd` layout rework:** the two-column grid + `#qkd-feed` host
   element (§6), with no feed content yet — purely structural, so the next
   phase has a stable place to render into.
7. **Live activity feed:** `QuantumStage.mount`'s `opts.feedEl` support +
   the consolidated log call sites in the `QkdActions` subscriber and the
   MP poll handler (§7). Ships the feed itself.
8. **Polish:** `drive.py` screenshots (terminal-driven round, a crack
   succeeding/failing, the new layout with the feed populated), docs
   (`QKD_MULTIPLAYER.md`, terminal `help`/`man` text), `docs/FOLLOWUPS.md`
   updates for anything deferred.

## Open Questions

None blocking. Resolved defaults: QkdActions as the single source of truth
for Solo; `eve tap`/`eve commit` replacing `eve intercept`; a standalone,
unscored ciphertext crack tool with a real (not simulated) brute force;
MP upload reusing the existing endpoint with an anticipated-zero Python
change (to be confirmed, not assumed, during implementation); upload
previews are uploader-only and text-only in the terminal; the live feed is
a persistent activity log (not spectator mode or real video), scoped to
`/qkd`'s own layout. Tunable at implementation: the default `--maxbits`
cap, the exact plausibility heuristics for `application/octet-stream`,
terminal help/man copy, the feed's line cap (~200) and exact wording, and
the layout's narrow-viewport breakpoint value.
