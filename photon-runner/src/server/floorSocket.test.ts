// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import request from 'supertest';
import WebSocket from 'ws';
import { openDb } from './serverDb';
import { createApp } from './serverApp';
import { attachFloorSocket } from './floorSocket';

const SECRET = 'test-secret';

function start() {
  const db = openDb(':memory:');
  const app = createApp({ db, secret: SECRET });
  const server: Server = app.listen(0);
  const socket = attachFloorSocket(server, { db, secret: SECRET, store: app.locals.floorStore });
  const port = (server.address() as AddressInfo).port;
  return { app, server, socket, port };
}

async function cookieFor(app: ReturnType<typeof createApp>) {
  const res = await request(app).get('/api/whoami');
  return (res.headers['set-cookie'][0] as string).split(';')[0];
}

function connect(port: number, cookie?: string) {
  return new WebSocket(`ws://127.0.0.1:${port}/api/floor/ws`, { headers: cookie ? { cookie } : {} });
}

/** Resolve with the first pushed state that satisfies `test`. */
function nextState(ws: WebSocket, test: (msg: { peers: { userId: number; name: string; x: number }[] }) => boolean) {
  return new Promise<{ peers: { userId: number; name: string; x: number }[] }>((resolve) => {
    ws.on('message', (data) => {
      const msg = JSON.parse(String(data));
      if (msg.type === 'state' && test(msg)) resolve(msg);
    });
  });
}

describe('floor WebSocket', () => {
  let running: ReturnType<typeof start> | null = null;
  afterEach(() => {
    running?.socket.close();
    running?.server.close();
    running = null;
  });

  it('refuses a connection with no valid identity', async () => {
    running = start();
    const ws = connect(running.port);
    const status = await new Promise((resolve) => ws.on('unexpected-response', (_req, res) => resolve(res.statusCode)));
    expect(status).toBe(401);
  });

  it('pushes each player the others in their room', async () => {
    running = start();
    // Both cookies first: a socket created before an await could open unobserved.
    const [ca, cb] = [await cookieFor(running.app), await cookieFor(running.app)];
    const a = connect(running.port, ca);
    const b = connect(running.port, cb);
    await Promise.all([a, b].map((ws) => new Promise((r) => ws.on('open', r))));
    const seen = nextState(b, (m) => m.peers.some((p) => p.name === 'Nova'));
    a.send(JSON.stringify({ type: 'report', x: 0.25, y: 0.5, room: 'campus', name: 'Nova' }));
    b.send(JSON.stringify({ type: 'report', x: 0.75, y: 0.5, room: 'campus' }));
    const state = await seen;
    expect(state.peers).toHaveLength(1);
    expect(state.peers[0].x).toBe(0.25);
    a.close();
    b.close();
  });

  it('removes a player from the floor when their socket closes', async () => {
    running = start();
    // Both cookies first: a socket created before an await could open unobserved.
    const [ca, cb] = [await cookieFor(running.app), await cookieFor(running.app)];
    const a = connect(running.port, ca);
    const b = connect(running.port, cb);
    await Promise.all([a, b].map((ws) => new Promise((r) => ws.on('open', r))));
    a.send(JSON.stringify({ type: 'report', x: 0.25, y: 0.5, room: 'campus', name: 'Nova' }));
    b.send(JSON.stringify({ type: 'report', x: 0.75, y: 0.5, room: 'campus' }));
    await nextState(b, (m) => m.peers.length === 1);
    const gone = nextState(b, (m) => m.peers.length === 0);
    a.close();
    await gone;
    b.close();
  });
});
