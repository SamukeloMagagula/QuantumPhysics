import * as THREE from 'three';

/**
 * Canvas-drawn diagrams for the walkable Quantum Lab's teaching stations —
 * diegetic content (mounted on an in-world hologram panel prop, see
 * sceneQuantumLab.ts) rather than an HTML overlay. The brief was explicit
 * about this: explain visually, not with paragraphs of text sitting on top
 * of the game.
 */

export type StationKind = 'photon' | 'polarization' | 'alice' | 'bob' | 'eve';

const INK = '#eaf6ff';
const DIM = '#7fa6c4';
const ACCENT = '#5ea8c9';
const BG = '#050b12';

function base(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  return { c, ctx };
}

function title(ctx: CanvasRenderingContext2D, text: string, w: number): void {
  ctx.font = '700 46px Inter, system-ui, sans-serif';
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text.toUpperCase(), w / 2, 70);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.18, 92);
  ctx.lineTo(w * 0.82, 92);
  ctx.stroke();
}

function caption(ctx: CanvasRenderingContext2D, text: string, w: number, h: number): void {
  ctx.font = '400 26px Inter, system-ui, sans-serif';
  ctx.fillStyle = DIM;
  ctx.textAlign = 'center';
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  const maxW = w * 0.82;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const startY = h - 24 - (lines.length - 1) * 32;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, startY + i * 32));
}

function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color = ACCENT): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 16 * Math.cos(angle - 0.4), y2 - 16 * Math.sin(angle - 0.4));
  ctx.lineTo(x2 - 16 * Math.cos(angle + 0.4), y2 - 16 * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

function photon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, 22);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.4, ACCENT);
  grad.addColorStop(1, 'rgba(94,168,201,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.fill();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = INK, size = 30): void {
  ctx.font = `700 ${size}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
}

function drawPhoton(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  photon(ctx, w * 0.28, h * 0.42);
  arrow(ctx, w * 0.38, h * 0.42, w * 0.72, h * 0.42);
  label(ctx, 'PHOTON SOURCE', w * 0.28, h * 0.6, DIM, 22);
  label(ctx, 'ENCODED BIT', w * 0.75, h * 0.32, DIM, 22);
}

function drawPolarization(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cells: [string, string][] = [
    ['↕', 'Vertical'],
    ['↔', 'Horizontal'],
    ['╱', 'Diagonal +45°'],
    ['╲', 'Diagonal −45°'],
  ];
  const cw = w / 2;
  const ch = (h - 130) / 2;
  cells.forEach(([sym, name], i) => {
    const cx = (i % 2) * cw + cw / 2;
    const cy = 130 + Math.floor(i / 2) * ch + ch / 2;
    ctx.strokeStyle = 'rgba(94,168,201,.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - cw * 0.38, cy - ch * 0.38, cw * 0.76, ch * 0.76);
    ctx.font = '700 64px Inter, system-ui, sans-serif';
    ctx.fillStyle = ACCENT;
    ctx.textAlign = 'center';
    ctx.fillText(sym, cx, cy - 4);
    label(ctx, name, cx, cy + 38, DIM, 22);
  });
}

function drawAlice(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  label(ctx, 'ALICE', w / 2, 150, ACCENT, 34);
  arrow(ctx, w / 2, 168, w / 2, h * 0.52);
  label(ctx, 'quantum channel', w / 2 + 130, h * 0.36, DIM, 20);
  photon(ctx, w * 0.3, h * 0.68);
  arrow(ctx, w * 0.38, h * 0.68, w * 0.78, h * 0.68);
}

function drawBob(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  photon(ctx, w * 0.22, h * 0.36);
  arrow(ctx, w * 0.3, h * 0.36, w * 0.62, h * 0.36);
  arrow(ctx, w * 0.68, h * 0.4, w * 0.68, h * 0.62);
  label(ctx, 'BOB', w * 0.68, h * 0.78, ACCENT, 34);
  label(ctx, 'measures in a random basis', w * 0.68, h * 0.86, DIM, 20);
}

function drawEve(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  label(ctx, 'ALICE', w / 2, h * 0.2, DIM, 26);
  arrow(ctx, w / 2, h * 0.24, w / 2, h * 0.42);
  label(ctx, 'EVE', w / 2, h * 0.56, '#fca5a5', 34);
  label(ctx, 'intercept / measure', w / 2, h * 0.63, '#fca5a5', 20);
  arrow(ctx, w / 2, h * 0.68, w / 2, h * 0.84, '#fca5a5');
  label(ctx, 'BOB', w / 2, h * 0.94, DIM, 26);
}

const DRAWERS: Record<StationKind, (ctx: CanvasRenderingContext2D, w: number, h: number) => void> = {
  photon: drawPhoton,
  polarization: drawPolarization,
  alice: drawAlice,
  bob: drawBob,
  eve: drawEve,
};

const TITLES: Record<StationKind, string> = {
  photon: 'Photon Source',
  polarization: 'Polarization Basis',
  alice: 'Alice — Transmitter',
  bob: 'Bob — Receiver',
  eve: 'Eve — Eavesdropper',
};

const CAPTIONS: Record<StationKind, string> = {
  photon: 'Photons can be used to encode quantum information — a single photon carries one qubit.',
  polarization: 'A photon’s polarization angle is the "state" BB84 encodes bits into.',
  alice: 'Alice encodes a random bit into a randomly chosen basis and sends it down the channel.',
  bob: 'Bob measures each photon in his own random basis — matching Alice’s reveals the bit; mismatched gives noise.',
  eve: 'Any measurement Eve makes disturbs the photon’s state — that disturbance is what Alice and Bob’s error rate catches.',
};

export function stationDiagramTexture(kind: StationKind): THREE.Texture {
  const w = 900;
  const h = 620;
  const { c, ctx } = base(w, h);
  title(ctx, TITLES[kind], w);
  DRAWERS[kind](ctx, w, h);
  caption(ctx, CAPTIONS[kind], w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export { TITLES as STATION_TITLES };
