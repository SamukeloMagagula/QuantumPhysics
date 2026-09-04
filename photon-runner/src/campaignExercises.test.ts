import { describe, expect, it } from 'vitest';
import {
  ClassifyExercise,
  OrderExercise,
  PhishExercise,
  RackExercise,
  TransferExercise,
  checkClassify,
  checkOrder,
  checkPhish,
  checkRack,
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
        } else if (ex.kind === 'transfer') {
          expect(ex.files.some((f) => f.id === ex.correct), `${ch.id}/${b.id}`).toBe(true);
          expect(checkTransfer(ex, ex.correct).ok).toBe(true);
        } else if (ex.kind === 'rack') {
          const seated = Object.fromEntries(ex.slots.map((sl) => [sl.id, sl.accepts]));
          expect(checkRack(ex, seated).ok, `${ch.id}/${b.id}`).toBe(true);
          // Every bay must accept a module that actually exists.
          for (const sl of ex.slots) {
            expect(ex.modules.some((m) => m.id === sl.accepts), `${ch.id}/${b.id}/${sl.id}`).toBe(true);
          }
        } else {
          const tells = ex.tells.filter((t) => t.suspicious).map((t) => t.id);
          expect(tells.length, `${ch.id}/${b.id} has no genuine tells`).toBeGreaterThanOrEqual(ex.requiredTells);
          expect(checkPhish(ex, tells, ex.correctAction).ok, `${ch.id}/${b.id}`).toBe(true);
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

    const rk = exerciseOf('incident-01', 'i1-rack') as RackExercise;
    expect(isSolved(rk, Object.fromEntries(rk.slots.map((s) => [s.id, s.accepts])))).toBe(true);
    expect(isSolved(rk, {})).toBe(false);

    const ph = exerciseOf('prologue', 'phish') as PhishExercise;
    const tells = ph.tells.filter((t) => t.suspicious).map((t) => t.id);
    expect(isSolved(ph, { tells, action: ph.correctAction })).toBe(true);
    expect(isSolved(ph, { tells, action: 'comply' })).toBe(false);
    expect(isSolved(ph, undefined)).toBe(false);
  });
});

describe('rack — seating the capture chain', () => {
  const rack = () => exerciseOf('incident-01', 'i1-rack') as RackExercise;

  it('accepts the chain seated in order', () => {
    const ex = rack();
    const seated = Object.fromEntries(ex.slots.map((s) => [s.id, s.accepts]));
    expect(checkRack(ex, seated).ok).toBe(true);
  });

  it('reports empty bays rather than passing a half-built rack', () => {
    const ex = rack();
    const r = checkRack(ex, { [ex.slots[0].id]: ex.slots[0].accepts });
    expect(r.ok).toBe(false);
    expect(r.empty).toHaveLength(ex.slots.length - 1);
  });

  it('explains a wrongly seated module instead of buzzing', () => {
    const ex = rack();
    const seated = Object.fromEntries(ex.slots.map((s) => [s.id, s.accepts]));
    // Swap the first two modules — a plausible mistake, not a random one.
    seated[ex.slots[0].id] = ex.slots[1].accepts;
    seated[ex.slots[1].id] = ex.slots[0].accepts;
    const r = checkRack(ex, seated);
    expect(r.ok).toBe(false);
    expect(r.wrong).toHaveLength(2);
    for (const w of r.wrong) expect(w.why.length).toBeGreaterThan(20);
  });

  it('gives every bay a distinct module and a reason', () => {
    for (const ch of CHAPTERS) {
      for (const b of ch.beats) {
        if (b.exercise?.kind !== 'rack') continue;
        const ex = b.exercise;
        const accepts = ex.slots.map((s) => s.accepts);
        expect(new Set(accepts).size, `${ch.id}/${b.id} reuses a module`).toBe(accepts.length);
        for (const a of accepts) {
          expect(ex.modules.some((m) => m.id === a), `${ch.id}/${b.id} wants a module that does not exist`).toBe(true);
        }
        // Every module must have somewhere to go, or the player is left
        // holding a part with no bay.
        expect(ex.modules.length).toBe(ex.slots.length);
        for (const s of ex.slots) expect(s.why.length, `${ch.id}/${b.id}/${s.id}`).toBeGreaterThan(20);
      }
    }
  });
});

describe('phish — handling the message', () => {
  const phish = () => exerciseOf('prologue', 'phish') as PhishExercise;
  const genuine = (ex: PhishExercise) => ex.tells.filter((t) => t.suspicious).map((t) => t.id);

  it('passes the safe action once the warning signs have been found', () => {
    const ex = phish();
    const r = checkPhish(ex, genuine(ex), ex.correctAction);
    expect(r.ok).toBe(true);
    expect(r.message).toBe(ex.actions.find((a) => a.id === ex.correctAction)!.outcome);
  });

  it('refuses the right call made on instinct', () => {
    // Reporting something you cannot describe is how a real report gets
    // dismissed; the exercise asks for the reason, not just the reflex.
    const ex = phish();
    const r = checkPhish(ex, [], ex.correctAction);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/instinct/i);
  });

  it('does not count the harmless details towards the warning signs', () => {
    const ex = phish();
    const innocuous = ex.tells.filter((t) => !t.suspicious).map((t) => t.id);
    expect(innocuous.length, 'no decoys — the exercise would be trivial').toBeGreaterThan(0);
    expect(checkPhish(ex, innocuous, ex.correctAction).ok).toBe(false);
  });

  it('answers a wrong action with its consequence', () => {
    const ex = phish();
    const bad = ex.actions.find((a) => a.id !== ex.correctAction)!;
    const r = checkPhish(ex, genuine(ex), bad.id);
    expect(r.ok).toBe(false);
    expect(r.message).toBe(bad.outcome);
    expect(r.message.length).toBeGreaterThan(40);
  });

  it('handles an unknown action without throwing', () => {
    const ex = phish();
    expect(checkPhish(ex, genuine(ex), 'nonsense').ok).toBe(false);
  });

  it('keeps Eve out of the attacker role', () => {
    // The campaign bible is explicit: Eve is authorised security support and
    // is never the villain. A phish sent by her would break the character.
    for (const ch of CHAPTERS) {
      for (const b of ch.beats) {
        if (b.exercise?.kind !== 'phish') continue;
        const ex = b.exercise;
        expect(ex.from.toLowerCase()).not.toContain('eve');
        expect(ex.requiredTells).toBeGreaterThan(0);
        expect(ex.requiredTells).toBeLessThanOrEqual(ex.tells.filter((t) => t.suspicious).length);
        expect(ex.actions.some((a) => a.id === ex.correctAction)).toBe(true);
        for (const t of ex.tells) expect(t.why.length, `${ch.id}/${b.id}/${t.id}`).toBeGreaterThan(20);
      }
    }
  });
});
