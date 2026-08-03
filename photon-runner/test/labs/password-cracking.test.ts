import { describe, expect, it } from 'vitest';
import { strengthScore, estimateCrackSeconds, formatDuration } from '../../labs/password-cracking';

describe('strengthScore', () => {
  it('scores a short simple password low', () => {
    expect(strengthScore('abc')).toBe(0);
  });

  it('scores a long mixed-character password at the top tier', () => {
    expect(strengthScore('Tr0ub4dor&3Longer')).toBe(4);
  });
});

describe('estimateCrackSeconds', () => {
  it('returns 0 for empty input', () => {
    expect(estimateCrackSeconds('')).toBe(0);
  });

  it('returns 0 for a common wordlist password regardless of case', () => {
    expect(estimateCrackSeconds('Password')).toBe(0);
  });

  it('returns a larger estimate for longer, more varied passwords', () => {
    expect(estimateCrackSeconds('Zx9!qLmP2#Rt')).toBeGreaterThan(estimateCrackSeconds('zxqlmp'));
  });
});

describe('formatDuration', () => {
  it('reports the wordlist case distinctly', () => {
    expect(formatDuration(0)).toMatch(/instantly/);
  });

  it('formats sub-second durations', () => {
    expect(formatDuration(0.5)).toBe('under a second');
  });

  it('formats large durations in years', () => {
    expect(formatDuration(31557600 * 5)).toMatch(/years/);
  });
});
