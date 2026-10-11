import { describe, expect, it } from 'vitest';
import {
  blockAt,
  blockIp,
  createState,
  spawn,
  step,
  unblockIp,
  WIDTH,
  START_HEALTH,
  START_TRUST,
  POINTS_PER_BLOCK,
  TRUST_PENALTY,
  canvasPoint,
  threatAt,
  reviewThreat,
  REVIEWS_PER_ROUND,
  POINTS_PER_ALLOW,
} from './networkDefenderLogic';

it('maps clicks on a resized canvas back to the visible packet', () => {
  const state = createState();
  spawn(state, () => 0.1);
  const packet = state.threats[0];
  const rect = { left: 50, top: 100, width: 320, height: 180 };
  const point = canvasPoint(rect.left + packet.x / 2, rect.top + packet.y / 2, rect)!;
  blockAt(state, point.x, point.y);
  expect(state.blockedIps.has(packet.ip)).toBe(true);
  expect(canvasPoint(1, 1, { ...rect, width: 0 })).toBeNull();
});

describe('createState', () => {
  it('starts with full health, full trust, no score, no threats, no firewall rules', () => {
    const state = createState();
    expect(state.health).toBe(START_HEALTH);
    expect(state.trust).toBe(START_TRUST);
    expect(state.score).toBe(0);
    expect(state.threats).toHaveLength(0);
    expect(state.blockedIps.size).toBe(0);
    expect(state.over).toBe(false);
  });
});

describe('spawn', () => {
  it('adds one threat starting at the right edge, with realistic packet metadata', () => {
    const state = createState();
    spawn(state, () => 0.5);
    expect(state.threats).toHaveLength(1);
    const t = state.threats[0];
    expect(t.x).toBe(WIDTH);
    expect(t.ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(typeof t.malicious).toBe('boolean');
    expect(t.protocol === 'TCP' || t.protocol === 'UDP').toBe(true);
  });

  it('marks a spawned packet already-dropped if its IP is already firewalled', () => {
    const state = createState();
    spawn(state, () => 0.5);
    state.blockedIps.add(state.threats[0].ip);
    spawn(state, () => 0.5);
    expect(state.threats[1].dropped).toBe(true);
  });
});

describe('inspection decisions', () => {
  it('inspecting a packet does not automatically block it', () => {
    const state = createState(); spawn(state, () => 0.5);
    const packet = state.threats[0];
    expect(threatAt(state, packet.x, packet.y)?.id).toBe(packet.id);
    expect(state.score).toBe(0); expect(state.blockedIps.size).toBe(0);
  });

  it('rewards allowing a real request and prevents reviewing it twice', () => {
    const state = createState(); spawn(state, () => 0.9);
    const id = state.threats[0].id;
    expect(reviewThreat(state, id, 'allow')?.correct).toBe(true);
    expect(state.score).toBe(POINTS_PER_ALLOW);
    expect(state.correct).toBe(1); expect(state.reviewed).toBe(1);
    expect(reviewThreat(state, id, 'allow')).toBeNull();
    expect(state.score).toBe(POINTS_PER_ALLOW);
  });

  it('blocks all queued packets from the same source without awarding repeat decisions', () => {
    const state = createState(); spawn(state, () => 0.5); spawn(state, () => 0.5);
    const second = state.threats[1];
    expect(reviewThreat(state, second.id, 'block')?.correct).toBe(true);
    expect(state.threats.every(packet => packet.dropped)).toBe(true);
    expect(reviewThreat(state, second.id, 'block')).toBeNull();
    expect(state.reviewed).toBe(1); expect(state.score).toBe(POINTS_PER_BLOCK);
  });

  it('charges health for allowing an attack and trust for blocking real traffic', () => {
    const state = createState(); spawn(state, () => 0.5);
    expect(reviewThreat(state, state.threats[0].id, 'allow')?.correct).toBe(false);
    expect(state.health).toBe(START_HEALTH - 1);
    spawn(state, () => 0.9);
    expect(reviewThreat(state, state.threats[0].id, 'block')?.correct).toBe(false);
    expect(state.trust).toBe(START_TRUST - TRUST_PENALTY);
  });

  it('ends a successful round after twelve decisions and freezes its result', () => {
    const state = createState();
    for (let i = 0; i < REVIEWS_PER_ROUND; i++) {
      spawn(state, () => 0.9);
      reviewThreat(state, state.threats[0].id, 'allow');
    }
    expect(state.over).toBe(true); expect(state.correct).toBe(REVIEWS_PER_ROUND);
    expect(state.score).toBe(REVIEWS_PER_ROUND * POINTS_PER_ALLOW);
    expect(blockIp(state, '203.0.113.8').outcome).toBeNull();
    expect(state.blockedIps.size).toBe(0);
    expect(reviewThreat(state, -1, 'allow')).toBeNull();
  });

  it('does not encode the verdict in an IP range', () => {
    const make = (malicious: boolean) => {
      const values = [0.1, malicious ? 0.1 : 0.9, 0.1, 0.5, 0.4];
      const state = createState(); spawn(state, () => values.shift()!); return state.threats[0];
    };
    const attack = make(true), request = make(false);
    expect(attack.ip).toBe(request.ip);
    expect(attack.malicious).toBe(true); expect(request.malicious).toBe(false);
  });

  it('keeps the evidence consistent when a source returns in the same round', () => {
    const state = createState();
    for (const malicious of [true, false]) {
      const values = [0.1, malicious ? 0.1 : 0.9, 0.1, 0.5, 0.4];
      spawn(state, () => values.shift()!);
    }
    expect(state.threats[0].ip).toBe(state.threats[1].ip);
    expect(state.threats[0].kind).toBe(state.threats[1].kind);
  });
});

describe('step', () => {
  it('moves live threats left over time', () => {
    const state = createState();
    spawn(state, () => 0.5);
    const xBefore = state.threats[0].x;
    step(state, 0.1, () => 1); // rng=1 avoids spawning a second threat immediately
    expect(state.threats[0].x).toBeLessThan(xBefore);
  });

  it('loses a life and removes the threat only when a malicious packet reaches the edge', () => {
    const state = createState();
    spawn(state, () => 0.5); // malicious at rng=0.5, see spawn's own test
    state.threats[0].x = 0.5;
    state.threats[0].speed = 100;
    step(state, 1, () => 1);
    expect(state.health).toBe(START_HEALTH - 1);
    expect(state.threats).toHaveLength(0);
  });

  it('does not penalize health when legitimate traffic reaches the edge', () => {
    const state = createState();
    spawn(state, () => 0.9); // rng=0.9 -> malicious=false (0.9 >= 0.55)
    expect(state.threats[0].malicious).toBe(false);
    state.threats[0].x = 0.5;
    state.threats[0].speed = 100;
    step(state, 1, () => 1);
    expect(state.health).toBe(START_HEALTH);
    expect(state.threats).toHaveLength(0);
  });

  it('sets over=true when health reaches 0', () => {
    const state = createState();
    state.health = 1;
    spawn(state, () => 0.5);
    state.threats[0].x = 0.5;
    state.threats[0].speed = 100;
    step(state, 1, () => 1);
    expect(state.health).toBe(0);
    expect(state.over).toBe(true);
  });

  it('sets over=true when trust reaches 0', () => {
    const state = createState();
    state.trust = 0;
    step(state, 0.1, () => 1);
    expect(state.over).toBe(true);
  });

  it('does not advance further once game is over', () => {
    const state = createState();
    state.over = true;
    state.score = 42;
    step(state, 1, () => 1);
    expect(state.score).toBe(42);
  });

  it('catches a packet mid-flight if its IP is blocked after it spawned, and fades it out over subsequent steps', () => {
    const state = createState();
    spawn(state, () => 0.5);
    const ip = state.threats[0].ip;
    state.blockedIps.add(ip);
    step(state, 0.1, () => 1);
    expect(state.threats[0].dropped).toBe(true);
    // Fades out (x -= 4 per step from WIDTH) rather than vanishing instantly.
    expect(state.threats[0].x).toBeLessThan(WIDTH);
    expect(state.threats).toHaveLength(1);
  });
});

describe('blockIp', () => {
  it('blocking a malicious in-flight packet scores points and marks it dropped, not removed', () => {
    const state = createState();
    spawn(state, () => 0.5); // malicious
    const t = state.threats[0];
    const result = blockIp(state, t.ip);
    expect(result.outcome).toBe('malicious-blocked');
    expect(state.score).toBe(POINTS_PER_BLOCK);
    expect(state.threats).toHaveLength(1);
    expect(state.threats[0].dropped).toBe(true);
    expect(state.blockedIps.has(t.ip)).toBe(true);
  });

  it('blocking a legitimate in-flight packet costs trust instead of scoring', () => {
    const state = createState();
    spawn(state, () => 0.9); // legit
    const t = state.threats[0];
    const result = blockIp(state, t.ip);
    expect(result.outcome).toBe('legit-blocked');
    expect(state.score).toBe(0);
    expect(state.trust).toBe(START_TRUST - TRUST_PENALTY);
  });

  it('blocking an IP with nothing in flight is a preemptive rule (no score/trust change)', () => {
    const state = createState();
    const result = blockIp(state, '203.0.113.9');
    expect(result.outcome).toBeNull();
    expect(state.blockedIps.has('203.0.113.9')).toBe(true);
    expect(state.score).toBe(0);
    expect(state.trust).toBe(START_TRUST);
  });

  it('blocking an already-blocked IP is idempotent', () => {
    const state = createState();
    blockIp(state, '203.0.113.9');
    const result = blockIp(state, '203.0.113.9');
    expect(result.outcome).toBe('already-blocked');
  });
});

describe('unblockIp', () => {
  it('removes a firewall rule', () => {
    const state = createState();
    state.blockedIps.add('203.0.113.9');
    unblockIp(state, '203.0.113.9');
    expect(state.blockedIps.has('203.0.113.9')).toBe(false);
  });
});

describe('blockAt', () => {
  it('blocks the nearest threat within radius (as a firewall rule) and awards points for a malicious one', () => {
    const state = createState();
    spawn(state, () => 0.5); // malicious
    const t = state.threats[0];
    blockAt(state, t.x, t.y);
    expect(state.threats[0].dropped).toBe(true);
    expect(state.blockedIps.has(t.ip)).toBe(true);
    expect(state.score).toBe(POINTS_PER_BLOCK);
  });

  it('does nothing when no threat is within radius', () => {
    const state = createState();
    spawn(state, () => 0.5);
    blockAt(state, -1000, -1000);
    expect(state.threats[0].dropped).toBe(false);
    expect(state.score).toBe(0);
  });
});
