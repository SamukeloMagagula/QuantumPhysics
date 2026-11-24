import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { openDb } from './serverDb';
import { createApp } from './serverApp';

async function onFloor() {
  const app = createApp({ db: openDb(':memory:'), secret: 'test-secret' });
  const join = await request(app).post('/api/floor/hq').send({ x: 0.5, y: 0.5, room: 'campus' });
  return { app, cookie: (join.headers['set-cookie'][0] as string).split(';')[0] };
}

describe('quick chat over HTTP', () => {
  it('answers each kind of refusal with its own status', async () => {
    const { app, cookie } = await onFloor();
    expect((await request(app).post('/api/floor/hq/chat').set('Cookie', cookie).send({ phrase: 999 })).status).toBe(400);
    expect((await request(app).post('/api/floor/hq/chat').set('Cookie', cookie).send({ phrase: 0 })).status).toBe(200);
    expect((await request(app).post('/api/floor/hq/chat').set('Cookie', cookie).send({ phrase: 1 })).status).toBe(429);
    expect((await request(app).post('/api/floor/hq/chat').send({ phrase: 0 })).status).toBe(409);
  });
});
