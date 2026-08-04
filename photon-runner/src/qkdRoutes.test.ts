import { describe, expect, it, beforeEach, vi } from 'vitest';
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

describe('qkd multiplayer API', () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    ({ db, app } = freshApp());
  });

  it('creates a game with a 4-letter code and seats the creator, leaving the other two roles as computer', async () => {
    const cookie = await guestCookie(app);
    const create = await request(app).post('/api/qkd/game').set('Cookie', cookie).send({ role: 'alice' });
    expect(create.status).toBe(200);
    expect(create.body.code).toMatch(/^[A-Z0-9]{4}$/);
    expect(create.body.role).toBe('alice');

    const state = await request(app).get(`/api/qkd/game/${create.body.code}`).set('Cookie', cookie);
    expect(state.body.phase).toBe('lobby');
    expect(state.body.yourRole).toBe('alice');
    const you = state.body.seats.find((s: { role?: string }) => s.role === 'alice');
    expect(you.kind).toBe('human');
    // Other seats are anonymized by codename, not role, until reveal.
    expect(state.body.seats.filter((s: { role?: string }) => s.role === undefined).length).toBe(2);
  });

  it('rejects an unknown role on create', async () => {
    const cookie = await guestCookie(app);
    const res = await request(app).post('/api/qkd/game').set('Cookie', cookie).send({ role: 'mallory' });
    expect(res.status).toBe(400);
  });

  it('a second player can join an open role in the lobby', async () => {
    const aliceCookie = await guestCookie(app);
    const create = await request(app).post('/api/qkd/game').set('Cookie', aliceCookie).send({ role: 'alice' });
    const code = create.body.code;

    const bobCookie = await guestCookie(app);
    const join = await request(app).post(`/api/qkd/game/${code}/join`).set('Cookie', bobCookie).send({ role: 'bob' });
    expect(join.status).toBe(200);

    const bobState = await request(app).get(`/api/qkd/game/${code}`).set('Cookie', bobCookie);
    expect(bobState.body.yourRole).toBe('bob');
  });

  it('rejects joining a role that is already human, and joining a game already in progress', async () => {
    const aliceCookie = await guestCookie(app);
    const create = await request(app).post('/api/qkd/game').set('Cookie', aliceCookie).send({ role: 'alice' });
    const code = create.body.code;

    const takenRole = await request(app)
      .post(`/api/qkd/game/${code}/join`)
      .set('Cookie', await guestCookie(app))
      .send({ role: 'alice' });
    expect(takenRole.status).toBe(409);

    await request(app).post(`/api/qkd/game/${code}/start`).set('Cookie', aliceCookie);
    const started = await request(app)
      .post(`/api/qkd/game/${code}/join`)
      .set('Cookie', await guestCookie(app))
      .send({ role: 'bob' });
    expect(started.status).toBe(409);
  });

  it('auto-resolves a full round when the human (alice) submits and the other two seats are computer', async () => {
    const cookie = await guestCookie(app);
    const create = await request(app).post('/api/qkd/game').set('Cookie', cookie).send({ role: 'alice' });
    const code = create.body.code;

    await request(app).post(`/api/qkd/game/${code}/start`).set('Cookie', cookie);
    let state = await request(app).get(`/api/qkd/game/${code}`).set('Cookie', cookie);
    expect(state.body.phase).toBe('alice_setup');
    expect(state.body.youAreUpNow).toBe(true);

    const act = await request(app)
      .post(`/api/qkd/game/${code}/act`)
      .set('Cookie', cookie)
      .send({ action: { n: 20, s: 5 } });
    // Eve and Bob are both computer, so one submission drives the whole round to 'resolve'.
    expect(act.body.phase).toBe('resolve');
    expect(act.body.round).toBe(1);
    expect(act.body.lastResult).toBeDefined();
    expect(act.body.lastResult.perRole).toHaveProperty('alice');
    expect(act.body.lastResult.perRole).toHaveProperty('bob');
    expect(act.body.lastResult.perRole).toHaveProperty('eve');

    state = await request(app).get(`/api/qkd/game/${code}`).set('Cookie', cookie);
    expect(state.body.phase).toBe('resolve');
  });

  it('resubmitting an action mid-turn is idempotent (returns state, does not error or re-score)', async () => {
    const cookie = await guestCookie(app);
    const create = await request(app).post('/api/qkd/game').set('Cookie', cookie).send({ role: 'alice' });
    const code = create.body.code;
    await request(app).post(`/api/qkd/game/${code}/start`).set('Cookie', cookie);

    await request(app)
      .post(`/api/qkd/game/${code}/act`)
      .set('Cookie', cookie)
      .send({ action: { n: 20, s: 5 } });
    const again = await request(app)
      .post(`/api/qkd/game/${code}/act`)
      .set('Cookie', cookie)
      .send({ action: { n: 999, s: 999 } }); // different payload — must be ignored, already resolved
    expect(again.status).toBe(200);
    expect(again.body.phase).toBe('resolve');
  });

  it('plays through all 3 rounds to accusation, then to ended with a reveal and persisted score', async () => {
    const cookie = await guestCookie(app);
    const create = await request(app).post('/api/qkd/game').set('Cookie', cookie).send({ role: 'alice' });
    const code = create.body.code;
    await request(app).post(`/api/qkd/game/${code}/start`).set('Cookie', cookie);

    for (let round = 1; round <= 3; round++) {
      const act = await request(app)
        .post(`/api/qkd/game/${code}/act`)
        .set('Cookie', cookie)
        .send({ action: { n: 20, s: 5 } });
      expect(act.body.phase).toBe('resolve');
      expect(act.body.round).toBe(round);
      const next = await request(app)
        .post(`/api/qkd/game/${code}/act`)
        .set('Cookie', cookie)
        .send({ action: { next: true } });
      if (round < 3) {
        expect(next.body.phase).toBe('alice_setup');
        expect(next.body.round).toBe(round + 1);
      } else {
        expect(next.body.phase).toBe('accusation');
      }
    }

    const accState = await request(app).get(`/api/qkd/game/${code}`).set('Cookie', cookie);
    // Bob is computer, so bob's accusation auto-fills; only alice needs to vote.
    const anonSeats = accState.body.seats as { codename?: string }[];
    const codename = anonSeats.find((s) => s.codename)?.codename;
    expect(codename).toBeTruthy();

    const accuse = await request(app)
      .post(`/api/qkd/game/${code}/act`)
      .set('Cookie', cookie)
      .send({ action: { accuse: codename } });
    expect(accuse.body.phase).toBe('ended');
    expect(accuse.body.reveal).toBeDefined();
    expect(accuse.body.reveal.alice.name).toMatch(/^operative_/);
    expect(accuse.body.accusationResult).toBeDefined();
    expect(accuse.body.scores).toBeDefined();
    expect(accuse.body.scores.length).toBe(3);
  });

  it('rejects an accusation that names an invalid codename', async () => {
    const cookie = await guestCookie(app);
    const create = await request(app).post('/api/qkd/game').set('Cookie', cookie).send({ role: 'alice' });
    const code = create.body.code;
    await request(app).post(`/api/qkd/game/${code}/start`).set('Cookie', cookie);
    for (let round = 1; round <= 3; round++) {
      await request(app)
        .post(`/api/qkd/game/${code}/act`)
        .set('Cookie', cookie)
        .send({ action: { n: 20, s: 5 } });
      await request(app)
        .post(`/api/qkd/game/${code}/act`)
        .set('Cookie', cookie)
        .send({ action: { next: true } });
    }
    const res = await request(app)
      .post(`/api/qkd/game/${code}/act`)
      .set('Cookie', cookie)
      .send({ action: { accuse: 'not-a-real-codename' } });
    expect(res.status).toBe(400);
  });

  it("rejects acting out of turn (e.g. alice acting during bob's decision phase, which never happens for her here) via a seat-less user", async () => {
    const cookie = await guestCookie(app);
    const create = await request(app).post('/api/qkd/game').set('Cookie', cookie).send({ role: 'alice' });
    const code = create.body.code;
    const outsider = await guestCookie(app);
    const res = await request(app)
      .post(`/api/qkd/game/${code}/act`)
      .set('Cookie', outsider)
      .send({ action: { n: 20, s: 5 } });
    expect(res.status).toBe(403); // not seated in this game
  });

  it('404s for an unknown game code', async () => {
    const cookie = await guestCookie(app);
    const res = await request(app).get('/api/qkd/game/ZZZZ').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('never reveals the QBER/error-shape evidence to Eve during bob_decision', async () => {
    const cookie = await guestCookie(app);
    // Eve as the human this time, so the round pauses at bob_decision only if bob were human —
    // here alice/bob are computer so the round still auto-resolves past eve_move once Eve submits.
    const create = await request(app).post('/api/qkd/game').set('Cookie', cookie).send({ role: 'eve' });
    const code = create.body.code;
    await request(app).post(`/api/qkd/game/${code}/start`).set('Cookie', cookie);
    let state = await request(app).get(`/api/qkd/game/${code}`).set('Cookie', cookie);
    expect(state.body.phase).toBe('eve_move');
    expect(state.body.youAreUpNow).toBe(true);
    expect(state.body.sampleQBER).toBeUndefined();

    const act = await request(app)
      .post(`/api/qkd/game/${code}/act`)
      .set('Cookie', cookie)
      .send({ action: { method: 'bruteforce', workers: 0 } });
    // Bob is computer and decides immediately, so this resolves the round; Eve's view never
    // carried sampleQBER/errorShape at any point (those are alice/bob-only during bob_decision).
    expect(act.body.phase).toBe('resolve');
    expect(act.body.sampleQBER).toBeUndefined();
  });

  it('persists a qkd_scores row and awards the qkd-operative badge for a human who scored', async () => {
    // Force Math.random() to a fixed low value: eve's computer strategy then
    // always picks p=0 (no interception) every round, guaranteeing eveHit is
    // always false, QBER is always 0, bob's computer decision is always
    // 'keep', and alice (the human) deterministically scores > 0 across 3
    // rounds — without this, the outcome is only ~72% likely to score at
    // all, making the assertions below flaky.
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);
    try {
      const cookie = await guestCookie(app);
      const create = await request(app).post('/api/qkd/game').set('Cookie', cookie).send({ role: 'alice' });
      const code = create.body.code;
      await request(app).post(`/api/qkd/game/${code}/start`).set('Cookie', cookie);
      for (let round = 1; round <= 3; round++) {
        const act = await request(app)
          .post(`/api/qkd/game/${code}/act`)
          .set('Cookie', cookie)
          .send({ action: { n: 20, s: 5 } });
        expect(act.body.lastResult.perRole.alice).toBeGreaterThan(0); // finalKey (20-5=15) each round, no eavesdropping
        await request(app)
          .post(`/api/qkd/game/${code}/act`)
          .set('Cookie', cookie)
          .send({ action: { next: true } });
      }
      const accState = await request(app).get(`/api/qkd/game/${code}`).set('Cookie', cookie);
      const codename = (accState.body.seats as { codename?: string }[]).find((s) => s.codename)?.codename;
      await request(app)
        .post(`/api/qkd/game/${code}/act`)
        .set('Cookie', cookie)
        .send({ action: { accuse: codename } });

      const whoami = await request(app).get('/api/whoami').set('Cookie', cookie);
      const userId = (
        db.prepare('SELECT id FROM users WHERE username = ?').get(whoami.body.displayName) as { id: number }
      ).id;
      const aliceScore = (
        db.prepare('SELECT score FROM qkd_game_seats WHERE role = ?').get('alice') as { score: number }
      ).score;
      expect(aliceScore).toBe(45); // 15 points/round x 3 rounds, deterministically

      const scoreRow = db.prepare('SELECT COUNT(*) AS n FROM qkd_scores WHERE user_id = ?').get(userId) as {
        n: number;
      };
      expect(scoreRow.n).toBe(1);
      const badgeRow = db
        .prepare("SELECT COUNT(*) AS n FROM user_badges WHERE user_id = ? AND badge_id = 'qkd-operative'")
        .get(userId) as { n: number };
      expect(badgeRow.n).toBe(1);
    } finally {
      randomSpy.mockRestore();
    }
  });
});
