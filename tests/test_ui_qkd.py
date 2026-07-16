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
