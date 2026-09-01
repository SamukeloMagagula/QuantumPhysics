import { describe, expect, it } from 'vitest';
import { arm, createSession, getTarget, stepExchange } from './qkdAttack';
import { buildReport, judge, suspicionScore, STATION_LABELS } from './qkdForensics';

function seeded(seed: number) {
  let h = seed >>> 0;
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const testbed = getTarget('testbed')!;

/** Runs a session with the given attack armed and returns its report. */
function reportFor(mode: Parameters<typeof arm>[1] | null, fraction = 1, seed = 9) {
  const rng = seeded(seed);
  let s = createSession(testbed);
  if (mode) s = arm(s, mode, fraction);
  const { state } = stepExchange(s, 1500, rng);
  return buildReport(state, rng);
}

describe('buildReport', () => {
  it('reports all three stations', () => {
    const r = reportFor(null);
    expect(r.evidence.map((e) => e.station).sort()).toEqual(['alice', 'bob', 'eve']);
  });

  it('keeps the honest stations near the noise floor with a ~100% basis match', () => {
    const r = reportFor('intercept', 0.3);
    for (const s of ['alice', 'bob'] as const) {
      const e = r.evidence.find((x) => x.station === s)!;
      expect(e.qber).toBeLessThan(0.02);
      expect(e.basisMatch).toBeGreaterThan(0.98);
      expect(e.errorShape).toBe('scattered');
    }
  });

  it('gives intercept-resend the textbook 75% basis match', () => {
    // Eve guesses the basis right half the time, so a resent key agrees on
    // ~75% of sifted bits instead of ~100%. That gap is the fingerprint.
    const r = reportFor('intercept', 0.4);
    const eve = r.evidence.find((e) => e.station === 'eve')!;
    expect(eve.basisMatch).toBeGreaterThan(0.72);
    expect(eve.basisMatch).toBeLessThan(0.78);
  });

  it('marks a loud attack as clustered and not quiet', () => {
    const r = reportFor('intercept', 0.4);
    const eve = r.evidence.find((e) => e.station === 'eve')!;
    expect(eve.errorShape).toBe('clustered');
    expect(r.quiet).toBe(false);
  });

  it('leaves no QBER signature for photon splitting — the whole point', () => {
    const r = reportFor('beamsplit', 1);
    const eve = r.evidence.find((e) => e.station === 'eve')!;
    expect(eve.qber).toBe(0);
    expect(r.quiet).toBe(true);
  });

  it('hides the trojan-assisted intercept behind an honest-looking basis match', () => {
    const rng = seeded(4);
    let s = createSession(testbed);
    s = arm(s, 'trojan', 1);
    s = arm(s, 'intercept', 1);
    const { state } = stepExchange(s, 1500, rng);
    const r = buildReport(state, rng);
    const eve = r.evidence.find((e) => e.station === 'eve')!;
    // Knowing the basis in advance means never guessing wrong, so both the
    // error rate and the basis match look completely clean.
    expect(eve.qber).toBe(0);
    expect(eve.basisMatch).toBeGreaterThan(0.99);
    expect(r.quiet).toBe(true);
  });
});

describe('judge', () => {
  it('accepts the correct accusation and explains the tell', () => {
    const v = judge(reportFor('intercept', 0.4), 'eve');
    expect(v.correct).toBe(true);
    expect(v.explanation).toMatch(/basis match/i);
  });

  it('rejects accusing an honest station and says why it was honest', () => {
    const v = judge(reportFor('intercept', 0.4), 'alice');
    expect(v.correct).toBe(false);
    expect(v.explanation).toContain(STATION_LABELS.alice);
    expect(v.explanation).toMatch(/noise floor/i);
  });

  it('explains that a quiet attack could not have been caught on QBER', () => {
    const v = judge(reportFor('beamsplit', 1), 'alice');
    expect(v.correct).toBe(false);
    expect(v.explanation).toMatch(/decoy|detector current/i);
  });

  it('still credits a correct call on a quiet attack, with the caveat', () => {
    const v = judge(reportFor('beamsplit', 1), 'eve');
    expect(v.correct).toBe(true);
    expect(v.explanation).toMatch(/not a\s+sufficient defence|decoy/i);
  });
});

describe('suspicionScore', () => {
  it('ranks the loud tap above the honest stations', () => {
    const r = reportFor('intercept', 0.4);
    const ranked = [...r.evidence].sort((a, b) => suspicionScore(b) - suspicionScore(a));
    expect(ranked[0].station).toBe('eve');
  });

  it('cannot separate a silent tap from an honest station on evidence alone', () => {
    // The honest reading of this data really is "nothing to see" — the score
    // must not pretend otherwise, or the quiet-attack lesson is lost.
    const r = reportFor('beamsplit', 1);
    const eve = r.evidence.find((e) => e.station === 'eve')!;
    const alice = r.evidence.find((e) => e.station === 'alice')!;
    expect(Math.abs(suspicionScore(eve) - suspicionScore(alice))).toBeLessThan(0.1);
  });
});
