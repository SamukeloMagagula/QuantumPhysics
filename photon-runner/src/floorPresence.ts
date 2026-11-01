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

/**
 * How someone looks, so other players see the character they built rather
 * than a stand-in. Mirrors `CharacterAppearance` minus the nickname (that
 * travels as `name`), and every field is checked against a closed list or a
 * colour pattern because it arrives off the wire and is drawn into an SVG.
 */
export interface PeerLook {
  skinTone: string;
  hairStyle: string;
  hairColor: string;
  outfit: string;
  outfitPrimary: string;
  outfitSecondary: string;
  accessory: string;
  accentColor: string;
  build: string;
  height: number;
}

export interface Peer {
  userId: number;
  name: string;
  /** Normalised scene coordinates, 0–1. */
  x: number;
  y: number;
  facing: Facing;
  walking: boolean;
  /**
   * Which room of the building they are standing in. Coordinates are
   * normalised per room, so a position without one is meaningless the moment
   * the headquarters stopped being a single room.
   */
  room: string;
  /** Their customised character, when the client sent one. */
  look: PeerLook | null;
  /** The computer they are sitting at, if any. */
  seat: string | null;
  /** Epoch ms of the last heartbeat. */
  at: number;
}

/**
 * Chat is quick-chat only: players pick from a fixed list of phrases and the
 * wire carries the index. The audience is 10–13 year olds in a classroom, and
 * a closed vocabulary needs no moderation, cannot carry personal details, and
 * still covers what people on a shared floor actually need to say.
 */
export const QUICK_CHAT = [
  'Hi everyone!',
  'Follow me!',
  'Wait for me!',
  'Can someone help?',
  'I found a clue!',
  'Meet me in the Power Control Room.',
  "Let's start a team intercept!",
  'I will play Eve.',
  'Nice work!',
  'Thanks!',
  'Brb, using a computer.',
  'Bye!',
] as const;

export interface ChatLine {
  id: number;
  userId: number;
  name: string;
  /** Index into QUICK_CHAT. */
  phrase: number;
  room: string;
  at: number;
}

export interface FloorStore {
  peers: Map<number, Peer>;
  chat: ChatLine[];
  nextChatId: number;
}

/** How many lines of chat the floor remembers. */
export const CHAT_HISTORY = 40;

/** A single player can speak at most this often. */
export const CHAT_COOLDOWN_MS = 1500;

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
  return { peers: new Map(), chat: [], nextChatId: 1 };
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

/**
 * Room ids come off the wire, so they are treated as untrusted text rather
 * than looked up against the room registry: presence should not break the
 * day somebody adds a wing to one deploy and not another.
 */
export function cleanRoom(raw: unknown): string {
  const s = String(raw ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  return (s || 'ops').slice(0, 24);
}

const HAIR_STYLES = ['bald', 'buzz', 'short', 'messy', 'ponytail', 'bun', 'afro', 'long', 'mohawk'];
const OUTFITS = ['jumpsuit', 'hoodie', 'labcoat', 'tactical', 'varsity', 'street'];
const ACCESSORIES = ['none', 'cap', 'visor', 'glasses', 'headphones', 'beanie', 'mask', 'earpiece'];
const BUILDS = ['slim', 'average', 'broad'];

/** Accept a look only when every field is one the character renderer knows. */
export function cleanLook(raw: unknown): PeerLook | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const colour = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
  const oneOf = (v: unknown, list: string[]) => (typeof v === 'string' && list.includes(v) ? v : null);
  const height = typeof r.height === 'number' && Number.isFinite(r.height) ? Math.min(1.08, Math.max(0.92, r.height)) : 1;
  const look = {
    skinTone: colour(r.skinTone),
    hairStyle: oneOf(r.hairStyle, HAIR_STYLES),
    hairColor: colour(r.hairColor),
    outfit: oneOf(r.outfit, OUTFITS),
    outfitPrimary: colour(r.outfitPrimary),
    outfitSecondary: colour(r.outfitSecondary),
    accessory: oneOf(r.accessory, ACCESSORIES),
    accentColor: colour(r.accentColor),
    build: oneOf(r.build, BUILDS),
  };
  if (Object.values(look).some((v) => v === null)) return null;
  return { ...(look as Omit<PeerLook, 'height'>), height };
}

/** Seat ids are short slugs like `ops-2`; anything else means standing. */
export function cleanSeat(raw: unknown): string | null {
  return typeof raw === 'string' && /^[a-z0-9-]{1,32}$/.test(raw) ? raw : null;
}

export interface HeartbeatInput {
  userId: number;
  name: string | null;
  x: unknown;
  y: unknown;
  facing?: unknown;
  walking?: unknown;
  room?: unknown;
  look?: unknown;
  seat?: unknown;
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
    room: cleanRoom(input.room),
    look: cleanLook(input.look),
    seat: cleanSeat(input.seat),
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
 *
 * Pass `room` to get only the people in it — which is what a client wants,
 * since drawing someone at their break-room coordinates on the operations
 * floor would put them inside a desk.
 */
export function peersOn(store: FloorStore, now: number, exceptUserId?: number, room?: string): Peer[] {
  prune(store, now);
  return [...store.peers.values()]
    .filter((p) => p.userId !== exceptUserId && (room === undefined || p.room === room))
    .sort((a, b) => b.at - a.at);
}

/** Explicit departure, for when a player leaves the scene cleanly. */
export function leave(store: FloorStore, userId: number): void {
  store.peers.delete(userId);
}

/**
 * Say one of the quick-chat phrases. Only someone currently on the floor can
 * speak, and only into the room they are standing in. Returns the line, or
 * why it was refused: the phrase is not on the list, the speaker is not on
 * the floor, or they are talking faster than the cooldown allows.
 */
export type SayRefusal = 'unknown-phrase' | 'not-on-floor' | 'too-soon';
export function say(store: FloorStore, now: number, userId: number, phrase: unknown): ChatLine | SayRefusal {
  const index = typeof phrase === 'number' ? phrase : Number(phrase);
  if (!Number.isInteger(index) || index < 0 || index >= QUICK_CHAT.length) return 'unknown-phrase';
  prune(store, now);
  const peer = store.peers.get(userId);
  if (!peer) return 'not-on-floor';
  const last = [...store.chat].reverse().find((l) => l.userId === userId);
  if (last && now - last.at < CHAT_COOLDOWN_MS) return 'too-soon';
  const line: ChatLine = { id: store.nextChatId++, userId, name: peer.name, phrase: index, room: peer.room, at: now };
  store.chat.push(line);
  if (store.chat.length > CHAT_HISTORY) store.chat.splice(0, store.chat.length - CHAT_HISTORY);
  return line;
}

/** Chat in a room newer than the id the caller last saw. */
export function chatSince(store: FloorStore, room: string, since: unknown): ChatLine[] {
  const after = typeof since === 'number' && Number.isFinite(since) ? since : Number(since) || 0;
  return store.chat.filter((l) => l.room === room && l.id > after);
}
