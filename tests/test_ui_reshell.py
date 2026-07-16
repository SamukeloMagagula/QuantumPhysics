from tests.browser_utils import live_server, browser_page, requires_browser


@requires_browser
def test_reshell_effects_and_toggle():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/", wait_until="networkidle")
        # effects API present, matrix canvas exists
        assert pg.evaluate("!!window.PhantomFX") is True
        assert pg.query_selector("#fx-bg") is not None
        # toggling reduced motion adds fx-off to body
        pg.evaluate("window.PhantomFX.setReducedMotion(true)")
        assert "fx-off" in (pg.get_attribute("body", "class") or "")


@requires_browser
def test_fx_toggle_off_on_is_stable():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/", wait_until="networkidle")
        # toggling off then on repeatedly must not throw and must end visible/hidden correctly
        pg.evaluate("window.PhantomFX.setReducedMotion(true)")
        assert "fx-off" in (pg.get_attribute("body", "class") or "")
        pg.evaluate("window.PhantomFX.setReducedMotion(false)")
        pg.evaluate("window.PhantomFX.setReducedMotion(false)")  # a second on() must be a no-op, not a 2nd loop
        assert "fx-off" not in (pg.get_attribute("body", "class") or "")
        assert pg.evaluate("!!window.PhantomFX") is True
        pg.screenshot(path="/tmp/phantomq-reshell.png", full_page=True)
