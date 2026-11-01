import { DEFAULT_APPEARANCE } from './characterAppearance';
import { PROGRESS_KEYS, cleanProgress, mergeProgress, type SavedProgress } from './progressSync';

/**
 * Keeps this browser's saved progress and the server's copy in step.
 *
 * The game's modules keep reading and writing localStorage exactly as
 * before; this module mirrors those keys to the server. That keeps the
 * network out of every save call, and the game fully playable when the
 * server is missing — sync is a backup, never a dependency.
 */

/** How often local changes are checked and pushed. */
export const PUSH_INTERVAL_MS = 4000;

function readKey(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeKey(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the server still has it */
  }
}

export function readLocalProgress(): SavedProgress {
  const appearance = readKey(PROGRESS_KEYS.appearance);
  return cleanProgress({
    explored: readKey(PROGRESS_KEYS.explored),
    story: readKey(PROGRESS_KEYS.story),
    // Stored appearances can be partial; the game fills gaps with defaults, so do the same.
    appearance: appearance && typeof appearance === 'object' ? { ...DEFAULT_APPEARANCE, ...appearance } : null,
    labs: readKey(PROGRESS_KEYS.labs),
    exams: readKey(PROGRESS_KEYS.exams),
    campaign: readKey(PROGRESS_KEYS.campaign),
  });
}

export function writeLocalProgress(p: SavedProgress): void {
  writeKey(PROGRESS_KEYS.explored, p.explored);
  writeKey(PROGRESS_KEYS.story, p.story);
  writeKey(PROGRESS_KEYS.appearance, p.appearance);
  writeKey(PROGRESS_KEYS.labs, p.labs);
  writeKey(PROGRESS_KEYS.exams, p.exams);
  writeKey(PROGRESS_KEYS.campaign, p.campaign);
}

let lastPushed = '';

async function push(progress: SavedProgress, keepalive = false): Promise<void> {
  const body = JSON.stringify({ progress });
  if (body === lastPushed) return;
  const res = await fetch('/api/progress', { method: 'PUT', headers: { 'content-type': 'application/json' }, body, keepalive });
  if (res.ok) lastPushed = body;
}

/**
 * Bring in the server's copy before the game reads localStorage. Resolves
 * quickly either way: a slow or missing server must not hold up play.
 */
export async function pullProgress(timeoutMs = 1500): Promise<void> {
  const work = (async () => {
    const res = await fetch('/api/progress');
    if (!res.ok) return;
    const body = (await res.json()) as { progress?: unknown };
    const local = readLocalProgress();
    // This device's appearance is the newer choice when it has one.
    const merged = body.progress ? mergeProgress(cleanProgress(body.progress), local) : local;
    writeLocalProgress(merged);
    await push(merged);
  })().catch(() => {});
  await Promise.race([work, new Promise((r) => setTimeout(r, timeoutMs))]);
}

/** Push local changes as they happen, and once more as the page closes. */
export function startProgressSync(): () => void {
  const tick = () => {
    push(readLocalProgress()).catch(() => {});
  };
  const timer = window.setInterval(tick, PUSH_INTERVAL_MS);
  const leaving = () => {
    push(readLocalProgress(), true).catch(() => {});
  };
  window.addEventListener('pagehide', leaving);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('pagehide', leaving);
  };
}

export async function fetchSaveCode(): Promise<string | null> {
  try {
    await push(readLocalProgress());
    const res = await fetch('/api/progress/code', { method: 'POST' });
    return res.ok ? ((await res.json()) as { code: string }).code : null;
  } catch {
    return null;
  }
}

export type RestoreResult = { ok: true } | { ok: false; message: string };

/** Continue as the player who owns `code`; their saved progress replaces this device's look. */
export async function restoreFromCode(code: string): Promise<RestoreResult> {
  try {
    const res = await fetch('/api/progress/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const body = (await res.json()) as { progress?: unknown; error?: string };
    if (!res.ok) return { ok: false, message: body.error ?? 'Could not load that save code.' };
    const theirs = cleanProgress(body.progress);
    // Their saved look wins; anything already earned here is kept and merged in.
    writeLocalProgress(mergeProgress(readLocalProgress(), theirs));
    lastPushed = '';
    return { ok: true };
  } catch {
    return { ok: false, message: 'The campus server is not answering. Try again in a moment.' };
  }
}
