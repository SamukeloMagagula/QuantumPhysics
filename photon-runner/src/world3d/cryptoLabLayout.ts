/** Metre-space layout for the Cryptography Lab 3D pilot.
 *
 * A fresh, framework-free geometry (not derived from worldLayout.ts's pixel
 * rects, which stay untouched and keep driving the 2D map). Follows the
 * modeling contract in docs/3d-reference-v1/README.md: 1 unit = 1 metre, Y
 * up, X east/west, Z north/south. Dimensions match blender/rooms/ROOMS.md.
 */

export interface Point2 {
  x: number;
  z: number;
}

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const ROOM_WIDTH = 10;
export const ROOM_DEPTH = 8;
export const WALL_HEIGHT = 3.2;

/** Door centered on the south wall (+Z), 1.0m clear opening per the modeling contract. */
export const DOOR_WIDTH = 1.0;
export const DOOR_X_RANGE: readonly [number, number] = [-DOOR_WIDTH / 2, DOOR_WIDTH / 2];

export const SPAWN: Point2 = { x: 0, z: ROOM_DEPTH / 2 - 1 };

/** The desk the player sits at to open the room's mission (crypto-lab's 'rooms' activity). */
export const STATION = { x: -2.6, z: -1.5, hitRadius: 1.3 };

/** Placeholder furniture, sized per docs/3d-reference-v1/README.md. */
export const DESK_SIZE = { width: 1.6, depth: 0.8, height: 0.75 };
export const SERVER_CABINET_SIZE = { width: 0.6, depth: 1.0, height: 2.0 };

export const OBSTACLES: Box[] = [
  // Desk, in front of the station point.
  {
    minX: STATION.x - DESK_SIZE.width / 2,
    maxX: STATION.x + DESK_SIZE.width / 2,
    minZ: STATION.z - DESK_SIZE.depth / 2,
    maxZ: STATION.z + DESK_SIZE.depth / 2,
  },
  // Server cabinet, against the east wall.
  {
    minX: ROOM_WIDTH / 2 - SERVER_CABINET_SIZE.width - 0.2,
    maxX: ROOM_WIDTH / 2 - 0.2,
    minZ: -SERVER_CABINET_SIZE.depth / 2,
    maxZ: SERVER_CABINET_SIZE.depth / 2,
  },
];

/** The actor occupies floor space, rather than being a zero-width point. */
export const CHARACTER_RADIUS = 0.35;

function insideRoom(p: Point2): boolean {
  const margin = CHARACTER_RADIUS;
  if (p.x < -ROOM_WIDTH / 2 + margin || p.x > ROOM_WIDTH / 2 - margin) return false;
  if (p.z < -ROOM_DEPTH / 2 + margin) return false;
  if (p.z > ROOM_DEPTH / 2 - margin) {
    // Allow stepping through the door opening even though it's past the south wall line.
    const atDoor = p.z <= ROOM_DEPTH / 2 + 1 && p.x >= DOOR_X_RANGE[0] + margin && p.x <= DOOR_X_RANGE[1] - margin;
    if (!atDoor) return false;
  }
  return true;
}

function clearOfObstacles(p: Point2, obstacles: Box[]): boolean {
  return obstacles.every(box => {
    const closestX = Math.max(box.minX, Math.min(p.x, box.maxX));
    const closestZ = Math.max(box.minZ, Math.min(p.z, box.maxZ));
    const dx = p.x - closestX;
    const dz = p.z - closestZ;
    return dx * dx + dz * dz >= CHARACTER_RADIUS * CHARACTER_RADIUS;
  });
}

/** Can the player's circle stand at this point without clipping a wall or obstacle? */
export function canStandAt(p: Point2, obstacles: Box[] = OBSTACLES): boolean {
  return insideRoom(p) && clearOfObstacles(p, obstacles);
}

export function isNearStation(p: Point2): boolean {
  return Math.hypot(p.x - STATION.x, p.z - STATION.z) <= STATION.hitRadius;
}
