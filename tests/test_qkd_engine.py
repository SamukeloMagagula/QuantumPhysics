from quantumbreach.qkd import engine

VEC = [float(x) for x in (
    "0.10,0.10,0.99,0.50,0.50,0.10,0.50,"
    "0.90,0.90,0.99,0.50,0.50,0.90,0.50,"
    "0.10,0.10,0.99,0.50,0.50,0.90,0.50,"
    "0.90,0.90,0.99,0.50,0.50,0.10,0.50"
).split(",")]


def _vec_rng(vec):
    it = iter(vec)
    return lambda: next(it)


def test_resolver_matches_js_vector():
    r = engine.resolve_round({"n": 4, "s": 0, "p": 0}, _vec_rng(VEC))
    assert r["sifted"] == 2
    assert r["sampleQBER"] == 0
    assert r["finalKey"] == 2
    assert r["stolen"] == 0 and r["eveHit"] is False


def test_full_intercept_raises_qber():
    # One photon, sample size 1, full intercept. Hand-traced:
    #  aBit=_bit(.1)=0, aBasis=_basis(.1)="+"; intercept .0<1.0 yes;
    #  eBasis=_basis(.9)="x" (!= "+") -> eBit=_bit(.9)=1, channel=(1,"x");
    #  bBasis=_basis(.1)="+" (!= "x") -> bBit=_bit(.5)=1; bases match ("+"=="+") -> sifted=1;
    #  sample of 1: Alice bit 0 vs Bob bit 1 -> mismatch -> QBER 1.0; finalKey = 1-1 = 0.
    r = engine.resolve_round({"n": 1, "s": 1, "p": 1.0}, _vec_rng([0.1, 0.1, 0.0, 0.9, 0.9, 0.1, 0.5]))
    assert r["sifted"] == 1 and r["eveHit"] is True
    assert r["sampleQBER"] == 1.0        # Eve's interception injected a detectable error
    assert r["finalKey"] == 0 and r["stolen"] == 0


def test_scoring_and_strategy():
    assert engine.score_round("bob", {"eveHit": True, "stolen": 3, "finalKey": 5}, "abort") == {"delta": 25, "youWon": True}
    assert engine.score_round("eve", {"eveHit": True, "stolen": 3, "finalKey": 5}, "keep") == {"delta": 3, "youWon": True}
    assert engine.score_round("alice", {"eveHit": False, "stolen": 0, "finalKey": 5}, "keep") == {"delta": 5, "youWon": True}
    assert engine.score_round("bob", {"eveHit": False, "stolen": 0, "finalKey": 5}, "abort") == {"delta": 0, "youWon": False}
    assert engine.score_round("alice", {"eveHit": True, "stolen": 3, "finalKey": 5}, "keep") == {"delta": 0, "youWon": False}
    assert engine.computer_strategy("bob", {"sampleQBER": 0.30}) == {"decision": "abort"}
    assert engine.computer_strategy("bob", {"sampleQBER": 0.02}) == {"decision": "keep"}
    a = engine.computer_strategy("alice", {}, lambda: 0.0)
    assert a == {"n": 16, "s": 2}
