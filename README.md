# Quantum Lab

A browser-based cybersecurity/crypto learning platform, entirely in
TypeScript: a Three.js third-person game (**Quantum Heist** — an Among-Us-style
social-deduction game built around a real BB84 quantum key exchange) plus a
set of standalone interactive **labs** (SQL injection, XSS, phishing,
password cracking, Wi-Fi evil twin, Caesar cipher, RSA factoring, BB84 QKD)
and a small network-defense mini-game.

There's also **Quantum Breach**, a single-player narrative campaign: Scene 1
teaches symmetric encryption (Alice and Bob share a secret key — until Eve
intercepts it), Scene 2 teaches asymmetric encryption (public/private
keypairs solve key distribution — until a man-in-the-middle twist shows why
authentication still matters), and Scene 3 hands the player straight into
**Quantum Intercept**, a real 3-player BB84 key exchange with hidden
Alice/Bob/Eve roles and a post-round accusation vote.

## Run it

```
cd photon-runner
npm install
npm run dev
```

Then open http://localhost:3100 — a guest identity is auto-provisioned, no
sign up needed.

`npm run dev` runs the Vite client and the Express API concurrently. To run
them separately: `npm run dev:client` / `npm run dev:server`.

## What's here

Everything lives under `photon-runner/`:

- **`src/`** — every TypeScript/TSX source file (client, server, and tests),
  one flat directory. `GameEngine.ts` owns the Three.js scene/render loop;
  `quantumHeist*.ts` is the Quantum Heist game; `scene*.ts` builds its 3D
  world (character models, maps, materials); `springs.ts` +
  `sceneAnimPhase.ts` drive movement/animation feel; `lab*.ts`/`labRegistry.ts`
  + the individual challenge files (`xss.ts`, `sql-injection.ts`, etc.) are
  the standalone security labs; `campaignScene*.ts`/`Campaign*.tsx` are the
  Quantum Breach campaign scenes; `qkd*.ts` is the Quantum Intercept
  multiplayer game; `server*.ts` is the Express + better-sqlite3 API (guest
  identity).
- **`data/`** — the server's SQLite database (gitignored, created on first run).

## Develop

```
cd photon-runner
npm run typecheck
npm test
npm run build
```

## Tech

TypeScript · React · Three.js · Vite · Express · better-sqlite3 · Vitest.
