import { WORLD_ZONES, type CampusZoneId, type Point, type WorldActivity } from './worldLayout';

/** A desk computer in the campus artwork that a player can sit down at. */
export interface WorldComputer {
  id: string;
  zone: CampusZoneId;
  label: string;
  /** Centre of the chair in front of the screen, where a seated player is drawn. */
  seat: Point;
  /** The clear floor in front of the chair, where the player stands to sit down. */
  stand: Point;
}

// Chair centres traced against discovery-building-v1.png (1373 x 1146).
const chairs: [CampusZoneId, number, number][] = [
  ['ops', 150, 135], ['ops', 250, 128], ['ops', 355, 135],
  ['crypto-lab', 530, 135], ['crypto-lab', 585, 135],
  ['comms-centre', 805, 135], ['comms-centre', 905, 135],
  ['soc-room', 1105, 125], ['soc-room', 1175, 125], ['soc-room', 1250, 125],
  ['engineering-room', 260, 395],
  ['quantum-wing', 552, 410],
  ['bullpen', 792, 395], ['bullpen', 905, 395],
];

export const WORLD_COMPUTERS: WorldComputer[] = chairs.map(([zone, x, y], i, all) => {
  const room = WORLD_ZONES.find(z => z.id === zone)!;
  const number = all.slice(0, i + 1).filter(([z]) => z === zone).length;
  return {
    id: `${zone}-${number}`,
    zone,
    label: `${room.short} workstation ${String(number).padStart(2, '0')}`,
    seat: { x, y },
    stand: { x, y: room.floor[1] + 5 },
  };
});

/** How close to the front of a chair the player must be to sit down. */
export const SIT_RANGE = 30;

/** The nearest free computer within reach, if any. */
export function computerNear(p: Point, taken: ReadonlySet<string> = new Set()): WorldComputer | undefined {
  let best: WorldComputer | undefined, bestDistance = SIT_RANGE;
  for (const c of WORLD_COMPUTERS) {
    if (taken.has(c.id)) continue;
    const distance = Math.hypot(p.x - c.stand.x, p.y - c.stand.y);
    if (distance <= bestDistance) { best = c; bestDistance = distance; }
  }
  return best;
}

export function computerById(id: string | null | undefined): WorldComputer | undefined {
  return id ? WORLD_COMPUTERS.find(c => c.id === id) : undefined;
}

/** Every computer runs the same programs; the room's own one is listed first. */
export const COMPUTER_APPS: { activity: WorldActivity; name: string; blurb: string }[] = [
  { activity: 'mission', name: 'Mission console', blurb: 'Tap the fibre and recover the next clue.' },
  { activity: 'multiplayer', name: 'Team intercept', blurb: 'Play Alice, Bob or Eve with friends.' },
  { activity: 'forensics', name: 'Signal evidence', blurb: 'Read the trail your last mission left.' },
  { activity: 'rooms', name: 'Cipher puzzles', blurb: 'Decode secret messages step by step.' },
  { activity: 'labs', name: 'Security labs', blurb: 'Try the tools that guard a network.' },
  { activity: 'defender', name: 'Network defender', blurb: 'Let real requests in, keep attacks out.' },
  { activity: 'hardware', name: 'Repair bench', blurb: 'Diagnose faulty quantum equipment.' },
  { activity: 'quantum', name: 'Light lab', blurb: 'Watch quantum effects on an optical bench.' },
];

export function appsFor(computer: WorldComputer): typeof COMPUTER_APPS {
  const own = WORLD_ZONES.find(z => z.id === computer.zone)?.activity;
  return [...COMPUTER_APPS].sort((a, b) => Number(b.activity === own) - Number(a.activity === own));
}
