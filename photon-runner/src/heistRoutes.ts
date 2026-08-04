import type { Express } from 'express';
import type { Db } from './serverDb';
import { HeistError, createRoom, joinRoom, setMap, startRoom, getState, updatePosition, submitAction } from './heistService';
import { stationsFor, scoredStations } from './quantumHeistStations';
import { getMap } from './sceneMaps';

function withApiErrors(handler: () => unknown, send: (status: number, body: unknown) => void): void {
  try {
    send(200, handler());
  } catch (err) {
    if (err instanceof HeistError) {
      send(err.status, { error: err.message });
    } else {
      throw err;
    }
  }
}

function totalTasksFor(mapId: string): number {
  return scoredStations(stationsFor(getMap(mapId))).length;
}

export function mountHeistRoutes(app: Express, db: Db): void {
  app.post('/api/heist/room', (req, res) => {
    withApiErrors(() => createRoom(db, req.user!, req.body?.mapId ?? 'relay'), (s, b) => res.status(s).json(b));
  });

  app.post('/api/heist/room/:code/join', (req, res) => {
    withApiErrors(() => joinRoom(db, req.params.code, req.user!), (s, b) => res.status(s).json(b));
  });

  app.post('/api/heist/room/:code/map', (req, res) => {
    withApiErrors(
      () => {
        setMap(db, req.params.code, req.user!, req.body?.mapId);
        return { ok: true };
      },
      (s, b) => res.status(s).json(b)
    );
  });

  app.post('/api/heist/room/:code/start', (req, res) => {
    withApiErrors(
      () => {
        startRoom(db, req.params.code, req.user!);
        return getState(db, req.params.code, req.user!);
      },
      (s, b) => res.status(s).json(b)
    );
  });

  app.get('/api/heist/room/:code', (req, res) => {
    withApiErrors(() => getState(db, req.params.code, req.user!), (s, b) => res.status(s).json(b));
  });

  app.post('/api/heist/room/:code/position', (req, res) => {
    withApiErrors(
      () => {
        updatePosition(db, req.params.code, req.user!, req.body?.updates ?? []);
        return { ok: true };
      },
      (s, b) => res.status(s).json(b)
    );
  });

  app.post('/api/heist/room/:code/act', (req, res) => {
    withApiErrors(() => {
      const room = getState(db, req.params.code, req.user!);
      return submitAction(db, req.params.code, req.user!, req.body?.action ?? {}, totalTasksFor(room.mapId));
    }, (s, b) => res.status(s).json(b));
  });
}
