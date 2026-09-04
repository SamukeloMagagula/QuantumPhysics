import { describe, expect, it } from 'vitest';
import {
  ClassifyExercise,
  OrderExercise,
  TransferExercise,
  checkClassify,
  checkOrder,
  checkTransfer,
  isSolved,
  shuffleEvents,
} from './campaignExercises';
import { CHAPTERS, getChapter } from './campaignStory';

/** Pull a real exercise out of the campaign rather than inventing fixtures —
 * these tests should fail if the authored content drifts. */
function exerciseOf(chapterId: Parameters<typeof getChapter>[0], beatId: string) {
  const b = getChapter(chapterId)!.beats.find((x) => x.id === beatId)!;
  return b.exercise!;
}

describe('order — timeline reconstruction', () => {
  const ex = exerciseOf('incident-01', 'i1-reconstruct') as OrderExercise;

  it('accepts the authored sequence', () => {
    const r = checkOrder(ex, ex.events.map((e) => e.id));
    expect(r.ok).toBe(true);
  });

  it('names the causal conflict rather than saying "wrong"', () => {
    // Bob reporting nothing received, before the send.
    const ids = ex.events.map((e) => e.id);
    const swapped = [...ids];
    const i2 = swapped.indexOf('e2');
    const i3 = swapped.indexOf('e3');
    [swapped[i2], swapped[i3]] = [swapped[i3], swapped[i2]];
    const r = checkOrder(ex, swapped);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('SEQUENCE CONFLICT');
    expect(r.message?.toLowerCase()).toContain('before the transfer occurs');
  });

  it('flags a retry evaluated before the source was confirmed', () => {
    const ids = ex.events.map((e) => e.id);
    const moved = ids.filter((i) => i !== 'e4').concat('e4'); // check-with-Alice last
    const r = checkOrder(ex, moved);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('MISSING STEP');
  });

  it('reports misplaced items when nothing is causally impossible', () => {
    // Swap two events with no constraint between them.
    const ids = ex.events.map((e) => e.id);
    const swapped = [...ids];
    [swapped[7], swapped[8]] = [swapped[8], swapped[7]];
    const r = checkOrder(ex, swapped);
    expect(r.ok).toBe(false);
    expect(r.misplaced.length).toBeGreaterThan(0);
  });

  it('shuffles deterministically and never hands over the answer', () => {
    const a = shuffleEvents(ex, 7).map((e) => e.id);
    const b = shuffleEvents(ex, 7).map((e) => e.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(ex.events.map((e) => e.id));
    expect([...a].sort()).toEqual([...ex.events.map((e) => e.id)].sort());
  });
});

describe('classify — fact vs assumption', () => {
  const ex = exerciseOf('incident-01', 'i1-fact-assumption') as ClassifyExercise;
  const perfect = () => Object.fromEntries(ex.items.map((i) => [i.id, i.bucket]));

  it('accepts a fully correct board', () => {
    expect(checkClassify(ex, perfect()).ok).toBe(true);
  });

  it('will not pass a partially filled board', () => {
    const partial = { ...perfect() };
    delete (partial as Record<string, string>).s1;
    const r = checkClassify(ex, partial);
    expect(r.ok).toBe(false);
    expect(r.unplaced).toContain('s1');
  });

  it('explains why a misplaced statement belongs elsewhere', () => {
    const wrong = { ...perfect(), s5: 'fact' }; // "Eve changed the file" as fact
    const r = checkClassify(ex, wrong);
    expect(r.ok).toBe(false);
    const miss = r.wrong.find((w) => w.id === 's5')!;
    expect(miss.belongs).toBe('assumption');
    expect(miss.why.toLowerCase()).toContain('no evidence');
  });

  it('holds the line that reading the file is unknown, not a fact', () => {
    // The bible is explicit: a suspicious event does not prove the contents
    // were read. Calling it a fact must be rejected.
    const item = ex.items.find((i) => i.id === 's4')!;
    expect(item.bucket).toBe('unknown');
    const r = checkClassify(ex, { ...perfect(), s4: 'fact' });
    expect(r.ok).toBe(false);
  });

  it('treats blaming Eve as an assumption, never a fact', () => {
    // Word-boundary match: "an unrecognised credential *eve*nt" is a
    // different statement, and it genuinely is a fact.
    const eve = ex.items.find((i) => i.text.startsWith('Eve'))!;
    expect(eve.text).toContain('Eve changed the file');
    expect(eve.bucket).toBe('assumption');
  });
});

describe('classify — the CIA board', () => {
  const ex = exerciseOf('incident-01', 'i1-cia') as ClassifyExercise;
  const perfect = () => Object.fromEntries(ex.items.map((i) => [i.id, i.bucket]));

  it('marks availability and integrity affected', () => {
    expect(ex.items.find((i) => i.id === 'availability')!.bucket).toBe('affected');
    expect(ex.items.find((i) => i.id === 'integrity')!.bucket).toBe('affected');
  });

  it('marks confidentiality in question, not affected', () => {
    // The nuance the bible insists on: a suspicious event does not mean
    // every property failed.
    expect(ex.items.find((i) => i.id === 'confidentiality')!.bucket).toBe('question');
    const r = checkClassify(ex, { ...perfect(), confidentiality: 'affected' });
    expect(r.ok).toBe(false);
    expect(r.wrong[0].why.toLowerCase()).toContain('no proof');
  });
});

describe('transfer — sending the right file', () => {
  const ex = exerciseOf('prologue', 'send-1') as TransferExercise;

  it('accepts the requested file', () => {
    expect(checkTransfer(ex, ex.correct).ok).toBe(true);
  });

  it('gives a believable consequence for the wrong file, not a buzzer', () => {
    const other = ex.files.find((f) => f.id !== ex.correct)!;
    const r = checkTransfer(ex, other.id);
    expect(r.ok).toBe(false);
    expect(r.message).toBeTruthy();
    expect(r.message!.toLowerCase()).not.toContain('wrong answer');
  });
});

describe('authored content', () => {
  it('gives every exercise a solvable, self-consistent answer', () => {
    for (const ch of CHAPTERS) {
      for (const b of ch.beats) {
        const ex = b.exercise;
        if (!ex) continue;
        if (ex.kind === 'order') {
          expect(checkOrder(ex, ex.events.map((e) => e.id)).ok, `${ch.id}/${b.id}`).toBe(true);
        } else if (ex.kind === 'classify') {
          const answer = Object.fromEntries(ex.items.map((i) => [i.id, i.bucket]));
          expect(checkClassify(ex, answer).ok, `${ch.id}/${b.id}`).toBe(true);
          // Every target bucket must actually exist on the board.
          for (const i of ex.items) {
            expect(ex.buckets.some((x) => x.id === i.bucket), `${ch.id}/${b.id}/${i.id}`).toBe(true);
          }
        } else {
          expect(ex.files.some((f) => f.id === ex.correct), `${ch.id}/${b.id}`).toBe(true);
          expect(checkTransfer(ex, ex.correct).ok).toBe(true);
        }
      }
    }
  });

  it('makes the player do something in both built chapters', () => {
    for (const id of ['prologue', 'incident-01'] as const) {
      const withEx = getChapter(id)!.beats.filter((b) => b.exercise).length;
      expect(withEx, `${id} has no interaction`).toBeGreaterThan(0);
    }
  });

  it('explains every wrong placement it can produce', () => {
    for (const ch of CHAPTERS) {
      for (const b of ch.beats) {
        if (b.exercise?.kind !== 'classify') continue;
        for (const i of b.exercise.items) {
          expect(i.why.length, `${ch.id}/${b.id}/${i.id}`).toBeGreaterThan(20);
        }
      }
    }
  });
});

describe('isSolved', () => {
  it('gates on the correct answer for each exercise kind', () => {
    const order = exerciseOf('incident-01', 'i1-reconstruct') as OrderExercise;
    expect(isSolved(order, order.events.map((e) => e.id))).toBe(true);
    expect(isSolved(order, [...order.events.map((e) => e.id)].reverse())).toBe(false);

    const cls = exerciseOf('incident-01', 'i1-cia') as ClassifyExercise;
    expect(isSolved(cls, Object.fromEntries(cls.items.map((i) => [i.id, i.bucket])))).toBe(true);
    expect(isSolved(cls, {})).toBe(false);

    const tr = exerciseOf('prologue', 'send-1') as TransferExercise;
    expect(isSolved(tr, tr.correct)).toBe(true);
    expect(isSolved(tr, 'nonsense')).toBe(false);
  });
});
