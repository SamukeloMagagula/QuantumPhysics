import type { Hotspot, Poly, Vec2 } from './pqScene';
import type { IsoFacing, NpcDef } from './pqNpc';

/**
 * The facility overview — the client's second illustration, handled the
 * same way as the Page 8 operations floor: the image is the world, and
 * this module is only the spatial data traced over it. Every coordinate
 * is normalised 0..1 against the 1448x1086 master.
 *
 * Ten rooms sit around Central Operations, with Reception / ID and the
 * entrance walkway along the bottom edge. Each room floor is its own
 * walkable polygon and each doorway a small connector polygon bridging two
 * of them, so a door is one editable quad rather than a gap that has to be
 * cut out of a traced wall. Rooms drawn with a padlock start locked: their
 * connector is blocked until the trainee access card is registered at the
 * reception kiosk, which is the loop the artwork's own overlays describe.
 */

export const FACILITY_W = 1448;
export const FACILITY_H = 1086;
export const FACILITY_ASPECT = FACILITY_W / FACILITY_H;

const n = (x: number, y: number): [number, number] => [x / FACILITY_W, y / FACILITY_H];
const quad = (a: [number, number], b: [number, number], c: [number, number], d: [number, number]): Poly => [
  n(...a),
  n(...b),
  n(...c),
  n(...d),
];
const pt = (x: number, y: number): Vec2 => ({ x: x / FACILITY_W, y: y / FACILITY_H });

/** Room floors, traced to the inside of the walls. */
export const FACILITY_ROOMS: Record<string, Poly> = {
  training: quad([105, 105], [522, 100], [528, 255], [62, 258]),
  crypto: quad([545, 100], [872, 100], [878, 255], [542, 255]),
  comms: quad([888, 100], [1352, 100], [1392, 258], [892, 255]),
  redteam: quad([50, 285], [400, 285], [408, 468], [20, 470]),
  central: quad([425, 300], [1045, 300], [1050, 540], [420, 540]),
  soc: quad([1065, 285], [1400, 285], [1430, 470], [1070, 470]),
  engineering: quad([12, 495], [380, 495], [378, 715], [0, 718]),
  quantum: quad([395, 560], [600, 560], [600, 720], [392, 722]),
  reception: quad([612, 560], [842, 560], [842, 735], [612, 735]),
  anteroom: quad([855, 560], [1035, 560], [1035, 730], [855, 730]),
  compute: quad([1065, 490], [1410, 490], [1445, 715], [1075, 715]),
  walkway: quad([585, 735], [838, 735], [852, 1000], [575, 1000]),
};

/** Open doorways — connectors that are always walkable. */
export const FACILITY_DOORWAYS: Poly[] = [
  quad([462, 248], [500, 248], [500, 312], [462, 312]), // central <-> training
  quad([682, 248], [720, 248], [720, 312], [682, 312]), // central <-> cryptography
  quad([942, 248], [980, 248], [980, 312], [942, 312]), // central <-> communications
  quad([803, 532], [842, 532], [842, 568], [803, 568]), // central <-> reception
  quad([618, 722], [836, 722], [836, 748], [618, 748]), // reception <-> walkway
  quad([836, 640], [862, 640], [862, 700], [836, 700]), // reception <-> anteroom
];

/**
 * Doorways drawn with a padlock. Each is walkable only once unlocked; until
 * then the same quad is an obstacle, which is how a shut door behaves.
 */
export const FACILITY_LOCKED: { id: string; label: string; poly: Poly }[] = [
  { id: 'redteam', label: 'Red-Team Laboratory', poly: quad([392, 318], [432, 318], [432, 372], [392, 372]) },
  { id: 'soc', label: 'Security Operations Centre', poly: quad([1038, 298], [1078, 298], [1078, 352], [1038, 352]) },
  { id: 'engineering', label: 'Engineering Workshop', poly: quad([298, 466], [338, 466], [338, 502], [298, 502]) },
  { id: 'quantum', label: 'Quantum Wing', poly: quad([372, 688], [402, 688], [402, 722], [372, 722]) },
  { id: 'compute-side', label: 'Advanced Compute Facility', poly: quad([1028, 598], [1072, 598], [1072, 642], [1028, 642]) },
  { id: 'compute-top', label: 'Advanced Compute Facility', poly: quad([1113, 466], [1153, 466], [1153, 502], [1113, 502]) },
];

/** Furniture footprints, so nobody walks through a desk or a rack. */
export const FACILITY_OBSTACLES: Poly[] = [
  quad([190, 168], [335, 168], [335, 205], [190, 205]), // training desks
  quad([95, 120], [135, 120], [135, 215], [95, 215]), // training cabinet
  quad([640, 148], [740, 148], [740, 205], [640, 205]), // crypto bench
  quad([560, 110], [630, 110], [630, 200], [560, 200]), // crypto racks (left)
  quad([745, 110], [800, 110], [800, 190], [745, 190]), // crypto racks (right)
  quad([920, 145], [1200, 145], [1200, 215], [920, 215]), // comms console arc
  quad([100, 340], [330, 340], [330, 425], [100, 425]), // red-team desks
  quad([490, 340], [650, 340], [650, 520], [490, 520]), // central ops, west cluster
  quad([760, 340], [950, 340], [950, 520], [760, 520]), // central ops, east cluster
  quad([1100, 330], [1380, 330], [1380, 420], [1100, 420]), // SOC consoles
  quad([30, 545], [280, 545], [280, 625], [30, 625]), // engineering benches
  quad([410, 585], [560, 585], [560, 650], [410, 650]), // quantum racks
  quad([635, 640], [800, 640], [800, 690], [635, 690]), // reception desk
  quad([1160, 520], [1400, 520], [1400, 630], [1160, 630]), // compute racks
];

/** You arrive on the walkway, in front of the doors. */
export const FACILITY_SPAWN: Vec2 = pt(712, 900);

/** Standing in front of Central Operations' wordmark takes you onto the
 * detailed operations floor — the Page 8 illustration. */
export const FACILITY_OPS_DOOR = { anchor: pt(735, 296), approach: pt(735, 326) };

export const FACILITY_HOTSPOTS: Hotspot[] = [
  {
    id: 'badge',
    station: 'badge',
    anchor: pt(718, 662),
    approach: pt(718, 712),
    hitRadius: 0.04,
    kicker: 'RECEPTION / ID',
    title: 'TRAINEE ACCESS CARD',
    label: 'Register your access card',
  },
  {
    id: 'comms',
    station: 'attack',
    anchor: pt(1060, 180),
    approach: pt(1060, 236),
    hitRadius: 0.045,
    kicker: 'COMMUNICATIONS CENTRE',
    title: 'COMMUNICATIONS CONSOLE',
    label: 'Tap the line',
  },
  {
    id: 'soc',
    station: 'forensics',
    anchor: pt(1240, 372),
    approach: pt(1240, 442),
    hitRadius: 0.045,
    kicker: 'SECURITY OPERATIONS CENTRE',
    title: 'SOC STATUS WALL',
    label: 'Review the channel',
  },
  {
    id: 'workshop',
    station: 'rack',
    anchor: pt(155, 585),
    approach: pt(155, 655),
    hitRadius: 0.045,
    kicker: 'ENGINEERING WORKSHOP',
    title: 'TRAINING RACK',
    label: 'Work on the rack',
  },
  {
    id: 'workstation',
    station: 'campaign',
    anchor: pt(855, 430),
    approach: pt(705, 470),
    hitRadius: 0.045,
    kicker: 'CENTRAL OPERATIONS',
    title: 'WORKSTATION 04',
    label: 'Log in to Workstation 04',
  },
];

/** Screens that pulse. Logical pixel boxes in the master's own space. */
export const FACILITY_SCREENS = [
  { x: 985, y: 105, w: 190, h: 75, phase: 0.3 },
  { x: 1150, y: 295, w: 210, h: 80, phase: 1.9 },
  { x: 650, y: 118, w: 80, h: 45, phase: 3.1 },
  { x: 150, y: 290, w: 110, h: 60, phase: 4.2 },
];

const npc = (
  id: string,
  name: string,
  look: number,
  seat: { x: number; y: number; facing: IsoFacing } | null,
  path: [number, number][],
  speed: number,
  lines: string[] = [],
): NpcDef => ({
  id,
  name,
  look,
  seat: seat ? { pos: pt(seat.x, seat.y), facing: seat.facing, clipY: null, chair: true } : null,
  path: path.map(([x, y]) => pt(x, y)),
  speed,
  dwell: 2.6,
  rest: 14,
  lines,
});

export const FACILITY_PEOPLE: NpcDef[] = [
  npc('fc-recep', 'Iris', 2, { x: 718, y: 632, facing: 'sw' }, [], 0, ['Welcome to Phantom Q.', 'Register your card here.']),
  npc('fc-ops-a', 'Ferreira', 0, { x: 600, y: 400, facing: 'ne' }, [], 0, ['Error rate is climbing.']),
  npc('fc-ops-b', 'Song', 4, { x: 840, y: 400, facing: 'ne' }, [], 0),
  npc('fc-ops-c', 'Nwosu', 1, { x: 560, y: 470, facing: 'ne' }, [], 0, ['Who has the tap log?']),
  npc('fc-soc', 'Marchetti', 3, { x: 1235, y: 405, facing: 'ne' }, [], 0, ['SOC is green.']),
  npc('fc-comms', 'Lindqvist', 8, { x: 1040, y: 200, facing: 'ne' }, [], 0, ['Line looks clean.']),
  npc('fc-walk', 'Halloran', 6, null, [[700, 320], [700, 530], [1010, 530], [1010, 320]], 0.04, ['Stand-up in five.']),
  npc('fc-guard', 'Okoro', 9, null, [[712, 960], [712, 750], [622, 720], [622, 600]], 0.035, ['Badges visible, please.']),
  npc('fc-comms-walk', 'Petrov', 11, null, [[910, 236], [1330, 236]], 0.03),
  npc('fc-runner', 'Adeyinka', 5, { x: 900, y: 470, facing: 'ne' }, [[980, 530], [980, 320], [960, 262], [960, 236]], 0.038, ['Comms wants the numbers.']),
];
