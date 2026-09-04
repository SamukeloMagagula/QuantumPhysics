import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectFloor } from './floorClient';

const peer = (id: number, x: number, y: number, over: Record<string, unknown> = {}) => ({
  userId: id,
  name: `P${id}`,
  x,
  y,
  facing: 'forward',
  walking: false,
  at: 0,
  ...over,
});

/** A fetch stub that answers with whatever peers the test wants. */
function fakeFetch(peers: () => unknown, ok = true) {
  return vi.fn(async () => ({
    ok,
    json: async () => ({ peers: peers() }),
  })) as unknown as typeof fetch;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('the floor link', () => {
  const links: { stop(): void }[] = [];
  const track = <T extends { stop(): void }>(l: T) => {
    links.push(l);
    return l;
  };
  afterEach(() => {
    for (const l of links.splice(0)) l.stop();
  });

  it('reports nobody before the server has answered', () => {
    const link = track(connectFloor(fakeFetch(() => [])));
    expect(link.actors()).toEqual([]);
    expect(link.online()).toBe(false);
  });

  it('picks up peers from the first answer', async () => {
    const link = track(connectFloor(fakeFetch(() => [peer(2, 0.4, 0.6)])));
    await settle();
    expect(link.online()).toBe(true);
    expect(link.actors()).toHaveLength(1);
    expect(link.actors()[0]).toMatchObject({ userId: 2, x: 0.4, y: 0.6, name: 'P2' });
  });

  it('places a newly seen player where they are, not where the last one was', async () => {
    // Sliding a new arrival across the room from the previous occupant's spot
    // would look like teleportation with extra steps.
    const link = track(connectFloor(fakeFetch(() => [peer(3, 0.9, 0.2)])));
    await settle();
    const a = link.actors()[0];
    expect(a.x).toBe(a.targetX);
    expect(a.y).toBe(a.targetY);
  });

  it('eases toward the last reported position instead of snapping', async () => {
    let where = [peer(2, 0.2, 0.2)];
    const link = track(connectFloor(fakeFetch(() => where)));
    await settle();
    where = [peer(2, 0.8, 0.8)];
    await new Promise((r) => setTimeout(r, 260));
    const before = link.actors()[0].x;
    link.tick(0.05);
    const after = link.actors()[0].x;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThan(0.8);
  });

  it('advances the walk cycle only while someone is walking', async () => {
    const link = track(connectFloor(fakeFetch(() => [peer(2, 0.5, 0.5, { walking: false })])));
    await settle();
    const still = link.actors()[0].phase;
    link.tick(0.5);
    expect(link.actors()[0].phase).toBe(still);
  });

  it('forgets a player the server stops listing', async () => {
    let list: unknown[] = [peer(2, 0.5, 0.5)];
    const link = track(connectFloor(fakeFetch(() => list)));
    await settle();
    expect(link.actors()).toHaveLength(1);
    list = [];
    await new Promise((r) => setTimeout(r, 260));
    expect(link.actors()).toHaveLength(0);
  });

  it('goes quiet when there is no presence API, rather than erroring', async () => {
    // The front end is playable on its own; presence must never be a
    // dependency of walking around.
    const link = track(connectFloor(fakeFetch(() => [], false)));
    await settle();
    expect(link.online()).toBe(false);
    expect(link.actors()).toEqual([]);
  });

  it('survives a rejected request', async () => {
    const boom = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const link = track(connectFloor(boom));
    await settle();
    expect(link.actors()).toEqual([]);
  });

  it('tolerates a malformed answer', async () => {
    const junk = vi.fn(async () => ({ ok: true, json: async () => ({ peers: 'nope' }) })) as unknown as typeof fetch;
    const link = track(connectFloor(junk));
    await settle();
    expect(link.actors()).toEqual([]);
  });

  it('stops asking once stopped', async () => {
    const f = fakeFetch(() => []);
    const link = connectFloor(f);
    await settle();
    const calls = (f as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    link.stop();
    await new Promise((r) => setTimeout(r, 300));
    // Only the parting DELETE may have been added.
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeLessThanOrEqual(calls + 1);
  });
});
