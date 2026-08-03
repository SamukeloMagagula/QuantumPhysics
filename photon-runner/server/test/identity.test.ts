import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { openDb, type Db } from '../src/db';
import { createApp } from '../src/app';

const SECRET = 'test-secret';

function freshApp() {
  const db: Db = openDb(':memory:');
  const app = createApp({ db, secret: SECRET });
  return { db, app };
}

describe('guest identity', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    ({ app } = freshApp());
  });

  it('provisions a guest and sets a cookie on first /api request', async () => {
    const res = await request(app).get('/api/whoami');
    expect(res.status).toBe(200);
    expect(res.body.isGuest).toBe(true);
    expect(res.body.displayName).toMatch(/^operative_[0-9a-f]{6}$/);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(setCookie[0]).toMatch(/^guest_id=/);
  });

  it('reuses the same identity across requests via the cookie', async () => {
    const first = await request(app).get('/api/whoami');
    const cookie = first.headers['set-cookie'][0];
    const second = await request(app).get('/api/whoami').set('Cookie', cookie);
    expect(second.status).toBe(200);
    expect(second.body.displayName).toBe(first.body.displayName);
    expect(second.headers['set-cookie']).toBeUndefined(); // no new guest minted
  });

  it('never provisions a guest for /api/healthz', async () => {
    const res = await request(app).get('/api/healthz');
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a tampered cookie and provisions a fresh guest instead', async () => {
    const first = await request(app).get('/api/whoami');
    const cookie = first.headers['set-cookie'][0];
    const tampered = cookie.replace(/guest_id=([^;]+)/, (_m: string, v: string) => `guest_id=${v}xx`);
    const res = await request(app).get('/api/whoami').set('Cookie', tampered);
    expect(res.status).toBe(200);
    expect(res.body.displayName).not.toBe(first.body.displayName);
    expect(res.headers['set-cookie']).toBeDefined(); // a new guest was minted
  });

  it('renames within 1-40 chars, rejects empty/too-long/non-string', async () => {
    const first = await request(app).get('/api/whoami');
    const cookie = first.headers['set-cookie'][0];

    const ok = await request(app).post('/api/rename').set('Cookie', cookie).send({ name: 'Alice' });
    expect(ok.status).toBe(200);
    expect(ok.body.displayName).toBe('Alice');

    const empty = await request(app).post('/api/rename').set('Cookie', cookie).send({ name: '   ' });
    expect(empty.status).toBe(400);

    const tooLong = await request(app)
      .post('/api/rename')
      .set('Cookie', cookie)
      .send({ name: 'x'.repeat(41) });
    expect(tooLong.status).toBe(400);

    const nonString = await request(app).post('/api/rename').set('Cookie', cookie).send({ name: 123 });
    expect(nonString.status).toBe(400);
  });
});
