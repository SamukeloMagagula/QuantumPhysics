import { beforeEach, describe, expect, it, vi } from 'vitest';
import { interactionRegistry } from './Interaction';

describe('interactionRegistry', () => {
  beforeEach(() => interactionRegistry.reset());

  const station = (overrides: Partial<Parameters<typeof interactionRegistry.register>[0]> = {}) => ({
    id: 'photon-station',
    name: 'Photon Source',
    description: 'Demonstrates photon generation.',
    prompt: 'Examine',
    position: { x: 0, z: 0 },
    range: 2,
    onInteract: vi.fn(),
    ...overrides,
  });

  it('interact() fires onInteract when the actor is in range', () => {
    const s = station();
    interactionRegistry.register(s);

    const fired = interactionRegistry.interact('photon-station', { x: 1, z: 0 }, { actorId: 'alice' });

    expect(fired).toBe(true);
    expect(s.onInteract).toHaveBeenCalledWith({ actorId: 'alice' });
  });

  it('interact() does nothing when out of range', () => {
    const s = station({ range: 1 });
    interactionRegistry.register(s);

    const fired = interactionRegistry.interact('photon-station', { x: 10, z: 10 }, { actorId: 'alice' });

    expect(fired).toBe(false);
    expect(s.onInteract).not.toHaveBeenCalled();
  });

  it('canInteract can veto even when in range', () => {
    const s = station({ canInteract: () => false });
    interactionRegistry.register(s);

    const fired = interactionRegistry.interact('photon-station', { x: 0, z: 0 }, { actorId: 'alice' });

    expect(fired).toBe(false);
  });

  it('nearestAvailable picks the closest in-range, currently-interactable item', () => {
    interactionRegistry.register(station({ id: 'near', position: { x: 1, z: 0 } }));
    interactionRegistry.register(station({ id: 'far', position: { x: 1.9, z: 0 } }));
    interactionRegistry.register(station({ id: 'blocked', position: { x: 0.1, z: 0 }, canInteract: () => false }));

    const nearest = interactionRegistry.nearestAvailable({ x: 0, z: 0 }, { actorId: 'bob' });

    expect(nearest?.id).toBe('near');
  });

  it('nearestAvailable returns null when nothing is in range', () => {
    interactionRegistry.register(station({ position: { x: 100, z: 100 } }));
    expect(interactionRegistry.nearestAvailable({ x: 0, z: 0 }, { actorId: 'bob' })).toBeNull();
  });

  it('nearestAvailable lets a higher priority win over a merely-closer item', () => {
    interactionRegistry.register(station({ id: 'closer', position: { x: 1, z: 0 }, priority: 0 }));
    interactionRegistry.register(station({ id: 'important', position: { x: 1.8, z: 0 }, priority: 1 }));

    const nearest = interactionRegistry.nearestAvailable({ x: 0, z: 0 }, { actorId: 'bob' });

    expect(nearest?.id).toBe('important');
  });

  it('nearestAvailable, given a facing angle, favors what the actor is looking at over a slightly closer item behind them', () => {
    // facing 0 == forward is +z (sin 0, cos 0) per the sceneWorld.ts convention.
    interactionRegistry.register(station({ id: 'ahead', position: { x: 0, z: 2 } }));
    interactionRegistry.register(station({ id: 'behind', position: { x: 0, z: -1.5 } }));

    const nearest = interactionRegistry.nearestAvailable({ x: 0, z: 0 }, { actorId: 'bob' }, 0);

    expect(nearest?.id).toBe('ahead');
  });

  it('nearestAvailable without a facing angle ignores facing and stays plain nearest-in-range', () => {
    interactionRegistry.register(station({ id: 'ahead', position: { x: 0, z: 2 } }));
    interactionRegistry.register(station({ id: 'behind', position: { x: 0, z: -1.5 } }));

    const nearest = interactionRegistry.nearestAvailable({ x: 0, z: 0 }, { actorId: 'bob' });

    expect(nearest?.id).toBe('behind');
  });

  it('interact() on an unregistered id is a safe no-op', () => {
    expect(interactionRegistry.interact('ghost', { x: 0, z: 0 }, { actorId: 'alice' })).toBe(false);
  });
});
