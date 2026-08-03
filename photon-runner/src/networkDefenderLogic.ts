export const START_HEALTH = 10;
export const BLOCK_RADIUS = 28;
export const POINTS_PER_BLOCK = 100;
export const WIDTH = 640;
export const HEIGHT = 360;
export const LANES = 4;
export const SPAWN_EVERY = 1.1;
export const SPEED = 60;

export interface Threat {
  id: number;
  x: number;
  y: number;
  speed: number;
}

export interface DefenderState {
  threats: Threat[];
  health: number;
  score: number;
  spawnTimer: number;
  wave: number;
  over: boolean;
}

let idCounter = 0;

export function createState(): DefenderState {
  return { threats: [], health: START_HEALTH, score: 0, spawnTimer: 0, wave: 1, over: false };
}

export function spawn(state: DefenderState, rng: () => number = Math.random): DefenderState {
  const lane = Math.floor(rng() * LANES);
  const y = (HEIGHT / (LANES + 1)) * (lane + 1);
  idCounter += 1;
  state.threats.push({ id: idCounter, x: WIDTH, y, speed: SPEED + state.wave * 6 });
  return state;
}

export function step(state: DefenderState, dt: number, rng: () => number = Math.random): DefenderState {
  if (state.over) return state;
  state.spawnTimer += dt;
  if (state.spawnTimer >= SPAWN_EVERY) {
    state.spawnTimer = 0;
    spawn(state, rng);
  }
  for (const t of state.threats) t.x -= t.speed * dt;
  const survivors: Threat[] = [];
  for (const t of state.threats) {
    if (t.x <= 0) {
      state.health -= 1;
      if (state.health <= 0) {
        state.health = 0;
        state.over = true;
      }
    } else {
      survivors.push(t);
    }
  }
  state.threats = survivors;
  state.wave = 1 + Math.floor(state.score / 500);
  return state;
}

export function blockAt(state: DefenderState, x: number, y: number): DefenderState {
  let best = -1;
  let bestDist = BLOCK_RADIUS;
  state.threats.forEach((t, i) => {
    const d = Math.hypot(t.x - x, t.y - y);
    if (d <= bestDist) {
      bestDist = d;
      best = i;
    }
  });
  if (best >= 0) {
    state.threats.splice(best, 1);
    state.score += POINTS_PER_BLOCK;
  }
  return state;
}
