import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA } from './serverSchema';

export type Db = Database.Database;

// Ported from quantumbreach/db.py's BADGE_SEED. 'qkd-operative'/'file-heist'
// are defined for schema/UI parity but nothing awards them yet — Quantum
// Heist's win condition doesn't map onto the old QKD game's score-based one.
const BADGE_SEED: [id: string, name: string, description: string, icon: string][] = [
  ['first-clear', 'First Blood', 'Complete your first room.', '🩸'],
  ['symmetric-path', 'Symmetric Specialist', 'Complete every room in the Symmetric path.', '🔑'],
  ['qkd-operative', 'Quantum Operative', 'Win a round of Quantum Intercept.', '🛰️'],
  ['file-heist', 'Data Thief', 'Crack an intercepted file in Quantum Intercept.', '🗄️'],
];

export function openDb(filePath: string): Db {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  const seedBadge = db.prepare('INSERT OR IGNORE INTO badges (id, name, description, icon) VALUES (?, ?, ?, ?)');
  const seedAll = db.transaction((rows: typeof BADGE_SEED) => {
    for (const row of rows) seedBadge.run(...row);
  });
  seedAll(BADGE_SEED);
  return db;
}
