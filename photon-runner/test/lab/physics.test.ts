import { describe, expect, it } from 'vitest';
import { randomBit, randomBasis, measure } from '../../games/lab/physics';

describe('randomBit/randomBasis', () => {
  it('returns 0/plus for low rng, 1/cross for high rng', () => {
    expect(randomBit(() => 0.1)).toBe(0);
    expect(randomBit(() => 0.9)).toBe(1);
    expect(randomBasis(() => 0.1)).toBe('plus');
    expect(randomBasis(() => 0.9)).toBe('cross');
  });
});

describe('measure', () => {
  it('matching basis deterministically returns the true bit', () => {
    expect(measure(0, 'plus', 'plus', () => 0.9)).toBe(0);
    expect(measure(1, 'cross', 'cross', () => 0.1)).toBe(1);
  });

  it('mismatched basis collapses to a random bit via rng', () => {
    expect(measure(0, 'plus', 'cross', () => 0.1)).toBe(0);
    expect(measure(0, 'plus', 'cross', () => 0.9)).toBe(1);
  });
});
