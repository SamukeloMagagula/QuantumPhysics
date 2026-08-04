import { describe, expect, it } from 'vitest';
import { buildQuery, runQuery, FAKE_USERS } from './sql-injection';

describe('buildQuery', () => {
  it('interpolates username and password into the query string', () => {
    expect(buildQuery('bob', 'secret')).toBe(
      "SELECT * FROM users WHERE username = 'bob' AND password = 'secret';"
    );
  });
});

describe('runQuery', () => {
  it('matches exactly one row for correct credentials', () => {
    const bob = FAKE_USERS.find((u) => u.username === 'bob')!;
    const result = runQuery('bob', bob.password);
    expect(result.error).toBeNull();
    const matched = result.rows.filter((r) => r.matched);
    expect(matched).toHaveLength(1);
    expect(matched[0].user.username).toBe('bob');
  });

  it('matches nothing for a wrong password', () => {
    const result = runQuery('bob', 'wrong-password');
    expect(result.error).toBeNull();
    expect(result.rows.every((r) => !r.matched)).toBe(true);
  });

  it('matches nothing for a username that does not exist', () => {
    const result = runQuery('mallory', 'anything');
    expect(result.rows.every((r) => !r.matched)).toBe(true);
  });

  it('the classic username-field tautology + comment bypass matches every row', () => {
    const result = runQuery("admin' OR '1'='1' --", 'anything');
    expect(result.error).toBeNull();
    expect(result.rows.every((r) => r.matched)).toBe(true);
  });

  it('a tautology confined to the password field alone also matches every row (AND binds tighter than OR)', () => {
    // WHERE username='bob' AND password='' OR '1'='1'
    //   -> (username='bob' AND password='') OR ('1'='1') -> always true.
    // This is real SQL operator precedence, not a heuristic — a naive
    // "only the username field can bypass" check would wrongly call this safe.
    const result = runQuery('bob', "' OR '1'='1");
    expect(result.error).toBeNull();
    expect(result.rows.every((r) => r.matched)).toBe(true);
  });

  it('an unterminated string literal is a genuine syntax error, not a silent non-match', () => {
    const result = runQuery("o'brien", 'x');
    expect(result.error).not.toBeNull();
    expect(result.rows).toHaveLength(0);
  });

  it('an escaped quote inside a literal is treated as literal text, not a break-out', () => {
    // '' inside a string is the standard SQL-escaped single quote.
    const result = runQuery("o''brien", 'x');
    expect(result.error).toBeNull();
    expect(result.rows.every((r) => !r.matched)).toBe(true);
  });

  it('parenthesized tautologies still evaluate correctly', () => {
    const result = runQuery("x' OR (1=1 AND '1'='1' ) --", 'x');
    expect(result.error).toBeNull();
    expect(result.rows.every((r) => r.matched)).toBe(true);
  });
});
