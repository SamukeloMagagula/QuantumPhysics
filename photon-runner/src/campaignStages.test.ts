import { beforeEach, describe, expect, it } from 'vitest';
import {
  STAGES,
  StageProgress,
  formatTime,
  getStage,
  isCompleted,
  isPlayable,
  isUnlocked,
  loadCase,
  loadProgress,
  mergeCase,
  nextStage,
  rate,
  recordClear,
  saveCase,
  saveProgress,
} from './campaignStages';
import { getChapter } from './campaignStory';

describe('stage catalogue', () => {
  it('covers the Prologue and all six incidents', () => {
    expect(STAGES).toHaveLength(7);
    expect(STAGES.map((s) => s.id)).toContain('prologue');
    expect(STAGES.map((s) => s.id)).toContain('incident-06');
  });

  it('numbers the stages consecutively from one', () => {
    const orders = STAGES.map((s) => s.order).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('backs every built stage with real chapter content', () => {
    // A stage marked built but with no chapter would be enterable and empty.
    for (const s of STAGES.filter((x) => x.built)) {
      expect(getChapter(s.id), `${s.id} is built but has no chapter`).not.toBeNull();
    }
  });

  it('gives every stage a par time and a brief', () => {
    for (const s of STAGES) {
      expect(s.parSeconds, s.id).toBeGreaterThan(0);
      expect(s.brief.length, s.id).toBeGreaterThan(30);
    }
  });
});

describe('unlock chain', () => {
  const empty: StageProgress = {};

  it('opens the first stage and locks the rest', () => {
    expect(isUnlocked(empty, 'prologue')).toBe(true);
    expect(isUnlocked(empty, 'incident-01')).toBe(false);
    expect(isUnlocked(empty, 'incident-06')).toBe(false);
  });

  it('unlocks the next stage only after the previous is cleared', () => {
    const p = recordClear(empty, 'prologue', 100_000);
    expect(isUnlocked(p, 'incident-01')).toBe(true);
    expect(isUnlocked(p, 'incident-02')).toBe(false);
  });

  it('requires every earlier stage, not just the immediately preceding one', () => {
    // Completing stage 2 without stage 1 must not open stage 3.
    const p = recordClear({}, 'incident-01', 100_000);
    expect(isUnlocked(p, 'incident-02')).toBe(false);
  });

  it('does not let an unbuilt stage be played even once unlocked', () => {
    let p = recordClear({}, 'prologue', 1000);
    p = recordClear(p, 'incident-01', 1000);
    expect(isUnlocked(p, 'incident-02')).toBe(true);
    expect(isPlayable(p, 'incident-02'), 'unbuilt stage was playable').toBe(false);
  });

  it('reports the next stage to attempt, and null when the built ones are done', () => {
    expect(nextStage({})?.id).toBe('prologue');
    const p1 = recordClear({}, 'prologue', 1000);
    expect(nextStage(p1)?.id).toBe('incident-01');
    const p2 = recordClear(p1, 'incident-01', 1000);
    expect(nextStage(p2)).toBeNull();
  });
});

describe('recordClear', () => {
  it('marks completion and stores the time', () => {
    const p = recordClear({}, 'prologue', 90_000);
    expect(isCompleted(p, 'prologue')).toBe(true);
    expect(p.prologue.bestMs).toBe(90_000);
  });

  it('keeps the faster time when a stage is replayed', () => {
    let p = recordClear({}, 'prologue', 90_000);
    p = recordClear(p, 'prologue', 250_000);
    expect(p.prologue.bestMs, 'a slower replay overwrote the best time').toBe(90_000);
    p = recordClear(p, 'prologue', 45_000);
    expect(p.prologue.bestMs).toBe(45_000);
  });
});

describe('rating against par', () => {
  it('awards under-par for beating the target time', () => {
    const par = getStage('prologue')!.parSeconds * 1000;
    expect(rate('prologue', par - 1000)).toBe('under-par');
    expect(rate('prologue', par)).toBe('under-par');
  });

  it('still clears the stage when over par', () => {
    // The timer must never fail a learner for taking their time — the
    // campaign teaches verification, and a fail-timer would punish it.
    const par = getStage('prologue')!.parSeconds * 1000;
    expect(rate('prologue', par + 60_000)).toBe('cleared');
  });
});

describe('formatTime', () => {
  it('formats as m:ss with a padded seconds field', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9_000)).toBe('0:09');
    expect(formatTime(65_000)).toBe('1:05');
    expect(formatTime(600_000)).toBe('10:00');
  });

  it('never renders a negative time', () => {
    expect(formatTime(-5000)).toBe('0:00');
  });
});

describe('persistence', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* jsdom without storage — the functions must cope either way */
    }
  });

  it('round-trips progress', () => {
    saveProgress(recordClear({}, 'prologue', 12_345));
    const back = loadProgress();
    expect(back.prologue?.completed).toBe(true);
    expect(back.prologue?.bestMs).toBe(12_345);
  });

  it('returns empty progress when nothing is stored', () => {
    expect(loadProgress()).toEqual({});
  });

  it('survives corrupt stored data rather than throwing', () => {
    try {
      localStorage.setItem('phantom-q:stageProgress', '{not json');
    } catch {
      return;
    }
    expect(loadProgress()).toEqual({});
  });
});

describe('the carried case file', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* storage-less environment */
    }
  });

  it('starts empty', () => {
    expect(loadCase()).toEqual({ knownFacts: [], evidence: [] });
  });

  it('carries evidence forward between stages', () => {
    // The bible: Incident 01 opens with "only evidence already earned".
    saveCase({
      knownFacts: ['Alice is the source of the files.'],
      evidence: [{ id: 'transfer-1', label: 'delivered', detail: 'x' }],
    });
    const back = loadCase();
    expect(back.knownFacts).toHaveLength(1);
    expect(back.evidence[0].id).toBe('transfer-1');
  });

  it('merges without duplicating facts or artefacts', () => {
    const a = {
      knownFacts: ['f1'],
      evidence: [{ id: 'e1', label: 'a', detail: 'a' }],
    };
    const merged = mergeCase(a, {
      knownFacts: ['f1', 'f2'],
      evidence: [
        { id: 'e1', label: 'a', detail: 'a' },
        { id: 'e2', label: 'b', detail: 'b' },
      ],
    });
    expect(merged.knownFacts).toEqual(['f1', 'f2']);
    expect(merged.evidence.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('survives corrupt stored data', () => {
    try {
      localStorage.setItem('phantom-q:caseFile', 'nonsense');
    } catch {
      return;
    }
    expect(loadCase()).toEqual({ knownFacts: [], evidence: [] });
  });
});
