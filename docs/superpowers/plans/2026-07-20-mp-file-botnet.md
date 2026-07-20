# Multiplayer File-Heist + Botnet UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Quantum Intercept's file-heist + Eve botnet into same-network multiplayer — server-authoritatively decides per seat who sees the decrypted file and scores Eve's heist bonus, and `qkd-multi.js` gains Alice's sample picker, Eve's botnet panel, and a per-seat file reveal.

**Architecture:** In-place extension of the existing server-authoritative QKD phase machine (`quantumbreach/qkd/service.py`) and its polling client (`static/js/qkd-multi.js`). The server computes `fileCracked` (reusing `qkd/botnet.py`), applies the heist bonus through the unchanged shared `engine.score_round`, and hands each seat only its own `fileVisible` + the real sample id (earners only). The client renders the real file (`QkdFile.renderInto`) or scrambled bytes (`QkdFile.scrambleInto`). The Solo botnet-grid render is extracted into a shared `PhantomBotnet.renderPanel` both modes call.

**Tech Stack:** Python 3, Flask, Waitress, SQLite (`sqlite3` stdlib), Jinja2, vanilla ES5-style JS (no build step), pytest, Playwright (system Chrome via `tests/browser_utils.py`).

## Global Constraints

- **No Node / no build step.** JS ships as plain `<script>` files exposing `window.*`; logic as pure functions.
- **No external network at runtime.** No CDNs/fonts/remote calls.
- **Server-authoritative visibility.** No BB84 key material (raw bit/base arrays) is ever serialized to the client. Each seat receives only its own `fileVisible`; the real sample id reaches only an earner.
- **Bundled samples only** in multiplayer (mission/codes/photo). No uploads.
- **Heist bonus via the existing `engine.score_round`** (`HEIST_BONUS` on KEEP when `result["fileCracked"]`) — no scoring fork. Eve's *reveal* is cracked-based (any decision); her *score* bonus is KEEP-only.
- **Atomicity unchanged.** The guarded `UPDATE … WHERE phase='<current>'` + `rowcount==0 → return/continue` pattern in `service.py` (concurrency fix, base commit `a42ea98`) must not regress; only add fields to `cfg`.
- **Run the app** with `python app.py`; **tests** with `python -m pytest`.
- **Branch:** `mp-file-botnet` (already cut off `main`; spec committed there).
- **Commit trailers** (every commit):
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EYTvUotg1ojVaavLMFNwo5
  ```
- **Browser tests use the real harness** (`tests/browser_utils.py`): `from tests.browser_utils import live_server, browser_page, requires_browser`, `@requires_browser`, `with live_server() as base, browser_page() as pg:`. NOT pytest-fixture `(live_server, page)` signatures. The FULL suite (~3.5 min, real Chrome) exceeds a 2-min command limit — run only small targeted files in the foreground.

---

## File Structure

- **Modify** `quantumbreach/qkd/service.py` — `_resolve_scoring` (file_cracked + heist bonus + `lastResult.file`); `game_state` (per-seat `fileVisible` rewrite). Add `from . import botnet, files`.
- **Modify** `quantumbreach/static/js/botnet.js` — add `renderPanel(els, workers, keyBitsEstimate, interceptP)` to `window.PhantomBotnet`.
- **Modify** `quantumbreach/static/js/qkd.js` — refactor Solo `renderBotnet()` to call `PhantomBotnet.renderPanel` (behavior-preserving).
- **Modify** `quantumbreach/static/js/qkd-multi.js` — Alice sample `<select>`; Eve botnet panel (intercept-select + workers slider + grid + Commit); per-seat file reveal pane.
- **Modify** `quantumbreach/templates/qkd.html` — add reveal-pane container markup inside `#qkd-multi` if a stable host element is needed (the reveal pane is created in JS; a `#qm-file-view` host is added here).
- **Test** `tests/test_qkd_multiplayer.py` — server scoring + per-seat visibility.
- **Test** `tests/test_ui_qkd_multi.py` — client picker/panel/reveal render.
- **Modify** `.claude/skills/run-phantomq/drive.py` — screenshot the MP file/botnet flow.

---

## Task 1: Server — file_cracked, heist bonus, and `lastResult.file`

**Files:**
- Modify: `quantumbreach/qkd/service.py` (`_resolve_scoring`, ~lines 247-268; add imports near the top with the existing `from . import service`-style imports)
- Test: `tests/test_qkd_multiplayer.py`

**Interfaces:**
- Consumes: `cfg["alice"]["file"]` (sample id, stored by v3 Task 14), `cfg["eve"]["workers"]` (int, stored by v3 Task 14), `result` (BB84 resolution dict with `finalKey`, `eveHit`, `sampleQBER`, `stolen`, `sifted`), `botnet.crackable_within(key_bits, workers, window_seconds)`, `botnet.ROUND_WINDOW`, `files.SAMPLES` (dict `{id: {"mime":..., "file":...}}`), `engine.score_round` (already awards `HEIST_BONUS` on KEEP when `result["fileCracked"]`).
- Produces: `cfg["lastResult"]["file"] = {"sample": <id|None>, "mime": <str|None>, "cracked": <bool>}`; Eve's seat score includes the heist bonus on a KEEP when cracked.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_qkd_multiplayer.py  (json/get_db/service already imported at top of the file)
from quantumbreach.qkd.engine import resolve_round
import random

def _play_full_round_human_bob(app, alice_file, eve_workers, decision):
    """Seat a HUMAN Bob (computer Alice+Eve auto-advance to bob_decision), then override cfg
    so file/workers/key are deterministic, and let Bob decide. Returns (client, code); the
    client's cookie IS Bob's seat identity, so c.get(state) yields Bob's per-seat view."""
    c, code = _solo_game(app, "bob")
    with app.app_context():
        db = get_db()
        g = service._game(db, code)
        cfg = json.loads(g["config"] or "{}")
        cfg["alice"] = {"n": 8, "s": 0, "file": alice_file}          # short key + chosen sample
        cfg["eve"] = {"p": 0, "workers": eve_workers}                # clean channel; N workers
        cfg["result"] = resolve_round({"n": 8, "s": 0, "p": 0}, random.Random(1).random)
        service._set_config(db, g["id"], cfg)
        db.commit()
    c.post(f"/api/qkd/game/{code}/act", json={"action": {"decision": decision}})
    return c, code

def _raw_cfg(app, code):
    with app.app_context():
        return json.loads(service._game(get_db(), code)["config"] or "{}")

def test_mp_eve_botnet_cracks_short_key_and_scores(app):
    c, code = _play_full_round_human_bob(app, "mission", eve_workers=100, decision="keep")
    lr = _raw_cfg(app, code)["lastResult"]          # raw stored form (pre per-seat rewrite)
    assert lr["file"]["cracked"] is True            # 100 workers crack an <=8-bit key
    assert lr["file"]["sample"] == "mission"
    assert lr["perRole"]["eve"] >= 20               # Eve banked the heist bonus on a KEEP

def test_mp_no_workers_no_crack(app):
    c, code = _play_full_round_human_bob(app, "mission", eve_workers=0, decision="keep")
    assert _raw_cfg(app, code)["lastResult"]["file"]["cracked"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_qkd_multiplayer.py::test_mp_eve_botnet_cracks_short_key_and_scores -v`
Expected: FAIL — `lastResult["file"]` KeyError (no file block yet).

- [ ] **Step 3: Add imports + extend `_resolve_scoring`**

At the top of `quantumbreach/qkd/service.py`, add to the intra-package imports (near `from .engine import ...`): `from . import botnet, files`. (Confirm the exact existing import lines and match their style.)

In `_resolve_scoring`, after `result = cfg["result"]` and BEFORE the `for role in ROLES:` scoring loop, insert:

```python
    eve_workers = int((cfg.get("eve") or {}).get("workers", 0) or 0)
    final_key = int(result.get("finalKey") or 0)
    file_cracked = eve_workers > 0 and botnet.crackable_within(final_key, eve_workers, botnet.ROUND_WINDOW)
    result["fileCracked"] = file_cracked   # engine.score_round adds HEIST_BONUS on KEEP when set
```

Then in the `cfg["lastResult"] = {...}` dict, add a `file` entry (compute sample/mime just above or inline):

```python
    _sample = (cfg.get("alice") or {}).get("file") or "mission"
    _mime = files.SAMPLES.get(_sample, {}).get("mime")
    if _mime is None:
        _sample = None  # unknown/stray handle -> no payload
    cfg["lastResult"]["file"] = {"sample": _sample, "mime": _mime, "cracked": file_cracked}
```

(Place the `_sample`/`_mime` lines before building `cfg["lastResult"]`, then reference them, OR add the `file` key immediately after the dict literal — either is fine as long as `cfg["lastResult"]` ends with the `file` key.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_qkd_multiplayer.py -v`
Expected: PASS (both new tests + all pre-existing multiplayer tests).

- [ ] **Step 5: Commit**

```bash
git add quantumbreach/qkd/service.py tests/test_qkd_multiplayer.py
git commit -m "feat(qkd-mp): score Eve's botnet heist + record lastResult.file"
```

---

## Task 2: Server — per-seat `fileVisible` in `game_state`

**Files:**
- Modify: `quantumbreach/qkd/service.py` (`game_state`, the `lastResult` injection at ~lines 111-112)
- Test: `tests/test_qkd_multiplayer.py`

**Interfaces:**
- Consumes: `cfg["lastResult"]` with the `file` block from Task 1 (`{"sample","mime","cracked"}`), `lastResult["eveHit"]`, `lastResult["bobDecision"]`, and `your_role` (already computed in `game_state`).
- Produces: `view["lastResult"]["file"] = {"visible": <bool>, "cracked": <bool>, "sample": <id|None>, "mime": <str|None>}` — real `sample`/`mime` only when `visible`. Visibility: Alice always; Bob iff `bobDecision=="keep" and not eveHit`; Eve iff `cracked`.

- [ ] **Step 1: Write the failing test**

Each seat's per-seat view is fetched with the SAME client that seats that human —
`c.get("/api/qkd/game/<code>")` resolves the seat from the client's cookie. So Bob
tests reuse `_play_full_round_human_bob` (Bob's client); the Eve earner test seats a
human Eve.

```python
# append to tests/test_qkd_multiplayer.py
def _bob_file_view(c, code):
    return (c.get(f"/api/qkd/game/{code}").get_json().get("lastResult") or {}).get("file")

def test_mp_bob_sees_file_on_clean_keep(app):
    c, code = _play_full_round_human_bob(app, "mission", eve_workers=0, decision="keep")
    f = _bob_file_view(c, code)             # clean channel (p=0) + keep -> Bob earns it
    assert f["visible"] is True and f["sample"] == "mission"

def test_mp_bob_scrambled_on_abort(app):
    c, code = _play_full_round_human_bob(app, "mission", eve_workers=0, decision="abort")
    f = _bob_file_view(c, code)
    assert f["visible"] is False and f["sample"] is None    # no leak of the sample id to a non-earner

def test_mp_eve_sees_file_only_when_cracked(app):
    # Seat a HUMAN Eve; computer Alice auto-plays -> eve_move. Override Alice's cfg to a short
    # key + a sample, then Eve deploys 100 workers; computer Bob auto-keeps a clean channel.
    c, code = _solo_game(app, "eve")
    with app.app_context():
        db = get_db()
        g = service._game(db, code)
        cfg = json.loads(g["config"] or "{}")
        cfg["alice"] = {"n": 8, "s": 0, "file": "mission"}
        service._set_config(db, g["id"], cfg)
        db.commit()
    c.post(f"/api/qkd/game/{code}/act", json={"action": {"p": 0, "workers": 100}})
    f = (c.get(f"/api/qkd/game/{code}").get_json().get("lastResult") or {}).get("file")
    assert f["visible"] is True and f["cracked"] is True and f["sample"] == "mission"
```

Note: when human Eve submits `{p:0, workers:100}`, `advance()`'s `eve_move` branch
re-resolves the round from the (overridden) `cfg["alice"]` → a short clean key; computer
Bob then auto-keeps (QBER 0 ≤ 0.11), resolving the round before the `c.get` above.

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_qkd_multiplayer.py::test_mp_bob_sees_file_on_clean_keep -v`
Expected: FAIL — `file["visible"]` KeyError (game_state doesn't add `visible` yet).

- [ ] **Step 3: Rewrite the `lastResult` injection in `game_state`**

Replace (in `game_state`, `quantumbreach/qkd/service.py`):

```python
    # Full reveal only at resolve/ended.
    if g["phase"] in ("resolve", "ended") and "lastResult" in cfg:
        view["lastResult"] = cfg["lastResult"]
```

with:

```python
    # Full reveal only at resolve/ended; file visibility is computed per seat.
    if g["phase"] in ("resolve", "ended") and "lastResult" in cfg:
        lr = dict(cfg["lastResult"])                 # shallow copy; never mutate stored cfg
        f = dict(lr.get("file") or {})
        cracked = bool(f.get("cracked"))
        visible = (
            your_role == "alice"
            or (your_role == "bob" and lr.get("bobDecision") == "keep" and not lr.get("eveHit"))
            or (your_role == "eve" and cracked)
        )
        lr["file"] = {
            "visible": visible,
            "cracked": cracked,
            "sample": f.get("sample") if visible else None,
            "mime": f.get("mime") if visible else None,
        }
        view["lastResult"] = lr
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_qkd_multiplayer.py -v`
Expected: PASS (new visibility tests + all prior).

- [ ] **Step 5: Commit**

```bash
git add quantumbreach/qkd/service.py tests/test_qkd_multiplayer.py
git commit -m "feat(qkd-mp): per-seat file visibility in game_state (earners only get the sample)"
```

---

## Task 3: Shared botnet render — extract `PhantomBotnet.renderPanel`

**Files:**
- Modify: `quantumbreach/static/js/botnet.js` (add `renderPanel`)
- Modify: `quantumbreach/static/js/qkd.js` (refactor Solo `renderBotnet()` to call it — behavior-preserving)
- Test: `tests/test_ui_qkd_file.py` (Solo regression — must stay green) + a new render assertion

**Interfaces:**
- Produces: `PhantomBotnet.renderPanel(els, workers, keyBitsEstimate, interceptP)` where `els = {grid, rate, eta, detect}` (any DOM element may be null). Renders `workers` `<span class="worker">` tiles into `els.grid`; sets `els.rate.textContent = keysPerSec(workers).toLocaleString()`; `els.detect.textContent = detectionDelta(interceptP)`; `els.eta.textContent` = `crackEta(keyBitsEstimate, workers)` formatted as `"∞ (heat death)"` (Infinity) or `"N.Ns"`.
- Consumes (Solo, unchanged behavior): the existing `#ev-grid/#ev-rate/#ev-detect/#ev-eta` elements and `QkdActions.state()`.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_ui_qkd_file.py
def test_botnet_render_panel_draws_tiles(live_server=None):
    pass  # placeholder replaced below
```

Replace that placeholder with a real harness test:

```python
from tests.browser_utils import live_server, browser_page, requires_browser

@requires_browser
def test_botnet_render_panel_draws_tiles():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        n = pg.evaluate("""() => {
          var g = document.createElement('div'), r = document.createElement('span'),
              e = document.createElement('span'), d = document.createElement('span');
          PhantomBotnet.renderPanel({grid:g, rate:r, eta:e, detect:d}, 7, 8, 0.5);
          return [g.querySelectorAll('.worker').length, r.textContent.length > 0, e.textContent, d.textContent];
        }""")
        assert n[0] == 7            # 7 worker tiles
        assert n[1] is True         # rate rendered
        assert "s" in n[2] or "heat" in n[2]   # eta formatted (finite 'Ns' or heat-death)
        assert n[3] == "50"         # detectionDelta(0.5) == 50
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ui_qkd_file.py::test_botnet_render_panel_draws_tiles -v`
Expected: FAIL — `PhantomBotnet.renderPanel is not a function`.

- [ ] **Step 3: Add `renderPanel` to `botnet.js`**

In `quantumbreach/static/js/botnet.js`, inside the IIFE before the `window.PhantomBotnet = {...}` literal, add:

```javascript
  function renderPanel(els, workers, keyBitsEstimate, interceptP) {
    els = els || {};
    workers = Math.max(0, workers | 0);
    if (els.grid) {
      els.grid.innerHTML = "";
      for (var i = 0; i < workers; i++) { var t = document.createElement("span"); t.className = "worker"; els.grid.appendChild(t); }
    }
    if (els.rate) els.rate.textContent = keysPerSec(workers).toLocaleString();
    if (els.detect) els.detect.textContent = detectionDelta(interceptP);
    if (els.eta) { var e = crackEta(keyBitsEstimate | 0, workers); els.eta.textContent = (e === Infinity ? "∞ (heat death)" : e.toFixed(1) + "s"); }
  }
```

Add `renderPanel: renderPanel,` to the `window.PhantomBotnet = { ... }` object literal.

- [ ] **Step 4: Refactor Solo `renderBotnet()` to use it**

In `quantumbreach/static/js/qkd.js`, replace the body of `renderBotnet()` (the block that manually builds tiles / sets rate/detect/eta, ~lines 190-200) with a call to the shared helper, preserving the Solo inputs:

```javascript
    function renderBotnet() {
      var PB = window.PhantomBotnet; if (!PB || !window.QkdActions) return;
      var state = window.QkdActions.state();
      var upperN = (pending && pending.n) || state.alice.n || 0;
      PB.renderPanel({
        grid: document.getElementById("ev-grid"),
        rate: document.getElementById("ev-rate"),
        eta: document.getElementById("ev-eta"),
        detect: document.getElementById("ev-detect")
      }, state.eve.workers, upperN, state.eve.p);
    }
```

- [ ] **Step 5: Run Solo regression + the new test**

Run: `python -m pytest tests/test_ui_qkd_file.py tests/test_ui_qkd.py -v`
Expected: PASS — Solo botnet reveal/grid behavior unchanged, new render test green.

- [ ] **Step 6: Commit**

```bash
git add quantumbreach/static/js/botnet.js quantumbreach/static/js/qkd.js tests/test_ui_qkd_file.py
git commit -m "refactor(qkd): extract shared PhantomBotnet.renderPanel; Solo uses it"
```

---

## Task 4: Client — Alice sample picker in multiplayer

**Files:**
- Modify: `quantumbreach/static/js/qkd-multi.js` (`renderControls`, `alice_setup` branch, ~lines 66-71)
- Test: `tests/test_ui_qkd_multi.py`

**Interfaces:**
- Consumes: the existing `act({...})` helper (`POST /api/qkd/game/<code>/act` with `{action}`), and the server's `alice_setup` which already accepts `file`.
- Produces: an Alice-setup control that includes `<select id="qm-file">` (options `mission`/`codes`/`photo`) and submits `act({ n, s, file })`.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_ui_qkd_multi.py  (single human vs computer — simpler than two_player)
from tests.browser_utils import live_server, browser_page, requires_browser

@requires_browser
def test_mp_alice_has_sample_picker():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-multi")
        pg.click("[data-create='alice']")            # create a game as Alice; Bob/Eve computer
        pg.wait_for_selector("#qm-file", timeout=6000)   # Alice-setup control shows the picker
        opts = pg.evaluate("() => Array.from(document.querySelectorAll('#qm-file option')).map(o => o.value)")
        assert "mission" in opts and "photo" in opts
        pg.select_option("#qm-file", "codes")
        pg.click("#qm-al-go")                          # submit; must not error, round advances
        pg.wait_for_timeout(400)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ui_qkd_multi.py::test_mp_alice_has_sample_picker -v`
Expected: FAIL — `#qm-file` never appears.

- [ ] **Step 3: Add the picker to the alice_setup control**

In `quantumbreach/static/js/qkd-multi.js`, in `renderControls`, replace the `alice_setup` block:

```javascript
    if (st.phase === "alice_setup") {
      box.innerHTML = '<label>Key length <input id="qm-n" type="range" min="8" max="64" value="24"></label>' +
        '<label>Check sample <input id="qm-s" type="range" min="0" max="24" value="6"></label>' +
        '<label>Payload <select id="qm-file">' +
          '<option value="mission">mission.txt</option>' +
          '<option value="codes">codes.txt</option>' +
          '<option value="photo">photo.png</option>' +
        '</select></label>' +
        '<button class="btn" id="qm-al-go" type="button">Send key</button>';
      $("qm-al-go").addEventListener("click", function () {
        act({ n: parseInt($("qm-n").value, 10), s: parseInt($("qm-s").value, 10), file: $("qm-file").value }); });
    } else if (st.phase === "eve_move") {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_ui_qkd_multi.py -v`
Expected: PASS (new test + the existing two-player multiplayer test).

- [ ] **Step 5: Commit**

```bash
git add quantumbreach/static/js/qkd-multi.js tests/test_ui_qkd_multi.py
git commit -m "feat(qkd-mp): Alice sample picker in the multiplayer setup"
```

---

## Task 5: Client — Eve botnet panel in multiplayer

**Files:**
- Modify: `quantumbreach/static/js/qkd-multi.js` (`renderControls`, `eve_move` branch, ~lines 72-75)
- Test: `tests/test_ui_qkd_multi.py`

**Interfaces:**
- Consumes: `act({...})`, `PhantomBotnet.renderPanel` (Task 3), `PhantomBotnet.crackEta/keysPerSec/detectionDelta`.
- Produces: an Eve-move control with intercept chips that *select* a local `pIntercept` (default 0, no submit-on-click), a workers slider `#qm-w` (0–100) + grid `#qm-grid` + readout `#qm-rate`/`#qm-eta`/`#qm-detect`, and a **Commit move** button `#qm-eve-go` submitting `act({ p: pIntercept, workers })`.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_ui_qkd_multi.py
@requires_browser
def test_mp_eve_has_botnet_panel():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-multi")
        pg.click("[data-create='eve']")               # create as Eve; computer Alice auto-plays -> eve_move
        pg.wait_for_selector("#qm-w", timeout=6000)   # botnet slider present on Eve's turn
        # deploy workers -> grid renders tiles
        pg.eval_on_selector("#qm-w", "el => { el.value = 40; el.dispatchEvent(new Event('input')); }")
        pg.wait_for_timeout(150)
        tiles = pg.evaluate("() => document.querySelectorAll('#qm-grid .worker').length")
        assert tiles == 40
        # pick an intercept + commit -> advances without error
        pg.click(".qm-ev[data-p='0.25']")
        pg.click("#qm-eve-go")
        pg.wait_for_timeout(400)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ui_qkd_multi.py::test_mp_eve_has_botnet_panel -v`
Expected: FAIL — `#qm-w` never appears.

- [ ] **Step 3: Replace the `eve_move` control**

In `quantumbreach/static/js/qkd-multi.js`, replace the `eve_move` branch in `renderControls`:

```javascript
    } else if (st.phase === "eve_move") {
      var pIntercept = 0;
      box.innerHTML =
        '<div class="qm-intercepts"><span class="muted">Intercept:</span>' +
          '<button class="chip qm-ev on" data-p="0" type="button">None</button>' +
          '<button class="chip qm-ev" data-p="0.25" type="button">Light</button>' +
          '<button class="chip qm-ev" data-p="0.5" type="button">Heavy</button>' +
          '<button class="chip qm-ev" data-p="1" type="button">Full</button>' +
        '</div>' +
        '<label>Workers <span id="qm-w-val">0</span><input id="qm-w" type="range" min="0" max="100" value="0"></label>' +
        '<div id="qm-grid" class="worker-grid"></div>' +
        '<p class="muted"><span id="qm-rate">0</span> keys/s · ETA <span id="qm-eta">—</span> · detection +<span id="qm-detect">0</span>%</p>' +
        '<button class="btn" id="qm-eve-go" type="button">Commit move</button>';
      function drawPanel() {
        var w = parseInt($("qm-w").value, 10) || 0;
        $("qm-w-val").textContent = w;
        window.PhantomBotnet.renderPanel(
          { grid: $("qm-grid"), rate: $("qm-rate"), eta: $("qm-eta"), detect: $("qm-detect") },
          w, 24, pIntercept);   // 24 = display-only key-length estimate (Eve can't see Alice's n)
      }
      box.querySelectorAll(".qm-ev").forEach(function (b) {
        b.addEventListener("click", function () {
          box.querySelectorAll(".qm-ev").forEach(function (x) { x.classList.remove("on"); });
          b.classList.add("on"); pIntercept = parseFloat(b.getAttribute("data-p")); drawPanel();
        });
      });
      $("qm-w").addEventListener("input", drawPanel);
      $("qm-eve-go").addEventListener("click", function () {
        act({ p: pIntercept, workers: parseInt($("qm-w").value, 10) || 0 }); });
      drawPanel();
    } else if (st.phase === "bob_decision") {
```

Note: `renderControls` runs on every 1.5s poll while it's Eve's turn (`youAreUpNow`). Because the whole `box.innerHTML` is rebuilt each poll, the local `pIntercept`/slider reset to defaults each tick — acceptable for a first cut (the panel is re-rendered fresh; the player commits within a poll window). If reset-on-poll proves annoying in the browser test (slider value lost between polls), guard the rebuild: only rebuild the eve_move control when it isn't already present (e.g. `if (!$("qm-w")) { ...build... }`). Prefer the guard if the test flakes.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_ui_qkd_multi.py -v`
Expected: PASS. If the slider value resets between polls (flaky tile count), apply the "only build if `#qm-w` absent" guard described above and re-run.

- [ ] **Step 5: Commit**

```bash
git add quantumbreach/static/js/qkd-multi.js tests/test_ui_qkd_multi.py
git commit -m "feat(qkd-mp): Eve botnet panel (intercept + workers grid) with a commit button"
```

---

## Task 6: Client — per-seat file reveal + browser-drive screenshots

**Files:**
- Modify: `quantumbreach/static/js/qkd-multi.js` (`renderControls`, the `st.lastResult` reveal block, ~lines 60-64)
- Modify: `quantumbreach/templates/qkd.html` (add a `#qm-file-view` host inside `#qm-play`, near `#qm-reveal`)
- Modify: `.claude/skills/run-phantomq/drive.py` (screenshot the MP file/botnet flow)
- Test: `tests/test_ui_qkd_multi.py`

**Interfaces:**
- Consumes: `st.lastResult.file` = `{visible, cracked, sample, mime}` (Task 2), `QkdFile.renderInto(el, bytes, mime)` / `QkdFile.scrambleInto(el, bytes)`, the file endpoints `POST /api/qkd/file {sample}` → `GET /api/qkd/file/<handle>`.
- Produces: on resolve, `#qm-file-view` shows the decrypted file (earner) or scrambled bytes (non-earner) + a caption.

- [ ] **Step 1: Add the host element to `qkd.html`**

In `quantumbreach/templates/qkd.html`, inside `#qm-play` (near `<div id="qm-reveal" ...>`), add:

```html
    <div id="qm-file-view" class="file-view"></div>
```

- [ ] **Step 2: Write the failing test**

```python
# append to tests/test_ui_qkd_multi.py
@requires_browser
def test_mp_reveal_renders_a_file_pane():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-multi")
        pg.click("[data-create='alice']")            # human Alice; computer Bob/Eve auto-play
        pg.wait_for_selector("#qm-file", timeout=6000)
        pg.select_option("#qm-file", "mission")
        pg.click("#qm-al-go")
        # computer Eve + Bob auto-resolve; wait for the reveal pane to populate (Alice always sees her file)
        pg.wait_for_function(
            "() => { var v = document.querySelector('#qm-file-view'); return v && v.textContent.indexOf('CLASSIFIED') >= 0; }",
            timeout=8000)
        assert "CLASSIFIED" in pg.inner_text("#qm-file-view")
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python -m pytest tests/test_ui_qkd_multi.py::test_mp_reveal_renders_a_file_pane -v`
Expected: FAIL — `#qm-file-view` stays empty (no reveal wiring).

- [ ] **Step 4: Wire the reveal in `renderControls`**

In `quantumbreach/static/js/qkd-multi.js`, in `renderControls`, extend the `st.lastResult` block. After the existing `rv.textContent = ...` line, add a file-reveal call:

```javascript
    if (st.lastResult) {
      var lr = st.lastResult;
      rv.textContent = "Round " + lr.round + ": " + (lr.eveHit ? "Eve intercepted" : "clean") +
        ", QBER " + Math.round(lr.sampleQBER * 100) + "%, key " + lr.finalKey + " bits, Bob " + lr.bobDecision.toUpperCase() + ".";
      revealFile(lr, st.yourRole);
    }
```

Add the `revealFile` helper (module-level in the IIFE, near `act`):

```javascript
  function revealFile(lr, yourRole) {
    var pane = $("qm-file-view"); if (!pane || !window.QkdFile) return;
    var f = lr.file || {};
    if (f.visible && f.sample) {
      // fetch sample bytes via the existing store flow, then render decrypted
      api("/api/qkd/file", { sample: f.sample }).then(function (m) {
        if (!m || !m.handle) { window.QkdFile.scrambleInto(pane, null); return; }
        return fetch("/api/qkd/file/" + m.handle).then(function (r) { return r.arrayBuffer(); })
          .then(function (buf) { window.QkdFile.renderInto(pane, new Uint8Array(buf), f.mime || m.mime); });
      }).catch(function () { window.QkdFile.scrambleInto(pane, null); });
    } else {
      window.QkdFile.scrambleInto(pane, null);
    }
    var cap = f.visible
      ? (yourRole === "eve" ? "Your botnet cracked it!" : yourRole === "alice" ? "Your file." : "Delivered — you hold the key.")
      : (yourRole === "eve" ? "Botnet didn't crack it in time."
         : lr.bobDecision === "abort" ? "Aborted — no delivery." : "Corrupted — key mismatch.");
    var capEl = document.createElement("p"); capEl.className = "muted"; capEl.textContent = cap;
    pane.appendChild(capEl);
  }
```

(The caption `<p>` is appended after `renderInto`/`scrambleInto` clear+fill the pane; since the fetch is async, append the caption synchronously is fine — `renderInto` clears innerHTML first, so if the caption must survive, append it in the `.then`. To keep it simple and correct, move the `capEl` append INTO both branches after the render call resolves; i.e. append the caption inside the `.then` of the visible branch and immediately after `scrambleInto` in the else branch.)

Refined `revealFile` (use this exact version to avoid the caption being wiped by the async `renderInto`):

```javascript
  function revealFile(lr, yourRole) {
    var pane = $("qm-file-view"); if (!pane || !window.QkdFile) return;
    var f = lr.file || {};
    function caption() {
      var cap = f.visible
        ? (yourRole === "eve" ? "Your botnet cracked it!" : yourRole === "alice" ? "Your file." : "Delivered — you hold the key.")
        : (yourRole === "eve" ? "Botnet didn't crack it in time."
           : lr.bobDecision === "abort" ? "Aborted — no delivery." : "Corrupted — key mismatch.");
      var p = document.createElement("p"); p.className = "muted"; p.textContent = cap; pane.appendChild(p);
    }
    if (f.visible && f.sample) {
      api("/api/qkd/file", { sample: f.sample }).then(function (m) {
        if (!m || !m.handle) { window.QkdFile.scrambleInto(pane, null); caption(); return; }
        return fetch("/api/qkd/file/" + m.handle).then(function (r) { return r.arrayBuffer(); })
          .then(function (buf) { window.QkdFile.renderInto(pane, new Uint8Array(buf), f.mime || m.mime); caption(); });
      }).catch(function () { window.QkdFile.scrambleInto(pane, null); caption(); });
    } else {
      window.QkdFile.scrambleInto(pane, null); caption();
    }
  }
```

Note: `renderControls` runs every poll; at `resolve` the reveal re-runs each tick (re-fetching). Acceptable (idempotent render). If the re-fetch churn is undesirable, guard with a `lastRevealRound` module var so `revealFile` only runs once per round — apply only if needed.

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest tests/test_ui_qkd_multi.py -v`
Expected: PASS.

- [ ] **Step 6: Extend the browser-drive tour**

In `.claude/skills/run-phantomq/drive.py`, add a short multiplayer segment (single human vs computer): go to `/qkd`, click `#mode-multi`, create as Alice, pick a sample in `#qm-file`, send; wait for `#qm-file-view` to populate; screenshot `mp-file-reveal.png`. Also create a second run as Eve to screenshot the botnet grid (`#qm-grid`) — `mp-eve-botnet.png`. Keep the script exit-0; every screenshot non-blank.

- [ ] **Step 7: Run the drive script**

Run: `python .claude/skills/run-phantomq/drive.py --out "$TMP/mp-shots" --port 8143`
Expected: exit 0; `mp-file-reveal.png` and `mp-eve-botnet.png` written and non-blank.

- [ ] **Step 8: Commit**

```bash
git add quantumbreach/static/js/qkd-multi.js quantumbreach/templates/qkd.html .claude/skills/run-phantomq/drive.py tests/test_ui_qkd_multi.py
git commit -m "feat(qkd-mp): per-seat file reveal + botnet browser-drive screenshots"
```

---

## Final verification

- [ ] Full suite: `python -m pytest -q` — all pass (note: ~3.5 min; run in the background if it exceeds the foreground limit).
- [ ] Grep the diff for accidental key-material leaks: `game_state` never serializes raw BB84 arrays; the `sample` id is present only when `visible`.
- [ ] Update `docs/QKD_MULTIPLAYER.md`: the file heist + botnet are now live in multiplayer (remove/adjust the v3 "solo-only" caveat) and remove the corresponding bullet from `docs/FOLLOWUPS.md`.
- [ ] Update memory (`phantomq-project.md` + `MEMORY.md`): the MP file/botnet gap is closed.

## Self-Review notes (coverage map)

- Spec §1 server (_resolve_scoring file_cracked + heist bonus + lastResult.file) → Task 1. §1 game_state per-seat visibility → Task 2. §3 shared render → Task 3. §2 Alice picker → Task 4. §2 Eve botnet panel → Task 5. §2 per-seat reveal → Task 6. Testing (pytest server + browser + drive) → per task + final. Docs/memory updates → final verification. Bundled-samples-only, server-authoritative visibility, heist-bonus-via-engine, atomicity-unchanged constraints are carried in Global Constraints and enforced in Tasks 1-2.
