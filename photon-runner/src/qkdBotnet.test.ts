import { describe, expect, it } from 'vitest';
import { crackableWithin, crackEta, keysPerSec, workerCost } from './qkdBotnet';

describe('keysPerSec', () => {
  it('scales linearly with worker count', () => {
    expect(keysPerSec(1)).toBe(50_000);
    expect(keysPerSec(10)).toBe(500_000);
    expect(keysPerSec(0)).toBe(0);
  });
});

describe('crackEta', () => {
  it('is Infinity with zero workers', () => {
    expect(crackEta(10, 0)).toBe(Infinity);
  });

  it('is Infinity for key sizes beyond the 60-bit ceiling regardless of workers', () => {
    expect(crackEta(61, 1000)).toBe(Infinity);
  });

  it('halves when worker count doubles', () => {
    const a = crackEta(20, 10);
    const b = crackEta(20, 20);
    expect(b).toBeCloseTo(a / 2, 6);
  });
});

describe('crackableWithin', () => {
  it('a small key with many workers cracks within the round window', () => {
    expect(crackableWithin(10, 100, 20)).toBe(true);
  });

  it('a large key with few workers does not', () => {
    expect(crackableWithin(50, 1, 20)).toBe(false);
  });

  it('zero workers never cracks anything', () => {
    expect(crackableWithin(1, 0, 20)).toBe(false);
  });
});

describe('workerCost', () => {
  it('rounds up to the nearest block of 10', () => {
    expect(workerCost(0)).toBe(0);
    expect(workerCost(1)).toBe(1);
    expect(workerCost(10)).toBe(1);
    expect(workerCost(11)).toBe(2);
    expect(workerCost(100)).toBe(10);
  });
});
