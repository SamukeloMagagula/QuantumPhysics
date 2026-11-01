import type { RoomId } from './pqRooms';
/** Campus places: every scene room plus map-only spaces such as the Cafeteria. */
export type CampusZoneId = Exclude<RoomId, 'facility'> | 'cafeteria';
export type WorldActivity =
  'mission' | 'labs' | 'rooms' | 'defender' | 'quantum' | 'campaign' | 'hardware' | 'forensics' | 'multiplayer' | 'customize';
export interface Point {
  x: number;
  y: number;
}
export interface WorldZone {
  id: CampusZoneId;
  name: string;
  short: string;
  activity: WorldActivity;
  action: string;
  description: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hallY: number;
  floor: readonly [number, number, number, number];
  entrance: readonly [number, number];
}
const departments: [CampusZoneId, string, string, WorldActivity, string, string, string][] = [
  [
    'ops',
    'Operations Floor',
    'Operations',
    'mission',
    'Open mission',
    'Find the courier. Recover the blue case. Your next clue starts here.',
    '#62dab4',
  ],
  [
    'crypto-lab',
    'Cryptography Lab',
    'Cryptography',
    'rooms',
    'Decode a message',
    'Discover how secret messages work, one puzzle at a time.',
    '#b0a0ff',
  ],
  [
    'comms-centre',
    'Communications Centre',
    'Communications',
    'mission',
    'Open mission',
    'Follow the signal and uncover the next part of the story.',
    '#67d2ee',
  ],
  [
    'soc-room',
    'Security Operations Centre',
    'Security operations',
    'defender',
    'Defend the network',
    'Inspect incoming connections and keep the shop online.',
    '#f8be78',
  ],
  [
    'engineering-room',
    'Engineering Workshop',
    'Engineering',
    'hardware',
    'Repair equipment',
    'Find a fault, choose a repair, and bring the equipment back online.',
    '#f8be78',
  ],
  [
    'quantum-wing',
    'Quantum Wing',
    'Quantum wing',
    'quantum',
    'Experiment with light',
    'Explore the optical bench and watch quantum effects in action.',
    '#b0a0ff',
  ],
  [
    'bullpen',
    'Analyst Bay',
    'Analyst bay',
    'forensics',
    'Inspect the evidence',
    'Review the signal from your latest mission and look for interference.',
    '#67d2ee',
  ],
  [
    'briefing',
    'Briefing Room',
    'Briefing',
    'campaign',
    'Play the story',
    'Choose how to protect a secret before someone else intercepts it.',
    '#62dab4',
  ],
  [
    'breakroom',
    'Break Room',
    'Break room',
    'customize',
    'Change your look',
    'Take a breather and make your character your own.',
    '#f5a7bc',
  ],
  [
    'server',
    'Cryptographic Core',
    'Cryptographic core',
    'labs',
    'Explore security labs',
    'Try the tools that protect the heart of the network.',
    '#b0a0ff',
  ],
  [
    'server-hall',
    'Server Hall',
    'Server hall',
    'defender',
    'Protect the servers',
    'Keep real requests moving while stopping unwanted traffic.',
    '#67d2ee',
  ],
  [
    'cryogenics-lab',
    'Cryogenics Lab',
    'Cryogenics',
    'hardware',
    'Check the hardware',
    'Keep delicate equipment working with the right diagnosis.',
    '#62dab4',
  ],
  [
    'secure-archive',
    'Secure Archive',
    'Secure archive',
    'labs',
    'Unlock the archive',
    'Experiment with ciphers, keys, and the locks that guard information.',
    '#f5a7bc',
  ],
  [
    'power-control-room',
    'Power Control Room',
    'Power control',
    'multiplayer',
    'Start a team intercept',
    'Build a shared link with friends as Alice, Bob, and Eve.',
    '#f8be78',
  ],
  [
    'cafeteria',
    'Cafeteria',
    'Cafeteria',
    'customize',
    'Relax & change your look',
    'Meet in the cafeteria, grab a seat, and plan your next discovery.',
    '#eda867',
  ],
];
// Pixel coordinates traced against discovery-building-v1.png (1373 x 1146).
export const WORLD_ART = '/pq/discovery-building-v1.png';
export const WORLD_WIDTH = 1373;
export const WORLD_HEIGHT = 1146;
export const SPINE_X = 688;
export const SPINE_WIDTH = 20;
export const HALL_WIDTH = 32;
export const HALL_ROWS = [267, 545, 823, 1098];
type ZoneGeometry = Pick<WorldZone, 'x' | 'y' | 'width' | 'height' | 'hallY' | 'floor' | 'entrance'>;
// Floor bands are the clear floor: [left, top, right, bottom]. They exclude desks,
// chairs, plants and racks; the cafeteria band is its aisle and seating area.
const geometry: Record<CampusZoneId, ZoneGeometry> = {
  ops: { x: 34, y: 20, width: 390, height: 216, hallY: HALL_ROWS[0], floor: [80, 165, 398, 220], entrance: [210, 254] },
  'crypto-lab': { x: 424, y: 20, width: 249, height: 216, hallY: HALL_ROWS[0], floor: [455, 162, 640, 220], entrance: [522, 563] },
  'comms-centre': { x: 704, y: 20, width: 304, height: 216, hallY: HALL_ROWS[0], floor: [741, 167, 967, 220], entrance: [812, 852] },
  'soc-room': { x: 1008, y: 20, width: 329, height: 216, hallY: HALL_ROWS[0], floor: [1055, 175, 1285, 220], entrance: [1132, 1170] },
  'engineering-room': { x: 34, y: 300, width: 334, height: 215, hallY: HALL_ROWS[1], floor: [85, 440, 326, 497], entrance: [194, 236] },
  'quantum-wing': { x: 368, y: 300, width: 305, height: 215, hallY: HALL_ROWS[1], floor: [405, 440, 634, 497], entrance: [505, 543] },
  bullpen: { x: 704, y: 300, width: 304, height: 215, hallY: HALL_ROWS[1], floor: [744, 435, 968, 497], entrance: [815, 852] },
  briefing: { x: 1008, y: 300, width: 329, height: 215, hallY: HALL_ROWS[1], floor: [1055, 456, 1285, 497], entrance: [1136, 1176] },
  breakroom: { x: 34, y: 580, width: 334, height: 213, hallY: HALL_ROWS[2], floor: [85, 710, 326, 777], entrance: [190, 230] },
  server: { x: 368, y: 580, width: 305, height: 213, hallY: HALL_ROWS[2], floor: [405, 712, 634, 777], entrance: [505, 540] },
  'server-hall': { x: 704, y: 580, width: 304, height: 213, hallY: HALL_ROWS[2], floor: [745, 715, 968, 777], entrance: [816, 854] },
  'cryogenics-lab': {
    x: 1008,
    y: 580,
    width: 329,
    height: 213,
    hallY: HALL_ROWS[2],
    floor: [1055, 736, 1285, 777],
    entrance: [1140, 1175],
  },
  'secure-archive': { x: 34, y: 856, width: 334, height: 209, hallY: HALL_ROWS[3], floor: [100, 986, 320, 1048], entrance: [189, 221] },
  'power-control-room': {
    x: 368,
    y: 856,
    width: 305,
    height: 209,
    hallY: HALL_ROWS[3],
    floor: [405, 982, 634, 1048],
    entrance: [485, 526],
  },
  cafeteria: { x: 704, y: 856, width: 304, height: 209, hallY: HALL_ROWS[3], floor: [800, 952, 995, 1048], entrance: [825, 862] },
};
export const WORLD_ZONES: WorldZone[] = departments.map(([id, name, short, activity, action, description, color]) => ({
  id,
  name,
  short,
  activity,
  action,
  description,
  color,
  ...geometry[id],
}));
export const centerOf = (z: WorldZone): Point => ({ x: (z.floor[0] + z.floor[2]) / 2, y: (z.floor[1] + z.floor[3]) / 2 });
export function zoneAt(p: Point): WorldZone | undefined {
  return WORLD_ZONES.find(z => p.x >= z.x && p.x <= z.x + z.width && p.y >= z.y && p.y <= z.y + z.height);
}
export function canWalk(p: Point): boolean {
  if (p.x < 45 || p.x > 1325 || p.y < 26 || p.y > 1114) return false;
  if (Math.abs(p.x - SPINE_X) <= SPINE_WIDTH / 2) return true;
  if (HALL_ROWS.some(y => Math.abs(p.y - y) <= HALL_WIDTH / 2)) return true;
  return WORLD_ZONES.some(z => {
    const [left, top, right, bottom] = z.floor;
    return (
      (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) ||
      (p.x >= z.entrance[0] && p.x <= z.entrance[1] && p.y >= top && p.y <= z.hallY + HALL_WIDTH / 2)
    );
  });
}
/** The actor occupies floor space, rather than being a zero-width point. */
export const CHARACTER_RADIUS = 3;
export function canStand(p: Point): boolean {
  return [-1, 0, 1].every(x => [-1, 0, 1].every(y => canWalk({ x: p.x + x * CHARACTER_RADIUS, y: p.y + y * 2 })));
}

/** Sweep the entire move, including long frames and final route waypoints.
 * Manual input slides along solid edges; guided routes keep their exact line. */
export function moveCharacter(from: Point, delta: Point, slide = true): Point {
  const count = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y) / 0.75));
  const dx = delta.x / count,
    dy = delta.y / count;
  const p = { ...from };
  for (let i = 0; i < count; i++) {
    if (canStand({ x: p.x + dx, y: p.y + dy })) {
      p.x += dx;
      p.y += dy;
    } else if (slide) {
      if (canStand({ x: p.x + dx, y: p.y })) p.x += dx;
      if (canStand({ x: p.x, y: p.y + dy })) p.y += dy;
    } else break;
  }
  return p;
}
export function doorX(zone: WorldZone): number {
  return (zone.entrance[0] + zone.entrance[1]) / 2;
}
/** Route through the shared spine and open doorways, never through a wall. */
export function routeTo(from: Point, destination: WorldZone): Point[] {
  const current = zoneAt(from);
  if (current?.id === destination.id) {
    const center = centerOf(current);
    return from.y > center.y ? [{ x: doorX(current), y: from.y }, { x: doorX(current), y: center.y }, center] : [center];
  }
  const route: Point[] = [];
  let corridorY = from.y;
  if (current) {
    corridorY = current.hallY;
    route.push({ x: doorX(current), y: from.y }, { x: doorX(current), y: corridorY });
  } else if (Math.abs(from.x - SPINE_X) > SPINE_WIDTH / 2) {
    corridorY = HALL_ROWS.reduce((nearest, y) => (Math.abs(y - from.y) < Math.abs(nearest - from.y) ? y : nearest));
    route.push({ x: from.x, y: corridorY });
  }
  const targetY = destination.hallY;
  if (Math.abs(corridorY - targetY) > 1) route.push({ x: SPINE_X, y: corridorY }, { x: SPINE_X, y: targetY });
  route.push({ x: doorX(destination), y: targetY }, { x: doorX(destination), y: centerOf(destination).y }, centerOf(destination));
  return route;
}
