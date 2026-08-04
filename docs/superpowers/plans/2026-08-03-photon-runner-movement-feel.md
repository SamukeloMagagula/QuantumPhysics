# Photon-runner Movement Feel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Quantum Heist's player movement, camera follow, and character animation real
weight — spring-smoothed acceleration/turning, a sprint mechanic, camera look-ahead, and
explicit animation transition phases — inspired by swift502/Sketchbook's motion math, without
adopting its physics engine, free-look camera, or class-per-state architecture.

**Architecture:** A new framework-agnostic `engine/springs.ts` provides three small
critically-damped spring classes (scalar, 2D vector, wrapped angle). `games/quantum-heist`
wires them into its existing per-frame `update(dt)` for velocity and facing; `games/lab/world.ts`
uses one for camera look-ahead. Animation phase transitions are extracted into a pure,
independently-testable state machine (`games/lab/animPhase.ts`) that `games/lab/character.ts`
drives to pick which pose-blend to render. Sprint (Shift key) threads through the existing
`InputScheme` → `Game.setMoveVector` → game-logic chain as a new optional boolean.

**Tech Stack:** TypeScript, Three.js (`THREE.Vector2`), Vitest (`jsdom` environment already
configured in `vite.config.ts`).

## Global Constraints

- No new dependencies (no cannon.js/physics engine) — spec explicitly rules this out.
- No player-controlled camera rotation/zoom — camera stays at its current fixed top-down angle.
- `Humanoid.setWalking(isWalking: boolean)` keeps its existing name and signature (external
  callers in `games/quantum-heist/index.ts` must not need changes beyond adding the new
  `setSprinting` call).
- `MovementCallbacks.onMove` and `Game.setMoveVector` gain sprint as an **optional** third
  parameter — existing 2-argument call sites (the `Joystick` touch control) must keep compiling
  unchanged.
- `npm test` and `npm run typecheck` (run from `photon-runner/`) must stay clean after every task.

---

### Task 1: Spring simulator primitives

**Files:**
- Create: `photon-runner/engine/springs.ts`
- Test: `photon-runner/test/engine/springs.test.ts`

**Interfaces:**
- Produces: `SpringSimulator` (scalar), `VectorSpringSimulator` (2D via `THREE.Vector2`),
  `RelativeSpringSimulator` (wrapped angle in radians) — all with `position`, `velocity`,
  `target` fields and an `advance(dt: number): void` method that integrates one step. Consumed
  by Tasks 5 and 6.

- [ ] **Step 1: Write the failing tests**

```typescript
// photon-runner/test/engine/springs.test.ts
import { describe, expect, it } from 'vitest';
import { SpringSimulator, VectorSpringSimulator, RelativeSpringSimulator } from '../../engine/springs';

function run(steps: number, dt: number, advance: () => void) {
  for (let i = 0; i < steps; i++) advance();
}

describe('SpringSimulator', () => {
  it('converges to the target without significant overshoot', () => {
    const s = new SpringSimulator(0.12, 5.8, 0);
    s.target = 10;
    let maxSeen = 0;
    run(300, 1 / 60, () => {
      s.advance(1 / 60);
      maxSeen = Math.max(maxSeen, s.position);
    });
    expect(s.position).toBeGreaterThan(9.9);
    expect(s.position).toBeLessThan(10.1);
    expect(maxSeen).toBeLessThan(10.5); // no meaningful overshoot
  });

  it('starts at rest and does not move before a target is set', () => {
    const s = new SpringSimulator(0.12, 5.8, 3);
    s.advance(1 / 60);
    expect(s.position).toBeCloseTo(3, 5);
  });
});

describe('VectorSpringSimulator', () => {
  it('converges to a 2D target', () => {
    const s = new VectorSpringSimulator(0.12, 5.8);
    s.target.set(4, -3);
    run(300, 1 / 60, () => s.advance(1 / 60));
    expect(s.position.x).toBeCloseTo(4, 1);
    expect(s.position.y).toBeCloseTo(-3, 1);
  });
});

describe('RelativeSpringSimulator', () => {
  it('converges to a plain target angle', () => {
    const s = new RelativeSpringSimulator(0.05, 9, 0);
    s.target = 1.2;
    run(300, 1 / 60, () => s.advance(1 / 60));
    expect(s.position).toBeCloseTo(1.2, 1);
  });

  it('takes the short way across the +-PI seam', () => {
    // start and target are ~0.28 rad apart across the wrap, ~6 rad apart the long way.
    const s = new RelativeSpringSimulator(0.05, 9, 3.0);
    s.target = -3.0;
    let maxDelta = 0;
    run(30, 1 / 60, () => {
      s.advance(1 / 60);
      const delta = Math.abs(s.position - 3.0);
      maxDelta = Math.max(maxDelta, Math.min(delta, Math.PI * 2 - delta));
    });
    // If it had gone the long way it would have travelled several radians in the
    // first half second; the short path stays under 1 rad throughout.
    expect(maxDelta).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `photon-runner/`): `npm test -- springs`
Expected: FAIL — `engine/springs.ts` does not exist yet.

- [ ] **Step 3: Implement the spring simulators**

```typescript
// photon-runner/engine/springs.ts
import * as THREE from 'three';

/**
 * A damped spring that chases `target`, tracking `velocity` between calls so
 * motion eases in/out instead of snapping. `mass` behaves like inverse
 * stiffness (smaller = snappier); `damping` should be roughly 2/sqrt(mass)
 * for critical damping (fast settle, no oscillation).
 */
export class SpringSimulator {
  position: number;
  velocity = 0;
  target: number;

  constructor(private mass: number, private damping: number, start = 0) {
    this.position = start;
    this.target = start;
  }

  advance(dt: number): void {
    const accel = (this.target - this.position) / this.mass - this.velocity * this.damping;
    this.velocity += accel * dt;
    this.position += this.velocity * dt;
  }
}

/** Same as {@link SpringSimulator} but over a 2D vector (e.g. planar velocity). */
export class VectorSpringSimulator {
  readonly position: THREE.Vector2;
  readonly velocity = new THREE.Vector2();
  readonly target: THREE.Vector2;

  constructor(private mass: number, private damping: number, start = new THREE.Vector2()) {
    this.position = start.clone();
    this.target = start.clone();
  }

  advance(dt: number): void {
    const ax = (this.target.x - this.position.x) / this.mass - this.velocity.x * this.damping;
    const ay = (this.target.y - this.position.y) / this.mass - this.velocity.y * this.damping;
    this.velocity.x += ax * dt;
    this.velocity.y += ay * dt;
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
  }
}

/**
 * Same as {@link SpringSimulator} but for an angle in radians — the delta to
 * `target` is always taken the short way around the +-PI seam, and `position`
 * is kept wrapped to (-PI, PI].
 */
export class RelativeSpringSimulator {
  position: number;
  velocity = 0;
  target: number;

  constructor(private mass: number, private damping: number, start = 0) {
    this.position = start;
    this.target = start;
  }

  advance(dt: number): void {
    let delta = this.target - this.position;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    const accel = delta / this.mass - this.velocity * this.damping;
    this.velocity += accel * dt;
    this.position += this.velocity * dt;

    while (this.position > Math.PI) this.position -= Math.PI * 2;
    while (this.position < -Math.PI) this.position += Math.PI * 2;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- springs`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add engine/springs.ts test/engine/springs.test.ts
git commit -m "feat(engine): critically-damped spring simulators for movement/camera smoothing"
```

---

### Task 2: Pure animation-phase state machine

**Files:**
- Create: `photon-runner/games/lab/animPhase.ts`
- Test: `photon-runner/test/lab/animPhase.test.ts`

**Interfaces:**
- Produces: `AnimPhase` type, `PhaseState` interface (`{ phase: AnimPhase; elapsed: number }`),
  `initialPhaseState(): PhaseState`, `advancePhase(state: PhaseState, dt: number, moving:
  boolean, sprinting: boolean): PhaseState`. Consumed by Task 6 (`character.ts`).

- [ ] **Step 1: Write the failing tests**

```typescript
// photon-runner/test/lab/animPhase.test.ts
import { describe, expect, it } from 'vitest';
import { advancePhase, initialPhaseState } from '../../games/lab/animPhase';

describe('advancePhase', () => {
  it('starts idle', () => {
    expect(initialPhaseState()).toEqual({ phase: 'idle', elapsed: 0 });
  });

  it('idle -> startWalk the instant movement begins', () => {
    const s = advancePhase(initialPhaseState(), 0.016, true, false);
    expect(s.phase).toBe('startWalk');
  });

  it('startWalk -> walk after its blend duration elapses while still moving', () => {
    let s = advancePhase(initialPhaseState(), 0.016, true, false);
    expect(s.phase).toBe('startWalk');
    // 0.15s blend duration; step past it.
    for (let i = 0; i < 20; i++) s = advancePhase(s, 0.016, true, false);
    expect(s.phase).toBe('walk');
  });

  it('startWalk -> sprint (skipping walk) if sprinting when the blend finishes', () => {
    let s = advancePhase(initialPhaseState(), 0.016, true, true);
    for (let i = 0; i < 20; i++) s = advancePhase(s, 0.016, true, true);
    expect(s.phase).toBe('sprint');
  });

  it('walk <-> sprint toggle instantly while still moving', () => {
    let s = { phase: 'walk' as const, elapsed: 1 };
    s = advancePhase(s, 0.016, true, true);
    expect(s.phase).toBe('sprint');
    s = advancePhase(s, 0.016, true, false);
    expect(s.phase).toBe('walk');
  });

  it('walk -> stopWalk -> idle when movement stops', () => {
    let s = { phase: 'walk' as const, elapsed: 1 };
    s = advancePhase(s, 0.016, false, false);
    expect(s.phase).toBe('stopWalk');
    // 0.12s blend duration; step past it.
    for (let i = 0; i < 20; i++) s = advancePhase(s, 0.016, false, false);
    expect(s.phase).toBe('idle');
  });

  it('stopWalk -> startWalk if movement resumes mid-blend', () => {
    let s = { phase: 'stopWalk' as const, elapsed: 0.02 };
    s = advancePhase(s, 0.016, true, false);
    expect(s.phase).toBe('startWalk');
  });

  it('idle stays idle while not moving', () => {
    const s = advancePhase(initialPhaseState(), 0.016, false, false);
    expect(s).toEqual({ phase: 'idle', elapsed: 0.016 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- animPhase`
Expected: FAIL — `games/lab/animPhase.ts` does not exist yet.

- [ ] **Step 3: Implement the phase state machine**

```typescript
// photon-runner/games/lab/animPhase.ts

/**
 * Character animation transition phases. `startWalk`/`stopWalk` are short
 * blends (see the *_DURATION constants) between the idle and walk poses;
 * `walk`/`sprint` are steady-state cyclic gaits.
 */
export type AnimPhase = 'idle' | 'startWalk' | 'walk' | 'sprint' | 'stopWalk';

export interface PhaseState {
  phase: AnimPhase;
  /** Seconds spent in the current phase — drives startWalk/stopWalk blend progress. */
  elapsed: number;
}

const START_WALK_DURATION = 0.15;
const STOP_WALK_DURATION = 0.12;

export function initialPhaseState(): PhaseState {
  return { phase: 'idle', elapsed: 0 };
}

export function advancePhase(state: PhaseState, dt: number, moving: boolean, sprinting: boolean): PhaseState {
  const elapsed = state.elapsed + dt;

  switch (state.phase) {
    case 'idle':
      return moving ? { phase: 'startWalk', elapsed: 0 } : { phase: 'idle', elapsed };

    case 'startWalk':
      if (!moving) return { phase: 'stopWalk', elapsed: 0 };
      if (elapsed >= START_WALK_DURATION) return { phase: sprinting ? 'sprint' : 'walk', elapsed: 0 };
      return { phase: 'startWalk', elapsed };

    case 'walk':
      if (!moving) return { phase: 'stopWalk', elapsed: 0 };
      if (sprinting) return { phase: 'sprint', elapsed: 0 };
      return { phase: 'walk', elapsed };

    case 'sprint':
      if (!moving) return { phase: 'stopWalk', elapsed: 0 };
      if (!sprinting) return { phase: 'walk', elapsed: 0 };
      return { phase: 'sprint', elapsed };

    case 'stopWalk':
      if (moving) return { phase: 'startWalk', elapsed: 0 };
      if (elapsed >= STOP_WALK_DURATION) return { phase: 'idle', elapsed: 0 };
      return { phase: 'stopWalk', elapsed };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- animPhase`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Commit**

```bash
git add games/lab/animPhase.ts test/lab/animPhase.test.ts
git commit -m "feat(lab): pure idle/start-walk/walk/sprint/stop-walk animation phase machine"
```

---

### Task 3: Sprint input plumbing (keyboard scheme)

**Files:**
- Modify: `photon-runner/engine/inputSchemes/types.ts`
- Modify: `photon-runner/engine/inputSchemes/keyboardMovement.ts`
- Test: `photon-runner/test/engine/keyboardMovement.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `MovementCallbacks.onMove` now called as `onMove(x, z, sprint)`; `sprint` is `true`
  while Shift is held alongside a movement key. Consumed by Task 4.

- [ ] **Step 1: Write the failing test**

```typescript
// photon-runner/test/engine/keyboardMovement.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKeyboardMovementInput } from '../../engine/keyboardMovement';

function keyEvent(type: 'keydown' | 'keyup', key: string): KeyboardEvent {
  return new KeyboardEvent(type, { key });
}

describe('createKeyboardMovementInput sprint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports sprint=false while walking without Shift', () => {
    const scheme = createKeyboardMovementInput();
    const onMove = vi.fn();
    const el = document.createElement('div');
    scheme.attach(el, { onMove, onInteract: vi.fn() });

    window.dispatchEvent(keyEvent('keydown', 'w'));
    expect(onMove).toHaveBeenLastCalledWith(0, 1, false);

    scheme.detach();
  });

  it('reports sprint=true once Shift is held alongside a movement key', () => {
    const scheme = createKeyboardMovementInput();
    const onMove = vi.fn();
    const el = document.createElement('div');
    scheme.attach(el, { onMove, onInteract: vi.fn() });

    window.dispatchEvent(keyEvent('keydown', 'w'));
    window.dispatchEvent(keyEvent('keydown', 'Shift'));
    expect(onMove).toHaveBeenLastCalledWith(0, 1, true);

    window.dispatchEvent(keyEvent('keyup', 'Shift'));
    expect(onMove).toHaveBeenLastCalledWith(0, 1, false);

    scheme.detach();
  });

  it('clears sprint on blur along with movement', () => {
    const scheme = createKeyboardMovementInput();
    const onMove = vi.fn();
    const el = document.createElement('div');
    scheme.attach(el, { onMove, onInteract: vi.fn() });

    window.dispatchEvent(keyEvent('keydown', 'w'));
    window.dispatchEvent(keyEvent('keydown', 'Shift'));
    window.dispatchEvent(new Event('blur'));
    expect(onMove).toHaveBeenLastCalledWith(0, 0, false);

    scheme.detach();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- keyboardMovement`
Expected: FAIL — either the import path is wrong (fix to `../../engine/inputSchemes/keyboardMovement` if needed) or `onMove` is still called with only 2 arguments so `toHaveBeenLastCalledWith(0, 1, false)` fails.

- [ ] **Step 3: Update the types and implementation**

```typescript
// photon-runner/engine/inputSchemes/types.ts
export interface MovementCallbacks {
  /**
   * x: -1 (left) .. 1 (right) strafe, z: -1 (back) .. 1 (forward).
   * sprint: true while a sprint modifier (e.g. Shift) is held alongside
   * movement. Schemes that have no sprint concept (touch joystick) omit it,
   * which callers must treat the same as `false`.
   */
  onMove: (x: number, z: number, sprint?: boolean) => void;
  onInteract: () => void;
}

/**
 * A control scheme translates raw keyboard/touch/pointer events into the
 * movement events every game cares about. Games never touch DOM events
 * directly, so a new scheme can be added later without changing game code.
 */
export interface InputScheme {
  id: string;
  attach(target: HTMLElement, callbacks: MovementCallbacks): void;
  detach(): void;
}
```

```typescript
// photon-runner/engine/inputSchemes/keyboardMovement.ts
import { InputScheme, MovementCallbacks } from './types';

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
const INTERACT_KEYS = new Set(['e', 'enter', ' ']);
const SPRINT_KEYS = new Set(['shift']);

/** Laptop control scheme: WASD/arrow keys for movement, E/Enter/Space to interact, Shift to sprint. */
export function createKeyboardMovementInput(): InputScheme {
  let callbacks: MovementCallbacks | null = null;
  const held = new Set<string>();

  const computeAndEmit = () => {
    if (!callbacks) return;
    let x = 0;
    let z = 0;
    if (held.has('a') || held.has('arrowleft')) x -= 1;
    if (held.has('d') || held.has('arrowright')) x += 1;
    if (held.has('w') || held.has('arrowup')) z += 1;
    if (held.has('s') || held.has('arrowdown')) z -= 1;
    const sprint = held.has('shift');
    callbacks.onMove(x, z, sprint);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (INTERACT_KEYS.has(key)) {
      e.preventDefault();
      callbacks?.onInteract();
      return;
    }
    if (!MOVE_KEYS.has(key) && !SPRINT_KEYS.has(key)) return;
    e.preventDefault();
    if (!held.has(key)) {
      held.add(key);
      computeAndEmit();
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (held.delete(key)) computeAndEmit();
  };

  const handleBlur = () => {
    held.clear();
    computeAndEmit();
  };

  return {
    id: 'keyboard-movement',
    attach(_el, cbs) {
      callbacks = cbs;
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('blur', handleBlur);
    },
    detach() {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      held.clear();
      callbacks = null;
    },
  };
}
```

Fix the test's import to the correct path before running:
`import { createKeyboardMovementInput } from '../../engine/inputSchemes/keyboardMovement';`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- keyboardMovement`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add engine/inputSchemes/types.ts engine/inputSchemes/keyboardMovement.ts test/engine/keyboardMovement.test.ts
git commit -m "feat(input): Shift-to-sprint on the keyboard movement scheme"
```

---

### Task 4: Sprint plumbing through Game.setMoveVector and HeistScreen

**Files:**
- Modify: `photon-runner/engine/GameEngine.ts:18`
- Modify: `photon-runner/ui/HeistScreen.tsx:66`

**Interfaces:**
- Consumes: `MovementCallbacks.onMove(x, z, sprint?)` from Task 3.
- Produces: `Game.setMoveVector(x: number, z: number, sprint?: boolean): void`. Consumed by
  Task 6 (`createQuantumHeist`'s `setMoveVector` implementation).

- [ ] **Step 1: Update the `Game` interface**

In `photon-runner/engine/GameEngine.ts`, change line 18 from:

```typescript
  setMoveVector(x: number, z: number): void;
```

to:

```typescript
  setMoveVector(x: number, z: number, sprint?: boolean): void;
```

- [ ] **Step 2: Wire the keyboard scheme's sprint flag through in HeistScreen**

In `photon-runner/ui/HeistScreen.tsx`, change lines 65-68 from:

```typescript
    keyboard.attach(canvas, {
      onMove: (x, z) => game.setMoveVector(x, z),
      onInteract: () => game.interact(),
    });
```

to:

```typescript
    keyboard.attach(canvas, {
      onMove: (x, z, sprint) => game.setMoveVector(x, z, sprint),
      onInteract: () => game.interact(),
    });
```

The `Joystick` call site at (around) line 274 — `<Joystick onChange={(x, z) => gameRef.current?.setMoveVector(x, z)} />` — is left unchanged; `sprint` defaults to `undefined`/falsy there, which is correct (touch has no sprint modifier yet).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors. `createQuantumHeist`'s `setMoveVector(x, z)` (2-arg, in `games/quantum-heist/index.ts`) still satisfies the now-3-parameter `Game.setMoveVector` interface because the third parameter is optional — this will only become a real behavior gap once Task 6 makes `setMoveVector` use `sprint`, at which point the signature must be updated too (that happens in Task 6).

- [ ] **Step 4: Commit**

```bash
git add engine/GameEngine.ts ui/HeistScreen.tsx
git commit -m "feat(engine): thread optional sprint flag through Game.setMoveVector"
```

---

### Task 5: Camera look-ahead spring

**Files:**
- Modify: `photon-runner/games/lab/world.ts`

**Interfaces:**
- Consumes: `VectorSpringSimulator` from Task 1.
- Produces: `World.updateCamera(playerPos: THREE.Vector3, dt: number, velocity?: THREE.Vector2):
  void` — Task 6 calls this with a real velocity vector. The third parameter is optional so this
  task's typecheck passes standalone (existing 2-arg callers, if any survive until Task 6 lands,
  keep compiling).

**Context — current code being replaced:**

```typescript
export interface World {
  spawnMarker(position: THREE.Vector3, color: number, kind?: 'task' | 'hostile'): MarkerHandle;
  removeMarker(handle: MarkerHandle): void;
  update(dt: number): void;
  updateCamera(playerPos: THREE.Vector3, dt: number): void;
  pingSensor(id: string): void;
  popVent(ventId: string): void;
  dispose(): void;
}
```

and, in the returned object:

```typescript
    updateCamera(playerPos, dt) {
      const desired = new THREE.Vector3(playerPos.x * 0.6, 13.5, playerPos.z + 10);
      camera.position.lerp(desired, Math.min(dt * 3.2, 1));
      camera.lookAt(playerPos.x * 0.6, 0.8, playerPos.z + 0.5);
    },
```

- [ ] **Step 1: Add the import and the look-ahead spring, scoped alongside the other module state**

```typescript
import { VectorSpringSimulator } from '../../engine/springs';
```

Add near the other top-of-factory state (alongside `let clock = 0;`):

```typescript
  const lookAhead = new VectorSpringSimulator(0.35, 3.4);
```

- [ ] **Step 2: Update the `World` interface and the `updateCamera` implementation**

```typescript
export interface World {
  spawnMarker(position: THREE.Vector3, color: number, kind?: 'task' | 'hostile'): MarkerHandle;
  removeMarker(handle: MarkerHandle): void;
  update(dt: number): void;
  updateCamera(playerPos: THREE.Vector3, dt: number, velocity?: THREE.Vector2): void;
  pingSensor(id: string): void;
  popVent(ventId: string): void;
  dispose(): void;
}
```

```typescript
    updateCamera(playerPos, dt, velocity) {
      // Look slightly ahead of travel direction — more pronounced at higher
      // speed (sprinting), settles back to zero at rest.
      const vx = velocity?.x ?? 0;
      const vz = velocity?.y ?? 0;
      lookAhead.target.set(vx * 0.18, vz * 0.18);
      lookAhead.advance(dt);

      const anchorX = playerPos.x + lookAhead.position.x;
      const anchorZ = playerPos.z + lookAhead.position.y;
      const desired = new THREE.Vector3(anchorX * 0.6, 13.5, anchorZ + 10);
      camera.position.lerp(desired, Math.min(dt * 3.2, 1));
      camera.lookAt(anchorX * 0.6, 0.8, anchorZ + 0.5);
    },
```

- [ ] **Step 3: Typecheck and run the full suite**

Run: `npm run typecheck && npm test`
Expected: no errors; test count unchanged (no test exercises `world.ts`'s camera code today —
confirm with `grep -rl "createWorld" test/` returning nothing).

- [ ] **Step 4: Commit**

```bash
git add games/lab/world.ts
git commit -m "feat(lab): spring-damped camera follow with speed-based look-ahead"
```

---

### Task 6: Character animation phases + spring-smoothed movement/facing in Quantum Heist

This task was originally planned as two separate tasks (movement in `index.ts`, animation
phases in `character.ts`), but pre-flight review found they're circularly coupled:
`character.ts`'s `faceDirection` signature change and `index.ts`'s call-site updates each only
typecheck once the other has landed. They're merged into one task/commit so `npm run typecheck`
never sees the broken intermediate state (per this plan's Global Constraints).

**Files:**
- Modify: `photon-runner/games/lab/character.ts`
- Modify: `photon-runner/games/quantum-heist/index.ts`

**Interfaces:**
- Consumes: `VectorSpringSimulator`, `RelativeSpringSimulator` from `engine/springs.ts` (Task 1);
  `AnimPhase`, `PhaseState`, `initialPhaseState`, `advancePhase` from `games/lab/animPhase.ts`
  (Task 2); `Game.setMoveVector(x, z, sprint?)` from Task 4; `World.updateCamera(playerPos, dt,
  velocity?)` from Task 5.
- Produces: `Humanoid.setSprinting(isSprinting: boolean): void` (new method); `Humanoid.faceDirection`
  changes signature from `(x: number, z: number)` to `(angle: number)` — turn smoothing moves
  from inside `character.ts` to the caller's `RelativeSpringSimulator`. Both the interface change
  and every call site are updated together in this task, so no intermediate commit has a broken
  signature/call-site pairing.

Do the `character.ts` steps (1-5) before the `index.ts` steps (6-9) — the `index.ts` steps call
`player.faceDirection`/`setSprinting` expecting `character.ts`'s new signatures to already exist.

---

#### `character.ts` steps

- [ ] **Step 1: Confirm `faceDirection`'s only callers are in `quantum-heist/index.ts`**

Run: `grep -rn "faceDirection" --include=*.ts --include=*.tsx .` (from `photon-runner/`)
Expected: matches only in `games/lab/character.ts` (the definition) and
`games/quantum-heist/index.ts` (four call sites, all of which Steps 6-9 below update in this
same task/commit — no external code depends on the old two-argument form).

- [ ] **Step 2: Import the phase machine and add `setSprinting` + phase state**

Add the import at the top of `character.ts`:

```typescript
import { AnimPhase, PhaseState, advancePhase, initialPhaseState } from './animPhase';
```

Update the `Humanoid` interface:

```typescript
export interface Humanoid {
  group: THREE.Group;
  setWalking(isWalking: boolean): void;
  setSprinting(isSprinting: boolean): void;
  update(dt: number): void;
  faceDirection(angle: number): void;
  /** Plays a one-shot gesture (used for interactions / taps). */
  wave(): void;
  dispose(): void;
}
```

- [ ] **Step 3: Replace the `walking`/`walkPhase` booleans with phase-machine state**

Replace:

```typescript
  let walkPhase = 0;
  let idleClock = 0;
  let walking = false;
  let blinkTimer = 2 + Math.random() * 3;
```

with:

```typescript
  let walkPhase = 0;
  let idleClock = 0;
  let moving = false;
  let sprinting = false;
  let phaseState: PhaseState = initialPhaseState();
  let blinkTimer = 2 + Math.random() * 3;
```

- [ ] **Step 4: Update `setWalking`, add `setSprinting`, and drive the phase machine in `update(dt)`**

Replace:

```typescript
    setWalking(isWalking) {
      walking = isWalking;
    },
```

with:

```typescript
    setWalking(isWalking) {
      moving = isWalking;
    },

    setSprinting(isSprinting) {
      sprinting = isSprinting;
    },
```

At the top of `update(dt)`, right after `idleClock += dt;`, advance the phase machine and derive
the two booleans the existing pose code branches on (`walking` for the walk-cycle branch,
`sprintRate` for stride speed):

```typescript
      idleClock += dt;
      phaseState = advancePhase(phaseState, dt, moving, sprinting);
      const phase: AnimPhase = phaseState.phase;
      const walking = phase === 'walk' || phase === 'sprint' || phase === 'startWalk' || phase === 'stopWalk';
      const sprintRate = phase === 'sprint' ? 1.35 : 1;
```

Then, in the existing `if (walking) { ... }` branch, change the stride-rate line:

```typescript
        walkPhase += dt * 8.2;
```

to:

```typescript
        walkPhase += dt * 8.2 * sprintRate;
```

and scale the leg swing amplitude by `sprintRate` so sprint reads as a bigger, faster stride
rather than just a faster loop of the same small motion — change:

```typescript
        legs.l.hip.rotation.x = s * 0.62;
        legs.r.hip.rotation.x = -s * 0.62;
```

to:

```typescript
        legs.l.hip.rotation.x = s * 0.62 * sprintRate;
        legs.r.hip.rotation.x = -s * 0.62 * sprintRate;
```

(leave the knee/ankle/arm/torso lines as-is — the spec only requires the stride to read as
faster/bigger, not a full re-tune of every joint; the hip swing amplitude change plus the faster
`walkPhase` rate is sufficient to distinguish sprint from walk visually.)

For the `startWalk`/`stopWalk` blend requested by the spec: add a blend factor computed from
`phaseState.elapsed`, right after the `walkPhase += dt * 8.2 * sprintRate;` line:

```typescript
        const blendT =
          phase === 'startWalk'
            ? Math.min(1, phaseState.elapsed / 0.15)
            : phase === 'stopWalk'
              ? 1 - Math.min(1, phaseState.elapsed / 0.12)
              : 1;
```

then wrap the torso/body lines that follow (`torso.rotation.y = -s * 0.1;`, `torso.rotation.x =
0.05;`, `body.position.y = Math.abs(c) * 0.035;`, `headPivot.rotation.y = s * 0.06;`,
`headPivot.rotation.x = -0.03;`) with the blend — these are the properties that most read as
"starting/stopping", so blending just these (not every joint) is enough:

```typescript
        torso.rotation.y = -s * 0.1 * blendT;
        torso.rotation.x = 0.05 * blendT;
        body.position.y = Math.abs(c) * 0.035 * blendT;
        headPivot.rotation.y = s * 0.06 * blendT;
        headPivot.rotation.x = -0.03 * blendT;
```

- [ ] **Step 5: Update `faceDirection` to accept a plain angle**

Replace:

```typescript
    faceDirection(x, z) {
      if (x === 0 && z === 0) return;
      const target = Math.atan2(x, z);
      // Shortest-path turn so the figure never spins the long way round.
      let delta = target - root.rotation.y;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      root.rotation.y += delta * 0.25;
    },
```

with:

```typescript
    faceDirection(angle) {
      root.rotation.y = angle;
    },
```

(Turn smoothing now happens in the caller's `RelativeSpringSimulator` — see Steps 7-8 below,
which compute the shortest-path-adjusted angle before calling this.)

---

#### `index.ts` steps

**Context — current code being replaced** (`games/quantum-heist/index.ts`):

```typescript
const MOVE_SPEED = 4.4;
...
  const playerPos = new THREE.Vector3(map.meeting.x, 0, map.meeting.z + 2);
  let moveX = 0;
  let moveZ = 0;
  let hasMoved = false;
```

and, inside `update(dt)`:

```typescript
      if (canMove) {
        const len = Math.hypot(moveX, moveZ);
        const nx = len > 1 ? moveX / len : moveX;
        const nz = len > 1 ? moveZ / len : moveZ;
        if (nx !== 0 || nz !== 0) {
          const tx = playerPos.x + nx * MOVE_SPEED * dt;
          const tz = playerPos.z - nz * MOVE_SPEED * dt;
          if (isWalkable(map, tx, playerPos.z, BODY_PAD)) playerPos.x = tx;
          if (isWalkable(map, playerPos.x, tz, BODY_PAD)) playerPos.z = tz;
          player.setWalking(true);
          player.faceDirection(nx, -nz);
          if (!hasMoved) {
            hasMoved = true;
            teach('move');
          }
        } else {
          player.setWalking(false);
        }
      } else if (g.phase === 'meeting' || g.phase === 'ended') {
        const to = new THREE.Vector3(map.meeting.x, 0, map.meeting.z + 1.6).sub(playerPos);
        to.y = 0;
        if (to.length() > 0.25) {
          to.normalize();
          playerPos.addScaledVector(to, MOVE_SPEED * 0.7 * dt);
          player.setWalking(true);
          player.faceDirection(to.x, to.z);
        } else {
          player.setWalking(false);
        }
      } else {
        player.setWalking(false);
      }
      player.group.position.copy(playerPos);
      player.update(dt);
```

and `setMoveVector`:

```typescript
    setMoveVector(x, z) {
      moveX = x;
      moveZ = z;
    },
```

and the final camera call:

```typescript
      world.update(dt);
      world.updateCamera(playerPos, dt);
```

- [ ] **Step 6: Add sprint speed, the movement spring, and the facing spring**

Add near the top of `games/quantum-heist/index.ts`, alongside the existing speed constants:

```typescript
const MOVE_SPEED = 4.4;
const SPRINT_SPEED = 7.0;
const BOT_SPEED = 3.2;
```

Add the import:

```typescript
import { VectorSpringSimulator, RelativeSpringSimulator } from '../../engine/springs';
```

Replace the `moveX`/`moveZ` declarations with a sprint flag and the two springs (kept alongside
`playerPos`):

```typescript
  const playerPos = new THREE.Vector3(map.meeting.x, 0, map.meeting.z + 2);
  let moveX = 0;
  let moveZ = 0;
  let sprinting = false;
  let hasMoved = false;
  const velocitySpring = new VectorSpringSimulator(0.12, 5.8);
  const facingSpring = new RelativeSpringSimulator(0.05, 9);
```

- [ ] **Step 7: Replace the direct-write movement block with spring-integrated movement**

Replace the entire `if (canMove) { ... } else if (g.phase === 'meeting' || g.phase === 'ended')
{ ... } else { player.setWalking(false); }` chain (all three branches, verbatim as shown in
"Context" above) with:

```typescript
      if (canMove) {
        const len = Math.hypot(moveX, moveZ);
        const nx = len > 1 ? moveX / len : moveX;
        const nz = len > 1 ? moveZ / len : moveZ;
        const speed = sprinting ? SPRINT_SPEED : MOVE_SPEED;
        velocitySpring.target.set(nx * speed, -nz * speed);
        velocitySpring.advance(dt);

        if (nx !== 0 || nz !== 0) {
          const tx = playerPos.x + velocitySpring.position.x * dt;
          const tz = playerPos.z + velocitySpring.position.y * dt;
          if (isWalkable(map, tx, playerPos.z, BODY_PAD)) playerPos.x = tx;
          if (isWalkable(map, playerPos.x, tz, BODY_PAD)) playerPos.z = tz;
          facingSpring.target = Math.atan2(nx, -nz);
          player.setWalking(true);
          player.setSprinting(sprinting);
          if (!hasMoved) {
            hasMoved = true;
            teach('move');
          }
        } else {
          player.setWalking(false);
          player.setSprinting(false);
        }
        facingSpring.advance(dt);
        player.faceDirection(facingSpring.position);
      } else if (g.phase === 'meeting' || g.phase === 'ended') {
        velocitySpring.target.set(0, 0);
        velocitySpring.position.set(0, 0);
        player.setSprinting(false);
        const to = new THREE.Vector3(map.meeting.x, 0, map.meeting.z + 1.6).sub(playerPos);
        to.y = 0;
        if (to.length() > 0.25) {
          to.normalize();
          playerPos.addScaledVector(to, MOVE_SPEED * 0.7 * dt);
          player.setWalking(true);
          facingSpring.target = Math.atan2(to.x, to.z);
          facingSpring.advance(dt);
          player.faceDirection(facingSpring.position);
        } else {
          player.setWalking(false);
        }
      } else {
        player.setWalking(false);
        player.setSprinting(false);
      }
```

This keeps the original three-way `if`/`else if`/`else` structure and the meeting/ended branch's
existing auto-walk-to-meeting logic completely intact (same `to`/`normalize`/`addScaledVector`
math as before, at the same `MOVE_SPEED * 0.7` speed — not spring-integrated, per the spec's
Non-goals) — the only additions there are resetting `velocitySpring` to zero (so it doesn't
carry stale momentum into the *next* time the player regains control), calling
`player.setSprinting(false)` (Shift held during a meeting shouldn't sprint), and swapping the
old direct `player.faceDirection(to.x, to.z)` call for the new angle-based `facingSpring`-driven
one (required by Step 5's signature change). The final `else` branch (tutorial-paused / terminal
open) gets the same `setSprinting(false)` addition so a held Shift can't stick sprint on once
movement resumes.

Note: `velocitySpring.target` uses `(nx*speed, -nz*speed)` to match the existing sign convention
(`tz = playerPos.z - nz * MOVE_SPEED * dt` in the old code — z decreases for forward input); the
vector spring's `.y` field carries world-space Z velocity here, `.x` carries world X.
`facingSpring.target` uses the same `atan2(nx, -nz)` the old `faceDirection` computed internally
(its `Math.atan2(x, z)` called with `x, -nz` passed in) so the model still faces the direction of
travel with matching orientation.

Update `player.group.position.copy(playerPos); player.update(dt);` — unchanged, keep as-is.

- [ ] **Step 8: Update `setMoveVector` to capture sprint**

```typescript
    setMoveVector(x, z, sprint = false) {
      moveX = x;
      moveZ = z;
      sprinting = sprint;
    },
```

- [ ] **Step 9: Pass velocity through to the camera**

Change the final lines of `update(dt)` from:

```typescript
      world.update(dt);
      world.updateCamera(playerPos, dt);
```

to:

```typescript
      world.update(dt);
      world.updateCamera(playerPos, dt, velocitySpring.position);
```

---

- [ ] **Step 10: Typecheck and run the full suite**

Run: `npm run typecheck && npm test`
Expected: no errors; `npm test` stays at 148+ passing (no existing test imports
`createQuantumHeist`, so none of these changes can break an existing assertion — confirm by
checking `test/quantum-heist/` only covers `logic.ts`/`tutorial.ts`; and
`test/characterAppearance.test.ts` doesn't touch `character.ts`'s geometry/animation code).

- [ ] **Step 11: Commit**

```bash
git add games/lab/character.ts games/quantum-heist/index.ts
git commit -m "feat(quantum-heist): spring-smoothed movement/facing, sprint, animation phases"
```

---

### Task 7: Manual playtest and final verification

**Files:** none (verification-only task).

- [ ] **Step 1: Run the full automated check**

Run (from `photon-runner/`): `npm run typecheck && npm test`
Expected: typecheck clean, all tests passing (148 pre-existing + 5 springs + 8 animPhase + 3
keyboardMovement = 164).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 3: Manual playtest**

Run: `npm run dev` (from `photon-runner/`), open the app, start a Quantum Heist round (any map,
skip or run the tutorial), and check:
- Walking with WASD/arrows eases in and out instead of snapping to full speed instantly.
- Holding Shift while moving visibly speeds up both the character's translation and its stride
  animation, and releasing Shift mid-stride smoothly returns to walk speed.
- Turning (e.g. strafing then reversing direction) turns smoothly rather than snapping to face
  the new direction instantly.
- The camera leans slightly ahead of travel direction while moving, more noticeably while
  sprinting, and settles back to centered on the player at rest — without ever letting the
  player scroll/rotate the camera themselves.
- Starting to walk from a stand-still shows a brief lean-in before the full walk cycle kicks in;
  stopping shows a brief settle rather than an instant freeze.
- No regressions: interacting with terminals, the emergency meeting auto-walk, and bots/mentor
  movement still look correct (these were intentionally left using their pre-existing
  non-spring movement per the spec's Non-goals).

If anything reads wrong (too floaty, too snappy, sprint too subtle), note the specific spring
constants to retune (`mass`/`damping` in Task 6's `velocitySpring`/`facingSpring`, Task 5's
`lookAhead`, or the sprint-rate/blend constants in Task 6) — these are the only tunable knobs and
don't require any other code changes.

- [ ] **Step 4: Final commit (only if playtest retuning changed constants)**

```bash
git add -A
git commit -m "tune: adjust spring constants after playtest"
```

(Skip this step if no retuning was needed.)
