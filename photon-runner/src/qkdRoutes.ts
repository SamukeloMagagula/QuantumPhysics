// Ported from quantumbreach/qkd/routes.py (minus the file-heist endpoints —
// see qkdService.ts's file header for why those weren't ported).
import type { Express } from 'express';
import type { Db } from './serverDb';
import { GameError, createGame, gameState, joinGame, startGame, submitAction } from './qkdService';

function withApiErrors(handler: () => unknown, send: (status: number, body: unknown) => void): void {
  try {
    send(200, handler());
  } catch (err) {
    if (err instanceof GameError) {
      send(err.status, { error: err.message });
    } else {
      throw err;
    }
  }
}

export function mountQkdRoutes(app: Express, db: Db): void {
  app.post('/api/qkd/game', (req, res) => {
    withApiErrors(() => createGame(db, req.user!, req.body?.role), (s, b) => res.status(s).json(b));
  });

  app.post('/api/qkd/game/:code/join', (req, res) => {
    withApiErrors(() => joinGame(db, req.params.code, req.user!, req.body?.role), (s, b) => res.status(s).json(b));
  });

  app.post('/api/qkd/game/:code/start', (req, res) => {
    withApiErrors(() => startGame(db, req.params.code), (s, b) => res.status(s).json(b));
  });

  app.get('/api/qkd/game/:code', (req, res) => {
    withApiErrors(() => gameState(db, req.params.code, req.user!), (s, b) => res.status(s).json(b));
  });

  app.post('/api/qkd/game/:code/act', (req, res) => {
    withApiErrors(
      () => submitAction(db, req.params.code, req.user!, req.body?.action ?? {}),
      (s, b) => res.status(s).json(b)
    );
  });
}
