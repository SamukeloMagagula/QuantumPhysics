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


def test_eve_full_file_heist_bonus():
    result = {"eveHit": True, "stolen": 3, "finalKey": 5, "fileCracked": True}
    s = engine.score_round("eve", result, "keep")
    assert s["delta"] == 3 + 20  # stolen bits + heist bonus
    result2 = dict(result); result2["fileCracked"] = False
    assert engine.score_round("eve", result2, "keep")["delta"] == 3


def test_eve_taps_right_basis_reads_clean_no_added_error():
    # rng always 0 -> aBit=0, aBasis='+', bBasis='+'. Eve taps photon 0 in '+' (matches Alice)
    # -> clean read/resend -> no error introduced at the sampled bit.
    r = engine.resolve_round({"n": 1, "s": 1, "eveTaps": [{"i": 0, "basis": "+"}]}, lambda: 0.0)
    assert r["intercepted"] == [True]
    assert r["eveHit"] is True
    assert r["sampleQBER"] == 0.0


def test_eve_taps_wrong_basis_can_disturb():
    # aBit=0,aBasis='+'; Eve taps '+... no, taps 'x' (wrong): eBit=_bit(d4=0.9)=1 in 'x';
    # bBasis=_basis(d5=0.0)='+' (!= 'x') -> bBit=_bit(d6=0.9)=1; aBit 0 vs 1 -> sampled mismatch.
    seq = iter([0.0, 0.0, 0.0, 0.0, 0.9, 0.0, 0.9])
    r = engine.resolve_round({"n": 1, "s": 1, "eveTaps": [{"i": 0, "basis": "x"}]}, lambda: next(seq))
    assert r["intercepted"] == [True]
    assert r["aBases"] == ["+"] and r["bBases"] == ["+"]
    assert r["sampleQBER"] == 1.0
    assert r["sampleErrors"] == [True]


def test_no_eve_taps_uses_random_p_unchanged():
    r = engine.resolve_round({"n": 4, "s": 0, "p": 0.0}, lambda: 0.99)  # p=0 -> never intercept
    assert r["eveHit"] is False and r["intercepted"] == [False, False, False, False]
    assert "aBases" in r and len(r["aBases"]) == 4


def test_classify_error_shape_none_when_no_errors():
    assert engine.classify_error_shape(24, [3, 9, 15], [False, False, False]) == "none"


def test_classify_error_shape_clustered_when_errors_bunch():
    # errors at 10,11,12 out of n=24: span=2, n//3=8, span <= 8 -> clustered
    assert engine.classify_error_shape(24, [2, 10, 11, 12, 20], [False, True, True, True, False]) == "clustered"


def test_classify_error_shape_scattered_when_errors_spread_out():
    # errors at 0 and 23 out of n=24: span=23, n//3=8, span > 8 -> scattered
    assert engine.classify_error_shape(24, [0, 12, 23], [True, False, True]) == "scattered"


def test_classify_error_shape_single_error_is_clustered():
    assert engine.classify_error_shape(24, [12], [True]) == "clustered"


def test_computer_strategy_eve_emits_method_shape():
    out = engine.computer_strategy("eve", {}, lambda: 0.0)   # r=0.0 -> p=0.0 branch
    assert out == {"method": "computer_random", "p": 0.0, "workers": 0}
    out2 = engine.computer_strategy("eve", {}, lambda: 0.99)  # r=0.99 -> p=1.0 branch
    assert out2 == {"method": "computer_random", "p": 1.0, "workers": 0}
