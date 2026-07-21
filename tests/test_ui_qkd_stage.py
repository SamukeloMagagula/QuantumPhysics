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


@requires_browser
def test_stage_streams_and_taps():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        out = pg.evaluate("""() => {
          var root = document.createElement('div'); document.body.appendChild(root);
          var h = QuantumStage.mount(root, {});
          var taps = [];
          h.onTap(function (t) { taps.push(t); });
          h.streamQubits([{basis:'+'},{basis:'x'},{basis:'+'}], {tappable: true});
          var qs = root.querySelectorAll('.stage-qubits .qubit');
          qs[1].click();
          var picker = root.querySelector('.tap-picker');
          picker.querySelector("[data-basis='x']").click();
          return { count: qs.length, tapped: JSON.stringify(taps), grabbed: qs[1].className.indexOf('grabbed') >= 0,
                   taplist: JSON.stringify(h.tapsSoFar()) };
        }""")
        assert out["count"] == 3
        assert out["tapped"] == '[{"index":1,"basis":"x"}]'
        assert out["grabbed"] is True
        assert out["taplist"] == '[{"i":1,"basis":"x"}]'


@requires_browser
def test_stage_reveal_and_replay():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.evaluate("""() => {
          var root = document.createElement('div'); root.id='rr'; document.body.appendChild(root);
          var h = QuantumStage.mount(root, {});
          var pane = document.createElement('div'); pane.id='rrpane'; root.appendChild(pane);
          var bytes = new Uint8Array([67,76,65,83,83]); // 'CLASS'
          h.setPayload('text/plain', 'secret.txt');
          window.__rrH = h; window.__rrBytes = bytes; window.__rrPane = pane;
          h.playReplay({ n:4, aBases:['+','x','+','x'], bBases:['+','x','x','+'],
                         eveTaps:[{i:1,basis:'+'}], sampleIndices:[1], sampleErrors:[true] });
        }""")
        # revealFile returns a Promise (decrypt has a 500ms timer); await it
        pg.evaluate("() => window.__rrH.revealFile(window.__rrPane, window.__rrBytes, 'text/plain', 'decrypt')")
        pg.wait_for_function("() => document.getElementById('rrpane').textContent.indexOf('CLASS') >= 0", timeout=4000)
        out = pg.evaluate("""() => ({
          paneText: document.getElementById('rrpane').textContent.indexOf('CLASS') >= 0,
          payload: document.querySelector('#rr .stage-payload').textContent.indexOf('secret.txt') >= 0,
          replayQubits: document.querySelectorAll('#rr .stage-qubits .qubit').length
        })""")
        assert out["paneText"] is True
        assert out["payload"] is True
        assert out["replayQubits"] == 4
