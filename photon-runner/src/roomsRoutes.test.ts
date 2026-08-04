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

async function withCookie(app: ReturnType<typeof createApp>) {
  const res = await request(app).get('/api/whoami');
  return res.headers['set-cookie'][0] as string;
}

describe('rooms API', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    ({ app } = freshApp());
  });

  it('lists the symmetric path with rooms in prerequisite order, none completed yet', async () => {
    const cookie = await withCookie(app);
    const res = await request(app).get('/api/paths/symmetric').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.rooms.map((r: { id: string }) => r.id)).toEqual([
      'the-shift',
      'brute-force',
      'frequency-analysis',
      'xor-otp',
    ]);
    expect(res.body.rooms.every((r: { completed: boolean }) => r.completed === false)).toBe(true);
  });

  it('404s for an unknown room or path', async () => {
    const cookie = await withCookie(app);
    expect((await request(app).get('/api/rooms/nope').set('Cookie', cookie)).status).toBe(404);
    expect((await request(app).get('/api/paths/nope').set('Cookie', cookie)).status).toBe(404);
  });

  it('never sends answer hashes to the client', async () => {
    const cookie = await withCookie(app);
    const res = await request(app).get('/api/rooms/the-shift').set('Cookie', cookie);
    const body = JSON.stringify(res.body);
    // The known SHA-256 digest for "hello world" must never appear in the response.
    expect(body).not.toContain('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('rejects a wrong answer without awarding points, accepts the right one and awards points/rank', async () => {
    const cookie = await withCookie(app);

    const wrong = await request(app)
      .post('/api/rooms/the-shift/answer')
      .set('Cookie', cookie)
      .send({ taskId: 'solve', questionId: 'plaintext', answer: 'nope' });
    expect(wrong.body.correct).toBe(false);
    expect(wrong.body.pointsAwarded).toBe(0);

    const right = await request(app)
      .post('/api/rooms/the-shift/answer')
      .set('Cookie', cookie)
      .send({ taskId: 'solve', questionId: 'plaintext', answer: 'hello world' });
    expect(right.body.correct).toBe(true);
    expect(right.body.pointsAwarded).toBe(15);
    expect(right.body.totalPoints).toBe(15);
    expect(right.body.rank).toBe('Script Kiddie');
    expect(right.body.roomComplete).toBe(false); // second question in the room still unsolved
  });

  it('does not double-award points for re-submitting an already-correct answer', async () => {
    const cookie = await withCookie(app);
    await request(app)
      .post('/api/rooms/the-shift/answer')
      .set('Cookie', cookie)
      .send({ taskId: 'solve', questionId: 'plaintext', answer: 'hello world' });
    const again = await request(app)
      .post('/api/rooms/the-shift/answer')
      .set('Cookie', cookie)
      .send({ taskId: 'solve', questionId: 'plaintext', answer: 'hello world' });
    expect(again.body.alreadySolved).toBe(true);
    expect(again.body.pointsAwarded).toBe(0);
    expect(again.body.totalPoints).toBe(15);
  });

  it('completing a room awards the first-clear badge and marks room_progress', async () => {
    const cookie = await withCookie(app);
    await request(app)
      .post('/api/rooms/the-shift/answer')
      .set('Cookie', cookie)
      .send({ taskId: 'solve', questionId: 'plaintext', answer: 'hello world' });
    const last = await request(app)
      .post('/api/rooms/the-shift/answer')
      .set('Cookie', cookie)
      .send({ taskId: 'solve', questionId: 'key', answer: '25' });
    expect(last.body.roomComplete).toBe(true);
    expect(last.body.newBadges.map((b: { id: string }) => b.id)).toEqual(['first-clear']);

    const badges = await request(app).get('/api/badges').set('Cookie', cookie);
    expect(badges.body.badges.map((b: { id: string }) => b.id)).toEqual(['first-clear']);
  });

  it('completing every room in the path awards the symmetric-path badge', async () => {
    const cookie = await withCookie(app);
    const solve = (roomId: string, taskId: string, questionId: string, answer: string) =>
      request(app).post(`/api/rooms/${roomId}/answer`).set('Cookie', cookie).send({ taskId, questionId, answer });

    await solve('the-shift', 'solve', 'plaintext', 'hello world');
    await solve('the-shift', 'solve', 'key', '25');
    await solve('brute-force', 'crack', 'secret', 'QUANTUM');
    await solve('frequency-analysis', 'analyse', 'password', 'entropy');
    const last = await solve('xor-otp', 'recover', 'flag', 'flag{xor_is_reversible}');

    // 'first-clear' was already awarded when 'the-shift' (the first room) was
    // completed earlier in this sequence — only 'symmetric-path' is new here.
    expect(last.body.newBadges.map((b: { id: string }) => b.id)).toEqual(['symmetric-path']);
  });

  it('rate-limits repeated wrong attempts on the same question', async () => {
    const cookie = await withCookie(app);
    let last;
    for (let i = 0; i < 13; i++) {
      last = await request(app)
        .post('/api/rooms/the-shift/answer')
        .set('Cookie', cookie)
        .send({ taskId: 'solve', questionId: 'plaintext', answer: 'nope' });
    }
    expect(last!.status).toBe(429);
  });

  it('reports the leaderboard sorted by points, only for users with points > 0', async () => {
    const cookie = await withCookie(app);
    await request(app)
      .post('/api/rooms/the-shift/answer')
      .set('Cookie', cookie)
      .send({ taskId: 'solve', questionId: 'plaintext', answer: 'hello world' });

    const secondCookie = await withCookie(app); // second guest, never answers anything

    const res = await request(app).get('/api/leaderboard').set('Cookie', cookie);
    expect(res.body.leaderboard.length).toBe(1); // the zero-point guest is excluded
    expect(res.body.leaderboard[0].points).toBe(15);
    void secondCookie;
  });
});
