from tests.browser_utils import live_server, browser_page, requires_browser


@requires_browser
def test_encrypt_decrypt_roundtrip():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        js = """(function(){
          var key=[1,0,1,1,0,0,1,0,1,1];
          var data=new Uint8Array([72,73,33]); // 'HI!'
          var ct=QkdFile.encrypt(data,key);
          var pt=QkdFile.decrypt(ct,key);
          return Array.from(pt).join(',');
        })()"""
        assert pg.evaluate(js) == "72,73,33"


@requires_browser
def test_wrong_key_garbles():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        js = """(function(){
          var data=new Uint8Array([72,73,33]);
          var ct=QkdFile.encrypt(data,[1,0,1,1]);
          var pt=QkdFile.decrypt(ct,[0,1,0,1]);
          return Array.from(pt).join(',') === '72,73,33';
        })()"""
        assert pg.evaluate(js) is False


@requires_browser
def test_solo_round_reveals_file():
    # Deterministic path: play as Eve, intercept "None" (p=0) -> clean channel,
    # computer-Bob auto-KEEPs, and the default preloaded "mission" sample decrypts
    # visibly into Bob's pane. Solo-as-Alice would make Eve's strategy RANDOM, so
    # solo-as-Eve is the only role that keeps the whole round deterministic.
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        # payload preload happens on DOMContentLoaded; wait for the test-support flag
        # before driving the round so currentPayload is guaranteed ready.
        pg.wait_for_function("() => window.__payloadReady === true", timeout=5000)
        pg.click("#mode-solo")
        pg.click(".role[data-role='eve']")
        pg.click(".ev[data-p='0']")
        pg.wait_for_selector("#bob-file pre", timeout=5000)
        assert "CLASSIFIED" in pg.inner_text("#bob-file")


@requires_browser
def test_botnet_cracks_short_key_and_reveals_to_eve():
    # A short key (n=8, s=0 -> final key <= 8 bits) with a 100-worker botnet deployed
    # cracks within the round window, so Bob's decision marks the file as cracked and
    # Eve's pane renders the plaintext instead of scrambled ciphertext.
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-solo")
        pg.evaluate("() => QkdActions.aliceSet({n: 8, s: 0, file: 'mission'})")
        pg.evaluate("() => QkdActions.eveCrack({workers: 100})")
        r = pg.evaluate("() => QkdActions.bobDecide('keep')")
        assert pg.evaluate("() => QkdActions.state().lastResult.result.fileCracked") is True


@requires_browser
def test_killing_botnet_workers_reduces_live_crack_capacity():
    # Deploy 100 workers against a 24-bit key (crackable within the round window at
    # 100 workers: 2^24/5,000,000 ~= 3.4s) then kill all but 2 of them via the same
    # PhantomBotnet.kill(pid) bridge the terminal's `kill` command uses. At 2 workers
    # the same 24-bit key is NOT crackable within the window (2^24/100,000 ~= 168s),
    # proving a terminal `kill <pid>` before Bob decides actually reduces live crack
    # capacity and flips fileCracked, not just cosmetically shrinks the worker count.
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-solo")
        pg.evaluate("() => QkdActions.eveCrack({workers: 100})")
        presolved = "{n:1, sifted:1, sampleSize:0, sampleQBER:0, finalKey:24, stolen:0, eveHit:false, aKeyFinal:[], bKeyFinal:[]}"
        cracked_full = pg.evaluate("() => QkdActions.bobDecide('keep', " + presolved + ").result.fileCracked")
        assert cracked_full is True
        pg.evaluate("""() => {
          var pids = PhantomBotnet.pids();
          for (var i = 2; i < pids.length; i++) PhantomBotnet.kill(pids[i]);
        }""")
        assert pg.evaluate("() => PhantomBotnet.pids().length") == 2
        cracked_reduced = pg.evaluate("() => QkdActions.bobDecide('keep', " + presolved + ").result.fileCracked")
        assert cracked_reduced is False


@requires_browser
def test_botnet_render_panel_draws_tiles():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        n = pg.evaluate("""() => {
          var g = document.createElement('div'), r = document.createElement('span'),
              e = document.createElement('span'), d = document.createElement('span');
          PhantomBotnet.renderPanel({grid:g, rate:r, eta:e, detect:d}, 7, 8, 0.5);
          return [g.querySelectorAll('.worker').length, r.textContent.length > 0, e.textContent, d.textContent];
        }""")
        assert n[0] == 7            # 7 worker tiles
        assert n[1] is True         # rate rendered
        assert "s" in n[2] or "heat" in n[2]   # eta formatted (finite 'Ns' or heat-death)
        assert n[3] == "50"         # detectionDelta(0.5) == 50
