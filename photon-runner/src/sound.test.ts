import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { SOUNDS } from './sound';

it('has an Ogg original and an MP3 fallback for every sound it plays', () => {
  for (const file of Object.values(SOUNDS).flatMap(s => s.files)) {
    const onDisk = join(__dirname, '..', 'public', file);
    expect(existsSync(onDisk), file).toBe(true);
    expect(existsSync(onDisk.replace(/\.ogg$/, '.mp3')), file).toBe(true);
  }
});
