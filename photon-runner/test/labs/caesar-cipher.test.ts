import { describe, expect, it } from 'vitest';
import { caesarShift, caesarDecrypt } from '../../labs/caesar-cipher';

describe('caesarShift/caesarDecrypt', () => {
  it('shifts letters and wraps around the alphabet, preserving case', () => {
    expect(caesarShift('abcXYZ', 3)).toBe('defABC');
  });

  it('leaves non-letters untouched', () => {
    expect(caesarShift('Hello, World! 123', 1)).toBe('Ifmmp, Xpsme! 123');
  });

  it('decrypt reverses shift', () => {
    const msg = 'The quick brown fox';
    expect(caesarDecrypt(caesarShift(msg, 11), 11)).toBe(msg);
  });

  it('handles negative and >26 keys via modulo', () => {
    expect(caesarShift('a', 29)).toBe(caesarShift('a', 3));
    expect(caesarShift('a', -1)).toBe('z');
  });
});
