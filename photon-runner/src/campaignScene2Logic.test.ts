import { describe, expect, it } from 'vitest';
import {
  BOB_KEYS,
  EVE_KEYS,
  SCENE2_MESSAGE,
  decrypt,
  encrypt,
  makeKeypair,
  simulateMitm,
} from './campaignScene2Logic';

describe('campaign scene 2 — asymmetric encrypt/decrypt', () => {
  it('round-trips a message through a fresh keypair', () => {
    const keys = makeKeypair(61, 53, 17);
    const message = 1729;
    expect(decrypt(encrypt(message, keys), keys)).toBe(message);
  });

  it('Bob and Eve have distinct keypairs', () => {
    expect(BOB_KEYS.n).not.toBe(EVE_KEYS.n);
    expect(BOB_KEYS.d).not.toBe(EVE_KEYS.d);
  });
});

describe('simulateMitm', () => {
  it('without MITM: Eve intercepts ciphertext but cannot read it, Bob decrypts fine', () => {
    const r = simulateMitm(SCENE2_MESSAGE, BOB_KEYS, EVE_KEYS, false);
    expect(r.eveCanReadIt).toBe(false);
    expect(r.bobDecrypted).toBe(SCENE2_MESSAGE);
  });

  it('with MITM: Eve reads the plaintext, yet Bob still decrypts the original message', () => {
    const r = simulateMitm(SCENE2_MESSAGE, BOB_KEYS, EVE_KEYS, true);
    expect(r.eveCanReadIt).toBe(true);
    expect(r.bobDecrypted).toBe(SCENE2_MESSAGE);
  });

  it('Bob sees the identical outcome either way — he has no way to tell from decryption alone', () => {
    const clean = simulateMitm(SCENE2_MESSAGE, BOB_KEYS, EVE_KEYS, false);
    const mitm = simulateMitm(SCENE2_MESSAGE, BOB_KEYS, EVE_KEYS, true);
    expect(clean.bobDecrypted).toBe(mitm.bobDecrypted);
  });
});
