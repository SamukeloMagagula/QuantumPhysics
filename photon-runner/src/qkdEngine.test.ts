import { describe, expect, it } from 'vitest';
import {
  SABOTAGE_BONUS,
  SABOTAGE_THRESHOLD,
  classifyErrorShape,
  computerStrategy,
  isSabotage,
  resolveRound,
  scoreRound,
} from './qkdEngine';

/** Deterministic rng that replays a fixed sequence of [0,1) values, cycling if exhausted. */
function seq(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('resolveRound', () => {
  it('draws exactly 7 values per photon regardless of whether Eve intercepts', () => {
    let draws = 0;
    const rng = () => {
      draws++;
      return 0.9; // always basis 'x', bit 1, no random-p intercept
    };
    resolveRound({ n: 5, p: 0, s: 0 }, rng);
    expect(draws).toBe(5 * 7);
  });

  it('when Alice and Bob pick the same basis and Eve never intercepts, Bob always reads Alice\'s bit', () => {
    // d0=0 -> aBit=0, d1=0 -> aBasis='+', d2=0.99 -> no intercept (p=0),
    // d3 unused, d4 unused, d5=0 -> bBasis='+' (matches aBasis), d6 unused.
    const rng = seq([0, 0, 0.99, 0, 0, 0, 0]);
    const r = resolveRound({ n: 3, p: 0, s: 3 }, rng);
    expect(r.aBases).toEqual(['+', '+', '+']);
    expect(r.bBases).toEqual(['+', '+', '+']);
    expect(r.sifted).toBe(3);
    expect(r.sampleQBER).toBe(0); // no eavesdropping, no basis mismatch -> Bob always agrees
    expect(r.eveHit).toBe(false);
  });

  it('Eve intercepting in the wrong basis introduces detectable errors even when Bob matches Alice', () => {
    // aBit=0 (d0=0), aBasis='+' (d1=0), intercept (d2=0 < p=1), eBasis='x' (d3=0.9, != aBasis),
    // eve mismatch-bit draw d4=0.9 -> eBit=1 (since eBasis != aBasis, re-measured randomly),
    // bBasis='+' (d5=0, matches aBasis but NOT the channel basis 'x' Eve substituted),
    // bob mismatch-bit d6=0.9 -> bBit=1 (channel basis 'x' != bBasis '+').
    const rng = seq([0, 0, 0, 0.9, 0.9, 0, 0.9]);
    const r = resolveRound({ n: 1, p: 1, s: 1 }, rng);
    expect(r.eveHit).toBe(true);
    expect(r.aBases).toEqual(['+']);
    expect(r.bBases).toEqual(['+']); // sifted (Bob's chosen basis matches Alice's)
    expect(r.sifted).toBe(1);
    expect(r.sampleErrors[0]).toBe(true); // Bob's bit differs from Alice's because Eve disturbed it
  });

  it('honors explicit eveTaps over the random-p interception model', () => {
    const rng = seq([0, 0, 0.99 /* would mean "no intercept" under p */, 0, 0, 0, 0]);
    const r = resolveRound({ n: 1, p: 0, s: 1, eveTaps: [{ i: 0, basis: '+' }] }, rng);
    expect(r.eveHit).toBe(true); // tap forced interception even though p=0 and d2 said "no"
  });

  it('clamps n to at least 1 and s to at most the sifted count', () => {
    const r = resolveRound({ n: 0, p: 0, s: 999 }, seq([0.9, 0.9, 0.99, 0, 0, 0.9, 0]));
    expect(r.n).toBe(1);
    expect(r.sampleSize).toBeLessThanOrEqual(r.sifted);
  });
});

describe('classifyErrorShape', () => {
  it('returns "none" when there are no sampled errors', () => {
    expect(classifyErrorShape(30, [1, 5, 9], [false, false, false])).toBe('none');
  });

  it('returns "clustered" for a single error', () => {
    expect(classifyErrorShape(30, [5], [true])).toBe('clustered');
  });

  it('returns "clustered" when errors bunch within n/3', () => {
    expect(classifyErrorShape(30, [1, 2, 3], [true, true, true])).toBe('clustered'); // span=2 <= 10
  });

  it('returns "scattered" when errors spread beyond n/3', () => {
    expect(classifyErrorShape(30, [1, 29], [true, true])).toBe('scattered'); // span=28 > 10
  });
});

describe('scoreRound', () => {
  const base = {
    n: 10,
    p: 0,
    sifted: 5,
    sampleSize: 2,
    sampleQBER: 0,
    finalKey: 3,
    stolen: 4,
    eveHit: false,
    aBases: [],
    bBases: [],
    intercepted: [],
    sampleIndices: [],
    sampleErrors: [],
  };

  it('KEEP with no eavesdropping awards the defenders the final key length', () => {
    const r = scoreRound('alice', base, 'keep');
    expect(r).toEqual({ delta: 3, youWon: true });
    expect(scoreRound('bob', base, 'keep').delta).toBe(3);
    expect(scoreRound('eve', base, 'keep').delta).toBe(0);
  });

  it('KEEP with eavesdropping awards Eve the stolen count and nothing to the defenders', () => {
    const r = { ...base, eveHit: true };
    expect(scoreRound('eve', r, 'keep').delta).toBe(4);
    expect(scoreRound('alice', r, 'keep').delta).toBe(0);
  });

  it('KEEP with a cracked file adds the heist bonus on top for Eve only', () => {
    const r = { ...base, eveHit: true, fileCracked: true };
    expect(scoreRound('eve', r, 'keep').delta).toBe(4 + 20);
  });

  it('ABORT with eavesdropping detected awards the defenders the detection bonus, nothing to Eve', () => {
    const r = { ...base, eveHit: true };
    expect(scoreRound('alice', r, 'abort').delta).toBe(25);
    expect(scoreRound('eve', r, 'abort').delta).toBe(0);
  });

  it('ABORT with no eavesdropping awards nobody (a wasted abort)', () => {
    expect(scoreRound('alice', base, 'abort').delta).toBe(0);
    expect(scoreRound('eve', base, 'abort').delta).toBe(0);
  });

  it('ABORT with a deliberately high QBER also pays Eve the sabotage bonus, on top of the defenders\' detection bonus', () => {
    const r = { ...base, eveHit: true, sampleQBER: SABOTAGE_THRESHOLD };
    expect(scoreRound('eve', r, 'abort').delta).toBe(SABOTAGE_BONUS);
    expect(scoreRound('alice', r, 'abort').delta).toBe(25); // defenders still get DETECT too
  });

  it('ABORT with eavesdropping but low QBER (an incidental, not deliberate, abort) pays Eve nothing', () => {
    const r = { ...base, eveHit: true, sampleQBER: SABOTAGE_THRESHOLD - 0.01 };
    expect(scoreRound('eve', r, 'abort').delta).toBe(0);
  });
});

describe('isSabotage', () => {
  const base = {
    n: 10,
    p: 0,
    sifted: 5,
    sampleSize: 2,
    sampleQBER: 0,
    finalKey: 3,
    stolen: 4,
    eveHit: false,
    aBases: [],
    bBases: [],
    intercepted: [],
    sampleIndices: [],
    sampleErrors: [],
  };

  it('is false on KEEP no matter the QBER', () => {
    expect(isSabotage({ ...base, eveHit: true, sampleQBER: 1 }, 'keep')).toBe(false);
  });

  it('is false on ABORT when Eve never touched the channel', () => {
    expect(isSabotage({ ...base, eveHit: false, sampleQBER: 1 }, 'abort')).toBe(false);
  });

  it('is false on ABORT when Eve intercepted but the QBER stayed below threshold', () => {
    expect(isSabotage({ ...base, eveHit: true, sampleQBER: SABOTAGE_THRESHOLD - 0.01 }, 'abort')).toBe(false);
  });

  it('is true on ABORT when Eve intercepted and the QBER met the threshold', () => {
    expect(isSabotage({ ...base, eveHit: true, sampleQBER: SABOTAGE_THRESHOLD }, 'abort')).toBe(true);
  });
});

describe('computerStrategy', () => {
  it("alice picks n in [16,32] and s = max(2, floor(n/6))", () => {
    for (const r of [0, 0.5, 0.999]) {
      const move = computerStrategy('alice', undefined, () => r);
      expect(move.n).toBeGreaterThanOrEqual(16);
      expect(move.n).toBeLessThanOrEqual(32);
      expect(move.s).toBe(Math.max(2, Math.floor(move.n / 6)));
    }
  });

  it('eve picks p from a fixed discrete ladder based on the rng draw', () => {
    expect(computerStrategy('eve', undefined, () => 0).p).toBe(0);
    expect(computerStrategy('eve', undefined, () => 0.4).p).toBe(0.25);
    expect(computerStrategy('eve', undefined, () => 0.7).p).toBe(0.5);
    expect(computerStrategy('eve', undefined, () => 0.9).p).toBe(1);
  });

  it('bob aborts above the QBER threshold and keeps at or below it', () => {
    expect(computerStrategy('bob', { sampleQBER: 0.12 }).decision).toBe('abort');
    expect(computerStrategy('bob', { sampleQBER: 0.11 }).decision).toBe('keep');
    expect(computerStrategy('bob', {}).decision).toBe('keep'); // no evidence -> defaults to 0
  });
});
