/**
 * Ported from quantumbreach/qkd/engine.py — the authoritative BB84 round
 * resolver for multiplayer.
 *
 * RNG contract: rng() -> number in [0,1). Per photon we draw EXACTLY 7
 * values in this order: aBit, aBasis, eve-intercept, eve-basis,
 * eve-mismatch-bit, bob-basis, bob-mismatch-bit — all seven every photon,
 * whether or not Eve actually intercepts, so the draw count never depends on
 * the outcome. Any other implementation of this resolver (a client-side
 * "solo" resolver, say) MUST draw in this same order to stay bit-for-bit
 * reproducible against a shared seed.
 */

export const ABORT = 0.11;
export const DETECT = 25;
export const HEIST_BONUS = 20;

export type Basis = '+' | 'x';
export type Bit = 0 | 1;
export type Rng = () => number;

function bit(d: number): Bit {
  return d < 0.5 ? 0 : 1;
}

function basis(d: number): Basis {
  return d < 0.5 ? '+' : 'x';
}

/** Guards against a malformed rng() (matches the Python `_draw` defensive check). */
function draw(rng: Rng): number {
  const v = rng();
  return typeof v === 'number' && !Number.isNaN(v) && v >= 0 && v < 1 ? v : 0;
}

export interface EveTap {
  i: number;
  basis: Basis;
}

export interface ResolveConfig {
  n: number;
  p?: number;
  s: number;
  /** When provided, Eve's real taps drive interception instead of `p`. */
  eveTaps?: EveTap[];
}

export interface RoundResult {
  n: number;
  p: number;
  sifted: number;
  sampleSize: number;
  sampleQBER: number;
  finalKey: number;
  stolen: number;
  eveHit: boolean;
  aBases: Basis[];
  bBases: Basis[];
  intercepted: boolean[];
  sampleIndices: number[];
  sampleErrors: boolean[];
  /** Set later by scoring (see roomsRoutes-style callers), not by resolveRound itself. */
  errorShape?: ErrorShape;
  fileCracked?: boolean;
}

export function resolveRound(config: ResolveConfig, rng: Rng = Math.random): RoundResult {
  const n = Math.max(1, Math.trunc(config.n || 0));
  const p = Math.min(1, Math.max(0, config.p || 0));
  const s = Math.max(0, Math.trunc(config.s || 0));

  let taps: Map<number, Basis> | null = null;
  if (config.eveTaps != null) {
    taps = new Map();
    for (const t of config.eveTaps) {
      if (t.basis === '+' || t.basis === 'x') taps.set(Math.trunc(t.i), t.basis);
    }
  }

  const aBits: Bit[] = [];
  const aBases: Basis[] = [];
  const bBases: Basis[] = [];
  const bBits: Bit[] = [];
  const intercepted: boolean[] = [];
  const eBases: Basis[] = [];

  for (let i = 0; i < n; i++) {
    const d0 = draw(rng);
    const d1 = draw(rng);
    const d2 = draw(rng);
    const d3 = draw(rng);
    const d4 = draw(rng);
    const d5 = draw(rng);
    const d6 = draw(rng);

    const aBit = bit(d0);
    const aBasis = basis(d1);

    let interc: boolean;
    let eBasis: Basis | '';
    if (taps) {
      interc = taps.has(i);
      eBasis = interc ? taps.get(i)! : '';
    } else {
      interc = d2 < p;
      eBasis = interc ? basis(d3) : '';
    }

    let chBit: Bit;
    let chBasis: Basis;
    if (interc) {
      const eBit = eBasis === aBasis ? aBit : bit(d4);
      chBit = eBit;
      chBasis = eBasis as Basis;
    } else {
      chBit = aBit;
      chBasis = aBasis;
    }

    const bBasisVal = basis(d5);
    const bBit = bBasisVal === chBasis ? chBit : bit(d6);

    aBits.push(aBit);
    aBases.push(aBasis);
    bBases.push(bBasisVal);
    bBits.push(bBit);
    intercepted.push(interc);
    eBases.push((eBasis || '+') as Basis); // placeholder basis when not intercepted; never read when !intercepted
  }

  const positions: number[] = [];
  for (let i = 0; i < n; i++) if (aBases[i] === bBases[i]) positions.push(i);
  const m = positions.length;
  const sampleSize = Math.min(s, m);
  const sample = positions.slice(0, sampleSize);
  let mism = 0;
  for (const i of sample) if (aBits[i] !== bBits[i]) mism++;
  const sampleQBER = sampleSize ? mism / sampleSize : 0;
  const finalKey = m - sampleSize;
  const eveHit = intercepted.some(Boolean);
  let stolen = 0;
  for (const i of positions.slice(sampleSize)) {
    if (intercepted[i] && eBases[i] === aBases[i]) stolen++;
  }

  return {
    n,
    p,
    sifted: m,
    sampleSize,
    sampleQBER,
    finalKey,
    stolen,
    eveHit,
    aBases,
    bBases,
    intercepted,
    sampleIndices: sample,
    sampleErrors: sample.map((i) => aBits[i] !== bBits[i]),
  };
}

export type ErrorShape = 'none' | 'clustered' | 'scattered';

/**
 * Classifies a round's sampled-error positions as a detection signature.
 * 'clustered' (errors bunch inside roughly a third of the stream) is the
 * 'spoof' signature (Eve guessed one basis across a contiguous window);
 * 'scattered' is the 'tap'/random-intercept signature; 'none' is no sampled
 * error at all. Threshold (n/3) is a tunable heuristic, not a physics constant.
 */
export function classifyErrorShape(n: number, sampleIndices: number[], sampleErrors: boolean[]): ErrorShape {
  const errs = sampleIndices.filter((_, k) => sampleErrors[k]);
  if (errs.length === 0) return 'none';
  if (errs.length === 1) return 'clustered';
  const span = Math.max(...errs) - Math.min(...errs);
  return span <= Math.max(1, Math.floor(n / 3)) ? 'clustered' : 'scattered';
}

export type Role = 'alice' | 'bob' | 'eve';
export type Decision = 'keep' | 'abort';

export interface ScoreResult {
  delta: number;
  youWon: boolean;
}

export function scoreRound(role: Role, result: RoundResult, decision: Decision): ScoreResult {
  const eve = Boolean(result.eveHit);
  let defender = 0;
  let eveDelta = 0;
  if (decision === 'abort') {
    if (eve) defender = DETECT;
  } else {
    if (eve) {
      eveDelta = result.stolen || 0;
      if (result.fileCracked) eveDelta += HEIST_BONUS;
    } else {
      defender = result.finalKey || 0;
    }
  }
  const delta = role === 'eve' ? eveDelta : defender;
  return { delta, youWon: delta > 0 };
}

export interface ComputerAliceMove {
  n: number;
  s: number;
}
export interface ComputerEveMove {
  method: 'computer_random';
  p: number;
  workers: number;
}
export interface ComputerBobMove {
  decision: Decision;
}

export function computerStrategy(role: 'alice', publicInfo: unknown, rng?: Rng): ComputerAliceMove;
export function computerStrategy(role: 'eve', publicInfo: unknown, rng?: Rng): ComputerEveMove;
export function computerStrategy(role: 'bob', publicInfo: { sampleQBER?: number }, rng?: Rng): ComputerBobMove;
// General overload for call sites (e.g. the session state machine) that only
// know `role` as the runtime-determined union, not a literal — they consume
// the result opaquely (JSON.stringify it), so a precise return type isn't needed there.
export function computerStrategy(
  role: Role,
  publicInfo: { sampleQBER?: number } | unknown,
  rng?: Rng
): ComputerAliceMove | ComputerEveMove | ComputerBobMove;
export function computerStrategy(
  role: Role,
  publicInfo: { sampleQBER?: number } | unknown,
  rng: Rng = Math.random
): ComputerAliceMove | ComputerEveMove | ComputerBobMove {
  if (role === 'alice') {
    const n = 16 + Math.floor(rng() * 17);
    return { n, s: Math.max(2, Math.floor(n / 6)) };
  }
  if (role === 'eve') {
    const r = rng();
    const p = r < 0.35 ? 0 : r < 0.6 ? 0.25 : r < 0.85 ? 0.5 : 1;
    return { method: 'computer_random', p, workers: 0 };
  }
  const q = (publicInfo as { sampleQBER?: number } | null)?.sampleQBER ?? 0;
  return { decision: q > ABORT ? 'abort' : 'keep' };
}
