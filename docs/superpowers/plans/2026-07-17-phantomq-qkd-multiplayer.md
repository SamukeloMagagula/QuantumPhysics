# PhantomQ QKD — Role-Based & Multiplayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/qkd` into a role-based BB84 game (play Alice, Bob, or Eve) with a client-side **Solo vs computer** mode and a same-network **Multiplayer** mode (up to 3 students, computer fills empty seats), coordinated by the existing Flask + SQLite stack via HTTP polling.

**Architecture:** One BB84 **round resolver** with an exact, seedable RNG contract, implemented twice — in JS (`window.QuantumIntercept`, for Solo) and in Python (`quantumbreach/qkd/engine.py`, authoritative for Multiplayer) — kept identical by a shared known-answer vector tested on both sides. Multiplayer adds two SQLite tables and a phase state machine (`lobby → alice_setup → eve_move → bob_decision → resolve → …/ended`) behind a `qkd` blueprint; clients poll a role/phase-filtered state view. Scores reuse the existing `qkd_scores` leaderboard and `qkd-operative` badge.

**Tech Stack:** Python 3 + Flask + Waitress + SQLite (stdlib `sqlite3`, `random`); server-rendered Jinja; vanilla JS (no build step); pytest + Playwright (system Chrome via `channel="chrome"`).

## Global Constraints

- No external/remote resources: no CDNs, no npm, no build step, no new pip dependencies. Vanilla JS served from `quantumbreach/static/`. `python app.py` unchanged.
- No WebSockets. Multiplayer is same-LAN, coordinated by HTTP polling (~1.5 s). The app already binds `0.0.0.0`.
- Server is authoritative for multiplayer: raw Alice bits/bases never leave the server; Bob's `sampleQBER` is revealed only during his decision; Eve's intercept only at reveal.
- QKD scores stay isolated from crypto-rooms XP (`user_stats.points`); they use `qkd_scores` only.
- Jinja page templates MUST NOT nest `{% block scripts %}` inside `{% block content %}` (double-render bug); scripts block is a top-level sibling.
- Abort/detection line is `0.11` (matches the current game). Detection bonus and per-bit point values are as written here (tunable, but keep the sign/relative incentives).
- **RNG contract (both resolvers MUST follow exactly):** the resolver consumes a callable `rng()` returning a float in `[0,1)`. Per photon `i` it draws **exactly 7 floats in this order**: `d0`=Alice bit, `d1`=Alice basis, `d2`=Eve intercept roll, `d3`=Eve basis, `d4`=Eve mismatch-measure bit, `d5`=Bob basis, `d6`=Bob mismatch-measure bit — **all seven are drawn every photon even if unused** (so JS and Python consume the RNG identically). Mapping: bit `= 0 if d<0.5 else 1`; basis `= "+" if d<0.5 else "x"`; intercept `= d2 < p`; a measurement in a matching basis returns the incoming bit, in a mismatching basis returns the mismatch-measure bit.

---

## File Structure

**Phase 1 — Shared resolver + Solo (client-side):**
- `quantumbreach/static/js/qkd.js` — rewrite: pure fns `resolveRound/scoreRound/computerStrategy` on `window.QuantumIntercept` + Solo UI (mode/role select, per-role panels, animation, scoreboard).
- `quantumbreach/templates/qkd.html` — mode selector + role selector + per-role Solo panels.
- `quantumbreach/static/css/app.css` — QKD mode/role/panel/scoreboard styles (append).
- `tests/test_js_qkd_resolver.py` — Playwright `page.evaluate` seeded-vector tests for the JS resolver.
- `tests/test_ui_qkd.py` — update: double-render guard + Solo-round browser drive.

**Phase 2 — Multiplayer backend (Python):**
- `quantumbreach/qkd/__init__.py` — package marker.
- `quantumbreach/qkd/engine.py` — Python resolver/scoring/strategy (mirrors JS, seedable).
- `quantumbreach/qkd/service.py` — DB-backed game room: create/join/start/act/state, phase machine, computer auto-submit, timeout, scoring → `qkd_scores`.
- `quantumbreach/qkd/routes.py` — `qkd` blueprint, 5 endpoints (thin wrappers).
- `quantumbreach/schema.sql` — add `qkd_games`, `qkd_game_seats`.
- `quantumbreach/__init__.py` — register the `qkd` blueprint.
- `tests/test_qkd_engine.py` — Python resolver known-answer (same vector as JS), scoring, strategy.
- `tests/test_qkd_multiplayer.py` — HTTP lifecycle, secrecy, idempotency, computer-fill, scoring/badge.

**Phase 3 — Multiplayer client + polish:**
- `quantumbreach/static/js/qkd-multi.js` — create/join, poll loop, seat/phase rendering, actions, reveal/scoreboard.
- `quantumbreach/templates/qkd.html` — multiplayer panel (create/join, lobby, round view).
- `quantumbreach/static/css/app.css` — multiplayer UI styles (append).
- `tests/test_ui_qkd_multi.py` — two-context browser test of a full multiplayer round.
- `.claude/skills/run-phantomq/drive.py` + `SKILL.md` — tour a Solo role round.
- `README.md` + `docs/QKD_MULTIPLAYER.md` — LAN hosting notes.

---

## Task 1: Shared BB84 resolver, scoring, and computer strategy (pure JS)

**Files:**
- Modify: `quantumbreach/static/js/qkd.js` (replace the whole file — pure fns first; Solo UI added in Task 2)
- Test: `tests/test_js_qkd_resolver.py`

**Interfaces:**
- Produces on `window.QuantumIntercept`: `ABORT=0.11`; `resolveRound(config, rng) -> result`; `scoreRound(role, result, decision) -> {delta, youWon}`; `computerStrategy(role, publicInfo, rng) -> action`. `config={n,s,p}`; `result={n,p,sifted,sampleSize,sampleQBER,finalKey,stolen,eveHit,intercepted,aBases,bBases}`; `role∈{"alice","bob","eve"}`; `decision∈{"keep","abort"}`. Reuses `window.PhantomCrypto.bb84.sift/qber`.

- [ ] **Step 1: Write the failing test** `tests/test_js_qkd_resolver.py`

```python
from tests.browser_utils import live_server, browser_page, requires_browser

# A fixed float vector -> deterministic round. VEC repeats every 7 draws (one photon).
# 4 photons: photon rng draws below. See the plan's RNG contract for the draw order.
VEC = (
    # p0: aBit d0=.10(0) aBasis d1=.10(+) intercept d2=.99(no) d3 d4 unused bBasis d5=.10(+) d6
    "0.10,0.10,0.99,0.50,0.50,0.10,0.50,"
    # p1: aBit .90(1) aBasis .90(x) intercept .99(no) .. bBasis .90(x) ..
    "0.90,0.90,0.99,0.50,0.50,0.90,0.50,"
    # p2: aBit .10(0) aBasis .10(+) intercept .99(no) .. bBasis .90(x=MISMATCH -> not sifted)
    "0.10,0.10,0.99,0.50,0.50,0.90,0.50,"
    # p3: aBit .90(1) aBasis .90(x) intercept .99(no) .. bBasis .10(+ MISMATCH -> not sifted)
    "0.90,0.90,0.99,0.50,0.50,0.10,0.50"
)


@requires_browser
def test_resolver_clean_channel_seeded():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        js = """(vec) => {
          const a = vec.split(',').map(Number); let i = 0;
          const rng = () => a[i++];
          const r = window.QuantumIntercept.resolveRound({n:4, s:0, p:0}, rng);
          return [r.sifted, r.sampleQBER, r.finalKey, r.stolen, r.eveHit];
        }"""
        sifted, qber, final, stolen, eve = pg.evaluate(js, VEC)
        assert sifted == 2          # photons 0 and 1 have matching bases; 2 and 3 don't
        assert qber == 0            # clean channel, no Eve
        assert final == 2           # s=0 sacrifices nothing
        assert stolen == 0 and eve is False


@requires_browser
def test_scoring_table():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        # Eve intercepted + ABORT -> defenders win the detection bonus, Eve loses.
        assert pg.evaluate("window.QuantumIntercept.scoreRound('bob', {eveHit:true, stolen:3, finalKey:5}, 'abort')") == {"delta": 25, "youWon": True}
        assert pg.evaluate("window.QuantumIntercept.scoreRound('eve', {eveHit:true, stolen:3, finalKey:5}, 'abort')") == {"delta": 0, "youWon": False}
        # Eve intercepted + KEEP -> Eve wins her stolen bits, defenders get nothing.
        assert pg.evaluate("window.QuantumIntercept.scoreRound('eve', {eveHit:true, stolen:3, finalKey:5}, 'keep')") == {"delta": 3, "youWon": True}
        assert pg.evaluate("window.QuantumIntercept.scoreRound('alice', {eveHit:true, stolen:3, finalKey:5}, 'keep')") == {"delta": 0, "youWon": False}
        # Clean + KEEP -> defenders bank the final key.
        assert pg.evaluate("window.QuantumIntercept.scoreRound('alice', {eveHit:false, stolen:0, finalKey:5}, 'keep')") == {"delta": 5, "youWon": True}
        # Clean + ABORT -> false alarm, nobody scores.
        assert pg.evaluate("window.QuantumIntercept.scoreRound('bob', {eveHit:false, stolen:0, finalKey:5}, 'abort')") == {"delta": 0, "youWon": False}
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_js_qkd_resolver.py -v`
Expected: FAIL (or SKIP without Chrome). With Chrome: fails because `resolveRound/scoreRound` don't exist yet.

- [ ] **Step 3: Replace `quantumbreach/static/js/qkd.js` with the pure functions** (Solo UI appended in Task 2 — for now the file ends after the exports so the page still loads)

```javascript
(function () {
  var ABORT = 0.11, DETECT = 25;
  var C = window.PhantomCrypto;

  function draw(rng) { var v = rng(); return (typeof v === "number" && v >= 0 && v < 1) ? v : 0; }
  function bit(d) { return d < 0.5 ? 0 : 1; }
  function basis(d) { return d < 0.5 ? "+" : "x"; }

  // BB84 round. rng() -> [0,1); 7 draws per photon in the plan's fixed order.
  function resolveRound(config, rng) {
    rng = rng || Math.random;
    var n = Math.max(1, config.n | 0);
    var p = Math.min(1, Math.max(0, +config.p || 0));
    var s = Math.max(0, config.s | 0);
    var aBits = [], aBases = [], bBases = [], bBits = [], intercepted = [], eBases = [];
    for (var i = 0; i < n; i++) {
      var d0 = draw(rng), d1 = draw(rng), d2 = draw(rng), d3 = draw(rng), d4 = draw(rng), d5 = draw(rng), d6 = draw(rng);
      var aBit = bit(d0), aBasis = basis(d1);
      var interc = d2 < p, chBit, chBasis, eBasis = "";
      if (interc) { eBasis = basis(d3); var eBit = (eBasis === aBasis) ? aBit : bit(d4); chBit = eBit; chBasis = eBasis; }
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
    return { n: n, p: p, sifted: m, sampleSize: sampleSize, sampleQBER: sampleQBER, finalKey: finalKey,
             stolen: stolen, eveHit: eveHit, intercepted: intercepted, aBases: aBases, bBases: bBases };
  }

  function scoreRound(role, result, decision) {
    var eve = !!result.eveHit, defender = 0, eveDelta = 0;
    if (decision === "abort") { if (eve) defender = DETECT; }
    else { if (eve) eveDelta = result.stolen || 0; else defender = result.finalKey || 0; }
    var delta = (role === "eve") ? eveDelta : defender;
    return { delta: delta, youWon: delta > 0 };
  }

  function computerStrategy(role, publicInfo, rng) {
    rng = rng || Math.random;
    if (role === "alice") { var n = 16 + Math.floor(rng() * 17); return { n: n, s: Math.max(2, Math.floor(n / 6)) }; }
    if (role === "eve") { var r = rng(); return { p: r < 0.35 ? 0 : r < 0.6 ? 0.25 : r < 0.85 ? 0.5 : 1.0 }; }
    var q = (publicInfo && publicInfo.sampleQBER) || 0;
    return { decision: q > ABORT ? "abort" : "keep" };
  }

  window.QuantumIntercept = { ABORT: ABORT, resolveRound: resolveRound, scoreRound: scoreRound, computerStrategy: computerStrategy };
})();
```

- [ ] **Step 4: Run to verify it passes**

Run: `python -m pytest tests/test_js_qkd_resolver.py -v`
Expected: PASS (or SKIP without Chrome). Then `python -m pytest -q` stays green (the old `tests/test_ui_qkd.py` browser assertions that drive `#btn-keep`/`#btn-abort` will break because the UI is gone — that is expected and fixed in Task 2; if you run the full suite now, only those QKD UI tests fail).

- [ ] **Step 5: Commit**

```bash
git add quantumbreach/static/js/qkd.js tests/test_js_qkd_resolver.py
git commit -m "feat(qkd): seedable BB84 round resolver + role scoring + computer strategy (JS)"
```

---

## Task 2: Solo mode UI (mode + role select, per-role panels, animation, scoreboard)

**Files:**
- Modify: `quantumbreach/static/js/qkd.js` (append the Solo UI IIFE-internal block inside the existing module, after the exports)
- Modify: `quantumbreach/templates/qkd.html`
- Modify: `quantumbreach/static/css/app.css` (append)
- Modify: `tests/test_ui_qkd.py`

**Interfaces:**
- Consumes: `window.QuantumIntercept` (Task 1), `window.PhantomFX` (inside `DOMContentLoaded`), the existing `#qkd-photons`/`#qber-fill` animation hooks.
- Produces: a working Solo game on `/qkd`; DOM ids `#qkd-mode`, `#qkd-role`, `#qkd-solo`, role panels `#panel-alice/#panel-bob/#panel-eve`, `#qkd-reveal`, `#qkd-scoreboard`.

- [ ] **Step 1: Rewrite `quantumbreach/templates/qkd.html`** (scripts block stays a top-level sibling)

```jinja
{% extends "base.html" %}
{% block title %}Quantum Intercept — PhantomQ{% endblock %}
{% block content %}
<h1 data-typewriter>Quantum Intercept</h1>
<p class="muted">BB84 key distribution as a game. Play <strong>Alice</strong> (send the key),
<strong>Bob</strong> (receive &amp; decide), or <strong>Eve</strong> (eavesdrop without being
caught). Errors (QBER) above the {{ 11 }}% line mean an eavesdropper.</p>

<div class="qkd-modes">
  <button class="btn" id="mode-solo" type="button">Solo (vs computer)</button>
  <button class="btn ghost" id="mode-multi" type="button">Multiplayer (same network)</button>
</div>

<div id="qkd-solo" class="qkd" hidden>
  <div class="qkd-roles">
    <span class="muted">Play as:</span>
    <button class="chip role" data-role="alice" type="button">Alice</button>
    <button class="chip role" data-role="bob" type="button">Bob</button>
    <button class="chip role" data-role="eve" type="button">Eve</button>
  </div>
  <div id="qkd-photons" class="qkd-photons"></div>
  <div class="qber"><div id="qber-fill" class="qber-fill cool"></div></div>
  <p id="qber-text" class="muted"></p>

  <div id="panel-alice" class="qkd-panel" hidden>
    <label>Key length: <span id="al-n-val">24</span><input id="al-n" type="range" min="8" max="64" value="24"></label>
    <label>Check sample: <span id="al-s-val">6</span><input id="al-s" type="range" min="0" max="24" value="6"></label>
    <button class="btn" id="al-send" type="button">Send key</button>
  </div>
  <div id="panel-eve" class="qkd-panel" hidden>
    <span class="muted">Intercept:</span>
    <button class="chip ev" data-p="0" type="button">None</button>
    <button class="chip ev" data-p="0.25" type="button">Light</button>
    <button class="chip ev" data-p="0.5" type="button">Heavy</button>
    <button class="chip ev" data-p="1" type="button">Full</button>
  </div>
  <div id="panel-bob" class="qkd-panel" hidden>
    <button class="btn" id="btn-keep" type="button">KEEP KEY</button>
    <button class="btn ghost" id="btn-abort" type="button">ABORT</button>
  </div>

  <p id="qkd-info"></p>
  <div id="qkd-reveal" class="qkd-reveal"></div>
  <div class="row"><span id="qkd-score" class="chip">Score: 0</span></div>
</div>

<div id="qkd-multi" hidden><!-- populated in Phase 3 --></div>
{% endblock %}

{% block scripts %}
  <script src="{{ url_for('static', filename='js/qkd.js') }}"></script>
{% endblock %}
{% endblock %}
```

- [ ] **Step 2: Append the Solo UI inside `qkd.js`** (place BEFORE the final `})();` — it shares the module closure, so it can call `resolveRound` etc. directly)

```javascript
  // ---- Solo interactive game (only on /qkd) ----
  document.addEventListener("DOMContentLoaded", function () {
    var solo = document.getElementById("qkd-solo"); if (!solo) return;
    var modeSolo = document.getElementById("mode-solo"), modeMulti = document.getElementById("mode-multi");
    var multi = document.getElementById("qkd-multi");
    var photons = document.getElementById("qkd-photons"), meter = document.getElementById("qber-fill");
    var qtext = document.getElementById("qber-text"), info = document.getElementById("qkd-info");
    var reveal = document.getElementById("qkd-reveal"), scoreEl = document.getElementById("qkd-score");
    var panels = { alice: document.getElementById("panel-alice"), bob: document.getElementById("panel-bob"), eve: document.getElementById("panel-eve") };
    var myRole = null, score = 0, peak = 0, pending = null; // pending: {n,s,p} gathered so far

    modeSolo.addEventListener("click", function () { multi.hidden = true; solo.hidden = false; });
    modeMulti.addEventListener("click", function () { solo.hidden = true; multi.hidden = false;
      if (window.QKDMulti) window.QKDMulti.mount(multi); });

    function showPanels() { for (var r in panels) panels[r].hidden = (r !== myRole); }
    solo.querySelectorAll(".role").forEach(function (b) {
      b.addEventListener("click", function () {
        solo.querySelectorAll(".role").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on"); myRole = b.getAttribute("data-role"); showPanels(); startRound();
      });
    });

    function animate(result) {
      photons.innerHTML = "";
      for (var i = 0; i < Math.min(result.n, 40); i++) { var d = document.createElement("span"); d.className = "photon"; d.style.animationDelay = (i * 25) + "ms"; photons.appendChild(d); }
      var pct = Math.round(result.sampleQBER * 100);
      meter.style.width = Math.min(100, pct * 3) + "%";
      meter.className = "qber-fill " + (result.sampleQBER > window.QuantumIntercept.ABORT ? "hot" : "cool");
      qtext.textContent = "QBER: " + pct + "% (abort line 11%)";
    }
    function postScore(s) { fetch("/api/qkd/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ score: Math.max(0, s) }) }).catch(function () {}); }
    function finish(result, decision) {
      var sc = window.QuantumIntercept.scoreRound(myRole, result, decision);
      score += sc.delta; scoreEl.textContent = "Score: " + score;
      if (score > peak) { peak = score; if (peak >= 1) postScore(peak); }
      reveal.textContent = (sc.youWon ? "You win this round (+" + sc.delta + "). " : "You lose this round. ")
        + (result.eveHit ? "Eve was intercepting" : "Channel was clean")
        + " — QBER " + Math.round(result.sampleQBER * 100) + "%, key " + result.finalKey + " bits"
        + (decision === "abort" ? ", ABORTED." : ", KEPT.");
      info.textContent = "Pick your role above to play another round.";
    }

    function startRound() {
      reveal.textContent = ""; pending = {};
      if (myRole === "alice") { info.textContent = "Set your key length and check sample, then Send key."; }
      else { var a = window.QuantumIntercept.computerStrategy("alice", {}, Math.random); pending.n = a.n; pending.s = a.s;
             if (myRole === "eve") info.textContent = "Choose how aggressively to intercept.";
             else { pending.p = window.QuantumIntercept.computerStrategy("eve", {}, Math.random).p; resolveAndAwaitBob(); } }
    }
    function resolveAndAwaitBob() {
      pending.result = window.QuantumIntercept.resolveRound(pending, Math.random);
      animate(pending.result);
      if (myRole === "bob") { info.textContent = "Inspect the QBER, then KEEP or ABORT."; }
      else { var dec = window.QuantumIntercept.computerStrategy("bob", { sampleQBER: pending.result.sampleQBER }, Math.random).decision; finish(pending.result, dec); }
    }

    // Alice controls
    var alN = document.getElementById("al-n"), alS = document.getElementById("al-s");
    if (alN) { alN.addEventListener("input", function () { document.getElementById("al-n-val").textContent = alN.value; }); }
    if (alS) { alS.addEventListener("input", function () { document.getElementById("al-s-val").textContent = alS.value; }); }
    var alSend = document.getElementById("al-send");
    if (alSend) alSend.addEventListener("click", function () {
      pending.n = parseInt(alN.value, 10); pending.s = parseInt(alS.value, 10);
      pending.p = window.QuantumIntercept.computerStrategy("eve", {}, Math.random).p; resolveAndAwaitBob();
    });
    // Eve controls
    solo.querySelectorAll(".ev").forEach(function (b) { b.addEventListener("click", function () {
      pending.p = parseFloat(b.getAttribute("data-p")); resolveAndAwaitBob(); }); });
    // Bob controls
    var keep = document.getElementById("btn-keep"), abort = document.getElementById("btn-abort");
    if (keep) keep.addEventListener("click", function () { if (pending && pending.result) finish(pending.result, "keep"); });
    if (abort) abort.addEventListener("click", function () { if (pending && pending.result) finish(pending.result, "abort"); });

    // default: show solo, no role chosen yet
    solo.hidden = false;
    window.addEventListener("pagehide", function () { if (peak >= 1) postScore(peak); });
  });
```

- [ ] **Step 3: Append QKD CSS to `app.css`**

```css
.qkd-modes{ display:flex; gap:.5rem; flex-wrap:wrap; margin:1rem 0; }
.qkd-roles{ display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; margin-bottom:1rem; }
.chip.role.on, .chip.ev.on{ background:var(--accent); color:#04120f; }
.qkd .row{ display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; }
.qkd-panel{ display:flex; gap:.75rem; flex-wrap:wrap; align-items:center; margin:.75rem 0; }
.qkd-panel label{ display:flex; gap:.4rem; align-items:center; font-size:.9rem; }
.qkd-reveal{ min-height:1.5rem; margin:.5rem 0; color:var(--accent); font-family:var(--mono); }
```

- [ ] **Step 4: Replace `tests/test_ui_qkd.py`** (keep the double-render guard; drive the new Solo flow; keep the score-post seam test)

```python
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
```

- [ ] **Step 5: Run**

Run: `python -m pytest tests/test_ui_qkd.py tests/test_js_qkd_resolver.py -v` then `python -m pytest -q` — all green (browser tests skip without Chrome).

- [ ] **Step 6: Commit**

```bash
git add quantumbreach/static/js/qkd.js quantumbreach/templates/qkd.html quantumbreach/static/css/app.css tests/test_ui_qkd.py
git commit -m "feat(qkd): Solo mode UI — mode/role select, per-role panels, reveal + scoreboard"
```

---

## Task 3: Python resolver engine (mirrors the JS resolver, seedable)

**Files:**
- Create: `quantumbreach/qkd/__init__.py` (empty)
- Create: `quantumbreach/qkd/engine.py`
- Test: `tests/test_qkd_engine.py`

**Interfaces:**
- Produces `quantumbreach/qkd/engine.py`: `resolve_round(config, rng=None) -> dict`, `score_round(role, result, decision) -> dict`, `computer_strategy(role, public, rng=None) -> dict`, constant `ABORT=0.11`. Same keys/shapes as the JS versions. `rng` is a callable `() -> float in [0,1)` (defaults to `random.random`). MUST follow the plan's RNG contract identically to the JS resolver.

- [ ] **Step 1: Write the failing test** `tests/test_qkd_engine.py` (same seeded VEC as the JS test — proves cross-language agreement)

```python
from quantumbreach.qkd import engine

VEC = [float(x) for x in (
    "0.10,0.10,0.99,0.50,0.50,0.10,0.50,"
    "0.90,0.90,0.99,0.50,0.50,0.90,0.50,"
    "0.10,0.10,0.99,0.50,0.50,0.90,0.50,"
    "0.90,0.90,0.99,0.50,0.50,0.10,0.50"
).split(",")]


def _vec_rng(vec):
    it = iter(vec)
    return lambda: next(it)


def test_resolver_matches_js_vector():
    r = engine.resolve_round({"n": 4, "s": 0, "p": 0}, _vec_rng(VEC))
    assert r["sifted"] == 2
    assert r["sampleQBER"] == 0
    assert r["finalKey"] == 2
    assert r["stolen"] == 0 and r["eveHit"] is False


def test_full_intercept_raises_qber():
    # One photon, sample size 1, full intercept. Hand-traced:
    #  aBit=_bit(.1)=0, aBasis=_basis(.1)="+"; intercept .0<1.0 yes;
    #  eBasis=_basis(.9)="x" (!= "+") -> eBit=_bit(.9)=1, channel=(1,"x");
    #  bBasis=_basis(.1)="+" (!= "x") -> bBit=_bit(.5)=1; bases match ("+"=="+") -> sifted=1;
    #  sample of 1: Alice bit 0 vs Bob bit 1 -> mismatch -> QBER 1.0; finalKey = 1-1 = 0.
    r = engine.resolve_round({"n": 1, "s": 1, "p": 1.0}, _vec_rng([0.1, 0.1, 0.0, 0.9, 0.9, 0.1, 0.5]))
    assert r["sifted"] == 1 and r["eveHit"] is True
    assert r["sampleQBER"] == 1.0        # Eve's interception injected a detectable error
    assert r["finalKey"] == 0 and r["stolen"] == 0


def test_scoring_and_strategy():
    assert engine.score_round("bob", {"eveHit": True, "stolen": 3, "finalKey": 5}, "abort") == {"delta": 25, "youWon": True}
    assert engine.score_round("eve", {"eveHit": True, "stolen": 3, "finalKey": 5}, "keep") == {"delta": 3, "youWon": True}
    assert engine.score_round("alice", {"eveHit": False, "stolen": 0, "finalKey": 5}, "keep") == {"delta": 5, "youWon": True}
    assert engine.computer_strategy("bob", {"sampleQBER": 0.30}) == {"decision": "abort"}
    assert engine.computer_strategy("bob", {"sampleQBER": 0.02}) == {"decision": "keep"}
    a = engine.computer_strategy("alice", {}, lambda: 0.0)
    assert a == {"n": 16, "s": 2}
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_qkd_engine.py -v`
Expected: FAIL — `quantumbreach.qkd.engine` does not exist.

- [ ] **Step 3: Create `quantumbreach/qkd/__init__.py`** (empty file) and **`quantumbreach/qkd/engine.py`**

```python
"""Authoritative BB84 round resolver for multiplayer. Mirrors static/js/qkd.js exactly.

RNG contract (identical to the JS resolver): rng() -> float in [0,1). Per photon we
draw EXACTLY 7 floats in this order: aBit, aBasis, eve-intercept, eve-basis,
eve-mismatch-bit, bob-basis, bob-mismatch-bit — all seven every photon.
"""
import random

ABORT = 0.11
DETECT = 25


def _bit(d):
    return 0 if d < 0.5 else 1


def _basis(d):
    return "+" if d < 0.5 else "x"


def resolve_round(config, rng=None):
    rng = rng or random.random
    n = max(1, int(config["n"]))
    p = min(1.0, max(0.0, float(config.get("p", 0) or 0)))
    s = max(0, int(config.get("s", 0) or 0))
    a_bits, a_bases, b_bases, b_bits, intercepted, e_bases = [], [], [], [], [], []
    for _ in range(n):
        d0, d1, d2, d3, d4, d5, d6 = (rng(), rng(), rng(), rng(), rng(), rng(), rng())
        a_bit, a_basis = _bit(d0), _basis(d1)
        interc = d2 < p
        if interc:
            e_basis = _basis(d3)
            e_bit = a_bit if e_basis == a_basis else _bit(d4)
            ch_bit, ch_basis = e_bit, e_basis
        else:
            e_basis = ""
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
            "finalKey": final_key, "stolen": stolen, "eveHit": eve_hit}


def score_round(role, result, decision):
    eve = bool(result.get("eveHit"))
    defender, eve_delta = 0, 0
    if decision == "abort":
        if eve:
            defender = DETECT
    else:  # keep
        if eve:
            eve_delta = int(result.get("stolen") or 0)
        else:
            defender = int(result.get("finalKey") or 0)
    delta = eve_delta if role == "eve" else defender
    return {"delta": delta, "youWon": delta > 0}


def computer_strategy(role, public, rng=None):
    rng = rng or random.random
    if role == "alice":
        n = 16 + int(rng() * 17)
        return {"n": n, "s": max(2, n // 6)}
    if role == "eve":
        r = rng()
        p = 0.0 if r < 0.35 else 0.25 if r < 0.6 else 0.5 if r < 0.85 else 1.0
        return {"p": p}
    q = (public or {}).get("sampleQBER", 0.0)
    return {"decision": "abort" if q > ABORT else "keep"}
```

- [ ] **Step 4: Run to verify it passes**

Run: `python -m pytest tests/test_qkd_engine.py -v`
Expected: PASS. (The `sifted`/`sampleQBER`/`finalKey`/`stolen`/`eveHit` from `test_resolver_matches_js_vector` MUST equal the JS `test_resolver_clean_channel_seeded` values — that is the cross-language guarantee.)

- [ ] **Step 5: Commit**

```bash
git add quantumbreach/qkd/__init__.py quantumbreach/qkd/engine.py tests/test_qkd_engine.py
git commit -m "feat(qkd): authoritative Python BB84 resolver mirroring the JS resolver"
```

---

## Task 4: Multiplayer schema + game room (create/join/start/state, lobby)

**Files:**
- Modify: `quantumbreach/schema.sql`
- Create: `quantumbreach/qkd/service.py`
- Create: `quantumbreach/qkd/routes.py`
- Modify: `quantumbreach/__init__.py` (register blueprint)
- Test: `tests/test_qkd_multiplayer.py`

**Interfaces:**
- Produces service fns `create_game(db, user, role) -> dict`, `join_game(db, code, user, role) -> dict`, `start_game(db, code) -> dict`, `game_state(db, code, user) -> dict`; raises `GameError(msg, status)` for bad requests. Routes: `POST /api/qkd/game`, `POST /api/qkd/game/<code>/join`, `POST /api/qkd/game/<code>/start`, `GET /api/qkd/game/<code>`. (`act` + resolution land in Task 5.)
- Consumes: `qkd_games`, `qkd_game_seats`, `current_user`, `get_db`.

- [ ] **Step 1: Add tables to `quantumbreach/schema.sql`** (append; picked up by `init_db`'s `executescript` on every boot)

```sql
CREATE TABLE IF NOT EXISTS qkd_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    phase TEXT NOT NULL DEFAULT 'lobby',
    round INTEGER NOT NULL DEFAULT 0,
    config TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qkd_game_seats (
    game_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'computer',
    user_id INTEGER,
    display_name TEXT,
    action TEXT,
    score INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (game_id, role),
    FOREIGN KEY (game_id) REFERENCES qkd_games(id)
);
```

- [ ] **Step 2: Write the failing test** `tests/test_qkd_multiplayer.py`

```python
from quantumbreach.db import get_db


def _guest(app):
    c = app.test_client()
    c.get("/")  # provision a guest + cookie
    return c


def test_create_join_start_and_lobby_state(app):
    host = _guest(app)
    r = host.post("/api/qkd/game", json={"role": "alice"})
    assert r.status_code == 200
    code = r.get_json()["code"]
    assert r.get_json()["role"] == "alice"

    bob = _guest(app)
    assert bob.post(f"/api/qkd/game/{code}/join", json={"role": "bob"}).get_json()["role"] == "bob"
    # taking a claimed role fails
    assert bob.post(f"/api/qkd/game/{code}/join", json={"role": "alice"}).status_code == 409
    # unknown game
    assert bob.post("/api/qkd/game/ZZZZ/join", json={"role": "eve"}).status_code == 404

    state = host.get(f"/api/qkd/game/{code}").get_json()
    assert state["phase"] == "lobby"
    assert state["yourRole"] == "alice"
    seats = {s["role"]: s for s in state["seats"]}
    assert seats["alice"]["kind"] == "human" and seats["bob"]["kind"] == "human"
    assert seats["eve"]["kind"] == "computer"     # unfilled seat is computer

    host.post(f"/api/qkd/game/{code}/start")
    assert host.get(f"/api/qkd/game/{code}").get_json()["phase"] == "alice_setup"


def test_state_hides_secrets_in_lobby(app):
    host = _guest(app)
    code = host.post("/api/qkd/game", json={"role": "eve"}).get_json()["code"]
    body = host.get(f"/api/qkd/game/{code}").get_data(as_text=True)
    assert "aBits" not in body and "aBases" not in body   # never leak raw round data
```

- [ ] **Step 3: Run to verify it fails**

Run: `python -m pytest tests/test_qkd_multiplayer.py -v`
Expected: FAIL — endpoints 404 (blueprint not registered yet).

- [ ] **Step 4: Create `quantumbreach/qkd/service.py`**

```python
import json
import secrets
import string

ROLES = ("alice", "bob", "eve")
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous chars


class GameError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def _new_code(db):
    for _ in range(20):
        code = "".join(secrets.choice(_ALPHABET) for _ in range(4))
        if not db.execute("SELECT 1 FROM qkd_games WHERE code=?", (code,)).fetchone():
            return code
    raise GameError("could not allocate a game code", 500)


def _game(db, code):
    g = db.execute("SELECT * FROM qkd_games WHERE code=?", (code.upper(),)).fetchone()
    if not g:
        raise GameError("no such game", 404)
    return g


def _seats(db, game_id):
    return db.execute("SELECT * FROM qkd_game_seats WHERE game_id=? ORDER BY role", (game_id,)).fetchall()


def _seat_for_user(db, game_id, user_id):
    return db.execute("SELECT * FROM qkd_game_seats WHERE game_id=? AND user_id=?", (game_id, user_id)).fetchone()


def create_game(db, user, role):
    if role not in ROLES:
        raise GameError("bad role")
    code = _new_code(db)
    cur = db.execute("INSERT INTO qkd_games (code, phase, round) VALUES (?, 'lobby', 0)", (code,))
    gid = cur.lastrowid
    for r in ROLES:
        if r == role:
            db.execute("INSERT INTO qkd_game_seats (game_id, role, kind, user_id, display_name) VALUES (?,?, 'human', ?, ?)",
                       (gid, r, user["id"], user["display_name"]))
        else:
            db.execute("INSERT INTO qkd_game_seats (game_id, role, kind, display_name) VALUES (?,?, 'computer', 'Computer')", (gid, r))
    db.commit()
    return {"code": code, "role": role}


def join_game(db, code, user, role):
    if role not in ROLES:
        raise GameError("bad role")
    g = _game(db, code)
    if g["phase"] != "lobby":
        raise GameError("game already started", 409)
    if _seat_for_user(db, g["id"], user["id"]):
        raise GameError("already seated in this game", 409)
    seat = db.execute("SELECT * FROM qkd_game_seats WHERE game_id=? AND role=?", (g["id"], role)).fetchone()
    if seat["kind"] == "human":
        raise GameError("role already taken", 409)
    db.execute("UPDATE qkd_game_seats SET kind='human', user_id=?, display_name=? WHERE game_id=? AND role=?",
               (user["id"], user["display_name"], g["id"], role))
    db.commit()
    return {"code": g["code"], "role": role}


def start_game(db, code):
    g = _game(db, code)
    if g["phase"] == "lobby":
        db.execute("UPDATE qkd_games SET phase='alice_setup', round=1, updated_at=CURRENT_TIMESTAMP WHERE id=?", (g["id"],))
        db.execute("UPDATE qkd_game_seats SET action=NULL WHERE game_id=?", (g["id"],))
        db.commit()
        advance(db, _game(db, code))  # no-op placeholder in Task 4; the real machine lands in Task 5
    return game_state(db, code, None)


def game_state(db, code, user):
    g = _game(db, code)
    seats = _seats(db, g["id"])
    your = _seat_for_user(db, g["id"], user["id"]) if user else None
    your_role = your["role"] if your else None
    cfg = json.loads(g["config"] or "{}")
    view = {
        "code": g["code"], "phase": g["phase"], "round": g["round"],
        "yourRole": your_role,
        "seats": [{"role": s["role"], "kind": s["kind"], "name": s["display_name"],
                   "submitted": s["action"] is not None} for s in seats],
        "scores": [{"role": s["role"], "name": s["display_name"], "score": s["score"]} for s in seats],
        "youAreUpNow": _is_up(g["phase"], your_role, seats),
    }
    # Bob sees the sample QBER only during his decision phase.
    if g["phase"] == "bob_decision" and your_role == "bob" and "result" in cfg:
        view["sampleQBER"] = cfg["result"]["sampleQBER"]
    # Full reveal only at resolve/ended.
    if g["phase"] in ("resolve", "ended") and "lastResult" in cfg:
        view["lastResult"] = cfg["lastResult"]
    return view


def _is_up(phase, role, seats):
    if role is None:
        return False
    need = {"alice_setup": "alice", "eve_move": "eve", "bob_decision": "bob"}.get(phase)
    if need and need == role:
        by_role = {s["role"]: s for s in seats}
        return by_role[role]["action"] is None
    return phase == "resolve"  # any human may advance to the next round


# Placeholder so start_game's import resolves before Task 5 lands its real body.
def advance(db, game):  # replaced/expanded in Task 5
    return
```

- [ ] **Step 5: Create `quantumbreach/qkd/routes.py`**

```python
from flask import Blueprint, jsonify, request

from ..db import get_db
from ..identity import current_user
from . import service

bp = Blueprint("qkd", __name__)


def _err(e):
    return jsonify({"error": e.message}), e.status


@bp.route("/api/qkd/game", methods=["POST"])
def create():
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(service.create_game(get_db(), current_user(), data.get("role")))
    except service.GameError as e:
        return _err(e)


@bp.route("/api/qkd/game/<code>/join", methods=["POST"])
def join(code):
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(service.join_game(get_db(), code, current_user(), data.get("role")))
    except service.GameError as e:
        return _err(e)


@bp.route("/api/qkd/game/<code>/start", methods=["POST"])
def start(code):
    try:
        return jsonify(service.start_game(get_db(), code))
    except service.GameError as e:
        return _err(e)


@bp.route("/api/qkd/game/<code>", methods=["GET"])
def state(code):
    try:
        return jsonify(service.game_state(get_db(), code, current_user()))
    except service.GameError as e:
        return _err(e)
```

- [ ] **Step 6: Register the blueprint in `quantumbreach/__init__.py`** (after the rooms blueprint)

```python
    from .qkd.routes import bp as qkd_bp
    app.register_blueprint(qkd_bp)
```

- [ ] **Step 7: Run**

Run: `python -m pytest tests/test_qkd_multiplayer.py -v` then `python -m pytest -q` — all green.

- [ ] **Step 8: Commit**

```bash
git add quantumbreach/schema.sql quantumbreach/qkd/service.py quantumbreach/qkd/routes.py quantumbreach/__init__.py tests/test_qkd_multiplayer.py
git commit -m "feat(qkd): multiplayer game room — schema, create/join/start/state, lobby"
```

---

## Task 5: Phase machine — act, resolve, scoring, computer auto-submit, timeout

**Files:**
- Modify: `quantumbreach/qkd/service.py` (replace the `advance` placeholder; add `submit_action`, computer auto-submit, resolution, scoring, timeout, round loop)
- Modify: `quantumbreach/qkd/routes.py` (add the `act` route)
- Test: `tests/test_qkd_multiplayer.py` (add lifecycle, idempotency, secrecy-per-phase, scoring/badge)

**Interfaces:**
- Produces `submit_action(db, code, user, action) -> dict` and a real `advance(db, game)`; adds `POST /api/qkd/game/<code>/act`. On the last round the game moves to `phase='ended'` and each human seat's score is written to `qkd_scores` (awarding `qkd-operative` on first score ≥ 1, via `progress._award_badge`).
- Consumes: `.engine`, `..progress.service._award_badge`, `qkd_scores`.

- [ ] **Step 1: Write the failing test** (append to `tests/test_qkd_multiplayer.py`)

```python
import json
from quantumbreach.db import get_db


def _solo_game(app, role):
    """A 1-human game: the human takes `role`, computer plays the other two."""
    c = _guest(app)
    code = c.post("/api/qkd/game", json={"role": role}).get_json()["code"]
    c.post(f"/api/qkd/game/{code}/start")
    return c, code


def test_full_round_as_bob_scores_and_reveals(app):
    c, code = _solo_game(app, "bob")
    # computer Alice + Eve auto-submit; we should now be at bob_decision with a QBER visible to Bob
    st = c.get(f"/api/qkd/game/{code}").get_json()
    assert st["phase"] == "bob_decision"
    assert "sampleQBER" in st and st["youAreUpNow"] is True
    c.post(f"/api/qkd/game/{code}/act", json={"action": {"decision": "abort"}})
    st = c.get(f"/api/qkd/game/{code}").get_json()
    assert st["phase"] in ("resolve", "ended")
    assert "lastResult" in st and "bobDecision" in st["lastResult"]


def test_act_is_idempotent(app):
    c, code = _solo_game(app, "bob")
    a = c.post(f"/api/qkd/game/{code}/act", json={"action": {"decision": "keep"}}).get_json()
    b = c.post(f"/api/qkd/game/{code}/act", json={"action": {"decision": "abort"}}).get_json()  # ignored
    assert a["phase"] == b["phase"]  # second submit for the same already-decided phase does not re-resolve


def test_bob_qber_hidden_from_eve(app):
    # Human Eve; computer Bob. Eve must never receive sampleQBER in any state view.
    c = _guest(app)
    code = c.post("/api/qkd/game", json={"role": "eve"}).get_json()["code"]
    c.post(f"/api/qkd/game/{code}/start")
    st = c.get(f"/api/qkd/game/{code}").get_json()
    assert st["phase"] == "eve_move" and "sampleQBER" not in st
    c.post(f"/api/qkd/game/{code}/act", json={"action": {"p": 1.0}})
    body = c.get(f"/api/qkd/game/{code}").get_data(as_text=True)
    # After resolve Eve sees the reveal, but there is no separate Bob-only leak before it.
    assert "sampleQBER" in body  # present inside lastResult at reveal is fine


def test_game_end_writes_qkd_score_iff_positive(app):
    # Play a full game as Bob, ABORTing every round (correct whenever computer-Eve intercepted).
    # Assert the exact persistence invariant regardless of the server's randomness:
    #   a qkd_scores row exists  <=>  the human seat finished with a positive score.
    c = _guest(app)
    code = c.post("/api/qkd/game", json={"role": "bob"}).get_json()["code"]
    c.post(f"/api/qkd/game/{code}/start")
    for _ in range(30):  # bounded; ROUNDS is small so this always reaches 'ended'
        st = c.get(f"/api/qkd/game/{code}").get_json()
        if st["phase"] == "ended":
            break
        if st["phase"] == "bob_decision":
            c.post(f"/api/qkd/game/{code}/act", json={"action": {"decision": "abort"}})
        elif st["phase"] == "resolve":
            c.post(f"/api/qkd/game/{code}/act", json={"action": {"next": True}})
    final = c.get(f"/api/qkd/game/{code}").get_json()
    assert final["phase"] == "ended"
    bob_score = next(s["score"] for s in final["scores"] if s["role"] == "bob")
    with app.app_context():
        rows = get_db().execute("SELECT COUNT(*) AS n FROM qkd_scores").fetchone()["n"]
    assert (rows >= 1) == (bob_score > 0)  # written iff the human actually scored
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_qkd_multiplayer.py -v`
Expected: the new tests FAIL — `act` route 404 and `advance` is a no-op (phase never leaves `alice_setup`).

- [ ] **Step 3: Replace the tail of `quantumbreach/qkd/service.py`** (remove the placeholder `advance`; add the full machine)

Replace the placeholder `def advance(db, game): return` with:

```python
import random  # add to the imports at the top of service.py
from .engine import resolve_round, score_round, computer_strategy
from ..progress.service import _award_badge

ROUNDS = 3          # rounds per game (tunable)
TIMEOUT_SECONDS = 60


def _set_config(db, game_id, cfg):
    db.execute("UPDATE qkd_games SET config=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
               (json.dumps(cfg), game_id))


def _set_phase(db, game_id, phase):
    db.execute("UPDATE qkd_games SET phase=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (phase, game_id))


def _seat(db, game_id, role):
    return db.execute("SELECT * FROM qkd_game_seats WHERE game_id=? AND role=?", (game_id, role)).fetchone()


def _set_action(db, game_id, role, action):
    db.execute("UPDATE qkd_game_seats SET action=? WHERE game_id=? AND role=?",
               (json.dumps(action), game_id, role))


def submit_action(db, code, user, action):
    g = _game(db, code)
    seat = _seat_for_user(db, g["id"], user["id"])
    if not seat:
        raise GameError("not seated in this game", 403)
    role = seat["role"]
    phase = g["phase"]
    if phase == "resolve":
        if action.get("next"):
            _next_round(db, g)
        return game_state(db, code, user)
    expected = {"alice_setup": "alice", "eve_move": "eve", "bob_decision": "bob"}.get(phase)
    if expected != role:
        raise GameError("not your turn", 409)
    if seat["action"] is not None:
        return game_state(db, code, user)  # idempotent: already submitted
    _set_action(db, g["id"], role, action)
    db.commit()
    advance(db, _game(db, code))
    return game_state(db, code, user)


def _computer_public(cfg, phase):
    if phase == "bob_decision" and "result" in cfg:
        return {"sampleQBER": cfg["result"]["sampleQBER"]}
    return {}


def advance(db, game):
    """Drive the phase machine as far as computer seats allow, resolving when Alice+Eve are in."""
    gid = game["id"]
    for _ in range(6):  # bounded: at most a few transitions per call
        g = _game(db, game["code"])
        phase = g["phase"]
        cfg = json.loads(g["config"] or "{}")
        if phase in ("lobby", "resolve", "ended"):
            return
        expected = {"alice_setup": "alice", "eve_move": "eve", "bob_decision": "bob"}[phase]
        seat = _seat(db, gid, expected)
        if seat["action"] is None:
            if seat["kind"] == "computer":
                _set_action(db, gid, expected, computer_strategy(expected, _computer_public(cfg, phase), random.random))
                db.commit()
            else:
                return  # waiting on a human
        # the expected action is present -> fold it in and move on
        act = json.loads(_seat(db, gid, expected)["action"])
        if phase == "alice_setup":
            cfg["alice"] = {"n": int(act.get("n", 24)), "s": int(act.get("s", 6))}
            _set_config(db, gid, cfg); _set_phase(db, gid, "eve_move"); db.commit()
        elif phase == "eve_move":
            cfg["eve"] = {"p": float(act.get("p", 0) or 0)}
            result = resolve_round({"n": cfg["alice"]["n"], "s": cfg["alice"]["s"], "p": cfg["eve"]["p"]}, random.random)
            cfg["result"] = result
            _set_config(db, gid, cfg); _set_phase(db, gid, "bob_decision"); db.commit()
        elif phase == "bob_decision":
            decision = "abort" if act.get("decision") == "abort" else "keep"
            _resolve_scoring(db, g, cfg, decision)
            return


def _resolve_scoring(db, g, cfg, decision):
    gid = g["id"]
    result = cfg["result"]
    per_role = {}
    for role in ROLES:
        sc = score_round(role, result, decision)
        per_role[role] = sc["delta"]
        db.execute("UPDATE qkd_game_seats SET score=score+? WHERE game_id=? AND role=?", (sc["delta"], gid, role))
    cfg["lastResult"] = {
        "eveHit": result["eveHit"], "sampleQBER": result["sampleQBER"], "finalKey": result["finalKey"],
        "stolen": result["stolen"], "sifted": result["sifted"], "bobDecision": decision,
        "aliceConfig": cfg["alice"], "eveConfig": cfg["eve"], "perRole": per_role, "round": g["round"],
    }
    _set_config(db, gid, cfg); _set_phase(db, gid, "resolve"); db.commit()


def _next_round(db, g):
    gid = g["id"]
    if g["round"] >= ROUNDS:
        _end_game(db, g)
        return
    db.execute("UPDATE qkd_games SET round=round+1, phase='alice_setup', updated_at=CURRENT_TIMESTAMP WHERE id=?", (gid,))
    db.execute("UPDATE qkd_game_seats SET action=NULL WHERE game_id=?", (gid,))
    cfg = json.loads(g["config"] or "{}")
    for k in ("alice", "eve", "result"):
        cfg.pop(k, None)
    _set_config(db, gid, cfg)
    db.commit()
    advance(db, _game(db, g["code"]))


def _end_game(db, g):
    _set_phase(db, g["id"], "ended")
    for s in _seats(db, g["id"]):
        if s["kind"] == "human" and s["user_id"] is not None and s["score"] > 0:
            db.execute("INSERT INTO qkd_scores (user_id, score) VALUES (?,?)", (s["user_id"], s["score"]))
            _award_badge(db, s["user_id"], "qkd-operative")
    db.commit()
```

Also update `game_state` so a stalled human seat is covered by a soft timeout (add near the top of `game_state`, right after `g = _game(db, code)`):

```python
    _maybe_timeout(db, g)
    g = _game(db, code)
```

and add the helper:

```python
def _maybe_timeout(db, g):
    if g["phase"] not in ("alice_setup", "eve_move", "bob_decision"):
        return
    stale = db.execute(
        "SELECT (strftime('%s','now') - strftime('%s', updated_at)) AS age FROM qkd_games WHERE id=?",
        (g["id"],)).fetchone()["age"]
    if stale is not None and stale > TIMEOUT_SECONDS:
        expected = {"alice_setup": "alice", "eve_move": "eve", "bob_decision": "bob"}[g["phase"]]
        seat = _seat(db, g["id"], expected)
        if seat["kind"] == "human" and seat["action"] is None:
            cfg = json.loads(g["config"] or "{}")
            _set_action(db, g["id"], expected, computer_strategy(expected, _computer_public(cfg, g["phase"]), random.random))
            db.commit()
            advance(db, _game(db, g["code"]))
```

- [ ] **Step 4: Add the `act` route to `quantumbreach/qkd/routes.py`**

```python
@bp.route("/api/qkd/game/<code>/act", methods=["POST"])
def act(code):
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(service.submit_action(get_db(), code, current_user(), data.get("action") or {}))
    except service.GameError as e:
        return _err(e)
```

- [ ] **Step 5: Run**

Run: `python -m pytest tests/test_qkd_multiplayer.py tests/test_qkd_engine.py -v` then `python -m pytest -q` — all green.

- [ ] **Step 6: Commit**

```bash
git add quantumbreach/qkd/service.py quantumbreach/qkd/routes.py tests/test_qkd_multiplayer.py
git commit -m "feat(qkd): phase machine — act, resolve, scoring, computer auto-submit, timeout, end->qkd_scores"
```

---

## Task 6: Multiplayer client (create/join, poll loop, round UI)

**Files:**
- Create: `quantumbreach/static/js/qkd-multi.js`
- Modify: `quantumbreach/templates/qkd.html` (fill the `#qkd-multi` container + include the script)
- Modify: `quantumbreach/static/css/app.css` (append)
- Test: `tests/test_ui_qkd_multi.py`

**Interfaces:**
- Produces `window.QKDMulti = { mount(container) }`, called by the mode toggle from Task 2. Renders create/join → lobby → round view; polls `GET /api/qkd/game/<code>` every 1500 ms; submits via the Task 5 endpoints.

- [ ] **Step 1: Add the multiplayer markup to `qkd.html`** — replace `<div id="qkd-multi" hidden><!-- populated in Phase 3 --></div>` with:

```html
<div id="qkd-multi" class="qkd" hidden>
  <div id="qm-join">
    <div class="qkd-roles">
      <span class="muted">Create a game as:</span>
      <button class="chip" data-create="alice" type="button">Alice</button>
      <button class="chip" data-create="bob" type="button">Bob</button>
      <button class="chip" data-create="eve" type="button">Eve</button>
    </div>
    <div class="qkd-panel">
      <label>Join a code: <input id="qm-code" maxlength="4" placeholder="ABCD" autocomplete="off"></label>
      <button class="chip" data-join="alice" type="button">as Alice</button>
      <button class="chip" data-join="bob" type="button">as Bob</button>
      <button class="chip" data-join="eve" type="button">as Eve</button>
    </div>
    <p id="qm-hint" class="muted"></p>
  </div>
  <div id="qm-play" hidden>
    <p><strong>Code: <span id="qm-mycode"></span></strong> — share it with players on the same Wi‑Fi.</p>
    <div id="qm-seats" class="qkd-roles"></div>
    <button class="btn" id="qm-start" type="button" hidden>Start game</button>
    <div id="qm-photons" class="qkd-photons"></div>
    <div class="qber"><div id="qm-qber" class="qber-fill cool"></div></div>
    <p id="qm-status" class="muted"></p>
    <div id="qm-controls" class="qkd-panel"></div>
    <div id="qm-reveal" class="qkd-reveal"></div>
    <div id="qm-scores" class="row"></div>
  </div>
</div>
```

and add its script to the scripts block (BEFORE `qkd.js` so `window.QKDMulti` exists when the mode toggle calls it):

```jinja
{% block scripts %}
  <script src="{{ url_for('static', filename='js/qkd-multi.js') }}"></script>
  <script src="{{ url_for('static', filename='js/qkd.js') }}"></script>
{% endblock %}
```

- [ ] **Step 2: Create `quantumbreach/static/js/qkd-multi.js`**

```javascript
(function () {
  var code = null, role = null, timer = null, lastPhase = null;

  function api(url, body) {
    return fetch(url, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json(); });
  }
  function $(id) { return document.getElementById(id); }

  function mount(container) {
    container.querySelectorAll("[data-create]").forEach(function (b) {
      b.addEventListener("click", function () {
        api("/api/qkd/game", { role: b.getAttribute("data-create") }).then(function (d) {
          if (d.error) { $("qm-hint").textContent = d.error; return; } enter(d.code, d.role, true); });
      });
    });
    container.querySelectorAll("[data-join]").forEach(function (b) {
      b.addEventListener("click", function () {
        var c = ($("qm-code").value || "").toUpperCase().trim(); if (c.length !== 4) { $("qm-hint").textContent = "Enter a 4-letter code."; return; }
        api("/api/qkd/game/" + c + "/join", { role: b.getAttribute("data-join") }).then(function (d) {
          if (d.error) { $("qm-hint").textContent = d.error; return; } enter(c, d.role, false); });
      });
    });
    $("qm-start").addEventListener("click", function () { api("/api/qkd/game/" + code + "/start", {}).then(render); });
  }

  function enter(c, r, isHost) {
    code = c; role = r; $("qm-join").hidden = true; $("qm-play").hidden = false; $("qm-mycode").textContent = c;
    $("qm-start").hidden = !isHost;
    if (timer) clearInterval(timer); timer = setInterval(poll, 1500); poll();
  }
  function poll() { api("/api/qkd/game/" + code).then(render); }

  function render(st) {
    if (!st || st.error) return;
    $("qm-seats").innerHTML = st.seats.map(function (s) {
      return '<span class="chip' + (s.role === st.yourRole ? ' on' : '') + '">' + s.role + ": " + s.name + (s.submitted ? " ✓" : "") + "</span>";
    }).join("");
    $("qm-start").hidden = !(st.phase === "lobby" && $("qm-start").hidden === false);
    $("qm-scores").innerHTML = st.scores.map(function (s) { return '<span class="chip">' + s.role + ": " + s.score + "</span>"; }).join("");
    if (st.phase === "bob_decision" && typeof st.sampleQBER === "number") {
      var pct = Math.round(st.sampleQBER * 100); $("qm-qber").style.width = Math.min(100, pct * 3) + "%";
      $("qm-qber").className = "qber-fill " + (st.sampleQBER > 0.11 ? "hot" : "cool");
    }
    if (st.phase !== lastPhase) { $("qm-photons").innerHTML = ""; for (var i = 0; i < 24; i++) { var d = document.createElement("span"); d.className = "photon"; d.style.animationDelay = (i * 25) + "ms"; $("qm-photons").appendChild(d); } lastPhase = st.phase; }
    renderControls(st); renderStatus(st);
  }

  function renderStatus(st) {
    var map = { lobby: "Waiting in the lobby…", alice_setup: "Alice is setting up the key…",
      eve_move: "Eve is choosing whether to intercept…", bob_decision: "Bob is deciding keep or abort…",
      resolve: "Round over — see the result below.", ended: "Game over." };
    $("qm-status").textContent = (st.youAreUpNow ? "Your move. " : "") + (map[st.phase] || "");
  }

  function renderControls(st) {
    var box = $("qm-controls"), rv = $("qm-reveal"); box.innerHTML = ""; rv.textContent = "";
    if (st.lastResult) {
      var lr = st.lastResult;
      rv.textContent = "Round " + lr.round + ": " + (lr.eveHit ? "Eve intercepted" : "clean") +
        ", QBER " + Math.round(lr.sampleQBER * 100) + "%, key " + lr.finalKey + " bits, Bob " + lr.bobDecision.toUpperCase() + ".";
    }
    if (!st.youAreUpNow) return;
    if (st.phase === "alice_setup") {
      box.innerHTML = '<label>Key length <input id="qm-n" type="range" min="8" max="64" value="24"></label>' +
        '<label>Check sample <input id="qm-s" type="range" min="0" max="24" value="6"></label>' +
        '<button class="btn" id="qm-al-go" type="button">Send key</button>';
      $("qm-al-go").addEventListener("click", function () {
        act({ n: parseInt($("qm-n").value, 10), s: parseInt($("qm-s").value, 10) }); });
    } else if (st.phase === "eve_move") {
      [["None", 0], ["Light", 0.25], ["Heavy", 0.5], ["Full", 1]].forEach(function (o) {
        var b = document.createElement("button"); b.className = "chip"; b.type = "button"; b.textContent = o[0];
        b.addEventListener("click", function () { act({ p: o[1] }); }); box.appendChild(b); });
    } else if (st.phase === "bob_decision") {
      box.innerHTML = '<button class="btn" id="qm-keep" type="button">KEEP KEY</button>' +
        '<button class="btn ghost" id="qm-abort" type="button">ABORT</button>';
      $("qm-keep").addEventListener("click", function () { act({ decision: "keep" }); });
      $("qm-abort").addEventListener("click", function () { act({ decision: "abort" }); });
    } else if (st.phase === "resolve") {
      box.innerHTML = '<button class="btn" id="qm-next" type="button">Next round</button>';
      $("qm-next").addEventListener("click", function () { act({ next: true }); });
    }
  }
  function act(action) { api("/api/qkd/game/" + code + "/act", { action: action }).then(render); }

  window.QKDMulti = { mount: mount };
})();
```

- [ ] **Step 3: Append multiplayer CSS to `app.css`**

```css
#qm-seats .chip.on{ background:var(--accent); color:#04120f; }
#qm-controls{ margin:.75rem 0; }
#qm-scores{ gap:.5rem; }
```

- [ ] **Step 4: Write `tests/test_ui_qkd_multi.py`** (two browser contexts join one game; the third seat is computer)

```python
from tests.browser_utils import live_server, browser_page, requires_browser


@requires_browser
def test_two_players_play_a_multiplayer_round():
    with live_server() as base, browser_page() as alice, browser_page() as bob:
        # Alice creates a game as Alice; Bob joins as Bob; Eve is computer.
        alice.goto(base + "/qkd", wait_until="networkidle")
        alice.click("#mode-multi")
        alice.click('[data-create="alice"]')
        code = alice.inner_text("#qm-mycode").strip()
        assert len(code) == 4

        bob.goto(base + "/qkd", wait_until="networkidle")
        bob.click("#mode-multi")
        bob.fill("#qm-code", code)
        bob.click('[data-join="bob"]')

        alice.click("#qm-start")
        # Alice's turn first
        alice.wait_for_selector("#qm-al-go", timeout=8000)
        alice.click("#qm-al-go")
        # Eve is computer -> auto; Bob decides
        bob.wait_for_selector("#qm-keep", timeout=8000)
        bob.click("#qm-keep")
        # Both see a reveal for the round
        bob.wait_for_function("() => document.getElementById('qm-reveal').textContent.indexOf('Round') !== -1", timeout=8000)
        alice.wait_for_function("() => document.getElementById('qm-reveal').textContent.indexOf('Round') !== -1", timeout=8000)
        alice.screenshot(path="/tmp/phantomq-qkd-multi.png", full_page=True)
```

- [ ] **Step 5: Run**

Run: `python -m pytest tests/test_ui_qkd_multi.py -v` then `python -m pytest -q` — all green (browser tests skip without Chrome).

- [ ] **Step 6: Commit**

```bash
git add quantumbreach/static/js/qkd-multi.js quantumbreach/templates/qkd.html quantumbreach/static/css/app.css tests/test_ui_qkd_multi.py
git commit -m "feat(qkd): multiplayer client — create/join, polling, lobby + round UI"
```

---

## Task 7: Docs, run-skill tour, consolidated smoke test

**Files:**
- Modify: `README.md`
- Create: `docs/QKD_MULTIPLAYER.md`
- Modify: `.claude/skills/run-phantomq/drive.py` and `SKILL.md`
- Create: `tests/test_smoke_qkd_roles.py`

- [ ] **Step 1: Write `tests/test_smoke_qkd_roles.py`**

```python
def test_qkd_endpoints_reachable(client):
    client.get("/")  # guest
    r = client.post("/api/qkd/game", json={"role": "bob"})
    assert r.status_code == 200
    code = r.get_json()["code"]
    assert client.get(f"/api/qkd/game/{code}").status_code == 200
    client.post(f"/api/qkd/game/{code}/start")
    st = client.get(f"/api/qkd/game/{code}").get_json()
    assert st["phase"] in ("alice_setup", "eve_move", "bob_decision")  # computer seats advanced play


def test_qkd_page_has_both_modes(client):
    html = client.get("/qkd").get_data(as_text=True)
    assert "Solo (vs computer)" in html and "Multiplayer" in html
    assert html.count("js/qkd.js") == 1  # no double render
```

- [ ] **Step 2: Add a Solo role round to `.claude/skills/run-phantomq/drive.py`** — after the existing `[chatbot]` step, before `browser.close()`:

```python
        # v2.1 tour: QKD role-based Solo round (play Bob, then ABORT)
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-solo")
        pg.click('.role[data-role="bob"]')
        pg.wait_for_timeout(300)
        try:
            pg.click("#btn-abort")
        except Exception:
            pass
        pg.wait_for_timeout(200)
        pg.screenshot(path=os.path.join(out, "9-qkd-roles.png"), full_page=True)
        print("[qkd] played a Solo round as Bob")
```

- [ ] **Step 3: Update `SKILL.md`** — note the driver now also tours the role-based QKD Solo round (screenshot `9-qkd-roles.png`) and that `/qkd` has Solo and Multiplayer modes.

- [ ] **Step 4: Update `README.md`** — under the QKD feature, add: "Quantum Intercept now supports **role-based play** (be Alice, Bob, or Eve) in **Solo** (vs computer) and **same-network Multiplayer** (up to 3 students via a game code). See `docs/QKD_MULTIPLAYER.md`."

- [ ] **Step 5: Create `docs/QKD_MULTIPLAYER.md`**

```markdown
# QKD Multiplayer (same network)

Quantum Intercept can be played by up to 3 students on the same Wi‑Fi/LAN.

## Host
1. On one machine run `python app.py` (serves on `0.0.0.0:8000`).
2. Find that machine's LAN IP (e.g. `ipconfig` on Windows → `192.168.x.y`).
3. Everyone opens `http://<that-ip>:8000/qkd` in a browser on the same network.

## Play
1. One student picks **Multiplayer**, chooses a role (Alice/Bob/Eve) → a 4‑letter **code** appears.
2. The others pick **Multiplayer**, type the code, and claim a free role. Any empty seat is played by the computer, so 1–3 humans all work.
3. The host clicks **Start**. Each round: **Alice** sets the key length + check sample, **Eve** picks how much to intercept, **Bob** sees the error rate (QBER) and decides **KEEP** or **ABORT**. Play resolves and scores update. After the last round, scores post to the QKD leaderboard.

Notes: same-network only (no accounts, no internet server). If a player stalls, the computer takes their turn after a minute so the game never freezes.
```

- [ ] **Step 6: Run everything**

Run: `python -m pytest -q` — full suite green. Then drive the app:
`python .claude/skills/run-phantomq/drive.py --out ./_shots` and confirm it prints `[qkd] played a Solo round as Bob` and writes `9-qkd-roles.png`.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/QKD_MULTIPLAYER.md .claude/skills/run-phantomq/drive.py .claude/skills/run-phantomq/SKILL.md tests/test_smoke_qkd_roles.py
git commit -m "docs+test: QKD roles/multiplayer docs, run-skill tour, smoke test"
```

---

## Notes for the implementer

- **Cross-language resolver parity is the crux.** Tasks 1 and 3 use the same seeded `VEC`; if their `sifted/sampleQBER/finalKey/stolen/eveHit` disagree, the RNG draw order diverged — fix the resolver, not the test.
- **Secrecy is a hard requirement.** `game_state` must never place raw `aBits/aBases/bBits` in any client view; grep the response body in tests. Bob's `sampleQBER` appears only in `bob_decision` for Bob (and inside `lastResult` at reveal, which is intended).
- **SQLite writes:** every service mutation commits inside the request; `submit_action` re-reads phase/seat so a double-click or two clients advancing at once is idempotent.
- Keep `ROUNDS`, `TIMEOUT_SECONDS`, `DETECT`, intercept presets, poll interval, and slider ranges tunable; they don't change the contracts.
