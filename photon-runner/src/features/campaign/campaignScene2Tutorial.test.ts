import { describe, expect, it } from 'vitest';
import {
  SCENE2_STEPS,
  advanceScene2,
  currentScene2Step,
  initialScene2,
  isScene2Finished,
} from './campaignScene2Tutorial';

describe('scene 2 script', () => {
  it('gives every step a unique id and real copy', () => {
    expect(new Set(SCENE2_STEPS.map((s) => s.id)).size).toBe(SCENE2_STEPS.length);
    for (const s of SCENE2_STEPS) expect(s.body.length).toBeGreaterThan(10);
  });

  it('starts on the intro step and is not finished', () => {
    const s = initialScene2();
    expect(currentScene2Step(s)?.id).toBe('intro');
    expect(isScene2Finished(s)).toBe(false);
  });

  it('only advances on the declared trigger', () => {
    let s = initialScene2();
    s = advanceScene2(s, 'keypair-generated'); // wrong event for 'intro' (wants 'continue')
    expect(currentScene2Step(s)?.id).toBe('intro');
    s = advanceScene2(s, 'continue');
    expect(currentScene2Step(s)?.id).toBe('bob-generates');
  });

  it('teaches the clean asymmetric flow before the MITM twist begins', () => {
    const eveFails = SCENE2_STEPS.findIndex((s) => s.id === 'eve-fails');
    const mitmSwap = SCENE2_STEPS.findIndex((s) => s.id === 'mitm-swap');
    expect(eveFails).toBeGreaterThanOrEqual(0);
    expect(mitmSwap).toBeGreaterThan(eveFails);
  });

  it('walks the full script to completion in event order', () => {
    let s = initialScene2();
    const events: Array<Parameters<typeof advanceScene2>[1]> = [
      'continue',
      'keypair-generated',
      'message-encrypted',
      'eve-decrypt-failed',
      'continue',
      'mitm-key-swapped',
      'mitm-message-encrypted',
      'mitm-decrypted-by-eve',
      'mitm-forwarded',
      'bob-decrypted',
      'continue',
      'continue',
    ];
    for (const e of events) s = advanceScene2(s, e);
    expect(isScene2Finished(s)).toBe(true);
    expect(currentScene2Step(s)).toBeNull();
  });

  it('ends with the transition line into the multiplayer game', () => {
    expect(SCENE2_STEPS[SCENE2_STEPS.length - 1].id).toBe('transition');
  });
});
