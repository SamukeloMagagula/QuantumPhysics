from tests.browser_utils import live_server, browser_page, requires_browser


@requires_browser
def test_labs_crud_and_export():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/terminal", wait_until="networkidle")
        pg.evaluate("PhantomLabs.create({title:'T', prompt:'decode this', type:'freeform', answer:'Photon', hint:'physics'})")
        assert pg.evaluate("PhantomLabs.list().length") == 1
        lid = pg.evaluate("PhantomLabs.list()[0].id")
        assert pg.evaluate(f"PhantomLabs.check('{lid}','photon')") is True   # case-insensitive
        assert pg.evaluate(f"PhantomLabs.check('{lid}','nope')") is False
        yaml = pg.evaluate(f"(async()=>await PhantomLabs.exportYaml('{lid}'))()")
        assert "answer_type: exact" in yaml
        # hashed answer = sha256('photon')
        assert pg.evaluate("PhantomCrypto.sha256hex('photon')") in yaml


@requires_browser
def test_lab_create_wizard_flow():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/terminal", wait_until="networkidle")
        def enter(text):
            pg.fill("#shell-in", text); pg.press("#shell-in", "Enter"); pg.wait_for_timeout(80)
        enter("lab create"); enter("My Lab"); enter("what is 2+2"); enter("freeform"); enter("4"); enter("")
        out = pg.inner_text("#shell-out")
        assert "created" in out
        assert pg.evaluate("PhantomLabs.list().length") >= 1
