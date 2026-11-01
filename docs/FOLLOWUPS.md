# Tracked Follow-Ups

Known, non-blocking items in the TypeScript app (`photon-runner/`). The
earlier Python/Flask version and its follow-ups are gone; this list replaces
them.

## Product decisions
- **Workstation 04 campaign is not wired in.** `src/features/campaign/` holds
  a seven-stage campaign (story, stages, exercises, hands-on tasks, all
  tested) that no screen opens; only the Quantum Breach scenes are reachable.
  Either give it a campus computer program or delete it.
- **Unreferenced artwork.** `public/pq/expansion-v1/*.png` (~8 MB) is not used
  by any screen. Remove it, or use it for new rooms.

## Scaling
- **Floor presence is single-process.** Presence and quick chat live in
  memory (`src/floorPresence.ts`), so running more than one server process
  splits players into separate floors. Fine for one classroom server; a
  shared store (e.g. Redis pub/sub) is needed before scaling out.
- **QKD multiplayer table growth.** `qkd_games` / `qkd_game_seats` are never
  pruned. Harmless at classroom scale; add a cleanup pass if the server runs
  for a long time.

## Hardening (nice-to-have)
- Save-code restore is rate limited per IP in memory; behind a reverse proxy,
  set Express `trust proxy` so the limit applies to the real client address.
- Progress sync trusts the client's local progress (add-only merge). It is a
  learning game with no stakes, but leaderboard scores should keep coming from
  server-graded rooms, never from synced progress.
