import { describe, expect, it } from 'vitest';
import lab, { DEFAULT_MESSAGE, HOPS, xorDecrypt, xorEncrypt } from './why-encryption';

describe('the cipher', () => {
  it('round-trips a message through the same key', () => {
    // The point the lab is making: one key does both jobs.
    const c = xorEncrypt(DEFAULT_MESSAGE, 'bluebird');
    expect(xorDecrypt(c, 'bluebird')).toBe(DEFAULT_MESSAGE);
  });

  it('does not reveal the message to the wrong key', () => {
    const c = xorEncrypt('meet at dawn', 'bluebird');
    expect(xorDecrypt(c, 'blackbird')).not.toBe('meet at dawn');
  });

  it('produces something that does not look like the message', () => {
    const c = xorEncrypt('meet at dawn', 'bluebird');
    expect(c).not.toContain('meet');
    expect(c).toMatch(/^[0-9a-f]{2}( [0-9a-f]{2})*$/);
  });

  it('handles text outside ASCII without corrupting it', () => {
    const msg = 'Réunion à l’aube — 06:00 ✅';
    expect(xorDecrypt(xorEncrypt(msg, 'clé'), 'clé')).toBe(msg);
  });

  it('handles a key longer than the message', () => {
    expect(xorDecrypt(xorEncrypt('hi', 'a-very-long-key-indeed'), 'a-very-long-key-indeed')).toBe('hi');
  });

  it('refuses to work with no key at all', () => {
    expect(xorEncrypt('secret', '')).toBe('');
    expect(xorDecrypt('61 62', '')).toBe('');
  });

  it('returns nothing rather than throwing on malformed ciphertext', () => {
    expect(xorDecrypt('not hex at all', 'key')).toBe('');
    expect(xorDecrypt('', 'key')).toBe('');
  });

  it('produces one hex byte per byte of input', () => {
    const msg = 'abcdef';
    expect(xorEncrypt(msg, 'k').split(' ')).toHaveLength(msg.length);
  });
});

describe('the path a message takes', () => {
  it('names several independent parties, which is the whole point', () => {
    expect(HOPS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(HOPS.map((h) => h.id)).size).toBe(HOPS.length);
    for (const h of HOPS) expect(h.note.length).toBeGreaterThan(15);
  });
});

describe('lab metadata', () => {
  it('opens the Foundations section', () => {
    expect(lab.id).toBe('why-encryption');
    expect(lab.category).toBe('Foundations');
    expect(lab.difficulty).toBe('beginner');
  });

  it('is honest that its cipher is a teaching toy', () => {
    // A lab that quietly implies repeating-key XOR is real protection would
    // teach the wrong lesson more durably than the right one.
    const explain = lab.explain().toLowerCase();
    expect(explain).toContain('xor');
    expect(explain).toMatch(/toy|not secure|breakable/);
    expect(explain).toContain('aes');
  });

  it('points at what encryption alone does not solve', () => {
    const explain = lab.explain().toLowerCase();
    expect(explain).toContain('key distribution');
    expect(explain).toContain('authentication');
  });
});
