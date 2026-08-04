export const START_HEALTH = 10;
export const START_TRUST = 100;
export const BLOCK_RADIUS = 28;
export const POINTS_PER_BLOCK = 100;
export const TRUST_PENALTY = 20;
export const WIDTH = 640;
export const HEIGHT = 360;
export const LANES = 4;
export const SPAWN_EVERY = 1.1;
export const SPEED = 60;

export type ThreatKind = 'port-scan' | 'syn-flood' | 'brute-force' | 'sql-injection' | 'malware-c2' | 'https' | 'dns' | 'email' | 'ssh-admin';

export const MALICIOUS_KINDS: ThreatKind[] = ['port-scan', 'syn-flood', 'brute-force', 'sql-injection', 'malware-c2'];
export const LEGIT_KINDS: ThreatKind[] = ['https', 'dns', 'email', 'ssh-admin'];

/** What `logs` shows for each kind — a real analyst's cue, not an answer key
 * ("malicious"/"legit" never appears; the player has to judge it). */
export const KIND_INFO: Record<ThreatKind, { label: string; detail: string; port: number; protocol: 'TCP' | 'UDP' }> = {
  'port-scan': { label: 'Port scan', detail: 'sequential SYN probes across 40+ ports in 2s', port: 0, protocol: 'TCP' },
  'syn-flood': { label: 'SYN flood', detail: 'hundreds of half-open connections, no ACK', port: 80, protocol: 'TCP' },
  'brute-force': { label: 'Repeated auth', detail: '14 failed logins in the last minute', port: 22, protocol: 'TCP' },
  'sql-injection': { label: 'Malformed query', detail: "payload contains ' OR '1'='1", port: 443, protocol: 'TCP' },
  'malware-c2': { label: 'Beacon', detail: 'periodic outbound to an unlisted host, no DNS lookup first', port: 4444, protocol: 'TCP' },
  https: { label: 'TLS session', detail: 'valid cert, normal handshake', port: 443, protocol: 'TCP' },
  dns: { label: 'DNS query', detail: 'standard recursive lookup', port: 53, protocol: 'UDP' },
  email: { label: 'Mail delivery', detail: 'SMTP from a known relay', port: 25, protocol: 'TCP' },
  'ssh-admin': { label: 'Admin session', detail: 'key-based auth, known host', port: 22, protocol: 'TCP' },
};

/** Fictional addresses only — 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24
 * are IANA-reserved for documentation/examples (RFC 5737), never real hosts. */
function randomIp(rng: () => number, malicious: boolean): string {
  const block = malicious ? '203.0.113' : rng() < 0.5 ? '198.51.100' : '192.0.2';
  return `${block}.${1 + Math.floor(rng() * 254)}`;
}

export interface Threat {
  id: number;
  x: number;
  y: number;
  speed: number;
  ip: string;
  port: number;
  protocol: 'TCP' | 'UDP';
  kind: ThreatKind;
  malicious: boolean;
  /** Set the instant a firewall rule (blockedIps) catches it, so the renderer
   * can play a brief "dropped" beat before it's removed next step. */
  dropped: boolean;
}

export interface DefenderState {
  threats: Threat[];
  health: number;
  trust: number;
  score: number;
  spawnTimer: number;
  wave: number;
  over: boolean;
  /** Firewall rules — once an IP is blocked, every packet from it is dropped
   * automatically, no per-packet action needed (the actual concept being taught). */
  blockedIps: Set<string>;
}

let idCounter = 0;

export function createState(): DefenderState {
  return {
    threats: [],
    health: START_HEALTH,
    trust: START_TRUST,
    score: 0,
    spawnTimer: 0,
    wave: 1,
    over: false,
    blockedIps: new Set(),
  };
}

export function spawn(state: DefenderState, rng: () => number = Math.random): DefenderState {
  const lane = Math.floor(rng() * LANES);
  const y = (HEIGHT / (LANES + 1)) * (lane + 1);
  const malicious = rng() < 0.55;
  const kinds = malicious ? MALICIOUS_KINDS : LEGIT_KINDS;
  const kind = kinds[Math.floor(rng() * kinds.length)];
  const info = KIND_INFO[kind];
  idCounter += 1;
  const ip = randomIp(rng, malicious);
  state.threats.push({
    id: idCounter,
    x: WIDTH,
    y,
    speed: SPEED + state.wave * 6,
    ip,
    port: info.port,
    protocol: info.protocol,
    kind,
    malicious,
    dropped: state.blockedIps.has(ip),
  });
  return state;
}

export function step(state: DefenderState, dt: number, rng: () => number = Math.random): DefenderState {
  if (state.over) return state;
  state.spawnTimer += dt;
  if (state.spawnTimer >= SPAWN_EVERY) {
    state.spawnTimer = 0;
    spawn(state, rng);
  }
  for (const t of state.threats) {
    // A firewall rule can catch a packet mid-flight if the IP was blocked
    // after it spawned, not just at spawn time.
    if (!t.dropped && state.blockedIps.has(t.ip)) t.dropped = true;
    if (!t.dropped) t.x -= t.speed * dt;
  }
  const survivors: Threat[] = [];
  for (const t of state.threats) {
    if (t.dropped) {
      // One beat on screen so the player sees the firewall catch it, then gone.
      if (t.x <= WIDTH - 4) continue;
      t.x -= 4;
      survivors.push(t);
      continue;
    }
    if (t.x <= 0) {
      if (t.malicious) {
        state.health -= 1;
        if (state.health <= 0) {
          state.health = 0;
          state.over = true;
        }
      }
      // Legitimate traffic reaching the server is the correct outcome — no penalty.
    } else {
      survivors.push(t);
    }
  }
  state.threats = survivors;
  state.wave = 1 + Math.floor(state.score / 500);
  if (state.trust <= 0) {
    state.trust = 0;
    state.over = true;
  }
  return state;
}

export type BlockOutcome = 'malicious-blocked' | 'legit-blocked' | 'already-blocked' | null;

export interface BlockResult {
  state: DefenderState;
  /** null if the IP had no in-flight packet to react to (a preemptive block). */
  outcome: BlockOutcome;
}

/** The one action both the terminal's `block <ip>` and clicking a packet funnel
 * through — a firewall rule, not a one-off dot removal. */
export function blockIp(state: DefenderState, ip: string): BlockResult {
  if (state.blockedIps.has(ip)) {
    return { state, outcome: 'already-blocked' };
  }
  state.blockedIps.add(ip);
  const inFlight = state.threats.find((t) => t.ip === ip && !t.dropped);
  if (inFlight) {
    inFlight.dropped = true;
    if (inFlight.malicious) {
      state.score += POINTS_PER_BLOCK;
      return { state, outcome: 'malicious-blocked' };
    }
    state.trust = Math.max(0, state.trust - TRUST_PENALTY);
    return { state, outcome: 'legit-blocked' };
  }
  return { state, outcome: null };
}

export function unblockIp(state: DefenderState, ip: string): DefenderState {
  state.blockedIps.delete(ip);
  return state;
}

/** Click-to-block: find the nearest live packet within BLOCK_RADIUS and block its IP. */
export function blockAt(state: DefenderState, x: number, y: number): DefenderState {
  let best: Threat | null = null;
  let bestDist = BLOCK_RADIUS;
  for (const t of state.threats) {
    if (t.dropped) continue;
    const d = Math.hypot(t.x - x, t.y - y);
    if (d <= bestDist) {
      bestDist = d;
      best = t;
    }
  }
  if (best) blockIp(state, best.ip);
  return state;
}
