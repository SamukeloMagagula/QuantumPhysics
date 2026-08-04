/**
 * Server-authoritative session for real-network Quantum Heist: a 4-letter
 * room code, the host picks the facility (map), roles are assigned and kept
 * secret server-side (each player only ever learns their own role — "the
 * characters only know who they are"), and the shared game truth reuses
 * quantumHeistLogic.ts's pure functions verbatim (same pattern as
 * qkdService.ts wrapping qkdEngine.ts) rather than re-deriving the rules.
 *
 * Position sync (x/z/facing/walking per seat) is included so every
 * connected client can render where the other real operatives are.
 */
import type { Db } from './serverDb';
import type { UserRow } from './serverIdentity';
import { MAPS, getMap } from './sceneMaps';
import {
  CODENAMES,
  CREW_SIZE,
  createGame,
  completeTask,
  canCompromise,
  compromise,
  reportBody,
  callEmergency,
  castVote,
  votingComplete,
  resolveMeeting,
  startCrisis,
  holdCrisisConsole,
  tickCrisis,
  tickCooldown,
  aliveOf,
  type GameState,
  type CrisisKind,
} from './quantumHeistLogic';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
const MAP_IDS = new Set(MAPS.map((m) => m.id));

export class HeistError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

interface GameRow {
  id: number;
  code: string;
  phase: 'lobby' | 'play' | 'ended';
  map_id: string;
  host_user_id: number;
  state: string;
  created_at: string;
  updated_at: string;
}

interface SeatRow {
  game_id: number;
  seat_index: number;
  codename: string;
  kind: 'human' | 'computer';
  user_id: number | null;
  display_name: string | null;
  x: number;
  z: number;
  facing: number;
  walking: number;
  last_seen: string;
}

function newCode(db: Db): string {
  for (let i = 0; i < 20; i++) {
    let code = '';
    for (let j = 0; j < 4; j++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!db.prepare('SELECT 1 FROM heist_games WHERE code = ?').get(code)) return code;
  }
  throw new HeistError('could not allocate a room code', 500);
}

function getGame(db: Db, code: string): GameRow {
  const g = db.prepare('SELECT * FROM heist_games WHERE code = ?').get(code.toUpperCase()) as GameRow | undefined;
  if (!g) throw new HeistError('no such room', 404);
  return g;
}

function getSeats(db: Db, gameId: number): SeatRow[] {
  return db.prepare('SELECT * FROM heist_game_seats WHERE game_id = ? ORDER BY seat_index').all(gameId) as SeatRow[];
}

function seatForUser(db: Db, gameId: number, userId: number): SeatRow | undefined {
  return db.prepare('SELECT * FROM heist_game_seats WHERE game_id = ? AND user_id = ?').get(gameId, userId) as
    | SeatRow
    | undefined;
}

function seatAt(db: Db, gameId: number, seatIndex: number): SeatRow | undefined {
  return db.prepare('SELECT * FROM heist_game_seats WHERE game_id = ? AND seat_index = ?').get(gameId, seatIndex) as
    | SeatRow
    | undefined;
}

function state(g: GameRow): GameState {
  return JSON.parse(g.state);
}

function setState(db: Db, gameId: number, s: GameState): void {
  db.prepare('UPDATE heist_games SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    JSON.stringify(s),
    gameId
  );
}

export interface RoomSummary {
  code: string;
  mapId: string;
  seatIndex: number;
  codename: string;
}

export function createRoom(db: Db, user: UserRow, mapId: string): RoomSummary {
  const resolvedMap = MAP_IDS.has(mapId) ? mapId : MAPS[0].id;
  const code = newCode(db);
  const info = db
    .prepare("INSERT INTO heist_games (code, phase, map_id, host_user_id, state) VALUES (?, 'lobby', ?, ?, '{}')")
    .run(code, resolvedMap, user.id);
  const gid = Number(info.lastInsertRowid);
  const codenames = CODENAMES.slice(0, CREW_SIZE);
  codenames.forEach((codename, seatIndex) => {
    if (seatIndex === 0) {
      db.prepare(
        "INSERT INTO heist_game_seats (game_id, seat_index, codename, kind, user_id, display_name) VALUES (?, ?, ?, 'human', ?, ?)"
      ).run(gid, seatIndex, codename, user.id, user.display_name);
    } else {
      db.prepare(
        "INSERT INTO heist_game_seats (game_id, seat_index, codename, kind, display_name) VALUES (?, ?, ?, 'computer', 'Computer')"
      ).run(gid, seatIndex, codename);
    }
  });
  return { code, mapId: resolvedMap, seatIndex: 0, codename: codenames[0] };
}

export function joinRoom(db: Db, code: string, user: UserRow): RoomSummary {
  const g = getGame(db, code);
  if (g.phase !== 'lobby') throw new HeistError('room already started', 409);
  if (seatForUser(db, g.id, user.id)) throw new HeistError('already seated in this room', 409);
  const seats = getSeats(db, g.id);
  const open = seats.find((s) => s.kind === 'computer' && s.user_id === null);
  if (!open) throw new HeistError('room is full', 409);
  db.prepare("UPDATE heist_game_seats SET kind = 'human', user_id = ?, display_name = ? WHERE game_id = ? AND seat_index = ?").run(
    user.id,
    user.display_name,
    g.id,
    open.seat_index
  );
  return { code: g.code, mapId: g.map_id, seatIndex: open.seat_index, codename: open.codename };
}

export function setMap(db: Db, code: string, user: UserRow, mapId: string): void {
  const g = getGame(db, code);
  if (g.host_user_id !== user.id) throw new HeistError('only the host can change the facility', 403);
  if (g.phase !== 'lobby') throw new HeistError('room already started', 409);
  if (!MAP_IDS.has(mapId)) throw new HeistError('unknown facility', 400);
  db.prepare('UPDATE heist_games SET map_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(mapId, g.id);
}

export function startRoom(db: Db, code: string, user: UserRow): void {
  const g = getGame(db, code);
  if (g.host_user_id !== user.id) throw new HeistError('only the host can start the room', 403);
  if (g.phase !== 'lobby') return; // idempotent: already started
  // createGame() starts at phase 'briefing' (the solo pre-game beat); the room's
  // own lobby already served that purpose, so jump straight into 'play'.
  const initial = { ...createGame(Math.random), phase: 'play' as const };
  const map = getMap(g.map_id);
  const seats = getSeats(db, g.id);
  const updateSeat = db.prepare('UPDATE heist_game_seats SET x = ?, z = ?, facing = 0 WHERE game_id = ? AND seat_index = ?');
  seats.forEach((seat, i) => {
    const angle = (i / seats.length) * Math.PI * 2;
    const x = map.meeting.x + Math.cos(angle) * 1.8;
    const z = map.meeting.z + Math.sin(angle) * 1.8;
    updateSeat.run(x, z, g.id, seat.seat_index);
  });
  db.prepare("UPDATE heist_games SET phase = 'play', state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    JSON.stringify(initial),
    g.id
  );
}

export interface SeatView {
  codename: string;
  kind: 'human' | 'computer';
  alive: boolean;
  isYou: boolean;
  x: number;
  z: number;
  facing: number;
  walking: boolean;
}

export interface RoomStateView {
  code: string;
  phase: 'lobby' | 'play' | 'ended';
  mapId: string;
  isHost: boolean;
  yourSeatIndex: number | null;
  yourCodename: string | null;
  you: { codename: string; role: 'crew' | 'eve'; alive: boolean } | null;
  seats: SeatView[];
  keyProgress: number;
  channelNoise: number;
  killCooldown: number;
  canKillNow: boolean;
  crisis: { kind: CrisisKind; secondsLeft: number; held: number; required: number } | null;
  meeting: {
    reason: { kind: 'body'; victim: string; reporter: string } | { kind: 'alarm'; caller: string };
    secondsLeft: number;
    votes: Record<string, string>;
    yourVote: string | null;
    result: { ejected: string | null; wasEve: boolean } | null;
  } | null;
  outcome: (GameState['outcome'] & { youWon: boolean }) | null;
}

export function getState(db: Db, code: string, user: UserRow): RoomStateView {
  const g = getGame(db, code);
  const seats = getSeats(db, g.id);
  const mySeat = seatForUser(db, g.id, user.id);
  const isHost = g.host_user_id === user.id;

  const seatViews: SeatView[] = seats.map((s) => ({
    codename: s.codename,
    kind: s.kind,
    // Alive/role come from game state once play has started; lobby seats are trivially "alive".
    alive: true,
    isYou: mySeat?.seat_index === s.seat_index,
    x: s.x,
    z: s.z,
    facing: s.facing,
    walking: Boolean(s.walking),
  }));

  const base: RoomStateView = {
    code: g.code,
    phase: g.phase,
    mapId: g.map_id,
    isHost,
    yourSeatIndex: mySeat?.seat_index ?? null,
    yourCodename: mySeat?.codename ?? null,
    you: null,
    seats: seatViews,
    keyProgress: 0,
    channelNoise: 0,
    killCooldown: 0,
    canKillNow: false,
    crisis: null,
    meeting: null,
    outcome: null,
  };

  if (g.phase === 'lobby' || !mySeat) return base;

  const s = state(g);
  const me = s.operatives.find((o) => o.id === mySeat.codename);
  if (!me) return base;

  base.you = { codename: me.id, role: me.role, alive: me.alive };
  base.seats = seatViews.map((sv) => {
    const op = s.operatives.find((o) => o.id === sv.codename);
    return { ...sv, alive: op?.alive ?? sv.alive };
  });
  base.keyProgress = s.keyProgress;
  base.channelNoise = s.channelNoise;
  base.killCooldown = s.killCooldown;
  base.canKillNow = me.role === 'eve' && me.alive && s.phase === 'play' && s.killCooldown <= 0;
  if (s.crisis) {
    base.crisis = { kind: s.crisis.kind, secondsLeft: Math.max(0, Math.ceil(s.crisis.secondsLeft)), held: s.crisis.held.length, required: s.crisis.required.length };
  }
  if (s.meeting) {
    base.meeting = {
      reason: s.meeting.reason,
      secondsLeft: Math.max(0, Math.ceil(s.meeting.secondsLeft)),
      votes: s.meeting.votes,
      yourVote: s.meeting.votes[me.id] ?? null,
      result: s.meeting.result,
    };
  }
  if (s.outcome) {
    base.outcome = { ...s.outcome, youWon: s.outcome.winner === me.role };
  }
  return base;
}

/** A player reports their own current position/facing/walking each poll tick.
 * The host may also puppeteer any 'computer' seat (bot fill-ins), since bot AI
 * runs client-side and someone has to drive it for everyone else to see. */
export function updatePosition(
  db: Db,
  code: string,
  user: UserRow,
  updates: { seatIndex: number; x: number; z: number; facing: number; walking: boolean }[]
): void {
  const g = getGame(db, code);
  const mySeat = seatForUser(db, g.id, user.id);
  const isHost = g.host_user_id === user.id;
  const stmt = db.prepare(
    'UPDATE heist_game_seats SET x = ?, z = ?, facing = ?, walking = ?, last_seen = CURRENT_TIMESTAMP WHERE game_id = ? AND seat_index = ?'
  );
  for (const u of updates) {
    const seat = seatAt(db, g.id, u.seatIndex);
    if (!seat) continue;
    const allowed = seat.user_id === user.id || (isHost && seat.kind === 'computer');
    if (!allowed) continue;
    stmt.run(u.x, u.z, u.facing, u.walking ? 1 : 0, g.id, u.seatIndex);
  }
  void mySeat;
}

export type HeistAction =
  | { type: 'completeTask' }
  | { type: 'kill'; targetCodename: string; at: { x: number; z: number } }
  | { type: 'reportBody'; victimCodename: string }
  | { type: 'emergency' }
  | { type: 'vote'; accused: string }
  | { type: 'sabotage'; kind: CrisisKind; consoleIds: string[] }
  | { type: 'holdConsole'; consoleId: string }
  | { type: 'tick'; dt: number };

export function submitAction(db: Db, code: string, user: UserRow, action: HeistAction, totalTasks: number): RoomStateView {
  const g = getGame(db, code);
  if (g.phase !== 'play') throw new HeistError('room is not in play', 409);
  const mySeat = seatForUser(db, g.id, user.id);
  if (!mySeat) throw new HeistError('not seated in this room', 403);

  let s = state(g);

  switch (action.type) {
    case 'completeTask':
      s = completeTask(s, totalTasks);
      break;
    case 'kill':
      if (!canCompromise(s, mySeat.codename, action.targetCodename)) throw new HeistError('cannot compromise that operative', 409);
      s = compromise(s, action.targetCodename, action.at);
      break;
    case 'reportBody':
      s = reportBody(s, action.victimCodename, mySeat.codename);
      break;
    case 'emergency':
      s = callEmergency(s, mySeat.codename);
      break;
    case 'vote':
      s = castVote(s, mySeat.codename, action.accused);
      if (votingComplete(s)) s = resolveMeeting(s);
      break;
    case 'sabotage':
      s = startCrisis(s, action.kind, action.consoleIds);
      break;
    case 'holdConsole':
      s = holdCrisisConsole(s, action.consoleId);
      break;
    case 'tick':
      s = tickCrisis(s, action.dt);
      s = tickCooldown(s, action.dt);
      break;
  }

  setState(db, g.id, s);
  if (s.phase === 'ended') {
    db.prepare("UPDATE heist_games SET phase = 'ended', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(g.id);
  }
  return getState(db, code, user);
}

export function aliveCodenames(db: Db, code: string): string[] {
  const g = getGame(db, code);
  if (g.phase === 'lobby') return [];
  return aliveOf(state(g)).map((o) => o.id);
}
