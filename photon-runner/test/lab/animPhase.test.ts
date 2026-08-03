import { describe, expect, it } from 'vitest';
import { advancePhase, initialPhaseState, PhaseState } from '../../games/lab/animPhase';

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
    let s: PhaseState = { phase: 'walk', elapsed: 1 };
    s = advancePhase(s, 0.016, true, true);
    expect(s.phase).toBe('sprint');
    s = advancePhase(s, 0.016, true, false);
    expect(s.phase).toBe('walk');
  });

  it('walk -> stopWalk -> idle when movement stops', () => {
    let s: PhaseState = { phase: 'walk', elapsed: 1 };
    s = advancePhase(s, 0.016, false, false);
    expect(s.phase).toBe('stopWalk');
    // 0.12s blend duration; step past it.
    for (let i = 0; i < 20; i++) s = advancePhase(s, 0.016, false, false);
    expect(s.phase).toBe('idle');
  });

  it('stopWalk -> startWalk if movement resumes mid-blend', () => {
    let s: PhaseState = { phase: 'stopWalk', elapsed: 0.02 };
    s = advancePhase(s, 0.016, true, false);
    expect(s.phase).toBe('startWalk');
  });

  it('idle stays idle while not moving', () => {
    const s = advancePhase(initialPhaseState(), 0.016, false, false);
    expect(s).toEqual({ phase: 'idle', elapsed: 0.016 });
  });
});
