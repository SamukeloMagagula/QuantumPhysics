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
