import { describe, expect, it } from 'vitest';
import {
  Armed,
  Target,
  alarmRate,
  arm,
  createSession,
  currentQBER,
  errorRate,
  extract,
  getTarget,
  keyFraction,
  knowledgeRate,
  multiPhotonFraction,
  stepExchange,
  TARGETS,
  trojanActive,
} from './qkdAttack';

/** Deterministic RNG so a whole session replays identically. */
function seeded(seed: number) {
  let h = seed >>> 0;
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const soft = getTarget('testbed')!;
const hard = getTarget('blacksite')!;
const at = (mode: Armed['mode'], fraction: number): Armed[] => [{ mode, fraction }];

describe('multiPhotonFraction', () => {
  it('is zero for an ideal single-photon source and grows with mu', () => {
    expect(multiPhotonFraction(0)).toBeCloseTo(0, 10);
    expect(multiPhotonFraction(0.3)).toBeLessThan(multiPhotonFraction(0.6));
  });

  it('matches the Poisson tail 1 - P(0) - P(1)', () => {
    const mu = 0.5;
    const expected = 1 - Math.exp(-mu) - mu * Math.exp(-mu);
    expect(multiPhotonFraction(mu)).toBeCloseTo(expected, 12);
  });
});

describe('errorRate', () => {
  it('charges intercept-resend the textbook 25% at full rate', () => {
    expect(errorRate(at('intercept', 1), soft)).toBeCloseTo(0.25, 10);
    expect(errorRate(at('intercept', 0.4), soft)).toBeCloseTo(0.1, 10);
  });

  it('costs nothing for the attacks that never touch Bob\'s bit', () => {
    for (const mode of ['beamsplit', 'blind', 'trojan'] as const) {
      expect(errorRate(at(mode, 1), soft)).toBe(0);
    }
  });
});

describe('knowledgeRate', () => {
  it('only learns half of intercepted bits without knowing the basis', () => {
    expect(knowledgeRate(at('intercept', 1), soft)).toBeCloseTo(0.5, 10);
  });

  it('gives blinding the whole key — it controls the detectors', () => {
    expect(knowledgeRate(at('blind', 1), soft)).toBeCloseTo(1, 10);
  });

  it('limits photon-splitting to the multi-photon pulses that exist', () => {
    expect(knowledgeRate(at('beamsplit', 1), soft)).toBeCloseTo(multiPhotonFraction(soft.mu), 10);
  });
});

describe('the trojan/intercept synergy', () => {
  it('is available only when there is no optical isolator', () => {
    expect(trojanActive(at('trojan', 1), soft)).toBe(true);
    expect(trojanActive(at('trojan', 1), hard)).toBe(false);
  });

  it('makes intercept-resend both silent and twice as informative', () => {
    const alone: Armed[] = [{ mode: 'intercept', fraction: 1 }];
    const paired: Armed[] = [
      { mode: 'intercept', fraction: 1 },
      { mode: 'trojan', fraction: 1 },
    ];
    // Knowing the basis removes the guess, and with it the errors.
    expect(errorRate(alone, soft)).toBeCloseTo(0.25, 10);
    expect(errorRate(paired, soft)).toBeCloseTo(0, 10);
    expect(knowledgeRate(alone, soft)).toBeCloseTo(0.5, 10);
    expect(knowledgeRate(paired, soft)).toBeCloseTo(1, 10);
  });

  it('does not apply on a target with an isolator', () => {
    const paired: Armed[] = [
      { mode: 'intercept', fraction: 1 },
      { mode: 'trojan', fraction: 1 },
    ];
    expect(errorRate(paired, hard)).toBeCloseTo(0.25, 10);
  });
});

describe('alarmRate', () => {
  it('is silent when the matching countermeasure is absent', () => {
    expect(alarmRate(at('beamsplit', 1), soft)).toBe(0);
    expect(alarmRate(at('blind', 1), soft)).toBe(0);
    expect(alarmRate(at('trojan', 1), soft)).toBe(0);
  });

  it('trips only the countermeasure that matches the attack', () => {
    const decoyOnly: Target = { ...soft, decoyStates: true };
    expect(alarmRate(at('beamsplit', 1), decoyOnly)).toBeGreaterThan(0);
    expect(alarmRate(at('blind', 1), decoyOnly)).toBe(0);
  });

  it('never charges an alarm for the loud attacks — they cost QBER instead', () => {
    expect(alarmRate(at('intercept', 1), hard)).toBe(0);
    expect(alarmRate(at('timeshift', 1), hard)).toBe(0);
  });
});

describe('stepExchange', () => {
  it('sifts roughly half the pulses', () => {
    const { state } = stepExchange(createSession(soft), 2000, seeded(7));
    expect(state.sifted).toBeGreaterThan(850);
    expect(state.sifted).toBeLessThan(1150);
  });

  it('running clean never raises QBER or alarm', () => {
    const { state } = stepExchange(createSession(soft), 2000, seeded(3));
    expect(state.errors).toBe(0);
    expect(state.alarm).toBe(0);
    expect(state.status).toBe('active');
  });

  it('catches a full intercept at the first sample', () => {
    const s = arm(createSession(soft), 'intercept', 1);
    const { state, events } = stepExchange(s, 2000, seeded(11));
    expect(state.status).toBe('caught');
    expect(events.some((e) => e.kind === 'caught')).toBe(true);
    expect(state.ending).toMatch(/abort threshold/i);
  });

  it('lets a rationed intercept stay under the threshold', () => {
    // 20% intercept => ~5% QBER, comfortably under the 11% abort.
    const s = arm(createSession(soft), 'intercept', 0.2);
    const { state } = stepExchange(s, 3000, seeded(5));
    expect(state.status).toBe('active');
    expect(currentQBER(state)).toBeLessThan(soft.abortQBER);
    expect(state.stolen).toBeGreaterThan(0);
  });

  it('takes the whole key silently when trojan and intercept are paired', () => {
    let s = createSession(soft);
    s = arm(s, 'trojan', 1);
    s = arm(s, 'intercept', 1);
    const { state } = stepExchange(s, soft.totalRounds, seeded(17));
    expect(state.status).toBe('exhausted');
    expect(currentQBER(state)).toBe(0);
    expect(keyFraction(state)).toBeCloseTo(1, 5);
  });

  it('catches photon-splitting on a decoy-state target via the alarm, not QBER', () => {
    const s = arm(createSession(hard), 'beamsplit', 1);
    const { state } = stepExchange(s, hard.totalRounds, seeded(23));
    expect(state.status).toBe('caught');
    expect(currentQBER(state)).toBe(0); // it never caused a single error
    expect(state.ending).toMatch(/countermeasure/i);
  });

  it('stops at the end of the exchange rather than running past it', () => {
    const { state } = stepExchange(createSession(soft), soft.totalRounds * 3, seeded(2));
    expect(state.round).toBe(soft.totalRounds);
    expect(state.status).toBe('exhausted');
  });

  it('is a no-op once the session has ended', () => {
    const done = extract(createSession(soft));
    const { state, events } = stepExchange(done, 500, seeded(1));
    expect(state).toBe(done);
    expect(events).toEqual([]);
  });
});

describe('arm/disarm', () => {
  it('replaces rather than stacks a mode, and clamps the fraction', () => {
    let s = arm(createSession(soft), 'intercept', 0.3);
    s = arm(s, 'intercept', 5);
    expect(s.armed).toHaveLength(1);
    expect(s.armed[0].fraction).toBe(1);
  });

  it('treats arming at zero as disarming', () => {
    let s = arm(createSession(soft), 'blind', 0.5);
    s = arm(s, 'blind', 0);
    expect(s.armed).toHaveLength(0);
  });
});

describe('targets', () => {
  it('escalate — later targets are strictly harder to attack quietly', () => {
    const counts = TARGETS.map(
      (t) => Number(t.decoyStates) + Number(t.detectorMonitoring) + Number(t.opticalIsolator)
    );
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });

  it('always leaves at least one viable route in', () => {
    // A target with every countermeasure and a zero abort budget would be
    // unwinnable; intercept always works if you can afford the QBER, so each
    // target must allow *some* intercept fraction under its abort threshold.
    for (const t of TARGETS) {
      const affordable = t.abortQBER / 0.25;
      expect(affordable).toBeGreaterThan(0.2);
    }
  });
});
