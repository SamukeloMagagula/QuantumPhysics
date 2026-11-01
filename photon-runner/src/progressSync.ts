import { cleanLook, cleanName, type PeerLook } from './floorPresence';

/**
 * A player's saved progress, as it travels between the browser and the
 * server. Shared by both sides: the server never trusts what it is sent,
 * and the client uses the same rules to merge what comes back.
 *
 * Merging only ever adds: places, labs and scenes are unions, the mission
 * count and exam scores keep the best, so two devices (or a stale tab)
 * can never undo each other's progress. Appearance is the one choice that
 * genuinely replaces, so the caller says which side is newer.
 */

/** Where each part lives in localStorage on the client. */
export const PROGRESS_KEYS = {
  explored: 'quantum-campus:explored:v1',
  story: 'photon-runner:facility-story:v1',
  appearance: 'photon-runner:characterAppearance',
  labs: 'photon-runner:labProgress',
  exams: 'photon-runner:labExams',
  campaign: 'photon-runner:campaignProgress',
} as const;

export interface SavedAppearance extends PeerLook {
  nickname: string;
}

export interface ExamScore {
  bestPercent: number;
  passed: boolean;
  attempts: number;
}

export interface SavedProgress {
  explored: string[];
  story: { access: boolean; completed: number } | null;
  appearance: SavedAppearance | null;
  labs: string[];
  exams: Record<string, ExamScore>;
  campaign: string[];
}

export const EMPTY_PROGRESS: SavedProgress = { explored: [], story: null, appearance: null, labs: [], exams: {}, campaign: [] };

const MAX_LIST = 200;
const MAX_MISSIONS = 20;
const slug = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9-]{1,64}$/i.test(v);

function cleanList(raw: unknown): string[] {
  return Array.isArray(raw) ? [...new Set(raw.filter(slug))].slice(0, MAX_LIST) : [];
}

function cleanStory(raw: unknown): SavedProgress['story'] {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const completed = Number(r.completed);
  if (!Number.isInteger(completed)) return null;
  return { access: r.access === true, completed: Math.max(0, Math.min(MAX_MISSIONS, completed)) };
}

function cleanExams(raw: unknown): Record<string, ExamScore> {
  const out: Record<string, ExamScore> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_LIST)) {
    if (!slug(id) || !value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const percent = Number(v.bestPercent);
    const attempts = Number(v.attempts);
    out[id] = {
      bestPercent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0,
      passed: v.passed === true,
      attempts: Number.isInteger(attempts) ? Math.max(0, Math.min(10_000, attempts)) : 0,
    };
  }
  return out;
}

function cleanAppearance(raw: unknown): SavedAppearance | null {
  const look = cleanLook(raw);
  if (!look) return null;
  const nickname = (raw as Record<string, unknown>).nickname;
  return { ...look, nickname: typeof nickname === 'string' && nickname.trim() ? cleanName(nickname) : '' };
}

/** Keep only well-formed progress. Anything unrecognised is dropped, never trusted. */
export function cleanProgress(raw: unknown): SavedProgress {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_PROGRESS };
  const r = raw as Record<string, unknown>;
  return {
    explored: cleanList(r.explored),
    story: cleanStory(r.story),
    appearance: cleanAppearance(r.appearance),
    labs: cleanList(r.labs),
    exams: cleanExams(r.exams),
    campaign: cleanList(r.campaign),
  };
}

const union = (a: string[], b: string[]) => [...new Set([...a, ...b])].slice(0, MAX_LIST);

/** Combine two saves without losing anything; `newer`'s appearance wins when it has one. */
export function mergeProgress(older: SavedProgress, newer: SavedProgress): SavedProgress {
  const story =
    older.story || newer.story
      ? {
          access: Boolean(older.story?.access || newer.story?.access),
          completed: Math.max(older.story?.completed ?? 0, newer.story?.completed ?? 0),
        }
      : null;
  const exams: Record<string, ExamScore> = { ...older.exams };
  for (const [id, score] of Object.entries(newer.exams)) {
    const prev = exams[id];
    exams[id] = prev
      ? { bestPercent: Math.max(prev.bestPercent, score.bestPercent), passed: prev.passed || score.passed, attempts: Math.max(prev.attempts, score.attempts) }
      : score;
  }
  return {
    explored: union(older.explored, newer.explored),
    story,
    appearance: newer.appearance ?? older.appearance,
    labs: union(older.labs, newer.labs),
    exams,
    campaign: union(older.campaign, newer.campaign),
  };
}

/** Save codes avoid look-alike characters (0/O, 1/I/L) so they survive being read aloud. */
export const SAVE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Accept codes typed with spaces, dashes or lower case: `k7qm 3xpa` → `K7QM3XPA`. */
export function normaliseSaveCode(raw: unknown): string | null {
  const code = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length === 8 && [...code].every((c) => SAVE_CODE_ALPHABET.includes(c)) ? code : null;
}

export function formatSaveCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
