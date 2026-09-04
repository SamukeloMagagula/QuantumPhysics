/**
 * Who else is on the Phantom Q floor.
 *
 * This is presence, not game state: where each person is standing right now,
 * which way they are facing, and whether they are walking. It is deliberately
 * in memory and deliberately not persisted — a position from a session that
 * ended is worse than no position at all, and writing a row to SQLite several
 * times a second for data with a four-second shelf life would be silly.
 *
 * Everything here is pure over an explicit store and clock, so the staleness
 * and capacity rules can be tested without a server or a timer.
 */

export type Facing = 'forward' | 'backward' | 'left' | 'right';

export interface Peer {
  userId: number;
  name: string;
  /** Normalised scene coordinates, 0–1. */
  x: number;
  y: number;
  facing: Facing;
  walking: boolean;
  /** Epoch ms of the last heartbeat. */
  at: number;
}

export interface FloorStore {
  peers: Map<number, Peer>;
}

/**
 * How long a peer survives without a heartbeat. Long enough to ride out a
 * dropped poll on a bad connection, short enough that someone who closed the
 * tab stops haunting the room.
 */
export const PEER_TTL_MS = 4000;

/** A hard cap, so one floor cannot be used to grow memory without bound. */
export const MAX_PEERS = 24;

const FACINGS: Facing[] = ['forward', 'backward', 'left', 'right'];

export function createFloorStore(): FloorStore {
  return { peers: new Map() };
}

/** Clamp to the walkable coordinate space, rejecting anything non-finite. */
function coord(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

export function cleanName(raw: unknown): string {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  return (s || 'Operative').slice(0, 24);
}

export interface HeartbeatInput {
  userId: number;
  name: string | null;
  x: unknown;
  y: unknown;
  facing?: unknown;
  walking?: unknown;
}

/**
 * Record where someone is. Returns false when the position was unusable or
 * the floor is full — callers should treat that as "you are not on the
 * board", not as an error worth interrupting play for.
 */
export function heartbeat(store: FloorStore, now: number, input: HeartbeatInput): boolean {
  const x = coord(input.x);
  const y = coord(input.y);
  if (x === null || y === null) return false;

  // Make room before refusing: a full floor is usually a floor full of people
  // who have already left.
  if (!store.peers.has(input.userId) && store.peers.size >= MAX_PEERS) {
    prune(store, now);
    if (store.peers.size >= MAX_PEERS) return false;
  }

  store.peers.set(input.userId, {
    userId: input.userId,
    name: cleanName(input.name),
    x,
    y,
    facing: FACINGS.includes(input.facing as Facing) ? (input.facing as Facing) : 'forward',
    walking: Boolean(input.walking),
    at: now,
  });
  return true;
}

/** Drop everyone who has gone quiet. */
export function prune(store: FloorStore, now: number): void {
  for (const [id, p] of store.peers) {
    if (now - p.at > PEER_TTL_MS) store.peers.delete(id);
  }
}

/**
 * Everyone currently on the floor except the caller, freshest first. Prunes
 * as it goes, so presence expires without needing a background timer.
 */
export function peersOn(store: FloorStore, now: number, exceptUserId?: number): Peer[] {
  prune(store, now);
  return [...store.peers.values()]
    .filter((p) => p.userId !== exceptUserId)
    .sort((a, b) => b.at - a.at);
}

/** Explicit departure, for when a player leaves the scene cleanly. */
export function leave(store: FloorStore, userId: number): void {
  store.peers.delete(userId);
}
