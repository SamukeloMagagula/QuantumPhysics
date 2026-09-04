import { describe, expect, it } from 'vitest';
import {
  MAX_PEERS,
  PEER_TTL_MS,
  cleanName,
  createFloorStore,
  heartbeat,
  leave,
  peersOn,
  prune,
} from './floorPresence';

const at = (t: number, id = 1, x = 0.5, y = 0.5) => ({ t, id, x, y });

function storeWith(entries: ReturnType<typeof at>[]) {
  const s = createFloorStore();
  for (const e of entries) {
    heartbeat(s, e.t, { userId: e.id, name: `P${e.id}`, x: e.x, y: e.y });
  }
  return s;
}

describe('floor presence', () => {
  it('records a position and reports it to everyone else', () => {
    const s = storeWith([at(1000, 1, 0.3, 0.7)]);
    expect(peersOn(s, 1000, 2)).toHaveLength(1);
    expect(peersOn(s, 1000, 2)[0]).toMatchObject({ userId: 1, x: 0.3, y: 0.7 });
  });

  it('never reports you to yourself', () => {
    const s = storeWith([at(1000, 1)]);
    expect(peersOn(s, 1000, 1)).toHaveLength(0);
  });

  it('replaces a position rather than accumulating one per tick', () => {
    const s = createFloorStore();
    for (let i = 0; i < 20; i++) heartbeat(s, 1000 + i, { userId: 7, name: 'A', x: i / 20, y: 0.5 });
    expect(s.peers.size).toBe(1);
    expect(peersOn(s, 1020, 0)[0].x).toBeCloseTo(19 / 20);
  });

  it('drops someone who has gone quiet', () => {
    const s = storeWith([at(1000, 1)]);
    expect(peersOn(s, 1000 + PEER_TTL_MS, 2)).toHaveLength(1);
    expect(peersOn(s, 1001 + PEER_TTL_MS, 2)).toHaveLength(0);
  });

  it('expires without needing a background timer', () => {
    // peersOn prunes as it reads, so a floor nobody is looking at cannot
    // quietly retain stale rows.
    const s = storeWith([at(1000, 1)]);
    peersOn(s, 99_000, 2);
    expect(s.peers.size).toBe(0);
  });

  it('forgets someone who leaves cleanly', () => {
    const s = storeWith([at(1000, 1)]);
    leave(s, 1);
    expect(peersOn(s, 1000, 2)).toHaveLength(0);
  });

  it('rejects a position that is not a usable number', () => {
    const s = createFloorStore();
    expect(heartbeat(s, 1, { userId: 1, name: 'A', x: Number.NaN, y: 0.5 })).toBe(false);
    expect(heartbeat(s, 1, { userId: 1, name: 'A', x: 'over there', y: 0.5 })).toBe(false);
    expect(s.peers.size).toBe(0);
  });

  it('clamps a position to the scene rather than trusting the client', () => {
    const s = createFloorStore();
    heartbeat(s, 1, { userId: 1, name: 'A', x: 40, y: -12 });
    expect(peersOn(s, 1, 2)[0]).toMatchObject({ x: 1, y: 0 });
  });

  it('falls back to a sane facing for anything unrecognised', () => {
    const s = createFloorStore();
    heartbeat(s, 1, { userId: 1, name: 'A', x: 0.5, y: 0.5, facing: 'sideways-ish' });
    expect(peersOn(s, 1, 2)[0].facing).toBe('forward');
  });

  it('tidies up names, and never renders an empty one', () => {
    expect(cleanName('  Sam   Magagula ')).toBe('Sam Magagula');
    expect(cleanName('')).toBe('Operative');
    expect(cleanName(null)).toBe('Operative');
    expect(cleanName('x'.repeat(200))).toHaveLength(24);
  });

  it('caps the floor, but evicts the stale before refusing the living', () => {
    const s = createFloorStore();
    for (let i = 0; i < MAX_PEERS; i++) heartbeat(s, 1000, { userId: i, name: 'A', x: 0.5, y: 0.5 });
    // Full, and everyone is fresh: the newcomer has to wait.
    expect(heartbeat(s, 1000, { userId: 999, name: 'Late', x: 0.5, y: 0.5 })).toBe(false);
    // Once the room has gone quiet, the same newcomer gets in.
    expect(heartbeat(s, 1001 + PEER_TTL_MS, { userId: 999, name: 'Late', x: 0.5, y: 0.5 })).toBe(true);
    expect(s.peers.size).toBe(1);
  });

  it('lets an existing player keep reporting even on a full floor', () => {
    const s = createFloorStore();
    for (let i = 0; i < MAX_PEERS; i++) heartbeat(s, 1000, { userId: i, name: 'A', x: 0.5, y: 0.5 });
    expect(heartbeat(s, 1100, { userId: 0, name: 'A', x: 0.6, y: 0.6 })).toBe(true);
  });

  it('prune leaves the living alone', () => {
    const s = storeWith([at(1000, 1), at(9000, 2)]);
    prune(s, 9000);
    expect([...s.peers.keys()]).toEqual([2]);
  });
});
