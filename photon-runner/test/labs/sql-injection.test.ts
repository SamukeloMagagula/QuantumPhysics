import { describe, expect, it } from 'vitest';
import { buildQuery, isBypass } from '../../labs/sql-injection';

describe('buildQuery', () => {
  it('interpolates username and password into the query string', () => {
    expect(buildQuery('bob', 'secret')).toBe(
      "SELECT * FROM users WHERE username = 'bob' AND password = 'secret';"
    );
  });
});

describe('isBypass', () => {
  it('detects the classic tautology + comment bypass', () => {
    expect(isBypass("admin' OR '1'='1' --", 'anything')).toBe(true);
  });

  it('rejects normal credentials', () => {
    expect(isBypass('bob', 'secret')).toBe(false);
  });

  it('rejects an injection attempt confined to the password field alone', () => {
    expect(isBypass('bob', "' OR '1'='1")).toBe(false);
  });
});
