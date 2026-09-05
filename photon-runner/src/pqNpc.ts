import type { Vec2 } from './pqScene';

/**
 * The people who work here.
 *
 * Phantom Q was a building with three painted figures in it and nobody else
 * — which reads as an evacuated building rather than a headquarters. This
 * module is the staff: some at desks all day, some walking between them,
 * and a few who do both.
 *
 * It is deliberately pure. An NPC is a position, a mode and a timer over an
 * authored route, with no canvas, no clock and no randomness that a test
 * cannot reproduce — so "does anybody walk through a desk" is a question
 * answered by `pqRooms.test.ts` rather than by staring at the screen.
 *
 * Facings are the four isometric diagonals rather than the sprite sheet's
 * forward/back/left/right, because in a 2:1 projection nobody ever walks
 * straight down the screen: every world axis lands on a diagonal. The
 * player keeps the authored sprite sheet and its own facings; the staff are
 * drawn procedurally (`pqPeople.ts`) and use these.
 */

export type IsoFacing = 'se' | 'sw' | 'ne' | 'nw';

export interface PersonLook {
  skin: string;
  hair: string;
  /** Silhouette of the hair, which is most of what reads at this size. */
  cut: 'crop' | 'bob' | 'bun' | 'tie' | 'bald';
  top: string;
  /** A second tone on the top — lanyard, open jacket, hem. */
  trim: string;
  legs: string;
  shoes: string;
}

/**
 * The staff wardrobe. Kept small and muted on purpose: the illustration is
 * a corporate floor in navy, charcoal and grey, and a cast in primary
 * colours would look pasted on. Variation comes from silhouette and value
 * rather than hue.
 */
export const LOOKS: PersonLook[] = [
  { skin: '#e0b191', hair: '#2c2622', cut: 'crop', top: '#2f3d59', trim: '#4d6187', legs: '#33383f', shoes: '#22262b' },
  { skin: '#a9714c', hair: '#191512', cut: 'bun', top: '#4a4f58', trim: '#6d7480', legs: '#2c3138', shoes: '#1e2126' },
  { skin: '#f0cdb2', hair: '#6b4b2e', cut: 'bob', top: '#5d6470', trim: '#828a97', legs: '#3a3f46', shoes: '#26292e' },
  { skin: '#8a5a3b', hair: '#141110', cut: 'crop', top: '#25365d', trim: '#3d5385', legs: '#2f343b', shoes: '#1c1f23' },
  { skin: '#e8bd9c', hair: '#8a6a41', cut: 'tie', top: '#6f7683', trim: '#9aa2af', legs: '#41464e', shoes: '#2a2d32' },
  { skin: '#c98d63', hair: '#211b16', cut: 'bob', top: '#3a4a68', trim: '#586c92', legs: '#30353c', shoes: '#202429' },
  { skin: '#f2d3ba', hair: '#3d3733', cut: 'bald', top: '#4f545c', trim: '#71777f', legs: '#383d44', shoes: '#24272c' },
  { skin: '#9c6642', hair: '#251d17', cut: 'bun', top: '#2b3a55', trim: '#47597c', legs: '#2b3037', shoes: '#1a1d21' },
  { skin: '#dfae8b', hair: '#4a3a2b', cut: 'crop', top: '#616872', trim: '#8b929c', legs: '#363b42', shoes: '#232629' },
  { skin: '#b87a52', hair: '#171310', cut: 'tie', top: '#34435f', trim: '#516488', legs: '#2e333a', shoes: '#1e2125' },
  { skin: '#efc7a8', hair: '#5c4530', cut: 'bob', top: '#545b65', trim: '#7b828d', legs: '#3d424a', shoes: '#272a2f' },
  { skin: '#7d5136', hair: '#100d0b', cut: 'crop', top: '#293857', trim: '#425579', legs: '#292e35', shoes: '#181b1f' },
];

export function lookAt(i: number): PersonLook {
  return LOOKS[((i % LOOKS.length) + LOOKS.length) % LOOKS.length];
}

export interface NpcSeat {
  /** Where their feet are while seated, in normalised screen space. */
  pos: Vec2;
  facing: IsoFacing;
  /**
   * Normalised screen y of the surface in front of them, if any. Everything
   * below it is clipped away, so a person sitting on the far side of a table
   * reads as being behind it rather than standing in it.
   */
  clipY: number | null;
  /**
   * False when the desk itself already comes with a drawn chair — a bench
   * row, where every place is furnished whether or not anyone is sitting in
   * it right now. Drawing the person's own chair on top would double it up.
   */
  chair: boolean;
}

export interface NpcDef {
  id: string;
  name: string;
  /** Index into `LOOKS`. */
  look: number;
  /** Their desk, if they have one. */
  seat: NpcSeat | null;
  /** Normalised screen waypoints. Empty means they never leave the seat. */
  path: Vec2[];
  /** Normalised screen units per second. */
  speed: number;
  /** Seconds paused at each waypoint. */
  dwell: number;
  /** Seconds spent at the desk between laps. Ignored without a seat. */
  rest: number;
  /** Occasional overheard line. */
  lines: string[];
}

export type NpcMode = 'seated' | 'walking' | 'paused';

export interface Npc {
  def: NpcDef;
  mode: NpcMode;
  pos: Vec2;
  facing: IsoFacing;
  /** Index in `def.path` currently being walked toward. */
  leg: number;
  /** +1 walking out along the path, -1 coming back. */
  dir: 1 | -1;
  /** Counts down the current pause. */
  timer: number;
  /** Step cycle, in steps. */
  phase: number;
  /** Free-running, for typing and idle sway. */
  clock: number;
  /** Currently-visible speech, if any. */
  say: string | null;
  sayFor: number;
  sayIn: number;
}

/** Stable per-id jitter, so two people on the same route do not march in
 * lockstep and a test still gets the same answer every run. */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

export function facingFromDelta(dx: number, dy: number): IsoFacing {
  const down = dy >= 0;
  const right = dx >= 0;
  if (down) return right ? 'se' : 'sw';
  return right ? 'ne' : 'nw';
}

export function createNpc(def: NpcDef): Npc {
  const seed = seedOf(def.id);
  const start = def.seat ? def.seat.pos : def.path[0] ?? { x: 0.5, y: 0.5 };
  return {
    def,
    mode: def.seat ? 'seated' : def.path.length > 1 ? 'walking' : 'paused',
    pos: { ...start },
    facing: def.seat ? def.seat.facing : 'sw',
    // A seated person's first lap starts from the beginning of the path; a
    // pure walker is already on it, heading for the second waypoint.
    leg: def.seat ? 0 : 1 % Math.max(def.path.length, 1),
    dir: 1,
    // Staggered by id, so a row of analysts does not all stand up at once.
    timer: (def.seat ? def.rest : def.dwell) * (0.35 + seed),
    phase: seed * 4,
    clock: seed * 10,
    say: null,
    sayFor: 0,
    sayIn: 6 + seed * 22,
  };
}

export function createNpcs(defs: NpcDef[]): Npc[] {
  return defs.map(createNpc);
}

/** Does this person have anywhere to go? */
function mobile(n: Npc): boolean {
  return n.def.path.length > (n.def.seat ? 0 : 1);
}

/** Where the current leg is heading. */
function targetOf(n: Npc): Vec2 {
  const { path, seat } = n.def;
  if (n.leg < 0) return seat ? seat.pos : path[0];
  if (n.leg >= path.length) return path[path.length - 1];
  return path[n.leg];
}

/** Advance to the next leg, turning round at the ends of the path. */
function advance(n: Npc): void {
  const last = n.def.path.length - 1;
  if (n.dir === 1) {
    if (n.leg < last) {
      n.leg++;
      return;
    }
    n.dir = -1;
    n.leg = last - 1;
    // A one-point path for a seated person is an errand: go there, come back.
    if (n.leg < 0) n.leg = n.def.seat ? -1 : 0;
    return;
  }
  if (n.leg > 0) {
    n.leg--;
    return;
  }
  if (n.def.seat) {
    // Walk the last step back onto the chair.
    n.leg = -1;
    return;
  }
  n.dir = 1;
  n.leg = Math.min(1, last);
}

/**
 * One frame of a person's day.
 *
 * Mutates in place: this runs for every NPC in the room every frame, and
 * allocating a fresh object per person per frame is exactly the kind of
 * garbage that shows up as a stutter every few seconds.
 */
export function updateNpc(n: Npc, dt: number): void {
  n.clock += dt;

  if (n.sayFor > 0) {
    n.sayFor -= dt;
    if (n.sayFor <= 0) n.say = null;
  } else if (n.def.lines.length) {
    n.sayIn -= dt;
    if (n.sayIn <= 0) {
      const i = Math.floor(n.clock * 7 + seedOf(n.def.id) * 13) % n.def.lines.length;
      n.say = n.def.lines[i];
      n.sayFor = 3.4;
      n.sayIn = 14 + seedOf(n.def.id) * 20;
    }
  }

  if (!mobile(n)) {
    n.mode = n.def.seat ? 'seated' : 'paused';
    return;
  }

  if (n.mode === 'seated' || n.mode === 'paused') {
    n.timer -= dt;
    if (n.timer > 0) return;
    n.mode = 'walking';
    // Leaving the desk means heading for the first waypoint again.
    if (n.leg < 0) {
      n.leg = 0;
      n.dir = 1;
    }
    return;
  }

  const to = targetOf(n);
  const dx = to.x - n.pos.x;
  const dy = to.y - n.pos.y;
  const dist = Math.hypot(dx, dy);
  const step = n.def.speed * dt;

  if (dist <= step || dist < 1e-6) {
    n.pos = { ...to };
    const backHome = n.leg < 0;
    advance(n);
    if (backHome && n.def.seat) {
      n.mode = 'seated';
      n.facing = n.def.seat.facing;
      n.timer = n.def.rest;
      n.leg = 0;
      n.dir = 1;
    } else {
      n.mode = 'paused';
      n.timer = n.def.dwell;
    }
    return;
  }

  n.pos = { x: n.pos.x + (dx / dist) * step, y: n.pos.y + (dy / dist) * step };
  n.facing = facingFromDelta(dx, dy);
  n.phase += dt * 3.6;
}

export function updateNpcs(list: Npc[], dt: number): void {
  for (const n of list) updateNpc(n, dt);
}

/** True when the walk cycle rather than the seated pose should be drawn. */
export function isWalking(n: Npc): boolean {
  return n.mode === 'walking';
}
