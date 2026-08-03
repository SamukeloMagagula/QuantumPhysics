import { describe, expect, it } from 'vitest';
import {
  TUTORIAL_STEPS,
  advanceTutorial,
  currentStep,
  finishTutorial,
  initialTutorial,
  tutorialProgress,
} from '../../games/quantum-heist/tutorial';

describe('tutorial script', () => {
  it('is not active unless the player asked for it', () => {
    expect(currentStep(initialTutorial(false))).toBeNull();
    expect(currentStep(initialTutorial(true))).not.toBeNull();
  });

  it('gives every step a unique id, a trigger, and real copy', () => {
    expect(new Set(TUTORIAL_STEPS.map((s) => s.id)).size).toBe(TUTORIAL_STEPS.length);
    for (const s of TUTORIAL_STEPS) {
      expect(s.trigger.kind).toBeTruthy();
      expect(s.body.length).toBeGreaterThan(20);
    }
  });

  it('explains the goal before asking for any input', () => {
    const first = TUTORIAL_STEPS[0];
    expect(first.trigger.kind).toBe('continue');
    expect(first.body.toLowerCase()).toContain('tapping');
  });

  it('teaches movement before it asks you to reach a console', () => {
    const move = TUTORIAL_STEPS.findIndex((s) => s.trigger.kind === 'move');
    const reach = TUTORIAL_STEPS.findIndex((s) => s.trigger.kind === 'reach-station');
    expect(move).toBeGreaterThanOrEqual(0);
    expect(reach).toBeGreaterThan(move);
  });

  it('teaches using a console before it explains the evidence it produces', () => {
    const use = TUTORIAL_STEPS.findIndex((s) => s.trigger.kind === 'open-terminal');
    const evidence = TUTORIAL_STEPS.findIndex((s) => s.trigger.kind === 'round-resolved');
    expect(use).toBeGreaterThanOrEqual(0);
    expect(evidence).toBeGreaterThan(use);
  });
});

describe('advanceTutorial', () => {
  it('ignores events the current step is not waiting for', () => {
    const t = initialTutorial(true); // step 0 waits on 'continue'
    expect(advanceTutorial(t, 'move').index).toBe(0);
    expect(advanceTutorial(t, 'complete-task').index).toBe(0);
    expect(advanceTutorial(t, 'continue').index).toBe(1);
  });

  it('walks the whole script when fed each step its own trigger', () => {
    let t = initialTutorial(true);
    let guard = 0;
    while (currentStep(t) && guard++ < 200) {
      const step = currentStep(t)!;
      const kind = step.trigger.kind;
      if (step.trigger.kind === 'complete-count') {
        for (let i = 0; i < step.trigger.count; i++) t = advanceTutorial(t, 'complete-task');
      } else {
        t = advanceTutorial(t, kind);
      }
    }
    expect(currentStep(t)).toBeNull();
    expect(t.index).toBe(TUTORIAL_STEPS.length);
  });

  it('requires the full count before clearing a counted step', () => {
    const idx = TUTORIAL_STEPS.findIndex((s) => s.trigger.kind === 'complete-count');
    const step = TUTORIAL_STEPS[idx];
    if (step.trigger.kind !== 'complete-count') throw new Error('expected a counted step');

    let t = { active: true, index: idx, counter: 0 };
    for (let i = 0; i < step.trigger.count - 1; i++) {
      t = advanceTutorial(t, 'complete-task');
      expect(t.index).toBe(idx);
    }
    t = advanceTutorial(t, 'complete-task');
    expect(t.index).toBe(idx + 1);
    expect(t.counter).toBe(0);
  });

  it('is a no-op once the script is finished', () => {
    const done = finishTutorial(initialTutorial(true));
    expect(currentStep(done)).toBeNull();
    expect(advanceTutorial(done, 'continue')).toEqual(done);
  });
});

describe('tutorialProgress', () => {
  it('reports a 1-based step that never runs past the total', () => {
    expect(tutorialProgress(initialTutorial(true))).toEqual({ step: 1, total: TUTORIAL_STEPS.length });
    expect(tutorialProgress(finishTutorial(initialTutorial(true))).step).toBe(TUTORIAL_STEPS.length);
  });
});
