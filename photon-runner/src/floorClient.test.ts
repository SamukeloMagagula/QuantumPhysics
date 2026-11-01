import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectFloor } from './floorClient';

// These tests drive the HTTP transport; the socket has its own tests below.
beforeEach(() => vi.stubGlobal('WebSocket', undefined));
afterEach(() => vi.unstubAllGlobals());

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

  it('sends its look, seat and callsign along with its position', async () => {
    const calls: string[] = [];
    const f = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.body) calls.push(String(init.body));
      return { ok: true, json: async () => ({ peers: [] }) };
    }) as unknown as typeof fetch;
    const link = track(connectFloor(f));
    link.report(0.2, 0.3, 'backward', false, 'campus', { name: 'Nova', seat: 'ops-1' });
    await settle();
    expect(JSON.parse(calls[0])).toMatchObject({ x: 0.2, y: 0.3, room: 'campus', name: 'Nova', seat: 'ops-1', since: 0 });
  });

  it('collects quick-chat from heartbeats and asks only for newer lines', async () => {
    const bodies: Record<string, unknown>[] = [];
    let chat = [{ id: 4, userId: 2, name: 'P2', phrase: 0, room: 'campus', at: 0 }];
    const f = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.body) bodies.push(JSON.parse(String(init.body)));
      return { ok: true, json: async () => ({ peers: [], chat }) };
    }) as unknown as typeof fetch;
    const link = track(connectFloor(f));
    let heard = 0;
    link.subscribe(() => heard++);
    await settle();
    expect(link.messages().map((l) => l.id)).toEqual([4]);
    expect(heard).toBeGreaterThan(0);
    chat = [];
    await new Promise((r) => setTimeout(r, 260));
    expect(bodies[bodies.length - 1].since).toBe(4);
  });

  it('adds its own line as soon as the server accepts it', async () => {
    const f = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.endsWith('/chat') ? { line: { id: 9, userId: 1, name: 'Me', phrase: 3, room: 'campus', at: 0 } } : { peers: [] }),
    })) as unknown as typeof fetch;
    const link = track(connectFloor(f));
    expect(await link.say(3)).toBe(true);
    expect(link.messages().map((l) => l.phrase)).toEqual([3]);
  });

  it('reports a refused line rather than throwing', async () => {
    const link = track(connectFloor(fakeFetch(() => [], false)));
    expect(await link.say(0)).toBe(false);
  });
});

/** A stand-in WebSocket the test opens, feeds and closes by hand. */
class FakeSocket {
  static last: FakeSocket | null = null;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: URL) {
    FakeSocket.last = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.();
  }
}

describe('the floor link over a socket', () => {
  const links: { stop(): void }[] = [];
  afterEach(() => {
    for (const l of links.splice(0)) l.stop();
    FakeSocket.last = null;
  });
  const okFetch = () =>
    vi.fn(async () => ({ ok: true, json: async () => ({ peers: [], chat: [] }) })) as unknown as typeof fetch;

  it('moves to the socket after HTTP works, and stops polling while it is up', async () => {
    const f = okFetch();
    const link = connectFloor(f, FakeSocket as unknown as typeof WebSocket);
    links.push(link);
    await settle();
    expect(FakeSocket.last?.url.pathname).toBe('/api/floor/ws');
    FakeSocket.last!.onopen!();
    expect(link.transport()).toBe('socket');
    link.report(0.3, 0.4, 'left', true, 'campus');
    await new Promise((r) => setTimeout(r, 120));
    expect(JSON.parse(FakeSocket.last!.sent.at(-1)!)).toMatchObject({ type: 'report', x: 0.3, room: 'campus' });
    const polls = (f as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await new Promise((r) => setTimeout(r, 500));
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(polls);
  });

  it('takes peers and chat from pushed state', async () => {
    const link = connectFloor(okFetch(), FakeSocket as unknown as typeof WebSocket);
    links.push(link);
    await settle();
    FakeSocket.last!.onopen!();
    FakeSocket.last!.onmessage!({ data: JSON.stringify({ type: 'state', peers: [peer(5, 0.2, 0.2)], chat: [{ id: 3, userId: 5, name: 'P5', phrase: 1, room: 'campus', at: 0 }] }) });
    expect(link.actors().map((a) => a.userId)).toEqual([5]);
    expect(link.messages().map((l) => l.id)).toEqual([3]);
  });

  it('falls back to HTTP the moment the socket drops', async () => {
    const f = okFetch();
    const link = connectFloor(f, FakeSocket as unknown as typeof WebSocket);
    links.push(link);
    await settle();
    FakeSocket.last!.onopen!();
    const before = (f as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    FakeSocket.last!.close();
    expect(link.transport()).toBe('http');
    await settle();
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThan(before);
  });
});
