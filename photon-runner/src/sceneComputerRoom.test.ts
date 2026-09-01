import { describe, expect, it } from 'vitest';
import { BODY_RADIUS, CORRIDORS, ROOMS, SEAT_RANGE, approachPoint, isWalkableAt } from './sceneComputerRoom';

/**
 * Layout tests for the QKD facility.
 *
 * The failure these exist to catch is silent and nasty: `isWalkableAt` pads
 * rooms and corridors independently, so two rectangles that merely touch
 * leave a dead band 2*BODY_RADIUS wide belonging to neither. The doorway
 * looks wide open in the render and is completely impassable. Flood-filling
 * from spawn is the only way to be sure the building is actually connected.
 */

/** Flood fill the walkable area from the player's spawn point. */
function reachable(step = 0.25): Set<string> {
  const seen = new Set<string>();
  const queue: [number, number][] = [[0, 0]];
  const key = (x: number, z: number) => `${x.toFixed(2)},${z.toFixed(2)}`;

  while (queue.length) {
    const [x, z] = queue.pop()!;
    const k = key(x, z);
    if (seen.has(k)) continue;
    if (!isWalkableAt(x, z)) continue;
    seen.add(k);
    if (Math.abs(x) > 40 || Math.abs(z) > 40) continue;
    queue.push([x + step, z], [x - step, z], [x, z + step], [x, z - step]);
  }
  return seen;
}

/** Is any flooded cell within `r` of this point? */
function reachedNear(cells: Set<string>, p: { x: number; z: number }, r: number): boolean {
  for (const c of cells) {
    const [cx, cz] = c.split(',').map(Number);
    if (Math.hypot(cx - p.x, cz - p.z) <= r) return true;
  }
  return false;
}

describe('facility layout', () => {
  it('spawns the player somewhere walkable', () => {
    expect(isWalkableAt(0, 0)).toBe(true);
  });

  it('has the three protocol rooms', () => {
    expect(ROOMS.map((r) => r.id).sort()).toEqual(['alice', 'bob', 'eve']);
  });

  it('gives every room exactly one station kind, all three distinct', () => {
    expect(new Set(ROOMS.map((r) => r.kind)).size).toBe(3);
  });

  it('overlaps every corridor with what it connects by more than the body diameter', () => {
    // A corridor that only touches a room is impassable once both are padded.
    // Anything at or under 2*BODY_RADIUS of overlap is a dead doorway.
    const minOverlap = 2 * BODY_RADIUS;
    const main = CORRIDORS[0];
    for (const room of ROOMS.filter((r) => r.id !== 'eve')) {
      const roomInner = room.center.x < 0 ? room.center.x + room.size.w / 2 : room.center.x - room.size.w / 2;
      const corridorEnd = room.center.x < 0 ? main.x - main.w / 2 : main.x + main.w / 2;
      expect(Math.abs(roomInner - corridorEnd), `${room.id} doorway overlap`).toBeGreaterThan(minOverlap);
    }
  });

  it('can walk from spawn to every station seat', () => {
    const cells = reachable();
    for (const room of ROOMS) {
      const p = approachPoint(room);
      // Within the seat's own interaction range of a reachable spot.
      expect(reachedNear(cells, p, 3.2), `${room.id} seat unreachable on foot`).toBe(true);
    }
  });

  it('offers every seat while walking straight in along the approach axis', () => {
    // Reachability alone is not enough. A player entering a room walks in on
    // the axis of the corridor that brought them there and keeps going; if
    // the seat's approach point sits several metres off that line, the prompt
    // never appears and the station reads as broken. Alice and Bob are
    // entered along z = 0 from the main run; Eve along x = 0 down the spur.
    for (const room of ROOMS) {
      const p = approachPoint(room);
      const alongZ = room.id === 'eve';
      let offered = false;
      for (let t = -30; t <= 30 && !offered; t += 0.1) {
        const x = alongZ ? 0 : t;
        const z = alongZ ? t : 0;
        if (!isWalkableAt(x, z)) continue;
        if (Math.hypot(x - p.x, z - p.z) <= SEAT_RANGE) offered = true;
      }
      expect(offered, `${room.id} seat never offered walking straight in`).toBe(true);
    }
  });

  it('keeps the desks solid so you cannot stand inside one', () => {
    for (const room of ROOMS) {
      expect(isWalkableAt(room.desk.x, room.desk.z), `${room.id} desk`).toBe(false);
    }
  });

  it('walls the player in — outside the building is not walkable', () => {
    expect(isWalkableAt(0, -40)).toBe(false);
    expect(isWalkableAt(60, 0)).toBe(false);
  });
});
