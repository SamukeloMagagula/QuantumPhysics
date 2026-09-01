import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_RESPONSIBILITIES, entityRegistry } from './EntityRegistry';

describe('entityRegistry', () => {
  beforeEach(() => entityRegistry.reset());

  it('spawns, reads back, and despawns an entity', () => {
    entityRegistry.spawn({ id: 'p1', role: 'alice', isLocalPlayer: true, position: { x: 0, z: 0 }, alive: true });

    expect(entityRegistry.get('p1')).toMatchObject({ role: 'alice', alive: true });

    entityRegistry.despawn('p1');
    expect(entityRegistry.get('p1')).toBeUndefined();
  });

  it('filters by role', () => {
    entityRegistry.spawn({ id: 'a', role: 'alice', isLocalPlayer: true, position: { x: 0, z: 0 }, alive: true });
    entityRegistry.spawn({ id: 'b', role: 'bob', isLocalPlayer: false, position: { x: 1, z: 1 }, alive: true });
    entityRegistry.spawn({ id: 'e', role: 'eve', isLocalPlayer: false, position: { x: 2, z: 2 }, alive: true });

    expect(entityRegistry.byRole('eve').map((e) => e.id)).toEqual(['e']);
    expect(entityRegistry.all()).toHaveLength(3);
  });

  it('update() patches an existing entity and notifies subscribers', () => {
    entityRegistry.spawn({ id: 'p1', role: 'bob', isLocalPlayer: true, position: { x: 0, z: 0 }, alive: true });
    const fn = vi.fn();
    entityRegistry.subscribe(fn);

    entityRegistry.update('p1', { position: { x: 5, z: 5 } });

    expect(entityRegistry.get('p1')?.position).toEqual({ x: 5, z: 5 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('update() on a missing id is a silent no-op', () => {
    expect(() => entityRegistry.update('ghost', { alive: false })).not.toThrow();
  });

  it('every role has exactly the responsibilities the design calls for', () => {
    expect(ROLE_RESPONSIBILITIES.alice.map((r) => r.id)).toEqual([
      'send-photons',
      'choose-basis',
      'generate-states',
    ]);
    expect(ROLE_RESPONSIBILITIES.bob.map((r) => r.id)).toEqual(['receive-photons', 'choose-basis', 'generate-key']);
    expect(ROLE_RESPONSIBILITIES.eve.map((r) => r.id)).toEqual(['intercept', 'measure', 'introduce-errors']);
  });

  it('responsibilitiesFor mirrors ROLE_RESPONSIBILITIES', () => {
    expect(entityRegistry.responsibilitiesFor('alice')).toBe(ROLE_RESPONSIBILITIES.alice);
  });
});
