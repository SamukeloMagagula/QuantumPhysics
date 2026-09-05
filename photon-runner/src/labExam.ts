/**
 * End-of-section tests for the security labs.
 *
 * The labs teach by doing; these check whether the doing stuck. Two rules
 * shape the whole engine, and both come from the campaign's tone:
 *
 * - Every question carries the reason for its answer, and that reason is
 *   shown whether the learner got it right or wrong. A mark with no reason
 *   teaches nothing, and someone who guessed correctly needs the reason
 *   more than someone who reasoned their way to a wrong answer.
 * - Failing is not a dead end. Attempts are unlimited, the best score is
 *   what is kept, and the review is the point of the exercise.
 *
 * Everything is pure over explicit inputs, so an exam can be marked in a
 * test without a DOM.
 */

export interface ExamOption {
  id: string;
  text: string;
}

interface QuestionBase {
  id: string;
  prompt: string;
  /** The teaching. Shown after marking, right or wrong. */
  why: string;
}

/** One right answer. */
export interface ChooseQuestion extends QuestionBase {
  kind: 'choose';
  options: ExamOption[];
  answer: string;
}

/** Several right answers, and the set has to match exactly. */
export interface MultiQuestion extends QuestionBase {
  kind: 'multi';
  options: ExamOption[];
  answer: string[];
}

/** A sequence that has to be in the right order. */
export interface OrderQuestion extends QuestionBase {
  kind: 'order';
  items: ExamOption[];
  answer: string[];
}

export type ExamQuestion = ChooseQuestion | MultiQuestion | OrderQuestion;

export interface Exam {
  id: string;
  /** The lab category this closes out. */
  section: string;
  title: string;
  blurb: string;
  /** Percentage needed to pass, 0–100. */
  passPercent: number;
  questions: ExamQuestion[];
}

export type ExamAnswer = string | string[] | undefined;
export type ExamAnswers = Record<string, ExamAnswer>;

export interface Mark {
  id: string;
  prompt: string;
  correct: boolean;
  answered: boolean;
  why: string;
}

export interface ExamResult {
  marks: Mark[];
  correct: number;
  total: number;
  /** Rounded percentage, 0–100. */
  percent: number;
  passed: boolean;
  unanswered: string[];
}

function sameSet(a: string[], b: string[]): boolean {
  const x = new Set(a);
  const y = new Set(b);
  if (x.size !== y.size) return false;
  for (const v of x) if (!y.has(v)) return false;
  return true;
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Was this question answered at all? An empty selection is not an answer. */
export function isAnswered(q: ExamQuestion, given: ExamAnswer): boolean {
  if (given === undefined || given === null) return false;
  if (q.kind === 'choose') return typeof given === 'string' && given.length > 0;
  return Array.isArray(given) && given.length > 0;
}

export function markQuestion(q: ExamQuestion, given: ExamAnswer): boolean {
  if (!isAnswered(q, given)) return false;
  if (q.kind === 'choose') return given === q.answer;
  if (q.kind === 'multi') return sameSet(given as string[], q.answer);
  return sameOrder(given as string[], q.answer);
}

export function markExam(exam: Exam, answers: ExamAnswers): ExamResult {
  const marks: Mark[] = exam.questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    correct: markQuestion(q, answers[q.id]),
    answered: isAnswered(q, answers[q.id]),
    why: q.why,
  }));
  const correct = marks.filter((m) => m.correct).length;
  const total = exam.questions.length;
  // An exam with no questions is a content bug, not a pass.
  const percent = total === 0 ? 0 : Math.round((correct / total) * 100);
  return {
    marks,
    correct,
    total,
    percent,
    passed: total > 0 && percent >= exam.passPercent,
    unanswered: marks.filter((m) => !m.answered).map((m) => m.id),
  };
}

// ------------------------------------------------------------- progress

const STORAGE_KEY = 'photon-runner:labExams';

export interface ExamRecord {
  bestPercent: number;
  passed: boolean;
  attempts: number;
}

export type ExamProgress = Record<string, ExamRecord>;

/** Keeps the best attempt — a worse retake never costs you a pass. */
export function recordAttempt(progress: ExamProgress, examId: string, result: ExamResult): ExamProgress {
  const prev = progress[examId];
  return {
    ...progress,
    [examId]: {
      bestPercent: Math.max(prev?.bestPercent ?? 0, result.percent),
      passed: (prev?.passed ?? false) || result.passed,
      attempts: (prev?.attempts ?? 0) + 1,
    },
  };
}

export function loadExamProgress(): ExamProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as ExamProgress) : {};
  } catch {
    return {};
  }
}

export function saveExamProgress(progress: ExamProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // No storage — the score just won't survive a reload.
  }
}

/**
 * A section test opens once its labs are done. The test is a check on
 * practice, so handing it out before the practice would make it a
 * vocabulary quiz.
 */
export function examUnlocked(sectionLabIds: string[], completedLabIds: string[]): boolean {
  const done = new Set(completedLabIds);
  return sectionLabIds.length > 0 && sectionLabIds.every((id) => done.has(id));
}

/** How many labs are still between the learner and the test. */
export function labsRemaining(sectionLabIds: string[], completedLabIds: string[]): number {
  const done = new Set(completedLabIds);
  return sectionLabIds.filter((id) => !done.has(id)).length;
}

/** Deterministic shuffle, so a given seed always presents the same paper. */
export function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let h = seed >>> 0 || 1;
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
