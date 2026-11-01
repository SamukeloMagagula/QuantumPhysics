import { afterEach, describe, expect, it, vi } from 'vitest';
import { pullProgress, readLocalProgress, writeLocalProgress } from './progressClient';
import { PROGRESS_KEYS, cleanProgress } from './progressSync';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('progress sync client', () => {
  it('reads the keys the game already writes, filling a partial look with defaults', () => {
    localStorage.setItem(PROGRESS_KEYS.explored, JSON.stringify(['ops']));
    localStorage.setItem(PROGRESS_KEYS.appearance, JSON.stringify({ nickname: 'Nova', outfit: 'hoodie' }));
    const p = readLocalProgress();
    expect(p.explored).toEqual(['ops']);
    expect(p.appearance).toMatchObject({ nickname: 'Nova', outfit: 'hoodie' });
  });

  it('writes merged progress back where the game will read it', () => {
    writeLocalProgress(cleanProgress({ explored: ['ops'], story: { access: true, completed: 2 }, labs: ['xss'] }));
    expect(JSON.parse(localStorage.getItem(PROGRESS_KEYS.story)!)).toEqual({ access: true, completed: 2 });
    expect(JSON.parse(localStorage.getItem(PROGRESS_KEYS.labs)!)).toEqual(['xss']);
  });

  it('brings in the server copy before play, keeping what this browser already had', async () => {
    localStorage.setItem(PROGRESS_KEYS.explored, JSON.stringify(['breakroom']));
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => (init?.method === 'PUT' ? {} : { progress: { explored: ['ops'], story: { access: true, completed: 1 } } }),
    })));
    await pullProgress();
    expect(JSON.parse(localStorage.getItem(PROGRESS_KEYS.explored)!).sort()).toEqual(['breakroom', 'ops']);
    expect(JSON.parse(localStorage.getItem(PROGRESS_KEYS.story)!).completed).toBe(1);
  });

  it('does not hold up the game when the server is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const started = Date.now();
    await pullProgress(50);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
