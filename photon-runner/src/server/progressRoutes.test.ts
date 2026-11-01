import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { openDb, type Db } from './serverDb';
import { createApp } from './serverApp';
import { RESTORE_ATTEMPTS } from './progressRoutes';
import { DEFAULT_APPEARANCE } from '../characterAppearance';

const SECRET = 'test-secret';

async function guestCookie(app: ReturnType<typeof createApp>) {
  const res = await request(app).get('/api/whoami');
  return (res.headers['set-cookie'][0] as string).split(';')[0];
}

describe('progress API', () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    db = openDb(':memory:');
    app = createApp({ db, secret: SECRET });
  });

  it('starts empty, then stores cleaned progress', async () => {
    const cookie = await guestCookie(app);
    expect((await request(app).get('/api/progress').set('Cookie', cookie)).body.progress).toBeNull();
    await request(app)
      .put('/api/progress')
      .set('Cookie', cookie)
      .send({ progress: { explored: ['ops', '<b>'], story: { access: true, completed: 1 } } });
    const saved = (await request(app).get('/api/progress').set('Cookie', cookie)).body.progress;
    expect(saved.explored).toEqual(['ops']);
    expect(saved.story).toEqual({ access: true, completed: 1 });
  });

  it('merges writes so a stale device cannot erase progress', async () => {
    const cookie = await guestCookie(app);
    await request(app).put('/api/progress').set('Cookie', cookie).send({ progress: { explored: ['ops'], story: { access: true, completed: 3 } } });
    const res = await request(app).put('/api/progress').set('Cookie', cookie).send({ progress: { explored: ['breakroom'], story: { access: true, completed: 0 } } });
    expect(res.body.progress.explored.sort()).toEqual(['breakroom', 'ops']);
    expect(res.body.progress.story.completed).toBe(3);
  });

  it('keeps each player to their own progress', async () => {
    const a = await guestCookie(app);
    const b = await guestCookie(app);
    await request(app).put('/api/progress').set('Cookie', a).send({ progress: { explored: ['ops'] } });
    expect((await request(app).get('/api/progress').set('Cookie', b)).body.progress).toBeNull();
  });

  it('gives a stable save code that carries the player to another browser', async () => {
    const home = await guestCookie(app);
    await request(app).put('/api/progress').set('Cookie', home).send({ progress: { explored: ['ops'], appearance: { ...DEFAULT_APPEARANCE, nickname: 'Nova' } } });
    const first = (await request(app).post('/api/progress/code').set('Cookie', home)).body.code;
    const again = (await request(app).post('/api/progress/code').set('Cookie', home)).body.code;
    expect(first).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    expect(again).toBe(first);

    const school = await guestCookie(app);
    const restore = await request(app).post('/api/progress/restore').set('Cookie', school).send({ code: first.toLowerCase() });
    expect(restore.status).toBe(200);
    expect(restore.body.progress.appearance.nickname).toBe('Nova');
    const handedOver = (restore.headers['set-cookie'][0] as string).split(';')[0];
    expect((await request(app).get('/api/progress').set('Cookie', handedOver)).body.progress.explored).toEqual(['ops']);
  });

  it('rejects unknown codes and slows down guessing', async () => {
    const cookie = await guestCookie(app);
    for (let i = 0; i < RESTORE_ATTEMPTS; i++) {
      expect((await request(app).post('/api/progress/restore').set('Cookie', cookie).send({ code: 'ZZZZ-ZZZZ' })).status).toBe(404);
    }
    expect((await request(app).post('/api/progress/restore').set('Cookie', cookie).send({ code: 'ZZZZ-ZZZZ' })).status).toBe(429);
  });
});
