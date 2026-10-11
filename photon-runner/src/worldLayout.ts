import type { RoomId } from './pqRooms';
import { ART_HEIGHT, ART_TOP, artworkFor } from './worldArtwork';

export type WorldActivity = 'mission' | 'labs' | 'rooms' | 'defender' | 'quantum' | 'campaign' | 'hardware' | 'forensics' | 'multiplayer' | 'customize';
export interface Point { x: number; y: number }
export interface WorldZone { id: RoomId; name: string; short: string; activity: WorldActivity; action: string; description: string; color: string; x: number; y: number }
const departments: [RoomId, string, string, WorldActivity, string, string, string][] = [
  ['ops', 'Operations Floor', 'Operations', 'mission', 'Open mission', 'Find the courier. Recover the blue case. Your next clue starts here.', '#62dab4'],
  ['crypto-lab', 'Cryptography Lab', 'Cryptography', 'rooms', 'Decode a message', 'Discover how secret messages work, one puzzle at a time.', '#b0a0ff'],
  ['comms-centre', 'Communications Centre', 'Communications', 'mission', 'Open mission', 'Follow the signal and uncover the next part of the story.', '#67d2ee'],
  ['soc-room', 'Security Operations Centre', 'Security operations', 'defender', 'Defend the network', 'Inspect incoming connections and keep the shop online.', '#f8be78'],
  ['engineering-room', 'Engineering Workshop', 'Engineering', 'hardware', 'Repair equipment', 'Find a fault, choose a repair, and bring the equipment back online.', '#f8be78'],
  ['quantum-wing', 'Quantum Wing', 'Quantum wing', 'quantum', 'Experiment with light', 'Explore the optical bench and watch quantum effects in action.', '#b0a0ff'],
  ['bullpen', 'Analyst Bay', 'Analyst bay', 'forensics', 'Inspect the evidence', 'Review the signal from your latest mission and look for interference.', '#67d2ee'],
  ['briefing', 'Briefing Room', 'Briefing', 'campaign', 'Play the story', 'Choose how to protect a secret before someone else intercepts it.', '#62dab4'],
  ['breakroom', 'Break Room', 'Break room', 'customize', 'Change your look', 'Take a breather and make your character your own.', '#f5a7bc'],
  ['server', 'Cryptographic Core', 'Cryptographic core', 'labs', 'Explore security labs', 'Try the tools that protect the heart of the network.', '#b0a0ff'],
  ['server-hall', 'Server Hall', 'Server hall', 'defender', 'Protect the servers', 'Keep real requests moving while stopping unwanted traffic.', '#67d2ee'],
  ['cryogenics-lab', 'Cryogenics Lab', 'Cryogenics', 'hardware', 'Check the hardware', 'Keep delicate equipment working with the right diagnosis.', '#62dab4'],
  ['secure-archive', 'Secure Archive', 'Secure archive', 'labs', 'Unlock the archive', 'Experiment with ciphers, keys, and the locks that guard information.', '#f5a7bc'],
  ['power-control-room', 'Power Control Room', 'Power control', 'multiplayer', 'Start a team intercept', 'Build a shared link with friends as Alice, Bob, and Eve.', '#f8be78'],
];
export const WORLD_SIZE = 1320;
export const ROOM_W = 250;
export const ROOM_H = 200;
export const WORLD_ZONES: WorldZone[] = departments.map(([id, name, short, activity, action, description, color], i) => ({
  id, name, short, activity, action, description, color, x: [40, 340, 730, 1030][i % 4], y: 40 + Math.floor(i / 4) * 310,
}));
export const centerOf = (z: WorldZone): Point => {
  const { floor } = artworkFor(z.id);
  return { x: z.x + ROOM_W / 2, y: z.y + ART_TOP + (floor[1] + floor[3]) / 2 * ART_HEIGHT };
};
export function zoneAt(p: Point): WorldZone | undefined {
  return WORLD_ZONES.find(z => p.x >= z.x + 8 && p.x <= z.x + ROOM_W - 8 && p.y >= z.y + 8 && p.y <= z.y + ROOM_H);
}
export function canWalk(p: Point): boolean {
  if (p.x < 18 || p.x > 1302 || p.y < 18 || p.y > 1290) return false;
  if (p.x >= 625 && p.x <= 695) return true;
  if ([0, 1, 2, 3].some(row => p.y >= 270 + row * 310 && p.y <= 320 + row * 310)) return true;
  return WORLD_ZONES.some(z => {
    const { floor, entrance } = artworkFor(z.id);
    const x = (p.x - z.x) / ROOM_W, y = (p.y - z.y - ART_TOP) / ART_HEIGHT;
    return (x >= floor[0] && x <= floor[2] && y >= floor[1] && y <= floor[3]) ||
      (x >= entrance[0] && x <= entrance[1] && y >= floor[1] && p.y <= z.y + 280);
  });
}
/** The actor occupies floor space, rather than being a zero-width point. */
export const CHARACTER_RADIUS = 3;
export function canStand(p: Point): boolean {
  return [-1, 0, 1].every(x => [-1, 0, 1].every(y =>
    canWalk({ x: p.x + x * CHARACTER_RADIUS, y: p.y + y * 2 })));
}

/** Sweep the entire move, including long frames and final route waypoints.
 * Manual input slides along solid edges; guided routes keep their exact line. */
export function moveCharacter(from: Point, delta: Point, slide = true): Point {
  const count = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y) / .75));
  const dx = delta.x / count, dy = delta.y / count;
  const p = { ...from };
  for (let i = 0; i < count; i++) {
    if (canStand({ x: p.x + dx, y: p.y + dy })) { p.x += dx; p.y += dy; }
    else if (slide) {
      if (canStand({ x: p.x + dx, y: p.y })) p.x += dx;
      if (canStand({ x: p.x, y: p.y + dy })) p.y += dy;
    } else break;
  }
  return p;
}
export function doorX(zone: WorldZone): number {
  const { entrance } = artworkFor(zone.id);
  return zone.x + (entrance[0] + entrance[1]) / 2 * ROOM_W;
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
    corridorY = current.y + 255;
    route.push({ x: doorX(current), y: from.y }, { x: doorX(current), y: corridorY });
  } else if (from.x < 625 || from.x > 695) {
    corridorY = 295 + Math.max(0, Math.min(3, Math.round((from.y - 295) / 310))) * 310;
    route.push({ x: from.x, y: corridorY });
  }
  const targetY = destination.y + 255;
  if (Math.abs(corridorY - targetY) > 1) route.push({ x: 660, y: corridorY }, { x: 660, y: targetY });
  route.push({ x: doorX(destination), y: targetY }, { x: doorX(destination), y: centerOf(destination).y }, centerOf(destination));
  return route;
}
