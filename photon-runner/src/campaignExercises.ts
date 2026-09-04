/**
 * Campaign exercises — the parts the player actually *does*.
 *
 * The campaign bible specifies real mechanics, not narration: rebuild the
 * incident timeline, sort statements into fact/assumption/unknown, assess
 * confidentiality/integrity/availability against the evidence, and pick the
 * right file off Alice's USB. Reading about those is not the same as doing
 * them, and doing them is where the reasoning actually happens.
 *
 * The grading rules follow the bible's tone throughout. An impossible
 * timeline does not say "Wrong" — it names the causal conflict ("Bob cannot
 * report receiving File 3 before the transfer occurs"). A claim the
 * evidence does not support is answered with the evidential position, not a
 * buzzer. Every wrong answer carries the reason it is wrong, because the
 * reason is the lesson.
 *
 * All pure, so every exercise is gradeable in tests without a DOM.
 */

export interface OrderEvent {
  id: string;
  label: string;
}

/** A causal rule the arrangement must respect. */
export interface OrderConstraint {
  before: string;
  after: string;
  /** Shown when violated — states the causal impossibility, not "wrong". */
  message: string;
}

export interface OrderExercise {
  kind: 'order';
  prompt: string;
  /** Presented shuffled; this is the accepted sequence. */
  events: OrderEvent[];
  constraints: OrderConstraint[];
  /** Context shown above the working area — the normal baseline. */
  baseline?: string[];
}

export interface Bucket {
  id: string;
  label: string;
  hint?: string;
}

export interface ClassifyItem {
  id: string;
  text: string;
  bucket: string;
  /** Why it belongs there. Shown whether the player was right or wrong. */
  why: string;
}

export interface ClassifyExercise {
  kind: 'classify';
  prompt: string;
  buckets: Bucket[];
  items: ClassifyItem[];
}

export interface TransferFile {
  id: string;
  label: string;
  note?: string;
}

export interface TransferExercise {
  kind: 'transfer';
  prompt: string;
  files: TransferFile[];
  correct: string;
  /** Consequence of sending the wrong file — believable, not a buzzer. */
  wrongMessage: string;
}

export type Exercise = OrderExercise | ClassifyExercise | TransferExercise;

// ------------------------------------------------------------------ order

export interface OrderResult {
  ok: boolean;
  /** The first causal conflict found, if any. */
  message?: string;
  /** Ids that are out of place relative to the accepted sequence. */
  misplaced: string[];
}

export function checkOrder(ex: OrderExercise, arrangement: string[]): OrderResult {
  const pos = new Map(arrangement.map((id, i) => [id, i]));

  // Causal conflicts first: they explain *why* an arrangement is impossible,
  // which is more use than "these three are in the wrong slots".
  for (const c of ex.constraints) {
    const a = pos.get(c.before);
    const b = pos.get(c.after);
    if (a === undefined || b === undefined) continue;
    if (a > b) return { ok: false, message: c.message, misplaced: [c.before, c.after] };
  }

  const expected = ex.events.map((e) => e.id);
  const misplaced = arrangement.filter((id, i) => expected[i] !== id);
  return { ok: misplaced.length === 0, misplaced };
}

/** Deterministic shuffle, so a given seed always presents the same order. */
export function shuffleEvents(ex: OrderExercise, seed: number): OrderEvent[] {
  const out = [...ex.events];
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
  // A shuffle that happens to reproduce the answer would hand it to the
  // player; nudge it rather than re-rolling forever.
  if (out.every((e, i) => e.id === ex.events[i].id) && out.length > 1) {
    [out[0], out[out.length - 1]] = [out[out.length - 1], out[0]];
  }
  return out;
}

// --------------------------------------------------------------- classify

export interface ClassifyResult {
  ok: boolean;
  correct: string[];
  /** Wrong placements, each with the reason it belongs elsewhere. */
  wrong: { id: string; placed: string; belongs: string; why: string }[];
  unplaced: string[];
}

export function checkClassify(ex: ClassifyExercise, assignment: Record<string, string>): ClassifyResult {
  const correct: string[] = [];
  const wrong: ClassifyResult['wrong'] = [];
  const unplaced: string[] = [];

  for (const item of ex.items) {
    const placed = assignment[item.id];
    if (!placed) {
      unplaced.push(item.id);
      continue;
    }
    if (placed === item.bucket) correct.push(item.id);
    else wrong.push({ id: item.id, placed, belongs: item.bucket, why: item.why });
  }
  return { ok: wrong.length === 0 && unplaced.length === 0, correct, wrong, unplaced };
}

// --------------------------------------------------------------- transfer

export interface TransferResult {
  ok: boolean;
  message?: string;
}

export function checkTransfer(ex: TransferExercise, fileId: string): TransferResult {
  if (fileId === ex.correct) return { ok: true };
  return { ok: false, message: ex.wrongMessage };
}

/** True when the exercise has been satisfied and the beat may advance. */
export function isSolved(ex: Exercise, answer: unknown): boolean {
  if (ex.kind === 'order') return Array.isArray(answer) && checkOrder(ex, answer as string[]).ok;
  if (ex.kind === 'classify')
    return !!answer && typeof answer === 'object' && checkClassify(ex, answer as Record<string, string>).ok;
  return typeof answer === 'string' && checkTransfer(ex, answer).ok;
}
