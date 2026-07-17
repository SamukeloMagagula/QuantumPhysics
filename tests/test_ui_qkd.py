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
