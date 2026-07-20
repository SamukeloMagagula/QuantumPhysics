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
