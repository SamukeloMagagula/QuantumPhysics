/**
 * Phantom Q "Page 8" scene data and movement rules.
 *
 * This is the client's image-to-map model, ported verbatim from their
 * handoff `config.js` / `page08-map.json`. Their contract is explicit and
 * worth restating, because it inverts how the rest of this codebase works:
 *
 *   "The Page 8 image is the visual world. Demarcation supplies spatial
 *    data. Projective mapping supplies floor movement. Do not restart this
 *    scene in Unity or Blender."
 *
 * So there is no geometry here. The rendered illustration *is* the set; all
 * we hold is the spatial intelligence traced over it — a walkable polygon,
 * tight object footprints, and interaction anchors. Every coordinate is
 * normalised 0..1 against the image, which makes the whole thing
 * resolution-independent and lets the canvas be any size.
 *
 * Everything in this module is pure, so the walk rules are unit-tested
 * rather than discovered by walking into a wall.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export type Poly = [number, number][];

/** Logical scene size the client authored against; only the aspect matters. */
export const SCENE_W = 1568;
export const SCENE_H = 1003;
export const SCENE_ASPECT = SCENE_W / SCENE_H;

export const SPAWN: Vec2 = { x: 0.505, y: 0.735 };

/** Player half-extent in normalised units. Wider than tall because the
 * floor is seen in perspective — a step "into" the screen covers less
 * image distance than a step across it. */
export const BODY_RADIUS = { x: 0.0095, y: 0.0065 };

/** The traced outer walkable floor. */
export const WALK_POLY: Poly = [
  [0.094, 0.42], [0.128, 0.368], [0.233, 0.303], [0.43, 0.249], [0.464, 0.253], [0.604, 0.29],
  [0.712, 0.334], [0.823, 0.416], [0.858, 0.503], [0.836, 0.617], [0.797, 0.686], [0.74, 0.752],
  [0.666, 0.812], [0.576, 0.864], [0.5, 0.871], [0.429, 0.853], [0.354, 0.823], [0.279, 0.787],
  [0.205, 0.742], [0.142, 0.681], [0.099, 0.612], [0.094, 0.531],
];

/**
 * Tight object footprints. The client's note matters here: "red lines hug
 * the actual furniture footprint; player clearance is handled separately by
 * bodyRadius" — so these are the true object edges, and the body radius is
 * what keeps the actor off them.
 */
export const OBSTACLES: Poly[] = [
  // Left "Headquarters Status" console
  [[0.1524, 0.3888], [0.2474, 0.35], [0.3763, 0.3061], [0.3763, 0.3659], [0.2985, 0.3908], [0.2985, 0.4177], [0.1575, 0.4506], [0.1531, 0.4387]],
  // Central coordination workstation island
  [[0.3769, 0.4596], [0.4088, 0.4417], [0.4649, 0.4257], [0.5032, 0.3938], [0.5402, 0.3729], [0.5938, 0.4048], [0.6135, 0.4128], [0.669, 0.4546],
   [0.6735, 0.5434], [0.6416, 0.5912], [0.6008, 0.5852], [0.5529, 0.6311], [0.4955, 0.5842], [0.4688, 0.5992], [0.4362, 0.5673], [0.3769, 0.5244]],
  // Front-left workstation bank
  [[0.1811, 0.5105], [0.2079, 0.4766], [0.2423, 0.4975], [0.2621, 0.5135], [0.2997, 0.5484], [0.3565, 0.5533], [0.3661, 0.5992], [0.4388, 0.6062],
   [0.4401, 0.6481], [0.477, 0.665], [0.477, 0.7228], [0.4592, 0.7348], [0.412, 0.6889], [0.3559, 0.652], [0.2959, 0.6181], [0.2417, 0.5793], [0.1856, 0.5384]],
  // Right Communications console
  [[0.6601, 0.348], [0.7079, 0.3689], [0.8291, 0.4098], [0.8297, 0.4566], [0.8099, 0.4706], [0.7296, 0.4307], [0.7194, 0.4158], [0.6633, 0.3888]],
  // Right-front display / credenza
  [[0.7443, 0.5803], [0.7876, 0.5503], [0.7915, 0.6052], [0.8125, 0.6311], [0.8125, 0.678], [0.7526, 0.7318], [0.7328, 0.7188], [0.7328, 0.664]],
  // Round meeting table and chairs
  [[0.6091, 0.7089], [0.6301, 0.7009], [0.6371, 0.7308], [0.676, 0.6939], [0.7003, 0.7458], [0.7136, 0.7198], [0.727, 0.7398], [0.7085, 0.7976],
   [0.6792, 0.8215], [0.6307, 0.8554], [0.5925, 0.8215], [0.5893, 0.7498]],
  // Door bodies
  [[0.0893, 0.344], [0.1237, 0.325], [0.1244, 0.4477], [0.0906, 0.4586]],
  [[0.4037, 0.1715], [0.4362, 0.1555], [0.4369, 0.2782], [0.4037, 0.2951]],
  [[0.6378, 0.2183], [0.6671, 0.2323], [0.6639, 0.3599], [0.6378, 0.346]],
  [[0.8654, 0.332], [0.8992, 0.3519], [0.8986, 0.4347], [0.8648, 0.4566]],
];

/**
 * Depth overlays. Each is a crop of the master image re-drawn *over* the
 * actor when he is behind it, which is what sells a flat image as a space
 * you are standing in. Boxes are in the client's 1568x1003 logical space.
 *
 * `footprint` is the index of the traced obstacle this crop depicts, and is
 * what decides the ordering. A single horizontal threshold cannot express
 * "in front of" for isometric furniture: the workstation bank runs
 * diagonally, so its near edge is much lower on the right than the left,
 * and one flat cutoff either erased the actor while he stood beside it or
 * let him draw over furniture he was plainly behind. Comparing his feet
 * against that object's own near edge *in his column* handles diagonals
 * correctly. `alwaysFront` is for the cutaway walls, which are nearer than
 * anywhere the actor can stand.
 */
export interface DepthLayer {
  src: string;
  box: [number, number, number, number];
  footprint?: number;
  alwaysFront?: boolean;
}

export const DEPTH_LAYERS: DepthLayer[] = [
  { src: 'status', box: [189.5, 237.5, 414.5, 264.5], footprint: 0 },
  { src: 'comms', box: [1005.0, 315.5, 328.0, 232.5], footprint: 3 },
  { src: 'central', box: [473.5, 381.0, 660.5, 303.5], footprint: 1 },
  { src: 'left', box: [125.0, 446.0, 639.0, 260.5], footprint: 2 },
  { src: 'credenza', box: [1081.5, 464.0, 283.0, 285.5], footprint: 4 },
  { src: 'round', box: [874.5, 626.5, 435.0, 269.5], footprint: 5 },
  { src: 'frontL', box: [48.5, 469.0, 750.0, 498.0], alwaysFront: true },
  { src: 'frontR', box: [990.5, 488.0, 476.0, 469.0], alwaysFront: true },
];

/**
 * The y of a polygon's nearest (largest-y) edge in the column at `x`, or
 * null when the polygon does not span that column. This is the object's
 * front edge as seen on screen.
 */
export function frontEdgeY(poly: Poly, x: number): number | null {
  let best: number | null = null;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (xi === xj) continue;
    const lo = Math.min(xi, xj);
    const hi = Math.max(xi, xj);
    if (x < lo || x > hi) continue;
    const y = yi + ((x - xi) / (xj - xi)) * (yj - yi);
    if (best === null || y > best) best = y;
  }
  return best;
}

/**
 * The y of a polygon's farthest (smallest-y) edge in the column at `x`. For
 * a tabletop this is the edge nearest the back wall — which is what hides a
 * person sitting on the far side of it, since everything of them below the
 * table's far edge is behind the table.
 */
export function backEdgeY(poly: Poly, x: number): number | null {
  let best: number | null = null;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (xi === xj) continue;
    const lo = Math.min(xi, xj);
    const hi = Math.max(xi, xj);
    if (x < lo || x > hi) continue;
    const y = yi + ((x - xi) / (xj - xi)) * (yj - yi);
    if (best === null || y < best) best = y;
  }
  return best;
}

/** Should this layer be drawn over an actor whose feet are at (x, y)? */
export function layerCoversActor(layer: DepthLayer, x: number, y: number): boolean {
  if (layer.alwaysFront) return true;
  if (layer.footprint === undefined) return false;
  const edge = frontEdgeY(OBSTACLES[layer.footprint], x);
  if (edge === null) return false; // actor is not in this object's columns
  return y < edge; // behind its near edge
}

export const LAYER_FILES: Record<string, string> = {
  status: 'left_status_desk.png',
  comms: 'right_comms_desk.png',
  central: 'central_table.png',
  left: 'left_workstations.png',
  credenza: 'right_credenza.png',
  round: 'round_table.png',
  frontL: 'front_left_walls.png',
  frontR: 'front_right_walls.png',
};

/**
 * The three interaction points the client traced. Our game has exactly
 * three stations, so each maps onto the console it most naturally is:
 * the communications desk is the line you tap, the headquarters status
 * wall is where error rates surface, and the coordination table is the
 * bench you work at.
 */
export type StationKind = 'attack' | 'forensics' | 'campaign' | 'rack';

export interface Hotspot {
  id: string;
  station: StationKind;
  anchor: Vec2;
  approach: Vec2;
  hitRadius: number;
  kicker: string;
  title: string;
  label: string;
}

export const HOTSPOTS: Hotspot[] = [
  {
    id: 'comms',
    station: 'attack',
    anchor: { x: 0.714, y: 0.436 },
    approach: { x: 0.691, y: 0.574 },
    hitRadius: 0.095,
    kicker: 'SECURE COMMS',
    title: 'COMMUNICATIONS CONSOLE',
    label: 'Tap the line',
  },
  {
    id: 'status',
    station: 'forensics',
    anchor: { x: 0.286, y: 0.405 },
    approach: { x: 0.3192, y: 0.4826 },
    hitRadius: 0.095,
    kicker: 'LIVE OPERATIONS',
    title: 'HEADQUARTERS STATUS',
    label: 'Review the channel',
  },
  {
    // Workstation 04 — the campaign's persistent object. The client's own
    // config labels this hotspot "PLAYER ANCHOR", which is exactly what the
    // bible calls it: the same workstation for the whole game, because it
    // becomes part of the evidence chain.
    id: 'table',
    station: 'campaign',
    anchor: { x: 0.525, y: 0.545 },
    approach: { x: 0.505, y: 0.722 },
    hitRadius: 0.115,
    kicker: 'WORKSTATION 04',
    title: 'COORDINATION TABLE',
    label: 'Log in to Workstation 04',
  },
  {
    // The equipment row along the lower-left glazing. Hardware tasks happen
    // here rather than at Workstation 04, so rebuilding the capture chain
    // means getting up and walking to the hardware — which is what the work
    // actually looks like.
    id: 'rack',
    station: 'rack',
    anchor: { x: 0.3, y: 0.62 },
    approach: { x: 0.27, y: 0.685 },
    hitRadius: 0.09,
    kicker: 'EQUIPMENT ROW',
    title: 'TRAINING RACK',
    label: 'Work on the rack',
  },
];

/** Animated screen glows, in the client's logical pixel space. */
export const SCREENS = [
  { x: 220, y: 254, w: 330, h: 170, phase: 0.2 },
  { x: 1008, y: 322, w: 305, h: 170, phase: 1.7 },
  { x: 1120, y: 505, w: 125, h: 92, phase: 3.2 },
];

// ------------------------------------------------------------------ actor

export type Facing = 'forward' | 'backward' | 'left' | 'right';

/** Sprite rects, straight from the client's atlas spec. */
export const ACTOR = {
  visibleHeight: 108,
  stepsPerSecond: 5,
  idleFrames: {
    forward: [169, 43, 205, 650],
    backward: [730, 43, 204, 650],
    right: [1712, 43, 117, 650],
  } as Record<string, [number, number, number, number]>,
  idleLeftSource: [444, 139, 210, 1097] as [number, number, number, number],
  walkFrames: {
    forward: [[152, 73, 147, 429], [449, 73, 150, 431]],
    backward: [[785, 73, 152, 432], [1099, 73, 152, 432]],
    left: [[108, 605, 219, 404], [403, 605, 224, 404]],
    right: [[756, 605, 221, 405], [1068, 605, 224, 405]],
  } as Record<Facing, [number, number, number, number][]>,
};

// ------------------------------------------------------------------ maths

/** Standard ray-cast point-in-polygon. */
export function pointInPoly(x: number, y: number, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** How many points around the body ellipse are tested. */
const PROBE_COUNT = 12;

/**
 * One room's walkable floor: the outer boundary and everything solid
 * standing on it.
 *
 * The traced constants below are this scene's own floor. Splitting the shape
 * out from the rules is what lets the wings added in `pqRooms.ts` — which
 * derive their polygons from an isometric plan rather than tracing them —
 * be walked by exactly the same code, rather than growing a second, subtly
 * different movement model that only applies to some rooms.
 */
export interface FloorGeometry {
  walk: Poly;
  obstacles: Poly[];
}

/** The operations floor, traced from the illustration. */
export const OPS_FLOOR: FloorGeometry = { walk: WALK_POLY, obstacles: OBSTACLES };

/**
 * Can a body occupy this point on `floor`?
 *
 * Tested as an ellipse rather than a point, because the client's boundaries
 * hug the furniture exactly and expect the body radius to supply the
 * clearance.
 *
 * The perimeter is sampled all the way round rather than at just the four
 * extremes. With only four, a body 0.019 wide will happily slip through a
 * 0.004 gap between two desks — every probe lands in free space while the
 * body plainly does not fit — and the actor walks through solid furniture
 * on the diagonal.
 */
export function canStandOn(
  floor: FloorGeometry,
  x: number,
  y: number,
  rx = BODY_RADIUS.x,
  ry = BODY_RADIUS.y,
): boolean {
  if (!pointInPoly(x, y, floor.walk)) return false;
  for (const ob of floor.obstacles) if (pointInPoly(x, y, ob)) return false;
  for (let i = 0; i < PROBE_COUNT; i++) {
    const a = (i / PROBE_COUNT) * Math.PI * 2;
    const px = x + Math.cos(a) * rx;
    const py = y + Math.sin(a) * ry;
    if (!pointInPoly(px, py, floor.walk)) return false;
    for (const ob of floor.obstacles) if (pointInPoly(px, py, ob)) return false;
  }
  return true;
}

/** `canStandOn` against the operations floor. */
export function canStand(x: number, y: number, rx = BODY_RADIUS.x, ry = BODY_RADIUS.y): boolean {
  return canStandOn(OPS_FLOOR, x, y, rx, ry);
}

/**
 * Slide along walls rather than sticking to them: try the full move, then
 * each axis alone. Without the per-axis fallback, brushing a desk at an
 * angle stops the actor dead, which reads as the controls having failed.
 */
export function resolveMoveOn(
  floor: FloorGeometry,
  from: Vec2,
  dx: number,
  dy: number,
  rx = BODY_RADIUS.x,
  ry = BODY_RADIUS.y,
): Vec2 {
  if (canStandOn(floor, from.x + dx, from.y + dy, rx, ry)) return { x: from.x + dx, y: from.y + dy };
  if (dx !== 0 && canStandOn(floor, from.x + dx, from.y, rx, ry)) return { x: from.x + dx, y: from.y };
  if (dy !== 0 && canStandOn(floor, from.x, from.y + dy, rx, ry)) return { x: from.x, y: from.y + dy };
  return { ...from };
}

export function resolveMove(from: Vec2, dx: number, dy: number): Vec2 {
  return resolveMoveOn(OPS_FLOOR, from, dx, dy);
}

/** Which hotspot, if any, is close enough to offer. Nearest wins. */
export function hotspotAt(pos: Vec2): Hotspot | null {
  let best: Hotspot | null = null;
  let bestD = Infinity;
  for (const h of HOTSPOTS) {
    const d = Math.hypot(h.approach.x - pos.x, h.approach.y - pos.y);
    if (d <= h.hitRadius && d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

/**
 * Perspective foreshortening. The floor recedes, so a fixed step in image
 * space would carry the actor much further "into" the room at the back than
 * at the front. Scaling by depth keeps the walk speed looking constant.
 * `y` is the actor's feet: 0 at the far wall, 1 at the near edge.
 */
export function depthScale(y: number): number {
  return 0.62 + 0.38 * Math.max(0, Math.min(1, (y - 0.25) / 0.62));
}
