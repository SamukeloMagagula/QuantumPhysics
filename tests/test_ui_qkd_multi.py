from tests.browser_utils import live_server, two_player_pages, requires_browser


@requires_browser
def test_two_players_play_a_multiplayer_round():
    with live_server() as base, two_player_pages() as (alice, bob):
        # Alice creates a game as Alice; Bob joins as Bob; Eve is computer.
        alice.goto(base + "/qkd", wait_until="networkidle")
        alice.click("#mode-multi")
        alice.click('[data-create="alice"]')
        # The click only dispatches the DOM event; qm-mycode is populated later,
        # after the async POST /api/qkd/game resolves. Wait for it explicitly
        # (matches the wait_for_function idiom used later in this test) instead
        # of racing inner_text() against the fetch.
        alice.wait_for_function("() => (document.getElementById('qm-mycode').textContent || '').length === 4", timeout=8000)
        code = alice.inner_text("#qm-mycode").strip()
        assert len(code) == 4

        bob.goto(base + "/qkd", wait_until="networkidle")
        bob.click("#mode-multi")
        bob.fill("#qm-code", code)
        bob.click('[data-join="bob"]')

        alice.click("#qm-start")
        # Alice's turn first
        alice.wait_for_selector("#qm-al-go", timeout=8000)
        alice.click("#qm-al-go")
        # Eve is computer -> auto; Bob decides
        bob.wait_for_selector("#qm-keep", timeout=8000)
        bob.click("#qm-keep")
        # Both see a reveal for the round
        bob.wait_for_function("() => document.getElementById('qm-reveal').textContent.indexOf('Round') !== -1", timeout=8000)
        alice.wait_for_function("() => document.getElementById('qm-reveal').textContent.indexOf('Round') !== -1", timeout=8000)
        alice.screenshot(path="/tmp/phantomq-qkd-multi.png", full_page=True)
