# Quantum Lab

A browser-based platform for teaching quantum key distribution — by attacking
it. Entirely TypeScript: a Three.js walkable facility wrapped around a
terminal-driven **QKD hacking simulation**, plus a narrative campaign,
hardware-diagnosis labs, and a set of standalone security labs.

The central idea is that BB84's guarantee is best understood from the
attacker's side. You play Eve on a fibre link: scan the target, work out
which countermeasure it is missing, and build an attack out of what it
cannot see — then read the trail you left and learn why it gave you away.

## Signals Intercept — the main game

Three isolated rooms off a corridor, laid out as the protocol itself. Alice
transmits from one end, Bob receives at the other, and Eve's tap closet hangs
off the middle of the fibre run between them, with light pulses visibly
travelling the conduit overhead. Walk in, sit at a workstation, and that
machine's terminal opens.

Each room owns one stage of the loop:

### Eve — the attack console

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

### Bob — forensics

After a hack, identify the eavesdropper from the evidence: per-station QBER,
error shape, and basis-match rate. An honest sifted key matches ~100% by
construction; a resent one matches ~75%, because Eve guessed the basis and
got it wrong half the time. That gap is the fingerprint.

Accuse wrongly after a *quiet* attack and the game explains why the error
rate pointed nowhere — the lesson being that decoy states and detector
monitoring exist for exactly the attacks QBER cannot see.

### Alice — the hardware bench

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

- **Research Campus** — a walkable exterior hub linking the other modes.
- **Quantum Breach** — a single-player campaign: symmetric encryption
  (until Eve intercepts the key), then asymmetric (until a man-in-the-middle
  twist shows why authentication still matters).
- **Quantum Intercept** — networked 3-player BB84 with hidden Alice/Bob/Eve
  roles and a post-round accusation vote.
- **Symmetric Cryptography** — a four-room guided learning path.
- **Security Labs** — standalone challenges: SQL injection, XSS, phishing,
  password cracking, Wi-Fi evil twin, Caesar cipher, RSA factoring, BB84.
- **Network Defender**, **Quantum 3D Lab**, **Character Creator**.

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

Four tiers, selectable in-game from the facility (top right): Balanced,
High, Ultra and 4K. The 4K tier renders at 4× supersampling with 2k
procedural textures and 4k shadow maps — on a 1080p window that is a
3840-wide buffer downsampled, which is what actually removes the soft,
aliased look. It needs a real GPU.

The renderer is deliberately assetless apart from one font: geometry,
textures and characters are all generated procedurally at runtime.

## What's here

Everything lives under `photon-runner/`:

- **`src/`** — all TypeScript/TSX (client, server and tests) in one flat
  directory.
  - `qkdAttack.ts` / `qkdAttackCommands.ts` — the attack simulation and its
    command layer. Both pure and deterministic given an RNG, which is why the
    whole game is playable and assertable in tests without a DOM.
  - `qkdForensics.ts` — post-hack evidence and the accusation verdict.
  - `hardwareLabs.ts` — the diagnosis labs, both tracks.
  - `sceneComputerRoom.ts` — the three-room facility. Its layout is exported
    so connectivity is unit-tested by flood fill rather than discovered by
    walking into a wall.
  - `GameEngine.ts` / `postFx.ts` / `sceneQuality.ts` — Three.js scene and
    render loop, post-processing chain (GTAO → bloom → ACES → grade → SMAA),
    and the quality tiers.
  - `scene*.ts` — procedural world building: characters, maps, materials,
    office props, SDF text, holographic panels, particles, shaders.
  - `engine/` — the reusable layer: game state, scene manager, entity
    registry, interaction registry, asset manager, zone access.
  - `lab*.ts` + the individual challenge files — the standalone security labs.
  - `campaignScene*.ts` / `Campaign*.tsx` — Quantum Breach.
  - `qkdEngine.ts`, `qkdService.ts`, `qkdRoutes.ts` — BB84 and Quantum
    Intercept multiplayer.
  - `server*.ts` — the Express + better-sqlite3 API (guest identity).
- **`public/fonts/`** — Inter (SIL OFL), bundled rather than CDN-fetched so
  in-world text never silently fails offline.
- **`data/`** — the server's SQLite database (gitignored, created on first run).

### Retired

`quantumHeist*.ts`, `HeistScreen.tsx`, `HeistLobby.tsx` and
`HeistMultiplayerLobby.tsx` are the previous main game — an Among-Us-style
social-deduction mode built on the same BB84 engine. It is no longer reachable
from the UI. The source is kept for reference; the server-side heist routes
still exist and are still tested.

## Develop

```
cd photon-runner
npm run typecheck
npm test
npm run build
```

442 tests. The pure logic — attack simulation, forensics, labs, facility
layout, BB84 engine — is covered directly; the Three.js scenes are verified
by running the app rather than by unit test.

## Tech

TypeScript · React · Three.js · Vite · Express · better-sqlite3 · Vitest ·
troika-three-text
