import { blockIp, canvasPoint, createState, DefenderState, HEIGHT, WIDTH, step, unblockIp, threatAt, reviewThreat, type BlockOutcome, type Threat, type ReviewResult } from './networkDefenderLogic';

function draw(ctx: CanvasRenderingContext2D, state: DefenderState): void {
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // The servers the traffic is heading for. Drawn as a labelled edge rather
  // than a bare green bar, so it reads as something rather than as an
  // artefact of the canvas.
  ctx.fillStyle = 'rgba(63,185,80,.22)';
  ctx.fillRect(0, 0, 6, HEIGHT);
  ctx.fillStyle = '#3fb950';
  ctx.fillRect(0, 0, 2, HEIGHT);
  ctx.save();
  ctx.translate(18, HEIGHT / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(139,148,158,.85)';
  ctx.font = '600 9px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '2px';
  ctx.fillText('SERVERS', 0, 0);
  ctx.restore();

  for (const t of state.threats) {
    const color = t.dropped ? '#6e7681' : '#5eead4';
    ctx.globalAlpha = t.dropped ? 0.5 : 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 10, 0, Math.PI * 2);
    ctx.fill();
    if (t.dropped) {
      ctx.strokeStyle = '#e6edf3';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t.x - 6, t.y - 6);
      ctx.lineTo(t.x + 6, t.y + 6);
      ctx.moveTo(t.x + 6, t.y - 6);
      ctx.lineTo(t.x - 6, t.y + 6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#8b949e';
    ctx.font = '10px monospace';
    ctx.fillText(t.ip, t.x - 34, t.y - 14);
  }

  // Wave number stays on the canvas — it is about what you are looking at,
  // not a running total. The rest is reported in the page header.
  ctx.fillStyle = 'rgba(230,237,243,.55)';
  ctx.font = '600 10px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`WAVE ${state.wave}`, WIDTH - 14, 22);
  ctx.textAlign = 'left';
}

/** Mounts the canvas render loop + click handler. Returns a cleanup function. */
export interface DefenderHandle {
  dispose(): void;
  block(ip: string): BlockOutcome;
  unblock(ip: string): void;
  getState(): DefenderState;
  setPaused(paused: boolean): void;
  inspect(id: number): void;
  review(id: number, choice: 'block' | 'allow'): ReviewResult | null;
}

export function startNetworkDefender(
  canvas: HTMLCanvasElement,
  onGameOver: (score: number) => void,
  onState?: (state: DefenderState) => void,
  onInspect?: (threat: Threat) => void
): DefenderHandle {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const state = createState();
    return { dispose() {}, block: () => null, unblock() {}, getState: () => state, setPaused() {}, inspect() {}, review: () => null };
  }
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const state = createState();
  let last = performance.now();
  let raf = 0;
  let ended = false;
  let paused = true;
  let lastPublished = 0;
  const inspect = (id: number) => {
    const threat = state.threats.find(t => t.id === id && !t.dropped);
    if (!threat || state.over) return;
    paused = true;
    onInspect?.({ ...threat });
  };

  const handleClick = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    const point = canvasPoint(e.clientX, e.clientY, r);
    const threat = point && threatAt(state, point.x, point.y);
    if (threat) inspect(threat.id);
  };
  canvas.addEventListener('click', handleClick);

  function frame(now: number) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!paused) step(state, dt);
    draw(ctx!, state);
    if (now - lastPublished >= 100 || state.over) { onState?.(state); lastPublished = now; }
    if (state.over && !ended) {
      ended = true;
      onGameOver(state.score);
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  onState?.(state);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('click', handleClick);
    },
    block(ip: string) {
      const threat = state.threats.find(t => t.ip === ip && !t.dropped);
      if (threat) return reviewThreat(state, threat.id, 'block')?.blockOutcome ?? null;
      return blockIp(state, ip).outcome;
    },
    unblock(ip: string) {
      unblockIp(state, ip);
    },
    getState() {
      return state;
    },
    setPaused(value) { paused = value; },
    inspect,
    review(id, choice) {
      const result = reviewThreat(state, id, choice);
      onState?.(state);
      return result;
    },
  };
}
