from tests.browser_utils import live_server, browser_page, requires_browser


@requires_browser
def test_chatbot_matches_and_navigates():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/dashboard", wait_until="networkidle")
        # pure matcher
        assert pg.evaluate("window.GhostBot.reply('what is xor').answer").lower().find("xor") != -1
        assert pg.evaluate("window.GhostBot.reply('take me to the terminal').action.href") == "/terminal"
        assert pg.evaluate("window.GhostBot.reply('asdkfj qwe').action") is None  # fallback
        # UI: open panel, ask, get a bot reply
        pg.click(".ghost-launch")
        pg.fill(".ghost-input", "what is qkd")
        pg.press(".ghost-input", "Enter")
        pg.wait_for_timeout(300)
        assert pg.locator(".ghost-msg.bot").count() >= 2
        pg.screenshot(path="/tmp/phantomq-chatbot.png")
