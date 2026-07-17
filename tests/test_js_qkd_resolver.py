from tests.browser_utils import live_server, browser_page, requires_browser

# A fixed float vector -> deterministic round. VEC repeats every 7 draws (one photon).
# 4 photons: photon rng draws below. See the plan's RNG contract for the draw order.
VEC = (
    # p0: aBit d0=.10(0) aBasis d1=.10(+) intercept d2=.99(no) d3 d4 unused bBasis d5=.10(+) d6
    "0.10,0.10,0.99,0.50,0.50,0.10,0.50,"
    # p1: aBit .90(1) aBasis .90(x) intercept .99(no) .. bBasis .90(x) ..
    "0.90,0.90,0.99,0.50,0.50,0.90,0.50,"
    # p2: aBit .10(0) aBasis .10(+) intercept .99(no) .. bBasis .90(x=MISMATCH -> not sifted)
    "0.10,0.10,0.99,0.50,0.50,0.90,0.50,"
    # p3: aBit .90(1) aBasis .90(x) intercept .99(no) .. bBasis .10(+ MISMATCH -> not sifted)
    "0.90,0.90,0.99,0.50,0.50,0.10,0.50"
)


@requires_browser
def test_resolver_clean_channel_seeded():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        js = """(vec) => {
          const a = vec.split(',').map(Number); let i = 0;
          const rng = () => a[i++];
          const r = window.QuantumIntercept.resolveRound({n:4, s:0, p:0}, rng);
          return [r.sifted, r.sampleQBER, r.finalKey, r.stolen, r.eveHit];
        }"""
        sifted, qber, final, stolen, eve = pg.evaluate(js, VEC)
        assert sifted == 2          # photons 0 and 1 have matching bases; 2 and 3 don't
        assert qber == 0            # clean channel, no Eve
        assert final == 2           # s=0 sacrifices nothing
        assert stolen == 0 and eve is False


@requires_browser
def test_scoring_table():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        # Eve intercepted + ABORT -> defenders win the detection bonus, Eve loses.
        assert pg.evaluate("window.QuantumIntercept.scoreRound('bob', {eveHit:true, stolen:3, finalKey:5}, 'abort')") == {"delta": 25, "youWon": True}
        assert pg.evaluate("window.QuantumIntercept.scoreRound('eve', {eveHit:true, stolen:3, finalKey:5}, 'abort')") == {"delta": 0, "youWon": False}
        # Eve intercepted + KEEP -> Eve wins her stolen bits, defenders get nothing.
        assert pg.evaluate("window.QuantumIntercept.scoreRound('eve', {eveHit:true, stolen:3, finalKey:5}, 'keep')") == {"delta": 3, "youWon": True}
        assert pg.evaluate("window.QuantumIntercept.scoreRound('alice', {eveHit:true, stolen:3, finalKey:5}, 'keep')") == {"delta": 0, "youWon": False}
        # Clean + KEEP -> defenders bank the final key.
        assert pg.evaluate("window.QuantumIntercept.scoreRound('alice', {eveHit:false, stolen:0, finalKey:5}, 'keep')") == {"delta": 5, "youWon": True}
        # Clean + ABORT -> false alarm, nobody scores.
        assert pg.evaluate("window.QuantumIntercept.scoreRound('bob', {eveHit:false, stolen:0, finalKey:5}, 'abort')") == {"delta": 0, "youWon": False}
