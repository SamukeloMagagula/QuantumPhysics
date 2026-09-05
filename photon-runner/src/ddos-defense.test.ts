import { describe, expect, it } from 'vitest';
import ddos, {
  Defenses,
  HOLD_PERCENT,
  LINK_CAPACITY,
  RateLimit,
  WAVES,
  rateLimitEffect,
  rateLimitFalsePositives,
  simulate,
} from './ddos-defense';

const base: Defenses = { rateLimit: 'off', cache: false, scrubbing: false, capacity: 1 };
const d = (over: Partial<Defenses> = {}): Defenses => ({ ...base, ...over });

/** Every combination of defences the interface can express. */
function allSetups(): Defenses[] {
  const out: Defenses[] = [];
  for (const rateLimit of ['off', 'moderate', 'strict'] as RateLimit[]) {
    for (const cache of [false, true]) {
      for (const scrubbing of [false, true]) {
        for (const capacity of [1, 2, 4]) {
          out.push({ rateLimit, cache, scrubbing, capacity });
        }
      }
    }
  }
  return out;
}

describe('rate limiting', () => {
  it('does nothing when it is off', () => {
    expect(rateLimitEffect('off', 1)).toBe(0);
  });

  it('catches a concentrated attack far better than a spread one', () => {
    // This is the lesson of wave 2: the same volume from more machines is a
    // harder problem, because each source looks more like a person.
    expect(rateLimitEffect('strict', 1)).toBeGreaterThan(rateLimitEffect('strict', 60_000));
  });

  it('never claims to remove everything', () => {
    for (const sources of [1, 100, 60_000]) {
      expect(rateLimitEffect('strict', sources)).toBeLessThan(1);
      expect(rateLimitEffect('strict', sources)).toBeGreaterThan(0);
    }
  });

  it('charges strict limiting a real cost in genuine visitors', () => {
    expect(rateLimitFalsePositives('strict')).toBeGreaterThan(0);
    expect(rateLimitFalsePositives('moderate')).toBe(0);
    expect(rateLimitFalsePositives('off')).toBe(0);
  });
});

describe('the simulation', () => {
  it('serves everyone when nothing is attacking', () => {
    const quiet = { ...WAVES[0], attack: 0, sources: 0 };
    expect(simulate(quiet, d()).successPercent).toBeCloseTo(100, 5);
  });

  it('turns visitors away when the site is undefended', () => {
    for (const w of WAVES) {
      expect(simulate(w, d()).held, `${w.id} should not be survivable with no defences`).toBe(false);
    }
  });

  it('never reports more than every visitor served', () => {
    for (const w of WAVES) {
      for (const setup of allSetups()) {
        const out = simulate(w, setup);
        expect(out.successPercent).toBeLessThanOrEqual(100);
        expect(out.successPercent).toBeGreaterThanOrEqual(0);
        expect(out.legitServed).toBeLessThanOrEqual(out.legitTotal + 1e-9);
      }
    }
  });

  it('saturates the link exactly when more arrives than it can carry', () => {
    const huge = { ...WAVES[2], attack: LINK_CAPACITY * 5 };
    expect(simulate(huge, d()).linkSaturated).toBe(true);
    expect(simulate(huge, d({ scrubbing: true })).linkSaturated).toBe(false);
  });

  it('drops real visitors alongside the attack when the link is full', () => {
    // The link cannot tell them apart — that is why it has to be handled
    // before the traffic arrives.
    const out = simulate(WAVES[2], d({ rateLimit: 'strict', cache: true, capacity: 4 }));
    expect(out.linkSaturated).toBe(true);
    expect(out.successPercent).toBeLessThan(HOLD_PERCENT);
  });
});

describe('each wave teaches its own lesson', () => {
  it('wave 1 falls to a strict per-source limit alone', () => {
    expect(simulate(WAVES[0], d({ rateLimit: 'strict' })).held).toBe(true);
  });

  it('wave 1 is too loud for a moderate limit on its own', () => {
    expect(simulate(WAVES[0], d({ rateLimit: 'moderate' })).held).toBe(false);
  });

  it('wave 1 is not solved by simply buying more servers', () => {
    expect(simulate(WAVES[0], d({ capacity: 4 })).held).toBe(false);
  });

  it('wave 2 needs headroom as well as filtering', () => {
    expect(simulate(WAVES[1], d({ rateLimit: 'strict' })).held).toBe(false);
    expect(simulate(WAVES[1], d({ rateLimit: 'strict', cache: true })).held).toBe(false);
    expect(simulate(WAVES[1], d({ rateLimit: 'strict', cache: true, capacity: 4 })).held).toBe(true);
  });

  it('wave 3 cannot be held by anything downstream of the link', () => {
    for (const setup of allSetups()) {
      if (setup.scrubbing) continue;
      expect(simulate(WAVES[2], setup).held, 'wave 3 was survivable without upstream filtering').toBe(false);
    }
  });

  it('wave 3 is held once the traffic is filtered upstream', () => {
    expect(simulate(WAVES[2], d({ scrubbing: true, rateLimit: 'moderate', cache: true, capacity: 2 })).held).toBe(true);
  });
});

describe('the lab is completable', () => {
  it('has at least one setup that holds every wave', () => {
    for (const w of WAVES) {
      const wins = allSetups().filter((s) => simulate(w, s).held);
      expect(wins.length, `${w.id} is unwinnable`).toBeGreaterThan(0);
    }
  });

  it('can be cleared with a single sensible configuration', () => {
    // A learner who reasons it through should not have to re-tune per wave.
    const sensible = d({ rateLimit: 'moderate', cache: true, scrubbing: true, capacity: 2 });
    for (const w of WAVES) expect(simulate(w, sensible).held, w.id).toBe(true);
  });

  it('does not let one setup trivially hold everything from the start', () => {
    // If the opening defaults already win, there is no lab.
    expect(WAVES.every((w) => simulate(w, base).held)).toBe(false);
  });

  it('explains every wave', () => {
    for (const w of WAVES) {
      expect(w.lesson.length, w.id).toBeGreaterThan(60);
      expect(w.brief.length, w.id).toBeGreaterThan(40);
    }
  });
});

describe('lab metadata', () => {
  it('is registered under the availability section', () => {
    expect(ddos.id).toBe('ddos-defense');
    expect(ddos.category).toBe('Network & Availability');
    expect(ddos.intro().length).toBeGreaterThan(80);
    expect(ddos.explain().length).toBeGreaterThan(200);
  });
});
