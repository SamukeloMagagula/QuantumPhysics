import { describe, expect, it } from 'vitest';
import { ROOMS } from './pqRooms';
import { WORLD_ZONES, SPINE_X, HALL_ROWS, canWalk, canStand, centerOf, doorX, moveCharacter, routeTo } from './worldLayout';

describe('the connected campus', () => {
  it('shares partitions and leaves a continuous indoor spine between wings', () => {
    for (const row of [0, 1, 2]) {
      const rooms = WORLD_ZONES.slice(row * 4, row * 4 + 4);
      expect(rooms[0].x + rooms[0].width).toBe(rooms[1].x);
      expect(rooms[1].x + rooms[1].width).toBeLessThan(SPINE_X);
      expect(rooms[2].x).toBeGreaterThan(SPINE_X);
      expect(rooms[2].x + rooms[2].width).toBe(rooms[3].x);
    }
  });
  it('gives every room a floor band the character can actually move around in', () => {
    for (const { floor } of WORLD_ZONES) {
      expect(floor[2] - floor[0]).toBeGreaterThanOrEqual(150);
      expect(floor[3] - floor[1]).toBeGreaterThanOrEqual(40);
    }
  });
  it('includes every department and removes the separate facility entrance', () => {
    expect(WORLD_ZONES.map(z => z.id).sort()).toEqual([...ROOMS.filter(r => r.id !== 'facility').map(r => r.id), 'cafeteria'].sort());
  });
  it('can walk between every pair of departments without crossing a wall', () => {
    for (const from of WORLD_ZONES) for (const to of WORLD_ZONES) {
      let previous = centerOf(from);
      for (const next of routeTo(previous, to)) {
        const steps = Math.ceil(Math.hypot(next.x - previous.x, next.y - previous.y) / 3);
        for (let i = 0; i <= steps; i++) {
          const fraction = steps ? i / steps : 1;
          const point = { x: previous.x + (next.x - previous.x) * fraction, y: previous.y + (next.y - previous.y) * fraction };
          expect(canWalk(point), `${from.id} → ${to.id}: ${point.x}, ${point.y}`).toBe(true);
          expect(canStand(point), `Body clearance: ${from.id} to ${to.id}`).toBe(true);
        }
        previous = next;
      }
      expect(previous).toEqual(centerOf(to));
    }
  }, 15000);
  it('sweeps long moves so valid destinations cannot teleport across walls', () => {
    const from = centerOf(WORLD_ZONES[0]), to = centerOf(WORLD_ZONES[1]);
    const stopped = moveCharacter(from, { x: to.x - from.x, y: to.y - from.y }, false);
    expect(stopped.x).toBeLessThan(WORLD_ZONES[0].x + WORLD_ZONES[0].width);
    expect(canStand(stopped)).toBe(true);
  });
  it('keeps shared partition walls solid between neighbouring rooms', () => {
    for (const zone of WORLD_ZONES) {
      const neighbour = WORLD_ZONES.find(other => other.y === zone.y && other.x === zone.x + zone.width);
      if (!neighbour) continue;
      const start = centerOf(zone);
      const stopped = moveCharacter(start, { x: zone.width, y: 0 }, false);
      expect(stopped.x).toBeLessThan(neighbour.x);
      expect(canStand(stopped)).toBe(true);
    }
  });
  it('blocks the front wall outside every doorway and allows the actual opening', () => {
    for (const zone of WORLD_ZONES) {
      const center = centerOf(zone);
      const wallSide = { x: zone.floor[0] + 5, y: center.y };
      const blocked = moveCharacter(wallSide, { x: 0, y: 220 }, false);
      expect(blocked.y).toBeLessThan(zone.y + zone.height);
      const entrance = { x: doorX(zone), y: center.y };
      const open = moveCharacter(entrance, { x: 0, y: zone.hallY - entrance.y }, false);
      expect(open.y).toBeCloseTo(zone.hallY, 4);
    }
  });
  it('reaches every waypoint through collision checks, including narrow doors', () => {
    for (const from of WORLD_ZONES) for (const to of WORLD_ZONES) {
      let p = centerOf(from);
      for (const next of routeTo(p, to)) {
        p = moveCharacter(p, { x: next.x - p.x, y: next.y - p.y }, false);
        expect(p.x, `${from.id} to ${to.id}`).toBeCloseTo(next.x, 4);
        expect(p.y, `${from.id} to ${to.id}`).toBeCloseTo(next.y, 4);
      }
    }
  });
  it('routes back from a doorway without cutting diagonally across its jamb', () => {
    for (const zone of WORLD_ZONES) {
      let p = { x: doorX(zone), y: zone.y + zone.height - 2 };
      for (const next of routeTo(p, zone)) {
        p = moveCharacter(p, { x: next.x - p.x, y: next.y - p.y }, false);
        expect(p.x).toBeCloseTo(next.x, 4);
        expect(p.y).toBeCloseTo(next.y, 4);
      }
    }
  });
  it('keeps walls solid but doorways and the central walkway open', () => {
    expect(canWalk({ x: 40, y: 80 })).toBe(false);
    expect(canWalk({ x: doorX(WORLD_ZONES[0]), y: HALL_ROWS[0] })).toBe(true);
    expect(canWalk({ x: SPINE_X, y: 650 })).toBe(true);
    expect(canWalk({ x: -20, y: 295 })).toBe(false);
  });
  it('blocks the illustrated workbenches and cabinet edges in every department', () => {
    for (const zone of WORLD_ZONES) {
      const { floor } = zone;
      expect(canWalk({ x: centerOf(zone).x, y: floor[1] - 6 })).toBe(false);
      expect(canWalk({ x: zone.x + 10, y: centerOf(zone).y })).toBe(false);
    }
  });
});
