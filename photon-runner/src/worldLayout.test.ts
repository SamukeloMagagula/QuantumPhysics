import { describe, expect, it } from 'vitest';
import { ROOMS } from './pqRooms';
import { WORLD_ZONES, canWalk, canStand, centerOf, doorX, moveCharacter, routeTo } from './worldLayout';
import { ART_TOP, ART_HEIGHT, artworkFor } from './worldArtwork';

describe('the connected campus', () => {
  it('includes every department and removes the separate facility entrance', () => {
    expect(WORLD_ZONES.map(z => z.id).sort()).toEqual(ROOMS.filter(r => r.id !== 'facility').map(r => r.id).sort());
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
  });
  it('sweeps long moves so valid destinations cannot teleport across walls', () => {
    const from = centerOf(WORLD_ZONES[0]), to = centerOf(WORLD_ZONES[1]);
    const stopped = moveCharacter(from, { x: to.x - from.x, y: to.y - from.y }, false);
    expect(stopped.x).toBeLessThan(WORLD_ZONES[0].x + 250);
    expect(canStand(stopped)).toBe(true);
  });
  it('blocks the front wall outside every doorway and allows the actual opening', () => {
    for (const zone of WORLD_ZONES) {
      const center = centerOf(zone);
      const wallSide = { x: zone.x + artworkFor(zone.id).floor[0] * 250 + 5, y: center.y };
      const blocked = moveCharacter(wallSide, { x: 0, y: 220 }, false);
      expect(blocked.y).toBeLessThan(zone.y + ART_TOP + ART_HEIGHT);
      const entrance = { x: doorX(zone), y: center.y };
      const open = moveCharacter(entrance, { x: 0, y: zone.y + 255 - entrance.y }, false);
      expect(open.y).toBeCloseTo(zone.y + 255, 4);
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
      let p = { x: doorX(zone), y: zone.y + 190 };
      for (const next of routeTo(p, zone)) {
        p = moveCharacter(p, { x: next.x - p.x, y: next.y - p.y }, false);
        expect(p.x).toBeCloseTo(next.x, 4);
        expect(p.y).toBeCloseTo(next.y, 4);
      }
    }
  });
  it('keeps walls solid but doorways and the central walkway open', () => {
    expect(canWalk({ x: 40, y: 80 })).toBe(false);
    expect(canWalk({ x: 165, y: 250 })).toBe(true);
    expect(canWalk({ x: 660, y: 650 })).toBe(true);
    expect(canWalk({ x: -20, y: 295 })).toBe(false);
  });
  it('blocks the illustrated workbenches and cabinet edges in every department', () => {
    for (const zone of WORLD_ZONES) {
      const { floor } = artworkFor(zone.id);
      expect(canWalk({ x: zone.x + 125, y: zone.y + ART_TOP + (floor[1] - .04) * ART_HEIGHT })).toBe(false);
      expect(canWalk({ x: zone.x + 10, y: centerOf(zone).y })).toBe(false);
    }
  });
});
