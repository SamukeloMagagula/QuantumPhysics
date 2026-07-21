from tests.browser_utils import live_server, browser_page, requires_browser


def test_qkd_route_renders_script_once(client):
    html = client.get("/qkd").get_data(as_text=True)
    assert "Quantum Intercept" in html
    assert html.count("js/qkd.js") == 1  # scripts block must not double-render


@requires_browser
def test_solo_as_bob_plays_a_round():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        assert pg.evaluate("!!window.QuantumIntercept.resolveRound") is True
        pg.click('.role[data-role="bob"]')      # choose Bob -> computer Alice+Eve resolve, QBER shown
        pg.wait_for_timeout(250)
        pg.click("#btn-abort")
        pg.wait_for_timeout(200)
        assert "Score:" in pg.inner_text("#qkd-score")
        assert pg.inner_text("#qkd-reveal").strip() != ""
        # the network-map stage rendered the round (qubits + intrusion meter)
        assert pg.evaluate("() => document.querySelectorAll('#qkd-stage .stage-qubits .qubit').length") > 0
        assert pg.evaluate("() => !!document.querySelector('#qkd-stage .stage-intrusion-fill')")
        pg.screenshot(path="/tmp/phantomq-qkd-solo.png", full_page=True)


@requires_browser
def test_solo_score_posts_best():
    with live_server() as base, browser_page() as pg:
        posts = []
        pg.on("request", lambda r: posts.append(r) if (r.method == "POST" and "/api/qkd/score" in r.url) else None)
        pg.goto(base + "/qkd", wait_until="networkidle")
        # Play Bob and ABORT each round. When computer-Eve intercepted (~65% of rounds), ABORT
        # is a correct detection (+25) -> a new personal best -> a score POST. Stop on the first post.
        for _ in range(15):
            if posts:
                break
            pg.click('.role[data-role="bob"]')   # re-selecting Bob starts a fresh round
            pg.wait_for_timeout(120)
            pg.click("#btn-abort")
            pg.wait_for_timeout(120)
        assert posts, "expected at least one /api/qkd/score POST once Bob correctly detects Eve"


@requires_browser
def test_solo_eve_taps_drive_the_round():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-solo")
        pg.click('.role[data-role="eve"]')
        pg.wait_for_selector('#qkd-stage .stage-qubits .qubit', timeout=5000)
        # tap the first qubit, pick a basis, then commit
        pg.click('#qkd-stage .stage-qubits .qubit:nth-child(1)')
        pg.click('#qkd-stage .tap-picker [data-basis="x"]')
        pg.click('#ev-commit')
        pg.wait_for_function("() => document.getElementById('qkd-score').textContent.indexOf('Score') >= 0", timeout=5000)
        assert pg.evaluate("() => document.querySelectorAll('#qkd-stage .qubit.grabbed').length") >= 1


@requires_browser
def test_qkd_actions_pendingresult_and_mode_are_explicit():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-solo")
        out = pg.evaluate("""() => {
          QkdActions.aliceSet({n: 8, s: 0});
          QkdActions.eveTap(0, 'x');
          var before = QkdActions.state().phase;
          var r = QkdActions.eveCommit();
          var after = QkdActions.state();
          return { before: before, after: after.phase, hasPending: !!after.pendingResult, mode: after.eve.mode };
        }""")
        assert out["before"] == "eve"
        assert out["after"] == "bob"
        assert out["hasPending"] is True
        assert out["mode"] == "tap"


@requires_browser
def test_solo_upload_preview_shows_immediately():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-solo")
        pg.click(".role[data-role='alice']")
        pg.wait_for_selector("#al-file", timeout=5000)
        pg.select_option("#al-file", "upload")
        pg.set_input_files("#al-upload", files=[{"name": "hello.txt", "mimeType": "text/plain", "buffer": b"PREVIEW ME"}])
        pg.wait_for_function(
            "() => { var el = document.getElementById('al-preview'); return el && el.textContent.indexOf('PREVIEW ME') >= 0; }",
            timeout=4000)


@requires_browser
def test_solo_round_narrates_into_the_feed_sidebar():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.wait_for_function("() => window.__payloadReady === true", timeout=5000)
        pg.click("#mode-solo")
        pg.click(".role[data-role='eve']")
        pg.wait_for_selector("#qkd-stage .stage-qubits .qubit", timeout=5000)
        pg.click("#qkd-stage .stage-qubits .qubit:nth-child(1)")
        pg.click('#qkd-stage .tap-picker [data-basis="x"]')
        pg.click("#ev-commit")
        pg.wait_for_function("() => document.getElementById('qkd-score').textContent.indexOf('Score') >= 0", timeout=5000)
        feed_text = pg.inner_text("#qkd-feed")
        assert "Eve taps qubit 0" in feed_text
        assert "Round resolved" in feed_text
        assert ("KEEPS" in feed_text or "ABORTS" in feed_text)
