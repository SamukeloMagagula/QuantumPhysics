import { beforeEach, describe, expect, it } from 'vitest';
import { accessRegistry } from './Access';

describe('accessRegistry', () => {
  beforeEach(() => accessRegistry.reset());

  it('an unrestricted zone is always enterable, by anyone, with no grant', () => {
    expect(accessRegistry.canEnter('alice', 'reception')).toBe(true);
    expect(accessRegistry.canEnter('anyone-at-all', 'reception')).toBe(true);
  });

  it('null (not inside any tracked zone, e.g. a corridor) is always open', () => {
    accessRegistry.restrict('secure-core');
    expect(accessRegistry.canEnter('alice', null)).toBe(true);
  });

  it('a restricted zone blocks everyone until granted', () => {
    accessRegistry.restrict('secure-core');
    expect(accessRegistry.canEnter('alice', 'secure-core')).toBe(false);

    accessRegistry.grant('alice', 'secure-core');
    expect(accessRegistry.canEnter('alice', 'secure-core')).toBe(true);
  });

  it('a grant is per-actor — badging in does not open the door for anyone else', () => {
    accessRegistry.restrict('secure-core');
    accessRegistry.grant('alice', 'secure-core');

    expect(accessRegistry.canEnter('alice', 'secure-core')).toBe(true);
    expect(accessRegistry.canEnter('bob', 'secure-core')).toBe(false);
  });

  it('revoke removes a previously-granted zone', () => {
    accessRegistry.restrict('secure-core');
    accessRegistry.grant('alice', 'secure-core');
    accessRegistry.revoke('alice', 'secure-core');

    expect(accessRegistry.canEnter('alice', 'secure-core')).toBe(false);
  });

  it('isRestricted reflects restrict() calls', () => {
    expect(accessRegistry.isRestricted('secure-core')).toBe(false);
    accessRegistry.restrict('secure-core');
    expect(accessRegistry.isRestricted('secure-core')).toBe(true);
  });

  it('reset() clears both restrictions and grants', () => {
    accessRegistry.restrict('secure-core');
    accessRegistry.grant('alice', 'secure-core');

    accessRegistry.reset();

    expect(accessRegistry.isRestricted('secure-core')).toBe(false);
    expect(accessRegistry.canEnter('alice', 'secure-core')).toBe(true);
  });
});
