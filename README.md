# Quantum Lab

A browser-based platform for teaching quantum key distribution — by attacking
it. Entirely TypeScript: a walkable headquarters wrapped around a
terminal-driven **QKD hacking simulation**, plus a narrative campaign,
hardware-diagnosis labs, and a set of standalone security labs.

The central idea is that BB84's guarantee is best understood from the
attacker's side. You play Eve on a fibre link: scan the target, work out
which countermeasure it is missing, and build an attack out of what it
cannot see — then read the trail you left and learn why it gave you away.

## Phantom Q Headquarters — the main game

The playable scene is the client's **Page 8** headquarters illustration,
driven by their image-to-map pipeline rather than a 3D engine. Their handoff
is explicit about this:

> The Page 8 image is the visual world. Demarcation supplies spatial data.
> Projective mapping supplies floor movement. Do not restart this scene in
> Unity or Blender.

So the rendered artwork *is* the set. What the game holds is the spatial
intelligence traced over it — a walkable floor polygon, tight furniture
footprints, and interaction anchors, all in normalised coordinates so the
canvas can be any size. A sprite operator walks the floor feet-anchored,
and cropped furniture layers are re-drawn over him when he steps behind
them, which is what gives a flat image real depth.

Three consoles in the room:

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

### Workstation 04 — the campaign

The client's persistent object: the same workstation for the whole game,
because it becomes part of the evidence chain. It runs the **Phantom Q
campaign**, structured as seven stages — the Prologue plus Incidents 01 to
06. Clear a stage and the next unlocks; the rest stay visible but shut,
mirroring the clearance mechanic the bible asks for. The Prologue and
Incident 01 are implemented; the remaining five are specified and labelled
`NOT YET BUILT` rather than hidden.

Each stage is timed against a par time, and the best clear time is kept.
The clock counts **up**, and going over par never fails you — the campaign
teaches "verify before you escalate", and a countdown that punished
careful work would undercut the whole lesson. Par is something to beat on
a replay, not a pass mark.

The Prologue is deliberately not a security lesson. You register, create a
training credential (fictional — the game says so in as many words), take
part in Eve's *authorised* credential check, log in to Workstation 04, and
send Alice's files to Bob. Two go fine. The third does not arrive, then
arrives altered, and a credential event appears that nothing authorised
explains. You escalate PQ-001 knowing something failed and not who did it.

Two of the bible's rules are enforced in code rather than left to prose,
and both are covered by tests:

- **Eve is not the villain.** She is authorised security support. Accusing
  her returns `CLAIM NOT SUPPORTED` with the evidential position spelled
  out — not a wrong-answer buzzer — and never dead-ends the story.
- **The Prologue explains nothing.** No CIA vocabulary, no encryption, no
  attacker, no method. A test asserts none of those words appear in it.
  Incident 01 then names what you already lived through.

Poor decisions produce believable consequences rather than popups: retry
without reconfirming the source and the transfer still happens — you just
never get Alice's confirmation into evidence.

**You play the reasoning rather than read it.** Pick the right file off
Alice's USB and send it. Rebuild the PQ-001 timeline from shuffled events —
put Bob's "nothing received" before the transfer and it answers `SEQUENCE
CONFLICT — Bob cannot report a missing transfer before the transfer
occurs`, not "wrong". Sort statements into FACT / ASSUMPTION / UNKNOWN, and
build the CIA board, where marking confidentiality *affected* is rejected
because no evidence establishes anyone read the file — it is in question,
which is as far as the evidence goes. Every misplacement explains where the
statement belongs and why, because the why is the lesson.

Evidence carries between stages: an investigation opens with the artefacts
already earned, never an empty board.

The hardware bench (below) is reachable from this same workstation.

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

The headquarters scene is 2D and resolution-independent: it letterboxes to
the artwork's aspect and draws at device pixel ratio, so it stays sharp on
any display without a GPU budget.

The remaining 3D modes (Research Campus, Quantum 3D Lab, and the retired
facility) share a four-tier quality setting — Balanced, High, Ultra and 4K —
where the 4K tier renders at 4× supersampling with 2k procedural textures
and 4k shadow maps.

## What's here

Everything lives under `photon-runner/`:

- **`src/`** — all TypeScript/TSX (client, server and tests) in one flat
  directory.
  - `qkdAttack.ts` / `qkdAttackCommands.ts` — the attack simulation and its
    command layer. Both pure and deterministic given an RNG, which is why the
    whole game is playable and assertable in tests without a DOM.
  - `qkdForensics.ts` — post-hack evidence and the accusation verdict.
  - `hardwareLabs.ts` — the diagnosis labs, both tracks.
  - `campaignStory.ts` — the campaign: chapters, beats, choices, evidence,
    clearance and the information boundary. Pure and serialisable, so the
    whole story is playable and assertable in tests.
  - `campaignStages.ts` — the stage/level layer: unlock chain, par times,
    best-time records, the carried case file, and persistence.
  - `campaignExercises.ts` — the interactive mechanics (timeline ordering,
    fact/assumption and CIA classification, file transfer) with their
    grading rules. Pure, so every exercise is gradeable in tests.
  - `CampaignPanel.tsx` — Workstation 04's screen and the case board.
  - `pqScene.ts` — the Page 8 scene model: walkable polygon, traced object
    footprints, depth ordering, hotspots and the walk rules. Pure, so the
    map is unit-tested by flood fill rather than discovered by walking into
    a wall.
  - `PhantomQScene.tsx` — the canvas renderer: master image, sprite actor,
    depth layers, hotspot prompts.
  - `sceneComputerRoom.ts` — the earlier 3D facility, kept for reference.
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
- **`public/pq/`** — the client's Page 8 artwork: master image, the eight
  furniture layers used for depth, and the operator sprite sheets.
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

524 tests. The pure logic — attack simulation, forensics, labs, scene map
and walk rules, BB84 engine — is covered directly; the rendering is verified
by running the app rather than by unit test.

## Tech

TypeScript · React · Three.js · Vite · Express · better-sqlite3 · Vitest ·
troika-three-text
