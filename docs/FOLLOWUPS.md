# PhantomQ — Tracked Follow-Ups

Deferred, non-blocking items from the final whole-branch review. None affect
the current single-path (Symmetric) release.

## Before the second learning path (Asymmetric/QKD) ships
- **Data-drive path-completion badges.** `progress/service.py` (`_check_path_badges`)
  and `db.py` (`BADGE_SEED`) hardcode `symmetric`/`symmetric-path`. Derive path
  badges from the paths directory (or a `path_id -> badge_id` map in content) so a
  new path needs no service/db code change.
- **Loader-time content validation.** Reject unknown `answer_type` (not in
  exact/number/flag/regex), missing referenced room bodies, and duplicate
  question ids within a room — turn latent authoring footguns into load-time errors.

## Hardening (nice-to-have)
- Throttle `/auth/login` (only the answer endpoint is rate-limited today).
- Set `MAX_CONTENT_LENGTH` / cap answer length to protect Waitress workers.
- SQLite `PRAGMA busy_timeout` / WAL given `threads=8`.
- Document the trusted-author assumption for Markdown (`body_html | safe` is not
  sanitized); sanitize if content ever becomes user-submitted.
- **QKD multiplayer table growth:** `qkd_games` / `qkd_game_seats` are never pruned, so they grow unbounded. The design specified an opportunistic prune (mark stale games `ended` and delete old rows on `create_game`); not implemented. Non-blocking at classroom scale — add a cleanup pass if this ever runs long-lived.

## Minor / cosmetic
- `check_answer` doesn't validate `answer_type` (unknown type falls through to hash).
- Authoring CLI only supports default normalization (no `case_insensitive: false`).
- `widget_config` is parsed and serialized to `data-config` but no widget reads it.
- `is_admin` column is defined but never set/read.
- Content is re-parsed from disk on each page view (fine at current scale).
- `list_paths` sorts alphabetically; add an explicit order field before multiple paths.
- `home.html` progress-bar width is a raw float (e.g. "33.333%").
- `xor-tool.js` renders malformed hex as key chars; widgets lack `<label for>` a11y.

## PhantomQ v3 follow-ups
- `rooms/routes.py` `/paths/<id>` isn't in `APP_PREFIXES`; it provisions a guest only via its own `current_user()` call. Cosmetic asymmetry; add `/paths` to `APP_PREFIXES` or a comment.
- Dead `.nav` CSS in `app.css` and orphaned unreferenced `_nav.html` — remove in a cleanup pass.
- `dashboard.html` `id="rooms"` is inside the path loop → duplicate id once a 2nd learning path exists; use `id="rooms-{{ card.path.id }}"` before shipping a 2nd path.
- `PhantomBotnet.crackableWithin(kb, w, 0)` treats `window=0` as falsy in JS (falls back to `ROUND_WINDOW`) while Python uses 0 — latent parity divergence at `window=0`; no caller passes 0. Use `windowSeconds === undefined ? ROUND_WINDOW : windowSeconds`.
- Eve worker grid/readouts don't reset on `advance()`/`startRound()` → a new round shows the prior round's grid until the slider is touched (cosmetic).
- Cross-page limitation: `PhantomBotnet` loads only on `/qkd` and the terminal `ps`/`kill`/`qkd`/`alice`/`eve`/`bob` commands only on `/terminal` — so terminal-driven QKD play and `kill`-reduces-crack-capacity have no user-reachable path in the shipping UI (they work when driven on `/qkd` directly, and are tested there). A future embed of the shell on `/qkd` (or loading `qkd-actions.js`/`botnet.js` on `/terminal`) would close this.

## Multiplayer file/botnet follow-ups (shipped 2026-07-21 on `mp-file-botnet`)
- Multiplayer file heist is **samples-only** — Alice can't upload a personal file in multiplayer (Solo can). Uploads in MP need the plaintext stored server-side so the server can gate visibility + peers can fetch it (a privacy surface across peers). Deferred.
- Eve's heist **score** bonus is KEEP-only (it flows through the shared `engine.score_round`, which only scores Eve when she intercepted and Bob kept), but her **reveal** is cracked-based (she sees the file whenever her botnet cracked, any decision). Deliberate Solo-consistency choice; making the bonus decision-independent would change Solo's scoring too.
- `QkdActions.subscribe` currently has zero subscribers (Option B: `qkd.js` renders off local `pending`). Fine today; wire a subscribe-based render if the reveal ever needs to reflect terminal-driven state changes live.

## Quantum Channel Heist follow-ups (shipped 2026-07-21 on `quantum-channel-heist`)
- Solo Eve heist timer is a fixed 20s countdown; not yet tuned/tunable per difficulty, and there is no separate no-timer "Learn" mode (the log narrates each step instead).
- The MP Eve tap stream shows a fixed 24-qubit display length (the server clamps/validates the real indices against Alice's actual n); a future refinement could stream exactly `n` qubits once Eve's client knows the key length.
- The de-scramble reveal is a single 500ms blur→render for all types; per-file-type animation (image line-reveal, text typewriter, PDF progress bar) is stubbed as the same wrapper today.
- Computer Eve still uses the random-`p` path (no visible taps); a token computer-Eve tap set for spectacle is deferred.
