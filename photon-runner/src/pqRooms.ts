import {
  DEPTH_LAYERS,
  FloorGeometry,
  HOTSPOTS,
  Hotspot,
  OBSTACLES,
  OPS_FLOOR,
  SCREENS,
  SPAWN,
  backEdgeY,
  type DepthLayer,
  type Poly,
  type Vec2,
} from './pqScene';
import { DEFAULT_FRAME, IsoView, fitIso, isoNorm, isoRectPoly } from './pqIso';
import type { IsoFacing, NpcDef } from './pqNpc';

/**
 * The rest of the building.
 *
 * The Page 8 illustration draws four doors and two "TO OTHER WINGS" arrows,
 * and until now all six led nowhere: the game was one room with the word
 * "headquarters" written on the wall. This module is the other side of
 * those doors — a reception you start in, the analyst bay, a briefing room,
 * the break room, and the core the racks live in.
 *
 * The operations floor keeps its authored artwork and its hand-traced map;
 * the client's contract on that room is untouched. Every other room is
 * authored as a floor plan in metres and projected (`pqIso.ts`), so one
 * `{ x: 4, y: 3, w: 2.2, d: 1.4 }` produces the drawn desk, the polygon the
 * walk rules refuse to cross, and the seat of the person working at it.
 * Nothing is traced twice, so nothing can disagree with itself.
 */

export type RoomId = 'reception' | 'ops' | 'bullpen' | 'briefing' | 'breakroom' | 'server';

export const START_ROOM: RoomId = 'reception';

export type PropKind =
  | 'rug'
  | 'counter'
  | 'bench'
  | 'sofa'
  | 'armchair'
  | 'lowtable'
  | 'roundtable'
  | 'boardtable'
  | 'plant'
  | 'rack'
  | 'cabinet'
  | 'kitchen'
  | 'cupboard'
  | 'fridge'
  | 'printer'
  | 'cooler'
  | 'kiosk'
  | 'barrier'
  | 'chair'
  | 'wallsign'
  | 'wallscreen'
  | 'whiteboard'
  | 'entrance';

/**
 * A single piece of the room, as a box standing on the floor.
 *
 * Everything is one shape because everything needs the same three things
 * derived from it — a drawing, a footprint and a top surface — and a
 * bespoke type per furniture kind would have to answer those three
 * questions over and over.
 */
export interface Prop {
  kind: PropKind;
  /** Referenced by seats that sit behind this piece. */
  id?: string;
  /** Floor footprint, metres, from the room's far corner. */
  x: number;
  y: number;
  w: number;
  d: number;
  /** Height, and base elevation for anything hung on a wall. */
  h?: number;
  z?: number;
  /** Which way it fronts: 0 = +x, 1 = +y, 2 = -x, 3 = -y. */
  face?: 0 | 1 | 2 | 3;
  /** Blocks movement. Defaults true; rugs and wall fittings opt out. */
  solid?: boolean;
  text?: string;
  /** How many repeats to draw across the width — desk banks, rack rows. */
  units?: number;
}

export interface DoorSpec {
  to: RoomId;
  label: string;
  /** 'left' is the x = 0 wall, 'right' the y = 0 wall. */
  wall: 'left' | 'right';
  /** Centre of the opening, metres along that wall. */
  at: number;
  width?: number;
}

export interface SeatSpec {
  /** Feet, in metres. */
  x: number;
  y: number;
  facing: IsoFacing;
  /**
   * Id of a table between this seat and the camera, whose far edge hides
   * their legs — a roundtable or boardtable seat on the side facing the
   * viewer, with a table nearer the camera than they are. A desk they sit
   * in front of and face away from (a bench) is not this: nothing needs
   * hiding, since the desk is farther from the camera than they are.
   */
  behind?: string;
  /**
   * Id of the desk this seat belongs to, when that desk draws its own
   * chairs (a bench row, furnished whether occupied or not) and this
   * person's own drawn chair would otherwise double up on it. Separate from
   * `behind` because the two questions — "is a table hiding my legs" and
   * "does my desk already have a chair" — have different answers for a
   * bench seat.
   */
  deskId?: string;
}

export interface NpcSpec {
  id: string;
  name: string;
  look: number;
  seat?: SeatSpec;
  /** Waypoints in metres, walked out and back. */
  route?: [number, number][];
  /** Metres per second. Office pace, not the player's. */
  speed?: number;
  dwell?: number;
  rest?: number;
  lines?: string[];
}

export interface RoomSpec {
  id: RoomId;
  name: string;
  kicker: string;
  /** Floor size in metres. */
  w: number;
  d: number;
  wall: number;
  /** Cool grey for the machine rooms, warm office grey everywhere else. */
  palette: 'office' | 'cool';
  spawn: [number, number];
  props: Prop[];
  doors: DoorSpec[];
  people: NpcSpec[];
}

/** A door you can stand in front of and walk through. */
export interface Door {
  id: string;
  to: RoomId;
  label: string;
  /** Where the marker is drawn. */
  anchor: Vec2;
  /** Where you stand to use it, and where you arrive from the other side. */
  approach: Vec2;
  hitRadius: number;
}

/** Screens that pulse, so a still room is not a photograph. */
export interface Glow {
  poly: Poly;
  phase: number;
}

export interface Room {
  id: RoomId;
  name: string;
  kicker: string;
  art: { kind: 'image'; src: string } | { kind: 'iso'; spec: RoomSpec; view: IsoView };
  floor: FloorGeometry;
  spawn: Vec2;
  doors: Door[];
  /** Consoles. Only the operations floor has any — the game is played there. */
  hotspots: Hotspot[];
  npcs: NpcDef[];
  /** Furniture crops re-drawn over the actor. Operations floor only. */
  depthLayers: DepthLayer[];
  glows: Glow[];
}

/** How far the walkable floor is held off the walls, in metres. */
export const WALL_INSET = 0.65;

/** How far into the room you stand to use a door. */
const DOOR_APPROACH = 1.9;

const DOOR_RADIUS = 0.05;

const DEFAULT_HEIGHT: Record<PropKind, number> = {
  rug: 0.01,
  counter: 1.12,
  bench: 0.74,
  sofa: 0.82,
  armchair: 0.82,
  lowtable: 0.42,
  roundtable: 0.75,
  boardtable: 0.75,
  plant: 1.5,
  rack: 2.1,
  cabinet: 0.92,
  kitchen: 0.95,
  cupboard: 0.9,
  fridge: 1.9,
  printer: 1.1,
  cooler: 1.2,
  kiosk: 1.3,
  barrier: 1.05,
  chair: 0.9,
  wallsign: 1.25,
  wallscreen: 1.2,
  whiteboard: 1.4,
  entrance: 2.5,
};

const NON_SOLID: PropKind[] = ['rug', 'wallsign', 'wallscreen', 'whiteboard', 'entrance', 'cupboard', 'chair'];

export function propHeight(p: Prop): number {
  return p.h ?? DEFAULT_HEIGHT[p.kind];
}

export function propSolid(p: Prop): boolean {
  return p.solid ?? !NON_SOLID.includes(p.kind);
}

// ---------------------------------------------------------------------------
// Floor plans
// ---------------------------------------------------------------------------

const RECEPTION: RoomSpec = {
  id: 'reception',
  name: 'Reception',
  kicker: 'ground floor · visitor entrance',
  w: 17,
  d: 12,
  wall: 3.6,
  palette: 'office',
  spawn: [7.6, 6.4],
  props: [
    { kind: 'rug', x: 10.4, y: 5.2, w: 5.0, d: 5.4 },
    { kind: 'counter', id: 'counter', x: 2.2, y: 1.7, w: 5.2, d: 1.25, face: 1 },
    { kind: 'wallsign', x: 2.2, y: 0, w: 6.0, d: 0.16, z: 1.95, text: 'PHANTOM Q' },
    { kind: 'wallscreen', x: 0, y: 2.6, w: 0.16, d: 3.4, z: 1.5 },
    { kind: 'entrance', x: 0, y: 6.8, w: 0.22, d: 3.2 },
    { kind: 'kiosk', x: 8.5, y: 1.2, w: 0.75, d: 0.75 },
    { kind: 'barrier', x: 11.5, y: 2.5, w: 1.2, d: 0.55 },
    { kind: 'barrier', x: 14.3, y: 2.5, w: 1.2, d: 0.55 },
    { kind: 'sofa', id: 'sofaA', x: 11.1, y: 5.9, w: 3.0, d: 0.95, face: 1 },
    { kind: 'lowtable', x: 11.9, y: 7.4, w: 1.7, d: 1.2 },
    { kind: 'armchair', x: 10.8, y: 8.6, w: 1.0, d: 0.95, face: 3 },
    { kind: 'armchair', x: 14.6, y: 8.6, w: 1.0, d: 0.95, face: 3 },
    { kind: 'plant', x: 0.9, y: 4.5, w: 0.85, d: 0.85, h: 1.55 },
    { kind: 'plant', x: 15.7, y: 5.1, w: 0.85, d: 0.85, h: 1.55 },
    { kind: 'plant', x: 8.6, y: 10.2, w: 0.85, d: 0.85 },
    { kind: 'plant', x: 1.0, y: 1.0, w: 0.8, d: 0.8, h: 1.4 },
    { kind: 'cabinet', x: 4.4, y: 10.3, w: 2.4, d: 0.85 },
  ],
  doors: [{ to: 'ops', label: 'Operations Floor', wall: 'right', at: 13.5 }],
  people: [
    {
      id: 'rc-desk',
      name: 'Iris',
      look: 2,
      seat: { x: 4.6, y: 1.05, facing: 'sw', behind: 'counter' },
      lines: ['Welcome to Phantom Q.', 'Sign in at the kiosk, please.', "They're expecting you on the floor."],
    },
    {
      id: 'rc-wait-a',
      name: 'Adeyemi',
      look: 5,
      seat: { x: 11.9, y: 6.95, facing: 'sw' },
      lines: ['Half nine, they said.', 'Second time this week.'],
    },
    {
      id: 'rc-wait-b',
      name: 'Halvorsen',
      look: 10,
      seat: { x: 13.4, y: 6.95, facing: 'sw' },
      lines: ['Is the badge printer fixed?'],
    },
    {
      id: 'rc-guard',
      name: 'Okoro',
      look: 3,
      route: [
        [3.0, 4.6],
        [9.2, 4.6],
        [9.2, 9.4],
        [3.2, 9.4],
      ],
      speed: 1.15,
      dwell: 2.2,
      lines: ['Badges visible, please.'],
    },
    {
      id: 'rc-courier',
      name: 'Bassey',
      look: 9,
      route: [
        [2.6, 8.8],
        [6.6, 6.2],
        [10.4, 4.2],
        [13.5, 3.7],
        [13.5, 2.0],
      ],
      speed: 1.5,
      dwell: 1.4,
    },
    {
      id: 'rc-staff',
      name: 'Whitlock',
      look: 6,
      route: [
        [13.5, 2.2],
        [13.5, 3.7],
        [10.2, 5.0],
        [5.2, 7.0],
        [2.4, 8.6],
      ],
      speed: 1.3,
      dwell: 3.0,
    },
  ],
};

const BULLPEN: RoomSpec = {
  id: 'bullpen',
  name: 'Analyst Bay',
  kicker: 'west wing · open plan',
  w: 20,
  d: 13.5,
  wall: 3.4,
  palette: 'office',
  spawn: [9.6, 5.4],
  props: [
    { kind: 'bench', id: 'r1a', x: 2.2, y: 2.6, w: 6.0, d: 1.4, units: 3 },
    { kind: 'bench', id: 'r1b', x: 11.0, y: 2.6, w: 6.0, d: 1.4, units: 3 },
    { kind: 'bench', id: 'r2a', x: 2.2, y: 6.2, w: 6.0, d: 1.4, units: 3 },
    { kind: 'bench', id: 'r2b', x: 11.0, y: 6.2, w: 6.0, d: 1.4, units: 3 },
    { kind: 'bench', id: 'r3a', x: 2.2, y: 9.8, w: 6.0, d: 1.4, units: 3 },
    { kind: 'bench', id: 'r3b', x: 11.0, y: 9.8, w: 6.0, d: 1.4, units: 3 },
    // The right wall's door sits at x=4.0 with a wide lit sign of its own
    // (paintDoorway sizes it to the "Operations Floor" label); the whiteboard
    // is kept clear of that span rather than overlapping the door's signage.
    { kind: 'whiteboard', x: 9.0, y: 0, w: 5.0, d: 0.14, z: 1.35 },
    { kind: 'wallscreen', x: 15.0, y: 0, w: 4.4, d: 0.14, z: 1.5 },
    // Likewise on the left wall: its door (to the core, at y=5.2) carries a
    // "Cryptographic Core" sign, so the room's own plaque sits further down.
    { kind: 'wallsign', x: 0, y: 8.4, w: 0.14, d: 4.4, z: 1.9, text: 'ANALYST BAY' },
    { kind: 'printer', x: 18.2, y: 1.4, w: 1.0, d: 0.9 },
    { kind: 'cooler', x: 19.0, y: 6.0, w: 0.6, d: 0.6 },
    { kind: 'plant', x: 0.9, y: 12.0, w: 0.85, d: 0.85 },
    { kind: 'plant', x: 18.8, y: 12.1, w: 0.85, d: 0.85 },
    { kind: 'plant', x: 9.4, y: 0.9, w: 0.8, d: 0.8, h: 1.45 },
    { kind: 'cabinet', x: 5.8, y: 12.0, w: 2.2, d: 0.8 },
  ],
  doors: [
    { to: 'ops', label: 'Operations Floor', wall: 'right', at: 4.0 },
    { to: 'server', label: 'Cryptographic Core', wall: 'left', at: 5.2 },
  ],
  people: [
    { id: 'bp-1', name: 'Ferreira', look: 0, seat: { x: 3.2, y: 4.55, facing: 'ne', deskId: 'r1a' }, lines: ['Error rate is climbing.'] },
    { id: 'bp-2', name: 'Song', look: 4, seat: { x: 5.2, y: 4.55, facing: 'ne', deskId: 'r1a' } },
    { id: 'bp-3', name: 'Achterberg', look: 7, seat: { x: 7.2, y: 4.55, facing: 'ne', deskId: 'r1a' }, lines: ['Rebasing the capture.'] },
    { id: 'bp-4', name: 'Nwosu', look: 1, seat: { x: 12.0, y: 4.55, facing: 'ne', deskId: 'r1b' } },
    { id: 'bp-5', name: 'Lindqvist', look: 8, seat: { x: 16.0, y: 4.55, facing: 'ne', deskId: 'r1b' }, lines: ['Sift is done — eleven percent.'] },
    { id: 'bp-6', name: 'Baptiste', look: 11, seat: { x: 3.2, y: 8.15, facing: 'ne', deskId: 'r2a' } },
    { id: 'bp-7', name: 'Okonjo', look: 6, seat: { x: 7.2, y: 8.15, facing: 'ne', deskId: 'r2a' }, lines: ['Who has the Tuesday tap log?'] },
    { id: 'bp-8', name: 'Marchetti', look: 3, seat: { x: 14.0, y: 8.15, facing: 'ne', deskId: 'r2b' } },
    { id: 'bp-9', name: 'Dvorak', look: 9, seat: { x: 5.2, y: 11.75, facing: 'ne', deskId: 'r3a' } },
    {
      id: 'bp-print',
      name: 'Ruzicka',
      look: 2,
      seat: { x: 16.0, y: 11.75, facing: 'ne', deskId: 'r3b' },
      route: [
        [18.0, 11.9],
        [18.0, 4.6],
      ],
      speed: 1.25,
      dwell: 3.5,
      rest: 16,
      lines: ['Printer again.'],
    },
    {
      id: 'bp-walk',
      name: 'Ellery',
      look: 5,
      route: [
        [9.6, 2.4],
        [9.6, 12.3],
      ],
      speed: 1.2,
      dwell: 2.6,
    },
    {
      id: 'bp-rove',
      name: 'Sandoval',
      look: 10,
      route: [
        [18.0, 4.2],
        [18.0, 12.4],
        [9.6, 12.4],
      ],
      speed: 1.05,
      dwell: 3.2,
      lines: ['Stand-up in five.'],
    },
  ],
};

const BRIEFING: RoomSpec = {
  id: 'briefing',
  name: 'Briefing Room',
  kicker: 'north wing · situation table',
  w: 14,
  d: 10,
  wall: 3.3,
  palette: 'office',
  spawn: [7.0, 8.2],
  props: [
    { kind: 'rug', x: 3.4, y: 2.8, w: 8.0, d: 4.4 },
    { kind: 'boardtable', id: 'board', x: 4.2, y: 3.6, w: 6.2, d: 2.3 },
    { kind: 'wallscreen', x: 4.0, y: 0, w: 6.0, d: 0.16, z: 1.35, h: 1.7 },
    // Kept off the far end of the left wall, clear of the door's own sign
    // (the door sits at y=7.6 with a wide "Operations Floor" board over it).
    { kind: 'wallsign', x: 0, y: 1.0, w: 0.14, d: 3.4, z: 1.9, text: 'BRIEFING' },
    { kind: 'cabinet', x: 0.7, y: 2.6, w: 0.9, d: 3.0, face: 0 },
    { kind: 'plant', x: 12.6, y: 1.1, w: 0.85, d: 0.85, h: 1.5 },
    { kind: 'plant', x: 0.9, y: 8.2, w: 0.85, d: 0.85 },
    { kind: 'cooler', x: 12.8, y: 8.2, w: 0.6, d: 0.6 },
  ],
  doors: [{ to: 'ops', label: 'Operations Floor', wall: 'left', at: 7.6 }],
  people: [
    { id: 'bf-1', name: 'Aturu', look: 1, seat: { x: 5.0, y: 6.45, facing: 'ne' } },
    { id: 'bf-2', name: 'Weisz', look: 4, seat: { x: 6.9, y: 6.45, facing: 'ne' }, lines: ['Run it again with Eve on.'] },
    { id: 'bf-3', name: 'Oyelaran', look: 8, seat: { x: 8.8, y: 6.45, facing: 'ne' } },
    { id: 'bf-4', name: 'Kestrel', look: 5, seat: { x: 5.6, y: 3.05, facing: 'sw', behind: 'board' }, lines: ['Bases match on eleven.'] },
    { id: 'bf-5', name: 'Ibarra', look: 11, seat: { x: 8.2, y: 3.05, facing: 'sw', behind: 'board' } },
    {
      id: 'bf-lead',
      name: 'Vance',
      look: 0,
      route: [
        [5.0, 1.9],
        [9.8, 1.9],
      ],
      speed: 0.75,
      dwell: 4.5,
      lines: ['So the intercept shows up in the error rate.', 'Questions before we run it live?'],
    },
    {
      id: 'bf-late',
      name: 'Prosper',
      look: 7,
      route: [
        [2.4, 8.2],
        [7.0, 8.4],
        [11.6, 7.4],
      ],
      speed: 1.2,
      dwell: 5.5,
    },
  ],
};

const BREAKROOM: RoomSpec = {
  id: 'breakroom',
  name: 'Break Room',
  kicker: 'east wing · staff kitchen',
  w: 15,
  d: 11,
  wall: 3.3,
  palette: 'office',
  spawn: [10.6, 5.6],
  props: [
    { kind: 'kitchen', id: 'kitchen', x: 2.0, y: 0.7, w: 7.0, d: 0.85, units: 4 },
    { kind: 'cupboard', x: 2.0, y: 0, w: 7.0, d: 0.16, z: 1.6 },
    { kind: 'fridge', x: 9.4, y: 0.7, w: 1.0, d: 0.85 },
    { kind: 'roundtable', id: 't1', x: 3.4, y: 4.2, w: 1.6, d: 1.6 },
    { kind: 'roundtable', id: 't2', x: 7.6, y: 3.4, w: 1.6, d: 1.6 },
    { kind: 'roundtable', id: 't3', x: 5.6, y: 7.6, w: 1.6, d: 1.6 },
    { kind: 'sofa', id: 'sofa', x: 0.7, y: 5.2, w: 0.95, d: 3.2, face: 0 },
    { kind: 'wallsign', x: 10.8, y: 0, w: 3.2, d: 0.16, z: 1.9, text: 'BREAK ROOM' },
    { kind: 'plant', x: 13.6, y: 2.0, w: 0.85, d: 0.85, h: 1.5 },
    { kind: 'plant', x: 13.4, y: 9.2, w: 0.85, d: 0.85 },
    { kind: 'cabinet', x: 10.8, y: 9.6, w: 2.2, d: 0.8 },
  ],
  doors: [{ to: 'ops', label: 'Operations Floor', wall: 'left', at: 2.6 }],
  people: [
    { id: 'br-1', name: 'Tanaka', look: 3, seat: { x: 4.2, y: 6.35, facing: 'ne' }, lines: ['Did you see the sift numbers?'] },
    { id: 'br-2', name: 'Ellis', look: 6, seat: { x: 4.2, y: 3.65, facing: 'sw', behind: 't1' } },
    { id: 'br-3', name: 'Nakamura', look: 9, seat: { x: 6.4, y: 9.75, facing: 'ne' } },
    { id: 'br-4', name: 'Fontaine', look: 0, seat: { x: 6.4, y: 7.05, facing: 'sw', behind: 't3' }, lines: ['Twenty minutes, then back.'] },
    { id: 'br-5', name: 'Odum', look: 7, seat: { x: 1.9, y: 6.0, facing: 'se' } },
    { id: 'br-6', name: 'Salvatierra', look: 11, seat: { x: 1.9, y: 7.4, facing: 'se' }, lines: ['Kettle is dead again.'] },
    {
      id: 'br-coffee',
      name: 'Whitby',
      look: 4,
      seat: { x: 8.4, y: 5.55, facing: 'ne' },
      // Round the table rather than over it — the first leg leaves the chair.
      route: [
        [10.6, 5.4],
        [10.6, 2.4],
        [8.0, 2.4],
        [5.6, 2.2],
      ],
      speed: 1.1,
      dwell: 4.5,
      rest: 14,
      lines: ['One more and I am useless.'],
    },
    {
      id: 'br-rove',
      name: 'Ganesh',
      look: 8,
      route: [
        [12.6, 4.0],
        [12.6, 9.0],
        [8.4, 9.6],
      ],
      speed: 1.1,
      dwell: 3.4,
    },
  ],
};

const SERVER: RoomSpec = {
  id: 'server',
  name: 'Cryptographic Core',
  kicker: 'sub-level · key material',
  w: 13,
  d: 9,
  wall: 3.3,
  palette: 'cool',
  spawn: [5.6, 6.9],
  props: [
    { kind: 'rack', x: 2.0, y: 1.6, w: 5.6, d: 1.0, units: 4 },
    { kind: 'rack', x: 2.0, y: 4.6, w: 5.6, d: 1.0, units: 4 },
    { kind: 'bench', id: 'console', x: 9.0, y: 3.0, w: 2.4, d: 1.2, units: 1 },
    { kind: 'wallscreen', x: 8.6, y: 0, w: 3.4, d: 0.16, z: 1.5 },
    { kind: 'wallsign', x: 0, y: 5.6, w: 0.14, d: 2.8, z: 1.9, text: 'CORE' },
    { kind: 'cabinet', x: 10.6, y: 7.4, w: 1.8, d: 0.8 },
    { kind: 'plant', x: 12.0, y: 1.2, w: 0.8, d: 0.8, h: 1.35 },
  ],
  doors: [{ to: 'bullpen', label: 'Analyst Bay', wall: 'right', at: 11.0 }],
  people: [
    {
      id: 'sv-eng',
      name: 'Rasmussen',
      look: 1,
      seat: { x: 10.2, y: 4.55, facing: 'ne', deskId: 'console' },
      lines: ['Key store is sealed.', 'Do not touch row two.'],
    },
    {
      id: 'sv-tech',
      name: 'Idowu',
      look: 5,
      route: [
        [3.0, 3.2],
        [8.4, 3.2],
        [8.4, 6.8],
        [3.0, 6.8],
      ],
      speed: 0.95,
      dwell: 3.8,
      lines: ['Cold aisle is running warm.'],
    },
  ],
};

export const ROOM_SPECS: RoomSpec[] = [RECEPTION, BULLPEN, BRIEFING, BREAKROOM, SERVER];

// ---------------------------------------------------------------------------
// The operations floor — the client's artwork, its traced map, and the four
// doors it already draws. The approach points are the only new numbers, and
// `pqRooms.test.ts` checks every one of them is somewhere a body can stand.
// ---------------------------------------------------------------------------

const OPS_DOORS: Door[] = [
  {
    id: 'ops-reception',
    to: 'reception',
    label: 'Reception',
    anchor: { x: 0.107, y: 0.392 },
    approach: { x: 0.148, y: 0.452 },
    hitRadius: DOOR_RADIUS,
  },
  {
    id: 'ops-bullpen',
    to: 'bullpen',
    label: 'Analyst Bay',
    anchor: { x: 0.42, y: 0.226 },
    approach: { x: 0.421, y: 0.309 },
    hitRadius: DOOR_RADIUS,
  },
  {
    id: 'ops-briefing',
    to: 'briefing',
    label: 'Briefing Room',
    anchor: { x: 0.652, y: 0.289 },
    approach: { x: 0.651, y: 0.377 },
    hitRadius: DOOR_RADIUS,
  },
  {
    id: 'ops-breakroom',
    to: 'breakroom',
    label: 'Break Room',
    anchor: { x: 0.882, y: 0.394 },
    // The east door is drawn beyond the traced floor, so you stand at the
    // near corner of the walkable area rather than under the frame.
    approach: { x: 0.827, y: 0.468 },
    hitRadius: DOOR_RADIUS,
  },
];

/**
 * Staff on the operations floor.
 *
 * Only two of them sit, and both at the round table, whose footprint is
 * already traced — so their legs can be hidden behind its real drawn edge.
 * Everyone else walks: placing a seated figure against furniture that was
 * painted rather than derived means guessing where a chair is, and a guess
 * that is 20cm out reads as a person sitting in mid-air.
 */
const OPS_PEOPLE: NpcDef[] = [
  {
    id: 'op-table-a',
    name: 'Sørensen',
    look: 4,
    seat: { pos: { x: 0.627, y: 0.702 }, facing: 'sw', clipY: backEdgeY(OBSTACLES[5], 0.627), chair: true },
    path: [],
    speed: 0,
    dwell: 0,
    rest: 0,
    lines: ['Numbers are in the log.'],
  },
  {
    id: 'op-table-b',
    name: 'Mbeki',
    look: 8,
    seat: { pos: { x: 0.681, y: 0.714 }, facing: 'sw', clipY: backEdgeY(OBSTACLES[5], 0.681), chair: true },
    path: [],
    speed: 0,
    dwell: 0,
    rest: 0,
    lines: ['Then it was not noise.'],
  },
  {
    id: 'op-cross',
    name: 'Halloran',
    look: 0,
    seat: null,
    // The open plaza under the wordmark — the widest clear run on the floor.
    path: [
      { x: 0.46, y: 0.3 },
      { x: 0.53, y: 0.305 },
      { x: 0.6, y: 0.335 },
      { x: 0.645, y: 0.378 },
    ],
    speed: 0.05,
    dwell: 2.4,
    rest: 0,
    lines: ['Status wall is green.'],
  },
  {
    id: 'op-sweep',
    name: 'Ionescu',
    look: 6,
    seat: null,
    path: [
      { x: 0.36, y: 0.78 },
      { x: 0.5, y: 0.815 },
      { x: 0.56, y: 0.76 },
    ],
    speed: 0.045,
    dwell: 3.1,
    rest: 0,
    lines: [],
  },
  {
    id: 'op-runner',
    name: 'Adeyinka',
    look: 9,
    seat: null,
    // Down the walkway between the west wall and the workstation bank.
    path: [
      { x: 0.135, y: 0.49 },
      { x: 0.145, y: 0.57 },
      { x: 0.185, y: 0.65 },
      { x: 0.27, y: 0.71 },
      { x: 0.35, y: 0.76 },
    ],
    speed: 0.062,
    dwell: 1.8,
    rest: 0,
    lines: [],
  },
  {
    id: 'op-comms',
    name: 'Petrov',
    look: 11,
    seat: null,
    path: [
      { x: 0.66, y: 0.4 },
      { x: 0.72, y: 0.47 },
      { x: 0.78, y: 0.5 },
      { x: 0.8, y: 0.56 },
    ],
    speed: 0.042,
    dwell: 3.6,
    rest: 0,
    lines: ['Line looks clean from here.'],
  },
];

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/** Normalised screen length of one metre, averaged over the two floor axes. */
export function metreScale(v: IsoView): number {
  return Math.hypot(v.tx / 1568, v.ty / 1003);
}

function propPoly(v: IsoView, p: Prop): Poly {
  return isoRectPoly(v, p.x, p.y, p.w, p.d);
}

/**
 * The screen y of a prop's top surface directly in front of a seat.
 *
 * Using the surface's own near edge in that column — rather than one flat
 * cutoff for the whole table — is the same rule the operations floor's
 * depth layers use, and for the same reason: an isometric table's front
 * edge is a diagonal, so a single threshold either crops a person short or
 * leaves their knees hanging through the tabletop.
 */
function seatClip(v: IsoView, props: Prop[], seat: SeatSpec): number | null {
  if (!seat.behind) return null;
  const p = props.find((q) => q.id === seat.behind);
  if (!p) return null;
  const top = (p.z ?? 0) + propHeight(p);
  const poly: Poly = [
    [p.x, p.y],
    [p.x + p.w, p.y],
    [p.x + p.w, p.y + p.d],
    [p.x, p.y + p.d],
  ].map(([px, py]) => {
    const n = isoNorm(v, px, py, top);
    return [n.x, n.y] as [number, number];
  });
  return backEdgeY(poly, isoNorm(v, seat.x, seat.y).x);
}

function buildDoors(v: IsoView, spec: RoomSpec): Door[] {
  return spec.doors.map((door) => {
    const anchor =
      door.wall === 'right'
        ? isoNorm(v, door.at, 0.1, 1.05)
        : isoNorm(v, 0.1, door.at, 1.05);
    const approach =
      door.wall === 'right'
        ? isoNorm(v, door.at, DOOR_APPROACH)
        : isoNorm(v, DOOR_APPROACH, door.at);
    return {
      id: `${spec.id}-${door.to}`,
      to: door.to,
      label: door.label,
      anchor,
      approach,
      hitRadius: DOOR_RADIUS,
    };
  });
}

/** Furniture kinds that draw a chair per place themselves — a seated person
 * at one of these must not draw a second, doubled-up chair of their own. */
const SELF_FURNISHED: PropKind[] = ['bench'];

function buildPeople(v: IsoView, spec: RoomSpec): NpcDef[] {
  const perMetre = metreScale(v);
  return spec.people.map((p) => ({
    id: p.id,
    name: p.name,
    look: p.look,
    seat: p.seat
      ? {
          pos: isoNorm(v, p.seat.x, p.seat.y),
          facing: p.seat.facing,
          clipY: seatClip(v, spec.props, p.seat),
          chair: !SELF_FURNISHED.includes(spec.props.find((q) => q.id === p.seat!.deskId)?.kind as PropKind),
        }
      : null,
    path: (p.route ?? []).map(([x, y]) => isoNorm(v, x, y)),
    speed: (p.speed ?? 1.2) * perMetre,
    dwell: p.dwell ?? 2.5,
    rest: p.rest ?? 12,
    lines: p.lines ?? [],
  }));
}

function buildGlows(v: IsoView, spec: RoomSpec): Glow[] {
  const lit: PropKind[] = ['wallscreen', 'wallsign'];
  return spec.props
    .filter((p) => lit.includes(p.kind))
    .map((p, i) => {
      const z0 = p.z ?? 0;
      const z1 = z0 + propHeight(p);
      // The lit face is whichever one points into the room.
      const onLeftWall = p.w < p.d;
      const corners: [number, number][] = onLeftWall
        ? [
            [p.x + p.w, p.y],
            [p.x + p.w, p.y + p.d],
          ]
        : [
            [p.x, p.y + p.d],
            [p.x + p.w, p.y + p.d],
          ];
      const poly: Poly = [
        isoNorm(v, corners[0][0], corners[0][1], z0),
        isoNorm(v, corners[1][0], corners[1][1], z0),
        isoNorm(v, corners[1][0], corners[1][1], z1),
        isoNorm(v, corners[0][0], corners[0][1], z1),
      ].map((n) => [n.x, n.y] as [number, number]);
      return { poly, phase: i * 1.7 };
    });
}

export function buildRoom(spec: RoomSpec): Room {
  const view = fitIso(spec.w, spec.d, spec.wall, DEFAULT_FRAME);
  const inset = WALL_INSET;
  return {
    id: spec.id,
    name: spec.name,
    kicker: spec.kicker,
    art: { kind: 'iso', spec, view },
    floor: {
      walk: isoRectPoly(view, inset, inset, spec.w - inset * 2, spec.d - inset * 2),
      obstacles: spec.props.filter(propSolid).map((p) => propPoly(view, p)),
    },
    spawn: isoNorm(view, spec.spawn[0], spec.spawn[1]),
    doors: buildDoors(view, spec),
    hotspots: [],
    npcs: buildPeople(view, spec),
    depthLayers: [],
    glows: buildGlows(view, spec),
  };
}

const OPS: Room = {
  id: 'ops',
  name: 'Operations Floor',
  kicker: 'phantom q · headquarters',
  art: { kind: 'image', src: '/pq/hq-master.jpg' },
  floor: OPS_FLOOR,
  spawn: { ...SPAWN },
  doors: OPS_DOORS,
  hotspots: HOTSPOTS,
  npcs: OPS_PEOPLE,
  depthLayers: DEPTH_LAYERS,
  glows: SCREENS.map((s, i) => ({
    poly: [
      [s.x / 1568, s.y / 1003],
      [(s.x + s.w) / 1568, s.y / 1003],
      [(s.x + s.w) / 1568, (s.y + s.h) / 1003],
      [s.x / 1568, (s.y + s.h) / 1003],
    ] as Poly,
    phase: s.phase + i * 0.1,
  })),
};

export const ROOMS: Room[] = [OPS, ...ROOM_SPECS.map(buildRoom)];

export function getRoom(id: RoomId): Room {
  return ROOMS.find((r) => r.id === id) ?? ROOMS[0];
}

/**
 * Where you come out when you walk through `door`: the approach point of
 * the door on the far side that leads back here. Doors are authored once
 * per room and paired by destination, so there is no second list of arrival
 * points to keep in step with the first.
 */
export function arrivalFrom(from: RoomId, to: RoomId): Vec2 {
  const back = getRoom(to).doors.find((d) => d.to === from);
  return back ? { ...back.approach } : { ...getRoom(to).spawn };
}

/** Which door, if any, is close enough to offer. Nearest wins. */
export function doorAt(room: Room, pos: Vec2): Door | null {
  let best: Door | null = null;
  let bestD = Infinity;
  for (const d of room.doors) {
    const dist = Math.hypot(d.approach.x - pos.x, d.approach.y - pos.y);
    if (dist <= d.hitRadius && dist < bestD) {
      best = d;
      bestD = dist;
    }
  }
  return best;
}

/** Which console, if any, is close enough to offer. Nearest wins. */
export function stationAt(room: Room, pos: Vec2): Hotspot | null {
  let best: Hotspot | null = null;
  let bestD = Infinity;
  for (const h of room.hotspots) {
    const d = Math.hypot(h.approach.x - pos.x, h.approach.y - pos.y);
    if (d <= h.hitRadius && d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}
