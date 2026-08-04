// Ported from quantumbreach/qkd/botnet.py.
export const BASE_RATE = 50_000; // keys/sec per worker
export const ROUND_WINDOW = 20; // seconds Eve has to crack within a round
export const OPS_BUDGET = 100; // total ops Eve can spend per round

export function keysPerSec(workers: number): number {
  return Math.max(0, Math.trunc(workers)) * BASE_RATE;
}

export function crackEta(keyBits: number, workers: number): number {
  const kps = keysPerSec(workers);
  if (kps <= 0 || keyBits > 60) return Infinity; // 2**60 keys is effectively unreachable
  return 2 ** Math.trunc(keyBits) / kps;
}

export function workerCost(workers: number): number {
  return Math.ceil(Math.max(0, Math.trunc(workers)) / 10);
}

export function detectionDelta(p: number): number {
  return Math.round(p * 100);
}

export function crackableWithin(keyBits: number, workers: number, windowSeconds: number = ROUND_WINDOW): boolean {
  return crackEta(keyBits, workers) <= windowSeconds;
}
