from tests.browser_utils import live_server, browser_page, requires_browser


def test_qkd_route_renders_script_once(client):
    html = client.get("/qkd").get_data(as_text=True)
    assert "Quantum Intercept" in html
    assert html.count("js/qkd.js") == 1  # scripts block must not double-render


@requires_browser
def test_qkd_game_logic_and_ui():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        # judge: abort is correct when qber high
        assert pg.evaluate("QuantumIntercept.judge({eve:true,qber:0.25,keyBits:30},'abort').correct") is True
        assert pg.evaluate("QuantumIntercept.judge({eve:false,qber:0.0,keyBits:30},'keep').correct") is True
        assert pg.evaluate("QuantumIntercept.judge({eve:true,qber:0.25,keyBits:30},'keep').correct") is False
        # a fresh round has a numeric qber and key bits
        assert pg.evaluate("(() => { const r = QuantumIntercept.newRound({eve:true}); return typeof r.qber; })()") == "number"
        # drive a round
        pg.click("#btn-abort"); pg.wait_for_timeout(200)
        assert "Score:" in pg.inner_text("#qkd-score")
        pg.screenshot(path="/tmp/phantomq-qkd.png", full_page=True)


@requires_browser
def test_qkd_score_posts_to_leaderboard():
    with live_server() as base, browser_page() as pg:
        posts = []
        pg.on("request", lambda r: posts.append(r) if (r.method == "POST" and "/api/qkd/score" in r.url) else None)
        pg.goto(base + "/qkd", wait_until="networkidle")
        # Click ABORT across rounds; a correct call (Eve present) yields a positive
        # peak that posts. Stop as soon as a post is observed (usually 1-4 rounds).
        for _ in range(20):
            if posts:
                break
            try:
                pg.wait_for_function(
                    "() => document.getElementById('qkd-info').textContent.indexOf('abort') !== -1",
                    timeout=4000)
            except Exception:
                pass
            pg.click("#btn-abort")
            pg.wait_for_timeout(200)
        assert posts, "expected at least one /api/qkd/score POST during play"
        pg.wait_for_timeout(300)
        top = pg.evaluate("(async () => (await (await fetch('/api/qkd/leaderboard')).json()).top)()")
        assert any(r["score"] >= 1 for r in top)
