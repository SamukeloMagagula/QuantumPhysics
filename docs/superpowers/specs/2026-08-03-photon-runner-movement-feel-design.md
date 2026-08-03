# Photon-runner movement feel — spring-smoothed motion, camera, animation phases

Design doc. Related: `photon-runner/` (TypeScript app, branch `feat/quantum-lab-typescript`),
`games/quantum-heist/index.ts`, `games/lab/character.ts`, `games/lab/world.ts`.

## Context

`photon-runner` replaced the Flask PhantomQ front end with a single TypeScript app whose
flagship game is **Quantum Heist** (an Among-Us-style BB84 game). Movement, camera, and
character animation were all hand-rolled and functional but rough:

- **Movement** (`quantum-heist/index.ts` `update()`): input is normalized and written straight
  into `playerPos` every frame, clamped only by the grid-based `isWalkable` check. No
  acceleration/deceleration — starting and stopping is instant.
- **Camera** (`world.ts` `updateCamera`): a fixed top-down-ish offset, linearly `lerp`'d toward
  the player position each frame. No look-ahead, no reaction to speed.
- **Animation** (`games/lab/character.ts`): a single boolean `walking` switches between two
  hardcoded pose functions (walk-cycle sine waves vs. idle breathing/sway). No transition
  states — the walk cycle starts/stops on the same frame movement does.

We looked at [swift502/Sketchbook](https://github.com/swift502/Sketchbook), an archived
Three.js third-person game engine, for ideas. It uses critically-damped spring simulators for
velocity/rotation smoothing, a `CameraOperator` for camera follow, and a class-per-state
animation FSM (`Idle`, `StartWalkForward`, `Walk`, `Sprint`, `EndWalk`, ...). Sketchbook is
built for a free-roam action game (raycast capsule physics, orbiting mouse-look camera,
vehicles) — Quantum Heist is a top-down stealth/social-deduction game where map readability
matters, so we're borrowing the *quality* of Sketchbook's motion math without its architecture
or its player-controlled camera.

## Goals

1. Movement has weight — starting, stopping, and turning ease in/out instead of snapping.
2. A sprint mechanic (Shift) for faster traversal, with its own animation.
3. Camera follow is smoother and leans slightly in the direction of travel/sprint, still at a
   fixed top-down angle (no player-controlled orbit/zoom — out of scope, actively undesirable
   for this genre).
4. Character animation has explicit idle/start-walk/walk/sprint/stop-walk phases instead of a
   binary walking flag, so transitions plant/lean naturally.

## Non-goals

- No physics engine (cannon.js or similar) and no raycast capsule collider — the existing
  grid-based `isWalkable` collision stays as-is.
- No free-look / orbit / zoom camera control.
- No class-per-state FSM architecture (Sketchbook's `ICharacterState` pattern) — we have ~5
  states, not dozens, and a data-driven phase switch inside the existing single `update(dt)`
  closure fits this codebase's existing style (see `character.ts`'s current walk/idle branch).
- This spec does not touch bots/mentor walkers (`stepWalker` in `quantum-heist/index.ts`) —
  they can adopt the same spring module later if it reads well, but aren't required for this
  pass to land.

## Design

### 1. `engine/springs.ts` (new)

A small module porting the two spring primitives Sketchbook actually needs, generalized for
reuse by any game, not just Quantum Heist:

- `SpringSimulator` — scalar critically-damped spring: `advance(dt)` moves `position` toward
  `target` given `mass`/`damping`, tracking `velocity` between calls. Used for camera
  look-ahead blending and sprint speed easing.
- `VectorSpringSimulator` — same, over a `THREE.Vector2`/`Vector3`, for planar velocity.
- `RelativeSpringSimulator` (angle) — shortest-path spring over an angle (wraps at ±π), reused
  for character facing (replacing the current `faceDirection`'s fixed `delta * 0.25` lerp) and
  camera look-ahead angle.

Each is a plain class with `target`, `position`, `velocity` fields and an `advance(dt)` method
— no THREE.Scene coupling, easily unit-testable in isolation (given target position + mass +
damping constants, assert it converges and doesn't overshoot pathologically).

### 2. Movement (`quantum-heist/index.ts`)

- Add a `VectorSpringSimulator` for planar velocity. Each frame: compute desired velocity from
  input (`moveX`/`moveZ`, normalized, scaled by `MOVE_SPEED` or `SPRINT_SPEED` if sprinting),
  set it as the spring's target, `advance(dt)`, then integrate `playerPos` by the spring's
  *current* velocity (not the raw target) — this is what produces ease-in/ease-out.
  Walkability clamping stays exactly as today (per-axis `isWalkable` fallback), applied to the
  spring-integrated position.
- Add `SPRINT_SPEED` (~1.6x `MOVE_SPEED`) and wire a `sprint` boolean into `setMoveVector`'s
  caller chain: `Game.setMoveVector` gets a third optional `sprint` param (default false);
  `keyboardMovement.ts` tracks Shift as held state alongside WASD and passes it through.
  Touch/gamepad input schemes (if any exist beyond keyboard) can ignore the param — it's
  additive, not a breaking change to `MovementCallbacks`.
- Facing (`faceDirection`) moves from its current `delta * 0.25` ad-hoc lerp to the new
  `RelativeSpringSimulator`, tuned so the turn rate feels similar at walk speed but is snappier
  at sprint (spring naturally reacts to how far off-target the angle is).
- Bot/mentor walkers (`stepWalker`) are untouched in this pass (see Non-goals).

### 3. Camera (`world.ts` `updateCamera`)

- Replace the direct position `lerp` with: a `VectorSpringSimulator` tracking the *look target*
  (currently `playerPos.x*0.6, playerPos.z+0.5`), fed a target that's the player position offset
  by a small look-ahead vector along current velocity direction (magnitude scales with speed,
  more pronounced while sprinting, zero at rest). Camera position keeps its existing fixed
  offset (`x*0.6, 13.5, z+10`) but now `lerp`s toward a spring-smoothed anchor instead of the
  raw player position directly, which removes the current camera's slight jitter on direction
  reversal.
- `updateCamera`'s signature gains an optional `velocity: THREE.Vector2` param (falls back to
  zero look-ahead if omitted) so `quantum-heist/index.ts` can pass the movement spring's current
  velocity through.
- No new player input, no rotation/zoom controls.

### 4. Animation phases (`games/lab/character.ts`)

Replace the `walking: boolean` internal state with a small phase enum driven from outside via
two setter calls (`setWalking(isWalking)` keeps its name/signature for caller compatibility;
add `setSprinting(isSprinting)`):

```
type Phase = 'idle' | 'startWalk' | 'walk' | 'sprint' | 'stopWalk';
```

Transition rules (evaluated once per `update(dt)`):
- `idle → startWalk` when movement begins; `startWalk` blends the idle pose toward the walk
  cycle over ~0.15s (lean-in) then advances to `walk`.
- `walk → sprint` / `sprint → walk` directly when `setSprinting` toggles while moving (both are
  cyclic gaits, no blend-in needed beyond the existing per-frame pose lerp already present in
  the idle branch).
- `walk`/`sprint → stopWalk` when movement stops; `stopWalk` blends the last stride pose back to
  idle over ~0.12s (foot-plant) then advances to `idle`.

`sprint` reuses the existing walk-cycle math with a higher `walkPhase` rate and slightly larger
stride/torso-lean constants (same functions, different constants — no new pose code needed).
`startWalk`/`stopWalk` are short (~0.12–0.15s) linear blends between the idle pose values and
the walk pose values already computed each frame, not new animation curves.

## Testing

- `engine/springs.ts`: unit tests asserting convergence (spring reaches target within tolerance
  given enough `advance(dt)` calls), no overshoot beyond a bound for the chosen damping, and
  the angle spring wraps correctly across the ±π boundary.
- `quantum-heist/logic.ts`-adjacent: existing `test/quantum-heist/logic.test.ts` is state-logic
  only and untouched; movement/animation are visual and covered by manual playtest (`npm run
  dev`), not new unit tests, matching how `character.ts`'s existing animation is untested today.
- `npm test` and `npm run typecheck` must stay clean.

## Open questions for the plan phase

None — approach approved section-by-section during brainstorming (movement+sprint, fixed-angle
camera with look-ahead, lightweight animation phases).
