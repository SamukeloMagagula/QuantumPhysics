import type { Express } from 'express';
import {
  FloorStore,
  cleanRoom,
  createFloorStore,
  heartbeat,
  leave,
  peersOn,
} from './floorPresence';

/**
 * Floor presence over HTTP.
 *
 * One shared floor, because there is one Phantom Q headquarters — walking in
 * puts you in the same room as everyone else who is there, with no lobby and
 * no room code. Joining a game should not require a ceremony when the game is
 * "a building you can walk around in".
 *
 * The heartbeat returns the other peers in the same response, so a client
 * needs one request per tick rather than a post and a poll.
 */

export function mountFloorRoutes(app: Express, store: FloorStore = createFloorStore()): FloorStore {
  app.post('/api/floor/hq', (req, res) => {
    const user = req.user!;
    const now = Date.now();
    const room = cleanRoom(req.body?.room);
    const ok = heartbeat(store, now, {
      userId: user.id,
      name: user.display_name,
      x: req.body?.x,
      y: req.body?.y,
      facing: req.body?.facing,
      walking: req.body?.walking,
      room,
    });
    // Only the people in the same room: coordinates are per-room, so a peer
    // from another wing has nowhere meaningful to be drawn here.
    res.json({ ok, peers: peersOn(store, now, user.id, room) });
  });

  app.get('/api/floor/hq', (req, res) => {
    const room = req.query.room === undefined ? undefined : cleanRoom(req.query.room);
    res.json({ peers: peersOn(store, Date.now(), req.user!.id, room) });
  });

  app.delete('/api/floor/hq', (req, res) => {
    leave(store, req.user!.id);
    res.json({ ok: true });
  });

  return store;
}
