export type Bit = 0 | 1;
export type Basis = 'plus' | 'cross';

export function randomBit(rng: () => number = Math.random): Bit {
  return rng() < 0.5 ? 0 : 1;
}

export function randomBasis(rng: () => number = Math.random): Basis {
  return rng() < 0.5 ? 'plus' : 'cross';
}

/**
 * Core BB84 physics: measuring a photon in the basis it was prepared in
 * deterministically reveals its bit. Measuring in the wrong basis collapses
 * it to a random bit — the same rule whether it's Bob or an eavesdropping
 * Eve doing the measuring.
 */
export function measure(trueBit: Bit, trueBasis: Basis, measureBasis: Basis, rng: () => number = Math.random): Bit {
  if (measureBasis === trueBasis) return trueBit;
  return randomBit(rng);
}
