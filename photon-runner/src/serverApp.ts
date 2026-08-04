import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import type { Db } from './serverDb';
import { COOKIE, resolveUser, renameUser } from './serverIdentity';
import { mountRoomsRoutes } from './roomsRoutes';

export interface AppOptions {
  db: Db;
  secret: string;
}

// Paths that provision/require a guest identity. '/api/healthz' is deliberately
// excluded so uptime checks never mint a guest row.
const IDENTITY_PREFIXES = ['/api'];
const IDENTITY_EXEMPT = new Set(['/api/healthz']);

export function createApp({ db, secret }: AppOptions): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.use((req, res, next) => {
    const needsUser = IDENTITY_PREFIXES.some((p) => req.path.startsWith(p)) && !IDENTITY_EXEMPT.has(req.path);
    if (!needsUser) return next();
    const { user, newCookie } = resolveUser(db, secret, req.cookies[COOKIE]);
    req.user = user;
    if (newCookie) {
      res.cookie(COOKIE, newCookie, {
        maxAge: 1000 * 60 * 60 * 24 * 365,
        sameSite: 'lax',
        httpOnly: true,
      });
    }
    next();
  });

  app.get('/api/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/whoami', (req, res) => {
    const u = req.user!;
    res.json({ displayName: u.display_name, isGuest: Boolean(u.is_guest) });
  });

  app.post('/api/rename', (req, res) => {
    const name = renameUser(db, req.user!.id, req.body?.name);
    if (name === null) {
      res.status(400).json({ error: 'Name must be 1-40 characters.' });
      return;
    }
    res.json({ displayName: name });
  });

  mountRoomsRoutes(app, db);

  return app;
}
