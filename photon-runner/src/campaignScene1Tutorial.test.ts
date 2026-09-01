import { describe, expect, it } from 'vitest';
import {
  SCENE1_STEPS,
  advanceScene1,
  currentScene1Step,
  initialScene1,
  isScene1Finished,
} from './campaignScene1Tutorial';

describe('scene 1 script', () => {
  it('gives every step a unique id and real copy', () => {
    expect(new Set(SCENE1_STEPS.map((s) => s.id)).size).toBe(SCENE1_STEPS.length);
    for (const s of SCENE1_STEPS) expect(s.body.length).toBeGreaterThan(10);
  });

  it('starts on the intro step and is not finished', () => {
    const s = initialScene1();
    expect(currentScene1Step(s)?.id).toBe('intro');
    expect(isScene1Finished(s)).toBe(false);
  });

  it('only advances on the declared trigger', () => {
    let s = initialScene1();
    s = advanceScene1(s, 'message-encrypted'); // wrong event for 'intro' (wants 'continue')
    expect(currentScene1Step(s)?.id).toBe('intro');
    s = advanceScene1(s, 'continue');
    expect(currentScene1Step(s)?.id).toBe('alice-encrypts');
  });

  it('walks the full script to completion in event order', () => {
    let s = initialScene1();
    const events: Array<Parameters<typeof advanceScene1>[1]> = [
      'continue',
      'message-encrypted',
      'message-decrypted',
      'continue',
      'key-intercepted',
      'continue',
    ];
    for (const e of events) s = advanceScene1(s, e);
    expect(isScene1Finished(s)).toBe(true);
    expect(currentScene1Step(s)).toBeNull();
  });

  it('ends on the key-compromise beat before the final continue', () => {
    const eveIndex = SCENE1_STEPS.findIndex((s) => s.id === 'eve-appears');
    const compromisedIndex = SCENE1_STEPS.findIndex((s) => s.id === 'compromised');
    expect(compromisedIndex).toBe(eveIndex + 1);
    expect(compromisedIndex).toBe(SCENE1_STEPS.length - 1);
  });
});
