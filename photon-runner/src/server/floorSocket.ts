import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { chatSince, cleanRoom, heartbeat, leave, peersOn, type FloorStore } from '../floorPresence';
import type { Db } from './serverDb';
import { COOKIE, userFromCookie } from './serverIdentity';

export const SOCKET_PATH = '/api/floor/ws';
/** How often each socket is sent its room's state (only when it changed). */
export const PUSH_MS = 100;

interface Client {
  socket: WebSocket;
  userId: number;
  name: string | null;
  room: string;
  lastChat: number;
  lastPeers: string;
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/**
 * Floor presence over a WebSocket: the same store and rules as the HTTP
 * heartbeat in floorRoutes.ts, without a request per player five times a
 * second. Clients that cannot connect simply keep polling over HTTP.
 *
 * Only an existing guest (a valid signed cookie) may connect — by the time
 * the socket opens, the page has already made ordinary API calls that issue
 * one. Messages in: `report` (position, look, seat). Messages out: `state`
 * (peers in your room and new quick-chat).
 */
export function attachFloorSocket(server: Server, { db, secret, store }: { db: Db; secret: string; store: FloorStore }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
  const clients = new Set<Client>();

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== SOCKET_PATH) return;
    const user = userFromCookie(db, secret, cookieValue(req.headers.cookie, COOKIE));
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => {
      const client: Client = {
        socket: ws,
        userId: user.id,
        name: user.display_name,
        room: 'ops',
        lastChat: Number(url.searchParams.get('since')) || 0,
        lastPeers: '',
      };
      clients.add(client);
      ws.on('message', data => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(data));
        } catch {
          return;
        }
        if (msg?.type !== 'report') return;
        client.room = cleanRoom(msg.room);
        const callsign = typeof msg.name === 'string' ? msg.name.trim() : '';
        heartbeat(store, Date.now(), {
          userId: client.userId,
          name: callsign || client.name,
          x: msg.x,
          y: msg.y,
          facing: msg.facing,
          walking: msg.walking,
          room: client.room,
          look: msg.look,
          seat: msg.seat,
        });
      });
      ws.on('close', () => {
        clients.delete(client);
        // Another tab of the same player may still be connected.
        if (![...clients].some(c => c.userId === client.userId)) leave(store, client.userId);
      });
    });
  });

  const timer = setInterval(() => {
    const now = Date.now();
    for (const c of clients) {
      const peers = JSON.stringify(peersOn(store, now, c.userId, c.room).map(({ at: _at, ...p }) => p));
      const chat = chatSince(store, c.room, c.lastChat);
      if (peers === c.lastPeers && !chat.length) continue;
      c.lastPeers = peers;
      if (chat.length) c.lastChat = chat[chat.length - 1].id;
      c.socket.send(`{"type":"state","peers":${peers},"chat":${JSON.stringify(chat)}}`);
    }
  }, PUSH_MS);
  timer.unref();

  return {
    close() {
      clearInterval(timer);
      for (const c of clients) c.socket.terminate();
      wss.close();
    },
  };
}
