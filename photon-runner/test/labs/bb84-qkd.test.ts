import { describe, expect, it } from 'vitest';
import { simulateBB84 } from '../../labs/bb84-qkd';

// Deterministic sequence generator for reproducible tests.
function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe('simulateBB84', () => {
  it('a clean channel (no Eve) has zero QBER', () => {
    const r = simulateBB84({ eve: false, n: 500, rng: seededRng(1) });
    expect(r.qber).toBe(0);
    expect(r.detected).toBe(false);
  });

  it('an intercept-resend attack drives QBER well above the detection threshold', () => {
    const r = simulateBB84({ eve: true, n: 2000, rng: seededRng(7) });
    expect(r.qber).toBeGreaterThan(0.11);
    expect(r.detected).toBe(true);
  });

  it('sifted key length is a subset of n and matches key array lengths', () => {
    const r = simulateBB84({ eve: false, n: 300, rng: seededRng(3) });
    expect(r.siftedLength).toBeLessThanOrEqual(300);
    expect(r.aliceKey.length).toBe(r.siftedLength);
    expect(r.bobKey.length).toBe(r.siftedLength);
  });

  it('with no Eve, Alice and Bob keys match exactly on sifted bits', () => {
    const r = simulateBB84({ eve: false, n: 300, rng: seededRng(9) });
    expect(r.aliceKey).toEqual(r.bobKey);
  });
});
