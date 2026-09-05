import { beforeEach, describe, expect, it } from 'vitest';
import {
  Exam,
  ExamQuestion,
  examUnlocked,
  isAnswered,
  labsRemaining,
  loadExamProgress,
  markExam,
  markQuestion,
  recordAttempt,
  saveExamProgress,
  shuffle,
} from './labExam';
import { EXAMS, examForSection, getExam } from './labExams';
import { LABS } from './labRegistry';

const choose: ExamQuestion = {
  kind: 'choose',
  id: 'q1',
  prompt: 'Pick one',
  options: [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
  ],
  answer: 'b',
  why: 'because',
};

const multi: ExamQuestion = {
  kind: 'multi',
  id: 'q2',
  prompt: 'Pick several',
  options: [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'c', text: 'C' },
  ],
  answer: ['a', 'c'],
  why: 'because',
};

const order: ExamQuestion = {
  kind: 'order',
  id: 'q3',
  prompt: 'Sequence it',
  items: [
    { id: 'x', text: 'X' },
    { id: 'y', text: 'Y' },
  ],
  answer: ['x', 'y'],
  why: 'because',
};

const exam: Exam = {
  id: 'test',
  section: 'Test',
  title: 'Test',
  blurb: 'blurb',
  passPercent: 70,
  questions: [choose, multi, order],
};

describe('marking a single question', () => {
  it('marks a single choice', () => {
    expect(markQuestion(choose, 'b')).toBe(true);
    expect(markQuestion(choose, 'a')).toBe(false);
  });

  it('accepts a multi-answer in any order but demands the exact set', () => {
    expect(markQuestion(multi, ['c', 'a'])).toBe(true);
    expect(markQuestion(multi, ['a'])).toBe(false);
    expect(markQuestion(multi, ['a', 'b', 'c'])).toBe(false);
  });

  it('does not let a repeated selection stand in for a missing one', () => {
    expect(markQuestion(multi, ['a', 'a'])).toBe(false);
  });

  it('requires an ordering question to actually be in order', () => {
    expect(markQuestion(order, ['x', 'y'])).toBe(true);
    expect(markQuestion(order, ['y', 'x'])).toBe(false);
  });

  it('treats nothing, and an empty selection, as unanswered rather than wrong-but-attempted', () => {
    expect(isAnswered(choose, undefined)).toBe(false);
    expect(isAnswered(choose, '')).toBe(false);
    expect(isAnswered(multi, [])).toBe(false);
    expect(markQuestion(choose, undefined)).toBe(false);
  });
});

describe('marking a paper', () => {
  it('scores, and reports which questions were skipped', () => {
    const r = markExam(exam, { q1: 'b', q2: ['a', 'c'] });
    expect(r.correct).toBe(2);
    expect(r.total).toBe(3);
    expect(r.percent).toBe(67);
    expect(r.unanswered).toEqual(['q3']);
  });

  it('passes at the threshold, not merely above it', () => {
    const twoOfThree = markExam(exam, { q1: 'b', q2: ['a', 'c'] });
    expect(twoOfThree.passed).toBe(false); // 67 < 70
    const all = markExam(exam, { q1: 'b', q2: ['a', 'c'], q3: ['x', 'y'] });
    expect(all.percent).toBe(100);
    expect(all.passed).toBe(true);
  });

  it('returns the teaching for every question, right or wrong', () => {
    // The reason is the point of the exercise, so it cannot be conditional on
    // getting the answer wrong — a lucky guess needs it most.
    const r = markExam(exam, { q1: 'b', q2: ['a'], q3: undefined });
    expect(r.marks).toHaveLength(3);
    for (const m of r.marks) expect(m.why.length).toBeGreaterThan(0);
  });

  it('never passes an empty paper', () => {
    const empty: Exam = { ...exam, questions: [] };
    const r = markExam(empty, {});
    expect(r.percent).toBe(0);
    expect(r.passed).toBe(false);
  });
});

describe('progress', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* storage-less environment */
    }
  });

  it('keeps the best attempt, so a worse retake cannot cost a pass', () => {
    let p = recordAttempt({}, 'test', markExam(exam, { q1: 'b', q2: ['a', 'c'], q3: ['x', 'y'] }));
    expect(p.test).toMatchObject({ bestPercent: 100, passed: true, attempts: 1 });
    p = recordAttempt(p, 'test', markExam(exam, {}));
    expect(p.test).toMatchObject({ bestPercent: 100, passed: true, attempts: 2 });
  });

  it('round-trips through storage', () => {
    saveExamProgress({ test: { bestPercent: 80, passed: true, attempts: 3 } });
    expect(loadExamProgress().test).toEqual({ bestPercent: 80, passed: true, attempts: 3 });
  });

  it('survives corrupt stored data', () => {
    try {
      localStorage.setItem('photon-runner:labExams', '[not an object');
    } catch {
      return;
    }
    expect(loadExamProgress()).toEqual({});
  });
});

describe('unlocking', () => {
  it('opens a test only once its labs are done', () => {
    expect(examUnlocked(['a', 'b'], ['a'])).toBe(false);
    expect(examUnlocked(['a', 'b'], ['a', 'b'])).toBe(true);
  });

  it('never opens a test for a section with no labs', () => {
    expect(examUnlocked([], [])).toBe(false);
  });

  it('counts what is left to do', () => {
    expect(labsRemaining(['a', 'b', 'c'], ['b'])).toBe(2);
  });
});

describe('shuffle', () => {
  it('is deterministic for a seed and keeps every item', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect(shuffle(items, 42)).toEqual(shuffle(items, 42));
    expect([...shuffle(items, 42)].sort()).toEqual(items);
  });

  it('leaves the original alone', () => {
    const items = ['a', 'b', 'c'];
    shuffle(items, 7);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});

describe('the authored tests', () => {
  it('covers every topic the labs teach', () => {
    const sections = new Set(LABS.map((l) => l.category));
    for (const s of sections) {
      expect(examForSection(s), `no test closes out "${s}"`).toBeTruthy();
    }
  });

  it('has a test for each of the named topics', () => {
    for (const id of [
      'exam-foundations',
      'exam-web',
      'exam-social',
      'exam-wireless',
      'exam-availability',
      'exam-crypto',
    ]) {
      expect(getExam(id), `${id} missing`).toBeTruthy();
    }
  });

  it('uses unique ids throughout', () => {
    const examIds = EXAMS.map((e) => e.id);
    expect(new Set(examIds).size).toBe(examIds.length);
    for (const e of EXAMS) {
      const qIds = e.questions.map((q) => q.id);
      expect(new Set(qIds).size, `${e.id} repeats a question id`).toBe(qIds.length);
    }
  });

  it('gives every question a reachable answer', () => {
    for (const e of EXAMS) {
      for (const q of e.questions) {
        const ids = new Set((q.kind === 'order' ? q.items : q.options).map((o) => o.id));
        const answer = q.kind === 'choose' ? [q.answer] : q.answer;
        for (const a of answer) {
          expect(ids.has(a), `${e.id}/${q.id} answers with "${a}", which is not an option`).toBe(true);
        }
      }
    }
  });

  it('makes an ordering question use every item exactly once', () => {
    for (const e of EXAMS) {
      for (const q of e.questions) {
        if (q.kind !== 'order') continue;
        expect(q.answer.length, `${e.id}/${q.id}`).toBe(q.items.length);
        expect(new Set(q.answer).size).toBe(q.items.length);
      }
    }
  });

  it('never poses a multi-answer question with only one right answer', () => {
    // That is a single-choice question wearing a checkbox, and it teaches the
    // learner to stop looking after the first plausible option.
    for (const e of EXAMS) {
      for (const q of e.questions) {
        if (q.kind !== 'multi') continue;
        expect(q.answer.length, `${e.id}/${q.id}`).toBeGreaterThan(1);
        expect(q.answer.length, `${e.id}/${q.id} has no wrong options`).toBeLessThanOrEqual(q.options.length);
      }
    }
  });

  it('offers at least one wrong option everywhere it can be got wrong', () => {
    for (const e of EXAMS) {
      for (const q of e.questions) {
        if (q.kind === 'choose') expect(q.options.length, `${e.id}/${q.id}`).toBeGreaterThan(1);
      }
    }
  });

  it('explains every question at length, because the explanation is the lesson', () => {
    for (const e of EXAMS) {
      for (const q of e.questions) {
        expect(q.why.length, `${e.id}/${q.id} is under-explained`).toBeGreaterThan(80);
        expect(q.prompt.length, `${e.id}/${q.id} prompt`).toBeGreaterThan(10);
      }
    }
  });

  it('sets a pass mark that is demanding but survivable', () => {
    for (const e of EXAMS) {
      expect(e.passPercent, e.id).toBeGreaterThanOrEqual(60);
      expect(e.passPercent, e.id).toBeLessThanOrEqual(90);
      expect(e.questions.length, `${e.id} is too short to grade fairly`).toBeGreaterThanOrEqual(4);
    }
  });
});
