import type { ChatLine, Facing, Peer, PeerLook } from './floorPresence';

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

export type { ChatLine, Peer, PeerLook } from './floorPresence';

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
  /** Which room they are standing in. */
  room: string;
  /** Own step animation phase, so two people do not march in lockstep. */
  phase: number;
  look: PeerLook | null;
  seat: string | null;
}

/** Optional extras a scene can share beyond position. */
export interface ReportExtras {
  /** Callsign; the server falls back to the account's handle. */
  name?: string;
  look?: PeerLook | null;
  seat?: string | null;
}

/** How many chat lines the client keeps for display. */
export const CHAT_KEEP = 30;

export interface FloorLink {
  /** Called from the render loop with the local position and room. */
  report(x: number, y: number, facing: Facing, walking: boolean, room: string, extras?: ReportExtras): void;
  /** Smoothed peers, safe to read every frame. */
  actors(): RemoteActor[];
  /** Advance the interpolation. */
  tick(dt: number): void;
  /** True once the server has answered at least once. */
  online(): boolean;
  /** Recent quick-chat in our room, oldest first. */
  messages(): ChatLine[];
  /** Say a quick-chat phrase by index. Resolves false if it was not accepted. */
  say(phrase: number): Promise<boolean>;
  /** Called whenever peers or chat change, for UIs that do not redraw every frame. */
  subscribe(listener: () => void): () => void;
  stop(): void;
}

/** Ease a value toward a target, frame-rate independent. */
function approach(current: number, target: number, dt: number, rate: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export function connectFloor(fetchImpl: typeof fetch = fetch): FloorLink {
  const remotes = new Map<number, RemoteActor>();
  let latest: { x: number; y: number; facing: Facing; walking: boolean; room: string } & ReportExtras =
    { x: 0.5, y: 0.7, facing: 'forward', walking: false, room: 'ops' };
  let chat: ChatLine[] = [];
  let since = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
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
        existing.room = p.room;
        existing.name = p.name;
        // Keep the same object while the look is unchanged, so renderers can memoise on it.
        if (JSON.stringify(existing.look) !== JSON.stringify(p.look ?? null)) existing.look = p.look ?? null;
        existing.seat = p.seat ?? null;
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
          room: p.room,
          phase: Math.random() * 4,
          look: p.look ?? null,
          seat: p.seat ?? null,
        });
      }
    }
    for (const id of [...remotes.keys()]) if (!seen.has(id)) remotes.delete(id);
  };

  const addChat = (lines: ChatLine[]) => {
    const fresh = lines.filter((l) => l.id > since);
    if (!fresh.length) return;
    since = Math.max(since, ...fresh.map((l) => l.id));
    chat = [...chat, ...fresh].slice(-CHAT_KEEP);
  };

  const beat = async () => {
    if (stopped) return;
    try {
      const res = await fetchImpl('/api/floor/hq', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...latest, since }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { peers?: Peer[]; chat?: ChatLine[] };
      merge(Array.isArray(body.peers) ? body.peers : []);
      if (Array.isArray(body.chat)) addChat(body.chat);
      live = true;
      interval = TICK_MS;
    } catch {
      live = false;
      remotes.clear();
      interval = Math.min(interval * 2, 10_000);
    }
    notify();
    if (!stopped) timer = setTimeout(beat, interval) as unknown as number;
  };
  timer = setTimeout(beat, 0) as unknown as number;

  return {
    report(x, y, facing, walking, room, extras) {
      // Changing room teleports you in normalised coordinates, so anyone we
      // were smoothing toward is dropped rather than slid across the screen.
      if (room !== latest.room) {
        remotes.clear();
        chat = [];
      }
      latest = { x, y, facing, walking, room, ...extras };
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
    messages() {
      return chat;
    },
    async say(phrase) {
      try {
        const res = await fetchImpl('/api/floor/hq/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ phrase }),
        });
        if (!res.ok) return false;
        const body = (await res.json()) as { line?: ChatLine };
        if (body.line) {
          addChat([body.line]);
          notify();
        }
        return true;
      } catch {
        return false;
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      remotes.clear();
      listeners.clear();
      // Best effort: tell the server we have gone so nobody sees a ghost.
      try {
        fetchImpl('/api/floor/hq', { method: 'DELETE', keepalive: true }).catch(() => {});
      } catch {
        /* the page is going away; nothing useful to do */
      }
    },
  };
}
