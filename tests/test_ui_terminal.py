from tests.browser_utils import live_server, browser_page, requires_browser


def test_terminal_route_renders_script_once(client):
    html = client.get("/terminal").get_data(as_text=True)
    assert "PhantomShell" in html
    assert html.count("js/terminal.js") == 1  # scripts block must not double-render


@requires_browser
def test_terminal_parses_and_runs():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/terminal", wait_until="networkidle")
        # pure parser
        assert pg.evaluate("JSON.stringify(PhantomShell.parse('caesar -d 3 Khoor'))") == \
            '{"cmd":"caesar","args":["3","Khoor"],"flags":{"d":true}}'
        # run() returns a promise; page.evaluate awaits it
        val = pg.evaluate("(async () => await PhantomShell.run('caesar -d 3 Khoor'))()")
        assert val == "Hello"
        # drive the interactive shell
        pg.fill("#shell-in", "banner"); pg.press("#shell-in", "Enter")
        pg.wait_for_timeout(150)
        assert "PhantomShell" in pg.inner_text("#shell-out")
        bad = pg.evaluate("(async () => await PhantomShell.run('xor a hello'))()")
        assert isinstance(bad, str)  # bad input must resolve to a string, not throw
        pg.screenshot(path="/tmp/phantomq-terminal.png", full_page=True)
