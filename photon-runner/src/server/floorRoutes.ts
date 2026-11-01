import type { Express } from 'express';
import {
  FloorStore,
  chatSince,
  cleanRoom,
  createFloorStore,
  heartbeat,
  leave,
  peersOn,
  say,
  type SayRefusal,
} from '../floorPresence';

/**
 * Floor presence over HTTP.
 *
 * One shared floor, because there is one Phantom Q headquarters — walking in
 * puts you in the same room as everyone else who is there, with no lobby and
 * no room code. Joining a game should not require a ceremony when the game is
 * "a building you can walk around in".
 *
 * The heartbeat returns the other peers — and any quick-chat newer than the
 * `since` id the client sends — in the same response, so a client needs one
 * request per tick rather than a post and a poll.
 */

/** A bad phrase is the client's mistake; speaking off the floor or too fast is a matter of timing. */
const SAY_STATUS: Record<SayRefusal, number> = { 'unknown-phrase': 400, 'not-on-floor': 409, 'too-soon': 429 };

export function mountFloorRoutes(app: Express, store: FloorStore = createFloorStore()): FloorStore {
  app.post('/api/floor/hq', (req, res) => {
    const user = req.user!;
    const now = Date.now();
    const room = cleanRoom(req.body?.room);
    // A callsign set in the character creator wins over the generated handle.
    const callsign = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const ok = heartbeat(store, now, {
      userId: user.id,
      name: callsign || user.display_name,
      x: req.body?.x,
      y: req.body?.y,
      facing: req.body?.facing,
      walking: req.body?.walking,
      room,
      look: req.body?.look,
      seat: req.body?.seat,
    });
    // Only the people in the same room: coordinates are per-room, so a peer
    // from another wing has nowhere meaningful to be drawn here.
    res.json({ ok, peers: peersOn(store, now, user.id, room), chat: chatSince(store, room, req.body?.since) });
  });

  app.post('/api/floor/hq/chat', (req, res) => {
    const line = say(store, Date.now(), req.user!.id, req.body?.phrase);
    if (typeof line === 'string') return void res.status(SAY_STATUS[line]).json({ ok: false, error: line });
    res.json({ ok: true, line });
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
