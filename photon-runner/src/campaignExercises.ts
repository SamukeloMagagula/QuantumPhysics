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

/**
 * Hands-on hardware: seat modules into the right rack slots. Physical work
 * rather than a quiz — you are holding parts and deciding where they go.
 */
export interface RackModule {
  id: string;
  label: string;
  detail?: string;
}

export interface RackSlot {
  id: string;
  label: string;
  /** The module this bay is wired for. */
  accepts: string;
  /** Why this bay takes that module — shown when it is seated wrongly. */
  why: string;
}

export interface RackExercise {
  kind: 'rack';
  prompt: string;
  slots: RackSlot[];
  modules: RackModule[];
}

/**
 * A phishing attempt against the trainee.
 *
 * Deliberately *not* sent by Eve. The campaign bible is explicit that Eve is
 * authorised security support and never the attacker, so the message merely
 * claims to come from Phantom Q Security — and the way to defeat it is the
 * habit the Prologue already taught: authorised activity is logged, so check
 * the log rather than trusting the letterhead.
 */
export interface PhishTell {
  id: string;
  label: string;
  /** True when this really is a warning sign. */
  suspicious: boolean;
  why: string;
}

export interface PhishExercise {
  kind: 'phish';
  prompt: string;
  from: string;
  subject: string;
  body: string;
  /** Details the player can examine before deciding. */
  tells: PhishTell[];
  /** How many genuine tells must be found before deciding. */
  requiredTells: number;
  /** The only safe action. */
  correctAction: 'verify' | 'report' | 'ignore';
  actions: { id: 'comply' | 'verify' | 'report' | 'ignore'; label: string; outcome: string }[];
}

export type Exercise = OrderExercise | ClassifyExercise | TransferExercise | RackExercise | PhishExercise;

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

// ------------------------------------------------------------------- rack

export interface RackResult {
  ok: boolean;
  wrong: { slot: string; why: string }[];
  empty: string[];
}

export function checkRack(ex: RackExercise, seated: Record<string, string>): RackResult {
  const wrong: RackResult['wrong'] = [];
  const empty: string[] = [];
  for (const slot of ex.slots) {
    const mod = seated[slot.id];
    if (!mod) {
      empty.push(slot.id);
      continue;
    }
    if (mod !== slot.accepts) wrong.push({ slot: slot.id, why: slot.why });
  }
  return { ok: wrong.length === 0 && empty.length === 0, wrong, empty };
}

// ------------------------------------------------------------------ phish

export interface PhishResult {
  ok: boolean;
  message: string;
}

export function checkPhish(ex: PhishExercise, foundTells: string[], action: string): PhishResult {
  const genuine = ex.tells.filter((t) => t.suspicious).map((t) => t.id);
  const found = foundTells.filter((id) => genuine.includes(id));
  const chosen = ex.actions.find((a) => a.id === action);
  if (!chosen) return { ok: false, message: 'No action taken.' };

  if (action !== ex.correctAction) return { ok: false, message: chosen.outcome };
  if (found.length < ex.requiredTells) {
    return {
      ok: false,
      message:
        'The right call — but you made it on instinct. Going back with nothing specific to point at is how a real report gets dismissed. Find what is actually wrong with the message first.',
    };
  }
  return { ok: true, message: chosen.outcome };
}

/** True when the exercise has been satisfied and the beat may advance. */
export function isSolved(ex: Exercise, answer: unknown): boolean {
  if (ex.kind === 'order') return Array.isArray(answer) && checkOrder(ex, answer as string[]).ok;
  if (ex.kind === 'classify')
    return !!answer && typeof answer === 'object' && checkClassify(ex, answer as Record<string, string>).ok;
  if (ex.kind === 'rack')
    return !!answer && typeof answer === 'object' && checkRack(ex, answer as Record<string, string>).ok;
  if (ex.kind === 'phish') {
    const a = answer as { tells?: string[]; action?: string } | undefined;
    return !!a && checkPhish(ex, a.tells ?? [], a.action ?? '').ok;
  }
  return typeof answer === 'string' && checkTransfer(ex, answer).ok;
}
