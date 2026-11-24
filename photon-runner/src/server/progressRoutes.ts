import crypto from 'node:crypto';
import type { Express, Request } from 'express';
import type { Db } from './serverDb';
import { COOKIE, identityCookie, identityCookieOptions } from './serverIdentity';
import {
  EMPTY_PROGRESS,
  SAVE_CODE_ALPHABET,
  cleanProgress,
  formatSaveCode,
  mergeProgress,
  normaliseSaveCode,
  type SavedProgress,
} from '../progressSync';

/** Wrong save-code guesses allowed per address before it has to wait. */
export const RESTORE_ATTEMPTS = 10;
export const RESTORE_WINDOW_MS = 10 * 60 * 1000;

export function readProgress(db: Db, userId: number): SavedProgress | null {
  const row = db.prepare('SELECT data FROM player_progress WHERE user_id = ?').get(userId) as { data: string } | undefined;
  if (!row) return null;
  try {
    return cleanProgress(JSON.parse(row.data));
  } catch {
    return null;
  }
}

function writeProgress(db: Db, userId: number, progress: SavedProgress): void {
  db.prepare(
    `INSERT INTO player_progress (user_id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`,
  ).run(userId, JSON.stringify(progress));
}

function newCode(): string {
  return Array.from(crypto.randomBytes(8), b => SAVE_CODE_ALPHABET[b % SAVE_CODE_ALPHABET.length]).join('');
}

function saveCodeFor(db: Db, userId: number): string {
  const existing = db.prepare('SELECT code FROM save_codes WHERE user_id = ?').get(userId) as { code: string } | undefined;
  if (existing) return existing.code;
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    const inserted = db.prepare('INSERT OR IGNORE INTO save_codes (code, user_id) VALUES (?, ?)').run(code, userId);
    if (inserted.changes) return code;
  }
  throw new Error('could not allocate a save code');
}

/**
 * Campus progress on the server, so it outlives one browser.
 *
 * Identity stays the anonymous guest cookie. A save code is how a player
 * carries that identity to another computer: restoring one simply hands
 * this browser the cookie of the guest who owns the code. Codes are 8
 * characters from a 31-letter alphabet (~10^12) and wrong guesses are
 * rate limited per address, which is proportionate for classroom progress.
 */
export function mountProgressRoutes(
  app: Express,
  db: Db,
  { secret, secureCookies = false }: { secret: string; secureCookies?: boolean },
): void {
  const misses = new Map<string, { count: number; resetAt: number }>();
  const limited = (req: Request) => {
    const key = req.ip ?? 'unknown';
    const entry = misses.get(key);
    return Boolean(entry && entry.resetAt > Date.now() && entry.count >= RESTORE_ATTEMPTS);
  };
  const recordMiss = (req: Request) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const entry = misses.get(key);
    if (!entry || entry.resetAt <= now) misses.set(key, { count: 1, resetAt: now + RESTORE_WINDOW_MS });
    else entry.count += 1;
  };

  app.get('/api/progress', (req, res) => {
    res.json({ progress: readProgress(db, req.user!.id) });
  });

  // Merge rather than replace: a stale tab or second device can only add.
  app.put('/api/progress', (req, res) => {
    const userId = req.user!.id;
    const merged = mergeProgress(readProgress(db, userId) ?? EMPTY_PROGRESS, cleanProgress(req.body?.progress));
    writeProgress(db, userId, merged);
    res.json({ progress: merged });
  });

  app.post('/api/progress/code', (req, res) => {
    res.json({ code: formatSaveCode(saveCodeFor(db, req.user!.id)) });
  });

  app.post('/api/progress/restore', (req, res) => {
    if (limited(req)) return void res.status(429).json({ error: 'Too many tries. Wait a few minutes and try again.' });
    const code = normaliseSaveCode(req.body?.code);
    const row = code
      ? (db.prepare('SELECT user_id FROM save_codes WHERE code = ?').get(code) as { user_id: number } | undefined)
      : undefined;
    if (!row) {
      recordMiss(req);
      return void res.status(404).json({ error: 'That save code was not found. Check it and try again.' });
    }
    res.cookie(COOKIE, identityCookie(row.user_id, secret), identityCookieOptions(secureCookies));
    res.json({ progress: readProgress(db, row.user_id) });
  });
}
