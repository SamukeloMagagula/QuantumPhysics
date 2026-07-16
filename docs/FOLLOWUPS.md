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

## Minor / cosmetic
- `check_answer` doesn't validate `answer_type` (unknown type falls through to hash).
- Authoring CLI only supports default normalization (no `case_insensitive: false`).
- `widget_config` is parsed and serialized to `data-config` but no widget reads it.
- `is_admin` column is defined but never set/read.
- Content is re-parsed from disk on each page view (fine at current scale).
- `list_paths` sorts alphabetically; add an explicit order field before multiple paths.
- `home.html` progress-bar width is a raw float (e.g. "33.333%").
- `xor-tool.js` renders malformed hex as key chars; widgets lack `<label for>` a11y.
