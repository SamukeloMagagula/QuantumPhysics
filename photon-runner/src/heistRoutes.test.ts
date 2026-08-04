import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import { openDb, type Db } from './serverDb';
import { createApp } from './serverApp';

const SECRET = 'test-secret';

function freshApp() {
  const db: Db = openDb(':memory:');
  const app = createApp({ db, secret: SECRET });
  return { db, app };
}

async function guestCookie(app: ReturnType<typeof createApp>) {
  const res = await request(app).get('/api/whoami');
  return res.headers['set-cookie'][0] as string;
}

describe('quantum heist multiplayer API', () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    ({ db, app } = freshApp());
  });

  it('creates a room with a 4-letter code, seats the host in seat 0, fills the rest as computer', async () => {
    const cookie = await guestCookie(app);
    const create = await request(app).post('/api/heist/room').set('Cookie', cookie).send({ mapId: 'relay' });
    expect(create.status).toBe(200);
    expect(create.body.code).toMatch(/^[A-Z0-9]{4}$/);
    expect(create.body.seatIndex).toBe(0);
    expect(create.body.mapId).toBe('relay');

    const state = await request(app).get(`/api/heist/room/${create.body.code}`).set('Cookie', cookie);
    expect(state.body.phase).toBe('lobby');
    expect(state.body.isHost).toBe(true);
    expect(state.body.seats).toHaveLength(6);
    expect(state.body.seats.filter((s: { kind: string }) => s.kind === 'human')).toHaveLength(1);
    // Roles are not assigned until the room starts.
    expect(state.body.you).toBeNull();
  });

  it('falls back to the first map for an unknown mapId', async () => {
    const cookie = await guestCookie(app);
    const create = await request(app).post('/api/heist/room').set('Cookie', cookie).send({ mapId: 'nonsense' });
    expect(create.body.mapId).toBe('relay');
  });

  it('a second player can join an open seat', async () => {
    const hostCookie = await guestCookie(app);
    const create = await request(app).post('/api/heist/room').set('Cookie', hostCookie).send({ mapId: 'relay' });
    const code = create.body.code;

    const otherCookie = await guestCookie(app);
    const join = await request(app).post(`/api/heist/room/${code}/join`).set('Cookie', otherCookie);
    expect(join.status).toBe(200);
    expect(join.body.seatIndex).toBe(1);

    const state = await request(app).get(`/api/heist/room/${code}`).set('Cookie', otherCookie);
    expect(state.body.yourSeatIndex).toBe(1);
    expect(state.body.isHost).toBe(false);
  });

  it('rejects joining twice, joining a full room, and joining a started room', async () => {
    const hostCookie = await guestCookie(app);
    const create = await request(app).post('/api/heist/room').set('Cookie', hostCookie).send({ mapId: 'relay' });
    const code = create.body.code;

    const dup = await request(app).post(`/api/heist/room/${code}/join`).set('Cookie', hostCookie);
    expect(dup.status).toBe(409);

    // Fill the remaining 5 seats.
    for (let i = 0; i < 5; i++) {
      const c = await guestCookie(app);
      const res = await request(app).post(`/api/heist/room/${code}/join`).set('Cookie', c);
      expect(res.status).toBe(200);
    }
    const full = await request(app).post(`/api/heist/room/${code}/join`).set('Cookie', await guestCookie(app));
    expect(full.status).toBe(409);

    const started = await request(app).post('/api/heist/room').set('Cookie', hostCookie).send({ mapId: 'relay' });
    await request(app).post(`/api/heist/room/${started.body.code}/start`).set('Cookie', hostCookie);
    const lateJoin = await request(app)
      .post(`/api/heist/room/${started.body.code}/join`)
      .set('Cookie', await guestCookie(app));
    expect(lateJoin.status).toBe(409);
  });

  it('only the host can change the map or start the room', async () => {
    const hostCookie = await guestCookie(app);
    const create = await request(app).post('/api/heist/room').set('Cookie', hostCookie).send({ mapId: 'relay' });
    const code = create.body.code;
    const otherCookie = await guestCookie(app);
    await request(app).post(`/api/heist/room/${code}/join`).set('Cookie', otherCookie);

    const badMap = await request(app).post(`/api/heist/room/${code}/map`).set('Cookie', otherCookie).send({ mapId: 'mine' });
    expect(badMap.status).toBe(403);

    const goodMap = await request(app).post(`/api/heist/room/${code}/map`).set('Cookie', hostCookie).send({ mapId: 'mine' });
    expect(goodMap.status).toBe(200);

    const badStart = await request(app).post(`/api/heist/room/${code}/start`).set('Cookie', otherCookie);
    expect(badStart.status).toBe(403);
  });

  it('starting assigns hidden roles: each player only sees their own role, never others', async () => {
    const hostCookie = await guestCookie(app);
    const create = await request(app).post('/api/heist/room').set('Cookie', hostCookie).send({ mapId: 'relay' });
    const code = create.body.code;
    const otherCookie = await guestCookie(app);
    await request(app).post(`/api/heist/room/${code}/join`).set('Cookie', otherCookie);

    const start = await request(app).post(`/api/heist/room/${code}/start`).set('Cookie', hostCookie);
    expect(start.status).toBe(200);
    expect(start.body.phase).toBe('play');
    expect(start.body.you.role === 'crew' || start.body.you.role === 'eve').toBe(true);

    const hostState = await request(app).get(`/api/heist/room/${code}`).set('Cookie', hostCookie);
    const otherState = await request(app).get(`/api/heist/room/${code}`).set('Cookie', otherCookie);
    expect(hostState.body.you.role).toBeDefined();
    expect(otherState.body.you.role).toBeDefined();
    // Neither view exposes a role field on any seat other than their own "you".
    for (const view of [hostState.body, otherState.body]) {
      for (const seat of view.seats) {
        expect(seat.role).toBeUndefined();
      }
    }
  });

  it('reports position updates for own seat, and lets the host puppeteer computer seats but not others', async () => {
    const hostCookie = await guestCookie(app);
    const create = await request(app).post('/api/heist/room').set('Cookie', hostCookie).send({ mapId: 'relay' });
    const code = create.body.code;
    const otherCookie = await guestCookie(app);
    await request(app).post(`/api/heist/room/${code}/join`).set('Cookie', otherCookie);
    await request(app).post(`/api/heist/room/${code}/start`).set('Cookie', hostCookie);

    const move = await request(app)
      .post(`/api/heist/room/${code}/position`)
      .set('Cookie', hostCookie)
      .send({ updates: [{ seatIndex: 0, x: 3, z: 4, facing: 1.2, walking: true }] });
    expect(move.status).toBe(200);

    const puppet = await request(app)
      .post(`/api/heist/room/${code}/position`)
      .set('Cookie', hostCookie)
      .send({ updates: [{ seatIndex: 2, x: 5, z: 6, facing: 0, walking: false }] });
    expect(puppet.status).toBe(200);

    // The non-host cannot move seat 0 (not theirs, not a computer seat).
    const blocked = await request(app)
      .post(`/api/heist/room/${code}/position`)
      .set('Cookie', otherCookie)
      .send({ updates: [{ seatIndex: 0, x: 99, z: 99, facing: 0, walking: false }] });
    expect(blocked.status).toBe(200); // silently ignored, not an error

    const state = await request(app).get(`/api/heist/room/${code}`).set('Cookie', hostCookie);
    const seat0 = state.body.seats.find((s: { codename: string }) => s.codename === state.body.seats[0].codename);
    expect(seat0.x).toBe(3);
    expect(seat0.z).toBe(4);
    const seat2 = state.body.seats[2];
    expect(seat2.x).toBe(5);
    expect(seat2.z).toBe(6);
  });

  it('completes tasks and reaches a crew-win outcome via the pure quantumHeistLogic rules', async () => {
    const hostCookie = await guestCookie(app);
    const create = await request(app).post('/api/heist/room').set('Cookie', hostCookie).send({ mapId: 'relay' });
    const code = create.body.code;
    await request(app).post(`/api/heist/room/${code}/start`).set('Cookie', hostCookie);

    const state = await request(app).get(`/api/heist/room/${code}`).set('Cookie', hostCookie);
    expect(state.body.keyProgress).toBe(0);
    // completeTask doesn't gate on role, so this must always land — regardless
    // of whether the host happened to draw crew or eve this game.
    const act = await request(app)
      .post(`/api/heist/room/${code}/act`)
      .set('Cookie', hostCookie)
      .send({ action: { type: 'completeTask' } });
    expect(act.status).toBe(200);
    expect(act.body.keyProgress).toBeGreaterThan(0);

    const tick = await request(app)
      .post(`/api/heist/room/${code}/act`)
      .set('Cookie', hostCookie)
      .send({ action: { type: 'tick', dt: 0.1 } });
    expect(tick.status).toBe(200);
  });

  it('rejects acting in a room still in lobby, and acting by a seat-less user', async () => {
    const hostCookie = await guestCookie(app);
    const create = await request(app).post('/api/heist/room').set('Cookie', hostCookie).send({ mapId: 'relay' });
    const code = create.body.code;

    const tooEarly = await request(app)
      .post(`/api/heist/room/${code}/act`)
      .set('Cookie', hostCookie)
      .send({ action: { type: 'completeTask' } });
    expect(tooEarly.status).toBe(409);

    await request(app).post(`/api/heist/room/${code}/start`).set('Cookie', hostCookie);
    const outsider = await guestCookie(app);
    const notSeated = await request(app)
      .post(`/api/heist/room/${code}/act`)
      .set('Cookie', outsider)
      .send({ action: { type: 'completeTask' } });
    expect(notSeated.status).toBe(403);
  });

  it('broadcasts comms messages, capped and attributed by codename', async () => {
    const hostCookie = await guestCookie(app);
    const create = await request(app).post('/api/heist/room').set('Cookie', hostCookie).send({ mapId: 'relay' });
    const code = create.body.code;
    const otherCookie = await guestCookie(app);
    await request(app).post(`/api/heist/room/${code}/join`).set('Cookie', otherCookie);
    await request(app).post(`/api/heist/room/${code}/start`).set('Cookie', hostCookie);

    const hostState = await request(app).get(`/api/heist/room/${code}`).set('Cookie', hostCookie);
    const send = await request(app)
      .post(`/api/heist/room/${code}/act`)
      .set('Cookie', hostCookie)
      .send({ action: { type: 'comms', text: 'Power bay is clear.' } });
    expect(send.status).toBe(200);
    expect(send.body.comms).toHaveLength(1);
    expect(send.body.comms[0]).toEqual({ from: hostState.body.seats[0].codename, text: 'Power bay is clear.' });

    // Visible to the other seated player too — comms is room-wide, not per-viewer.
    const otherView = await request(app).get(`/api/heist/room/${code}`).set('Cookie', otherCookie);
    expect(otherView.body.comms).toHaveLength(1);
  });

  it('404s for an unknown room code', async () => {
    const cookie = await guestCookie(app);
    const res = await request(app).get('/api/heist/room/ZZZZ').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });
});
