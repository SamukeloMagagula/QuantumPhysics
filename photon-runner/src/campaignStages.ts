import { ChapterId, EvidenceItem, getChapter } from './campaignStory';

/**
 * Campaign stages — the level structure over the story.
 *
 * Each incident is a stage. Clear one and the next unlocks; the rest stay
 * visibly locked, which mirrors the clearance mechanic the campaign bible
 * asks for ("the learner physically sees previously locked areas become
 * accessible as capability grows").
 *
 * On the timer: it counts **up** against a par time rather than counting
 * down to a failure. That is a deliberate choice. The whole campaign teaches
 * "verify before you escalate" — Alice's source confirmation, Eve's
 * authorised log, fact versus assumption — and a countdown that fails you
 * would reward exactly the rushing that discipline exists to prevent. Par
 * still gives the run stakes and something to beat on a replay, without
 * punishing a learner for being careful. (A hard countdown is a one-line
 * change to `TimerMode` if pressure is wanted instead.)
 */

export type TimerMode = 'count-up-par';

export interface StageDef {
  id: ChapterId;
  order: number;
  title: string;
  subtitle: string;
  /** Shown on the stage card before you start. */
  brief: string;
  /** Target completion time in seconds. */
  parSeconds: number;
  /** False for incidents specified in the bible but not yet implemented. */
  built: boolean;
  /** Noted on the card when the source material is image-only. */
  sourceNote?: string;
}

export const STAGES: StageDef[] = [
  {
    id: 'prologue',
    order: 1,
    title: 'Prologue',
    subtitle: 'First Shift at Phantom Q',
    brief:
      'Your first shift. Register, take part in an authorised security check, and send Alice’s files to Bob. Ordinary work — until it isn’t.',
    parSeconds: 240,
    built: true,
  },
  {
    id: 'incident-01',
    order: 2,
    title: 'Incident 01',
    subtitle: 'Understand the Incident',
    brief:
      'PQ-001 is open. Separate what you can prove from what you are assuming, and name what actually failed.',
    parSeconds: 180,
    built: true,
  },
  {
    id: 'incident-02',
    order: 3,
    title: 'Incident 02',
    subtitle: 'Protect the Information',
    brief: 'Alice still needs to reach Bob. How can she send information without exposing it in transit?',
    parSeconds: 240,
    built: false,
  },
  {
    id: 'incident-03',
    order: 4,
    title: 'Incident 03',
    subtitle: 'The Operational Link',
    brief:
      'Alice creates a legitimate payment instruction. Bob receives the key, decrypts, verifies and processes it. A clean baseline — on purpose.',
    parSeconds: 240,
    built: false,
    sourceNote: 'Source deck is image-only; title taken from the campaign bible.',
  },
  {
    id: 'incident-04',
    order: 5,
    title: 'Incident 04',
    subtitle: 'The Payment That Never Arrived',
    brief:
      'The process worked. Bob followed it correctly. The payment completed. And Alice never received it.',
    parSeconds: 300,
    built: false,
  },
  {
    id: 'incident-05',
    order: 6,
    title: 'Incident 05',
    subtitle: 'Asymmetric Construction',
    brief:
      'Network evidence sends you back to the laboratory. Public and private keys, signatures, and a Red Team placed on standby.',
    parSeconds: 300,
    built: false,
    sourceNote: 'Source deck is image-only; title taken from the campaign bible.',
  },
  {
    id: 'incident-06',
    order: 7,
    title: 'Incident 06',
    subtitle: 'Recovery Operation',
    brief: 'Red Team is authorised. Trace, validate, engage, contain, report — and restore service.',
    parSeconds: 360,
    built: false,
  },
];

export function getStage(id: ChapterId): StageDef | null {
  return STAGES.find((s) => s.id === id) ?? null;
}

// --------------------------------------------------------------- progress

export interface StageRecord {
  completed: boolean;
  /** Best clear time in milliseconds. */
  bestMs: number | null;
}

export type StageProgress = Record<string, StageRecord>;

const STORAGE_KEY = 'phantom-q:stageProgress';

export function loadProgress(): StageProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as StageProgress) : {};
  } catch {
    return {};
  }
}

export function saveProgress(p: StageProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Progress just won't persist across reloads.
  }
}

/**
 * Records a clear. Keeps the faster of the existing and new times so a
 * slower replay never erases a good run.
 */
export function recordClear(p: StageProgress, id: ChapterId, elapsedMs: number): StageProgress {
  const prev = p[id];
  const bestMs = prev?.bestMs != null ? Math.min(prev.bestMs, elapsedMs) : elapsedMs;
  return { ...p, [id]: { completed: true, bestMs } };
}

export function isCompleted(p: StageProgress, id: ChapterId): boolean {
  return !!p[id]?.completed;
}

/**
 * A stage is unlocked when every earlier stage has been cleared. The first
 * stage is always available.
 */
export function isUnlocked(p: StageProgress, id: ChapterId): boolean {
  const stage = getStage(id);
  if (!stage) return false;
  return STAGES.filter((s) => s.order < stage.order).every((s) => isCompleted(p, s.id));
}

/** Whether the stage can actually be entered: unlocked *and* implemented. */
export function isPlayable(p: StageProgress, id: ChapterId): boolean {
  const stage = getStage(id);
  return !!stage && stage.built && isUnlocked(p, id) && !!getChapter(id);
}

/** The next stage the player should attempt, or null when all are cleared. */
export function nextStage(p: StageProgress): StageDef | null {
  return STAGES.find((s) => s.built && !isCompleted(p, s.id) && isUnlocked(p, s.id)) ?? null;
}

/**
 * The case file, carried between stages.
 *
 * The bible is explicit that the Prologue creates persistent artefacts that
 * later investigations reuse — Incident 01 opens with "the PQ-001 case
 * contains only evidence already earned". Without this, starting a stage
 * reset the board to "nothing yet", which both contradicts the story and
 * strips the investigation of the evidence it is supposed to reason over.
 */
export interface CarriedCase {
  knownFacts: string[];
  evidence: EvidenceItem[];
}

const CASE_KEY = 'phantom-q:caseFile';

export function loadCase(): CarriedCase {
  try {
    const raw = localStorage.getItem(CASE_KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (p && Array.isArray(p.knownFacts) && Array.isArray(p.evidence)) return p as CarriedCase;
  } catch {
    /* fall through */
  }
  return { knownFacts: [], evidence: [] };
}

/** Merges a completed run into the case file, without duplicating. */
export function mergeCase(prev: CarriedCase, add: CarriedCase): CarriedCase {
  const facts = [...prev.knownFacts];
  for (const f of add.knownFacts) if (!facts.includes(f)) facts.push(f);
  const evidence = [...prev.evidence];
  for (const e of add.evidence) if (!evidence.some((x) => x.id === e.id)) evidence.push(e);
  return { knownFacts: facts, evidence };
}

export function saveCase(c: CarriedCase): void {
  try {
    localStorage.setItem(CASE_KEY, JSON.stringify(c));
  } catch {
    /* just won't persist */
  }
}

// ------------------------------------------------------------------ timer

export type StageRating = 'under-par' | 'cleared';

export function rate(id: ChapterId, elapsedMs: number): StageRating {
  const stage = getStage(id);
  if (!stage) return 'cleared';
  return elapsedMs <= stage.parSeconds * 1000 ? 'under-par' : 'cleared';
}

/** m:ss, which is the only shape any of these times will realistically take. */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
