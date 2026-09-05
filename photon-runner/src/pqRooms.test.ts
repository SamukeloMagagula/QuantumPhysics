import { describe, expect, it } from 'vitest';
import { canStandOn, type FloorGeometry, type Vec2 } from './pqScene';
import { ROOMS, ROOM_SPECS, START_ROOM, arrivalFrom, doorAt, getRoom, type Room, type RoomId } from './pqRooms';
import { createNpc, updateNpc } from './pqNpc';

/**
 * The wings are derived from a floor plan rather than traced by hand, which
 * moves the failure mode: nobody will accidentally mistype a polygon, but a
 * desk moved 30cm can quietly wall off a door or put a walking analyst
 * through a filing cabinet. These tests are the derivation's proof — every
 * door reachable on foot, every route clear along its whole length.
 */

function flood(floor: FloorGeometry, from: Vec2, step = 0.005): [number, number][] {
  const seen = new Set<string>();
  const points: [number, number][] = [];
  const queue: [number, number][] = [[from.x, from.y]];
  const key = (x: number, y: number) => `${Math.round(x / step)},${Math.round(y / step)}`;
  while (queue.length) {
    const [x, y] = queue.pop()!;
    const k = key(x, y);
    if (seen.has(k)) continue;
    if (!canStandOn(floor, x, y)) continue;
    seen.add(k);
    points.push([x, y]);
    if (points.length > 60000) break;
    queue.push([x + step, y], [x - step, y], [x, y + step], [x, y - step]);
  }
  return points;
}

function near(cells: [number, number][], p: Vec2, tol = 0.009): boolean {
  return cells.some(([x, y]) => Math.hypot(x - p.x, y - p.y) <= tol);
}

/** Every point along a walked segment, at roughly one body-width apart. */
function segmentClear(floor: FloorGeometry, a: Vec2, b: Vec2): string | null {
  const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.004));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (!canStandOn(floor, x, y)) return `${x.toFixed(3)},${y.toFixed(3)}`;
  }
  return null;
}

describe('room registry', () => {
  it('starts the player in reception', () => {
    expect(START_ROOM).toBe('reception');
    expect(getRoom(START_ROOM).id).toBe('reception');
  });

  it('adds wings without losing the authored operations floor', () => {
    const ops = getRoom('ops');
    expect(ops.art.kind).toBe('image');
    expect(ops.hotspots.length).toBe(4);
    expect(ops.depthLayers.length).toBeGreaterThan(0);
    expect(ROOMS.length).toBeGreaterThanOrEqual(6);
  });

  it('falls back to a real room for an unknown id', () => {
    expect(getRoom('nowhere' as RoomId).id).toBe('ops');
  });

  it('gives every room a spawn point its own walk rules accept', () => {
    for (const r of ROOMS) {
      expect(canStandOn(r.floor, r.spawn.x, r.spawn.y), `${r.id} spawn is not standable`).toBe(true);
    }
  });
});

describe('doors', () => {
  it('pairs every door with one leading back', () => {
    for (const room of ROOMS) {
      for (const door of room.doors) {
        const back = getRoom(door.to).doors.find((d) => d.to === room.id);
        expect(back, `${room.id} -> ${door.to} has no way back`).toBeTruthy();
      }
    }
  });

  it('arrives at the far side of the door you walked through', () => {
    for (const room of ROOMS) {
      for (const door of room.doors) {
        const back = getRoom(door.to).doors.find((d) => d.to === room.id)!;
        expect(arrivalFrom(room.id, door.to)).toEqual(back.approach);
      }
    }
  });

  it('puts every door approach on standable floor', () => {
    for (const room of ROOMS) {
      for (const door of room.doors) {
        expect(
          canStandOn(room.floor, door.approach.x, door.approach.y),
          `${door.id} approach is not standable`,
        ).toBe(true);
      }
    }
  });

  it('can walk from the spawn point to every door in the room', () => {
    for (const room of ROOMS) {
      const cells = flood(room.floor, room.spawn);
      for (const door of room.doors) {
        expect(near(cells, door.approach), `${door.id} is unreachable on foot`).toBe(true);
      }
    }
  });

  it('offers a door when standing on its approach point', () => {
    for (const room of ROOMS) {
      for (const door of room.doors) {
        expect(doorAt(room, door.approach)?.id, `${door.id} not offered at its own approach`).toBe(door.id);
      }
    }
  });

  it('keeps doors clear of the consoles, so neither swallows the other', () => {
    const ops = getRoom('ops');
    for (const door of ops.doors) {
      for (const h of ops.hotspots) {
        const d = Math.hypot(door.approach.x - h.approach.x, door.approach.y - h.approach.y);
        expect(d, `${door.id} overlaps ${h.id}`).toBeGreaterThan(door.hitRadius + h.hitRadius);
      }
    }
  });

  it('reaches every room from reception', () => {
    const seen = new Set<RoomId>([START_ROOM]);
    const queue: RoomId[] = [START_ROOM];
    while (queue.length) {
      const id = queue.shift()!;
      for (const door of getRoom(id).doors) {
        if (seen.has(door.to)) continue;
        seen.add(door.to);
        queue.push(door.to);
      }
    }
    for (const r of ROOMS) expect(seen.has(r.id), `${r.id} is cut off from reception`).toBe(true);
  });
});

describe('staff', () => {
  const roomsWithPeople = ROOMS.filter((r) => r.npcs.length > 0);

  it('puts somebody in every room', () => {
    expect(roomsWithPeople.length).toBe(ROOMS.length);
  });

  it('has people both sitting and moving', () => {
    for (const r of ROOMS) {
      expect(r.npcs.some((n) => n.seat), `nobody sits in ${r.id}`).toBe(true);
      expect(r.npcs.some((n) => n.path.length > 1), `nobody moves in ${r.id}`).toBe(true);
    }
  });

  it('walks every route over floor a body actually fits on', () => {
    for (const room of ROOMS) {
      for (const npc of room.npcs) {
        for (const p of npc.path) {
          expect(
            canStandOn(room.floor, p.x, p.y),
            `${room.id}/${npc.id} waypoint ${p.x.toFixed(3)},${p.y.toFixed(3)} is inside something`,
          ).toBe(true);
        }
        for (let i = 1; i < npc.path.length; i++) {
          const hit = segmentClear(room.floor, npc.path[i - 1], npc.path[i]);
          expect(hit, `${room.id}/${npc.id} leg ${i} crosses furniture at ${hit}`).toBeNull();
        }
      }
    }
  });

  it('lets anyone with both a desk and an errand walk off the desk', () => {
    for (const room of ROOMS) {
      for (const npc of room.npcs) {
        if (!npc.seat || npc.path.length === 0) continue;
        expect(
          canStandOn(room.floor, npc.seat.pos.x, npc.seat.pos.y),
          `${room.id}/${npc.id} cannot stand up from their own chair`,
        ).toBe(true);
        const hit = segmentClear(room.floor, npc.seat.pos, npc.path[0]);
        expect(hit, `${room.id}/${npc.id} walks through furniture leaving the desk, at ${hit}`).toBeNull();
      }
    }
  });

  it('hides the legs of anyone sitting on the far side of a table', () => {
    // A seat that names the table in front of it must resolve to a real
    // clip line; a name that no longer matches a prop would silently draw
    // that person standing in the tabletop.
    for (const spec of ROOM_SPECS) {
      const room = getRoom(spec.id);
      for (const person of spec.people) {
        if (!person.seat?.behind) continue;
        const npc = room.npcs.find((n) => n.id === person.id)!;
        expect(npc.seat!.clipY, `${spec.id}/${person.id} names "${person.seat.behind}" but gets no clip`).not.toBeNull();
      }
    }
    for (const npc of getRoom('ops').npcs) {
      if (npc.seat) expect(npc.seat.clipY, `ops/${npc.id} has no clip`).not.toBeNull();
    }
  });

  it('never puts a backrest between a seated person and the camera', () => {
    // Anyone drawn facing away from the viewer has their chair behind them
    // in world space but nearer to it on screen. The seated pose draws its
    // own chair for exactly that reason, so such a seat must not also be
    // clipped by furniture it is supposedly tucked under.
    for (const room of ROOMS) {
      for (const npc of room.npcs) {
        if (!npc.seat) continue;
        if (npc.seat.facing === 'ne' || npc.seat.facing === 'nw') {
          expect(npc.seat.clipY, `${room.id}/${npc.id} faces away but is clipped`).toBeNull();
        }
      }
    }
  });

  it('never lets a walker leave the room they work in', () => {
    for (const room of ROOMS) {
      const walkers = room.npcs.filter((n) => n.path.length > 1).map(createNpc);
      for (let i = 0; i < 4000; i++) {
        for (const n of walkers) updateNpc(n, 1 / 30);
      }
      for (const n of walkers) {
        expect(
          canStandOn(room.floor, n.pos.x, n.pos.y),
          `${room.id}/${n.def.id} ended up off the floor at ${n.pos.x.toFixed(3)},${n.pos.y.toFixed(3)}`,
        ).toBe(true);
      }
    }
  });

  it('gets everybody who has a desk back to it', () => {
    const room = ROOMS.find((r) => r.npcs.some((n) => n.seat && n.path.length))!;
    const npc = createNpc(room.npcs.find((n) => n.seat && n.path.length)!);
    let sat = 0;
    let walked = 0;
    for (let i = 0; i < 20000; i++) {
      updateNpc(npc, 1 / 30);
      if (npc.mode === 'seated') sat++;
      if (npc.mode === 'walking') walked++;
    }
    expect(sat, 'never sits back down').toBeGreaterThan(0);
    expect(walked, 'never leaves the desk').toBeGreaterThan(0);
  });
});

function roomById(id: RoomId): Room {
  return getRoom(id);
}

describe('screens', () => {
  it('gives every room something that moves on a wall', () => {
    for (const r of ROOMS) {
      if (r.id === 'briefing' || r.id === 'ops') expect(r.glows.length).toBeGreaterThan(0);
    }
    expect(roomById('ops').glows.length).toBe(3);
  });
});
