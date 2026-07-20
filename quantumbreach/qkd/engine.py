"""Authoritative BB84 round resolver for multiplayer. Mirrors static/js/qkd.js exactly.

RNG contract (identical to the JS resolver): rng() -> float in [0,1). Per photon we
draw EXACTLY 7 floats in this order: aBit, aBasis, eve-intercept, eve-basis,
eve-mismatch-bit, bob-basis, bob-mismatch-bit — all seven every photon.
"""
import random

ABORT = 0.11
DETECT = 25
HEIST_BONUS = 20


def _bit(d):
    return 0 if d < 0.5 else 1


def _basis(d):
    return "+" if d < 0.5 else "x"


def _draw(rng):
    v = rng()
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) and 0.0 <= v < 1.0 else 0.0


def resolve_round(config, rng=None):
    rng = rng or random.random
    n = max(1, int(config.get("n", 0) or 0))
    p = min(1.0, max(0.0, float(config.get("p", 0) or 0)))
    s = max(0, int(config.get("s", 0) or 0))
    a_bits, a_bases, b_bases, b_bits, intercepted, e_bases = [], [], [], [], [], []
    for _ in range(n):
        d0, d1, d2, d3, d4, d5, d6 = (_draw(rng), _draw(rng), _draw(rng), _draw(rng), _draw(rng), _draw(rng), _draw(rng))
        a_bit, a_basis = _bit(d0), _basis(d1)
        interc = d2 < p
        if interc:
            e_basis = _basis(d3)
            e_bit = a_bit if e_basis == a_basis else _bit(d4)
            ch_bit, ch_basis = e_bit, e_basis
        else:
            e_basis = ""
            ch_bit, ch_basis = a_bit, a_basis
        b_basis = _basis(d5)
        b_bit = ch_bit if b_basis == ch_basis else _bit(d6)
        a_bits.append(a_bit); a_bases.append(a_basis); b_bases.append(b_basis); b_bits.append(b_bit)
        intercepted.append(interc); e_bases.append(e_basis)
    positions = [i for i in range(n) if a_bases[i] == b_bases[i]]
    m = len(positions)
    sample_size = min(s, m)
    sample = positions[:sample_size]
    mism = sum(1 for i in sample if a_bits[i] != b_bits[i])
    sample_qber = (mism / sample_size) if sample_size else 0.0
    final_key = m - sample_size
    eve_hit = any(intercepted)
    stolen = sum(1 for i in positions[sample_size:] if intercepted[i] and e_bases[i] == a_bases[i])
    return {"n": n, "p": p, "sifted": m, "sampleSize": sample_size, "sampleQBER": sample_qber,
            "finalKey": final_key, "stolen": stolen, "eveHit": eve_hit}


def score_round(role, result, decision):
    eve = bool(result.get("eveHit"))
    defender, eve_delta = 0, 0
    if decision == "abort":
        if eve:
            defender = DETECT
    else:  # keep
        if eve:
            eve_delta = int(result.get("stolen") or 0)
            if result.get("fileCracked"):
                eve_delta += HEIST_BONUS
        else:
            defender = int(result.get("finalKey") or 0)
    delta = eve_delta if role == "eve" else defender
    return {"delta": delta, "youWon": delta > 0}


def computer_strategy(role, public, rng=None):
    rng = rng or random.random
    if role == "alice":
        n = 16 + int(rng() * 17)
        return {"n": n, "s": max(2, n // 6)}
    if role == "eve":
        r = rng()
        p = 0.0 if r < 0.35 else 0.25 if r < 0.6 else 0.5 if r < 0.85 else 1.0
        return {"p": p}
    q = (public or {}).get("sampleQBER", 0.0)
    return {"decision": "abort" if q > ABORT else "keep"}
