import { describe, expect, it, vi } from 'vitest';
import lab from './rsa-factoring';
import { factor, modPow, modInverse, rsaDecrypt } from './rsa-factoring';

it('requires a correct factor pair before opening the vault', () => {
  const container = document.createElement('div');
  const complete = vi.fn();
  lab.render(container, { complete });
  const button = (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent === text)!;
  button('Unlock the vault').click();
  expect(complete).not.toHaveBeenCalled();
  button('43').click(); button('53').click();
  expect(button('Unlock the vault').disabled).toBe(true);
  button('43').click(); button('61').click();
  button('Unlock the vault').click();
  expect(complete).toHaveBeenCalledOnce();
  expect(container.textContent).toContain('1729');
});

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
