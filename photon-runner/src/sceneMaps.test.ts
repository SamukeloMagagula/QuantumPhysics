import { describe, expect, it } from 'vitest';
import { MAPS, MapDef, getMap, isWalkable, roomContaining } from './sceneMaps';

/** Body radius the game clamps movement by — must match BODY_PAD in the heist. */
const BODY_PAD = 0.5;

function floodReachedRooms(map: MapDef, pad = 0): Set<string> {
  const step = 0.4;
  const seen = new Set<string>();
  const rooms = new Set<string>();
  const start = map.meeting;
  const queue = [{ x: start.x, z: start.z }];

  while (queue.length) {
    const p = queue.pop()!;
    const key = `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!isWalkable(map, p.x, p.z, pad)) continue;

    const room = roomContaining(map, p.x, p.z);
    if (room) rooms.add(room.id);

    for (const [dx, dz] of [
      [step, 0],
      [-step, 0],
      [0, step],
      [0, -step],
    ]) {
      const nx = p.x + dx;
      const nz = p.z + dz;
      if (nx < map.playfield.xMin || nx > map.playfield.xMax) continue;
      if (nz < map.playfield.zMin || nz > map.playfield.zMax) continue;
      queue.push({ x: nx, z: nz });
    }
  }
  return rooms;
}

describe('map registry', () => {
  it('ships more than one map, each with a unique id', () => {
    expect(MAPS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(MAPS.map((m) => m.id)).size).toBe(MAPS.length);
  });

  it('falls back to a real map for an unknown id', () => {
    expect(getMap('does-not-exist').id).toBe(MAPS[0].id);
    expect(getMap(MAPS[1].id).id).toBe(MAPS[1].id);
  });
});

describe.each(MAPS.map((m) => [m.name, m] as const))('%s', (_name, map) => {
  it('has distinct room ids and colours', () => {
    expect(new Set(map.rooms.map((r) => r.id)).size).toBe(map.rooms.length);
    expect(new Set(map.rooms.map((r) => r.color)).size).toBe(map.rooms.length);
  });

  it('keeps rooms from overlapping', () => {
    for (let i = 0; i < map.rooms.length; i++) {
      for (let j = i + 1; j < map.rooms.length; j++) {
        const a = map.rooms[i];
        const b = map.rooms[j];
        const ox = Math.abs(a.center.x - b.center.x) < (a.size.w + b.size.w) / 2;
        const oz = Math.abs(a.center.z - b.center.z) < (a.size.d + b.size.d) / 2;
        expect(ox && oz, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('fits entirely inside its playfield', () => {
    for (const r of map.rooms) {
      expect(r.center.x - r.size.w / 2).toBeGreaterThanOrEqual(map.playfield.xMin);
      expect(r.center.x + r.size.w / 2).toBeLessThanOrEqual(map.playfield.xMax);
      expect(r.center.z - r.size.d / 2).toBeGreaterThanOrEqual(map.playfield.zMin);
      expect(r.center.z + r.size.d / 2).toBeLessThanOrEqual(map.playfield.zMax);
    }
  });

  it('connects every room — no room is stranded', () => {
    const reached = floodReachedRooms(map);
    for (const r of map.rooms) expect(reached.has(r.id), `${r.id} unreachable`).toBe(true);
  });

  it('stays fully connected once the body radius is applied', () => {
    // If a doorway is narrower than the player, the map would silently split
    // in two at runtime. This catches that before it ships.
    const reached = floodReachedRooms(map, BODY_PAD);
    for (const r of map.rooms) {
      expect(reached.has(r.id), `${r.id} unreachable with a ${BODY_PAD} body radius`).toBe(true);
    }
  });

  it('spawns every role on ground a real body can occupy', () => {
    for (const [role, s] of Object.entries(map.spawn)) {
      expect(isWalkable(map, s.x, s.z, BODY_PAD), `${role} spawn is too tight`).toBe(true);
    }
  });

  it('puts every station slot somewhere reachable', () => {
    expect(map.slots).toHaveLength(8);
    expect(new Set(map.slots.map((s) => s.id)).size).toBe(8);
    for (const s of map.slots) {
      expect(isWalkable(map, s.x, s.z, BODY_PAD), `slot ${s.id} is unreachable`).toBe(true);
    }
  });

  it('places the tap, crack console and meeting point on walkable ground', () => {
    for (const [label, pt] of [
      ['tap', map.tap],
      ['crack', map.crack],
      ['meeting', map.meeting],
    ] as const) {
      expect(isWalkable(map, pt.x, pt.z, BODY_PAD), `${label} is unreachable`).toBe(true);
    }
  });

  it('forms a closed vent network with bidirectional links', () => {
    expect(map.vents.length).toBeGreaterThanOrEqual(3);
    for (const v of map.vents) {
      expect(v.links).not.toContain(v.id);
      for (const other of v.links) {
        const target = map.vents.find((x) => x.id === other);
        expect(target, `${v.id} -> unknown vent ${other}`).toBeDefined();
        expect(target!.links, `${other} does not link back to ${v.id}`).toContain(v.id);
      }
      expect(isWalkable(map, v.x, v.z, BODY_PAD), `vent ${v.id} is unreachable`).toBe(true);
    }
  });

  it('places sensors on walkable ground', () => {
    expect(map.sensors.length).toBeGreaterThanOrEqual(2);
    for (const s of map.sensors) {
      expect(isWalkable(map, s.x, s.z, BODY_PAD), `sensor ${s.id} is unreachable`).toBe(true);
    }
  });

  it('uses an earthy palette rather than a neon void', () => {
    // Every palette channel should be a warm/neutral tone, not a saturated blue-black.
    const { air, floor, wall } = map.palette;
    for (const [label, c] of [
      ['floor', floor],
      ['wall', wall],
    ] as const) {
      const r = (c >> 16) & 0xff;
      const b = c & 0xff;
      expect(r, `${label} should be warm (red >= blue)`).toBeGreaterThanOrEqual(b);
    }
    expect(air).toBeGreaterThan(0x000000);
  });
});

describe('isWalkable padding', () => {
  const map = MAPS[0];

  it('rejects a point that is inside a room but within the body radius of a solid wall', () => {
    // Outer wall of the transmitter bay — the far side, with no doorway on it.
    const room = map.rooms[0];
    const hardAgainstWall = { x: room.center.x - room.size.w / 2 + 0.05, z: room.center.z };
    expect(isWalkable(map, hardAgainstWall.x, hardAgainstWall.z, 0)).toBe(true);
    expect(isWalkable(map, hardAgainstWall.x, hardAgainstWall.z, BODY_PAD)).toBe(false);
  });

  it('still allows the middle of a room at full body radius', () => {
    for (const r of map.rooms) {
      expect(isWalkable(map, r.center.x, r.center.z, BODY_PAD)).toBe(true);
    }
  });
});
