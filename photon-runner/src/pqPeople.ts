import type { IsoFacing, PersonLook } from './pqNpc';

/**
 * Drawing the staff.
 *
 * The player has an authored sprite sheet; nobody else does, and commissioning
 * one per body, outfit and pose is not the shape of this problem. These are
 * drawn instead — flat shapes in the illustration's own palette, at the size
 * they actually appear (a hundred pixels tall at most), where silhouette does
 * all the work and detail would only alias.
 *
 * Drawing rather than blitting buys the two poses the scene needs and could
 * not have got from the sheet: sitting, and sitting *at* something. A seated
 * figure carries its own chair, drawn behind them when they face the camera
 * and in front of them when they face away — which is the only way a person
 * at a desk with their back to you does not look like a person standing in
 * front of a chair.
 */

export type PersonPose = 'stand' | 'walk' | 'sit';

export interface PersonDraw {
  /** Feet on the floor, in device pixels. */
  x: number;
  y: number;
  /** Standing height in device pixels. A seated figure comes out shorter. */
  h: number;
  facing: IsoFacing;
  pose: PersonPose;
  /** Steps for a walk cycle; free-running seconds otherwise. */
  phase: number;
  look: PersonLook;
  /** Nothing is drawn below this device-pixel y — the desk in front of them. */
  clipY?: number | null;
  /** Draw a chair under a seated figure. */
  chair?: boolean;
}

function facesCamera(f: IsoFacing): boolean {
  return f === 'se' || f === 'sw';
}

/** Which way they point across the screen. */
function sideOf(f: IsoFacing): 1 | -1 {
  return f === 'se' || f === 'ne' ? 1 : -1;
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(rx, 0.4), Math.max(ry, 0.4), 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  round = 0,
): void {
  ctx.beginPath();
  if (round > 0) ctx.roundRect(x - w / 2, y, w, h, Math.min(round, w / 2, Math.abs(h) / 2));
  else ctx.rect(x - w / 2, y, w, h);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** A limb as a rounded capsule from one point to another. */
function limb(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  fill: string,
): void {
  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineWidth = w;
  ctx.strokeStyle = fill;
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function head(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, look: PersonLook, back: boolean, side: 1 | -1): void {
  ellipse(ctx, cx, cy, r * 0.86, r, look.skin);
  ctx.save();
  ctx.beginPath();
  switch (look.cut) {
    case 'bald':
      // A crescent at the crown only, so the silhouette still reads as hair.
      ctx.ellipse(cx, cy - r * 0.22, r * 0.86, r * 0.72, 0, Math.PI, Math.PI * 2);
      break;
    case 'bob':
      ctx.ellipse(cx, cy - r * 0.06, r * 1.0, r * 1.02, 0, 0, Math.PI * 2);
      if (!back) {
        // Clear the face out of the fringe.
        ctx.ellipse(cx + side * r * 0.12, cy + r * 0.24, r * 0.66, r * 0.6, 0, 0, Math.PI * 2, true);
      }
      break;
    case 'bun':
      ctx.ellipse(cx, cy - r * 0.18, r * 0.9, r * 0.78, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - side * r * 0.78, cy - r * 0.42, r * 0.42, r * 0.42, 0, 0, Math.PI * 2);
      break;
    case 'tie':
      ctx.ellipse(cx, cy - r * 0.2, r * 0.9, r * 0.76, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - side * r * 0.7, cy + r * 0.5, r * 0.28, r * 0.66, 0, 0, Math.PI * 2);
      break;
    default:
      ctx.ellipse(cx, cy - r * 0.24, r * 0.9, r * 0.8, 0, 0, Math.PI * 2);
  }
  ctx.fillStyle = look.hair;
  ctx.fill('evenodd');
  ctx.restore();

  if (back) return;
  // The face is two marks. Anything more is noise at this size.
  const eye = Math.max(0.7, r * 0.13);
  ellipse(ctx, cx - r * 0.3 + side * r * 0.1, cy + r * 0.08, eye, eye, '#2a2320');
  ellipse(ctx, cx + r * 0.32 + side * r * 0.1, cy + r * 0.08, eye, eye, '#2a2320');
}

function chairBack(ctx: CanvasRenderingContext2D, h: number, side: 1 | -1, tone: string): void {
  const w = h * 0.26;
  ctx.save();
  ctx.globalAlpha = 1;
  bar(ctx, -side * h * 0.06, -h * 0.62, w, h * 0.3, tone, h * 0.04);
  ctx.restore();
}

function chairSeat(ctx: CanvasRenderingContext2D, h: number, tone: string): void {
  bar(ctx, 0, -h * 0.32, h * 0.3, h * 0.055, tone, h * 0.02);
  limb(ctx, 0, -h * 0.28, 0, -h * 0.06, h * 0.035, tone);
  bar(ctx, 0, -h * 0.075, h * 0.24, h * 0.03, tone, h * 0.015);
}

/**
 * One person, feet at (x, y).
 *
 * Everything is proportional to `h`, so the same call draws a figure at the
 * back of the room and one at the front without a second set of numbers.
 */
export function drawPerson(ctx: CanvasRenderingContext2D, p: PersonDraw): void {
  const { h, look } = p;
  const back = !facesCamera(p.facing);
  const side = sideOf(p.facing);
  const chairTone = '#33383f';

  ctx.save();
  if (p.clipY != null) {
    ctx.beginPath();
    ctx.rect(p.x - h, p.y - h * 1.6, h * 2, p.clipY - (p.y - h * 1.6));
    ctx.clip();
  }
  ctx.translate(p.x, p.y);

  if (p.pose === 'sit') {
    const hip = -h * 0.34;
    const shoulder = -h * 0.66;
    const headR = h * 0.082;
    const bob = Math.sin(p.phase * 6.2) * h * 0.006;

    if (p.chair !== false && !back) chairSeat(ctx, h, chairTone);

    // Thighs forward, shins down to the floor.
    limb(ctx, 0, hip, side * h * 0.17, hip + h * 0.02, h * 0.085, look.legs);
    limb(ctx, side * h * 0.17, hip + h * 0.02, side * h * 0.19, -h * 0.03, h * 0.075, look.legs);
    ellipse(ctx, side * h * 0.21, -h * 0.012, h * 0.045, h * 0.025, look.shoes);

    // Torso.
    ctx.beginPath();
    ctx.moveTo(-h * 0.115, hip + bob);
    ctx.lineTo(h * 0.115, hip + bob);
    ctx.lineTo(h * 0.1, shoulder + bob);
    ctx.lineTo(-h * 0.1, shoulder + bob);
    ctx.closePath();
    ctx.fillStyle = look.top;
    ctx.fill();
    bar(ctx, side * h * 0.03, shoulder + bob, h * 0.05, h * 0.2, look.trim);

    // Arms out to the work in front of them, with a typing flutter.
    const tap = Math.sin(p.phase * 9) * h * 0.012;
    limb(ctx, -h * 0.09, shoulder + h * 0.06 + bob, side * h * 0.14, hip - h * 0.05 + tap, h * 0.06, look.top);
    limb(ctx, h * 0.09, shoulder + h * 0.06 + bob, side * h * 0.16, hip - h * 0.02 - tap, h * 0.06, look.top);

    head(ctx, 0, shoulder - headR * 1.05 + bob, headR, look, back, side);
    if (p.chair !== false && back) chairBack(ctx, h, side, chairTone);
    ctx.restore();
    return;
  }

  const walking = p.pose === 'walk';
  const swing = walking ? Math.sin(p.phase * Math.PI) : 0;
  const lift = walking ? Math.abs(Math.cos(p.phase * Math.PI)) * h * 0.018 : 0;
  const sway = walking ? 0 : Math.sin(p.phase * 1.4) * h * 0.004;
  const hip = -h * 0.46 - lift;
  const shoulder = -h * 0.78 - lift;
  const headR = h * 0.085;

  // Legs first, so the torso overlaps them at the hip.
  limb(ctx, -h * 0.05, hip, -h * 0.05 + swing * h * 0.15, -lift, h * 0.09, look.legs);
  limb(ctx, h * 0.05, hip, h * 0.05 - swing * h * 0.15, -lift, h * 0.09, look.legs);
  ellipse(ctx, -h * 0.05 + swing * h * 0.16, -lift, h * 0.045, h * 0.022, look.shoes);
  ellipse(ctx, h * 0.05 - swing * h * 0.16, -lift, h * 0.045, h * 0.022, look.shoes);

  ctx.beginPath();
  ctx.moveTo(-h * 0.115 + sway, hip);
  ctx.lineTo(h * 0.115 + sway, hip);
  ctx.lineTo(h * 0.105 + sway, shoulder);
  ctx.lineTo(-h * 0.105 + sway, shoulder);
  ctx.closePath();
  ctx.fillStyle = look.top;
  ctx.fill();
  // Lanyard or open jacket — a second value so the torso is not one flat block.
  bar(ctx, sway + side * h * 0.028, shoulder + h * 0.02, h * 0.045, h * 0.26, look.trim);

  limb(ctx, -h * 0.1 + sway, shoulder + h * 0.05, -h * 0.12 - swing * h * 0.1, hip + h * 0.08, h * 0.06, look.top);
  limb(ctx, h * 0.1 + sway, shoulder + h * 0.05, h * 0.12 + swing * h * 0.1, hip + h * 0.08, h * 0.06, look.top);

  head(ctx, sway, shoulder - headR * 1.02, headR, look, back, side);
  ctx.restore();
}

/** The soft ellipse that stops a figure floating over the floor. */
export function drawContactShadow(ctx: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ellipse(ctx, x, y, h * 0.15, h * 0.055, '#0d1520');
  ctx.restore();
}

/**
 * A line of overheard conversation.
 *
 * Deliberately unprompted: an office where you have to walk up and press a
 * key to discover anyone is talking is still a silent office.
 */
export function drawSpeech(
  ctx: CanvasRenderingContext2D,
  x: number,
  topY: number,
  text: string,
  px: number,
  fade: number,
): void {
  const font = Math.max(9, px);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, fade));
  ctx.font = `500 ${font}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width;
  const padX = font * 0.62;
  const padY = font * 0.5;
  const boxW = w + padX * 2;
  const boxH = font + padY * 2;
  const y = topY - boxH - font * 0.55;
  ctx.beginPath();
  ctx.roundRect(x - boxW / 2, y, boxW, boxH, font * 0.6);
  ctx.moveTo(x - font * 0.3, y + boxH - 1);
  ctx.lineTo(x, y + boxH + font * 0.55);
  ctx.lineTo(x + font * 0.3, y + boxH - 1);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,.94)';
  ctx.strokeStyle = 'rgba(37,54,93,.28)';
  ctx.lineWidth = Math.max(1, font * 0.06);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#26324a';
  ctx.fillText(text, x, y + boxH / 2 + font * 0.04);
  ctx.restore();
}
