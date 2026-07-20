# PhantomQ v3 — "Academy" Design Spec

**Date:** 2026-07-20
**Status:** Approved (design); ready for implementation planning
**Builds on:** v2 "Ghost Protocol" (`docs/superpowers/specs/2026-07-16-phantomq-v2-design.md`)
and QKD multiplayer (`docs/superpowers/specs/2026-07-17-phantomq-qkd-multiplayer-design.md`)

## Summary

PhantomQ v3 restructures the site to feel like a real product in the shape of
hackthebox.com: a **public landing page** that pitches the platform to schools,
sitting in front of a **left-sidebar app shell** (Dashboard, Paths, Rooms,
Terminal, QKD Game, Rankings). It keeps the one genuinely great thing about the
current UI — the hacker/matrix animation — and rebuilds the chrome around it.

Two gameplay upgrades ride on top:

1. **Quantum Intercept v3** — the QKD game now protects a **real file** (photo,
   PDF, or text). Alice picks the file and key length, Eve intercepts and/or
   **brute-forces with a botnet of simulated worker machines** (a real
   speed-vs-detection tradeoff), and Bob decides KEEP/ABORT — on a good key the
   file **visibly decrypts and renders** for the winner; on a bad key everyone
   sees scrambled bytes. Every action is playable **by button or by terminal**.

2. **PhantomShell** grows a **virtual filesystem** and four packs of Linux
   commands (filesystem, text tools, network-flavored, system/misc), plus
   `qkd`/`eve` commands that drive the same game seats as the buttons.

Positioning for schools is delivered as **pitch + demo polish** this round
(landing page "For Schools" section + overall polish); teacher accounts/class
dashboards are explicitly deferred.

Stack is unchanged: Flask + Waitress + SQLite, server-rendered Jinja + vanilla
JS, `python app.py`. **Approach A (in-place evolution)** — no framework rewrite,
no Node dependency; all JS logic stays as testable pure functions verified by
Playwright browser-drive + pytest.

Delivered on a continuation of branch `phantomq-v2` (or a new `phantomq-v3` off
it) in **four shippable phases**.

## Goals

- Site reads like a sellable product: a public pitch page → a focused,
  sidebar-driven app, in the visual language of hackthebox.com, keeping the
  matrix/hacker animation as the signature effect.
- A "For Schools" pitch that makes a live demo sell itself (curriculum fit,
  zero-install LAN play, 30-second start, classroom multiplayer, book-a-demo CTA).
- QKD play where the **stakes are a real file** the learner can see succeed or
  fail — uploaded or chosen from bundled "classified" samples.
- **Eve's multi-computer brute force** as real strategy: more workers = faster
  cracks on weak/short keys, but louder (higher detection) and budget-limited;
  full-length QKD keys stay uncrackable ("heat-death ETA"), teaching why QKD
  key length matters.
- **Terminal-or-button parity:** the whole QKD round is playable from
  PhantomShell, driving the exact same seat state the buttons drive.
- A markedly larger, more convincing Linux command set over a persistent virtual
  filesystem, where captured ciphertexts and mission files actually live.

## Non-Goals (this spec)

- Teacher/parent accounts, class codes, or a class progress dashboard (deferred;
  noted as the natural next phase for the schools pitch).
- Real cryptographic security. All crypto here is **educational/simulated** —
  the "encryption" protecting files is a deliberately weak, learner-legible XOR
  keystream so that Eve's brute force can plausibly succeed on short keys. This
  is a teaching toy, not a secure channel, and the UI says so.
- A real, sandboxed OS. PhantomShell's Linux commands operate on a **simulated
  virtual filesystem** in the browser; no real processes, sockets, or host FS
  access.
- Real networking for the "network" command pack (ping/nmap/etc. are themed
  simulations over the game world).
- A framework rewrite (React/Vite/SPA) — explicitly rejected as Approach B
  (needs Node, discards working templates/tests).
- A JS unit-test runner (Node unavailable); JS is verified via Playwright + pytest.

## Background

v2 removed the login gate (guest identity), added the Ghost Protocol aesthetic,
the GHOST chatbot, PhantomShell terminal, and the BB84 QKD game; a follow-up
added same-network multiplayer with a server-authoritative phase machine
(`quantumbreach/qkd/`). The current home page (`templates/home.html`) is a plain
path grid and the app uses a top nav (`templates/_nav.html`). The user wants the
site restructured to hackthebox.com's shape, the QKD game to protect real
files with an Eve botnet, terminal parity for play, more Linux commands, and the
whole thing to be a credible sales artifact for schools.

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Site shape | Public **landing** at `/` + **app shell** with left sidebar behind it | Matches hackthebox.com's two layers; landing carries the school pitch |
| Landing identity | Landing is public and does **not** provision a guest cookie; entering the app does | A brochure page shouldn't create users; keeps guest counts meaningful |
| App entry | "Enter Platform" / any app link → `/dashboard`, provisions guest as today | Preserves the instant-play, no-login promise inside the app |
| Aesthetic | Reuse the matrix/scanline effects; new sidebar + card system in the same neon token palette | User: "only nice thing about our UI is the hacker animation" — keep it, rebuild the rest |
| QKD payload | The round protects a **file** (upload OR bundled sample), size-capped | "Play using photos, pdf, text files"; the visible decrypt is the payoff |
| File "encryption" | Weak XOR keystream keyed by the sifted QKD key; intentionally breakable on short keys | Lets Eve's brute force actually pay off as a lesson; honestly labeled as a toy |
| Eve brute force | **Botnet panel**: 1–100 simulated workers, speed ∝ workers, costs an ops budget + raises detection; short keys crack, full keys don't | "Simulate multiple computers"; turns compute-vs-key-strength into strategy |
| Game shape | **Upgrade the single game** (Quantum Intercept v3), not a second mode | One game to maintain; every demo shows the good stuff; SP + MP share it |
| Play input | Buttons **and** terminal drive the same seat actions via one action layer | "Play the QKD game… using the terminal or the buttons" |
| Terminal | Add a **virtual filesystem** + 4 command packs (fs/text/net/system) + `qkd`/`eve` | "Add more Linux commands"; VFS is where captures/mission files live |
| Schools | **Pitch + demo polish** now; teacher tooling deferred | Fastest path to a thing you can sell; avoids +40% scope this round |
| Stack | In-place Flask/Jinja/vanilla-JS (Approach A) | No Node; keep working tests/templates; fastest to a sellable demo |

## Architecture

### 1. Site restructure — landing + app shell

**Two layers, like hackthebox.com:**

- **Public landing** (`templates/landing.html`, `GET /`): full-bleed hero over
  the existing matrix canvas, tagline + "Enter Platform" CTA, then scrollable
  sections — What is PhantomQ, the learning paths, live stats (rooms, ciphers,
  players), a **"For Schools"** section, and a rich footer. No sidebar, no guest
  cookie issued here (a `?stay` guard or simply not touching identity on this
  route). "Enter Platform" and any nav link into the app go to `/dashboard`.
- **App shell** (`templates/base.html` reworked, or a new `app_base.html`):
  a persistent **left sidebar** (Dashboard, Paths, Rooms, Terminal, QKD Game,
  Rankings, + rename/effects controls and the operative handle/XP badge at the
  bottom) with a top strip for page title/breadcrumb. All app pages extend this.
  Sidebar collapses to a top bar / hamburger on narrow screens.
- **Dashboard** (`templates/dashboard.html`, `GET /dashboard`): the app's home —
  greeting + rank, overall progress, path progress cards, "continue where you
  left off", quick links to Terminal and QKD, and a compact rankings peek. This
  is where the old `home.html` grid content moves (reshaped as dashboard cards).

**Routing/identity change:** guest auto-provision moves from "every request" to
"every request **under the app**" (the `/dashboard`, `/rooms`, `/terminal`,
`/qkd`, `/api/*` surface). The landing route stays anonymous. Implement by
gating the existing `before_request` guest-provision on the request path (skip
for `/` and static), or by making provision lazy on first app hit.

**What's kept:** rooms engine + content, progress/XP/badge/leaderboard, the
matrix canvas + scanline + boot effects, GHOST chatbot, existing QKD
multiplayer phase machine. `_nav.html` is replaced by the sidebar partial
(`_sidebar.html`); a slim top bar partial may accompany it.

### 2. Quantum Intercept v3 — file heist over BB84

The game keeps its server-authoritative phase machine (`quantumbreach/qkd/`) and
the shared JS/Python BB84 resolver (`static/js/qkd.js` ⇄ `qkd/engine.py`,
byte-identical RNG contract). v3 adds a **file payload** and an **Eve botnet**
layer on top. Single-player (computer fills empty seats) and same-network
multiplayer both use the same round shape.

**Round flow (per round):**

1. **Alice — setup.** Picks a **payload file** (upload a small image/PDF/txt,
   size-capped ~256 KB after which we truncate/deny, OR choose a bundled sample)
   and sets **key length** `n` (photons) and **check sample** `s`. Key length is
   the new strategic dial: short key = faster round but crackable by Eve's
   botnet; long key = safe but slower. Alice also implicitly sets how many key
   bits will be available to encrypt the file.
2. **Eve — move.** Eve has a fixed **ops budget** per round (e.g. 100 ops). She
   allocates it between:
   - **Intercept fraction `p`** (0/25/50/100% as today) — *loud*: raises QBER,
     detectable by Bob's sample. Costs ops proportional to `p`.
   - **Botnet workers** (1–100) aimed at **brute-forcing the captured
     ciphertext** — *quiet* on the channel but ops-costly and time-bounded.
     Crack ETA = f(key_length_used_for_file, workers); short keys → seconds,
     full-length keys → astronomically long ("heat death" ETA), which is the
     lesson. If the crack completes within the round window, Eve reads the file
     regardless of Bob's KEEP/ABORT.
3. **Bob — decision.** Sees the **sample QBER** meter (abort line ~11%) and
   decides **KEEP** or **ABORT**, exactly as today.
4. **Resolve + reveal.** The existing resolver computes sifted key, sample QBER,
   stolen bits, eveHit. Then the **file layer**:
   - The payload is XOR-encrypted client-side with a keystream derived from the
     **final sifted key** (`finalKey` bits, stretched via a simple documented
     keystream so short keys = short period = crackable).
   - **Bob KEEP + clean key:** Bob's pane **renders the real file** (img/PDF
     embed/text) with a decrypt animation. Win for defenders.
   - **Bob KEEP + Eve present:** Bob may render a corrupted file; Eve scores
     stolen bits; if her botnet crack finished, **Eve's pane renders the file too**.
   - **Bob ABORT + Eve present:** defenders score the detection bonus; the file
     is not delivered (but if Eve's crack already finished, she still got it —
     teaching that detection ≠ confidentiality once bits leak).
   - **No Eve, Bob ABORT:** false alarm, no delivery.
   - Everyone always sees Eve's pane showing **scrambled bytes** unless/until a
     crack completes.

**Scoring** extends `engine.score_round`: defenders still score `finalKey` on a
clean KEEP and the detection bonus on a correct ABORT; **Eve** now scores
stolen sifted bits **plus a "full-file heist" bonus** if her botnet crack
completed. QKD leaderboard + `qkd-operative` badge unchanged in spirit; add a
`file-heist` badge for a first successful Eve crack and/or first successful
file delivery.

**Botnet model (pure function, shared JS/Py):** `crack_eta(key_bits, workers,
ops_spent) -> seconds` and `keys_per_sec(workers)`; deterministic so tests can
assert "8 workers crack a 12-bit key in < round window" and "workers can't crack
a 128-bit key in the round window." The animated worker grid (each tile showing
keys/sec, progress bar, detection delta) is a view over this model; the terminal
`eve crack --workers N` sets the same state.

**Files & backend:** uploads and bundled samples need bytes on the server so Bob
and Eve panes (and multiplayer peers) can fetch them. Minimal surface:
`POST /api/qkd/file` (accepts an upload or a sample id, validates type/size,
stores under a temp/room-scoped key, returns a handle + metadata) and
`GET /api/qkd/file/<handle>` (returns the **ciphertext** bytes always; the
plaintext is only reconstructable client-side with the round key). Bundled
samples live under `static/qkd-samples/`. Storage is ephemeral (temp dir or a
small `qkd_files` table with TTL cleanup); no long-term retention. Single-player
can keep the file entirely client-side (no upload) — the endpoints exist so
multiplayer peers can pull the shared payload.

### 3. PhantomShell — virtual filesystem + Linux command packs

A **virtual filesystem** (`static/js/vfs.js`) backing the terminal: a per-guest
tree persisted in `localStorage`, seeded with a themed home dir
(`/home/operative`, a `missions/` dir with sample files, a `captures/` dir where
intercepted QKD ciphertexts land). Pure functions for path resolution, node
CRUD, and (de)serialization — unit-testable in isolation.

**Command packs** (each a registry module the terminal composes):

- **Filesystem:** `pwd`, `cd`, `ls [-la]`, `cat`, `mkdir [-p]`, `touch`, `rm
  [-r]`, `cp`, `mv`, `echo` (+ `>`/`>>` redirection into the VFS), `head`,
  `tail`, `find`, `tree`.
- **Text tools:** `grep`, `wc`, `sort`, `uniq`, `diff`, `strings`, `xxd` /
  `hexdump`, `md5sum`, `sha256sum` — operating on VFS files (great for
  cipher-cracking drills; e.g. `strings captures/secret.enc`).
- **Network-flavored (simulated):** `ifconfig`/`ip`, `ping`, `nmap`, `netstat`,
  `ssh` — themed on the game world (Alice/Bob/Eve as hosts on the "quantum
  channel"); no real sockets.
- **System/misc:** `ps`, `top`, `kill` (ties into Eve's botnet workers — killing
  a worker pid reduces crack speed), `uname`, `date`, `history`, `man <cmd>`,
  `sudo` (easter-egg "operative is not in the sudoers file"), a neofetch-style
  `banner`/`neofetch`.
- **QKD/game bridge:** `qkd host|join <code>|start|status`, `alice set --len N
  --sample S --file <path>`, `eve intercept <0-100>`, `eve crack [--workers N]
  [--stop]`, `bob keep|abort`. These call the **same action layer** the buttons
  call (see §4), so terminal and UI stay in lockstep.

Existing crypto/util/lab commands are retained. `help` is regrouped by pack;
`man <cmd>` gives per-command usage. Tab-completion and history extend to the
new registry and to VFS paths.

### 4. Shared action layer — button/terminal parity

Both the QKD UI buttons and the terminal `qkd`/`alice`/`eve`/`bob` commands go
through **one client module** (`static/js/qkd-actions.js`) exposing intent
functions (`aliceSet`, `eveIntercept`, `eveCrack`, `bobDecide`, `advance`).
In multiplayer these post to the existing `/api/qkd/*` seat-action endpoints
(extended to carry file handle, worker count, intercept fraction); in
single-player they mutate the same local game state the computer strategy uses.
The UI subscribes to state changes and re-renders; the terminal prints results.
This guarantees "buttons or terminal" are two views of one state, not two code
paths. Server-side action validation/coercion (already present in
`qkd/service.py`) is extended for the new fields so a bad terminal payload can't
brick a round.

### 5. For Schools pitch (content + polish)

A **"For Schools"** section on the landing page and a light `/for-schools`
anchor/section: curriculum-fit bullets (symmetric crypto → frequency analysis →
XOR/OTP → quantum key distribution), "what students learn", zero-install LAN
story, 30-second no-account start, classroom multiplayer QKD, safety notes
(no external APIs, no accounts, runs offline on a school network), screenshots,
and a **"Book a demo"** CTA (mailto/contact). Plus general polish pass on the app
shell so a walkthrough looks finished. No teacher accounts this round.

## Data Model Changes (SQLite)

- Optional `qkd_files(handle TEXT PK, kind TEXT, mime TEXT, bytes BLOB,
  created_at)` with TTL cleanup — **or** ephemeral temp-dir storage keyed by
  handle (decision at plan time; temp-dir preferred to keep the DB lean). Single
  new badge seed `file-heist`. Everything else (users, user_stats,
  room_progress, qkd_scores, badges) unchanged. Guest provisioning logic is
  unchanged except for *where* it triggers (app paths only).

## Testing

- **pytest:**
  - Landing `/` renders, is anonymous (no `guest_id` set-cookie), links to
    `/dashboard`; `/dashboard` provisions a guest and renders the sidebar shell.
  - Sidebar shell present on app pages; old top-nav gone; all app routes reachable.
  - `POST /api/qkd/file` validates type/size and returns a handle;
    `GET /api/qkd/file/<handle>` returns ciphertext bytes; oversized/invalid rejected.
  - Extended seat-action validation accepts new fields (file handle, workers,
    intercept) and rejects malformed payloads without corrupting round state.
  - `file-heist` badge award path; scoring extension for Eve full-file heist.
- **Pure-function parity (JS ⇄ Py where shared):** `crack_eta`/`keys_per_sec`
  determinism and the "short key cracks / long key doesn't within round window"
  assertions; VFS path-resolution and CRUD; command-parser for new packs.
- **Playwright browser-drive** (extend the `run-phantomq` skill): open the
  landing page (screenshot the hero + For Schools), Enter Platform → dashboard,
  play a full QKD v3 round **twice — once via buttons, once via terminal
  commands** — proving parity: Alice picks a sample file, Eve adds workers +
  intercept, Bob KEEPs, and the file **renders decrypted** in Bob's pane
  (screenshot); then a run where Eve's botnet cracks a short key and her pane
  renders the file. Exercise the new terminal packs (`ls missions/`, `cat`,
  `grep`, `nmap`, `strings captures/*.enc`). Every screenshot must be non-blank.

## Sequencing (4 phases, each shippable)

1. **Restructure:** landing page (with For Schools) + left-sidebar app shell +
   `/dashboard`; move identity provisioning to app paths; keep matrix animation;
   replace nav with sidebar. Ships a re-shaped, sellable-looking site.
2. **PhantomShell expansion:** virtual filesystem + filesystem/text/network/
   system command packs + `man`/tab-completion/history over the new registry.
   Ships the "more Linux commands" ask independently of the game.
3. **Quantum Intercept v3 — file heist:** file payload (upload + samples),
   client-side XOR-keystream encrypt/decrypt + visible render, file endpoints,
   scoring/badge extension. Ships the "photos/PDF/text files" ask.
4. **Eve botnet + terminal parity:** botnet model + animated worker grid +
   ops/detection tradeoff; shared action layer so `qkd`/`alice`/`eve`/`bob`
   terminal commands and buttons drive one state; `ps`/`kill` botnet bridge.
   Ships "simulate multiple computers" + "terminal or buttons".

Phases 3 and 4 are tightly coupled (both are the QKD upgrade) and may ship
together if convenient, but are separable at the file-layer boundary.

## Open Questions

None blocking. Resolved defaults: both site layers; file = upload + bundled
samples; Eve botnet with ops/detection tradeoff; all four command packs; pitch +
demo polish (teacher tooling deferred); single game upgraded (not a second
mode); Approach A (in-place). Tunable at implementation: exact size cap and
storage backend for payloads (temp-dir vs BLOB+TTL), ops-budget numbers, key
lengths that separate "crackable" from "safe", keystream stretch function, and
landing-page copy/screenshots.
