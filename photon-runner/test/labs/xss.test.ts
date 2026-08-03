import { describe, expect, it } from 'vitest';
import { isXssPayload } from '../../labs/xss';

describe('isXssPayload', () => {
  it('flags a script tag', () => {
    expect(isXssPayload("<script>alert('xss')</script>")).toBe(true);
  });

  it('flags an inline event handler', () => {
    expect(isXssPayload('<img src=x onerror=alert(1)>')).toBe(true);
  });

  it('flags a javascript: URI', () => {
    expect(isXssPayload('javascript:alert(1)')).toBe(true);
  });

  it('does not flag plain text', () => {
    expect(isXssPayload('Great post, thanks!')).toBe(false);
  });
});
