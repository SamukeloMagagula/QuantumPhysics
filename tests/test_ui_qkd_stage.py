from tests.browser_utils import live_server, browser_page, requires_browser


@requires_browser
def test_stage_mounts_network_map_and_log():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        out = pg.evaluate("""() => {
          var root = document.createElement('div'); document.body.appendChild(root);
          var h = QuantumStage.mount(root, {});
          h.log('Alice encrypting secret.jpg', 'info');
          h.setIntrusion(0.14, 0.11);
          return {
            net: !!root.querySelector('.stage-net'),
            alice: !!root.querySelector('.stage-node.alice'),
            bob: !!root.querySelector('.stage-node.bob'),
            evetap: !!root.querySelector('.stage-evetap'),
            logline: root.querySelector('.stage-log').textContent.indexOf('Alice encrypting') >= 0,
            hot: root.querySelector('.stage-intrusion-fill').className.indexOf('hot') >= 0
          };
        }""")
        assert out["net"] and out["alice"] and out["bob"] and out["evetap"]
        assert out["logline"] and out["hot"]   # 0.14 > 0.11 abort line -> hot
