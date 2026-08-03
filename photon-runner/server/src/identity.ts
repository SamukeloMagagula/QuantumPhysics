import crypto from 'node:crypto';
import type { Db } from './db';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  display_name: string | null;
  is_admin: number;
  is_guest: number;
  created_at: string;
}

export const COOKIE = 'guest_id';

const SALT = 'phantomq-guest';

function sign(uid: number, secret: string): string {
  const payload = String(uid);
  const sig = crypto.createHmac('sha256', secret).update(`${SALT}.${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

function verify(token: string, secret: string): number | null {
  const idx = token.lastIndexOf('.');
  if (idx < 0) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = crypto.createHmac('sha256', secret).update(`${SALT}.${payload}`).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  if (!/^\d+$/.test(payload)) return null;
  return Number(payload);
}

function newHandle(): string {
  return 'operative_' + crypto.randomBytes(3).toString('hex');
}

function getUser(db: Db, uid: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(uid) as UserRow | undefined;
}

function createGuest(db: Db): number {
  for (let i = 0; i < 5; i++) {
    const handle = newHandle();
    try {
      const info = db
        .prepare("INSERT INTO users (username, password_hash, display_name, is_guest) VALUES (?, '', ?, 1)")
        .run(handle, handle);
      const uid = Number(info.lastInsertRowid);
      db.prepare('INSERT OR IGNORE INTO user_stats (user_id, points) VALUES (?, 0)').run(uid);
      return uid;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT') continue;
      throw err;
    }
  }
  throw new Error('could not allocate guest handle');
}

export interface IdentityResult {
  user: UserRow;
  /** Set only when a new guest was just provisioned — caller must Set-Cookie it. */
  newCookie: string | null;
}

export function resolveUser(db: Db, secret: string, rawCookie: string | undefined): IdentityResult {
  const uid = rawCookie ? verify(rawCookie, secret) : null;
  const existing = uid != null ? getUser(db, uid) : undefined;
  if (existing) return { user: existing, newCookie: null };
  const newUid = createGuest(db);
  const user = getUser(db, newUid);
  if (!user) throw new Error('guest just created but not found');
  return { user, newCookie: sign(newUid, secret) };
}

export function renameUser(db: Db, userId: number, newName: unknown): string | null {
  if (typeof newName !== 'string') return null;
  const name = newName.trim();
  if (!name || name.length > 40) return null;
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, userId);
  return name;
}
