# Quantum Channel Heist — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the abstract photon strip with an interactive network-map "heist": a shared visual stage (Alice→fiber→Bob with Eve's tap), a real file that encrypts/streams/de-scrambles, live per-qubit tapping with basis choice, a timed Solo heist, and a secrecy-safe synchronized multiplayer replay.

**Architecture:** A new vanilla-JS `qkd-stage.js` module (network map + qubit stream + tap interaction + de-scramble reveal + terminal log) mounted by both Solo (`qkd.js`) and Multiplayer (`qkd-multi.js`). The BB84 engine (`engine.py` + `qkd.js resolveRound`) gains one optional input — Eve's explicit per-qubit `eveTaps` — and returns the public visualization arrays (bases, intercept flags). The server-authoritative phase machine builds a secrecy-safe `lastResult.replay` (public bases + sampled errors only; never key bits). No new dependencies, no Node.

**Tech Stack:** Python 3, Flask, Waitress, SQLite (stdlib `sqlite3`), Jinja2, vanilla ES5-style JS, DOM/SVG + CSS animation, pytest, Playwright (system Chrome via `tests/browser_utils.py`).

## Global Constraints

- **No Node / no build step.** JS ships as plain `<script>` files exposing `window.*`; logic as pure functions where possible.
- **No external network at runtime**; no CDNs/fonts. DOM/SVG + CSS animation only (no canvas game-loop needed).
- **BB84 physics unchanged.** Only Eve's *input* changes: explicit `eveTaps` (list of `{i, basis}`) instead of a random fraction. No change to sifting, QBER, `finalKey`, `stolen`, `eveHit`, scoring, or the 7-draws-per-photon RNG order.
- **Server-authoritative secrecy preserved.** The replay serializes only *public* BB84 info — all bases (public during sifting) + Eve's taps + the sampled positions' errors. Raw secret key **bit values** (`aBits`/`bBits` at non-sampled sifted positions), `e_bases` beyond taps, and the sifted key are **never** serialized to clients.
- **Concurrency guards untouched:** the guarded `UPDATE … WHERE phase='<current>'` + `rowcount==0` pattern in `service.py` (commit `a42ea98`) stays; only add fields to `cfg`.
- **`prefers-reduced-motion`** (and the existing FX toggle) gate all animation; degrade to instant end-state.
- **Run** the app with `python app.py`; **tests** with `python -m pytest`. The FULL suite (~4 min, real Chrome) exceeds a 2-min command limit — run small targeted files in the foreground.
- **Browser tests use the real harness:** `from tests.browser_utils import live_server, browser_page, requires_browser`, `@requires_browser`, `with live_server() as base, browser_page() as pg:`. NOT pytest-fixture `(live_server, page)` signatures.
- **Branch:** `quantum-channel-heist` (already cut off `main`; spec committed there).
- **Commit trailers** (every commit):
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EYTvUotg1ojVaavLMFNwo5
  ```

---

## File Structure

- **Modify** `quantumbreach/qkd/engine.py` — `resolve_round` accepts `eveTaps`; returns public arrays (`aBases`, `bBases`, `intercepted`, `sampleIndices`, `sampleErrors`).
- **Modify** `quantumbreach/static/js/qkd.js` — `resolveRound` mirrors the `eveTaps` input + the same returned arrays; Solo flow wires the stage.
- **Create** `quantumbreach/static/js/qkd-stage.js` — `window.QuantumStage.mount()` → stage handle (network map, qubit stream, tap, log, intrusion, reveal, replay).
- **Create** `quantumbreach/static/css/stage.css` — network-map + qubit + reveal styles (or append to `app.css`; this plan uses a new file).
- **Modify** `quantumbreach/templates/qkd.html` — stage host elements (Solo `#qkd-stage`, MP `#qm-stage`); load `qkd-stage.js`.
- **Modify** `quantumbreach/static/js/qkd-multi.js` — Eve tap panel submits `taps`; `playReplay` at resolve.
- **Modify** `quantumbreach/qkd/service.py` — `_clean_action` accepts `taps`; `advance()` stores `eveTaps`; `_resolve_scoring` builds `lastResult.replay`.
- **Modify** `.claude/skills/run-phantomq/drive.py`, `docs/QKD_MULTIPLAYER.md`, `docs/FOLLOWUPS.md` — screenshots + docs.
- **Tests:** `tests/test_qkd_engine.py`, `tests/test_js_qkd_resolver.py`, `tests/test_ui_qkd_stage.py` (new), `tests/test_ui_qkd.py`, `tests/test_qkd_multiplayer.py`, `tests/test_ui_qkd_multi.py`.

**Data shapes (used across tasks):**
- `eveTaps` input (both engine + wire): a **list** `[{"i": <int>, "basis": "+"|"x"}, …]`. `resolve_round`/`resolveRound` normalize it internally to an index→basis lookup.
- `resolve_round` **added** return fields (public): `"aBases": ["+"/"x" …]`, `"bBases": [ … ]`, `"intercepted": [true/false …]`, `"sampleIndices": [ … ]`, `"sampleErrors": [true/false …]` (per sampled position, whether Alice's & Bob's sampled bits differed). Existing fields (`n,p,sifted,sampleSize,sampleQBER,finalKey,stolen,eveHit`) unchanged.
- `lastResult.replay` (MP, in `game_state`): `{"n", "aBases", "bBases", "eveTaps": [{"i","basis"}], "sampleIndices", "sampleErrors"}`. No key bits.

---

## Phase 1 — Engine taps + shared stage

### Task 1: Engine accepts `eveTaps` and returns public visualization arrays

**Files:**
- Modify: `quantumbreach/qkd/engine.py` (`resolve_round`, ~lines 27-58)
- Modify: `quantumbreach/static/js/qkd.js` (`resolveRound`, ~lines 10-38)
- Test: `tests/test_qkd_engine.py`, `tests/test_js_qkd_resolver.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `resolve_round(config, rng)` where `config` may include `eveTaps` (list of `{i, basis}`); returns the existing dict plus `aBases`, `bBases`, `intercepted`, `sampleIndices`, `sampleErrors`. JS `resolveRound(config, rng)` mirrors it exactly (same fields).

- [ ] **Step 1: Write the failing engine tests**

```python
# append to tests/test_qkd_engine.py
from quantumbreach.qkd.engine import resolve_round


def test_eve_taps_right_basis_reads_clean_no_added_error():
    # Force a deterministic round: rng always 0 -> aBit=0, aBasis='+', bBasis='+', mismatch bits=0.
    # Eve taps photon 0 in '+' (matches Alice) -> clean read/resend -> no error introduced.
    r = resolve_round({"n": 1, "s": 1, "eveTaps": [{"i": 0, "basis": "+"}]}, lambda: 0.0)
    assert r["intercepted"] == [True]
    assert r["eveHit"] is True
    assert r["sampleQBER"] == 0.0            # right basis -> Bob still reads Alice's bit


def test_eve_taps_wrong_basis_can_disturb():
    # rng=0 -> aBasis='+'. Eve taps in 'x' (wrong). Eve's resent bit is _bit(d4)=_bit(0)=0 in 'x'.
    # Bob's basis d5=0 -> '+' (differs from Eve's 'x') -> Bob's bit = _bit(d6)=0. Alice's bit=0 -> match here,
    # but the INTERCEPT flag + wrong basis is recorded; use a vector that yields a mismatch:
    seq = iter([0.0, 0.0, 0.0, 0.0, 0.9, 0.0, 0.9])  # d4=0.9 -> eBit=1; d6=0.9 -> bBit=1; aBit=0 -> mismatch
    r = resolve_round({"n": 1, "s": 1, "eveTaps": [{"i": 0, "basis": "x"}]}, lambda: next(seq))
    assert r["intercepted"] == [True]
    assert r["aBases"] == ["+"] and r["bBases"] == ["+"]
    assert r["sampleQBER"] == 1.0            # wrong-basis intercept disturbed the sampled bit


def test_no_eve_taps_uses_random_p_unchanged():
    r = resolve_round({"n": 4, "s": 0, "p": 0.0}, lambda: 0.99)  # p=0 -> never intercept
    assert r["eveHit"] is False and r["intercepted"] == [False, False, False, False]
    assert "aBases" in r and len(r["aBases"]) == 4
```

- [ ] **Step 2: Run to verify they fail**

Run: `python -m pytest tests/test_qkd_engine.py -k eve_taps -v`
Expected: FAIL — `KeyError: 'intercepted'` / `eveTaps` ignored.

- [ ] **Step 3: Implement the engine change**

In `quantumbreach/qkd/engine.py`, replace `resolve_round`:

```python
def resolve_round(config, rng=None):
    rng = rng or random.random
    n = max(1, int(config.get("n", 0) or 0))
    p = min(1.0, max(0.0, float(config.get("p", 0) or 0)))
    s = max(0, int(config.get("s", 0) or 0))
    tap_list = config.get("eveTaps")
    taps = None
    if tap_list is not None:
        taps = {}
        for t in tap_list:
            try:
                b = t.get("basis")
                if b in ("+", "x"):
                    taps[int(t.get("i"))] = b
            except (TypeError, ValueError, AttributeError):
                continue
    a_bits, a_bases, b_bases, b_bits, intercepted, e_bases = [], [], [], [], [], []
    for i in range(n):
        d0, d1, d2, d3, d4, d5, d6 = (_draw(rng), _draw(rng), _draw(rng), _draw(rng), _draw(rng), _draw(rng), _draw(rng))
        a_bit, a_basis = _bit(d0), _basis(d1)
        if taps is not None:
            interc = i in taps
            e_basis = taps[i] if interc else ""
        else:
            interc = d2 < p
            e_basis = _basis(d3) if interc else ""
        if interc:
            e_bit = a_bit if e_basis == a_basis else _bit(d4)
            ch_bit, ch_basis = e_bit, e_basis
        else:
            ch_bit, ch_basis = a_bit, a_basis
        b_basis = _basis(d5)
        b_bit = ch_bit if b_basis == ch_basis else _bit(d6)
        a_bits.append(a_bit); a_bases.append(a_basis); b_bases.append(b_basis); b_bits.append(b_bit)
        intercepted.append(interc); e_bases.append(e_basis)
    positions = [i for i in range(n) if a_bases[i] == b_bases[i]]
    m = len(positions)
    sample_size = min(s, m)
    sample = positions[:sample_size]
    mism = sum(1 for i in sample if a_bits[i] != b_bits[i])
    sample_qber = (mism / sample_size) if sample_size else 0.0
    final_key = m - sample_size
    eve_hit = any(intercepted)
    stolen = sum(1 for i in positions[sample_size:] if intercepted[i] and e_bases[i] == a_bases[i])
    return {"n": n, "p": p, "sifted": m, "sampleSize": sample_size, "sampleQBER": sample_qber,
            "finalKey": final_key, "stolen": stolen, "eveHit": eve_hit,
            "aBases": a_bases, "bBases": b_bases, "intercepted": intercepted,
            "sampleIndices": sample,
            "sampleErrors": [a_bits[i] != b_bits[i] for i in sample]}
```

- [ ] **Step 4: Run the engine tests**

Run: `python -m pytest tests/test_qkd_engine.py -v`
Expected: PASS (new + existing).

- [ ] **Step 5: Mirror in JS `resolveRound`**

In `quantumbreach/static/js/qkd.js`, update `resolveRound` to (a) accept `config.eveTaps` and (b) return the same new fields. Replace the intercept block + return:

```javascript
  function resolveRound(config, rng) {
    rng = rng || Math.random;
    var n = Math.max(1, config.n | 0);
    var p = Math.min(1, Math.max(0, +config.p || 0));
    var s = Math.max(0, config.s | 0);
    var taps = null;
    if (config.eveTaps != null) {
      taps = {};
      for (var t = 0; t < config.eveTaps.length; t++) {
        var e = config.eveTaps[t];
        if (e && (e.basis === "+" || e.basis === "x")) taps[e.i | 0] = e.basis;
      }
    }
    var aBits = [], aBases = [], bBases = [], bBits = [], intercepted = [], eBases = [];
    for (var i = 0; i < n; i++) {
      var d0 = draw(rng), d1 = draw(rng), d2 = draw(rng), d3 = draw(rng), d4 = draw(rng), d5 = draw(rng), d6 = draw(rng);
      var aBit = bit(d0), aBasis = basis(d1);
      var interc, eBasis;
      if (taps !== null) { interc = Object.prototype.hasOwnProperty.call(taps, i); eBasis = interc ? taps[i] : ""; }
      else { interc = d2 < p; eBasis = interc ? basis(d3) : ""; }
      var chBit, chBasis;
      if (interc) { var eBit = (eBasis === aBasis) ? aBit : bit(d4); chBit = eBit; chBasis = eBasis; }
      else { chBit = aBit; chBasis = aBasis; }
      var bBasis = basis(d5);
      var bBit = (bBasis === chBasis) ? chBit : bit(d6);
      aBits.push(aBit); aBases.push(aBasis); bBases.push(bBasis); bBits.push(bBit);
      intercepted.push(interc); eBases.push(eBasis);
    }
    var sifted = C.bb84.sift(aBases, bBases, aBits, bBits);
    var m = sifted.positions.length;
    var sampleSize = Math.min(s, m);
    var sampleQBER = C.bb84.qber(sifted.aKey.slice(0, sampleSize), sifted.bKey.slice(0, sampleSize));
    var finalKey = m - sampleSize;
    var eveHit = false;
    for (var k = 0; k < n; k++) { if (intercepted[k]) { eveHit = true; break; } }
    var stolen = 0;
    for (var j = sampleSize; j < m; j++) { var pos = sifted.positions[j]; if (intercepted[pos] && eBases[pos] === aBases[pos]) stolen++; }
    var sampleIdx = sifted.positions.slice(0, sampleSize);
    var sampleErrors = [];
    for (var q = 0; q < sampleSize; q++) { var pp = sifted.positions[q]; sampleErrors.push(aBits[pp] !== bBits[pp]); }
    return { n: n, p: p, sifted: m, sampleSize: sampleSize, sampleQBER: sampleQBER, finalKey: finalKey,
             stolen: stolen, eveHit: eveHit, intercepted: intercepted, aBases: aBases, bBases: bBases,
             aKeyFinal: sifted.aKey.slice(sampleSize), bKeyFinal: sifted.bKey.slice(sampleSize),
             sampleIndices: sampleIdx, sampleErrors: sampleErrors };
  }
```

(Preserves `aKeyFinal`/`bKeyFinal` from the v3 file feature.)

- [ ] **Step 6: Add a JS↔Py parity test for taps**

```python
# append to tests/test_js_qkd_resolver.py
@requires_browser
def test_resolver_eve_taps_parity():
    from quantumbreach.qkd.engine import resolve_round
    vec = [0.0, 0.0, 0.0, 0.0, 0.9, 0.0, 0.9,   # photon 0
           0.9, 0.9, 0.0, 0.0, 0.0, 0.9, 0.0]   # photon 1
    py = resolve_round({"n": 2, "s": 1, "eveTaps": [{"i": 0, "basis": "x"}]},
                       (lambda it=iter(vec): (lambda: next(it)))())
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        js = """(v) => { let i=0; const rng=()=>v[i++];
          const r = window.QuantumIntercept.resolveRound({n:2,s:1,eveTaps:[{i:0,basis:'x'}]}, rng);
          return [r.sifted, r.sampleQBER, r.finalKey, r.stolen, r.eveHit, r.aBases.join(''), r.bBases.join(''), JSON.stringify(r.intercepted)]; }"""
        j = pg.evaluate(js, vec)
    assert j[0] == py["sifted"] and j[1] == py["sampleQBER"] and j[2] == py["finalKey"]
    assert j[3] == py["stolen"] and bool(j[4]) == py["eveHit"]
    assert j[5] == "".join(py["aBases"]) and j[6] == "".join(py["bBases"])
    assert j[7] == __import__("json").dumps(py["intercepted"])
```

- [ ] **Step 7: Run tests**

Run: `python -m pytest tests/test_qkd_engine.py tests/test_js_qkd_resolver.py -v`
Expected: PASS (parity holds; existing resolver test still green).

- [ ] **Step 8: Commit**

```bash
git add quantumbreach/qkd/engine.py quantumbreach/static/js/qkd.js tests/test_qkd_engine.py tests/test_js_qkd_resolver.py
git commit -m "feat(qkd): engine accepts explicit Eve taps + returns public visualization arrays"
```

---

### Task 2: Stage module skeleton — network map, log, intrusion meter

**Files:**
- Create: `quantumbreach/static/js/qkd-stage.js`
- Create: `quantumbreach/static/css/stage.css`
- Modify: `quantumbreach/templates/qkd.html` (load `stage.css` + `qkd-stage.js`; add a temporary test host is not needed — tests mount into a created div)
- Test: `tests/test_ui_qkd_stage.py` (create)

**Interfaces:**
- Produces: `window.QuantumStage.mount(rootEl, opts)` → a **handle** with methods `setPayload`, `streamQubits`, `onTap`, `log`, `setIntrusion`, `revealFile`, `playReplay`. This task delivers `mount`, `log`, `setIntrusion` (others are stubs filled in Tasks 3–4). `mount` builds: `.stage-net` (Alice/fiber/Bob/Eve-tap), `.stage-payload`, `.stage-intrusion > .stage-intrusion-fill`, `.stage-timer`, `.stage-qubits`, `.stage-log`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_ui_qkd_stage.py
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_ui_qkd_stage.py::test_stage_mounts_network_map_and_log -v`
Expected: FAIL — `QuantumStage is not defined`.

- [ ] **Step 3: Implement `qkd-stage.js` (skeleton)**

```javascript
// quantumbreach/static/js/qkd-stage.js
(function () {
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function mount(root, opts) {
    opts = opts || {};
    root.classList.add("stage");
    root.innerHTML = "";
    var net = el("div", "stage-net");
    var alice = el("div", "stage-node alice", "<span class='dev'>💻</span><span class='who'>Alice</span>");
    var fiber = el("div", "stage-fiber");
    var qubits = el("div", "stage-qubits");
    fiber.appendChild(qubits);
    var evetap = el("div", "stage-evetap", "<span class='dev'>🕵</span><span class='who'>Eve tap</span>");
    fiber.appendChild(evetap);
    var bob = el("div", "stage-node bob", "<span class='dev'>💻</span><span class='who'>Bob</span>");
    net.appendChild(alice); net.appendChild(fiber); net.appendChild(bob);

    var payload = el("div", "stage-payload");
    var timer = el("div", "stage-timer");
    var intrusion = el("div", "stage-intrusion");
    var ifill = el("div", "stage-intrusion-fill cool");
    intrusion.appendChild(ifill);
    var logBox = el("div", "stage-log");

    root.appendChild(payload); root.appendChild(net);
    root.appendChild(intrusion); root.appendChild(timer); root.appendChild(logBox);

    var tapCb = null;
    var handle = {
      root: root, qubitsEl: qubits, payloadEl: payload, logEl: logBox, timerEl: timer,
      log: function (line, kind) { var d = el("div", "log-line " + (kind || "info")); d.textContent = line; logBox.appendChild(d); logBox.scrollTop = logBox.scrollHeight; },
      setIntrusion: function (pct, abortLine) {
        var v = Math.max(0, Math.min(1, +pct || 0)); var line = abortLine == null ? 0.11 : abortLine;
        ifill.style.width = Math.round(v * 100) + "%";
        ifill.className = "stage-intrusion-fill " + (v > line ? "hot" : "cool");
      },
      setTimer: function (txt) { timer.textContent = txt; },
      onTap: function (cb) { tapCb = cb; },
      _emitTap: function (index, b) { if (tapCb) tapCb({ index: index, basis: b }); },
      setPayload: function () {}, streamQubits: function () {}, revealFile: function () {}, playReplay: function () {}
    };
    return handle;
  }
  window.QuantumStage = { mount: mount };
})();
```

- [ ] **Step 4: Add minimal stage CSS**

```css
/* quantumbreach/static/css/stage.css */
.stage { display: flex; flex-direction: column; gap: .6rem; }
.stage-net { display: grid; grid-template-columns: 1fr 3fr 1fr; align-items: center; gap: .4rem; }
.stage-node { text-align: center; }
.stage-node .dev { font-size: 1.8rem; display: block; }
.stage-node .who { font-size: .8rem; color: var(--muted, #9fb); }
.stage-fiber { position: relative; height: 64px; border-top: 2px dashed rgba(0,255,170,.4);
  border-bottom: 2px dashed rgba(0,255,170,.4); display: flex; align-items: center; overflow: hidden; }
.stage-qubits { position: relative; width: 100%; height: 100%; }
.stage-evetap { position: absolute; left: 50%; bottom: -4px; transform: translateX(-50%);
  text-align: center; font-size: .8rem; }
.stage-evetap .dev { font-size: 1.4rem; display: block; }
.stage-intrusion { height: 12px; background: rgba(255,255,255,.08); border-radius: 6px; overflow: hidden; }
.stage-intrusion-fill { height: 100%; transition: width .3s; }
.stage-intrusion-fill.cool { background: linear-gradient(90deg,#0fa,#0af); }
.stage-intrusion-fill.hot { background: linear-gradient(90deg,#fa0,#f33); }
.stage-timer { font-family: monospace; text-align: right; color: var(--muted,#9fb); }
.stage-log { max-height: 140px; overflow-y: auto; font-family: monospace; font-size: .8rem;
  background: rgba(0,0,0,.4); border: 1px solid rgba(0,255,170,.15); border-radius: 6px; padding: .4rem; }
.log-line.eve { color: #f6a; } .log-line.bob { color: #6cf; } .log-line.alert { color: #f55; }
.qubit { position: absolute; top: 50%; width: 18px; height: 18px; margin-top: -9px; border-radius: 50%;
  background: rgba(0,255,170,.85); box-shadow: 0 0 8px rgba(0,255,170,.8); text-align: center;
  font-size: 11px; line-height: 18px; cursor: default; }
.qubit.tappable { cursor: pointer; } .qubit.grabbed { background: #f6a; box-shadow: 0 0 10px #f6a; }
@media (prefers-reduced-motion: reduce) { .qubit { transition: none !important; animation: none !important; } }
```

- [ ] **Step 5: Load on the QKD page**

Add the stylesheet link in `quantumbreach/templates/app_base.html`'s `<head>`, right after the existing `shell.css` link (loaded app-wide; it's tiny and scoped by `.stage*` classes):

```html
  <link rel="stylesheet" href="{{ url_for('static', filename='css/stage.css') }}">
```

Then in `quantumbreach/templates/qkd.html`'s `{% block scripts %}`, load `qkd-stage.js` FIRST among the qkd scripts (before `qkd-multi.js`/`qkd-file.js`/`botnet.js`/`qkd-actions.js`/`qkd.js`), so the handle is defined before the games mount it. Confirm the current script order and insert accordingly.

- [ ] **Step 6: Run the test**

Run: `python -m pytest tests/test_ui_qkd_stage.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add quantumbreach/static/js/qkd-stage.js quantumbreach/static/css/stage.css quantumbreach/templates/qkd.html tests/test_ui_qkd_stage.py
git commit -m "feat(qkd-stage): network-map stage skeleton (nodes, fiber, tap, log, intrusion meter)"
```

---

### Task 3: Stage qubit stream + per-qubit tapping

**Files:**
- Modify: `quantumbreach/static/js/qkd-stage.js` (`streamQubits`, tapping)
- Test: `tests/test_ui_qkd_stage.py`

**Interfaces:**
- Consumes: the handle from Task 2.
- Produces: `handle.streamQubits(states, opts)` where `states` is an array `[{basis, glyph}]` (length n) — renders n `.qubit` tokens into `.stage-qubits`, positioned across the fiber; when `opts.tappable`, clicking a qubit opens a basis picker (⊕/⊗) and, on choice, marks it `.grabbed` and calls the `onTap` callback with `{index, basis}`. `handle.tapsSoFar()` returns the collected `[{i, basis}]`.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_ui_qkd_stage.py
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
          // simulate Eve tapping qubit index 1 and choosing 'x'
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_ui_qkd_stage.py::test_stage_streams_and_taps -v`
Expected: FAIL — `streamQubits` is a no-op; no `.qubit` elements.

- [ ] **Step 3: Implement `streamQubits` + tapping**

In `qkd-stage.js`, replace the `streamQubits`/`tapsSoFar` stubs on the handle (add a `_taps` array + a picker). Replace the `streamQubits: function () {}` stub and add helpers inside `mount` before `return handle;`:

```javascript
    var taps = [];
    handle.tapsSoFar = function () { return taps.slice(); };
    handle.streamQubits = function (states, sopts) {
      sopts = sopts || {};
      qubits.innerHTML = ""; taps = [];
      var n = states.length;
      states.forEach(function (st, i) {
        var q = el("span", "qubit" + (sopts.tappable ? " tappable" : ""));
        q.textContent = st.glyph || (st.basis === "x" ? "◇" : "○");
        q.style.left = (n <= 1 ? 50 : (i / (n - 1)) * 92 + 4) + "%";
        if (!(window.PhantomFX && window.PhantomFX.reduced && window.PhantomFX.reduced())) {
          q.style.transition = "transform .4s"; q.style.transform = "translateY(0)";
        }
        if (sopts.tappable) {
          q.addEventListener("click", function () {
            if (q.classList.contains("grabbed")) return;
            openPicker(q, i);
          });
        }
        qubits.appendChild(q);
      });
    };
    function openPicker(q, i) {
      var old = root.querySelector(".tap-picker"); if (old) old.remove();
      var pk = el("div", "tap-picker");
      ["+", "x"].forEach(function (b) {
        var btn = el("button", "tap-basis"); btn.type = "button";
        btn.setAttribute("data-basis", b); btn.textContent = b === "x" ? "⊗" : "⊕";
        btn.addEventListener("click", function () {
          q.classList.add("grabbed"); pk.remove();
          taps.push({ i: i, basis: b }); handle._emitTap(i, b);
        });
        pk.appendChild(btn);
      });
      q.appendChild(pk);
    }
```

Add CSS for the picker to `stage.css`:

```css
.tap-picker { position: absolute; top: -30px; left: -6px; display: flex; gap: 2px; z-index: 5; }
.tap-basis { width: 26px; height: 26px; border-radius: 4px; border: 1px solid rgba(0,255,170,.4);
  background: rgba(0,0,0,.85); color: #0fa; cursor: pointer; font-size: 14px; }
```

- [ ] **Step 4: Run the test**

Run: `python -m pytest tests/test_ui_qkd_stage.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add quantumbreach/static/js/qkd-stage.js quantumbreach/static/css/stage.css tests/test_ui_qkd_stage.py
git commit -m "feat(qkd-stage): streaming qubits + per-qubit tap with basis picker"
```

---

### Task 4: Stage file de-scramble reveal + synced replay

**Files:**
- Modify: `quantumbreach/static/js/qkd-stage.js` (`setPayload`, `revealFile`, `playReplay`)
- Test: `tests/test_ui_qkd_stage.py`

**Interfaces:**
- Consumes: the handle; `window.QkdFile` (`renderInto`/`scrambleInto`, already on `/qkd`).
- Produces: `handle.setPayload(mime, thumbText)` (shows a payload chip); `handle.revealFile(paneEl, bytes, mime, mode)` — `mode==='decrypt'` progressively renders then calls `QkdFile.renderInto`; `mode==='scramble'` calls `QkdFile.scrambleInto`; returns a Promise resolving when done. `handle.playReplay(replay, opts)` — renders qubits from `replay.aBases`, flashes `replay.eveTaps` as grabbed, lights `replay.sampleIndices`/`sampleErrors`, animates the intrusion meter to the sample error rate; resolves a Promise.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_ui_qkd_stage.py
@requires_browser
def test_stage_reveal_and_replay():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        out = pg.evaluate("""() => {
          var root = document.createElement('div'); document.body.appendChild(root);
          var h = QuantumStage.mount(root, {});
          var pane = document.createElement('div'); root.appendChild(pane);
          var bytes = new Uint8Array([67,76,65,83,83]); // 'CLASS'
          h.setPayload('text/plain', 'secret.txt');
          h.revealFile(pane, bytes, 'text/plain', 'decrypt');
          // replay: 4 qubits, Eve tapped #1 wrong, one sampled error
          h.playReplay({ n:4, aBases:['+','x','+','x'], bBases:['+','x','x','+'],
                         eveTaps:[{i:1,basis:'+'}], sampleIndices:[1], sampleErrors:[true] });
          return { paneText: pane.textContent.indexOf('CLASS') >= 0,
                   payload: root.querySelector('.stage-payload').textContent.indexOf('secret.txt') >= 0,
                   replayQubits: root.querySelectorAll('.stage-qubits .qubit').length };
        }""")
        assert out["paneText"] is True       # decrypt reveal rendered the text
        assert out["payload"] is True
        assert out["replayQubits"] == 4      # replay drew 4 qubits
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_ui_qkd_stage.py::test_stage_reveal_and_replay -v`
Expected: FAIL — stubs do nothing.

- [ ] **Step 3: Implement `setPayload`, `revealFile`, `playReplay`**

In `qkd-stage.js`, replace the three stubs on the handle:

```javascript
    handle.setPayload = function (mime, thumbText) {
      payload.innerHTML = "";
      var chip = el("div", "payload-chip");
      chip.innerHTML = "<span class='pf'>" + ((mime || "").indexOf("image") === 0 ? "🖼" : (mime === "application/pdf" ? "📄" : "🗎")) + "</span> ";
      chip.appendChild(document.createTextNode(thumbText || "payload"));
      payload.appendChild(chip);
    };
    handle.revealFile = function (paneEl, bytes, mime, mode) {
      if (!paneEl || !window.QkdFile) return Promise.resolve();
      var reduced = window.PhantomFX && window.PhantomFX.reduced && window.PhantomFX.reduced();
      if (mode === "scramble") { window.QkdFile.scrambleInto(paneEl, bytes || null); return Promise.resolve(); }
      paneEl.classList.add("decrypting");
      return new Promise(function (resolve) {
        var done = function () { paneEl.classList.remove("decrypting"); window.QkdFile.renderInto(paneEl, bytes, mime); resolve(); };
        if (reduced) { done(); } else { setTimeout(done, 500); }
      });
    };
    handle.playReplay = function (replay, ropts) {
      replay = replay || {};
      var states = (replay.aBases || []).map(function (b) { return { basis: b }; });
      handle.streamQubits(states, { tappable: false });
      var qs = qubits.querySelectorAll(".qubit");
      (replay.eveTaps || []).forEach(function (t) { if (qs[t.i]) qs[t.i].classList.add("grabbed"); });
      (replay.sampleIndices || []).forEach(function (idx, k) {
        if (qs[idx]) qs[idx].classList.add((replay.sampleErrors || [])[k] ? "err" : "ok");
      });
      var errs = (replay.sampleErrors || []).filter(Boolean).length;
      var rate = (replay.sampleIndices || []).length ? errs / replay.sampleIndices.length : 0;
      handle.setIntrusion(rate, 0.11);
      handle.log("Replay: " + (replay.eveTaps || []).length + " qubits tapped, intrusion " + Math.round(rate * 100) + "%", "eve");
      return Promise.resolve();
    };
```

Add CSS to `stage.css`:

```css
.payload-chip { display: inline-flex; align-items: center; gap: .3rem; padding: .3rem .6rem;
  border: 1px solid rgba(0,255,170,.3); border-radius: 6px; }
.qubit.err { background: #f55 !important; box-shadow: 0 0 10px #f55 !important; }
.qubit.ok { background: #0f8 !important; }
.decrypting { filter: blur(4px); opacity: .6; transition: filter .5s, opacity .5s; }
```

- [ ] **Step 4: Run the test**

Run: `python -m pytest tests/test_ui_qkd_stage.py -v`
Expected: PASS (all stage tests).

- [ ] **Step 5: Commit**

```bash
git add quantumbreach/static/js/qkd-stage.js quantumbreach/static/css/stage.css tests/test_ui_qkd_stage.py
git commit -m "feat(qkd-stage): file de-scramble reveal + secrecy-safe synced replay"
```

---

## Phase 2 — Solo timed heist

### Task 5: Wire the stage into the Solo game

**Files:**
- Modify: `quantumbreach/templates/qkd.html` (Solo section: add `#qkd-stage` host; keep panels)
- Modify: `quantumbreach/static/js/qkd.js` (Solo `DOMContentLoaded`: mount stage, replace photon animation, feed taps, reveal)
- Test: `tests/test_ui_qkd.py`, `tests/test_ui_qkd_file.py`

**Interfaces:**
- Consumes: `QuantumStage.mount`, the handle (`setPayload`/`streamQubits`/`onTap`/`setIntrusion`/`revealFile`), `QuantumIntercept.resolveRound` (now taking `eveTaps`).
- Produces: the Solo game rendered on the stage; when the human plays Eve, her taps drive `resolveRound({n, s, eveTaps})`; Bob's pane reveals via `handle.revealFile`.

- [ ] **Step 1: Add the stage host to `qkd.html`**

In the Solo block (`#qkd-solo`), replace the old photon strip `<div id="qkd-photons" ...></div>` with a stage host:

```html
  <div id="qkd-stage"></div>
```

Keep the role chips, Alice/Eve/Bob panels, `#qkd-reveal`, `#bob-file`/`#eve-file`, and `#qkd-score`. (The intrusion meter now lives in the stage; the old `.qber` bar `#qber-fill`/`#qber-text` may be removed or hidden — remove them and the code that writes to them in Step 2.)

- [ ] **Step 2: Mount + drive the stage in `qkd.js`**

In the Solo `DOMContentLoaded` block: after resolving the `#qkd-solo` element, mount the stage into `#qkd-stage`; replace the `animate(result)` body to call `stage.streamQubits` from `result.aBases` and `stage.setIntrusion(result.sampleQBER, 0.11)`; on role select as Eve, call `stage.streamQubits(states, {tappable:true})` and `stage.onTap(...)` to collect taps into `pending.eveTaps`; on Alice send, `stage.setPayload(...)`; in `finish()`, call `stage.revealFile(document.getElementById('bob-file'), bobPt, mime, decision==='keep' && !result.eveHit ? 'decrypt' : 'scramble')`. Concretely, replace `animate`:

```javascript
    var stage = window.QuantumStage ? window.QuantumStage.mount(document.getElementById("qkd-stage"), {}) : null;
    function animate(result) {
      if (!stage) return;
      var states = (result.aBases || []).map(function (b) { return { basis: b }; });
      stage.streamQubits(states, { tappable: false });
      stage.setIntrusion(result.sampleQBER, window.QuantumIntercept.ABORT);
      stage.log("Round resolved — intrusion " + Math.round(result.sampleQBER * 100) + "%", "info");
    }
```

For the Eve human path: when `myRole === "eve"` in `startRound`, build a provisional qubit stream from a fresh set (length `pending.n`) and let her tap; collect taps:

```javascript
    // inside startRound(), after computing pending.n for the eve branch:
    if (myRole === "eve" && stage) {
      pending.eveTaps = [];
      var evStates = []; for (var qi = 0; qi < pending.n; qi++) evStates.push({ basis: "?" });
      stage.streamQubits(evStates, { tappable: true });
      stage.onTap(function (t) { pending.eveTaps.push({ i: t.index, basis: t.basis });
        stage.log("Eve taps qubit " + t.index + " in " + (t.basis === "x" ? "⊗" : "⊕"), "eve"); });
    }
```

And in the Eve resolve path (`.ev` chips are replaced by a "Commit intercept" flow, or keep a "Resolve" button), pass `eveTaps`:

```javascript
    // where the Eve branch resolves the round, use eveTaps instead of a random p:
    pending.result = window.QuantumIntercept.resolveRound({ n: pending.n, s: pending.s, eveTaps: pending.eveTaps || [] }, Math.random);
```

Wire the Bob reveal in `finish()` to use the stage:

```javascript
    // in finish(), replacing the direct QkdFile calls for #bob-file:
    if (currentPayload && stage) {
      var aBits = result.aKeyFinal || [];
      var ct = QkdFile.encrypt(currentPayload.bytes, aBits);
      var bobEl = document.getElementById("bob-file");
      if (decision === "keep" && !result.eveHit) stage.revealFile(bobEl, QkdFile.decrypt(ct, result.bKeyFinal || []), currentPayload.mime, "decrypt");
      else if (decision === "keep") stage.revealFile(bobEl, ct, currentPayload.mime, "scramble");
      else bobEl.textContent = "(aborted — no delivery)";
      var eveEl = document.getElementById("eve-file");
      if (result.fileCracked) stage.revealFile(eveEl, QkdFile.decrypt(ct, aBits), currentPayload.mime, "decrypt");
      else stage.revealFile(eveEl, ct, currentPayload.mime, "scramble");
    }
```

(Adapt to the exact current variable names in `qkd.js` — the Task 10/13 reveal block already computes `ct`/`aBits`; route it through `stage.revealFile` instead of `QkdFile.renderInto`/`scrambleInto` directly. Remove references to the deleted `#qber-fill`/`#qber-text`.)

- [ ] **Step 2b: Remove dead photon/QBER code**

Grep the Solo block for `qkd-photons`, `qber-fill`, `qber-text`, `photon` and remove the now-dead references (the stage owns the visualization). Keep `#qkd-reveal`, score, panels.

- [ ] **Step 3: Update/confirm Solo tests**

`tests/test_ui_qkd.py` and `tests/test_ui_qkd_file.py` reference the solo flow. Update any assertion that targeted `#qkd-photons`/`#qber-fill` to the stage (`#qkd-stage .stage-qubits .qubit`, `.stage-intrusion-fill`). The Task-10 file-reveal test (`test_solo_round_reveals_file`) must still pass — the file still renders into `#bob-file` (now via `stage.revealFile`). Add a focused assertion that the stage renders qubits after a round:

```python
# in tests/test_ui_qkd.py, extend the solo round test (or add one):
# after playing a round, assert the stage drew qubits and the intrusion meter exists
assert pg.evaluate("() => document.querySelectorAll('#qkd-stage .stage-qubits .qubit').length") > 0
assert pg.evaluate("() => !!document.querySelector('#qkd-stage .stage-intrusion-fill')")
```

- [ ] **Step 4: Run Solo tests**

Run: `python -m pytest tests/test_ui_qkd.py tests/test_ui_qkd_file.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add quantumbreach/templates/qkd.html quantumbreach/static/js/qkd.js tests/test_ui_qkd.py tests/test_ui_qkd_file.py
git commit -m "feat(qkd): Solo game runs on the network-map stage (qubit stream + Eve taps + reveal)"
```

---

### Task 6: Solo heist framing — timer + tap-driven Eve + de-scramble drama

**Files:**
- Modify: `quantumbreach/static/js/qkd.js` (countdown timer, Eve commit, mission copy)
- Modify: `quantumbreach/templates/qkd.html` (Eve panel: replace intercept chips with tap+commit; a "MISSION" heading)
- Test: `tests/test_ui_qkd.py`

**Interfaces:**
- Consumes: the stage handle (`setTimer`, `tapsSoFar`), `pending.eveTaps`.
- Produces: a countdown shown via `stage.setTimer`; Eve taps during the countdown, then a "Commit" resolves; on win the file de-scrambles (already wired). Timer expiry auto-resolves with taps so far.

- [ ] **Step 1: Write/adjust the failing test**

```python
# append to tests/test_ui_qkd.py
@requires_browser
def test_solo_eve_taps_drive_the_round():
    from tests.browser_utils import live_server, browser_page
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-solo")
        pg.click('.role[data-role="eve"]')
        pg.wait_for_selector('#qkd-stage .stage-qubits .qubit', timeout=5000)
        # tap the first qubit, pick wrong-ish basis, then commit
        pg.click('#qkd-stage .stage-qubits .qubit:nth-child(1)')
        pg.click('#qkd-stage .tap-picker [data-basis="x"]')
        pg.click('#ev-commit')
        # a reveal happened (computer Bob decided); score chip updated
        pg.wait_for_function("() => document.getElementById('qkd-score').textContent.indexOf('Score') >= 0", timeout=5000)
        assert pg.evaluate("() => document.querySelectorAll('#qkd-stage .qubit.grabbed').length") >= 1
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_ui_qkd.py::test_solo_eve_taps_drive_the_round -v`
Expected: FAIL — no `#ev-commit`; intercept chips still present.

- [ ] **Step 3: Replace Eve's intercept chips with tap+commit in `qkd.html`**

In `#panel-eve`, remove the `.ev` intercept chips (`data-p`) and add a commit button (keep the botnet panel from v3):

```html
  <div id="panel-eve" class="qkd-panel" hidden>
    <p class="muted">Tap qubits on the wire and pick a measuring basis (⊕/⊗). Guess the basis wrong and you disturb the qubit — Bob will see the error.</p>
    <button class="btn" id="ev-commit" type="button">Commit intercept</button>
    <!-- existing botnet panel (#ev-w slider, #ev-grid, etc.) stays here -->
  </div>
```

- [ ] **Step 4: Wire the timer + commit in `qkd.js`**

In the Eve setup (`startRound` eve branch, from Task 5), start a countdown and wire `#ev-commit`:

```javascript
    var evCommit = document.getElementById("ev-commit");
    if (evCommit) evCommit.addEventListener("click", function () {
      if (evTimer) { clearInterval(evTimer); evTimer = null; }
      pending.p = 0;  // taps govern; p unused
      resolveAndAwaitBob();  // resolves with pending.eveTaps
    });
    // countdown (module-scoped `evTimer`), started when Eve's stream begins:
    function startEveCountdown(seconds) {
      var left = seconds; if (stage) stage.setTimer("⏱ 0:" + ("0" + left).slice(-2));
      evTimer = setInterval(function () {
        left--; if (stage) stage.setTimer("⏱ 0:" + ("0" + Math.max(0, left)).slice(-2));
        if (left <= 0) { clearInterval(evTimer); evTimer = null; pending.p = 0; resolveAndAwaitBob(); }
      }, 1000);
    }
```

Call `startEveCountdown(20)` right after `stage.streamQubits(evStates, {tappable:true})` in the eve branch. Ensure `resolveAndAwaitBob` uses `eveTaps` (Task 5). Add a "MISSION" heading via `stage.log("MISSION: intercept " + (currentPayloadName||'the file'), "alert")` at round start.

- [ ] **Step 5: Run the test**

Run: `python -m pytest tests/test_ui_qkd.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add quantumbreach/templates/qkd.html quantumbreach/static/js/qkd.js tests/test_ui_qkd.py
git commit -m "feat(qkd): Solo timed heist — Eve taps qubits on a countdown, commit resolves"
```

---

## Phase 3 — Multiplayer taps + secrecy-safe replay

### Task 7: Server accepts Eve's taps and resolves with them

**Files:**
- Modify: `quantumbreach/qkd/service.py` (`_clean_action` eve branch; `advance()` eve_move branch)
- Test: `tests/test_qkd_multiplayer.py`

**Interfaces:**
- Consumes: `resolve_round` `eveTaps` (Task 1).
- Produces: `_clean_action("eve", action)` returns `{"p", "workers", "eveTaps": [{"i","basis"}]}` (taps validated: `i` int in `[0, ???]` — n isn't known here, so clamp to a sane max; `basis` in `+/x`; dedup; cap length at 128). `advance()` stores `eveTaps` in `cfg["eve"]` and passes it into `resolve_round`.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_qkd_multiplayer.py
def test_mp_eve_taps_drive_resolution(app):
    # Human Eve submits explicit taps; verify they land in cfg and the round resolves with them.
    c, code = _solo_game(app, "eve")   # computer Alice auto-plays -> eve_move (human Eve)
    with app.app_context():
        db = get_db()
        g = service._game(db, code)
        cfg = json.loads(g["config"] or "{}")
        cfg["alice"] = {"n": 6, "s": 0, "file": "mission"}
        service._set_config(db, g["id"], cfg)
        db.commit()
    # tap every qubit in the WRONG-ish basis to force interception; malformed entries dropped
    taps = [{"i": i, "basis": "x"} for i in range(6)] + [{"i": 999, "basis": "z"}, {"bad": 1}]
    c.post(f"/api/qkd/game/{code}/act", json={"action": {"taps": taps, "workers": 0}})
    cfg = _raw_cfg(app, code)
    assert isinstance(cfg["eve"]["eveTaps"], list)
    assert all(t["basis"] in ("+", "x") for t in cfg["eve"]["eveTaps"])   # junk dropped
    assert cfg["lastResult"]["eveHit"] is True                            # taps caused interception
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_qkd_multiplayer.py::test_mp_eve_taps_drive_resolution -v`
Expected: FAIL — `eveTaps` not stored; `eveHit` False (taps ignored).

- [ ] **Step 3: Extend `_clean_action` eve branch**

In `quantumbreach/qkd/service.py` `_clean_action`, replace the eve branch:

```python
        if role == "eve":
            out = {"p": min(1.0, max(0.0, float(action.get("p", 0) or 0)))}
            w = action.get("workers", 0)
            try:
                out["workers"] = min(100, max(0, int(w)))
            except (TypeError, ValueError):
                out["workers"] = 0
            raw = action.get("taps")
            if isinstance(raw, list):
                seen, taps = set(), []
                for t in raw[:512]:
                    if not isinstance(t, dict):
                        continue
                    b = t.get("basis")
                    try:
                        idx = int(t.get("i"))
                    except (TypeError, ValueError):
                        continue
                    if b in ("+", "x") and 0 <= idx < 512 and idx not in seen:
                        seen.add(idx); taps.append({"i": idx, "basis": b})
                    if len(taps) >= 128:
                        break
                out["eveTaps"] = taps
            return out
```

- [ ] **Step 4: Thread `eveTaps` into `advance()` + resolve**

In `advance()`'s `eve_move` branch, store and use the taps:

```python
        elif phase == "eve_move":
            cfg["eve"] = {"p": float(act.get("p", 0) or 0), "workers": int(act.get("workers", 0) or 0)}
            if isinstance(act.get("eveTaps"), list):
                cfg["eve"]["eveTaps"] = act["eveTaps"]
            resolve_cfg = {"n": cfg["alice"]["n"], "s": cfg["alice"]["s"], "p": cfg["eve"]["p"]}
            if cfg["eve"].get("eveTaps") is not None:
                resolve_cfg["eveTaps"] = cfg["eve"]["eveTaps"]
            result = resolve_round(resolve_cfg, random.random)
            cfg["result"] = result
            cur = db.execute(
                "UPDATE qkd_games SET config=?, phase='bob_decision', updated_at=CURRENT_TIMESTAMP "
                "WHERE id=? AND phase='eve_move'", (json.dumps(cfg), gid))
            db.commit()
            if cur.rowcount == 0:
                continue
```

(Keep the rest of the branch identical; only the cfg["eve"] build + resolve_cfg change.)

- [ ] **Step 5: Run tests**

Run: `python -m pytest tests/test_qkd_multiplayer.py -v`
Expected: PASS (new + all existing).

- [ ] **Step 6: Commit**

```bash
git add quantumbreach/qkd/service.py tests/test_qkd_multiplayer.py
git commit -m "feat(qkd-mp): server accepts + resolves Eve's explicit per-qubit taps"
```

---

### Task 8: Secrecy-safe `lastResult.replay`

**Files:**
- Modify: `quantumbreach/qkd/service.py` (`_resolve_scoring` builds `lastResult["replay"]`; `game_state` passes it through)
- Test: `tests/test_qkd_multiplayer.py`

**Interfaces:**
- Consumes: `result` (now with `aBases`, `bBases`, `sampleIndices`, `sampleErrors` from Task 1), `cfg["eve"].get("eveTaps")`.
- Produces: `lastResult["replay"] = {"n", "aBases", "bBases", "eveTaps", "sampleIndices", "sampleErrors"}` — public only, no raw key bits. Present in `game_state` at resolve/ended (same visibility path as the rest of `lastResult`).

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_qkd_multiplayer.py
def test_mp_replay_is_present_and_leaks_no_key_bits(app):
    c, code = _play_full_round_human_bob(app, "mission", eve_workers=0, decision="keep", eve_p=1)
    st = c.get(f"/api/qkd/game/{code}").get_json()
    rep = st["lastResult"]["replay"]
    assert rep["n"] >= 1
    assert len(rep["aBases"]) == rep["n"] and len(rep["bBases"]) == rep["n"]
    assert "sampleErrors" in rep and "sampleIndices" in rep
    # secrecy: the serialized state must not contain raw key-bit arrays
    body = c.get(f"/api/qkd/game/{code}").get_data(as_text=True)
    assert "aBits" not in body and "bBits" not in body and "aKeyFinal" not in body
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_qkd_multiplayer.py::test_mp_replay_is_present_and_leaks_no_key_bits -v`
Expected: FAIL — no `replay` key.

- [ ] **Step 3: Build the replay in `_resolve_scoring`**

In `_resolve_scoring`, when building `cfg["lastResult"]`, add a `replay` sub-dict from the public fields of `result` (and Eve's taps from cfg):

```python
    cfg["lastResult"]["replay"] = {
        "n": result.get("n"),
        "aBases": result.get("aBases", []),
        "bBases": result.get("bBases", []),
        "eveTaps": (cfg.get("eve") or {}).get("eveTaps", []),
        "sampleIndices": result.get("sampleIndices", []),
        "sampleErrors": result.get("sampleErrors", []),
    }
```

`game_state` already serializes `lastResult` at resolve/ended (the per-seat rewrite from the file feature only touches `lastResult["file"]`), so `replay` rides along. Confirm nothing in `game_state` strips it and that `cfg["result"]` (which now holds `aBases`/`bBases` but is NOT serialized) never enters the view.

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_qkd_multiplayer.py -v`
Expected: PASS. Confirm the existing `test_state_hides_secrets_in_lobby` (asserts `aBits`/`aBases` absent in lobby) still passes — `aBases` only appears inside `lastResult.replay` at resolve/ended, not before, and raw `aBits` never.

- [ ] **Step 5: Commit**

```bash
git add quantumbreach/qkd/service.py tests/test_qkd_multiplayer.py
git commit -m "feat(qkd-mp): secrecy-safe lastResult.replay (public bases + sample errors, no key bits)"
```

---

### Task 9: Multiplayer client — Eve tap panel + synced replay on the stage

**Files:**
- Modify: `quantumbreach/templates/qkd.html` (MP: `#qm-stage` host in `#qm-play`)
- Modify: `quantumbreach/static/js/qkd-multi.js` (Eve controls submit taps; `playReplay` at resolve)
- Test: `tests/test_ui_qkd_multi.py`

**Interfaces:**
- Consumes: `QuantumStage.mount`, the handle, the server `lastResult.replay`.
- Produces: MP Eve's control shows a tappable qubit stream (mounted stage) and a **Commit** submitting `{taps, workers}`; on resolve every client calls `handle.playReplay(st.lastResult.replay)` then the per-seat file reveal.

- [ ] **Step 1: Add the MP stage host to `qkd.html`**

In `#qm-play`, add before `#qm-controls`:

```html
    <div id="qm-stage"></div>
```

(The old `#qm-photons`/`#qm-qber` may stay hidden or be removed; remove the code writing to them in Step 3.)

- [ ] **Step 2: Write the failing test**

```python
# append to tests/test_ui_qkd_multi.py
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
```

- [ ] **Step 3: Wire the MP stage in `qkd-multi.js`**

Mount a stage once (module-scoped `stage`) when entering play, render Eve's tappable stream in the `eve_move` control, submit `taps`, and play the replay at resolve. In `enter()` add:

```javascript
    if (window.QuantumStage && !stage) stage = window.QuantumStage.mount($("qm-stage"), {});
```

Replace the `eve_move` control (from the prior MP feature) so it taps instead of setting `p`:

```javascript
    } else if (st.phase === "eve_move") {
      if (keepEve) return;
      box.innerHTML =
        '<p class="muted">Tap qubits on the wire and pick ⊕/⊗. Wrong basis disturbs the qubit.</p>' +
        '<label>Workers <span id="qm-w-val">0</span><input id="qm-w" type="range" min="0" max="100" value="0"></label>' +
        '<div id="qm-grid" class="worker-grid"></div>' +
        '<p class="muted"><span id="qm-rate">0</span> keys/s · ETA <span id="qm-eta">—</span></p>' +
        '<button class="btn" id="qm-eve-go" type="button">Commit intercept</button>';
      // Display a fixed-length tappable stream; the server clamps/validates the real indices.
      var states = []; for (var qi = 0; qi < 24; qi++) states.push({ basis: "?" });
      if (stage) { var taps = []; stage.streamQubits(states, { tappable: true });
        stage.onTap(function (t) { taps.push({ i: t.index, basis: t.basis });
          stage.log("Eve taps qubit " + t.index + " in " + (t.basis === "x" ? "⊗" : "⊕"), "eve"); });
        window.__qmTaps = taps; }
      $("qm-w").addEventListener("input", function () { $("qm-w-val").textContent = $("qm-w").value;
        if (window.PhantomBotnet) window.PhantomBotnet.renderPanel({ grid: $("qm-grid"), rate: $("qm-rate"), eta: $("qm-eta") }, parseInt($("qm-w").value,10)||0, 24, 0); });
      $("qm-eve-go").addEventListener("click", function () {
        act({ taps: window.__qmTaps || [], workers: parseInt($("qm-w").value, 10) || 0 }); });
    } else if (st.phase === "bob_decision") {
```

In the `st.lastResult` block, call the replay before the file reveal:

```javascript
    if (st.lastResult) {
      var lr = st.lastResult;
      rv.textContent = "Round " + lr.round + ": " + (lr.eveHit ? "Eve intercepted" : "clean") +
        ", QBER " + Math.round(lr.sampleQBER * 100) + "%, key " + lr.finalKey + " bits, Bob " + lr.bobDecision.toUpperCase() + ".";
      if (stage && lr.replay && lr.round !== lastReplayRound) { lastReplayRound = lr.round; stage.playReplay(lr.replay); }
      revealFile(lr, st.yourRole);
    }
```

Add a module-scoped `lastReplayRound = null;` and route `revealFile`'s pane render through the stage if desired (or keep `QkdFile` directly — either satisfies the reveal). Remove writes to the old `#qm-photons`/`#qm-qber`.

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_ui_qkd_multi.py -v`
Expected: PASS (new + existing MP tests). Adjust any existing MP test that referenced `#qm-photons`/`#qm-qber` to the stage.

- [ ] **Step 5: Commit**

```bash
git add quantumbreach/templates/qkd.html quantumbreach/static/js/qkd-multi.js tests/test_ui_qkd_multi.py
git commit -m "feat(qkd-mp): Eve taps qubits + synced replay on the shared stage"
```

---

## Phase 4 — Polish, screenshots, docs

### Task 10: Reduced-motion + copy/scoring polish + full-suite gate

**Files:**
- Modify: `quantumbreach/static/js/qkd-stage.js` (reduced-motion guards), `quantumbreach/static/css/stage.css` (polish)
- Test: full suite

**Interfaces:** none new.

- [ ] **Step 1: Confirm reduced-motion**

Verify every animation in `qkd-stage.js` checks `window.PhantomFX && PhantomFX.reduced && PhantomFX.reduced()` (or the CSS `@media (prefers-reduced-motion: reduce)` covers it) and degrades to instant end-state. If `PhantomFX.reduced` doesn't exist, use `window.matchMedia('(prefers-reduced-motion: reduce)').matches`. Add a small assertion in `tests/test_ui_qkd_stage.py`:

```python
@requires_browser
def test_stage_reduced_motion_still_renders_endstate():
    with live_server() as base, browser_page() as pg:
        pg.emulate_media(reduced_motion="reduce")
        pg.goto(base + "/qkd", wait_until="networkidle")
        ok = pg.evaluate("""() => { var r=document.createElement('div'); document.body.appendChild(r);
          var h=QuantumStage.mount(r,{}); h.streamQubits([{basis:'+'},{basis:'x'}],{tappable:false});
          return r.querySelectorAll('.qubit').length; }""")
        assert ok == 2
```

- [ ] **Step 2: Run the targeted UI + engine suites**

Run: `python -m pytest tests/test_ui_qkd_stage.py tests/test_ui_qkd.py tests/test_ui_qkd_multi.py tests/test_qkd_engine.py tests/test_qkd_multiplayer.py tests/test_js_qkd_resolver.py -v`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add quantumbreach/static/js/qkd-stage.js quantumbreach/static/css/stage.css tests/test_ui_qkd_stage.py
git commit -m "polish(qkd-stage): reduced-motion end-state + visual polish"
```

---

### Task 11: Browser-drive screenshots + docs + memory

**Files:**
- Modify: `.claude/skills/run-phantomq/drive.py` (screenshot the heist + replay)
- Modify: `docs/QKD_MULTIPLAYER.md`, `docs/FOLLOWUPS.md`
- Test: drive script

- [ ] **Step 1: Extend `drive.py`**

Replace the QKD tour steps to screenshot the new stage: Solo — pick Eve, tap ≥1 qubit + basis, commit, screenshot the network map + de-scramble (`qkd-solo-heist.png`); Multiplayer — create as Eve, tap + commit, screenshot the replay (`qkd-mp-replay.png`). Use the selectors from Tasks 5/6/9 (`#qkd-stage .stage-qubits .qubit`, `.tap-picker [data-basis]`, `#ev-commit`, `#qm-stage`, `#qm-eve-go`). Every screenshot non-blank.

- [ ] **Step 2: Run the drive script**

Run: `python .claude/skills/run-phantomq/drive.py --out "$TMP/heist-shots" --port 8145`
Expected: exit 0; `qkd-solo-heist.png` + `qkd-mp-replay.png` non-blank. Fix any changed selector.

- [ ] **Step 3: Update docs**

In `docs/QKD_MULTIPLAYER.md`, add a paragraph: the game is now a network-map heist where Eve taps individual qubits (picking a basis), the file de-scrambles for the winner, and multiplayer plays a synchronized replay of the interception. In `docs/FOLLOWUPS.md`, note any deferred polish (e.g. per-file-type reveal refinements, computer-Eve token taps).

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/run-phantomq/drive.py docs/QKD_MULTIPLAYER.md docs/FOLLOWUPS.md
git commit -m "docs+drive(qkd): heist screenshots + updated multiplayer docs"
```

---

## Final verification

- [ ] Full suite in the background: `python -m pytest -q` — all pass.
- [ ] Grep the served MP state for key leaks: `game_state` never serializes `aBits`/`bBits`/`aKeyFinal`; `replay` carries only bases + sample errors.
- [ ] Run the app (`run-phantomq`) and eyeball the Solo heist + MP replay screenshots — non-blank, the network map + tapping + de-scramble read correctly.
- [ ] Update memory (`phantomq-project.md` + `MEMORY.md`) with the redesign once merged.

## Self-Review notes (coverage map)

- Spec §1 shared stage → Tasks 2,3,4 (skeleton/log/intrusion; stream+tap; reveal+replay). §2 engine taps → Task 1. §3 Solo timed heist → Tasks 5,6. §4 MP taps + replay → Tasks 7 (taps),8 (replay data),9 (client). Secrecy (public bases + sample errors, no key bits) → Task 8 + its leak test. Reduced-motion → Task 10. Testing (engine parity + stage-unit + Solo + MP + drive) → per task + final. Docs/memory → Task 11 + final. Global constraints (no Node, RNG parity, atomicity, no key-bit serialization) carried in Global Constraints and enforced in Tasks 1,7,8.
