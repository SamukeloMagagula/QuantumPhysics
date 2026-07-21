(function () {
  var ABORT = 0.11, DETECT = 25, HEIST_BONUS = 20;
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
    var taps = null;
    if (config.eveTaps != null) {
      taps = {};
      for (var t = 0; t < config.eveTaps.length; t++) {
        var et = config.eveTaps[t];
        if (et && (et.basis === "+" || et.basis === "x")) taps[et.i | 0] = et.basis;
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

  function scoreRound(role, result, decision) {
    var eve = !!result.eveHit, defender = 0, eveDelta = 0;
    if (decision === "abort") { if (eve) defender = DETECT; }
    else { if (eve) { eveDelta = result.stolen || 0; if (result.fileCracked) eveDelta += HEIST_BONUS; } else defender = result.finalKey || 0; }
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
          var bytes = new Uint8Array(reader.result);
          window.QkdActions.setPayloadFromBytes(f.type || "application/octet-stream", bytes, f.name || "upload");
          var preview = document.getElementById("al-preview");
          if (preview && window.QkdFile) window.QkdFile.renderInto(preview, bytes, f.type || "application/octet-stream");
          resolve(f);
        };
        reader.readAsArrayBuffer(f);
      });
    }
    if (alFile) alFile.addEventListener("change", function () {
      if (alFile.value === "upload") { if (alUpload) alUpload.hidden = false; }
      else {
        if (alUpload) alUpload.hidden = true;
        var preview = document.getElementById("al-preview"); if (preview) preview.innerHTML = "";
        window.QkdActions.aliceSet({ file: alFile.value });
      }
    });
    // ONE standing "change" listener drives every read of #al-upload (both the plain
    // on-page file picker and the terminal's `alice upload`, wired below via
    // pendingUploadResolve) so a single file pick never triggers readUploadedFile —
    // and therefore setPayloadFromBytes — more than once.
    var pendingUploadResolve = null;
    if (alUpload) alUpload.addEventListener("change", function () {
      readUploadedFile(alUpload).then(function (f) {
        if (pendingUploadResolve) { var resolve = pendingUploadResolve; pendingUploadResolve = null; resolve(f); }
      });
    });
    // Shared, DOM-aware helper the terminal's `alice upload` command calls (shell-qkd.js
    // stays decoupled from #al-upload's concrete element id).
    window.QkdActions.promptUpload = function () {
      return new Promise(function (resolve) {
        if (!alUpload) { resolve(null); return; }
        alUpload.value = "";
        pendingUploadResolve = resolve;
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
        if (!myRole || myRole === "bob") { info.textContent = "Inspect the QBER, then KEEP or ABORT."; }
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
