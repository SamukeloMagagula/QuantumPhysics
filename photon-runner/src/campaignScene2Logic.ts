import { modInverse, modPow } from './rsa-factoring';

export interface Keypair {
  n: number;
  e: number;
  d: number;
}

export function makeKeypair(p: number, q: number, e: number): Keypair {
  const n = p * q;
  const phi = (p - 1) * (q - 1);
  const d = modInverse(e, phi);
  return { n, e, d };
}

export function encrypt(m: number, pub: { n: number; e: number }): number {
  return modPow(m, pub.e, pub.n);
}

export function decrypt(c: number, priv: { n: number; d: number }): number {
  return modPow(c, priv.d, priv.n);
}

// Bob's real keypair and Eve's forged keypair for the scenario.
export const BOB_KEYS = makeKeypair(61, 53, 17); // n = 3233
export const EVE_KEYS = makeKeypair(47, 59, 13); // n = 2773
export const SCENE2_MESSAGE_LABEL = 'THE QUANTUM LAB IS READY';
export const SCENE2_MESSAGE = 2024; // encoded stand-in for SCENE2_MESSAGE_LABEL — must be < both n's

export interface MitmResult {
  /** What Eve actually intercepts off the wire. */
  eveInterceptedCiphertext: number;
  /** Whether Eve can read the plaintext from what she intercepted. */
  eveCanReadIt: boolean;
  /** What Bob decrypts on his end — the same either way, which is the trap. */
  bobDecrypted: number;
}

/**
 * Alice always thinks she is encrypting to Bob. When `mitmActive` is false
 * she really is, and Eve — lacking Bob's private key — can't read the
 * intercepted ciphertext. When `mitmActive` is true, Eve has substituted her
 * own public key for Bob's: Alice unknowingly encrypts to Eve, who decrypts
 * it, reads it, then re-encrypts the same plaintext with Bob's real public
 * key and forwards it on. Bob decrypts the original message correctly in
 * both cases, so neither he nor Alice can tell from the outcome alone.
 */
export function simulateMitm(message: number, bobKeys: Keypair, eveKeys: Keypair, mitmActive: boolean): MitmResult {
  if (!mitmActive) {
    const ciphertext = encrypt(message, bobKeys);
    const eveAttempt = decrypt(ciphertext, eveKeys);
    return {
      eveInterceptedCiphertext: ciphertext,
      eveCanReadIt: eveAttempt === message,
      bobDecrypted: decrypt(ciphertext, bobKeys),
    };
  }

  const ciphertextToEve = encrypt(message, eveKeys); // Alice thinks eveKeys is Bob's public key
  const eveReadsIt = decrypt(ciphertextToEve, eveKeys);
  const forwarded = encrypt(eveReadsIt, bobKeys); // Eve re-encrypts for the real Bob
  return {
    eveInterceptedCiphertext: ciphertextToEve,
    eveCanReadIt: eveReadsIt === message,
    bobDecrypted: decrypt(forwarded, bobKeys),
  };
}
