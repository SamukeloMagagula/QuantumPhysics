import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from './characterAppearance';
import { EMPTY_PROGRESS, cleanProgress, formatSaveCode, mergeProgress, normaliseSaveCode } from './progressSync';

const look = { ...DEFAULT_APPEARANCE, nickname: 'Nova' };

describe('saved progress', () => {
  it('keeps well-formed progress and drops everything else', () => {
    const p = cleanProgress({
      explored: ['ops', 'ops', '<script>', 7],
      story: { access: true, completed: 99 },
      appearance: { ...look, hairColor: 'javascript:alert(1)' },
      labs: ['caesar-cipher'],
      exams: { 'section-1': { bestPercent: 140, passed: true, attempts: 2 }, 'bad id!': {} },
      campaign: ['scene1'],
      extra: 'ignored',
    });
    expect(p.explored).toEqual(['ops']);
    expect(p.story).toEqual({ access: true, completed: 20 });
    expect(p.appearance).toBeNull();
    expect(p.exams).toEqual({ 'section-1': { bestPercent: 100, passed: true, attempts: 2 } });
    expect(cleanProgress('nonsense')).toEqual(EMPTY_PROGRESS);
  });

  it('keeps a valid appearance with its callsign', () => {
    expect(cleanProgress({ appearance: look }).appearance).toMatchObject({ outfit: look.outfit, nickname: 'Nova' });
  });

  it('merges by adding, never by undoing', () => {
    const a = cleanProgress({ explored: ['ops'], story: { access: true, completed: 2 }, exams: { s1: { bestPercent: 80, passed: true, attempts: 1 } } });
    const b = cleanProgress({ explored: ['breakroom'], story: { access: false, completed: 1 }, exams: { s1: { bestPercent: 40, passed: false, attempts: 3 } } });
    const m = mergeProgress(a, b);
    expect(m.explored.sort()).toEqual(['breakroom', 'ops']);
    expect(m.story).toEqual({ access: true, completed: 2 });
    expect(m.exams.s1).toEqual({ bestPercent: 80, passed: true, attempts: 3 });
  });

  it('takes the newer appearance, but never replaces one with nothing', () => {
    const old = cleanProgress({ appearance: look });
    const changed = cleanProgress({ appearance: { ...look, nickname: 'Kai' } });
    expect(mergeProgress(old, changed).appearance?.nickname).toBe('Kai');
    expect(mergeProgress(old, EMPTY_PROGRESS).appearance?.nickname).toBe('Nova');
  });

  it('reads save codes the way people type them', () => {
    expect(normaliseSaveCode('k7qm 3xpa')).toBe('K7QM3XPA');
    expect(normaliseSaveCode('K7QM-3XP0')).toBeNull(); // 0 is not in the alphabet
    expect(normaliseSaveCode('short')).toBeNull();
    expect(formatSaveCode('K7QM3XPA')).toBe('K7QM-3XPA');
  });
});
