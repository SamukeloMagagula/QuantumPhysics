import { describe, expect, it } from 'vitest';
import { blockAt, createState, spawn, step, WIDTH, START_HEALTH, POINTS_PER_BLOCK } from '../games/network-defender/logic';

describe('createState', () => {
  it('starts with full health, no score, no threats', () => {
    const state = createState();
    expect(state.health).toBe(START_HEALTH);
    expect(state.score).toBe(0);
    expect(state.threats).toHaveLength(0);
    expect(state.over).toBe(false);
  });
});

describe('spawn', () => {
  it('adds one threat starting at the right edge', () => {
    const state = createState();
    spawn(state, () => 0.5);
    expect(state.threats).toHaveLength(1);
    expect(state.threats[0].x).toBe(WIDTH);
  });
});

describe('step', () => {
  it('moves threats left over time', () => {
    const state = createState();
    spawn(state, () => 0.5);
    const xBefore = state.threats[0].x;
    step(state, 0.1, () => 1); // rng=1 avoids spawning a second threat immediately
    expect(state.threats[0].x).toBeLessThan(xBefore);
  });

  it('loses a life and removes the threat when it reaches the left edge', () => {
    const state = createState();
    spawn(state, () => 0.5);
    state.threats[0].x = 0.5;
    state.threats[0].speed = 100;
    step(state, 1, () => 1);
    expect(state.health).toBe(START_HEALTH - 1);
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

  it('does not advance further once game is over', () => {
    const state = createState();
    state.over = true;
    state.score = 42;
    step(state, 1, () => 1);
    expect(state.score).toBe(42);
  });
});

describe('blockAt', () => {
  it('removes the nearest threat within radius and awards points', () => {
    const state = createState();
    spawn(state, () => 0.5);
    const t = state.threats[0];
    blockAt(state, t.x, t.y);
    expect(state.threats).toHaveLength(0);
    expect(state.score).toBe(POINTS_PER_BLOCK);
  });

  it('does nothing when no threat is within radius', () => {
    const state = createState();
    spawn(state, () => 0.5);
    blockAt(state, -1000, -1000);
    expect(state.threats).toHaveLength(1);
    expect(state.score).toBe(0);
  });
});
