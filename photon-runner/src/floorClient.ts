import type { ChatLine, Facing, Peer, PeerLook } from './floorPresence';

/**
 * Client half of floor presence.
 *
 * Deliberately dumb: one request per tick carrying our position and returning
 * everyone else's, then smoothing between the answers so other people glide
 * rather than teleport at the poll rate.
 *
 * Transport: a WebSocket when the server offers one (pushes arrive as they
 * happen, and there is no request per tick), falling back to the HTTP
 * heartbeat below whenever the socket is unavailable or drops.
 *
 * If the server is not running — the app is perfectly playable single-player
 * against a dev server that only serves the front end — this quietly reports
 * nobody and stops asking so often. Presence is a bonus, never a dependency.
 */

export type { ChatLine, Peer, PeerLook } from './floorPresence';

/** How often we tell the server where we are. */
export const TICK_MS = 220;
/** Over a socket: most often we send a moving position, and how often we say we are still here. */
export const SOCKET_SEND_MS = 50;
export const SOCKET_KEEPALIVE_MS = 1000;

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
  /** How we are currently talking to the server. */
  transport(): 'socket' | 'http' | 'offline';
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

export function connectFloor(
  fetchImpl: typeof fetch = fetch,
  SocketImpl: typeof WebSocket | null = typeof WebSocket === 'undefined' ? null : WebSocket,
): FloorLink {
  const remotes = new Map<number, RemoteActor>();
  let latest: { x: number; y: number; facing: Facing; walking: boolean; room: string } & ReportExtras = {
    x: 0.5,
    y: 0.7,
    facing: 'forward',
    walking: false,
    room: 'ops',
  };
  let chat: ChatLine[] = [];
  let since = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(l => l());
  let live = false;
  let stopped = false;
  let timer = 0;
  // Back off when nobody is answering, so a front-end-only dev server does
  // not get hammered with a request five times a second forever.
  let interval = TICK_MS;
  let socket: WebSocket | null = null;
  let socketOpen = false;
  let socketRetry = 2000;
  let dirty = true;
  let lastSent = 0;
  let sender = 0;

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
    const fresh = lines.filter(l => l.id > since);
    if (!fresh.length) return;
    since = Math.max(since, ...fresh.map(l => l.id));
    chat = [...chat, ...fresh].slice(-CHAT_KEEP);
  };

  const sendReport = () => {
    if (!socket || !socketOpen) return;
    const now = Date.now();
    if (!dirty && now - lastSent < SOCKET_KEEPALIVE_MS) return;
    socket.send(JSON.stringify({ type: 'report', ...latest }));
    dirty = false;
    lastSent = now;
  };

  /** Try the socket once HTTP has worked (so the identity cookie exists). */
  const openSocket = () => {
    if (!SocketImpl || socket || stopped) return;
    let ws: WebSocket;
    try {
      const url = new URL('/api/floor/ws', globalThis.location?.href ?? 'http://localhost/');
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.searchParams.set('since', String(since));
      ws = new SocketImpl(url);
    } catch {
      return;
    }
    socket = ws;
    ws.onopen = () => {
      socketOpen = true;
      socketRetry = 2000;
      dirty = true;
      sendReport();
      sender = setInterval(sendReport, SOCKET_SEND_MS) as unknown as number;
    };
    ws.onmessage = event => {
      let msg: { type?: string; peers?: Peer[]; chat?: ChatLine[] };
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (msg.type !== 'state') return;
      merge(Array.isArray(msg.peers) ? msg.peers : []);
      if (Array.isArray(msg.chat)) addChat(msg.chat);
      live = true;
      notify();
    };
    ws.onclose = () => {
      const wasOpen = socketOpen;
      socket = null;
      socketOpen = false;
      clearInterval(sender);
      if (stopped) return;
      // HTTP takes over at once; the socket is tried again, backing off if it keeps failing.
      if (wasOpen) {
        clearTimeout(timer);
        timer = setTimeout(beat, 0) as unknown as number;
      } else socketRetry = Math.min(socketRetry * 2, 30_000);
      setTimeout(openSocket, socketRetry);
    };
  };

  const beat = async () => {
    if (stopped) return;
    // While the socket is up it carries everything; HTTP just waits in reserve.
    if (socketOpen) {
      timer = setTimeout(beat, TICK_MS) as unknown as number;
      return;
    }
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
      openSocket();
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
      dirty = true;
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
    transport() {
      return socketOpen ? 'socket' : live ? 'http' : 'offline';
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
      clearInterval(sender);
      socket?.close();
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
