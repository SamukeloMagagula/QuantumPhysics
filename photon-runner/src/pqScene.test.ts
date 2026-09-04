import { describe, expect, it } from 'vitest';
import {
  BODY_RADIUS,
  DEPTH_LAYERS,
  HOTSPOTS,
  OBSTACLES,
  SPAWN,
  WALK_POLY,
  canStand,
  depthScale,
  frontEdgeY,
  hotspotAt,
  layerCoversActor,
  pointInPoly,
  resolveMove,
} from './pqScene';

/**
 * The client's traced map is the whole spatial model for this scene, so
 * these tests guard the two things that silently break it: an actor able to
 * stand inside furniture, and an interaction anchor you can never reach.
 */

/**
 * Flood the walkable area from spawn, returning the visited points.
 *
 * The fill walks a lattice anchored on spawn, so it will not generally land
 * exactly on an arbitrary target coordinate — reachability is therefore
 * asked as "did we get within a step of it", not "did we hit that cell".
 */
function reachable(step = 0.006): [number, number][] {
  const seen = new Set<string>();
  const points: [number, number][] = [];
  const queue: [number, number][] = [[SPAWN.x, SPAWN.y]];
  const key = (x: number, y: number) => `${Math.round(x / step)},${Math.round(y / step)}`;
  while (queue.length) {
    const [x, y] = queue.pop()!;
    const k = key(x, y);
    if (seen.has(k)) continue;
    if (!canStand(x, y)) continue;
    seen.add(k);
    points.push([x, y]);
    if (points.length > 40000) break;
    queue.push([x + step, y], [x - step, y], [x, y + step], [x, y - step]);
  }
  return points;
}

describe('pointInPoly', () => {
  it('accepts the interior and rejects the exterior of the walk polygon', () => {
    expect(pointInPoly(0.5, 0.6, WALK_POLY)).toBe(true);
    expect(pointInPoly(0.02, 0.02, WALK_POLY)).toBe(false);
    expect(pointInPoly(0.99, 0.99, WALK_POLY)).toBe(false);
  });
});

describe('canStand', () => {
  it('lets the actor stand at the authored spawn point', () => {
    expect(canStand(SPAWN.x, SPAWN.y)).toBe(true);
  });

  it('keeps the actor out of every traced object footprint', () => {
    // Sample each obstacle's centroid — nothing solid should be standable.
    for (let i = 0; i < OBSTACLES.length; i++) {
      const ob = OBSTACLES[i];
      const cx = ob.reduce((s, p) => s + p[0], 0) / ob.length;
      const cy = ob.reduce((s, p) => s + p[1], 0) / ob.length;
      expect(canStand(cx, cy), `obstacle ${i} centroid is standable`).toBe(false);
    }
  });

  it('keeps the actor inside the room', () => {
    expect(canStand(0.5, 0.05)).toBe(false); // beyond the far wall
    expect(canStand(0.5, 0.98)).toBe(false); // past the near cutaway edge
    expect(canStand(0.02, 0.5)).toBe(false);
  });

  it('uses a body radius rather than a bare point', () => {
    // A point can sit closer to a wall than a body can. Somewhere along the
    // boundary the two answers must differ, or the radius is doing nothing.
    let differed = false;
    for (let t = 0; t < WALK_POLY.length && !differed; t++) {
      const [px, py] = WALK_POLY[t];
      const inx = px + (0.5 - px) * 0.02;
      const iny = py + (0.6 - py) * 0.02;
      if (pointInPoly(inx, iny, WALK_POLY) && !canStand(inx, iny)) differed = true;
    }
    expect(differed).toBe(true);
  });
});

describe('resolveMove', () => {
  it('takes a free move unchanged', () => {
    const to = resolveMove(SPAWN, 0, -0.01);
    expect(to.y).toBeCloseTo(SPAWN.y - 0.01, 6);
  });

  it('slides along an axis instead of stopping dead', () => {
    // Walk hard into the central island from below at an angle: the blocked
    // axis should be dropped and the free one kept.
    const from = { x: 0.5, y: 0.66 };
    expect(canStand(from.x, from.y)).toBe(true);
    const to = resolveMove(from, 0.02, -0.05);
    expect(to.x !== from.x || to.y !== from.y, 'movement was fully blocked').toBe(true);
  });

  it('never returns a position the actor cannot occupy', () => {
    const from = { x: 0.5, y: 0.66 };
    for (const [dx, dy] of [[0.03, 0], [-0.03, 0], [0, 0.03], [0, -0.03], [0.03, -0.03]]) {
      const to = resolveMove(from, dx, dy);
      expect(canStand(to.x, to.y), `moved into a solid at ${to.x},${to.y}`).toBe(true);
    }
  });
});

describe('hotspots', () => {
  it('covers all three stations, one each', () => {
    expect(new Set(HOTSPOTS.map((h) => h.station)).size).toBe(3);
  });

  it('offers each hotspot when standing on its approach point', () => {
    for (const h of HOTSPOTS) {
      expect(hotspotAt(h.approach)?.id, `${h.id} not offered at its own approach`).toBe(h.id);
    }
  });

  it('offers nothing in open floor away from the consoles', () => {
    expect(hotspotAt({ x: 0.2, y: 0.72 })).toBeNull();
  });

  it('puts every approach point on standable floor', () => {
    // An anchor you cannot physically reach is a station that can never open.
    for (const h of HOTSPOTS) {
      expect(canStand(h.approach.x, h.approach.y), `${h.id} approach is not standable`).toBe(true);
    }
  });

  it('can actually walk from spawn to every approach point', () => {
    const cells = reachable();
    for (const h of HOTSPOTS) {
      const near = cells.some(([x, y]) => Math.hypot(x - h.approach.x, y - h.approach.y) <= 0.01);
      expect(near, `${h.id} approach unreachable on foot from spawn`).toBe(true);
    }
  });
});

describe('depthScale', () => {
  it('moves the actor slower at the back of the room than the front', () => {
    expect(depthScale(0.3)).toBeLessThan(depthScale(0.85));
  });

  it('stays within sane bounds across the whole floor', () => {
    for (let y = 0; y <= 1; y += 0.05) {
      const s = depthScale(y);
      expect(s).toBeGreaterThan(0.5);
      expect(s).toBeLessThanOrEqual(1.0001);
    }
  });
});

describe('body radius', () => {
  it('is wider than it is tall, matching the floor perspective', () => {
    // A step "into" the screen covers less image distance than one across
    // it, so the footprint ellipse must be wider than deep.
    expect(BODY_RADIUS.x).toBeGreaterThan(BODY_RADIUS.y);
  });
});

describe('depth ordering', () => {
  it('always draws the cutaway walls in front of the actor', () => {
    const walls = DEPTH_LAYERS.filter((l) => l.alwaysFront);
    expect(walls.length).toBe(2);
    for (const w of walls) expect(layerCoversActor(w, SPAWN.x, SPAWN.y)).toBe(true);
  });

  it('points every furniture layer at a real traced footprint', () => {
    for (const l of DEPTH_LAYERS) {
      if (l.alwaysFront) continue;
      expect(l.footprint, `${l.src} has no footprint`).toBeDefined();
      expect(OBSTACLES[l.footprint!], `${l.src} footprint out of range`).toBeDefined();
    }
  });

  it('ignores an object the actor is not standing in front of or behind', () => {
    // The round table is on the right; an actor over on the far left shares
    // none of its columns, so it must not be considered at all.
    const round = DEPTH_LAYERS.find((l) => l.src === 'round')!;
    expect(layerCoversActor(round, 0.15, 0.6)).toBe(false);
  });

  it('covers the actor when he is behind an object, and not when in front', () => {
    const central = DEPTH_LAYERS.find((l) => l.src === 'central')!;
    const x = 0.52;
    const edge = frontEdgeY(OBSTACLES[central.footprint!], x)!;
    expect(edge).toBeGreaterThan(0);
    expect(layerCoversActor(central, x, edge - 0.05)).toBe(true); // behind it
    expect(layerCoversActor(central, x, edge + 0.05)).toBe(false); // in front
  });

  it('follows a diagonal near edge rather than one flat cutoff', () => {
    // The workstation bank runs diagonally: its near edge must sit at a
    // very different height on the left of the bank than on the right.
    // A single horizontal threshold is exactly what this replaced.
    const bank = OBSTACLES[2];
    const left = frontEdgeY(bank, 0.22)!;
    const right = frontEdgeY(bank, 0.45)!;
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
    expect(Math.abs(right - left)).toBeGreaterThan(0.1);
  });

  it('returns null outside the polygon columns', () => {
    expect(frontEdgeY(OBSTACLES[5], 0.05)).toBeNull();
  });
});
