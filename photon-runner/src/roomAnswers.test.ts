import { describe, expect, it } from 'vitest';
import { checkAnswer, hashAnswer, normalizeAnswer } from './roomAnswers';

describe('normalizeAnswer', () => {
  it('trims and lowercases by default', () => {
    expect(normalizeAnswer('  Hello World  ')).toBe('hello world');
  });

  it('respects caseInsensitive: false', () => {
    expect(normalizeAnswer('Hello', { caseInsensitive: false })).toBe('Hello');
  });

  it('respects trim: false', () => {
    expect(normalizeAnswer('  hi  ', { trim: false })).toBe('  hi  ');
  });

  it('normalizes numeric answers without a trailing .0', () => {
    expect(normalizeAnswer('25', { numeric: true })).toBe('25');
    expect(normalizeAnswer('25.0', { numeric: true })).toBe('25');
    expect(normalizeAnswer('25.5', { numeric: true })).toBe('25.5');
  });

  it('falls back to the trimmed string for non-numeric input when numeric', () => {
    expect(normalizeAnswer('not-a-number', { numeric: true })).toBe('not-a-number');
  });
});

describe('hashAnswer', () => {
  it('matches the known SHA-256 digests baked into content/rooms/the-shift', () => {
    expect(hashAnswer('hello world')).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    expect(hashAnswer('25', { numeric: true })).toBe('b7a56873cd771f2c446d369b649430b65a756ba278ff97ec81bb6f55b2e73569');
  });
});

describe('checkAnswer', () => {
  const stored = hashAnswer('QUANTUM');

  it('accepts a case-insensitive, trimmed match for exact answers', () => {
    expect(
      checkAnswer({ submitted: '  quantum  ', stored, answerType: 'exact', caseInsensitive: true, trim: true })
    ).toBe(true);
  });

  it('rejects a wrong answer', () => {
    expect(
      checkAnswer({ submitted: 'wrong', stored, answerType: 'exact', caseInsensitive: true, trim: true })
    ).toBe(false);
  });

  it('rejects a case mismatch when caseInsensitive is false', () => {
    const caseSensitiveStored = hashAnswer('Quantum', { caseInsensitive: false });
    expect(
      checkAnswer({
        submitted: 'quantum',
        stored: caseSensitiveStored,
        answerType: 'exact',
        caseInsensitive: false,
        trim: true,
      })
    ).toBe(false);
    expect(
      checkAnswer({
        submitted: 'Quantum',
        stored: caseSensitiveStored,
        answerType: 'exact',
        caseInsensitive: false,
        trim: true,
      })
    ).toBe(true);
  });

  it('normalizes number answers before hashing', () => {
    const numStored = hashAnswer('25', { numeric: true });
    expect(
      checkAnswer({ submitted: '25.0', stored: numStored, answerType: 'number', caseInsensitive: true, trim: true })
    ).toBe(true);
  });

  it('matches a regex pattern case-insensitively without hashing', () => {
    expect(
      checkAnswer({
        submitted: 'FLAG{abc123}',
        stored: 'flag\\{[a-z0-9]+\\}',
        answerType: 'regex',
        caseInsensitive: true,
        trim: true,
      })
    ).toBe(true);
  });

  it('rejects a regex mismatch', () => {
    expect(
      checkAnswer({
        submitted: 'nope',
        stored: 'flag\\{[a-z0-9]+\\}',
        answerType: 'regex',
        caseInsensitive: true,
        trim: true,
      })
    ).toBe(false);
  });

  it('does not let a broken regex pattern crash or match', () => {
    expect(
      checkAnswer({
        submitted: 'anything',
        stored: '[unclosed',
        answerType: 'regex',
        caseInsensitive: true,
        trim: true,
      })
    ).toBe(false);
  });
});
