import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { openDb } from './serverDb';
import { createApp } from './serverApp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 8787;
const SECRET = process.env.SECRET_KEY || 'dev-insecure-secret-change-me';
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../data/app.db');

const db = openDb(DB_PATH);
const app = createApp({ db, secret: SECRET });

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(__dirname, '../dist');
  app.use(express.static(clientDist));
  app.get('/*splat', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`server listening on http://localhost:${PORT}`);
});
