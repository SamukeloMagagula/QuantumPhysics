from tests.browser_utils import live_server, two_player_pages, browser_page, requires_browser


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


@requires_browser
def test_mp_alice_has_sample_picker():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-multi")
        pg.click("[data-create='alice']")            # create a game as Alice; Bob/Eve computer
        pg.wait_for_selector("#qm-start", timeout=8000)
        pg.click("#qm-start")                        # host starts -> alice_setup
        pg.wait_for_selector("#qm-file", timeout=6000)   # Alice-setup control shows the picker
        opts = pg.evaluate("() => Array.from(document.querySelectorAll('#qm-file option')).map(o => o.value)")
        assert "mission" in opts and "photo" in opts
        pg.select_option("#qm-file", "codes")
        pg.click("#qm-al-go")                          # submit; must not error, round advances
        pg.wait_for_timeout(400)


@requires_browser
def test_mp_eve_has_botnet_panel():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-multi")
        pg.click("[data-create='eve']")               # create as Eve; computer Alice auto-plays
        pg.wait_for_selector("#qm-start", timeout=8000)
        pg.click("#qm-start")                         # host starts -> computer Alice -> eve_move
        pg.wait_for_selector("#qm-w", timeout=8000)   # botnet slider present on Eve's turn
        # deploy workers -> grid renders tiles
        pg.eval_on_selector("#qm-w", "el => { el.value = 40; el.dispatchEvent(new Event('input')); }")
        pg.wait_for_timeout(150)
        tiles = pg.evaluate("() => document.querySelectorAll('#qm-grid .worker').length")
        assert tiles == 40
        # tap a qubit on the stage + commit -> advances without error
        pg.click("#qm-stage .stage-qubits .qubit:nth-child(1)")
        pg.click('#qm-stage .tap-picker [data-basis="x"]')
        pg.click("#qm-eve-go")
        pg.wait_for_timeout(400)


@requires_browser
def test_mp_reveal_renders_a_file_pane():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-multi")
        pg.click("[data-create='alice']")            # human Alice; computer Bob/Eve auto-play
        pg.wait_for_selector("#qm-start", timeout=8000)
        pg.click("#qm-start")
        pg.wait_for_selector("#qm-file", timeout=8000)
        pg.select_option("#qm-file", "mission")
        pg.click("#qm-al-go")
        # computer Eve + Bob auto-resolve; Alice always sees her own file
        pg.wait_for_function(
            "() => { var v = document.querySelector('#qm-file-view'); return v && v.textContent.indexOf('CLASSIFIED') >= 0; }",
            timeout=8000)
        assert "CLASSIFIED" in pg.inner_text("#qm-file-view")


@requires_browser
def test_mp_eve_taps_and_replay_render():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-multi")
        pg.click("[data-create='eve']")
        pg.wait_for_selector("#qm-start", timeout=8000); pg.click("#qm-start")
        pg.wait_for_selector("#qm-stage .stage-qubits .qubit", timeout=8000)   # Eve's tappable stream
        pg.click("#qm-stage .stage-qubits .qubit:nth-child(1)")
        pg.click('#qm-stage .tap-picker [data-basis="x"]')
        pg.click("#qm-eve-go")                                                 # commit taps
        # computer Bob auto-decides; replay renders on the stage at resolve
        pg.wait_for_function("() => document.querySelectorAll('#qm-stage .stage-qubits .qubit').length > 0", timeout=8000)
