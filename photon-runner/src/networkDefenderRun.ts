import { blockAt, blockIp, createState, DefenderState, HEIGHT, WIDTH, step, unblockIp, type BlockOutcome } from './networkDefenderLogic';

function draw(ctx: CanvasRenderingContext2D, state: DefenderState): void {
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#3fb950';
  ctx.fillRect(0, 0, 8, HEIGHT); // the servers (base)

  for (const t of state.threats) {
    const color = t.dropped ? '#6e7681' : t.malicious ? '#f85149' : '#3fb950';
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

  ctx.fillStyle = '#e6edf3';
  ctx.font = '16px system-ui';
  ctx.fillText(`Score ${state.score}   Health ${state.health}   Trust ${state.trust}   Wave ${state.wave}`, 16, 24);
}

/** Mounts the canvas render loop + click handler. Returns a cleanup function. */
export interface DefenderHandle {
  dispose(): void;
  block(ip: string): BlockOutcome;
  unblock(ip: string): void;
  getState(): DefenderState;
}

export function startNetworkDefender(
  canvas: HTMLCanvasElement,
  onGameOver: (score: number) => void,
  onState?: (state: DefenderState) => void
): DefenderHandle {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { dispose() {}, block: () => null, unblock() {}, getState: createState };
  }
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const state = createState();
  let last = performance.now();
  let raf = 0;
  let ended = false;

  const handleClick = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    blockAt(state, e.clientX - r.left, e.clientY - r.top);
  };
  canvas.addEventListener('click', handleClick);

  function frame(now: number) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    step(state, dt);
    draw(ctx!, state);
    onState?.(state);
    if (state.over && !ended) {
      ended = true;
      onGameOver(state.score);
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('click', handleClick);
    },
    block(ip: string) {
      return blockIp(state, ip).outcome;
    },
    unblock(ip: string) {
      unblockIp(state, ip);
    },
    getState() {
      return state;
    },
  };
}
