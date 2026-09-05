import { IsoView, depthOf, isoPx } from './pqIso';
import { SCENE_H, SCENE_W } from './pqScene';
import { Prop, RoomSpec, propHeight } from './pqRooms';

/**
 * Painting a wing.
 *
 * The operations floor was illustrated; these rooms are drawn, in the same
 * flat isometric language — grey tile, light walls with a blue-grey capping,
 * navy signage, timber desktops, charcoal hardware — so that walking through
 * a door does not feel like walking into a different product.
 *
 * A room is painted once into an offscreen canvas and then blitted like the
 * master image, so the per-frame cost of a drawn room and a photographed one
 * is identical. Everything here reads the same floor plan the walk rules and
 * the staff read; nothing is positioned twice.
 */

export const ART_SCALE = 1.6;

interface Palette {
  bg: string;
  slab: string;
  floor: string;
  floorAlt: string;
  grout: string;
  rug: string;
  wall: string;
  cap: string;
  skirt: string;
  ink: string;
  accent: string;
}

const OFFICE: Palette = {
  bg: '#ffffff',
  slab: '#b9bec3',
  floor: '#e7e8ea',
  floorAlt: '#dee0e2',
  grout: '#cfd2d5',
  rug: '#bcc0c4',
  wall: '#d8dadb',
  cap: '#8fa0b1',
  skirt: '#b4b9be',
  ink: '#414850',
  accent: '#25365d',
};

const COOL: Palette = {
  bg: '#ffffff',
  slab: '#a3abb2',
  floor: '#ced4d9',
  floorAlt: '#c5ccd2',
  grout: '#b4bcc3',
  rug: '#aab2b9',
  wall: '#c3cad0',
  cap: '#758494',
  skirt: '#a6aeb5',
  ink: '#39414a',
  accent: '#1b2a49',
};

const WOOD = '#8b6c4a';
const METAL = '#3d434a';
const PANEL = '#4b525a';
const SCREEN = '#1b2634';
const SCREEN_LIT = '#2f5a78';
const FABRIC = '#464f5d';
const PORCELAIN = '#eef1f3';
const LEAF = '#4e7d43';
const LEAF_DARK = '#3c6434';

/** Thickness of the two back walls, in metres. */
const WALL_T = 0.24;
/** How far the floor slab drops below the walking surface. */
const SLAB = 0.3;

/**
 * Brighten or darken a colour, either a `#rrggbb` hex literal or one of this
 * function's own `rgb(...)` outputs — box() shades an already-shaded face
 * colour for its cupboard/cabinet doors, so a version that only understood
 * hex would parse that second call into `NaN`, which paints solid black.
 */
function shade(colour: string, k: number): string {
  let r: number;
  let g: number;
  let b: number;
  if (colour.startsWith('#')) {
    const n = parseInt(colour.slice(1), 16);
    r = (n >> 16) & 255;
    g = (n >> 8) & 255;
    b = n & 255;
  } else {
    const m = colour.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    [r, g, b] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  }
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp(r * k)},${clamp(g * k)},${clamp(b * k)})`;
}

/** Light falls from the upper left, so the two visible faces differ. */
const FACE_X = 0.79;
const FACE_Y = 0.92;

type Pt = readonly [number, number];

class Brush {
  readonly s: number;

  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly view: IsoView,
    width: number,
    readonly pal: Palette,
  ) {
    this.s = width / SCENE_W;
  }

  p(x: number, y: number, z = 0): Pt {
    const q = isoPx(this.view, x, y, z);
    return [q.x * this.s, q.y * this.s];
  }

  /** One metre, as a screen distance. Used for line weights and text. */
  get m(): number {
    return this.view.tx * this.s;
  }

  quad(pts: Pt[], fill: string, stroke?: string, lw = 0.012): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(0.6, this.m * lw);
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  /** A box standing on the floor, drawn as its two visible faces plus the top. */
  box(x: number, y: number, z: number, w: number, d: number, h: number, colour: string, outline = true): void {
    const line = outline ? shade(colour, 0.55) : undefined;
    const A = this.p(x, y, z + h);
    const B = this.p(x + w, y, z + h);
    const C = this.p(x + w, y + d, z + h);
    const D = this.p(x, y + d, z + h);
    const B0 = this.p(x + w, y, z);
    const C0 = this.p(x + w, y + d, z);
    const D0 = this.p(x, y + d, z);
    this.quad([D, C, C0, D0], shade(colour, FACE_Y), line);
    // Seen from the front, a box shows no side face worth drawing.
    if (this.view.mode !== 'plan') this.quad([B, C, C0, B0], shade(colour, FACE_X), line);
    this.quad([A, B, C, D], colour, line);
  }

  /**
   * A flat label floating over the floor, in screen space — the room name
   * plaques of the facility drawing, and the padlock badges over its shut
   * doors. Not sheared into the projection on purpose: they are captions on
   * the picture, not paint on a wall.
   */
  billboard(x: number, y: number, z: number, text: string, opts: { pad?: number; size?: number; fill?: string; ink?: string; glyph?: boolean } = {}): void {
    const { ctx } = this;
    const c = this.p(x, y, z);
    const size = (opts.size ?? 0.42) * this.m;
    ctx.save();
    ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = opts.glyph ? size * 1.1 : ctx.measureText(text).width;
    const padX = (opts.pad ?? 0.6) * size;
    const padY = 0.55 * size;
    const bw = tw + padX * 2;
    const bh = size + padY * 2;
    ctx.beginPath();
    ctx.roundRect(c[0] - bw / 2, c[1] - bh / 2, bw, bh, size * 0.35);
    ctx.fillStyle = opts.fill ?? this.pal.accent;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = Math.max(1, size * 0.06);
    ctx.stroke();
    if (opts.glyph) {
      // A padlock: shackle over a body.
      const g = size * 0.62;
      ctx.strokeStyle = opts.ink ?? '#ffffff';
      ctx.lineWidth = Math.max(1.2, g * 0.16);
      ctx.beginPath();
      ctx.arc(c[0], c[1] - g * 0.25, g * 0.32, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = opts.ink ?? '#ffffff';
      ctx.beginPath();
      ctx.roundRect(c[0] - g * 0.5, c[1] - g * 0.2, g, g * 0.75, g * 0.12);
      ctx.fill();
    } else {
      ctx.fillStyle = opts.ink ?? '#ffffff';
      ctx.fillText(text, c[0], c[1] + size * 0.04);
    }
    ctx.restore();
  }

  /** The top face alone — for anything laid flat on a surface. */
  slabTop(x: number, y: number, z: number, w: number, d: number, colour: string, outline?: string): void {
    this.quad(
      [this.p(x, y, z), this.p(x + w, y, z), this.p(x + w, y + d, z), this.p(x, y + d, z)],
      colour,
      outline,
    );
  }

  /** A circle on the floor plane comes out as an ellipse. */
  disc(cx: number, cy: number, r: number, z: number, colour: string, outline?: string): void {
    const { ctx } = this;
    const c = this.p(cx, cy, z);
    ctx.save();
    ctx.translate(c[0], c[1]);
    ctx.beginPath();
    const k = this.view.mode === 'plan' ? 1 : 1.414;
    ctx.ellipse(0, 0, r * this.view.tx * this.s * k, r * this.view.ty * this.s * k, 0, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = Math.max(0.6, this.m * 0.012);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Text lying in the plane of a wall.
   *
   * Both walls run away from the viewer, so lettering has to be sheared into
   * the same projection as everything else or a sign reads as a sticker on
   * the screen rather than paint on a wall. Each wall is traversed in the
   * direction that keeps the transform orientation-preserving — otherwise
   * the words come out mirrored.
   */
  wallText(
    wall: 'left' | 'right',
    u: number,
    z: number,
    text: string,
    heightM: number,
    colour: string,
  ): void {
    const { ctx } = this;
    const K = 100;
    const origin = wall === 'right' ? this.p(u, 0, z) : this.p(0, u, z);
    // One metre along the wall and one metre down it, as screen vectors —
    // whatever the projection.
    const along = wall === 'right' ? this.p(u + 1, 0, z) : this.p(0, u - 1, z);
    const down = wall === 'right' ? this.p(u, 0, z - 1) : this.p(0, u, z - 1);
    ctx.save();
    ctx.setTransform(
      (along[0] - origin[0]) / K,
      (along[1] - origin[1]) / K,
      (down[0] - origin[0]) / K,
      (down[1] - origin[1]) / K,
      origin[0],
      origin[1],
    );
    ctx.font = `700 ${heightM * K}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = colour;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

function paintFloor(b: Brush, spec: RoomSpec): void {
  const { pal } = b;
  const { w, d } = spec;
  // The slab the room stands on, so the near edges read as a cut rather than
  // as the floor simply stopping.
  b.box(0, 0, -SLAB, w, d, SLAB, pal.floor, false);
  b.quad(
    [b.p(0, d, 0), b.p(w, d, 0), b.p(w, d, -SLAB), b.p(0, d, -SLAB)],
    shade(pal.slab, FACE_Y),
  );
  b.quad(
    [b.p(w, 0, 0), b.p(w, d, 0), b.p(w, d, -SLAB), b.p(w, 0, -SLAB)],
    shade(pal.slab, FACE_X),
  );

  const T = 1.5;
  for (let i = 0; i * T < w; i++) {
    for (let j = 0; j * T < d; j++) {
      if ((i + j) % 2 === 0) continue;
      b.slabTop(i * T, j * T, 0, Math.min(T, w - i * T), Math.min(T, d - j * T), pal.floorAlt);
    }
  }
  b.ctx.save();
  b.ctx.strokeStyle = pal.grout;
  b.ctx.lineWidth = Math.max(0.5, b.m * 0.008);
  for (let i = 0; i * T <= w + 0.001; i++) {
    const a = b.p(i * T, 0);
    const c = b.p(i * T, d);
    b.ctx.beginPath();
    b.ctx.moveTo(a[0], a[1]);
    b.ctx.lineTo(c[0], c[1]);
    b.ctx.stroke();
  }
  for (let j = 0; j * T <= d + 0.001; j++) {
    const a = b.p(0, j * T);
    const c = b.p(w, j * T);
    b.ctx.beginPath();
    b.ctx.moveTo(a[0], a[1]);
    b.ctx.lineTo(c[0], c[1]);
    b.ctx.stroke();
  }
  b.ctx.restore();
}

function paintDoorway(b: Brush, wall: 'left' | 'right', at: number, width: number, label: string): void {
  const { pal } = b;
  const h = 2.35;
  const half = width / 2;
  const frame = shade(pal.wall, 0.72);
  const leaf = '#7a5c3f';
  const on = (u0: number, u1: number, z0: number, z1: number, colour: string, stroke?: string) => {
    const pt = (u: number, z: number) => (wall === 'right' ? b.p(u, 0.02, z) : b.p(0.02, u, z));
    b.quad([pt(u0, z1), pt(u1, z1), pt(u1, z0), pt(u0, z0)], colour, stroke);
  };
  on(at - half - 0.14, at + half + 0.14, 0, h + 0.14, frame, shade(pal.ink, 1.6));
  on(at - half, at + half, 0, h, leaf, shade(leaf, 0.6));
  on(at - half + 0.06, at - 0.02, 0.1, h - 0.1, shade(leaf, 1.06));
  on(at + 0.02, at + half - 0.06, 0.1, h - 0.1, shade(leaf, 1.06));
  // Vision panel and handles.
  on(at - half + 0.28, at - 0.16, 1.5, 2.05, '#8fb7c9');
  on(at + 0.16, at + half - 0.28, 1.5, 2.05, '#8fb7c9');
  on(at - 0.16, at - 0.08, 0.95, 1.15, '#c9ccd0');
  on(at + 0.08, at + 0.16, 0.95, 1.15, '#c9ccd0');
  // The lit sign over the door is the whole navigation system for the wing,
  // so it sizes to its own text rather than the text spilling past a board
  // sized only for the doorway underneath it.
  const text = label.toUpperCase();
  const size = 0.3;
  const span = text.length * size * 0.64;
  const boardHalf = Math.max(half + 0.2, span / 2 + 0.25);
  on(at - boardHalf, at + boardHalf, h + 0.24, h + 0.82, b.pal.accent, shade(b.pal.accent, 0.6));
  b.wallText(wall, wall === 'right' ? at - span / 2 : at + span / 2, h + 0.38, text, size, '#dff0fb');
}

/**
 * Half-width, in metres, of a door's own lit sign along the wall it is cut
 * into. Exported so the room registry's own tests can check nothing else
 * mounted on that wall — a wallsign or a whiteboard, say — falls inside it;
 * `paintDoorway` above is the drawing side of the same number.
 */
export function doorSignHalfSpan(width: number, label: string): number {
  const span = label.length * 0.3 * 0.64;
  return Math.max(width / 2 + 0.2, span / 2 + 0.25);
}

/**
 * The building seen in plan: a full-height back wall, thin side walls
 * leaning out with the perspective, and a low front wall with windows —
 * cut away wherever an annex (the entrance walkway) meets it.
 */
function paintShell(b: Brush, spec: RoomSpec): void {
  const { pal } = b;
  const { w, d } = spec;
  const H = spec.wall;
  const low = 1.35;
  b.box(-WALL_T, -WALL_T, 0, w + WALL_T * 2, WALL_T, H, pal.wall);
  b.box(-WALL_T, -WALL_T, 0, WALL_T, d + WALL_T * 2, H * 0.55, pal.wall);
  b.box(w, -WALL_T, 0, WALL_T, d + WALL_T * 2, H * 0.55, pal.wall);
  b.box(-WALL_T - 0.05, -WALL_T - 0.05, H, w + WALL_T * 2 + 0.1, WALL_T + 0.1, 0.16, pal.cap);
  b.quad([b.p(0, 0, 0.13), b.p(w, 0, 0.13), b.p(w, 0, 0), b.p(0, 0, 0)], pal.skirt);
  for (const door of spec.doors) paintDoorway(b, door.wall, door.at, door.width ?? 1.6, door.label);

  // Front wall, in segments between the annexes.
  const cuts = (spec.annex ?? []).map((a) => [a.x, a.x + a.w] as const).sort((p, q) => p[0] - q[0]);
  let x0 = -WALL_T;
  const segs: [number, number][] = [];
  for (const [c0, c1] of cuts) {
    if (c0 > x0) segs.push([x0, c0]);
    x0 = c1;
  }
  if (x0 < w + WALL_T) segs.push([x0, w + WALL_T]);
  for (const [a, c] of segs) {
    b.box(a, d, 0, c - a, WALL_T, low, pal.wall);
    b.box(a - 0.03, d - 0.03, low, c - a + 0.06, WALL_T + 0.06, 0.12, pal.cap);
    // Windows along the run.
    const span = c - a;
    const n = Math.max(1, Math.floor(span / 3.2));
    for (let i = 0; i < n; i++) {
      const wx = a + (span / n) * i + (span / n) * 0.18;
      const ww = (span / n) * 0.64;
      b.quad(
        [b.p(wx, d + WALL_T, low - 0.18), b.p(wx + ww, d + WALL_T, low - 0.18), b.p(wx + ww, d + WALL_T, 0.35), b.p(wx, d + WALL_T, 0.35)],
        '#a9cfe0',
        shade(pal.wall, 0.6),
      );
    }
  }
  // The annex floor itself, as paving outside the building.
  for (const a of spec.annex ?? []) {
    b.slabTop(a.x, a.y, 0, a.w, a.d, shade(pal.floor, 0.97), pal.grout);
    b.quad([b.p(a.x, a.y + a.d, 0), b.p(a.x + a.w, a.y + a.d, 0), b.p(a.x + a.w, a.y + a.d, -SLAB), b.p(a.x, a.y + a.d, -SLAB)], shade(pal.slab, FACE_Y));
    const T = 1.5;
    b.ctx.save();
    b.ctx.strokeStyle = pal.grout;
    b.ctx.lineWidth = Math.max(0.5, b.m * 0.008);
    for (let i = 1; i * T < a.w; i++) {
      const s0 = b.p(a.x + i * T, a.y);
      const s1 = b.p(a.x + i * T, a.y + a.d);
      b.ctx.beginPath();
      b.ctx.moveTo(s0[0], s0[1]);
      b.ctx.lineTo(s1[0], s1[1]);
      b.ctx.stroke();
    }
    for (let j = 1; j * T < a.d; j++) {
      const s0 = b.p(a.x, a.y + j * T);
      const s1 = b.p(a.x + a.w, a.y + j * T);
      b.ctx.beginPath();
      b.ctx.moveTo(s0[0], s0[1]);
      b.ctx.lineTo(s1[0], s1[1]);
      b.ctx.stroke();
    }
    b.ctx.restore();
  }
}

function paintWalls(b: Brush, spec: RoomSpec): void {
  if (b.view.mode === 'plan') {
    paintShell(b, spec);
    return;
  }
  const { pal } = b;
  const { w, d } = spec;
  const H = spec.wall;

  // Right-hand wall (the y = 0 plane), then the left (x = 0), which laps it
  // at the far corner.
  b.box(0, -WALL_T, 0, w, WALL_T, H, pal.wall);
  b.box(-WALL_T, -WALL_T, 0, WALL_T, d + WALL_T, H, pal.wall);
  b.box(0, -WALL_T - 0.05, H, w, WALL_T + 0.1, 0.18, pal.cap);
  b.box(-WALL_T - 0.05, -WALL_T - 0.05, H, WALL_T + 0.1, d + WALL_T + 0.1, 0.18, pal.cap);

  // Skirting along the inside of both walls.
  b.quad([b.p(0, 0, 0.13), b.p(w, 0, 0.13), b.p(w, 0, 0), b.p(0, 0, 0)], pal.skirt);
  b.quad([b.p(0, 0, 0.13), b.p(0, d, 0.13), b.p(0, d, 0), b.p(0, 0, 0)], pal.skirt);

  for (const door of spec.doors) paintDoorway(b, door.wall, door.at, door.width ?? 1.6, door.label);
}

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------

function monitor(b: Brush, x: number, y: number, z: number, wide: number): void {
  // Screen faces +y, which is the face the camera can see and the side the
  // person working at it sits on.
  b.box(x, y, z, wide, 0.06, 0.42, METAL);
  b.quad(
    [b.p(x + 0.03, y + 0.06, z + 0.4), b.p(x + wide - 0.03, y + 0.06, z + 0.4), b.p(x + wide - 0.03, y + 0.06, z + 0.06), b.p(x + 0.03, y + 0.06, z + 0.06)],
    SCREEN,
  );
  b.quad(
    [b.p(x + 0.06, y + 0.06, z + 0.36), b.p(x + wide * 0.55, y + 0.06, z + 0.36), b.p(x + wide * 0.55, y + 0.06, z + 0.24), b.p(x + 0.06, y + 0.06, z + 0.24)],
    SCREEN_LIT,
  );
  b.quad(
    [b.p(x + 0.06, y + 0.06, z + 0.2), b.p(x + wide * 0.8, y + 0.06, z + 0.2), b.p(x + wide * 0.8, y + 0.06, z + 0.14), b.p(x + 0.06, y + 0.06, z + 0.14)],
    shade(SCREEN_LIT, 0.72),
  );
}

function deskTop(b: Brush, p: Prop, h: number): void {
  b.box(p.x, p.y, h - 0.06, p.w, p.d, 0.06, WOOD);
  const legs = 0.08;
  for (const [lx, ly] of [
    [p.x + 0.1, p.y + 0.1],
    [p.x + p.w - 0.1 - legs, p.y + 0.1],
    [p.x + 0.1, p.y + p.d - 0.1 - legs],
    [p.x + p.w - 0.1 - legs, p.y + p.d - 0.1 - legs],
  ]) {
    b.box(lx, ly, 0, legs, legs, h - 0.06, METAL, false);
  }
}

/**
 * An office chair standing in the `w` x `d` footprint at (x, y), backrest on
 * the side opposite `face` — the same 0/1/2/3 convention as every other
 * fronted prop. Shared by the standalone `chair` prop and by `bench`, which
 * draws one per seat whether or not anyone is currently in it.
 */
function drawChair(b: Brush, x: number, y: number, w: number, d: number, face: 0 | 1 | 2 | 3): void {
  const cx = x + w / 2;
  const cy = y + d / 2;
  b.box(cx - 0.05, cy - 0.05, 0, 0.1, 0.1, 0.42, METAL, false);
  b.disc(cx, cy, 0.28, 0.02, shade(METAL, 0.9));
  b.box(x + 0.05, y + 0.05, 0.42, w - 0.1, d - 0.1, 0.07, '#33383f');
  // The backrest stands on the side the chair faces away from.
  if (face === 1) b.box(x + 0.05, y, 0.49, w - 0.1, 0.08, 0.42, '#33383f');
  else if (face === 3) b.box(x + 0.05, y + d - 0.08, 0.49, w - 0.1, 0.08, 0.42, '#33383f');
  else if (face === 0) b.box(x, y + 0.05, 0.49, 0.08, d - 0.1, 0.42, '#33383f');
  else b.box(x + w - 0.08, y + 0.05, 0.49, 0.08, d - 0.1, 0.42, '#33383f');
}

function paintProp(b: Brush, p: Prop): void {
  const h = propHeight(p);
  const z = p.z ?? 0;
  const { pal } = b;

  switch (p.kind) {
    case 'rug':
      b.slabTop(p.x, p.y, 0.004, p.w, p.d, pal.rug, shade(pal.rug, 0.82));
      b.slabTop(p.x + 0.22, p.y + 0.22, 0.006, p.w - 0.44, p.d - 0.44, shade(pal.rug, 1.06));
      break;

    case 'counter': {
      b.box(p.x, p.y, 0, p.w, p.d, h - 0.05, PANEL);
      b.box(p.x - 0.06, p.y - 0.06, h - 0.05, p.w + 0.12, p.d + 0.12, 0.05, WOOD);
      // Brand band across the public face.
      b.quad(
        [
          b.p(p.x + 0.1, p.y + p.d, 0.85),
          b.p(p.x + p.w - 0.1, p.y + p.d, 0.85),
          b.p(p.x + p.w - 0.1, p.y + p.d, 0.4),
          b.p(p.x + 0.1, p.y + p.d, 0.4),
        ],
        shade(pal.accent, 1.05),
      );
      monitor(b, p.x + p.w * 0.62, p.y + 0.18, h, 0.5);
      b.box(p.x + p.w * 0.2, p.y + 0.3, h, 0.34, 0.22, 0.16, PORCELAIN);
      break;
    }

    case 'bench': {
      deskTop(b, p, h);
      const n = p.units ?? Math.max(1, Math.round(p.w / 2));
      const cell = p.w / n;
      for (let i = 0; i < n; i++) {
        const cx = p.x + cell * i;
        monitor(b, cx + cell * 0.3, p.y + p.d * 0.28, h, Math.min(0.62, cell * 0.44));
        b.box(cx + cell * 0.28, p.y + p.d * 0.62, h, cell * 0.44, 0.16, 0.02, '#2c3138');
        b.box(cx + cell * 0.78, p.y + p.d * 0.62, h, 0.09, 0.13, 0.03, '#2c3138');
        // Every place at the bench is furnished, whether or not anyone is
        // sitting there right now — a row of empty chairs reads as a desk
        // that people work at; bare desktops read as an evacuated building.
        drawChair(b, cx + cell * 0.3 - 0.3, p.y + p.d + 0.15, 0.6, 0.6, 3);
      }
      break;
    }

    case 'sofa':
    case 'armchair': {
      const backFar = p.face === 1 || p.face === 0;
      b.box(p.x, p.y, 0, p.w, p.d, 0.4, shade(FABRIC, 0.86));
      b.box(p.x + 0.06, p.y + 0.06, 0.4, p.w - 0.12, p.d - 0.12, 0.06, FABRIC);
      if (p.face === 1 || p.face === 3) {
        const by = backFar ? p.y : p.y + p.d - 0.18;
        b.box(p.x, by, 0.4, p.w, 0.18, h - 0.4, shade(FABRIC, 1.1));
      } else {
        const bx = p.face === 0 ? p.x : p.x + p.w - 0.18;
        b.box(bx, p.y, 0.4, 0.18, p.d, h - 0.4, shade(FABRIC, 1.1));
      }
      break;
    }

    case 'lowtable':
      b.box(p.x + 0.08, p.y + 0.08, 0, p.w - 0.16, p.d - 0.16, h - 0.05, METAL, false);
      b.box(p.x, p.y, h - 0.05, p.w, p.d, 0.05, WOOD);
      b.box(p.x + p.w * 0.4, p.y + p.d * 0.35, h, 0.22, 0.22, 0.03, PORCELAIN);
      break;

    case 'roundtable': {
      const r = Math.min(p.w, p.d) / 2;
      b.box(p.x + p.w / 2 - 0.09, p.y + p.d / 2 - 0.09, 0, 0.18, 0.18, h - 0.05, METAL, false);
      b.disc(p.x + p.w / 2, p.y + p.d / 2, r, h, WOOD, shade(WOOD, 0.6));
      b.disc(p.x + p.w * 0.36, p.y + p.d * 0.4, 0.11, h + 0.01, PORCELAIN);
      b.disc(p.x + p.w * 0.66, p.y + p.d * 0.58, 0.11, h + 0.01, PORCELAIN);
      break;
    }

    case 'boardtable': {
      b.box(p.x + 0.5, p.y + 0.35, 0, 0.5, p.d - 0.7, h - 0.06, METAL, false);
      b.box(p.x + p.w - 1.0, p.y + 0.35, 0, 0.5, p.d - 0.7, h - 0.06, METAL, false);
      b.box(p.x, p.y, h - 0.06, p.w, p.d, 0.06, WOOD);
      for (let i = 0; i < 3; i++) {
        const lx = p.x + 0.9 + i * (p.w - 2.0) * 0.5;
        b.box(lx, p.y + p.d * 0.3, h, 0.42, 0.3, 0.02, '#2c3138');
        b.box(lx, p.y + p.d * 0.3, h, 0.42, 0.03, 0.25, '#2c3138');
      }
      break;
    }

    case 'plant': {
      const cx = p.x + p.w / 2;
      const cy = p.y + p.d / 2;
      b.box(p.x, p.y, 0, p.w, p.d, 0.42, PORCELAIN);
      b.disc(cx, cy, p.w * 0.42, 0.44, '#5b4a38');
      const leaves = 7;
      for (let i = 0; i < leaves; i++) {
        const a = (i / leaves) * Math.PI * 2 + 0.4;
        const rr = p.w * (0.36 + 0.18 * ((i * 7) % 3));
        b.disc(cx + Math.cos(a) * rr * 0.5, cy + Math.sin(a) * rr * 0.5, p.w * 0.34, 0.46 + (h - 0.46) * (0.35 + 0.1 * (i % 3)), i % 2 ? LEAF : LEAF_DARK);
      }
      b.disc(cx, cy, p.w * 0.4, h, shade(LEAF, 1.08));
      break;
    }

    case 'rack': {
      const n = p.units ?? Math.max(1, Math.round(p.w / 1.4));
      const cell = p.w / n;
      for (let i = 0; i < n; i++) {
        const rx = p.x + cell * i + 0.04;
        b.box(rx, p.y, 0, cell - 0.08, p.d, h, shade(METAL, 0.8));
        for (let u = 0; u < 7; u++) {
          const uz = 0.18 + u * (h - 0.4) / 7;
          b.quad(
            [
              b.p(rx + 0.08, p.y + p.d, uz + 0.14),
              b.p(rx + cell - 0.16, p.y + p.d, uz + 0.14),
              b.p(rx + cell - 0.16, p.y + p.d, uz),
              b.p(rx + 0.08, p.y + p.d, uz),
            ],
            u % 3 === 1 ? '#243244' : '#1d2530',
          );
          b.quad(
            [
              b.p(rx + 0.12, p.y + p.d, uz + 0.1),
              b.p(rx + 0.2, p.y + p.d, uz + 0.1),
              b.p(rx + 0.2, p.y + p.d, uz + 0.04),
              b.p(rx + 0.12, p.y + p.d, uz + 0.04),
            ],
            u % 2 ? '#57d6a0' : '#5ec8e8',
          );
        }
      }
      break;
    }

    case 'cabinet': {
      b.box(p.x, p.y, 0, p.w, p.d, h, PANEL);
      const doors = Math.max(2, Math.round(p.w / 0.9));
      for (let i = 0; i < doors; i++) {
        const dx = p.x + (p.w / doors) * i + 0.05;
        b.quad(
          [
            b.p(dx, p.y + p.d, h - 0.1),
            b.p(dx + p.w / doors - 0.1, p.y + p.d, h - 0.1),
            b.p(dx + p.w / doors - 0.1, p.y + p.d, 0.1),
            b.p(dx, p.y + p.d, 0.1),
          ],
          shade(PANEL, 1.12),
        );
      }
      break;
    }

    case 'kitchen': {
      b.box(p.x, p.y, 0, p.w, p.d, h - 0.05, PORCELAIN);
      b.box(p.x - 0.04, p.y - 0.04, h - 0.05, p.w + 0.08, p.d + 0.08, 0.05, '#5c636b');
      const n = p.units ?? 4;
      for (let i = 0; i < n; i++) {
        const dx = p.x + (p.w / n) * i + 0.05;
        b.quad(
          [
            b.p(dx, p.y + p.d, h - 0.15),
            b.p(dx + p.w / n - 0.1, p.y + p.d, h - 0.15),
            b.p(dx + p.w / n - 0.1, p.y + p.d, 0.1),
            b.p(dx, p.y + p.d, 0.1),
          ],
          shade(PORCELAIN, 0.94),
        );
      }
      // Sink and the coffee machine everyone is queueing for.
      b.slabTop(p.x + p.w * 0.12, p.y + 0.18, h, 0.6, 0.44, '#9aa3ab', '#7c858d');
      b.box(p.x + p.w * 0.62, p.y + 0.16, h, 0.42, 0.42, 0.52, '#33383f');
      b.box(p.x + p.w * 0.66, p.y + 0.14, h + 0.06, 0.14, 0.1, 0.16, '#5ec8e8');
      break;
    }

    case 'cupboard':
      b.box(p.x, p.y, z, p.w, p.d + 0.34, h, shade(PORCELAIN, 0.96));
      break;

    case 'fridge':
      b.box(p.x, p.y, 0, p.w, p.d, h, '#c8ced3');
      b.quad(
        [b.p(p.x + p.w - 0.12, p.y + p.d, h - 0.3), b.p(p.x + p.w - 0.06, p.y + p.d, h - 0.3), b.p(p.x + p.w - 0.06, p.y + p.d, h - 1.1), b.p(p.x + p.w - 0.12, p.y + p.d, h - 1.1)],
        '#8b939a',
      );
      break;

    case 'printer':
      b.box(p.x, p.y, 0, p.w, p.d, h * 0.62, PANEL);
      b.box(p.x + 0.05, p.y + 0.05, h * 0.62, p.w - 0.1, p.d - 0.1, h * 0.38, shade(PANEL, 1.15));
      b.slabTop(p.x + 0.12, p.y + 0.1, h + 0.01, p.w - 0.3, 0.3, PORCELAIN);
      break;

    case 'cooler':
      b.box(p.x, p.y, 0, p.w, p.d, h * 0.7, PORCELAIN);
      b.disc(p.x + p.w / 2, p.y + p.d / 2, p.w * 0.36, h * 0.7, '#a8d8e8', '#7fb6ca');
      b.box(p.x + p.w * 0.22, p.y + p.d * 0.22, h * 0.7, p.w * 0.56, p.d * 0.56, h * 0.3, '#a8d8e8', false);
      break;

    case 'chair':
      drawChair(b, p.x, p.y, p.w, p.d, p.face ?? 3);
      break;

    case 'wall':
      b.box(p.x, p.y, 0, p.w, p.d, h, pal.wall);
      b.box(p.x - 0.03, p.y - 0.03, h, p.w + 0.06, p.d + 0.06, 0.12, pal.cap, false);
      break;

    case 'door':
    case 'lockdoor': {
      // A door leaf standing in its opening, drawn a little shorter than
      // the wall so the lintel above it reads. Padlocks are added in the
      // caption pass, over everything.
      const leaf = '#7a5c3f';
      const across = p.w >= p.d;
      b.box(p.x, p.y, 0, p.w, p.d, h, leaf);
      if (across) {
        b.quad(
          [b.p(p.x + 0.25, p.y + p.d, h - 0.35), b.p(p.x + p.w / 2 - 0.06, p.y + p.d, h - 0.35), b.p(p.x + p.w / 2 - 0.06, p.y + p.d, h - 0.9), b.p(p.x + 0.25, p.y + p.d, h - 0.9)],
          '#8fb7c9',
        );
        b.quad(
          [b.p(p.x + p.w / 2 + 0.06, p.y + p.d, h - 0.35), b.p(p.x + p.w - 0.25, p.y + p.d, h - 0.35), b.p(p.x + p.w - 0.25, p.y + p.d, h - 0.9), b.p(p.x + p.w / 2 + 0.06, p.y + p.d, h - 0.9)],
          '#8fb7c9',
        );
      }
      b.box(p.x - 0.08, p.y - 0.08, h, p.w + 0.16, p.d + 0.16, 0.1, shade(pal.wall, 0.7), false);
      break;
    }

    case 'plaque':
      // Deferred to the caption pass.
      break;

    case 'kiosk':
      b.box(p.x + p.w * 0.25, p.y + p.d * 0.25, 0, p.w * 0.5, p.d * 0.5, h - 0.34, METAL, false);
      b.box(p.x, p.y, h - 0.34, p.w, p.d, 0.34, PANEL);
      b.quad(
        [b.p(p.x + 0.08, p.y + p.d, h), b.p(p.x + p.w - 0.08, p.y + p.d, h), b.p(p.x + p.w - 0.08, p.y + p.d, h - 0.28), b.p(p.x + 0.08, p.y + p.d, h - 0.28)],
        SCREEN_LIT,
      );
      break;

    case 'barrier':
      b.box(p.x, p.y, 0, p.w * 0.18, p.d, h, PANEL);
      b.box(p.x + p.w * 0.82, p.y, 0, p.w * 0.18, p.d, h, PANEL);
      b.ctx.save();
      b.ctx.globalAlpha = 0.34;
      b.quad(
        [b.p(p.x + p.w * 0.18, p.y + p.d * 0.5, h - 0.08), b.p(p.x + p.w * 0.82, p.y + p.d * 0.5, h - 0.08), b.p(p.x + p.w * 0.82, p.y + p.d * 0.5, 0.12), b.p(p.x + p.w * 0.18, p.y + p.d * 0.5, 0.12)],
        '#9fd4e6',
      );
      b.ctx.restore();
      break;

    case 'wallsign': {
      const onLeft = p.w < p.d;
      b.box(p.x, p.y, z, onLeft ? 0.12 : p.w, onLeft ? p.d : 0.12, h, pal.accent);
      const text = (p.text ?? '').toUpperCase();
      const len = onLeft ? p.d : p.w;
      // The lettering fits the board, rather than the board being sized
      // for lettering and then spilling past it.
      const size = Math.min(h * 0.44, (len - 0.4) / Math.max(1, text.length * 0.66));
      const span = text.length * size * 0.66;
      if (onLeft) b.wallText('left', p.y + p.d - (p.d - span) / 2, z + (h - size) / 2, text, size, '#eaf4fb');
      else b.wallText('right', p.x + (p.w - span) / 2, z + (h - size) / 2, text, size, '#eaf4fb');
      break;
    }

    case 'wallscreen': {
      const onLeft = p.w < p.d;
      b.box(p.x, p.y, z, onLeft ? 0.1 : p.w, onLeft ? p.d : 0.1, h, '#20272f');
      const face = (u0: number, u1: number, z0: number, z1: number, colour: string) => {
        const pt = (u: number, zz: number) => (onLeft ? b.p(p.x + 0.1, u, zz) : b.p(u, p.y + 0.1, zz));
        b.quad([pt(u0, z1), pt(u1, z1), pt(u1, z0), pt(u0, z0)], colour);
      };
      const u0 = onLeft ? p.y : p.x;
      const len = onLeft ? p.d : p.w;
      face(u0 + 0.06, u0 + len - 0.06, z + 0.06, z + h - 0.06, SCREEN);
      for (let i = 0; i < 6; i++) {
        const bx = u0 + 0.18 + i * (len - 0.4) / 6;
        const bh = (h - 0.3) * (0.25 + 0.6 * (((i * 5) % 4) / 4));
        face(bx, bx + (len - 0.4) / 9, z + 0.16, z + 0.16 + bh, i % 2 ? SCREEN_LIT : shade(SCREEN_LIT, 0.75));
      }
      break;
    }

    case 'whiteboard': {
      const onLeft = p.w < p.d;
      b.box(p.x, p.y, z, onLeft ? 0.09 : p.w, onLeft ? p.d : 0.09, h, '#d6dade');
      const pt = (u: number, zz: number) => (onLeft ? b.p(p.x + 0.09, u, zz) : b.p(u, p.y + 0.09, zz));
      const u0 = onLeft ? p.y : p.x;
      const len = onLeft ? p.d : p.w;
      b.quad([pt(u0 + 0.08, z + h - 0.08), pt(u0 + len - 0.08, z + h - 0.08), pt(u0 + len - 0.08, z + 0.08), pt(u0 + 0.08, z + 0.08)], '#f4f6f7');
      for (let i = 0; i < 5; i++) {
        const zz = z + h - 0.3 - i * 0.2;
        b.quad([pt(u0 + 0.25, zz + 0.05), pt(u0 + 0.25 + (len - 0.7) * (0.4 + 0.12 * (i % 4)), zz + 0.05), pt(u0 + 0.25 + (len - 0.7) * (0.4 + 0.12 * (i % 4)), zz), pt(u0 + 0.25, zz)], i === 0 ? '#4d6187' : '#9aa3ad');
      }
      break;
    }

    case 'entrance': {
      const onLeft = p.w < p.d;
      b.box(p.x, p.y, 0, onLeft ? 0.14 : p.w, onLeft ? p.d : 0.14, h, shade(pal.wall, 0.8));
      const pt = (u: number, zz: number) => (onLeft ? b.p(p.x + 0.14, u, zz) : b.p(u, p.y + 0.14, zz));
      const u0 = onLeft ? p.y : p.x;
      const len = onLeft ? p.d : p.w;
      b.ctx.save();
      b.ctx.globalAlpha = 0.5;
      b.quad([pt(u0 + 0.12, h - 0.12), pt(u0 + len - 0.12, h - 0.12), pt(u0 + len - 0.12, 0.06), pt(u0 + 0.12, 0.06)], '#bcdcea');
      b.ctx.restore();
      b.quad([pt(u0 + len / 2 - 0.04, h - 0.12), pt(u0 + len / 2 + 0.04, h - 0.12), pt(u0 + len / 2 + 0.04, 0.06), pt(u0 + len / 2 - 0.04, 0.06)], shade(pal.wall, 0.62));
      break;
    }
  }
}

/**
 * Paint `spec` into `ctx`, which must be `width` x `height` and in the same
 * 1568:1003 aspect as the master illustration.
 */
export function paintRoom(
  ctx: CanvasRenderingContext2D,
  spec: RoomSpec,
  view: IsoView,
  width: number,
  height: number,
): void {
  const pal = spec.palette === 'cool' ? COOL : OFFICE;
  const b = new Brush(ctx, view, width, pal);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, width, height);

  paintFloor(b, spec);
  for (const p of spec.props) if (p.kind === 'rug') paintProp(b, p);
  paintWalls(b, spec);

  // Wall fittings hang on the walls that were just drawn; floor furniture is
  // sorted far to near so nearer pieces lap the ones behind them. In plan
  // the partition walls are furniture too, and a screen hung on one has to
  // wait for its wall, so everything goes through the one depth sort.
  const plan = view.mode === 'plan';
  const onWall = (p: Prop) => !plan && ((p.z ?? 0) > 0 || p.kind === 'entrance');
  for (const p of spec.props) if (p.kind !== 'rug' && onWall(p)) paintProp(b, p);
  const standing = spec.props.filter((p) => p.kind !== 'rug' && p.kind !== 'plaque' && !onWall(p));
  standing.sort((a, c) => depthOf(view, a.x, a.y, a.w, a.d) - depthOf(view, c.x, c.y, c.w, c.d));
  for (const p of standing) paintProp(b, p);

  // Captions over everything: room plaques and the padlocks on shut doors.
  for (const p of spec.props) {
    if (p.kind === 'plaque') b.billboard(p.x, p.y, 0.4, p.text ?? '', { size: plan ? 0.72 : 0.42 });
    if (p.kind === 'lockdoor') {
      b.billboard(p.x + p.w / 2, p.y + p.d / 2, propHeight(p) + 1.1, '', { glyph: true, size: 0.9, pad: 0.35, fill: '#f4f6f8', ink: '#1e2f52' });
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Canvas dimensions a room is painted at. */
export function artSize(): { width: number; height: number } {
  return { width: Math.round(SCENE_W * ART_SCALE), height: Math.round(SCENE_H * ART_SCALE) };
}
