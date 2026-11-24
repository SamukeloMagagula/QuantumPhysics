# Quantum Lab

A browser-based platform for teaching quantum key distribution — by attacking
it. Entirely TypeScript: a shared, walkable campus wrapped around a
terminal-driven **QKD hacking simulation**, plus hardware-diagnosis labs, a
security-labs section with end-of-section tests, and live multiplayer on the
campus floor.

The central idea is that BB84's guarantee is best understood from the
attacker's side. You play Eve on a fibre link: scan the target, work out
which countermeasure it is missing, and build an attack out of what it
cannot see — then read the trail you left and learn why it gave you away.

## The campus — the main game

Home is a walkable map of the Phantom Q building: operations, the crypto lab,
comms, the SOC, engineering, the quantum wing, the bullpen and the corridors
between them, drawn over one illustration (`public/pq/discovery-building-v1.png`).
Click to walk there, or use WASD / the arrow keys / the on-screen joystick.
Walking into a room for the first time counts towards an **explorer rank**,
shown as a medal in the HUD, with a rank-up card when you earn the next one.

Every station is reached by walking to it. Stand near something and press
`E` (or tap it) to open the activity in an overlay; `Esc` closes it and leaves
you where you were.

### Desk computers

Fourteen chairs across the building have a computer on the desk. Walk up to a
free one and press `E` to sit; the screen opens a small desktop whose programs
depend on the room — the attack console in comms, the labs in the crypto lab,
and so on — plus a list of who is online and quick chat. Other players see you
seated, and a taken chair cannot be sat in twice.

### The floor is shared

Everyone on the campus is in the same building — no lobby, no room code. You
see other players walk, with their name tag and the look they chose in the
character creator, and they appear in a People panel.

Talking is **quick chat** only: twelve preset phrases ("Hi!", "Follow me",
"Need help?" …) shown as speech bubbles. That is deliberate — the game runs
in classrooms, and preset phrases need no moderation.

Positions travel over a WebSocket (`/api/floor/ws`) at about 20 updates a
second each way. If the socket cannot open — a proxy that blocks it, say —
the client falls back to an HTTP heartbeat and keeps retrying the socket, so
the floor never depends on it. Presence is held in memory, not the database:
a position with a four-second shelf life has no business in SQLite, and with
no API running the campus simply plays single-player.

Activities themselves stay per-player. You see each other move; your attack
session, labs and scores are your own.

### Progress follows you

Explored rooms, story progress, labs, tests and your look are mirrored to the
server for your guest identity, merged so nothing earned is ever lost. The
**Save** panel on the map gives an 8-character save code; entering it in
another browser or device brings that progress across.

### Sound

Short UI and game sounds from Kenney's CC0 packs (`public/assets/kenney/`),
quiet by default and mutable from the top bar. Sound never carries
information the screen does not, so muting loses nothing. Each sound has an
`.mp3` copy for browsers without Ogg Vorbis.

The main stations on the campus:

### Communications console — the attack terminal

A real shell. `scan` a link, `arm` attacks, `run` the exchange, `extract`
before you are caught. Five attacks are modelled on their actual physics:

| Attack | QBER cost | Defeated by |
|---|---|---|
| Intercept–resend | ~25% at full rate | nothing — but it is always loud |
| Photon-number splitting | **none** | decoy states |
| Detector blinding | **none** | detector current monitoring |
| Trojan-horse probe | none | an optical isolator |
| Time-shift | small | matched detector efficiencies |

There are two independent ways to be caught: sampled QBER crossing the abort
threshold, and per-countermeasure alarms. That split is the whole game — a
quiet attack can take the entire key without causing a single error, which is
precisely why QBER alone is not a sufficient defence.

The pairing worth finding: with no optical isolator, a trojan probe reads
Alice's basis *before* Eve measures. She stops guessing, so intercept–resend
becomes both silent and twice as informative — the full key at 0% QBER.

Four escalating targets remove one attack vector at a time, from an
unhardened university testbed to a blacksite uplink with every countermeasure
and a tight abort threshold.

### Headquarters status wall — forensics

After a hack, identify the eavesdropper from the evidence: per-station QBER,
error shape, and basis-match rate. An honest sifted key matches ~100% by
construction; a resent one matches ~75%, because Eve guessed the basis and
got it wrong half the time. That gap is the fingerprint.

Accuse wrongly after a *quiet* attack and the game explains why the error
rate pointed nowhere — the lesson being that decoy states and detector
monitoring exist for exactly the attacks QBER cannot see.

### Workstation 04 campaign (not wired in)

`src/features/campaign/` also holds a seven-stage Phantom Q campaign for a
single persistent workstation — story, timed stages, evidence-board exercises
and hands-on tasks, all covered by tests — that the campus does not currently
open. Only its two Quantum Breach scenes are reachable (from the home hub).
Wiring the rest to a campus computer is a product decision, not a code fix.

### Hardware bench

Diagnosis labs on two tracks. **QKD optics**: detector dark counts,
polariser drift, a source running hot at μ = 0.85 — that last one is
literally why photon-number splitting works in the console. **PC hardware**:
a board that will not POST, a station thermal-throttling under load.

Read the instruments, name the fault, choose the repair. The right repair off
a wrong diagnosis is deliberately not a pass, because the reasoning is the
thing being taught. One optics lab offers "an eavesdropper is intercepting"
as a plausible but wrong answer, to teach that a basis-asymmetric error rate
is an optics fault — Eve cannot damage one basis and leave the other clean.

## Also here

- **Quantum Breach** — a single-player campaign: symmetric encryption
  (until Eve intercepts the key), then asymmetric (until a man-in-the-middle
  twist shows why authentication still matters).
- **Quantum Intercept** — networked 3-player BB84 with hidden Alice/Bob/Eve
  roles and a post-round accusation vote.
- **Symmetric Cryptography** — a four-room guided learning path.
- **Network Defender**, **Quantum 3D Lab**, **Character Creator**.

## Security Labs

Ten labs across six sections, each one something you carry out rather than
read about, and each section closing with a test.

| Section | Labs |
|---|---|
| Foundations | Why Encryption Matters |
| Web Attacks | SQL injection, XSS |
| Social Engineering & Passwords | Phishing spotter, password cracking |
| Wireless | Wi-Fi evil twin |
| Network & Availability | Denial of service |
| Cryptography | Caesar cipher, RSA factoring, BB84 |

**Why Encryption Matters** sends a message in the clear and shows all four
hops on the path displaying it while Eve's capture log fills with your
plaintext; then the same message encrypted, carried by the same hops, opened
by Bob. It is explicit that its repeating-key XOR is a teaching toy, and it
closes by naming the bill just run up — the same key had to be at both ends
first, which is the key distribution problem and the reason public-key
cryptography exists.

**Denial of Service** puts you in charge of a site through three waves, with
rate limiting, caching, upstream scrubbing and capacity to configure before
each. Each wave defeats a different defence: a single loud source falls to a
strict per-source limit and is *not* solved by buying servers; a botnet
blunts per-source limits, because spread across enough machines each source
looks nearly human; amplification saturates the link, where nothing you own
downstream of it matters. The arithmetic is pure and the balance is pinned by
tests — including that wave three is unwinnable by every setup without
upstream filtering.

### Section tests

Six tests, 31 questions, covering why encryption matters, symmetric and
asymmetric, injection and XSS, phishing and passwords, wireless, denial of
service, and BB84. Nearly every wrong option is something a reasonable person
actually believes — "the padlock means the site is safe", "HTTPS hides which
sites you visit", "quantum key distribution stops the interception" — because
a distractor nobody would pick tests nothing.

Two rules shape the marking, both carried over from the campaign:

- **Every question returns its reasoning, right or wrong.** Someone who
  guessed correctly needs the reason more than someone who reasoned their way
  to a wrong answer.
- **Failing is not a dead end.** Attempts are unlimited and the best score is
  kept. Options are reshuffled per attempt, so a retake cannot be passed by
  remembering that the answer was third from the top.

A test unlocks once its section's labs are done. Handing it out earlier would
make it a vocabulary quiz rather than a check on practice.

## Run it

```
cd photon-runner
npm install
npm run dev
```

Then open http://localhost:3100 — a guest identity is auto-provisioned, no
sign-up needed.

`npm run dev` runs the Vite client and the Express API concurrently. To run
them separately: `npm run dev:client` / `npm run dev:server`.

## Graphics

The campus is an SVG over one illustration: it scales to any screen, zooms up
to 2.5×, and draws players, furniture occlusion and labels as memoised layers
so other people walking around do not re-render the map. Tinted icons use
CSS masks over Kenney's game icons.

The whole app is theme-aware. Every surface, including the labs, is drawn
from one set of tokens, so the light/dark toggle in the top bar covers all of
it.

The remaining 3D modes (Quantum 3D Lab and the 3D facility) share a
four-tier quality setting — Balanced, High, Ultra and 4K.

## What's here

Everything lives under `photon-runner/`. Tests sit beside the modules they cover.

- **`src/server/`** — Express API, SQLite schema and storage, guest identity,
  progress sync and save codes (`progressRoutes.ts`), floor presence over HTTP
  (`floorRoutes.ts`) and WebSocket (`floorSocket.ts`), rooms and Quantum
  Intercept. The entry point is `serverIndex.ts`; `serverConfig.ts` validates
  startup settings.
- **`src/WorldMap.tsx`** and its hooks — the campus: `useCharacterMovement`,
  `useMapZoom`, `useCampusPresence`, `useExploration`, with `MapBackdrop`,
  `RemotePlayers`, `WorldHud` and `WorldCharacter` as render layers.
- **`src/worldComputers.ts`**, **`WorldComputer.tsx`** — desk computers and
  their desktop.
- **`src/floorPresence.ts`**, **`floorClient.ts`** — the shared presence and
  quick-chat rules (used by both server transports) and the client link.
- **`src/progressSync.ts`**, **`progressClient.ts`** — progress merge rules
  and the client side of sync and save codes.
- **`src/sound.ts`** — sound effects and mute.
- **`src/features/campaign/`** — Quantum Breach scenes and the unwired
  workstation campaign (above).
- **`src/features/quantum/`** — the quantum simulator screen.
- **`src/features/legacy-heist/`** and **`src/server/legacy/`** — rules and
  opt-in API of the retired social-deduction mode, kept under test.
- **`src/qkdAttack*.ts`**, **`qkdForensics.ts`**, **`qkdEngine.ts`** —
  attack simulation, evidence and shared BB84 rules.
- **`src/lab*.ts`**, individual challenge modules and lab screens — security
  exercises, section tests and progress.
- **`public/pq/`** — building artwork. **`public/assets/kenney/`** — CC0
  sounds and icons (see its `CREDITS.md`).
- **`public/fonts/`** — bundled Inter fonts (SIL OFL).
- **`data/`** — SQLite database, created on first run and gitignored.

## Production

Build with `npm run build`, then run `npm start`. Supply a persistent,
randomly generated `SECRET_KEY` of at least 32 characters through your
deployment environment or secret manager. Startup fails before opening the
database if the production secret is missing, too short, or the development
fallback. Keep the same secret across restarts to preserve guest identities;
rotating it invalidates their cookies.

Serve production through HTTPS: production identity cookies are Secure,
HttpOnly and SameSite=Lax. `PORT` defaults to 8787 and `DB_PATH` defaults
to `photon-runner/data/app.db`. Moving the server source has not changed
the database or built-client locations.

The retired heist API is disabled by default. Set `ENABLE_LEGACY_HEIST=true`
only when deliberately running that legacy mode. Unknown API routes return
JSON 404 responses. Any seated Quantum Intercept player may start their game;
unseated guests are rejected before its state changes.

## Develop

```
cd photon-runner
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

`npm test` runs the Vitest suite: the pure logic — attack simulation,
forensics, labs, the DDoS balance, map and walk rules, floor presence,
progress merging — plus API and WebSocket tests against an in-memory
database. `npm run test:e2e` drives the real app in Chromium with Playwright
(two players on the floor, sitting at a computer, save codes); run
`npx playwright install chromium` once first. `npm run format` applies
Prettier.

## Tech

TypeScript · React · Three.js · Vite · Express · ws · better-sqlite3 · Vitest ·
Playwright
