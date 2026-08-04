/**
 * Quantum Heist rules — the Among Us loop, told in QKD.
 *
 * Six operatives are building a shared quantum key. One is secretly Eve.
 *
 *  - Crew "tasks" are the real BB84 steps; finishing them all establishes the
 *    key and wins the shift.
 *  - Eve doesn't stab anyone: she **compromises** an operative's key share,
 *    burning them out of the exchange. They leave a corrupted node behind.
 *  - Finding a corrupted node (or hitting the alarm) calls everyone in to argue
 *    and vote. Eject the wrong person and you've just lost a key holder.
 *  - Eve can also **sabotage the channel** — timed crises the crew has to run
 *    and fix, or the exchange collapses.
 *
 * Everything here is pure and rng-injectable so the whole game is testable
 * without a renderer.
 */

export type Phase = 'briefing' | 'play' | 'meeting' | 'ended';
export type Role = 'crew' | 'eve';

export type CrisisKind = 'decoherence' | 'blackout' | 'keypurge';

export const CODENAMES = [
  'Cyan',
  'Amber',
  'Violet',
  'Coral',
  'Slate',
  'Moss',
] as const;

export const CREW_SIZE = 6;
export const KILL_COOLDOWN = 22;
export const MEETING_SECONDS = 45;
export const EMERGENCY_PER_PLAYER = 1;

/** How close Eve must be to compromise someone. */
export const REACH = 1.8;

export interface Operative {
  id: string;
  role: Role;
  alive: boolean;
  isYou: boolean;
}

export interface CorruptedNode {
  /** Codename of the operative who was compromised. */
  id: string;
  x: number;
  z: number;
  reported: boolean;
}

export interface Crisis {
  kind: CrisisKind;
  secondsLeft: number;
  /** Station ids that must be held to clear it. */
  required: string[];
  held: string[];
}

export interface MeetingState {
  reason: { kind: 'body'; victim: string; reporter: string } | { kind: 'alarm'; caller: string };
  secondsLeft: number;
  /** voterId -> accused codename, or 'skip'. */
  votes: Record<string, string>;
  /** Set once voting resolves, so the UI can show the ejection beat. */
  result: {
    ejected: string | null;
    wasEve: boolean;
  } | null;
}

export interface Outcome {
  winner: 'crew' | 'eve';
  reason:
    | 'key-established'
    | 'eve-ejected'
    | 'outnumbered'
    | 'crisis-expired'
    | 'crew-eliminated';
  eveId: string;
}

export interface GameState {
  phase: Phase;
  operatives: Operative[];
  you: Operative;
  /** 0..1 — the shared key exchange. Crew wins at 1. */
  keyProgress: number;
  /** 0..1 — how much error Eve has injected. Pure signal for the crew. */
  channelNoise: number;
  crisis: Crisis | null;
  nodes: CorruptedNode[];
  meeting: MeetingState | null;
  outcome: Outcome | null;
  killCooldown: number;
  emergenciesUsed: Record<string, number>;
}

export const CRISIS_INFO: Record<CrisisKind, { label: string; blurb: string; seconds: number; consoles: number }> = {
  decoherence: {
    label: 'Decoherence surge',
    blurb: 'The channel is losing coherence. Two operatives must stabilise it from opposite ends.',
    seconds: 40,
    consoles: 2,
  },
  blackout: {
    label: 'Detector blackout',
    blurb: 'Someone cut power to the detectors. Nobody can see the consoles until it is restored.',
    seconds: 0, // no timer — it just blinds everyone until fixed
    consoles: 1,
  },
  keypurge: {
    label: 'Key purge',
    blurb: 'The sifted key buffer is being wiped. Reroute it before it empties.',
    seconds: 35,
    consoles: 1,
  },
};

export const SABOTAGE_COOLDOWN = 30;

// ---------------------------------------------------------------- setup

export function createGame(rng: () => number = Math.random): GameState {
  const eveIndex = Math.floor(rng() * CREW_SIZE);
  const youIndex = Math.floor(rng() * CREW_SIZE);

  const operatives: Operative[] = CODENAMES.slice(0, CREW_SIZE).map((id, i) => ({
    id,
    role: i === eveIndex ? 'eve' : 'crew',
    alive: true,
    isYou: i === youIndex,
  }));

  return {
    phase: 'briefing',
    operatives,
    you: operatives[youIndex],
    keyProgress: 0,
    channelNoise: 0,
    crisis: null,
    nodes: [],
    meeting: null,
    outcome: null,
    killCooldown: KILL_COOLDOWN,
    emergenciesUsed: {},
  };
}

export const eveOf = (s: GameState): Operative => s.operatives.find((o) => o.role === 'eve')!;
export const aliveOf = (s: GameState): Operative[] => s.operatives.filter((o) => o.alive);
export const aliveCrew = (s: GameState): Operative[] => aliveOf(s).filter((o) => o.role === 'crew');
export const aliveEve = (s: GameState): Operative[] => aliveOf(s).filter((o) => o.role === 'eve');

/** Ghosts keep working — they just can't talk or vote. */
export const canVote = (s: GameState, id: string): boolean =>
  !!s.operatives.find((o) => o.id === id && o.alive);

// ---------------------------------------------------------------- win checks

/**
 * The single source of truth for "is it over". Called after every state change
 * so no path can leave the game running past its end.
 */
export function checkOutcome(s: GameState): Outcome | null {
  const eve = eveOf(s);

  if (s.keyProgress >= 1) return { winner: 'crew', reason: 'key-established', eveId: eve.id };
  if (!eve.alive) return { winner: 'crew', reason: 'eve-ejected', eveId: eve.id };

  const crew = aliveCrew(s).length;
  const impostors = aliveEve(s).length;

  if (crew === 0) return { winner: 'eve', reason: 'crew-eliminated', eveId: eve.id };
  if (impostors > 0 && crew <= impostors) return { winner: 'eve', reason: 'outnumbered', eveId: eve.id };

  return null;
}

function settle(s: GameState): GameState {
  const outcome = checkOutcome(s);
  return outcome ? { ...s, phase: 'ended', outcome } : s;
}

// ---------------------------------------------------------------- tasks

/**
 * Completing a console advances the shared key. Ghosts still count — that's
 * the crew's comeback route when they're losing bodies.
 */
export function completeTask(s: GameState, totalTasks: number): GameState {
  if (s.phase !== 'play') return s;
  const step = 1 / Math.max(1, totalTasks);
  return settle({ ...s, keyProgress: Math.min(1, s.keyProgress + step) });
}

// ---------------------------------------------------------------- compromise

export function canCompromise(s: GameState, actorId: string, targetId: string): boolean {
  if (s.phase !== 'play' || s.killCooldown > 0) return false;
  const actor = s.operatives.find((o) => o.id === actorId);
  const target = s.operatives.find((o) => o.id === targetId);
  return !!actor && !!target && actor.role === 'eve' && actor.alive && target.alive && target.role === 'crew';
}

export function compromise(s: GameState, targetId: string, at: { x: number; z: number }): GameState {
  const target = s.operatives.find((o) => o.id === targetId);
  if (!target || !target.alive) return s;

  const next: GameState = {
    ...s,
    operatives: s.operatives.map((o) => (o.id === targetId ? { ...o, alive: false } : o)),
    nodes: [...s.nodes, { id: targetId, x: at.x, z: at.z, reported: false }],
    killCooldown: KILL_COOLDOWN,
    // Burning a key share leaves a detectable scar on the channel.
    channelNoise: Math.min(1, s.channelNoise + 0.18),
  };
  return settle(next);
}

// ---------------------------------------------------------------- meetings

export function reportBody(s: GameState, victimId: string, reporterId: string): GameState {
  if (s.phase !== 'play') return s;
  const node = s.nodes.find((n) => n.id === victimId && !n.reported);
  if (!node) return s;

  return {
    ...s,
    phase: 'meeting',
    nodes: s.nodes.map((n) => (n.id === victimId ? { ...n, reported: true } : n)),
    crisis: null, // a meeting cancels any running sabotage
    meeting: {
      reason: { kind: 'body', victim: victimId, reporter: reporterId },
      secondsLeft: MEETING_SECONDS,
      votes: {},
      result: null,
    },
  };
}

export function callEmergency(s: GameState, callerId: string): GameState {
  if (s.phase !== 'play' || s.crisis) return s;
  const used = s.emergenciesUsed[callerId] ?? 0;
  if (used >= EMERGENCY_PER_PLAYER) return s;
  const caller = s.operatives.find((o) => o.id === callerId);
  if (!caller?.alive) return s;

  return {
    ...s,
    phase: 'meeting',
    emergenciesUsed: { ...s.emergenciesUsed, [callerId]: used + 1 },
    meeting: {
      reason: { kind: 'alarm', caller: callerId },
      secondsLeft: MEETING_SECONDS,
      votes: {},
      result: null,
    },
  };
}

export function castVote(s: GameState, voterId: string, accused: string): GameState {
  if (s.phase !== 'meeting' || !s.meeting || s.meeting.result) return s;
  if (!canVote(s, voterId)) return s;
  if (s.meeting.votes[voterId]) return s;
  return { ...s, meeting: { ...s.meeting, votes: { ...s.meeting.votes, [voterId]: accused } } };
}

/** True once every living operative has voted. */
export function votingComplete(s: GameState): boolean {
  if (!s.meeting) return false;
  return aliveOf(s).every((o) => !!s.meeting!.votes[o.id]);
}

/**
 * Tally and eject. A tie — or a skip majority — ejects nobody, which is a win
 * for Eve in the sense that she keeps her numbers.
 */
export function resolveMeeting(s: GameState): GameState {
  if (s.phase !== 'meeting' || !s.meeting) return s;

  const counts: Record<string, number> = {};
  for (const v of Object.values(s.meeting.votes)) counts[v] = (counts[v] ?? 0) + 1;

  let top: string | null = null;
  let best = 0;
  let tied = false;
  for (const [id, n] of Object.entries(counts)) {
    if (n > best) {
      best = n;
      top = id;
      tied = false;
    } else if (n === best) {
      tied = true;
    }
  }

  const ejected = tied || top === 'skip' || top === null ? null : top;
  const wasEve = !!ejected && s.operatives.find((o) => o.id === ejected)?.role === 'eve';

  const afterEject: GameState = {
    ...s,
    operatives: ejected ? s.operatives.map((o) => (o.id === ejected ? { ...o, alive: false } : o)) : s.operatives,
    meeting: { ...s.meeting, result: { ejected, wasEve } },
  };

  const outcome = checkOutcome(afterEject);
  if (outcome) return { ...afterEject, phase: 'ended', outcome };

  return { ...afterEject, phase: 'play', killCooldown: KILL_COOLDOWN };
}

// ---------------------------------------------------------------- sabotage

export function startCrisis(s: GameState, kind: CrisisKind, consoleIds: string[]): GameState {
  if (s.phase !== 'play' || s.crisis) return s;
  const info = CRISIS_INFO[kind];
  return {
    ...s,
    crisis: {
      kind,
      secondsLeft: info.seconds,
      required: consoleIds.slice(0, info.consoles),
      held: [],
    },
    channelNoise: Math.min(1, s.channelNoise + 0.1),
  };
}

/** Standing at a required console registers a hold; all held clears the crisis. */
export function holdCrisisConsole(s: GameState, consoleId: string): GameState {
  if (!s.crisis || !s.crisis.required.includes(consoleId) || s.crisis.held.includes(consoleId)) return s;
  const held = [...s.crisis.held, consoleId];
  if (held.length >= s.crisis.required.length) {
    // Fixed. Clearing a sabotage also scrubs some of the injected noise.
    return { ...s, crisis: null, channelNoise: Math.max(0, s.channelNoise - 0.08) };
  }
  return { ...s, crisis: { ...s.crisis, held } };
}

/** Advance a running crisis. An expired timed crisis ends the game for the crew. */
export function tickCrisis(s: GameState, dt: number): GameState {
  if (!s.crisis || s.phase !== 'play') return s;
  if (CRISIS_INFO[s.crisis.kind].seconds === 0) return s; // blackout has no timer

  const secondsLeft = s.crisis.secondsLeft - dt;
  if (secondsLeft <= 0) {
    return {
      ...s,
      crisis: { ...s.crisis, secondsLeft: 0 },
      phase: 'ended',
      outcome: { winner: 'eve', reason: 'crisis-expired', eveId: eveOf(s).id },
    };
  }
  return { ...s, crisis: { ...s.crisis, secondsLeft } };
}

export function tickCooldown(s: GameState, dt: number): GameState {
  if (s.phase !== 'play' || s.killCooldown <= 0) return s;
  return { ...s, killCooldown: Math.max(0, s.killCooldown - dt) };
}

// ---------------------------------------------------------------- bot AI

/**
 * Who a bot votes for. Crew bots weigh suspicion (proximity to bodies and to
 * the fiber); Eve votes for whoever is most suspicious *of her*, or skips to
 * keep her head down.
 */
export function botVote(
  s: GameState,
  voterId: string,
  suspicion: Record<string, number>,
  rng: () => number = Math.random
): string {
  const voter = s.operatives.find((o) => o.id === voterId);
  if (!voter) return 'skip';

  const candidates = aliveOf(s).filter((o) => o.id !== voterId);
  if (candidates.length === 0) return 'skip';

  if (voter.role === 'eve') {
    // Eve throws suspicion at the loudest accuser, or skips when it's quiet.
    if (rng() < 0.35) return 'skip';
    const crew = candidates.filter((c) => c.role === 'crew');
    if (crew.length === 0) return 'skip';
    return crew[Math.floor(rng() * crew.length)].id;
  }

  const scored = candidates.map((c) => ({ id: c.id, score: (suspicion[c.id] ?? 0) + rng() * 15 }));
  scored.sort((a, b) => b.score - a.score);
  // With nothing to go on, crew abstain rather than lynch at random.
  if (scored[0].score < 12) return 'skip';
  return scored[0].id;
}
