/**
 * Ported from quantumbreach/qkd/service.py — the multiplayer QKD ("Quantum
 * Intercept") session/phase state machine. Alice, Bob, and Eve join a game
 * by a 4-letter code; the server drives phases forward (alice_setup ->
 * eve_move -> bob_decision -> resolve -> [next round] -> accusation ->
 * ended), resolving each round with the same BB84 engine every client polls
 * against via GET /api/qkd/game/:code.
 *
 * Not ported: the file-heist upload/reveal layer (quantumbreach/qkd/files.py)
 * — Eve's botnet-crack scoring (fileCracked/HEIST_BONUS) is kept since it's
 * pure game math, but there's no literal file content to attach it to.
 */
import type { Db } from './serverDb';
import type { UserRow } from './serverIdentity';
import { awardBadge } from './roomProgress';
import {
  classifyErrorShape,
  computerStrategy,
  resolveRound,
  scoreRound,
  type Decision,
  type ErrorShape,
  type EveTap,
  type Role,
  type RoundResult,
} from './qkdEngine';
import { crackableWithin, ROUND_WINDOW } from './qkdBotnet';

export const ROLES: Role[] = ['alice', 'bob', 'eve'];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
const CODENAMES = ['Node-Cyan', 'Node-Amber', 'Node-Violet', 'Node-Coral', 'Node-Slate', 'Node-Gold'];
const ROUNDS = 3; // rounds per game (tunable)
const TIMEOUT_SECONDS = 60;

export class GameError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

interface GameRow {
  id: number;
  code: string;
  phase: string;
  round: number;
  config: string;
  created_at: string;
  updated_at: string;
}

interface SeatRow {
  game_id: number;
  role: Role;
  kind: 'human' | 'computer';
  user_id: number | null;
  display_name: string | null;
  action: string | null;
  score: number;
}

type EveAction =
  | { method: 'tap'; workers: number; taps: EveTap[] }
  | { method: 'spoof'; workers: number; start: number; len: number; basis: '+' | 'x' }
  | { method: 'bruteforce'; workers: number }
  | { method: 'computer_random'; workers: number; p: number };

interface AliceAction {
  n: number;
  s: number;
}

interface GameConfig {
  anon?: Partial<Record<Role, string>>;
  alice?: AliceAction;
  eve?: EveAction;
  result?: RoundResult;
  lastResult?: {
    eveHit: boolean;
    sampleQBER: number;
    finalKey: number;
    stolen: number;
    sifted: number;
    bobDecision: Decision;
    aliceConfig: AliceAction;
    eveConfig: EveAction;
    perRole: Record<Role, number>;
    round: number;
    errorShape: ErrorShape;
    replay: {
      n: number;
      aBases: string[];
      bBases: string[];
      eveTaps: EveTap[];
      sampleIndices: number[];
      sampleErrors: boolean[];
    };
  };
  history?: { round: number; sampleQBER: number; errorShape: ErrorShape; eveHit: boolean; method: string }[];
  accusationResult?: { aliceAccused: string; bobAccused: string; eveCodename: string; crewWon: boolean };
  reveal?: Record<Role, { name: string | null; kind: string; codename?: string }>;
}

function newCode(db: Db): string {
  for (let i = 0; i < 20; i++) {
    let code = '';
    for (let j = 0; j < 4; j++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!db.prepare('SELECT 1 FROM qkd_games WHERE code = ?').get(code)) return code;
  }
  throw new GameError('could not allocate a game code', 500);
}

function getGame(db: Db, code: string): GameRow {
  const g = db.prepare('SELECT * FROM qkd_games WHERE code = ?').get(code.toUpperCase()) as GameRow | undefined;
  if (!g) throw new GameError('no such game', 404);
  return g;
}

function getSeats(db: Db, gameId: number): SeatRow[] {
  return db.prepare('SELECT * FROM qkd_game_seats WHERE game_id = ? ORDER BY role').all(gameId) as SeatRow[];
}

function seatForUser(db: Db, gameId: number, userId: number): SeatRow | undefined {
  return db.prepare('SELECT * FROM qkd_game_seats WHERE game_id = ? AND user_id = ?').get(gameId, userId) as
    | SeatRow
    | undefined;
}

function seatFor(db: Db, gameId: number, role: Role): SeatRow {
  return db.prepare('SELECT * FROM qkd_game_seats WHERE game_id = ? AND role = ?').get(gameId, role) as SeatRow;
}

function config(g: GameRow): GameConfig {
  return g.config ? JSON.parse(g.config) : {};
}

function setConfig(db: Db, gameId: number, cfg: GameConfig): void {
  db.prepare('UPDATE qkd_games SET config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    JSON.stringify(cfg),
    gameId
  );
}

/** Atomically sets a seat's action only if still unset. Returns true if this call claimed it. */
function claimAction(db: Db, gameId: number, role: Role, action: unknown): boolean {
  const info = db
    .prepare('UPDATE qkd_game_seats SET action = ? WHERE game_id = ? AND role = ? AND action IS NULL')
    .run(JSON.stringify(action), gameId, role);
  return info.changes === 1;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface CreateResult {
  code: string;
  role: Role;
}

export function createGame(db: Db, user: UserRow, role: unknown): CreateResult {
  if (!ROLES.includes(role as Role)) throw new GameError('bad role');
  const code = newCode(db);
  const codenames = shuffle(CODENAMES).slice(0, ROLES.length);
  const anon: Partial<Record<Role, string>> = {};
  ROLES.forEach((r, i) => (anon[r] = codenames[i]));

  const info = db
    .prepare("INSERT INTO qkd_games (code, phase, round, config) VALUES (?, 'lobby', 0, ?)")
    .run(code, JSON.stringify({ anon }));
  const gid = Number(info.lastInsertRowid);
  for (const r of ROLES) {
    if (r === role) {
      db.prepare(
        "INSERT INTO qkd_game_seats (game_id, role, kind, user_id, display_name) VALUES (?, ?, 'human', ?, ?)"
      ).run(gid, r, user.id, user.display_name);
    } else {
      db.prepare(
        "INSERT INTO qkd_game_seats (game_id, role, kind, display_name) VALUES (?, ?, 'computer', 'Computer')"
      ).run(gid, r);
    }
  }
  return { code, role: role as Role };
}

export function joinGame(db: Db, code: string, user: UserRow, role: unknown): CreateResult {
  if (!ROLES.includes(role as Role)) throw new GameError('bad role');
  const g = getGame(db, code);
  if (g.phase !== 'lobby') throw new GameError('game already started', 409);
  if (seatForUser(db, g.id, user.id)) throw new GameError('already seated in this game', 409);
  const info = db
    .prepare(
      "UPDATE qkd_game_seats SET kind = 'human', user_id = ?, display_name = ? WHERE game_id = ? AND role = ? AND kind = 'computer'"
    )
    .run(user.id, user.display_name, g.id, role as Role);
  if (info.changes === 0) throw new GameError('role already taken', 409);
  return { code: g.code, role: role as Role };
}

export function startGame(db: Db, code: string): GameStateView {
  const g = getGame(db, code);
  if (g.phase === 'lobby') {
    const info = db
      .prepare(
        "UPDATE qkd_games SET phase = 'alice_setup', round = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND phase = 'lobby'"
      )
      .run(g.id);
    if (info.changes === 1) {
      db.prepare('UPDATE qkd_game_seats SET action = NULL WHERE game_id = ?').run(g.id);
      advance(db, getGame(db, code));
    }
  }
  return gameState(db, code, null);
}

export interface SeatView {
  role?: Role;
  kind?: string;
  name?: string | null;
  codename?: string;
  submitted: boolean;
}

export interface GameStateView {
  code: string;
  phase: string;
  round: number;
  yourRole: Role | null;
  seats: SeatView[];
  roundsTotal: number;
  youAreUpNow: boolean;
  scores?: { role: Role; name: string | null; score: number }[];
  roundsCompleted?: number;
  sampleQBER?: number;
  errorShape?: ErrorShape;
  history?: GameConfig['history'];
  lastResult?: unknown;
  accusationResult?: GameConfig['accusationResult'];
  reveal?: GameConfig['reveal'];
}

function isUp(phase: string, role: Role | null, seats: SeatRow[]): boolean {
  if (role === null) return false;
  const need = ({ alice_setup: 'alice', eve_move: 'eve', bob_decision: 'bob' } as Record<string, Role>)[phase];
  if (need && need === role) {
    const byRole = Object.fromEntries(seats.map((s) => [s.role, s]));
    return byRole[role].action === null;
  }
  if (phase === 'accusation') {
    const byRole = Object.fromEntries(seats.map((s) => [s.role, s]));
    return byRole[role].action === null;
  }
  return phase === 'resolve'; // any human may advance to the next round
}

export function gameState(db: Db, code: string, user: UserRow | null): GameStateView {
  maybeTimeout(db, getGame(db, code));
  const g = getGame(db, code);
  const seats = getSeats(db, g.id);
  const your = user ? seatForUser(db, g.id, user.id) : undefined;
  const yourRole = your?.role ?? null;
  const cfg = config(g);
  const anon = cfg.anon ?? {};
  const revealAll = g.phase === 'ended';

  const seatViews: SeatView[] = seats.map((s) => {
    if (s.role === yourRole || revealAll) {
      return { role: s.role, kind: s.kind, name: s.display_name, submitted: s.action !== null };
    }
    return { codename: anon[s.role] ?? s.role, submitted: s.action !== null };
  });

  const view: GameStateView = {
    code: g.code,
    phase: g.phase,
    round: g.round,
    yourRole,
    seats: seatViews,
    roundsTotal: ROUNDS,
    youAreUpNow: isUp(g.phase, yourRole, seats),
  };

  if (revealAll) {
    view.scores = seats.map((s) => ({ role: s.role, name: s.display_name, score: s.score }));
  } else {
    view.roundsCompleted = (cfg.history ?? []).length;
  }

  // Alice and Bob both see the round's evidence during Bob's decision (Eve never does).
  if (g.phase === 'bob_decision' && (yourRole === 'alice' || yourRole === 'bob') && cfg.result) {
    view.sampleQBER = cfg.result.sampleQBER;
    view.errorShape = cfg.result.errorShape;
  }
  if (yourRole === 'alice' || yourRole === 'bob' || revealAll) {
    view.history = cfg.history ?? [];
  }
  if ((g.phase === 'resolve' || g.phase === 'ended') && cfg.lastResult) {
    view.lastResult = cfg.lastResult;
  }
  if (revealAll) {
    if (cfg.accusationResult) view.accusationResult = cfg.accusationResult;
    if (cfg.reveal) view.reveal = cfg.reveal;
  }
  return view;
}

function cleanAction(role: Role, action: Record<string, unknown>): AliceAction | EveAction | { decision: Decision } {
  if (role === 'alice') {
    const n = Math.max(8, Math.min(64, Math.trunc(Number(action.n ?? 24))));
    const s = Math.max(0, Math.min(n, Math.trunc(Number(action.s ?? 6))));
    if (Number.isNaN(n) || Number.isNaN(s)) throw new GameError('bad action', 400);
    return { n, s };
  }
  if (role === 'eve') {
    const rawMethod = action.method;
    const method: 'tap' | 'spoof' | 'bruteforce' =
      rawMethod === 'tap' || rawMethod === 'spoof' || rawMethod === 'bruteforce' ? rawMethod : 'bruteforce';
    const workers = Math.max(0, Math.min(100, Math.trunc(Number(action.workers ?? 0) || 0)));
    if (method === 'tap') {
      const raw = Array.isArray(action.taps) ? action.taps : [];
      const seen = new Set<number>();
      const taps: EveTap[] = [];
      for (const t of raw.slice(0, 512)) {
        if (typeof t !== 'object' || t === null) continue;
        const b = (t as Record<string, unknown>).basis;
        const idx = Math.trunc(Number((t as Record<string, unknown>).i));
        if ((b === '+' || b === 'x') && Number.isFinite(idx) && idx >= 0 && idx < 512 && !seen.has(idx)) {
          seen.add(idx);
          taps.push({ i: idx, basis: b });
        }
        if (taps.length >= 128) break;
      }
      return { method: 'tap', workers, taps };
    }
    if (method === 'spoof') {
      const start = Math.max(0, Math.trunc(Number(action.start ?? 0)) || 0);
      const len = Math.max(1, Math.min(512, Math.trunc(Number(action.len ?? 1)) || 1));
      const basisVal = action.basis === '+' || action.basis === 'x' ? action.basis : '+';
      return { method: 'spoof', workers, start, len, basis: basisVal };
    }
    return { method: 'bruteforce', workers };
  }
  return { decision: action.decision === 'abort' ? 'abort' : 'keep' };
}

export function submitAction(db: Db, code: string, user: UserRow, action: unknown): GameStateView {
  const g = getGame(db, code);
  const seat = seatForUser(db, g.id, user.id);
  if (!seat) throw new GameError('not seated in this game', 403);
  if (typeof action !== 'object' || action === null) throw new GameError('bad action', 400);
  const role = seat.role;
  const phase = g.phase;

  if (phase === 'resolve') {
    if ((action as Record<string, unknown>).next) nextRound(db, g);
    return gameState(db, code, user);
  }

  if (phase === 'accusation') {
    if (seat.action !== null) return gameState(db, code, user); // idempotent: already voted
    const cfg = config(g);
    const guess = cleanAccusation(role, action as Record<string, unknown>, cfg);
    claimAction(db, g.id, role, { accuse: guess });
    advanceAccusation(db, getGame(db, code));
    return gameState(db, code, user);
  }

  const expected = ({ alice_setup: 'alice', eve_move: 'eve', bob_decision: 'bob' } as Record<string, Role>)[phase];
  if (expected !== role) throw new GameError('not your turn', 409);
  if (seat.action !== null) return gameState(db, code, user); // idempotent: already submitted
  const cleaned = cleanAction(expected, action as Record<string, unknown>);
  claimAction(db, g.id, role, cleaned); // atomic; a concurrent double-submit is a no-op for the loser
  advance(db, getGame(db, code));
  return gameState(db, code, user);
}

function computerPublic(cfg: GameConfig, phase: string): { sampleQBER?: number } {
  if (phase === 'bob_decision' && cfg.result) return { sampleQBER: cfg.result.sampleQBER };
  return {};
}

/**
 * Drives the phase machine as far as computer seats allow, resolving when a
 * human's action (or a computer's synthesized one) completes each step.
 * Every phase transition is a guarded UPDATE (WHERE phase=<current>), so
 * under concurrent requests at most one performs each non-idempotent step;
 * a loser re-reads the advanced state and returns.
 */
function advance(db: Db, game: GameRow): void {
  for (let iter = 0; iter < 6; iter++) {
    // bounded: at most a few transitions per call
    const g = getGame(db, game.code);
    const phase = g.phase;
    const cfg = config(g);
    if (phase === 'lobby' || phase === 'resolve' || phase === 'ended') return;
    const expected = ({ alice_setup: 'alice', eve_move: 'eve', bob_decision: 'bob' } as Record<string, Role>)[phase];
    const seat = seatFor(db, g.id, expected);
    if (seat.action === null) {
      if (seat.kind === 'computer') {
        claimAction(db, g.id, expected, computerStrategy(expected, computerPublic(cfg, phase), Math.random));
      } else {
        return; // waiting on a human
      }
    }
    const act = JSON.parse(seatFor(db, g.id, expected).action!) as Record<string, unknown>;

    if (phase === 'alice_setup') {
      cfg.alice = { n: Math.trunc(Number(act.n ?? 24)), s: Math.trunc(Number(act.s ?? 6)) };
      const info = db
        .prepare(
          "UPDATE qkd_games SET config = ?, phase = 'eve_move', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND phase = 'alice_setup'"
        )
        .run(JSON.stringify(cfg), g.id);
      if (info.changes === 0) continue; // another request already advanced this phase
    } else if (phase === 'eve_move') {
      const n = cfg.alice!.n;
      const method = (act.method as string) || 'bruteforce';
      const workers = Math.trunc(Number(act.workers ?? 0) || 0);
      const resolveCfg: { n: number; s: number; p?: number; eveTaps?: EveTap[] } = { n, s: cfg.alice!.s };
      let eveCfg: EveAction;
      if (method === 'computer_random') {
        const p = Number(act.p ?? 0) || 0;
        eveCfg = { method: 'computer_random', workers, p };
        resolveCfg.p = p;
      } else if (method === 'tap') {
        const taps = (act.taps as EveTap[]) || [];
        eveCfg = { method: 'tap', workers, taps };
        resolveCfg.p = 0;
        resolveCfg.eveTaps = taps;
      } else if (method === 'spoof') {
        const start = Math.max(0, Math.min(n - 1, Math.trunc(Number(act.start ?? 0))));
        const len = Math.max(1, Math.min(n - start, Math.trunc(Number(act.len ?? 1))));
        const basisVal = act.basis === '+' || act.basis === 'x' ? (act.basis as '+' | 'x') : '+';
        eveCfg = { method: 'spoof', workers, start, len, basis: basisVal };
        resolveCfg.p = 0;
        resolveCfg.eveTaps = Array.from({ length: len }, (_, k) => ({ i: start + k, basis: basisVal }));
      } else {
        // bruteforce: zero qubit interception, only the botnet crack matters
        eveCfg = { method: 'bruteforce', workers };
        resolveCfg.p = 0;
      }
      cfg.eve = eveCfg;
      const result = resolveRound(resolveCfg, Math.random);
      result.errorShape = classifyErrorShape(result.n, result.sampleIndices, result.sampleErrors);
      cfg.result = result;
      const info = db
        .prepare(
          "UPDATE qkd_games SET config = ?, phase = 'bob_decision', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND phase = 'eve_move'"
        )
        .run(JSON.stringify(cfg), g.id);
      if (info.changes === 0) continue; // lost the race; our locally-computed result is discarded
    } else if (phase === 'bob_decision') {
      const decision: Decision = act.decision === 'abort' ? 'abort' : 'keep';
      resolveScoring(db, g, cfg, decision);
      return;
    }
  }
}

function resolveScoring(db: Db, g: GameRow, cfg: GameConfig, decision: Decision): void {
  const gid = g.id;
  const info = db
    .prepare("UPDATE qkd_games SET phase = 'resolve', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND phase = 'bob_decision'")
    .run(gid);
  if (info.changes === 0) return; // another request already resolved this round

  const result = cfg.result!;
  const eveWorkers = Math.trunc(Number(cfg.eve?.workers ?? 0) || 0);
  const finalKey = result.finalKey || 0;
  const fileCracked = eveWorkers > 0 && crackableWithin(finalKey, eveWorkers, ROUND_WINDOW);
  result.fileCracked = fileCracked; // scoreRound adds HEIST_BONUS on KEEP when set

  const perRole = {} as Record<Role, number>;
  for (const role of ROLES) {
    const sc = scoreRound(role, result, decision);
    perRole[role] = sc.delta;
    db.prepare('UPDATE qkd_game_seats SET score = score + ? WHERE game_id = ? AND role = ?').run(sc.delta, gid, role);
  }

  cfg.lastResult = {
    eveHit: result.eveHit,
    sampleQBER: result.sampleQBER,
    finalKey: result.finalKey,
    stolen: result.stolen,
    sifted: result.sifted,
    bobDecision: decision,
    aliceConfig: cfg.alice!,
    eveConfig: cfg.eve!,
    perRole,
    round: g.round,
    errorShape: result.errorShape ?? 'none',
    // secrecy-safe replay: public BB84 info only (all bases + sampled errors + Eve's
    // taps). Raw key bits are never included (resolveRound never returns bit arrays).
    replay: {
      n: result.n,
      aBases: result.aBases,
      bBases: result.bBases,
      eveTaps: cfg.eve?.method === 'tap' ? cfg.eve.taps : [],
      sampleIndices: result.sampleIndices,
      sampleErrors: result.sampleErrors,
    },
  };
  cfg.history = cfg.history ?? [];
  cfg.history.push({
    round: g.round,
    sampleQBER: result.sampleQBER,
    errorShape: result.errorShape ?? 'none',
    eveHit: result.eveHit,
    method: cfg.eve?.method ?? 'bruteforce',
  });
  setConfig(db, gid, cfg);
}

function nextRound(db: Db, g: GameRow): void {
  const gid = g.id;
  const fresh = getGame(db, g.code);
  if (fresh.phase !== 'resolve') return; // already advanced by another request
  if (fresh.round >= ROUNDS) {
    startAccusation(db, fresh);
    return;
  }
  const info = db
    .prepare("UPDATE qkd_games SET round = round + 1, phase = 'alice_setup', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND phase = 'resolve'")
    .run(gid);
  if (info.changes === 0) return; // lost the race
  db.prepare('UPDATE qkd_game_seats SET action = NULL WHERE game_id = ?').run(gid);
  const cfg = config(fresh);
  delete cfg.alice;
  delete cfg.eve;
  delete cfg.result;
  setConfig(db, gid, cfg);
  advance(db, getGame(db, g.code));
}

function startAccusation(db: Db, g: GameRow): void {
  const info = db
    .prepare("UPDATE qkd_games SET phase = 'accusation', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND phase = 'resolve'")
    .run(g.id);
  if (info.changes === 0) return; // another request already started the accusation phase
  db.prepare('UPDATE qkd_game_seats SET action = NULL WHERE game_id = ?').run(g.id);
  advanceAccusation(db, getGame(db, g.code));
}

function cleanAccusation(role: Role, action: Record<string, unknown>, cfg: GameConfig): string {
  const anon = cfg.anon ?? {};
  const valid = new Set(Object.entries(anon).filter(([k]) => k !== role).map(([, v]) => v));
  const guess = action.accuse;
  if (typeof guess !== 'string' || !valid.has(guess)) throw new GameError('bad action', 400);
  return guess;
}

function advanceAccusation(db: Db, game: GameRow): void {
  const g = getGame(db, game.code);
  if (g.phase !== 'accusation') return;
  const gid = g.id;
  const cfg = config(g);
  const anon = cfg.anon ?? {};
  for (const role of ['alice', 'bob'] as const) {
    const seat = seatFor(db, gid, role);
    if (seat.action === null && seat.kind === 'computer') {
      const otherRoles = ROLES.filter((r) => r !== role);
      const guess = anon[otherRoles[Math.floor(Math.random() * otherRoles.length)]] ?? '';
      claimAction(db, gid, role, { accuse: guess });
    }
  }
  const aliceSeat = seatFor(db, gid, 'alice');
  const bobSeat = seatFor(db, gid, 'bob');
  if (aliceSeat.action !== null && bobSeat.action !== null) {
    resolveAccusation(db, g, cfg);
  }
}

function resolveAccusation(db: Db, g: GameRow, cfg: GameConfig): void {
  const gid = g.id;
  const info = db
    .prepare("UPDATE qkd_games SET phase = 'ended', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND phase = 'accusation'")
    .run(gid);
  if (info.changes === 0) return; // another request already resolved the accusation

  const anon = cfg.anon ?? {};
  const aliceAccuse = (JSON.parse(seatFor(db, gid, 'alice').action || '{}') as { accuse?: string }).accuse ?? '';
  const bobAccuse = (JSON.parse(seatFor(db, gid, 'bob').action || '{}') as { accuse?: string }).accuse ?? '';
  const eveCodename = anon.eve ?? '';
  const crewWon = aliceAccuse === eveCodename && bobAccuse === eveCodename;
  cfg.accusationResult = { aliceAccused: aliceAccuse, bobAccused: bobAccuse, eveCodename, crewWon };

  const reveal = {} as GameConfig['reveal'];
  for (const s of getSeats(db, gid)) {
    reveal![s.role] = { name: s.display_name, kind: s.kind, codename: anon[s.role] };
  }
  cfg.reveal = reveal;
  setConfig(db, gid, cfg);

  for (const s of getSeats(db, gid)) {
    if (s.kind === 'human' && s.user_id != null && s.score > 0) {
      db.prepare('INSERT INTO qkd_scores (user_id, score) VALUES (?, ?)').run(s.user_id, s.score);
      awardBadge(db, s.user_id, 'qkd-operative');
    }
  }
}

function ageSeconds(db: Db, gameId: number): number | null {
  const row = db
    .prepare("SELECT (strftime('%s','now') - strftime('%s', updated_at)) AS age FROM qkd_games WHERE id = ?")
    .get(gameId) as { age: number | null };
  return row.age;
}

function maybeTimeout(db: Db, g: GameRow): void {
  if (g.phase === 'accusation') {
    const stale = ageSeconds(db, g.id);
    if (stale !== null && stale > TIMEOUT_SECONDS) {
      const cfg = config(g);
      const anon = cfg.anon ?? {};
      let claimedAny = false;
      for (const role of ['alice', 'bob'] as const) {
        const seat = seatFor(db, g.id, role);
        if (seat.kind === 'human' && seat.action === null) {
          const otherRoles = ROLES.filter((r) => r !== role);
          const guess = anon[otherRoles[Math.floor(Math.random() * otherRoles.length)]] ?? '';
          if (claimAction(db, g.id, role, { accuse: guess })) claimedAny = true;
        }
      }
      if (claimedAny) advanceAccusation(db, getGame(db, g.code));
    }
    return;
  }
  if (g.phase !== 'alice_setup' && g.phase !== 'eve_move' && g.phase !== 'bob_decision') return;
  const stale = ageSeconds(db, g.id);
  if (stale !== null && stale > TIMEOUT_SECONDS) {
    const expected = ({ alice_setup: 'alice', eve_move: 'eve', bob_decision: 'bob' } as Record<string, Role>)[g.phase];
    const seat = seatFor(db, g.id, expected);
    if (seat.kind === 'human' && seat.action === null) {
      const cfg = config(g);
      const claimed = claimAction(
        db,
        g.id,
        expected,
        computerStrategy(expected, computerPublic(cfg, g.phase), Math.random)
      );
      if (claimed) advance(db, getGame(db, g.code)); // only the request that actually took over drives the machine
    }
  }
}
