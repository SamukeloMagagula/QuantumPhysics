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
        # New heist input: tap a qubit on the stage + Commit (replaces the old intercept chips).
        pg.wait_for_selector("#qkd-stage .stage-qubits .qubit", timeout=5000)
        pg.click("#qkd-stage .stage-qubits .qubit:nth-child(1)")
        pg.click('#qkd-stage .tap-picker [data-basis="x"]')
        pg.click("#ev-commit")
        pg.wait_for_timeout(200)
        # the button-driven round still mirrors computer-Alice's key + drives phase in QkdActions
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
    # only exists on /qkd) so we can verify shell-qkd.js parses terminal input and
    # calls the right QkdActions intents with the right values, end-to-end through
    # the real PhantomShell.run().
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/terminal", wait_until="networkidle")
        pg.evaluate("""() => {
          window.__calls = [];
          window.QkdActions = {
            state: () => ({ phase: 'setup', alice: { n: 24, s: 6 }, eve: { p: 0, workers: 0 } }),
            aliceSet: (o) => window.__calls.push(['aliceSet', o]),
            eveTap: (i, b) => window.__calls.push(['eveTap', i, b]),
            eveCommit: (o) => { window.__calls.push(['eveCommit', o]); return { sampleQBER: 0.1 }; },
            eveCrack: (o) => window.__calls.push(['eveCrack', o]),
            eveStopCrack: () => window.__calls.push(['eveStopCrack']),
            bobDecide: (d) => { window.__calls.push(['bobDecide', d]); return { result: { fileCracked: false, eveHit: false } }; }
          };
        }""")

        r1 = pg.evaluate("(async () => await PhantomShell.run('alice set --len 12 --sample 2 --file mission'))()")
        assert r1 == "alice: key set"
        r2 = pg.evaluate("(async () => await PhantomShell.run('eve tap 3 x'))()")
        assert "3" in r2 and "x" in r2
        r3 = pg.evaluate("(async () => await PhantomShell.run('eve commit --workers 6'))()")
        assert "committed" in r3
        r4 = pg.evaluate("(async () => await PhantomShell.run('eve crack --workers 6'))()")
        assert "6" in r4
        r5 = pg.evaluate("(async () => await PhantomShell.run('eve crack --stop'))()")
        assert "stopped" in r5
        r6 = pg.evaluate("(async () => await PhantomShell.run('bob keep'))()")
        assert "bob: keep" in r6

        calls = pg.evaluate("() => window.__calls")
        assert calls[0][0] == "aliceSet"
        assert calls[0][1] == {"n": 12, "s": 2, "file": "mission"}
        assert calls[1] == ["eveTap", 3, "x"]
        assert calls[2][0] == "eveCommit" and calls[2][1] == {"workers": 6}
        assert calls[3][0] == "eveCrack" and calls[3][1] == {"workers": 6}
        assert calls[4][0] == "eveStopCrack"
        assert calls[5] == ["bobDecide", "keep"]


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
        out3 = pg.evaluate("(async () => await PhantomShell.run('eve tap 0 x'))()")
        assert out3 == "qkd: open the QKD page first"
        out4 = pg.evaluate("(async () => await PhantomShell.run('alice upload'))()")
        assert out4 == "qkd: open the QKD page first"


@requires_browser
def test_bobdecide_uses_presolved_result_not_a_reroll():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-solo")
        # A presolved result passed in must be stored verbatim (identity/values), not replaced by a fresh roll.
        r = pg.evaluate("""() => {
            var res = {n:8, sifted:5, sampleSize:0, sampleQBER:0.42, finalKey:5, stolen:0, eveHit:true, aKeyFinal:[1,0,1,1,0], bKeyFinal:[1,0,1,1,0]};
            QkdActions.bobDecide('keep', res);
            var lr = QkdActions.state().lastResult;
            return lr && lr.decision === 'keep' && lr.result.finalKey === 5 && lr.result.eveHit === true && lr.result.sampleQBER === 0.42;
        }""")
        assert r is True
        # Terminal-driven path (no presolved) still resolves internally without throwing.
        ok = pg.evaluate("() => { QkdActions.aliceSet({n:8,s:0}); QkdActions.eveIntercept(0); var lr = QkdActions.bobDecide('keep'); return !!(lr && lr.result && typeof lr.result.finalKey === 'number'); }")
        assert ok is True


@requires_browser
def test_embedded_qkd_terminal_drives_the_real_round():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.wait_for_function("() => window.__payloadReady === true", timeout=5000)
        pg.click("#mode-solo")
        pg.click(".role[data-role='eve']")
        pg.wait_for_selector("#shell-in", timeout=5000)
        pg.fill("#shell-in", "eve tap 0 x"); pg.press("#shell-in", "Enter")
        pg.wait_for_timeout(150)
        pg.fill("#shell-in", "eve commit"); pg.press("#shell-in", "Enter")
        pg.wait_for_function("() => document.getElementById('qkd-score').textContent.indexOf('Score') >= 0", timeout=5000)
        assert pg.evaluate("() => document.querySelectorAll('#qkd-stage .qubit.grabbed').length") >= 1
        assert pg.evaluate("() => QkdActions.state().phase") == "resolve"


@requires_browser
def test_prompt_upload_fires_set_payload_exactly_once(tmp_path):
    # Task 1's review flagged: #al-upload has BOTH a standing addEventListener("change", ...)
    # (added at setup) AND, via promptUpload(), used to set .onchange too -- both fire on the
    # SAME "change" event, so a single file pick ran readUploadedFile (and therefore
    # setPayloadFromBytes) TWICE. promptUpload() is the code path the new `alice upload`
    # terminal command exercises, so this pins the fix: exactly one setPayloadFromBytes call
    # (and one resolved file) per file pick, driven through a real simulated file chooser.
    upload_path = tmp_path / "note.txt"
    upload_path.write_text("HELLO PROMPT UPLOAD")
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.wait_for_function("() => window.__payloadReady === true", timeout=5000)
        pg.click("#mode-solo")
        pg.evaluate("""() => {
          window.__setPayloadCalls = 0;
          var orig = window.QkdActions.setPayloadFromBytes;
          window.QkdActions.setPayloadFromBytes = function () {
            window.__setPayloadCalls++;
            return orig.apply(window.QkdActions, arguments);
          };
          window.__uploadResult = null;
          window.QkdActions.promptUpload().then(function (f) { window.__uploadResult = f ? f.name : "null"; });
        }""")
        pg.set_input_files("#al-upload", str(upload_path))
        pg.wait_for_function("() => window.__uploadResult !== null", timeout=5000)
        assert pg.evaluate("() => window.__uploadResult") == "note.txt"
        assert pg.evaluate("() => window.__setPayloadCalls") == 1
