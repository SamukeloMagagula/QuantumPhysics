import type { Facing, Peer } from './floorPresence';

/**
 * Client half of floor presence.
 *
 * Deliberately dumb: one request per tick carrying our position and returning
 * everyone else's, then smoothing between the answers so other people glide
 * rather than teleport at the poll rate.
 *
 * If the server is not running — the app is perfectly playable single-player
 * against a dev server that only serves the front end — this quietly reports
 * nobody and stops asking so often. Presence is a bonus, never a dependency.
 */

export type { Peer } from './floorPresence';

/** How often we tell the server where we are. */
export const TICK_MS = 220;

/** Smoothed view of another player, interpolated between server answers. */
export interface RemoteActor {
  userId: number;
  name: string;
  /** Where they are being drawn right now. */
  x: number;
  y: number;
  /** Where the last update said they were. */
  targetX: number;
  targetY: number;
  facing: Facing;
  walking: boolean;
  /** Own step animation phase, so two people do not march in lockstep. */
  phase: number;
}

export interface FloorLink {
  /** Called from the render loop with the local position. */
  report(x: number, y: number, facing: Facing, walking: boolean): void;
  /** Smoothed peers, safe to read every frame. */
  actors(): RemoteActor[];
  /** Advance the interpolation. */
  tick(dt: number): void;
  /** True once the server has answered at least once. */
  online(): boolean;
  stop(): void;
}

/** Ease a value toward a target, frame-rate independent. */
function approach(current: number, target: number, dt: number, rate: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export function connectFloor(fetchImpl: typeof fetch = fetch): FloorLink {
  const remotes = new Map<number, RemoteActor>();
  let latest = { x: 0.5, y: 0.7, facing: 'forward' as Facing, walking: false };
  let live = false;
  let stopped = false;
  let timer = 0;
  // Back off when nobody is answering, so a front-end-only dev server does
  // not get hammered with a request five times a second forever.
  let interval = TICK_MS;

  const merge = (peers: Peer[]) => {
    const seen = new Set<number>();
    for (const p of peers) {
      seen.add(p.userId);
      const existing = remotes.get(p.userId);
      if (existing) {
        existing.targetX = p.x;
        existing.targetY = p.y;
        existing.facing = p.facing;
        existing.walking = p.walking;
        existing.name = p.name;
      } else {
        // Someone who has just appeared starts where they are rather than
        // sliding in from wherever the last person stood.
        remotes.set(p.userId, {
          userId: p.userId,
          name: p.name,
          x: p.x,
          y: p.y,
          targetX: p.x,
          targetY: p.y,
          facing: p.facing,
          walking: p.walking,
          phase: Math.random() * 4,
        });
      }
    }
    for (const id of [...remotes.keys()]) if (!seen.has(id)) remotes.delete(id);
  };

  const beat = async () => {
    if (stopped) return;
    try {
      const res = await fetchImpl('/api/floor/hq', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(latest),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { peers?: Peer[] };
      merge(Array.isArray(body.peers) ? body.peers : []);
      live = true;
      interval = TICK_MS;
    } catch {
      live = false;
      remotes.clear();
      interval = Math.min(interval * 2, 10_000);
    }
    if (!stopped) timer = setTimeout(beat, interval) as unknown as number;
  };
  timer = setTimeout(beat, 0) as unknown as number;

  return {
    report(x, y, facing, walking) {
      latest = { x, y, facing, walking };
    },
    actors() {
      return [...remotes.values()];
    },
    tick(dt) {
      for (const a of remotes.values()) {
        a.x = approach(a.x, a.targetX, dt, 11);
        a.y = approach(a.y, a.targetY, dt, 11);
        if (a.walking) a.phase += dt * 5;
      }
    },
    online() {
      return live;
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      remotes.clear();
      // Best effort: tell the server we have gone so nobody sees a ghost.
      try {
        fetchImpl('/api/floor/hq', { method: 'DELETE', keepalive: true }).catch(() => {});
      } catch {
        /* the page is going away; nothing useful to do */
      }
    },
  };
}
