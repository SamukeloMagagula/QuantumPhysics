import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA } from './serverSchema';

export type Db = Database.Database;

export function openDb(filePath: string): Db {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
