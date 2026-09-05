import { SCENE_H, SCENE_W, type Poly, type Vec2 } from './pqScene';

/**
 * Isometric authoring for the wings built around the Page 8 illustration.
 *
 * The client's rule for the operations floor stands: that room *is* the
 * artwork, and nothing here touches it. But the illustration itself points
 * at four doors and two "TO OTHER WINGS" arrows, and the rest of the
 * building has to come from somewhere. Rather than hand-trace another
 * floor plan per room — the thing that makes `pqScene.ts` a wall of
 * coordinates nobody can safely edit — the new wings are authored in
 * metres and projected.
 *
 * That inversion is the whole point of this module. A room says "a 2.2m
 * desk at (4, 3)", and the projection derives, from that one number pair,
 * the artwork, the obstacle polygon the walk rules test against, and the
 * seat the person behind it occupies. They cannot drift apart, because
 * there is only one of them.
 *
 * Projection is standard 2:1 dimetric, matching the illustration's own:
 * +x runs down-right, +y runs down-left, +z up. Screen space is the same
 * normalised 0..1 image space the rest of the scene works in, so movement,
 * depth sorting and hit-testing stay in one coordinate system for every
 * room, drawn or traced.
 */

export interface IsoView {
  /** Logical px per world metre along screen-x. */
  tx: number;
  /** Along screen-y. Half of `tx` — that ratio is what makes it 2:1. */
  ty: number;
  /** Screen-y px per metre of height. */
  tz: number;
  /** Logical-px position of world origin (0, 0, 0). */
  ox: number;
  oy: number;
}

/** A logical-pixel box the fitted room is centred inside. */
export interface IsoFrame {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Where a room sits in the frame. Matched to the master illustration: the
 * drawn room leaves a white margin all round rather than bleeding off the
 * edges, so the new wings do the same and the cut between them reads as
 * one book of plans.
 */
export const DEFAULT_FRAME: IsoFrame = { x0: 86, y0: 34, x1: 1482, y1: 946 };

export function isoPx(v: IsoView, x: number, y: number, z = 0): Vec2 {
  return { x: v.ox + (x - y) * v.tx, y: v.oy + (x + y) * v.ty - z * v.tz };
}

/** The same point in the normalised 0..1 image space the scene runs in. */
export function isoNorm(v: IsoView, x: number, y: number, z = 0): Vec2 {
  const p = isoPx(v, x, y, z);
  return { x: p.x / SCENE_W, y: p.y / SCENE_H };
}

/**
 * Fit a `w` x `d` room with `h`-metre walls into `frame`.
 *
 * Solving for the scale rather than authoring one per room is what lets the
 * wings be different sizes and still look like one building photographed
 * from the same place: a big room simply draws smaller, exactly as it would
 * if the camera were fixed.
 */
export function fitIso(w: number, d: number, h: number, frame: IsoFrame = DEFAULT_FRAME): IsoView {
  const fw = frame.x1 - frame.x0;
  const fh = frame.y1 - frame.y0;
  // With ty = tx/2 and tz = tx, the projected room spans (w + d) across and
  // (w + d)/2 + h down, both in units of tx.
  const tx = Math.min(fw / (w + d), fh / ((w + d) / 2 + h));
  const ty = tx / 2;
  const tz = tx;
  const left = -d * tx; // relative to ox
  const right = w * tx;
  const top = -h * tz; // relative to oy
  const bottom = (w + d) * ty;
  return {
    tx,
    ty,
    tz,
    ox: frame.x0 + (fw - (right - left)) / 2 - left,
    oy: frame.y0 + (fh - (bottom - top)) / 2 - top,
  };
}

/**
 * The floor rectangle (x, y)..(x + w, y + d) as a normalised screen polygon.
 *
 * Projection is affine, so the corner order survives it and the result is
 * always a simple quad — which is what `pointInPoly` needs.
 */
export function isoRectPoly(v: IsoView, x: number, y: number, w: number, d: number): Poly {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + d],
    [x, y + d],
  ].map(([px, py]) => {
    const p = isoNorm(v, px, py);
    return [p.x, p.y] as [number, number];
  });
}

/** Painter's-algorithm key: bigger is nearer the camera. */
export function isoDepth(x: number, y: number, w = 0, d = 0): number {
  return x + w / 2 + (y + d / 2);
}

/** Metres per normalised screen unit across the room's widest axis — used to
 * turn a walking speed in metres per second into one the screen-space
 * movement code can apply. */
export function isoMetreX(v: IsoView): number {
  return v.tx / SCENE_W;
}

export function isoMetreY(v: IsoView): number {
  return v.ty / SCENE_H;
}
