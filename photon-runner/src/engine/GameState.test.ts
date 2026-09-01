import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gameState } from './GameState';

describe('gameState', () => {
  beforeEach(() => gameState.reset());

  it('starts in MAIN_MENU', () => {
    expect(gameState.current).toBe('MAIN_MENU');
    expect(gameState.is('MAIN_MENU')).toBe(true);
  });

  it('transitions and notifies subscribers with from/to', () => {
    const fn = vi.fn();
    const unsub = gameState.subscribe(fn);

    gameState.set('TUTORIAL');

    expect(gameState.current).toBe('TUTORIAL');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0]).toMatchObject({ from: 'MAIN_MENU', to: 'TUTORIAL' });
    unsub();
  });

  it('is() accepts multiple candidate states', () => {
    gameState.set('MISSION');
    expect(gameState.is('EXPLORATION', 'MISSION', 'CONFLICT')).toBe(true);
    expect(gameState.is('RESULTS', 'PAUSED')).toBe(false);
  });

  it('setting the same state again is a no-op and does not notify', () => {
    gameState.set('EXPLORATION');
    const fn = vi.fn();
    gameState.subscribe(fn);
    gameState.set('EXPLORATION');
    expect(fn).not.toHaveBeenCalled();
  });

  it('an unsubscribed listener stops receiving transitions', () => {
    const fn = vi.fn();
    const unsub = gameState.subscribe(fn);
    unsub();
    gameState.set('PAUSED');
    expect(fn).not.toHaveBeenCalled();
  });

  it('keeps a bounded recent history', () => {
    for (let i = 0; i < 60; i++) {
      gameState.set(i % 2 === 0 ? 'EXPLORATION' : 'MISSION');
    }
    expect(gameState.recentHistory().length).toBeLessThanOrEqual(50);
  });
});
