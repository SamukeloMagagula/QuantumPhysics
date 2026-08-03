import { blockAt, createState, DefenderState, HEIGHT, WIDTH, step } from './networkDefenderLogic';

function draw(ctx: CanvasRenderingContext2D, state: DefenderState): void {
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#3fb950';
  ctx.fillRect(0, 0, 8, HEIGHT); // the servers (base)
  ctx.fillStyle = '#f85149';
  for (const t of state.threats) {
    ctx.beginPath();
    ctx.arc(t.x, t.y, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e6edf3';
  ctx.font = '16px system-ui';
  ctx.fillText(`Score ${state.score}   Health ${state.health}   Wave ${state.wave}`, 16, 24);
}

/** Mounts the canvas render loop + click handler. Returns a cleanup function. */
export function startNetworkDefender(canvas: HTMLCanvasElement, onGameOver: (score: number) => void): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
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
    if (state.over && !ended) {
      ended = true;
      onGameOver(state.score);
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    canvas.removeEventListener('click', handleClick);
  };
}
