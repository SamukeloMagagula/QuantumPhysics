from tests.browser_utils import live_server, browser_page, requires_browser


@requires_browser
def test_terminal_drives_same_state_as_buttons():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-solo")
        # drive Alice via terminal-style action calls (QkdActions is global on /qkd)
        pg.evaluate("() => QkdActions.aliceSet({n: 12, s: 2, file: 'mission'})")
        assert pg.evaluate("() => QkdActions.state().alice.n") == 12
        # eve crack via action
        pg.evaluate("() => QkdActions.eveCrack({workers: 8})")
        assert pg.evaluate("() => QkdActions.state().eve.workers") == 8


@requires_browser
def test_solo_buttons_mirror_into_qkd_actions_state():
    # Play solo as Eve using real DOM buttons (not direct QkdActions calls) and confirm
    # QkdActions.state() reflects the same values the buttons produced — proof that
    # buttons and the action layer write ONE shared state, not two independent ones.
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.wait_for_function("() => window.__payloadReady === true", timeout=5000)
        pg.click("#mode-solo")
        pg.click(".role[data-role='eve']")
        pg.click(".ev[data-p='0.5']")
        pg.wait_for_timeout(150)
        assert pg.evaluate("() => QkdActions.state().eve.p") == 0.5
        assert pg.evaluate("() => QkdActions.state().alice.n") > 0
        assert pg.evaluate("() => QkdActions.state().phase") == "resolve"


@requires_browser
def test_parse_double_dash_captures_value_but_single_dash_stays_boolean():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/terminal", wait_until="networkidle")
        # NEW: --flag value pairs are captured for double-dash flags
        assert pg.evaluate("JSON.stringify(PhantomShell.parse('alice set --len 12 --sample 2'))") == \
            '{"cmd":"alice","args":["set"],"flags":{"len":"12","sample":"2"}}'
        # REGRESSION PIN: single-dash flags must stay booleans (caesar/xor/b64 depend on this)
        assert pg.evaluate("JSON.stringify(PhantomShell.parse('caesar -d 3 Khoor'))") == \
            '{"cmd":"caesar","args":["3","Khoor"],"flags":{"d":true}}'


@requires_browser
def test_shell_qkd_pack_calls_qkd_actions_with_parsed_values():
    # Inject a recording stub for QkdActions on the /terminal page (QkdActions itself
    # only exists on /qkd — this is the documented cross-page limitation) so we can
    # verify shell-qkd.js parses terminal input and calls the right QkdActions intents
    # with the right values, end-to-end through the real PhantomShell.run().
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/terminal", wait_until="networkidle")
        pg.evaluate("""() => {
          window.__calls = [];
          window.QkdActions = {
            state: () => ({ phase: 'setup', alice: { n: 24, s: 6 }, eve: { p: 0, workers: 0 } }),
            aliceSet: (o) => window.__calls.push(['aliceSet', o]),
            eveIntercept: (p) => window.__calls.push(['eveIntercept', p]),
            eveCrack: (o) => window.__calls.push(['eveCrack', o]),
            eveStopCrack: () => window.__calls.push(['eveStopCrack']),
            bobDecide: (d) => { window.__calls.push(['bobDecide', d]); return { result: { fileCracked: false, eveHit: false } }; }
          };
        }""")

        r1 = pg.evaluate("(async () => await PhantomShell.run('alice set --len 12 --sample 2 --file mission'))()")
        assert r1 == "alice: key set"
        r2 = pg.evaluate("(async () => await PhantomShell.run('eve intercept 40'))()")
        assert "40" in r2
        r3 = pg.evaluate("(async () => await PhantomShell.run('eve crack --workers 6'))()")
        assert "6" in r3
        r4 = pg.evaluate("(async () => await PhantomShell.run('eve crack --stop'))()")
        assert "stopped" in r4
        r5 = pg.evaluate("(async () => await PhantomShell.run('bob keep'))()")
        assert "bob: keep" in r5

        calls = pg.evaluate("() => window.__calls")
        assert calls[0][0] == "aliceSet"
        assert calls[0][1] == {"n": 12, "s": 2, "file": "mission"}
        assert calls[1] == ["eveIntercept", 40]
        assert calls[2][0] == "eveCrack" and calls[2][1] == {"workers": 6}
        assert calls[3][0] == "eveStopCrack"
        assert calls[4] == ["bobDecide", "keep"]


@requires_browser
def test_qkd_terminal_commands_guard_without_qkd_actions():
    # On the real /terminal page QkdActions does not exist (it's only defined on /qkd);
    # the qkd/alice/eve/bob commands must degrade to a friendly message, not throw.
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/terminal", wait_until="networkidle")
        assert pg.evaluate("() => window.QkdActions") is None
        out = pg.evaluate("(async () => await PhantomShell.run('alice set --len 12'))()")
        assert out == "qkd: open the QKD page first"
        out2 = pg.evaluate("(async () => await PhantomShell.run('qkd status'))()")
        assert out2 == "qkd: open the QKD page first"
