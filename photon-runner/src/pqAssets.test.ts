import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { ROOMS } from './pqRooms';
import { LAYER_FILES } from './pqScene';

it('ships all referenced assets and accounts for every project illustration', () => {
  const publicDir = resolve('public');
  const sources = new Set([
    ...ROOMS.flatMap(room => room.art.kind === 'image' ? [room.art.src] : []),
    ...ROOMS.flatMap(room => (room.imageProps ?? []).map(prop => prop.src)),
    ...Object.values(LAYER_FILES).map(file => `/pq/layers/${file}`),
    '/pq/operator-idle.png', '/pq/operator-idle-left.png', '/pq/operator-walk.png',
    '/pq/rooms/door-states.png',
    '/pq/access-card-comic.png',
  ]);
  const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
  const used = new Set([...sources].map(src => hash(resolve(publicDir, '.' + src))));
  // The labelled master is retained as an authoring reference; play uses the unlabelled derivative.
  const references = new Set([hash(resolve(publicDir, 'pq/facility-master.jpg'))]);
  for (const dir of [resolve(publicDir, 'pq'), resolve('../docs/map-concepts')]) {
    for (const file of readdirSync(dir, { recursive: true })) {
      if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(String(file))) continue;
      const digest = hash(resolve(dir, String(file)));
      expect(used.has(digest) || references.has(digest), `Unaccounted illustration: ${file}`).toBe(true);
    }
  }
});
