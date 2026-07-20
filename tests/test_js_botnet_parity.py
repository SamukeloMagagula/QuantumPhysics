from quantumbreach.qkd import botnet
from tests.browser_utils import live_server, browser_page, requires_browser


@requires_browser
def test_js_matches_python():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        for kb, w in [(12, 8), (20, 50), (128, 100)]:
            js = pg.evaluate(
                "(a) => PhantomBotnet.crackableWithin(a[0], a[1], PhantomBotnet.ROUND_WINDOW)",
                [kb, w],
            )
            assert js == botnet.crackable_within(kb, w, botnet.ROUND_WINDOW)
