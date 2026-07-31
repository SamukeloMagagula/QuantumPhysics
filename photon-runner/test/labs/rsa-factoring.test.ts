import { describe, expect, it } from 'vitest';
import { factor, modPow, modInverse, rsaDecrypt } from '../../labs/rsa-factoring';

describe('factor', () => {
  it('factors a composite number, smaller factor first', () => {
    expect(factor(3233)).toEqual([53, 61]);
  });

  it('returns [1, n] for a prime', () => {
    expect(factor(13)).toEqual([1, 13]);
  });
});

describe('modPow', () => {
  it('computes modular exponentiation', () => {
    expect(modPow(4, 13, 497)).toBe(445);
  });
});

describe('modInverse', () => {
  it('computes a correct modular inverse', () => {
    const inv = modInverse(17, 3120);
    expect((17 * inv) % 3120).toBe(1);
  });
});

describe('full toy-RSA round trip', () => {
  it('recovers the original message after factoring n', () => {
    const p = 61;
    const q = 53;
    const n = p * q;
    const e = 17;
    const message = 1729;
    const ciphertext = modPow(message, e, n);

    const [fp, fq] = factor(n);
    const phi = (fp - 1) * (fq - 1);
    const d = modInverse(e, phi);
    expect(rsaDecrypt(ciphertext, d, n)).toBe(message);
  });
});
