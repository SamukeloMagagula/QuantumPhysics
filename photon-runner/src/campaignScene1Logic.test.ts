import { describe, expect, it } from 'vitest';
import { SCENE1_KEY, SCENE1_MESSAGE, decryptWithSharedKey, encryptWithSharedKey } from './campaignScene1Logic';

describe('campaign scene 1 — shared-key encrypt/decrypt', () => {
  it('round-trips the scenario message with the shared key', () => {
    const cipher = encryptWithSharedKey(SCENE1_MESSAGE, SCENE1_KEY);
    expect(cipher).not.toBe(SCENE1_MESSAGE);
    expect(decryptWithSharedKey(cipher, SCENE1_KEY)).toBe(SCENE1_MESSAGE);
  });

  it('the wrong key does not recover the plaintext', () => {
    const cipher = encryptWithSharedKey(SCENE1_MESSAGE, SCENE1_KEY);
    expect(decryptWithSharedKey(cipher, SCENE1_KEY + 1)).not.toBe(SCENE1_MESSAGE);
  });
});
