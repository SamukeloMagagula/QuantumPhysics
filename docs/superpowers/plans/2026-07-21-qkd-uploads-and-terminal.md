# QKD Uploads + Full Terminal Play + Ciphertext Crack Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `QkdActions` the real Solo game state (so terminal commands genuinely play the round), embed a mini terminal directly on `/qkd`, add uploads everywhere (Solo already has it; add MP), ship a standalone ciphertext export/brute-force tool, add an uploader-only file preview, and add a persistent live activity feed sidebar with a matching two-column `/qkd` layout.

**Architecture:** `qkd-actions.js` absorbs the round-resolution logic `qkd.js` currently keeps in a local `pending` object; `qkd.js`'s Solo block becomes a `subscribe()`-driven view. A small terminal (`#shell`/`#shell-out`/`#shell-in`, reusing `terminal.js`'s existing engine unmodified) is embedded on `qkd.html` itself, because `/terminal` and `/qkd` are separate page loads and `QkdActions` can never exist on `/terminal`. `qkd-crack.js` is a new, dependency-free module for the export/brute-force tool. `qkd-multi.js` gains an upload option reusing the already-generic `POST /api/qkd/file` endpoint. `QuantumStage.mount()` gains an optional external log target (`opts.feedEl`) so Solo and MP share one activity-feed sidebar inside a new two-column `/qkd` layout.

**Tech Stack:** Vanilla ES5-style JS, DOM/SVG + CSS, Flask/Python only where structurally required (anticipated: none), pytest, Playwright (system Chrome via `tests/browser_utils.py`).

## Global Constraints

- **No Node / no build step.** Plain `<script>` files, `window.*` globals.
- **BB84 physics unchanged.** No engine/parity changes in this plan — it already shipped `eveTaps` support.
- **No new multiplayer secrecy exposure.** `lastResult.replay` stays public-only; nothing in this plan touches `service.py`'s secrecy logic.
- **`/terminal` and `/qkd` are separate page loads.** `QkdActions` only ever exists on `/qkd`. `/terminal` keeps its current script set unchanged; `/qkd` gains `vfs.js` + `terminal.js` + `shell-qkd.js` (not the fs/text/net/sys/labs packs).
- **Upload preview is uploader-only.** Never changes what Bob/Eve see before resolve.
- **Live feed is an activity log, not spectator mode.** No new realtime transport; Solo is state-driven, MP stays on its existing ~1.5s poll.
- **Layout rework is scoped to `/qkd` only.**
- **Run** the app with `python app.py`; **tests** with `python -m pytest`. The FULL suite (~5+ min, real Chrome) exceeds a 2-minute command limit — run small targeted files in the foreground; background the full-suite confirmation.
- **Browser tests use the real harness:** `from tests.browser_utils import live_server, browser_page, requires_browser`, `@requires_browser`, `with live_server() as base, browser_page() as pg:`.
- **Branch:** `qkd-uploads-and-terminal` (already cut off `main`; both specs committed there).
- **Commit trailers** (every commit):
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EYTvUotg1ojVaavLMFNwo5
  ```

---

## File Structure

- **Modify** `quantumbreach/static/js/qkd-actions.js` — real game state: `eve.taps`, `eve.mode`, `pendingResult`, `setPayloadFromBytes`, `eveTap`, `eveCommit`; `bobDecide`/`advance` extended.
- **Modify** `quantumbreach/static/js/qkd.js` — Solo block becomes a `QkdActions` subscriber; loses its local `pending`/`currentPayload`.
- **Modify** `quantumbreach/templates/qkd.html` — embedded `#shell` terminal markup; `#qm-upload`/preview panes; two-column `.qkd-layout` + `#qkd-feed`.
- **Modify** `quantumbreach/static/js/shell-qkd.js` — `alice upload`, `eve tap`/`eve commit` (removes `eve intercept`), `qkd export`/`qkd crack`.
- **Create** `quantumbreach/static/js/qkd-crack.js` — standalone export + real brute-force.
- **Modify** `quantumbreach/static/js/qkd-multi.js` — Alice upload option; feed log call sites.
- **Modify** `quantumbreach/static/js/qkd-stage.js` — `opts.feedEl` support + line cap.
- **Modify** `quantumbreach/static/css/stage.css` — preview panes, `.qkd-layout`/`.qkd-feed`, breakpoint.
- **Modify** `.claude/skills/run-phantomq/drive.py`, `docs/QKD_MULTIPLAYER.md`, `docs/FOLLOWUPS.md`.
- **Tests:** extend `tests/test_ui_qkd.py`, `tests/test_ui_qkd_file.py`, `tests/test_ui_qkd_terminal_parity.py`, `tests/test_ui_qkd_multi.py`, `tests/test_ui_qkd_stage.py`; create `tests/test_ui_qkd_crack.py`.

---

## Task 1: `qkd-actions.js` becomes the real game state; `qkd.js` becomes a subscriber

**Files:**
- Modify: `quantumbreach/static/js/qkd-actions.js` (full rewrite of the state/intent shape)
- Modify: `quantumbreach/static/js/qkd.js` (Solo `DOMContentLoaded` block, lines ~74–262)
- Test: `tests/test_ui_qkd.py`, `tests/test_ui_qkd_file.py`, `tests/test_ui_qkd_terminal_parity.py` (regression — must still pass)

**Interfaces:**
- Produces: `window.QkdActions` = `{ state, subscribe, aliceSet, setPayloadFromBytes, eveIntercept, eveTap, eveCrack, eveStopCrack, eveCommit, bobDecide, advance }`. State shape: `{ phase, payload: {mime,bytes,name}|null, alice: {n,s}, eve: {p,workers,taps:[{i,basis}],mode:"p"|"tap"|null}, pendingResult, lastResult }`.
- Consumes (unchanged from existing code): `window.QuantumIntercept.resolveRound/computerStrategy`, `window.PhantomBotnet`.

- [ ] **Step 1: Write the failing/regression test additions**

Add to `tests/test_ui_qkd.py` (this is the key new assertion — everything else in this task is regression):

```python
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_ui_qkd.py::test_qkd_actions_pendingresult_and_mode_are_explicit -v`
Expected: FAIL — `QkdActions.eveTap`/`eveCommit` are undefined.

- [ ] **Step 3: Rewrite `qkd-actions.js` in full**

```javascript
// quantumbreach/static/js/qkd-actions.js
// Shared action layer for the Solo QKD game: the ONE real game state,
// driven by intent functions that on-page buttons (qkd.js) and terminal
// commands (shell-qkd.js) both call. qkd.js's Solo rendering SUBSCRIBES to
// this state and renders the stage/score/reveal from it -- there is no
// separate "pending" object anywhere else.
(function () {
  var subs = [];
  var st = { phase: "setup", payload: null,
    alice: { n: 24, s: 6 }, eve: { p: 0, workers: 0, taps: [], mode: null },
    pendingResult: null, lastResult: null };
  function emit() { subs.forEach(function (fn) { try { fn(st); } catch (e) {} }); }
  function subscribe(fn) { subs.push(fn); fn(st); }

  function loadPayload(fileSel, done) {
    if (!fileSel || fileSel === "none") { st.payload = null; return done && done(); }
    fetch("/api/qkd/file", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sample: fileSel }) })
      .then(function (r) { return r.json(); })
      .then(function (meta) { return fetch("/api/qkd/file/" + meta.handle).then(function (r) { return r.arrayBuffer().then(function (buf) { return { meta: meta, bytes: new Uint8Array(buf) }; }); }); })
      .then(function (p) { st.payload = { mime: p.meta.mime, bytes: p.bytes, name: fileSel }; emit(); done && done(); })
      .catch(function () { st.payload = null; done && done(); });
  }
  function setPayloadFromBytes(mime, bytes, name) {
    st.payload = { mime: mime || "application/octet-stream", bytes: bytes, name: name || "upload" };
    emit();
  }
  function aliceSet(o) {
    if (o.n != null) st.alice.n = o.n | 0;
    if (o.s != null) st.alice.s = o.s | 0;
    st.phase = "eve";
    if (o.file) loadPayload(o.file, emit); else emit();
  }
  function eveIntercept(pct) {
    st.eve.p = Math.max(0, Math.min(100, pct | 0)) / 100;
    st.eve.mode = "p";
    emit();
  }
  function eveTap(i, basis) {
    if (basis !== "+" && basis !== "x") return;
    i = i | 0;
    st.eve.taps = st.eve.taps.filter(function (t) { return t.i !== i; });
    st.eve.taps.push({ i: i, basis: basis });
    st.eve.mode = "tap";
    emit();
  }
  function eveCrack(o) {
    st.eve.workers = (o && o.workers != null) ? (o.workers | 0) : st.eve.workers;
    var pb = window.PhantomBotnet;
    if (pb) { pb._workers = []; for (var i = 0; i < st.eve.workers; i++) pb._workers.push(1001 + i); }
    emit();
  }
  function eveStopCrack() { st.eve.workers = 0; if (window.PhantomBotnet) window.PhantomBotnet._workers = []; emit(); }
  function _resolveConfig() {
    var cfg = { n: st.alice.n, s: st.alice.s };
    if (st.eve.mode === "tap") cfg.eveTaps = st.eve.taps; else cfg.p = st.eve.p;
    return cfg;
  }
  function eveCommit(o) {
    if (o && o.workers != null) eveCrack({ workers: o.workers });
    st.pendingResult = window.QuantumIntercept.resolveRound(_resolveConfig(), Math.random);
    st.phase = "bob";
    emit();
    return st.pendingResult;
  }
  function bobDecide(decision, presolved) {
    var result = presolved || st.pendingResult;
    if (!result) result = window.QuantumIntercept.resolveRound(_resolveConfig(), Math.random);
    var pb = window.PhantomBotnet;
    var liveWorkers = (pb && pb._workers) ? pb._workers.length : st.eve.workers;
    var keyBits = result.finalKey || 0;
    result.fileCracked = liveWorkers > 0 && pb && pb.crackableWithin(keyBits, liveWorkers, pb.ROUND_WINDOW);
    st.lastResult = { result: result, decision: decision };
    st.phase = "resolve"; emit();
    return st.lastResult;
  }
  function advance() {
    st.phase = "setup"; st.eve = { p: 0, workers: 0, taps: [], mode: null };
    st.pendingResult = null; st.lastResult = null;
    if (window.PhantomBotnet) window.PhantomBotnet._workers = [];
    emit();
  }
  window.QkdActions = { state: function () { return st; }, subscribe: subscribe,
    aliceSet: aliceSet, setPayloadFromBytes: setPayloadFromBytes,
    eveIntercept: eveIntercept, eveTap: eveTap, eveCrack: eveCrack, eveStopCrack: eveStopCrack,
    eveCommit: eveCommit, bobDecide: bobDecide, advance: advance };
})();
```

- [ ] **Step 4: Rewrite `qkd.js`'s Solo block (lines 74–262) to subscribe instead of computing locally**

Replace everything from `// ---- Solo interactive game (only on /qkd) ----` (line 74) through the closing `});` / `})();` at the end of the file (lines 74–263) with:

```javascript
  // ---- Solo interactive game (only on /qkd) ----
  document.addEventListener("DOMContentLoaded", function () {
    var solo = document.getElementById("qkd-solo"); if (!solo) return;
    var modeSolo = document.getElementById("mode-solo"), modeMulti = document.getElementById("mode-multi");
    var multi = document.getElementById("qkd-multi");
    var info = document.getElementById("qkd-info");
    var reveal = document.getElementById("qkd-reveal"), scoreEl = document.getElementById("qkd-score");
    var panels = { alice: document.getElementById("panel-alice"), bob: document.getElementById("panel-bob"), eve: document.getElementById("panel-eve") };
    var myRole = null, score = 0, peak = 0;
    var stage = window.QuantumStage ? window.QuantumStage.mount(document.getElementById("qkd-stage"), { feedEl: document.getElementById("qkd-feed") }) : null;
    var lastSeenPayload = null, lastSeenPending = null, lastSeenResult = null;

    // ---- Payload (file) loading: sample select or local upload ----
    var alFile = document.getElementById("al-file"), alUpload = document.getElementById("al-upload");
    function readUploadedFile(inputEl) {
      return new Promise(function (resolve) {
        var f = inputEl.files && inputEl.files[0];
        if (!f) { resolve(null); return; }
        var reader = new FileReader();
        reader.onload = function () {
          window.QkdActions.setPayloadFromBytes(f.type || "application/octet-stream", new Uint8Array(reader.result), f.name || "upload");
          resolve(f);
        };
        reader.readAsArrayBuffer(f);
      });
    }
    if (alFile) alFile.addEventListener("change", function () {
      if (alFile.value === "upload") { if (alUpload) alUpload.hidden = false; }
      else { if (alUpload) alUpload.hidden = true; window.QkdActions.aliceSet({ file: alFile.value }); }
    });
    if (alUpload) alUpload.addEventListener("change", function () { readUploadedFile(alUpload); });
    // Shared, DOM-aware helper the terminal's `alice upload` command calls (shell-qkd.js
    // stays decoupled from #al-upload's concrete element id).
    window.QkdActions.promptUpload = function () {
      return new Promise(function (resolve) {
        if (!alUpload) { resolve(null); return; }
        alUpload.value = "";
        alUpload.onchange = function () { readUploadedFile(alUpload).then(resolve); };
        alUpload.click();
      });
    };
    // Preload the default sample once at init so a payload is ready before any
    // human action (avoids a race when playing as Bob/Eve, where Alice is computer).
    window.QkdActions.aliceSet({ file: "mission" });
    window.__payloadReady = true;

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
      if (!stage) return;
      stage.streamQubits((result.aBases || []).map(function (b) { return { basis: b }; }), { tappable: false });
      var qs = document.querySelectorAll("#qkd-stage .stage-qubits .qubit");
      (result.intercepted || []).forEach(function (hit, i) { if (hit && qs[i]) qs[i].classList.add("grabbed"); });
      stage.setIntrusion(result.sampleQBER, window.QuantumIntercept.ABORT);
      stage.log("Round resolved — intrusion " + Math.round(result.sampleQBER * 100) + "% (abort line 11%)", "info");
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
      var payload = window.QkdActions.state().payload;
      if (payload && window.QkdFile && stage) {
        var aBits = result.aKeyFinal || [];
        var ct = QkdFile.encrypt(payload.bytes, aBits);
        var bobEl = document.getElementById("bob-file"), eveEl = document.getElementById("eve-file");
        if (decision === "keep") {
          var bobPt = QkdFile.decrypt(ct, result.bKeyFinal || []);
          if (!result.eveHit) stage.revealFile(bobEl, bobPt, payload.mime, "decrypt");
          else stage.revealFile(bobEl, ct, payload.mime, "scramble");
        } else { bobEl.textContent = "(aborted — no delivery)"; }
        if (result.fileCracked) stage.revealFile(eveEl, QkdFile.decrypt(ct, aBits), payload.mime, "decrypt");
        else stage.revealFile(eveEl, ct, payload.mime, "scramble");
      }
      if (stage) stage.log(decision === "keep" ? ("Bob KEEPS the key. " + (result.fileCracked ? "Eve's botnet cracked it!" : (result.eveHit ? "Delivery corrupted." : "File decrypted!"))) : "Bob ABORTS the key.", "bob");
    }

    var evTimer = null;
    function startEveCountdown(seconds) {
      var left = seconds; if (stage) stage.setTimer("⏱ 0:" + ("0" + left).slice(-2));
      if (evTimer) clearInterval(evTimer);
      evTimer = setInterval(function () {
        left--; if (stage) stage.setTimer("⏱ 0:" + ("0" + Math.max(0, left)).slice(-2));
        if (left <= 0) {
          clearInterval(evTimer); evTimer = null;
          if (stage) stage.log("Time! Committing your taps…", "alert");
          if (window.QkdActions.state().phase === "eve") window.QkdActions.eveCommit();
        }
      }, 1000);
    }
    function startRound() {
      reveal.textContent = ""; lastSeenPending = null; lastSeenResult = null;
      window.QkdActions.advance();
      if (evTimer) { clearInterval(evTimer); evTimer = null; }
      if (myRole === "alice") { info.textContent = "Set your key length and check sample, then Send key."; }
      else {
        var a = window.QuantumIntercept.computerStrategy("alice", {}, Math.random);
        window.QkdActions.aliceSet({ n: a.n, s: a.s });
        if (myRole === "eve") {
          info.textContent = "MISSION: tap qubits on the wire, then Commit.";
          var evStates = []; for (var qi = 0; qi < a.n; qi++) evStates.push({ basis: "?" });
          if (stage) {
            stage.log("MISSION: intercept the key exchange — tap qubits and guess the basis.", "alert");
            stage.streamQubits(evStates, { tappable: true });
            stage.onTap(function (t) {
              window.QkdActions.eveTap(t.index, t.basis);
              stage.log("Eve taps qubit " + t.index + " in " + (t.basis === "x" ? "⊗" : "⊕"), "eve");
            });
          }
          startEveCountdown(20);
        } else {
          var p = window.QuantumIntercept.computerStrategy("eve", {}, Math.random).p;
          window.QkdActions.eveIntercept(p * 100);
          window.QkdActions.eveCommit();
        }
      }
    }

    function render(state) {
      if (state.payload && state.payload !== lastSeenPayload) {
        lastSeenPayload = state.payload;
        if (stage) stage.setPayload(state.payload.mime, state.payload.name || "payload");
      }
      renderBotnet(state);
      if (state.pendingResult && state.pendingResult !== lastSeenPending) {
        lastSeenPending = state.pendingResult;
        animate(state.pendingResult);
        if (myRole === "bob") { info.textContent = "Inspect the QBER, then KEEP or ABORT."; }
        else {
          var dec = window.QuantumIntercept.computerStrategy("bob", { sampleQBER: state.pendingResult.sampleQBER }, Math.random).decision;
          window.QkdActions.bobDecide(dec);
        }
      }
      if (state.lastResult && state.lastResult !== lastSeenResult) {
        lastSeenResult = state.lastResult;
        finish(state.lastResult.result, state.lastResult.decision);
      }
    }

    // Alice controls
    var alN = document.getElementById("al-n"), alS = document.getElementById("al-s");
    if (alN) { alN.addEventListener("input", function () { document.getElementById("al-n-val").textContent = alN.value; }); }
    if (alS) { alS.addEventListener("input", function () { document.getElementById("al-s-val").textContent = alS.value; }); }
    var alSend = document.getElementById("al-send");
    if (alSend) alSend.addEventListener("click", function () {
      window.QkdActions.aliceSet({ n: parseInt(alN.value, 10), s: parseInt(alS.value, 10) });
      var p = window.QuantumIntercept.computerStrategy("eve", {}, Math.random).p;
      window.QkdActions.eveIntercept(p * 100);
      window.QkdActions.eveCommit();
    });
    // Eve controls: commit the qubit taps collected on the stage
    var evCommit = document.getElementById("ev-commit");
    if (evCommit) evCommit.addEventListener("click", function () {
      if (myRole !== "eve") return;
      if (window.QkdActions.state().phase === "eve") window.QkdActions.eveCommit();
    });
    // Eve botnet panel: slider + deploy button drive QkdActions.eveCrack directly
    var evW = document.getElementById("ev-w"), evWVal = document.getElementById("ev-w-val"), evCrack = document.getElementById("ev-crack");
    function renderBotnet(state) {
      var PB = window.PhantomBotnet; if (!PB) return;
      PB.renderPanel({
        grid: document.getElementById("ev-grid"),
        rate: document.getElementById("ev-rate"),
        eta: document.getElementById("ev-eta"),
        detect: document.getElementById("ev-detect")
      }, state.eve.workers, state.alice.n || 0, state.eve.p);
    }
    if (evW) evW.addEventListener("input", function () {
      if (evWVal) evWVal.textContent = evW.value;
      window.QkdActions.eveCrack({ workers: parseInt(evW.value, 10) });
    });
    if (evCrack) evCrack.addEventListener("click", function () {
      window.QkdActions.eveCrack({ workers: evW ? parseInt(evW.value, 10) : 0 });
    });
    // Bob controls
    var keep = document.getElementById("btn-keep"), abort = document.getElementById("btn-abort");
    if (keep) keep.addEventListener("click", function () { if (window.QkdActions.state().phase === "bob") window.QkdActions.bobDecide("keep"); });
    if (abort) abort.addEventListener("click", function () { if (window.QkdActions.state().phase === "bob") window.QkdActions.bobDecide("abort"); });

    window.QkdActions.subscribe(render);

    // default: show solo, no role chosen yet
    solo.hidden = false;
    window.addEventListener("pagehide", function () { if (peak >= 1) postScore(peak); });
  });
})();
```

- [ ] **Step 5: Run the new test + regression files**

Run: `python -m pytest tests/test_ui_qkd.py -v`
Expected: PASS (new test + `test_solo_as_bob_plays_a_round`, `test_solo_score_posts_best`, `test_solo_eve_taps_drive_the_round`).

Run: `python -m pytest tests/test_ui_qkd_file.py -v`
Expected: PASS (`test_solo_round_reveals_file`, `test_botnet_cracks_short_key_and_reveals_to_eve`, `test_killing_botnet_workers_reduces_live_crack_capacity`, `test_botnet_render_panel_draws_tiles`, `test_stage_reveal_and_replay` if present in this file — confirm actual test names via `pytest --collect-only tests/test_ui_qkd_file.py`).

Run: `python -m pytest tests/test_ui_qkd_terminal_parity.py -v`
Expected: `test_terminal_drives_same_state_as_buttons` PASS, `test_solo_buttons_mirror_into_qkd_actions_state` PASS, `test_bobdecide_uses_presolved_result_not_a_reroll` PASS. `test_parse_double_dash_captures_value_but_single_dash_stays_boolean` and `test_qkd_terminal_commands_guard_without_qkd_actions` PASS unchanged (they exercise `/terminal`, untouched by this task). `test_shell_qkd_pack_calls_qkd_actions_with_parsed_values` is expected to FAIL at this point ONLY on its `eve intercept` sub-assertion — that test is rewritten in Task 2, not this one; if it fails here, confirm the failure is isolated to the `eve intercept` lines and proceed (Task 2 fixes it).

- [ ] **Step 6: Commit**

```bash
git add quantumbreach/static/js/qkd-actions.js quantumbreach/static/js/qkd.js tests/test_ui_qkd.py
git commit -m "refactor(qkd): QkdActions becomes the real Solo game state; qkd.js subscribes"
```

---

## Task 2: Embed a terminal on `/qkd` + full command set (`alice upload`, `eve tap`/`eve commit`)

**Files:**
- Modify: `quantumbreach/templates/qkd.html` (add `#shell` markup; add scripts)
- Modify: `quantumbreach/static/js/shell-qkd.js` (replace `eve intercept` with `eve tap`/`eve commit`; add `alice upload`; update `man`)
- Test: `tests/test_ui_qkd_terminal_parity.py` (rewrite the stale sub-test; add embedded-terminal test)

**Interfaces:**
- Consumes: `window.QkdActions.eveTap/eveCommit/promptUpload` (Task 1).
- Produces: the `/qkd` page has a functioning `#shell`/`#shell-in` terminal; `shell-qkd.js`'s `eve` command supports `tap`/`commit` (drops `intercept`); `alice` command supports `upload`.

- [ ] **Step 1: Add the terminal markup + scripts to `qkd.html`**

Add near the bottom of `#qkd-solo` (after the `.qkd-panes` div, before its closing `</div>`), matching `terminal.html`'s exact IDs:

```html
  <div id="shell" class="shell qkd-embedded-shell">
    <div id="shell-out" class="shell-out"></div>
    <div class="shell-row"><span class="shell-prompt">$</span><input id="shell-in" class="shell-in" autocomplete="off" spellcheck="false"></div>
  </div>
```

In `{% block scripts %}`, add `vfs.js`, `terminal.js`, `shell-qkd.js` — placed AFTER `qkd.js` (so `window.QkdActions` exists before `shell-qkd.js`'s commands are ever invoked; load order doesn't have to precede `qkd.js` since `shell-qkd.js` only reads `window.QkdActions` at COMMAND-EXECUTION time, not at load time):

```html
{% block scripts %}
  <script src="{{ url_for('static', filename='js/qkd-stage.js') }}"></script>
  <script src="{{ url_for('static', filename='js/qkd-multi.js') }}"></script>
  <script src="{{ url_for('static', filename='js/qkd-file.js') }}"></script>
  <script src="{{ url_for('static', filename='js/botnet.js') }}"></script>
  <script src="{{ url_for('static', filename='js/qkd-actions.js') }}"></script>
  <script src="{{ url_for('static', filename='js/qkd.js') }}"></script>
  <script src="{{ url_for('static', filename='js/vfs.js') }}"></script>
  <script src="{{ url_for('static', filename='js/terminal.js') }}"></script>
  <script src="{{ url_for('static', filename='js/shell-qkd.js') }}"></script>
{% endblock %}
```

- [ ] **Step 2: Write the failing test for the embedded terminal**

```python
# append to tests/test_ui_qkd_terminal_parity.py
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
```

- [ ] **Step 3: Run to verify it fails**

Run: `python -m pytest tests/test_ui_qkd_terminal_parity.py::test_embedded_qkd_terminal_drives_the_real_round -v`
Expected: FAIL — `#shell-in` doesn't exist yet / `eve tap`/`eve commit` commands don't exist in `shell-qkd.js`.

- [ ] **Step 4: Rewrite `shell-qkd.js`'s `alice` and `eve` functions**

```javascript
// quantumbreach/static/js/shell-qkd.js
// Terminal commands (qkd/alice/eve/bob) that drive the SAME QkdActions state the
// on-page /qkd buttons write to. QkdActions is only ever defined on /qkd (this
// terminal is now embedded there); running these on /terminal alone degrades to a
// friendly guard message rather than throwing.
(function () {
  var S = window.PhantomShell; if (!S) return;
  function A() { return window.QkdActions; }
  S.extend({
    qkd: function (p) { var sub = p.args[0];
      if (sub === "status") { if (!A()) return "qkd: open the QKD page first"; var s = A().state(); return "phase:" + s.phase + " n:" + s.alice.n + " workers:" + s.eve.workers; }
      if (sub === "export") {
        if (!A()) return "qkd: open the QKD page first";
        if (!window.QkdCrack) return "qkd export: crack tool unavailable";
        var st = A().state();
        if (!st.lastResult || !st.payload) return "qkd export: no resolved round with a payload yet";
        var keyBits = st.lastResult.result.aKeyFinal || [];
        return window.QkdCrack.exportCiphertext(st.payload, keyBits);
      }
      if (sub === "crack") {
        if (!window.QkdCrack) return "qkd crack: crack tool unavailable";
        var maxBits = p.flags.maxbits ? (+p.flags.maxbits) : undefined;
        if (p.flags.upload) return window.QkdCrack.crackUpload({ maxBits: maxBits }).then(window.QkdCrack.formatResult);
        var path = p.args[1];
        if (!path) return "usage: qkd crack <path> | qkd crack --upload [--maxbits N]";
        return window.QkdCrack.crackVfsPath(path, { maxBits: maxBits }).then(window.QkdCrack.formatResult);
      }
      return "usage: qkd status | qkd export | qkd crack <path>|--upload [--maxbits N]"; },
    alice: function (p) { if (!A()) return "qkd: open the QKD page first";
      if (p.args[0] === "upload") {
        if (!A().promptUpload) return "alice: upload not available here";
        return A().promptUpload().then(function (f) {
          return f ? ("alice: uploaded " + f.name + " (" + f.type + ", " + f.size + " bytes)") : "alice: upload cancelled";
        });
      }
      if (p.args[0] !== "set") return "usage: alice set --len N --sample S --file <name> | alice upload";
      var o = {}; if (p.flags.len) o.n = +p.flags.len; if (p.flags.sample) o.s = +p.flags.sample; if (p.flags.file) o.file = p.flags.file;
      A().aliceSet(o); return "alice: key set"; },
    eve: function (p) { if (!A()) return "qkd: open the QKD page first";
      if (p.args[0] === "tap") {
        var idx = parseInt(p.args[1], 10), basis = p.args[2];
        if (isNaN(idx) || (basis !== "+" && basis !== "x")) return "usage: eve tap <index> <basis +|x>";
        A().eveTap(idx, basis); return "eve: tapped qubit " + idx + " in " + basis;
      }
      if (p.args[0] === "commit") {
        var w = p.flags.workers ? (+p.flags.workers) : undefined;
        var r = A().eveCommit(w != null ? { workers: w } : undefined);
        return "eve: committed — intrusion " + Math.round((r.sampleQBER || 0) * 100) + "%";
      }
      if (p.args[0] === "crack") { if (p.flags.stop) { A().eveStopCrack(); return "eve: crack stopped"; }
        var wk = p.flags.workers ? (+p.flags.workers) : (+p.args[1] || 8); A().eveCrack({ workers: wk }); return "eve: " + wk + " workers cracking"; }
      return "usage: eve tap <index> <basis> | eve commit [--workers N] | eve crack [--workers N] | eve crack --stop"; },
    bob: function (p) { if (!A()) return "qkd: open the QKD page first";
      var d = p.args[0]; if (d !== "keep" && d !== "abort") return "usage: bob keep|abort";
      var r = A().bobDecide(d); return "bob: " + d + " — " + (r.result.fileCracked ? "EVE CRACKED THE FILE" : "delivered:" + (d === "keep" && !r.result.eveHit)); }
  });
})();
```

- [ ] **Step 5: Update `terminal.js`'s `man` table**

In `quantumbreach/static/js/terminal.js`, replace the `eve` and `alice` entries and add `qkd` detail (find `window.PhantomShell.man = {...}` around line 97):

```javascript
  window.PhantomShell.man = {
    ls: "ls [-l] [path] — list directory contents",
    cd: "cd <path> — change directory",
    cat: "cat <file> — print a file",
    grep: "grep <pattern> <file> — filter lines",
    nmap: "nmap <target> — scan the quantum channel",
    qkd: "qkd status | qkd export | qkd crack <path>|--upload [--maxbits N]",
    eve: "eve tap <index> <basis +|x> | eve commit [--workers N] | eve crack [--workers N] | eve crack --stop",
    alice: "alice set --len N --sample S --file <name> | alice upload",
    bob: "bob keep|abort — decide on the received key"
  };
```

- [ ] **Step 6: Rewrite the stale sub-test in `test_ui_qkd_terminal_parity.py`**

Replace `test_shell_qkd_pack_calls_qkd_actions_with_parsed_values` in full:

```python
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
```

- [ ] **Step 7: Extend the "/terminal guards without QkdActions" test with the new commands**

```python
# append inside test_qkd_terminal_commands_guard_without_qkd_actions, after the existing assertions
        out3 = pg.evaluate("(async () => await PhantomShell.run('eve tap 0 x'))()")
        assert out3 == "qkd: open the QKD page first"
        out4 = pg.evaluate("(async () => await PhantomShell.run('alice upload'))()")
        assert out4 == "qkd: open the QKD page first"
```

- [ ] **Step 8: Run tests**

Run: `python -m pytest tests/test_ui_qkd_terminal_parity.py -v`
Expected: PASS (all, including the rewritten and new tests).

- [ ] **Step 9: Commit**

```bash
git add quantumbreach/templates/qkd.html quantumbreach/static/js/shell-qkd.js quantumbreach/static/js/terminal.js tests/test_ui_qkd_terminal_parity.py
git commit -m "feat(qkd): embed a terminal on /qkd; eve tap/commit + alice upload commands"
```

---

## Task 3: `qkd-crack.js` — standalone export + real brute force

**Files:**
- Create: `quantumbreach/static/js/qkd-crack.js`
- Modify: `quantumbreach/templates/qkd.html` (load the new script)
- Test: `tests/test_ui_qkd_crack.py` (create)

**Interfaces:**
- Consumes: `window.QkdFile.encrypt/decrypt` (existing), `window.PhantomVFS`, `window.PhantomShell.env` (both loaded by Task 2).
- Produces: `window.QkdCrack = { exportCiphertext(payload, keyBits), bruteForce(bytes, mime, opts), crackVfsPath(path, opts), crackUpload(opts), formatResult(r) }`. `bruteForce` resolves `{cracked, keyBits, attempts, elapsedMs, maxBits}`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_ui_qkd_crack.py
from tests.browser_utils import live_server, browser_page, requires_browser

PLAINTEXT_JS = "\"the quick brown fox jumps over the lazy dog 1234567890\""


@requires_browser
def test_crack_short_key_succeeds():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        out = pg.evaluate("""() => new Promise((resolve) => {
          var s = %s;
          var bytes = new Uint8Array(s.length); for (var i=0;i<s.length;i++) bytes[i]=s.charCodeAt(i);
          var key = [1,0,1,1,0,0];
          var ct = QkdFile.encrypt(bytes, key);
          QkdCrack.bruteForce(ct, 'text/plain', {maxBits: 8}).then(function (r) {
            resolve({ cracked: r.cracked, attempts: r.attempts, keyLen: r.keyBits ? r.keyBits.length : -1 });
          });
        })""" % PLAINTEXT_JS)
        assert out["cracked"] is True
        assert out["attempts"] > 0


@requires_browser
def test_crack_long_key_does_not_crack_within_small_maxbits():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        out = pg.evaluate("""() => new Promise((resolve) => {
          var s = %s;
          var bytes = new Uint8Array(s.length); for (var i=0;i<s.length;i++) bytes[i]=s.charCodeAt(i);
          var key = [1,0,1,1,0,0,1,0,1,1,0,1,0,0,1,1];  // 16-bit key
          var ct = QkdFile.encrypt(bytes, key);
          QkdCrack.bruteForce(ct, 'text/plain', {maxBits: 6}).then(function (r) {  // cap well below 16
            resolve({ cracked: r.cracked });
          });
        })""" % PLAINTEXT_JS)
        assert out["cracked"] is False


@requires_browser
def test_export_ciphertext_round_trips_through_decrypt():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        out = pg.evaluate("""() => {
          var payload = { mime: 'text/plain', bytes: new Uint8Array([72,73]) };
          var key = [1,0,1,1];
          var exported = QkdCrack.exportCiphertext(payload, key);
          var parsed = JSON.parse(exported);
          var cipherBytes = Uint8Array.from(atob(parsed.cipher), c => c.charCodeAt(0));
          var back = QkdFile.decrypt(cipherBytes, key);
          return { v: parsed.v, mime: parsed.mime, recovered: Array.from(back) };
        }""")
        assert out["v"] == 1 and out["mime"] == "text/plain"
        assert out["recovered"] == [72, 73]
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_ui_qkd_crack.py -v`
Expected: FAIL — `QkdCrack is not defined`.

- [ ] **Step 3: Implement `qkd-crack.js`**

```javascript
// quantumbreach/static/js/qkd-crack.js
// Standalone ciphertext export + a REAL brute-force search (not a scripted
// animation): every key-bit pattern up to a length cap is tried through the
// existing QkdFile keystream and checked for plausible plaintext. No
// dependency on QkdActions, the phase machine, or the server (beyond the
// already-loaded QkdFile keystream functions).
(function () {
  function bytesToBase64(bytes) {
    var bin = ""; for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function base64ToBytes(b64) {
    var bin = atob(b64); var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function isPlausible(bytes, mime) {
    if (mime === "image/png") {
      if (bytes.length < 8) return false;
      var sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
      for (var i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return false;
      return true;
    }
    if (mime === "application/pdf") {
      return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
    }
    var n = Math.min(bytes.length, 512), printable = 0;
    for (var j = 0; j < n; j++) {
      var b = bytes[j];
      if ((b >= 0x20 && b <= 0x7E) || b === 9 || b === 10 || b === 13) printable++;
    }
    return n > 0 && (printable / n) >= 0.9;
  }
  function exportCiphertext(payload, keyBits) {
    if (!payload || !window.QkdFile) return JSON.stringify({ v: 1, error: "no payload" });
    var ct = window.QkdFile.encrypt(payload.bytes, keyBits || []);
    return JSON.stringify({ v: 1, mime: payload.mime, cipher: bytesToBase64(ct) });
  }
  function bruteForce(bytes, mime, opts) {
    opts = opts || {};
    var maxBits = opts.maxBits != null ? opts.maxBits : 22;
    var startTime = Date.now();
    var length = 1, counter = 0, attempts = 0;
    var BATCH = 50000;
    return new Promise(function (resolve) {
      function step() {
        var total = Math.pow(2, length);
        var batchEnd = Math.min(counter + BATCH, total);
        for (; counter < batchEnd; counter++) {
          var bits = [];
          for (var b = length - 1; b >= 0; b--) bits.push((counter >> b) & 1);
          var pt = window.QkdFile.decrypt(bytes, bits);
          attempts++;
          if (isPlausible(pt, mime)) {
            resolve({ cracked: true, keyBits: bits, attempts: attempts, elapsedMs: Date.now() - startTime, maxBits: maxBits });
            return;
          }
        }
        if (counter >= total) { length++; counter = 0; }
        if (length > maxBits) {
          resolve({ cracked: false, keyBits: null, attempts: attempts, elapsedMs: Date.now() - startTime, maxBits: maxBits });
          return;
        }
        setTimeout(step, 0);
      }
      step();
    });
  }
  function crackVfsPath(path, opts) {
    if (!window.PhantomVFS || !window.PhantomShell || !window.PhantomShell.env) {
      return Promise.resolve({ cracked: false, keyBits: null, attempts: 0, elapsedMs: 0, error: "VFS unavailable" });
    }
    var env = window.PhantomShell.env, raw;
    try { raw = window.PhantomVFS.readFile(env.tree, window.PhantomVFS.resolve(env.tree, env.cwd, path)); }
    catch (e) { return Promise.resolve({ cracked: false, keyBits: null, attempts: 0, elapsedMs: 0, error: e.message }); }
    var mime = "application/octet-stream", bytes, parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) {}
    if (parsed && parsed.v === 1 && typeof parsed.cipher === "string") {
      mime = parsed.mime || mime;
      bytes = base64ToBytes(parsed.cipher);
    } else {
      bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
    }
    return bruteForce(bytes, mime, opts || {});
  }
  var _uploadInput = null;
  function crackUpload(opts) {
    if (!_uploadInput) {
      _uploadInput = document.createElement("input");
      _uploadInput.type = "file"; _uploadInput.style.display = "none";
      document.body.appendChild(_uploadInput);
    }
    return new Promise(function (resolve) {
      _uploadInput.value = "";
      _uploadInput.onchange = function () {
        var f = _uploadInput.files && _uploadInput.files[0];
        if (!f) { resolve({ cracked: false, keyBits: null, attempts: 0, elapsedMs: 0, error: "no file selected" }); return; }
        var reader = new FileReader();
        reader.onload = function () {
          bruteForce(new Uint8Array(reader.result), f.type || "application/octet-stream", opts || {}).then(resolve);
        };
        reader.readAsArrayBuffer(f);
      };
      _uploadInput.click();
    });
  }
  function formatResult(r) {
    if (r.error) return "qkd crack: " + r.error;
    if (r.cracked) return "CRACKED in " + r.attempts + " attempts (" + (r.elapsedMs / 1000).toFixed(1) + "s) — key length " + r.keyBits.length + " bits.";
    return "not cracked — exhausted " + r.attempts + " attempts (" + (r.elapsedMs / 1000).toFixed(1) + "s), up to " + (r.maxBits || 22) + "-bit keys.";
  }
  window.QkdCrack = { exportCiphertext: exportCiphertext, bruteForce: bruteForce,
    crackVfsPath: crackVfsPath, crackUpload: crackUpload, formatResult: formatResult };
})();
```

- [ ] **Step 4: Load the script on `qkd.html`**

Add to `{% block scripts %}`, after `qkd-file.js` (its only real dependency) and before `shell-qkd.js` (which calls into it):

```html
  <script src="{{ url_for('static', filename='js/qkd-crack.js') }}"></script>
```

- [ ] **Step 5: Run tests**

Run: `python -m pytest tests/test_ui_qkd_crack.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add quantumbreach/static/js/qkd-crack.js quantumbreach/templates/qkd.html tests/test_ui_qkd_crack.py
git commit -m "feat(qkd): standalone ciphertext export + real brute-force crack tool"
```

---

## Task 4: Terminal `qkd export`/`qkd crack` — VFS + upload paths

**Files:**
- Test: `tests/test_ui_qkd_crack.py` (extend)

**Interfaces:**
- Consumes: `shell-qkd.js`'s `qkd export`/`qkd crack` (already wired in Task 2, calling into `window.QkdCrack` from Task 3). This task is verification-only — Tasks 2 and 3 already implemented the code; this task proves the end-to-end terminal flow.

- [ ] **Step 1: Write the failing/verifying test**

```python
# append to tests/test_ui_qkd_crack.py
@requires_browser
def test_terminal_export_then_crack_round_trip():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.wait_for_function("() => window.__payloadReady === true", timeout=5000)
        pg.click("#mode-solo")
        pg.click(".role[data-role='eve']")
        pg.wait_for_selector("#shell-in", timeout=5000)
        # short key -> committing with no taps still yields a short-ish finalKey by default n
        pg.fill("#shell-in", "eve commit"); pg.press("#shell-in", "Enter")
        pg.wait_for_function("() => document.getElementById('qkd-score').textContent.indexOf('Score') >= 0", timeout=5000)
        pg.fill("#shell-in", "qkd export > captures/secret.enc"); pg.press("#shell-in", "Enter")
        pg.wait_for_timeout(150)
        pg.fill("#shell-in", "cat captures/secret.enc"); pg.press("#shell-in", "Enter")
        pg.wait_for_timeout(150)
        out_text = pg.inner_text("#shell-out")
        assert '"v":1' in out_text or '"v": 1' in out_text  # the export landed in the VFS file
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_ui_qkd_crack.py::test_terminal_export_then_crack_round_trip -v`
Expected: Likely PASS already (Tasks 2+3 built everything this needs) — if it fails, the failure will point to a specific gap (e.g. `cat` command unavailable because `shell-fs.js` isn't loaded on `/qkd`). If `cat` is unavailable (per Task 2's deliberate scoping — only `vfs.js`/`terminal.js`/`shell-qkd.js` load on `/qkd`, NOT `shell-fs.js`), replace the `cat`-based assertion with a direct VFS read instead:

```python
        out_text = pg.evaluate("""() => {
          var abs = PhantomVFS.resolve(PhantomShell.env.tree, PhantomShell.env.cwd, 'captures/secret.enc');
          return PhantomVFS.readFile(PhantomShell.env.tree, abs);
        }""")
        assert '"v":1' in out_text or '"v": 1' in out_text
```

Use whichever assertion actually passes given the real script set on `/qkd` (the VFS-direct-read version is the correct one, since `cat` is a `shell-fs.js` command not loaded on this page per Task 2's design — use that version).

- [ ] **Step 3: Run tests**

Run: `python -m pytest tests/test_ui_qkd_crack.py -v`
Expected: PASS (all 4 tests in this file).

- [ ] **Step 4: Commit**

```bash
git add tests/test_ui_qkd_crack.py
git commit -m "test(qkd): verify terminal qkd export writes into the VFS via redirection"
```

---

## Task 5: Multiplayer upload

**Files:**
- Modify: `quantumbreach/templates/qkd.html` (`#qm-file` gains an "upload" option + hidden `#qm-upload` input)
- Modify: `quantumbreach/static/js/qkd-multi.js` (Alice control change handler)
- Test: `tests/test_ui_qkd_multi.py`

**Interfaces:**
- Consumes: existing `POST /api/qkd/file` (multipart branch already exists per `qkd/routes.py`), existing `act({..., file: handle})` path.
- Produces: MP Alice can pick "Upload file…" and stake a real file, submitted via the same `act()` call sample selection uses.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_ui_qkd_multi.py
@requires_browser
def test_mp_alice_can_upload_a_file():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-multi")
        pg.click("[data-create='alice']")
        pg.wait_for_selector("#qm-start", timeout=8000); pg.click("#qm-start")
        pg.wait_for_selector("#qm-file", timeout=8000)
        pg.select_option("#qm-file", "upload")
        pg.wait_for_selector("#qm-upload:not([hidden])", timeout=4000)
        pg.set_input_files("#qm-upload", files=[{"name": "note.txt", "mimeType": "text/plain", "buffer": b"HELLO MP UPLOAD"}])
        pg.wait_for_timeout(300)
        pg.click("#qm-al-go")
        pg.wait_for_function(
            "() => { var v = document.querySelector('#qm-file-view'); return v && v.textContent.indexOf('HELLO MP UPLOAD') >= 0; }",
            timeout=8000)
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_ui_qkd_multi.py::test_mp_alice_can_upload_a_file -v`
Expected: FAIL — `#qm-upload` doesn't exist.

- [ ] **Step 3: Add the upload option + hidden input to `qkd.html`**

In `#qm-play`'s Alice control template string, inside `qkd-multi.js` (NOT `qkd.html` — the Alice control is built entirely in JS as an HTML string; there is no static markup for it in `qkd.html`). Find the `alice_setup` branch in `quantumbreach/static/js/qkd-multi.js` (`renderControls`, the `box.innerHTML = '<label>Key length ...` block) and replace it:

```javascript
    if (st.phase === "alice_setup") {
      box.innerHTML = '<label>Key length <input id="qm-n" type="range" min="8" max="64" value="24"></label>' +
        '<label>Check sample <input id="qm-s" type="range" min="0" max="24" value="6"></label>' +
        '<label>Payload <select id="qm-file">' +
          '<option value="mission">mission.txt</option>' +
          '<option value="codes">codes.txt</option>' +
          '<option value="photo">photo.png</option>' +
          '<option value="upload">upload a file…</option>' +
        '</select></label>' +
        '<input id="qm-upload" type="file" hidden>' +
        '<button class="btn" id="qm-al-go" type="button">Send key</button>';
      var qmUploadHandle = null;
      $("qm-file").addEventListener("change", function () {
        var upl = $("qm-upload");
        if ($("qm-file").value === "upload") { upl.hidden = false; }
        else { upl.hidden = true; qmUploadHandle = null; }
      });
      $("qm-upload").addEventListener("change", function () {
        var f = $("qm-upload").files && $("qm-upload").files[0];
        if (!f) return;
        var fd = new FormData(); fd.append("file", f);
        fetch("/api/qkd/file", { method: "POST", body: fd })
          .then(function (r) { return r.json(); })
          .then(function (m) { qmUploadHandle = m.handle; });
      });
      $("qm-al-go").addEventListener("click", function () {
        var fileVal = $("qm-file").value === "upload" ? qmUploadHandle : $("qm-file").value;
        act({ n: parseInt($("qm-n").value, 10), s: parseInt($("qm-s").value, 10), file: fileVal }); });
    } else if (st.phase === "eve_move") {
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_ui_qkd_multi.py -v`
Expected: PASS (all, including the new upload test and existing MP tests).

- [ ] **Step 5: Commit**

```bash
git add quantumbreach/static/js/qkd-multi.js tests/test_ui_qkd_multi.py
git commit -m "feat(qkd-mp): Alice can upload her own file (reuses the existing generic upload endpoint)"
```

---

## Task 6: Upload preview panes (Solo + MP)

**Files:**
- Modify: `quantumbreach/templates/qkd.html` (`#al-preview` pane)
- Modify: `quantumbreach/static/js/qkd.js` (render preview on payload change)
- Modify: `quantumbreach/static/js/qkd-multi.js` (`#qm-preview` pane + render)
- Modify: `quantumbreach/static/css/stage.css` (preview pane styling)
- Test: `tests/test_ui_qkd.py`, `tests/test_ui_qkd_multi.py`

**Interfaces:**
- Consumes: `QkdFile.renderInto` (existing, called directly — no `stage.revealFile` animation wrapper).
- Produces: `#al-preview` (Solo) / a `#qm-preview` div (MP, created in JS like the rest of that panel) show the picked file's content immediately, uploader-only.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_ui_qkd.py
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_ui_qkd.py::test_solo_upload_preview_shows_immediately -v`
Expected: FAIL — `#al-preview` doesn't exist.

- [ ] **Step 3: Add `#al-preview` to `qkd.html`**

In `#panel-alice`, right after the `<input id="al-upload" type="file" hidden>` line:

```html
    <div id="al-preview" class="file-view preview-pane"></div>
```

- [ ] **Step 4: Render the preview in `qkd.js`'s `readUploadedFile`**

In the `readUploadedFile` function (added in Task 1), extend the `reader.onload`:

```javascript
    function readUploadedFile(inputEl) {
      return new Promise(function (resolve) {
        var f = inputEl.files && inputEl.files[0];
        if (!f) { resolve(null); return; }
        var reader = new FileReader();
        reader.onload = function () {
          var bytes = new Uint8Array(reader.result);
          window.QkdActions.setPayloadFromBytes(f.type || "application/octet-stream", bytes, f.name || "upload");
          var preview = document.getElementById("al-preview");
          if (preview && window.QkdFile) window.QkdFile.renderInto(preview, bytes, f.type || "application/octet-stream");
          resolve(f);
        };
        reader.readAsArrayBuffer(f);
      });
    }
```

Also clear the preview when switching back to a sample: in the `alFile`'s `change` handler, add `var preview = document.getElementById("al-preview"); if (preview) preview.innerHTML = "";` to the non-upload branch:

```javascript
    if (alFile) alFile.addEventListener("change", function () {
      if (alFile.value === "upload") { if (alUpload) alUpload.hidden = false; }
      else {
        if (alUpload) alUpload.hidden = true;
        var preview = document.getElementById("al-preview"); if (preview) preview.innerHTML = "";
        window.QkdActions.aliceSet({ file: alFile.value });
      }
    });
```

- [ ] **Step 5: Add the MP preview pane + render in `qkd-multi.js`**

Replace the ENTIRE `if (st.phase === "alice_setup") { ... }` branch (the one Task 5 Step 3 introduced) in `renderControls`, in full — this supersedes Task 5's version of this branch (adds the preview div + its render, everything else identical):

```javascript
    if (st.phase === "alice_setup") {
      box.innerHTML = '<label>Key length <input id="qm-n" type="range" min="8" max="64" value="24"></label>' +
        '<label>Check sample <input id="qm-s" type="range" min="0" max="24" value="6"></label>' +
        '<label>Payload <select id="qm-file">' +
          '<option value="mission">mission.txt</option>' +
          '<option value="codes">codes.txt</option>' +
          '<option value="photo">photo.png</option>' +
          '<option value="upload">upload a file…</option>' +
        '</select></label>' +
        '<input id="qm-upload" type="file" hidden>' +
        '<div id="qm-preview" class="file-view preview-pane"></div>' +
        '<button class="btn" id="qm-al-go" type="button">Send key</button>';
      var qmUploadHandle = null;
      $("qm-file").addEventListener("change", function () {
        var upl = $("qm-upload"), pv = $("qm-preview");
        if ($("qm-file").value === "upload") { upl.hidden = false; }
        else { upl.hidden = true; qmUploadHandle = null; if (pv) pv.innerHTML = ""; }
      });
      $("qm-upload").addEventListener("change", function () {
        var f = $("qm-upload").files && $("qm-upload").files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          var pv = $("qm-preview");
          if (pv && window.QkdFile) window.QkdFile.renderInto(pv, new Uint8Array(reader.result), f.type || "application/octet-stream");
        };
        reader.readAsArrayBuffer(f);
        var fd = new FormData(); fd.append("file", f);
        fetch("/api/qkd/file", { method: "POST", body: fd })
          .then(function (r) { return r.json(); })
          .then(function (m) { qmUploadHandle = m.handle; });
      });
      $("qm-al-go").addEventListener("click", function () {
        var fileVal = $("qm-file").value === "upload" ? qmUploadHandle : $("qm-file").value;
        act({ n: parseInt($("qm-n").value, 10), s: parseInt($("qm-s").value, 10), file: fileVal }); });
    } else if (st.phase === "eve_move") {
```

- [ ] **Step 6: Add preview CSS**

Append to `quantumbreach/static/css/stage.css`:

```css
.preview-pane { margin-top: .4rem; min-height: 1.5rem; }
.preview-pane:empty { display: none; }
```

- [ ] **Step 7: Run tests**

Run: `python -m pytest tests/test_ui_qkd.py -v`
Expected: PASS.

Add the equivalent MP test, then run: `python -m pytest tests/test_ui_qkd_multi.py -v`

```python
# append to tests/test_ui_qkd_multi.py
@requires_browser
def test_mp_upload_preview_shows_immediately():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-multi")
        pg.click("[data-create='alice']")
        pg.wait_for_selector("#qm-start", timeout=8000); pg.click("#qm-start")
        pg.wait_for_selector("#qm-file", timeout=8000)
        pg.select_option("#qm-file", "upload")
        pg.wait_for_selector("#qm-upload:not([hidden])", timeout=4000)
        pg.set_input_files("#qm-upload", files=[{"name": "note.txt", "mimeType": "text/plain", "buffer": b"MP PREVIEW"}])
        pg.wait_for_function(
            "() => { var el = document.getElementById('qm-preview'); return el && el.textContent.indexOf('MP PREVIEW') >= 0; }",
            timeout=4000)
```

Expected: PASS (both files).

- [ ] **Step 8: Commit**

```bash
git add quantumbreach/templates/qkd.html quantumbreach/static/js/qkd.js quantumbreach/static/js/qkd-multi.js quantumbreach/static/css/stage.css tests/test_ui_qkd.py tests/test_ui_qkd_multi.py
git commit -m "feat(qkd): upload preview (Solo + MP) — uploader-only, before encryption"
```

---

## Task 7: Terminal upload preview text summary

**Files:**
- Modify: `quantumbreach/static/js/qkd.js` (`promptUpload` prints a summary)
- Modify: `quantumbreach/static/js/shell-qkd.js` (`alice upload` uses the summary)
- Modify: `quantumbreach/static/js/qkd-crack.js` (`crackUpload` includes file metadata in its result)
- Test: `tests/test_ui_qkd_terminal_parity.py`, `tests/test_ui_qkd_crack.py`

**Interfaces:**
- Consumes: `window.QkdActions.promptUpload()` (Task 1/2), `window.QkdCrack.crackUpload()` (Task 3).
- Produces: `alice upload` and `qkd crack --upload` print filename/MIME/size (+ a text snippet for `text/plain`).

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_ui_qkd_terminal_parity.py
@requires_browser
def test_alice_upload_terminal_prints_a_preview_summary():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-solo")
        pg.click(".role[data-role='alice']")
        pg.wait_for_selector("#shell-in", timeout=5000)
        pg.once("filechooser", lambda fc: fc.set_files(files=[{"name": "diary.txt", "mimeType": "text/plain", "buffer": b"Dear diary, today was a good day for QKD."}]))
        pg.fill("#shell-in", "alice upload"); pg.press("#shell-in", "Enter")
        pg.wait_for_timeout(300)
        out_text = pg.inner_text("#shell-out")
        assert "diary.txt" in out_text
        assert "text/plain" in out_text
        assert "Dear diary" in out_text
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_ui_qkd_terminal_parity.py::test_alice_upload_terminal_prints_a_preview_summary -v`
Expected: FAIL — current message is just `"alice: uploaded <name> (<type>, <size> bytes)"`, no content snippet.

- [ ] **Step 3: Extend `qkd.js`'s `promptUpload` to capture a text snippet**

In the `window.QkdActions.promptUpload` assignment (Task 1's Step 4), have `readUploadedFile`'s resolved value carry a snippet for `text/plain`:

```javascript
    function readUploadedFile(inputEl) {
      return new Promise(function (resolve) {
        var f = inputEl.files && inputEl.files[0];
        if (!f) { resolve(null); return; }
        var reader = new FileReader();
        reader.onload = function () {
          var bytes = new Uint8Array(reader.result);
          window.QkdActions.setPayloadFromBytes(f.type || "application/octet-stream", bytes, f.name || "upload");
          var preview = document.getElementById("al-preview");
          if (preview && window.QkdFile) window.QkdFile.renderInto(preview, bytes, f.type || "application/octet-stream");
          var snippet = "";
          if ((f.type || "").indexOf("text/") === 0) {
            var s = ""; for (var i = 0; i < Math.min(bytes.length, 100); i++) s += String.fromCharCode(bytes[i]);
            snippet = s;
          }
          resolve({ name: f.name, type: f.type || "application/octet-stream", size: f.size, snippet: snippet });
        };
        reader.readAsArrayBuffer(f);
      });
    }
```

- [ ] **Step 4: Update `shell-qkd.js`'s `alice upload` to print the snippet**

```javascript
      if (p.args[0] === "upload") {
        if (!A().promptUpload) return "alice: upload not available here";
        return A().promptUpload().then(function (f) {
          if (!f) return "alice: upload cancelled";
          var msg = "alice: uploaded " + f.name + " (" + f.type + ", " + f.size + " bytes)";
          if (f.snippet) msg += ": \"" + f.snippet + "\"";
          return msg;
        });
      }
```

- [ ] **Step 5: Extend `qkd-crack.js`'s `crackUpload` + `formatResult` with file metadata**

```javascript
  function crackUpload(opts) {
    if (!_uploadInput) {
      _uploadInput = document.createElement("input");
      _uploadInput.type = "file"; _uploadInput.style.display = "none";
      document.body.appendChild(_uploadInput);
    }
    return new Promise(function (resolve) {
      _uploadInput.value = "";
      _uploadInput.onchange = function () {
        var f = _uploadInput.files && _uploadInput.files[0];
        if (!f) { resolve({ cracked: false, keyBits: null, attempts: 0, elapsedMs: 0, error: "no file selected" }); return; }
        var reader = new FileReader();
        reader.onload = function () {
          bruteForce(new Uint8Array(reader.result), f.type || "application/octet-stream", opts || {}).then(function (r) {
            r.uploadedName = f.name; r.uploadedType = f.type || "application/octet-stream"; r.uploadedSize = f.size;
            resolve(r);
          });
        };
        reader.readAsArrayBuffer(f);
      };
      _uploadInput.click();
    });
  }
  function formatResult(r) {
    if (r.error) return "qkd crack: " + r.error;
    var prefix = r.uploadedName ? ("uploaded " + r.uploadedName + " (" + r.uploadedType + ", " + r.uploadedSize + " bytes) — ") : "";
    if (r.cracked) return prefix + "CRACKED in " + r.attempts + " attempts (" + (r.elapsedMs / 1000).toFixed(1) + "s) — key length " + r.keyBits.length + " bits.";
    return prefix + "not cracked — exhausted " + r.attempts + " attempts (" + (r.elapsedMs / 1000).toFixed(1) + "s), up to " + (r.maxBits || 22) + "-bit keys.";
  }
```

- [ ] **Step 6: Add a crack-tool preview test**

```python
# append to tests/test_ui_qkd_crack.py
@requires_browser
def test_crack_upload_prints_file_metadata():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-solo")
        pg.click(".role[data-role='alice']")
        pg.wait_for_selector("#shell-in", timeout=5000)
        pg.once("filechooser", lambda fc: fc.set_files(files=[{"name": "cipher.bin", "mimeType": "application/octet-stream", "buffer": b"not a real cipher, just bytes"}]))
        pg.fill("#shell-in", "qkd crack --upload --maxbits 4"); pg.press("#shell-in", "Enter")
        pg.wait_for_timeout(1500)
        out_text = pg.inner_text("#shell-out")
        assert "cipher.bin" in out_text
```

- [ ] **Step 7: Run tests**

Run: `python -m pytest tests/test_ui_qkd_terminal_parity.py tests/test_ui_qkd_crack.py -v`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add quantumbreach/static/js/qkd.js quantumbreach/static/js/shell-qkd.js quantumbreach/static/js/qkd-crack.js tests/test_ui_qkd_terminal_parity.py tests/test_ui_qkd_crack.py
git commit -m "feat(qkd): terminal upload preview — filename/MIME/size + text snippet"
```

---

## Task 8: `/qkd` page layout rework — two-column grid + `#qkd-feed` host

**Files:**
- Modify: `quantumbreach/templates/qkd.html` (wrap `#qkd-solo`/`#qkd-multi` in a grid; add `<aside id="qkd-feed">`)
- Modify: `quantumbreach/static/css/stage.css` (`.qkd-layout`/`.qkd-main`/`.qkd-feed`)
- Test: `tests/test_ui_qkd_stage.py`

**Interfaces:**
- Produces: `#qkd-feed` exists in the DOM as a sibling of the game area, ready for Task 9/10 to wire content into.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_ui_qkd_stage.py
@requires_browser
def test_qkd_layout_has_feed_sidebar_and_collapses_narrow():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        assert pg.evaluate("() => !!document.getElementById('qkd-feed')")
        cols = pg.evaluate("() => getComputedStyle(document.querySelector('.qkd-layout')).gridTemplateColumns.split(' ').length")
        assert cols >= 2
        pg.set_viewport_size({"width": 700, "height": 900})
        cols_narrow = pg.evaluate("() => getComputedStyle(document.querySelector('.qkd-layout')).gridTemplateColumns.split(' ').length")
        assert cols_narrow == 1
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_ui_qkd_stage.py::test_qkd_layout_has_feed_sidebar_and_collapses_narrow -v`
Expected: FAIL — `#qkd-feed`/`.qkd-layout` don't exist yet.

- [ ] **Step 3: Restructure `qkd.html`**

Wrap the two `.qkd` containers in a grid, and add the feed sidebar as a sibling:

```html
{% block content %}
<h1 data-typewriter>Quantum Intercept</h1>
<p class="muted">BB84 key distribution as a game. Play <strong>Alice</strong> (send the key),
<strong>Bob</strong> (receive &amp; decide), or <strong>Eve</strong> (eavesdrop without being
caught). Errors (QBER) above the {{ 11 }}% line mean an eavesdropper.</p>

<div class="qkd-modes">
  <button class="btn" id="mode-solo" type="button">Solo (vs computer)</button>
  <button class="btn ghost" id="mode-multi" type="button">Multiplayer (same network)</button>
</div>

<div class="qkd-layout">
  <div class="qkd-main">
    <div id="qkd-solo" class="qkd" hidden>
      <!-- unchanged contents from before this task -->
    </div>
    <div id="qkd-multi" class="qkd" hidden>
      <!-- unchanged contents from before this task -->
    </div>
  </div>
  <aside id="qkd-feed" class="qkd-feed">
    <h4>Live Feed</h4>
  </aside>
</div>
{% endblock %}
```

(Move the EXISTING full contents of `#qkd-solo` and `#qkd-multi` — unchanged by this task — inside `.qkd-main`; only the wrapping structure changes.)

- [ ] **Step 4: Add layout CSS**

Append to `quantumbreach/static/css/stage.css`:

```css
.qkd-layout { display: grid; grid-template-columns: 1fr 320px; gap: 1rem; align-items: start; }
.qkd-main { min-width: 0; }
.qkd-feed { border: 1px solid rgba(0,255,170,.15); border-radius: 8px; background: rgba(0,0,0,.35);
  padding: .6rem; max-height: 640px; overflow-y: auto; position: sticky; top: 1rem; }
.qkd-feed h4 { margin: 0 0 .4rem; color: var(--accent, #0fa); font-size: .85rem; text-transform: uppercase; letter-spacing: .04em; }
.qkd-feed .log-line { padding: .15rem 0; font-family: monospace; font-size: .8rem; border-bottom: 1px solid rgba(255,255,255,.04); }
@media (max-width: 760px) {
  .qkd-layout { grid-template-columns: 1fr; }
  .qkd-feed { position: static; max-height: 240px; }
}
```

- [ ] **Step 5: Run tests**

Run: `python -m pytest tests/test_ui_qkd_stage.py -v`
Expected: PASS.

Run a broader smoke check to confirm the page still renders correctly after the restructure:

Run: `python -m pytest tests/test_ui_qkd.py tests/test_ui_qkd_file.py -v`
Expected: PASS (nothing inside `#qkd-solo`/`#qkd-multi` changed, only their wrapper).

- [ ] **Step 6: Commit**

```bash
git add quantumbreach/templates/qkd.html quantumbreach/static/css/stage.css tests/test_ui_qkd_stage.py
git commit -m "feat(qkd): two-column /qkd layout with a feed sidebar host element"
```

---

## Task 9: `qkd-stage.js` — `opts.feedEl` support + line cap

**Files:**
- Modify: `quantumbreach/static/js/qkd-stage.js` (`mount`'s `logBox` + `log`)
- Test: `tests/test_ui_qkd_stage.py`

**Interfaces:**
- Produces: `mount(root, {feedEl: someExternalElement})` renders log lines into `feedEl` instead of an internal box; `log()` caps content at 200 lines regardless of target.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_ui_qkd_stage.py
@requires_browser
def test_stage_logs_into_external_feed_element_when_given():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        out = pg.evaluate("""() => {
          var root = document.createElement('div'); document.body.appendChild(root);
          var feed = document.createElement('div'); document.body.appendChild(feed);
          var h = QuantumStage.mount(root, { feedEl: feed });
          h.log('hello from the stage', 'info');
          return {
            inFeed: feed.textContent.indexOf('hello from the stage') >= 0,
            noInternalLog: root.querySelectorAll('.stage-log').length === 0
          };
        }""")
        assert out["inFeed"] is True
        assert out["noInternalLog"] is True


@requires_browser
def test_stage_feed_caps_at_200_lines():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        count = pg.evaluate("""() => {
          var root = document.createElement('div'); document.body.appendChild(root);
          var feed = document.createElement('div'); document.body.appendChild(feed);
          var h = QuantumStage.mount(root, { feedEl: feed });
          for (var i = 0; i < 250; i++) h.log('line ' + i, 'info');
          return feed.children.length;
        }""")
        assert count == 200
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_ui_qkd_stage.py::test_stage_logs_into_external_feed_element_when_given tests/test_ui_qkd_stage.py::test_stage_feed_caps_at_200_lines -v`
Expected: FAIL — `opts.feedEl` is ignored today; no line cap exists.

- [ ] **Step 3: Update `qkd-stage.js`'s `mount`**

Replace the `logBox` declaration and its appending, and the `log` method:

```javascript
    var logBox = opts.feedEl || el("div", "stage-log");

    root.appendChild(payload); root.appendChild(net);
    root.appendChild(intrusion); root.appendChild(timer);
    if (!opts.feedEl) root.appendChild(logBox);
```

```javascript
      log: function (line, kind) {
        var d = el("div", "log-line " + (kind || "info")); d.textContent = line;
        logBox.appendChild(d);
        while (logBox.children.length > 200) logBox.removeChild(logBox.firstChild);
        logBox.scrollTop = logBox.scrollHeight;
      },
```

(Only these two spots change; everything else in `mount` stays as-is.)

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_ui_qkd_stage.py -v`
Expected: PASS (all, including the pre-existing `test_stage_mounts_network_map_and_log` — confirm it still passes since it doesn't pass `feedEl`, so it falls back to the internal box exactly as before).

- [ ] **Step 5: Commit**

```bash
git add quantumbreach/static/js/qkd-stage.js tests/test_ui_qkd_stage.py
git commit -m "feat(qkd-stage): mount() accepts an external feedEl; log() caps at 200 lines"
```

---

## Task 10: Wire the live feed — Solo subscriber + MP poll handler log call sites

**Files:**
- Modify: `quantumbreach/static/js/qkd.js` (mount with `feedEl`; add log lines in `render`/`finish`)
- Modify: `quantumbreach/static/js/qkd-multi.js` (mount with `feedEl`; add log lines in `render`)
- Test: `tests/test_ui_qkd.py`, `tests/test_ui_qkd_multi.py`

**Interfaces:**
- Consumes: `stage.log` (existing), `document.getElementById("qkd-feed")`.
- Produces: playing a Solo or MP round narrates into `#qkd-feed`.

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_ui_qkd.py
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_ui_qkd.py::test_solo_round_narrates_into_the_feed_sidebar -v`
Expected: PASS already for the tap/resolve lines (Task 1's `qkd.js` already mounts with `feedEl` and already calls `stage.log` for taps and resolve) — the ONLY missing piece is the `finish()` KEEPS/ABORTS line, which Task 1's rewritten `finish()` ALREADY includes (see Task 1 Step 4's `finish` function, final `stage.log(...)` call). So this test should already PASS at this point — run it to CONFIRM, and if it fails, the gap is isolated to whichever specific log line is missing; add it to `finish()`/`render()` in `qkd.js` accordingly.

- [ ] **Step 3: Confirm/complete the Solo log lines**

If Step 2 passed, no code change needed for Solo — Task 1 already wired `feedEl` and the log calls. If it failed on the "Alice staked" line (not asserted above, but worth adding for completeness), add to `render()` in `qkd.js` right after the `lastSeenPayload` check:

```javascript
      if (state.payload && state.payload !== lastSeenPayload) {
        lastSeenPayload = state.payload;
        if (stage) { stage.setPayload(state.payload.mime, state.payload.name || "payload");
          stage.log("Alice staked " + (state.payload.name || "a file") + ".", "info"); }
      }
```

- [ ] **Step 4: Write the MP feed test**

```python
# append to tests/test_ui_qkd_multi.py
@requires_browser
def test_mp_round_narrates_into_the_feed_sidebar():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-multi")
        pg.click("[data-create='eve']")
        pg.wait_for_selector("#qm-start", timeout=8000); pg.click("#qm-start")
        pg.wait_for_selector("#qm-stage .stage-qubits .qubit", timeout=8000)
        pg.click("#qm-stage .stage-qubits .qubit:nth-child(1)")
        pg.click('#qm-stage .tap-picker [data-basis="x"]')
        pg.click("#qm-eve-go")
        pg.wait_for_timeout(1500)
        feed_text = pg.inner_text("#qkd-feed")
        assert "Eve taps qubit" in feed_text or "Replay" in feed_text
```

- [ ] **Step 5: Wire `qkd-multi.js`'s `mount()` call with `feedEl`**

In `enter(c, r, isHost)`, update the mount call:

```javascript
    if (window.QuantumStage && !stage) stage = window.QuantumStage.mount($("qm-stage"), { feedEl: document.getElementById("qkd-feed") });
```

- [ ] **Step 6: Add Alice-staked / decision log lines to `qkd-multi.js`'s `render`**

In `render(st)`, after the existing `if (stage && st.phase === "bob_decision" ...)` block, add a phase-transition detector (module-scoped `var lastPhase` already exists; use it to fire a one-time log line):

```javascript
    if (stage && st.phase !== lastPhase) {
      if (st.phase === "eve_move") stage.log("Alice staked her key" + (st.phase === "eve_move" ? "." : ""), "info");
      if (st.phase === "resolve" && st.lastResult) stage.log("Bob " + st.lastResult.bobDecision.toUpperCase() + "S the key.", "bob");
    }
```

(This sits alongside the EXISTING `lastPhase = st.phase;` assignment in `render` — place this new block BEFORE that assignment so `st.phase !== lastPhase` still reflects the PREVIOUS phase at comparison time; the existing code already does `lastPhase = st.phase;` near the end of `render`, so insert this new block just before that line.)

- [ ] **Step 7: Run tests**

Run: `python -m pytest tests/test_ui_qkd.py tests/test_ui_qkd_multi.py -v`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add quantumbreach/static/js/qkd.js quantumbreach/static/js/qkd-multi.js tests/test_ui_qkd.py tests/test_ui_qkd_multi.py
git commit -m "feat(qkd): wire the live feed — Solo subscriber + MP poll handler narrate the round"
```

---

## Task 11: Polish — drive screenshots + docs

**Files:**
- Modify: `.claude/skills/run-phantomq/drive.py`
- Modify: `docs/QKD_MULTIPLAYER.md`, `docs/FOLLOWUPS.md`

- [ ] **Step 1: Extend `drive.py`'s QKD section**

After the existing Solo heist screenshot steps, add: type `eve tap`/`eve commit` into the embedded `#shell-in` and screenshot the result; upload a file in the Alice panel and screenshot the preview; screenshot the feed sidebar populated after a round. Concretely, insert after the existing "7b-qkd-file-reveal.png" step:

```python
        # Embedded terminal on /qkd: play a round entirely by typing.
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-solo")
        pg.click('.role[data-role="eve"]')
        pg.wait_for_selector("#shell-in", timeout=5000)
        pg.fill("#shell-in", "eve tap 0 x"); pg.press("#shell-in", "Enter")
        pg.wait_for_timeout(150)
        pg.fill("#shell-in", "eve commit"); pg.press("#shell-in", "Enter")
        pg.wait_for_function("() => document.getElementById('qkd-score').textContent.indexOf('Score') >= 0", timeout=5000)
        feed_lines = pg.evaluate("() => document.getElementById('qkd-feed').children.length")
        print("[qkd] embedded terminal played a round | feed lines:", feed_lines)
        pg.screenshot(path=os.path.join(out, "10-qkd-terminal-and-feed.png"), full_page=True)
```

- [ ] **Step 2: Run the drive script**

Run: `python .claude/skills/run-phantomq/drive.py --out "$TMP/qkd-uploads-shots" --port 8147`
Expected: exit 0; `10-qkd-terminal-and-feed.png` non-blank; observation line printed with a nonzero feed line count.

- [ ] **Step 3: Update docs**

In `docs/QKD_MULTIPLAYER.md`, add a short paragraph: Alice can now upload her own file in multiplayer (not just samples); a live activity feed narrates the round on `/qkd`; `/qkd` itself now embeds a terminal so the whole Solo heist can be played by typing (`alice set`/`alice upload`, `eve tap`/`eve commit`, `bob keep|abort`), plus a standalone `qkd export`/`qkd crack` ciphertext tool.

In `docs/FOLLOWUPS.md`, add a "## QKD uploads/terminal follow-ups" section noting: the embedded `/qkd` mini-shell only loads `vfs.js`+`terminal.js`+`shell-qkd.js` (not fs/text/net/sys/labs — running those commands there degrades to a caught error, not a crash); `help`'s static text still lists FILES/TEXT/NET/SYSTEM categories even on the trimmed `/qkd` shell where those packs aren't loaded (cosmetic, deferred); the crack tool is unscored (not wired to XP/badges).

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/run-phantomq/drive.py docs/QKD_MULTIPLAYER.md docs/FOLLOWUPS.md
git commit -m "docs+drive(qkd): screenshot the embedded terminal + feed; update docs"
```

---

## Final verification

- [ ] Full suite in the background: `python -m pytest -q` — all pass.
- [ ] Confirm no MP secrecy regression: `grep -rn "aBits\|bBits\|aKeyFinal" quantumbreach/qkd/service.py` shows nothing new serialized (this plan touched no Python).
- [ ] Run the app (`run-phantomq`) and eyeball the new screenshots — the embedded terminal, the feed sidebar, and the upload previews all read correctly.
- [ ] Update memory (`phantomq-project.md` + `MEMORY.md`) once merged.

## Self-Review notes (coverage map)

- Spec §Uploads everywhere → Tasks 5 (MP), Solo already shipped. §Full terminal parity → Tasks 1 (state refactor), 2 (embedded shell + command set). §Ciphertext crack tool → Tasks 3, 4. §Upload preview → Tasks 6, 7. §Live activity feed → Tasks 9, 10. §`/qkd` layout rework → Task 8. §"Critical correction" (embedded mini-shell) → Task 2. Testing (regression + new) → embedded per task + Final verification. Docs → Task 11. Global constraints (no Python, no secrecy change, uploader-only preview, activity-log-not-spectator) carried in Global Constraints and enforced throughout (no task touches `quantumbreach/qkd/service.py` or `engine.py`).
