import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  elapsedMs,
  emptySession,
  getSession,
  isRunning,
  resetSession,
  setSession,
  subscribeSession,
  updateSession,
} from './campaignSession';
import { CHAPTERS, getChapter } from './campaignStory';
import { HOTSPOTS } from './pqScene';

describe('the campaign session', () => {
  beforeEach(() => resetSession());

  it('starts idle', () => {
    expect(getSession().stageId).toBeNull();
    expect(isRunning()).toBe(false);
  });

  it('survives being read again after a stage starts', () => {
    // This is the whole point of holding the run outside React: standing up
    // from the workstation unmounts the panel, and the stage must not go
    // with it.
    updateSession((s) => ({ ...s, stageId: 'incident-01', startedAt: 1000 }));
    expect(getSession().stageId).toBe('incident-01');
    expect(isRunning()).toBe(true);
  });

  it('hands out a new object on every write, so subscribers re-render', () => {
    const before = getSession();
    updateSession((s) => ({ ...s, solved: ['a'] }));
    expect(getSession()).not.toBe(before);
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const fn = vi.fn();
    const off = subscribeSession(fn);
    updateSession((s) => ({ ...s, solved: ['a'] }));
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    updateSession((s) => ({ ...s, solved: ['a', 'b'] }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stops counting once the stage is cleared', () => {
    setSession({ ...emptySession(), stageId: 'prologue', startedAt: 1000 });
    expect(elapsedMs(getSession(), 4000)).toBe(3000);
    updateSession((s) => ({ ...s, result: { ms: 3000, underPar: true } }));
    // The summary can sit on screen for a minute without inflating the time.
    expect(elapsedMs(getSession(), 90_000)).toBe(3000);
    expect(isRunning()).toBe(false);
  });

  it('reports no elapsed time while idle', () => {
    expect(elapsedMs(getSession(), 5000)).toBe(0);
  });

  it('never reports a negative time if the clock moves backwards', () => {
    setSession({ ...emptySession(), stageId: 'prologue', startedAt: 9000 });
    expect(elapsedMs(getSession(), 1000)).toBe(0);
  });

  it('clears back to idle', () => {
    updateSession((s) => ({ ...s, stageId: 'prologue', solved: ['x'] }));
    resetSession();
    expect(getSession()).toEqual(emptySession());
  });
});

describe('beats that happen away from the desk', () => {
  it('sends every placed beat somewhere the player can actually stand', () => {
    for (const ch of CHAPTERS) {
      for (const b of ch.beats) {
        if (!b.at || b.at === 'workstation') continue;
        const spot = HOTSPOTS.find((h) => h.station === b.at);
        expect(spot, `${ch.id}/${b.id} is set at "${b.at}", which is not a station`).toBeTruthy();
      }
    }
  });

  it('only sends the player somewhere for work that is actually physical', () => {
    // A placed beat costs a walk. Making one out of a beat with nothing to do
    // at the other end is just a detour.
    for (const ch of CHAPTERS) {
      for (const b of ch.beats) {
        if (!b.at || b.at === 'workstation') continue;
        expect(b.exercise, `${ch.id}/${b.id} sends the player away with no task`).toBeTruthy();
      }
    }
  });

  it('puts the rack rebuild at the rack', () => {
    const beat = getChapter('incident-01')!.beats.find((b) => b.id === 'i1-rack')!;
    expect(beat.at).toBe('rack');
    expect(beat.exercise?.kind).toBe('rack');
  });
});
