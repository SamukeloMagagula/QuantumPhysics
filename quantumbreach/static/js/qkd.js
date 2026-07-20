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
             stolen: stolen, eveHit: eveHit, intercepted: intercepted, aBases: aBases, bBases: bBases,
             aKeyFinal: sifted.aKey.slice(sampleSize), bKeyFinal: sifted.bKey.slice(sampleSize) };
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
    var photons = document.getElementById("qkd-photons"), meter = document.getElementById("qber-fill");
    var qtext = document.getElementById("qber-text"), info = document.getElementById("qkd-info");
    var reveal = document.getElementById("qkd-reveal"), scoreEl = document.getElementById("qkd-score");
    var panels = { alice: document.getElementById("panel-alice"), bob: document.getElementById("panel-bob"), eve: document.getElementById("panel-eve") };
    var myRole = null, score = 0, peak = 0, pending = null; // pending: {n,s,p} gathered so far
    var currentPayload = null; // {mime, bytes} — the file staked on the current round

    // ---- Payload (file) loading: sample fetch or local upload ----
    function loadPayload(sel) {
      if (sel === "upload") {
        var f = alUpload && alUpload.files && alUpload.files[0];
        if (!f) return Promise.resolve();
        return new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function () {
            currentPayload = { mime: f.type || "application/octet-stream", bytes: new Uint8Array(reader.result) };
            resolve();
          };
          reader.readAsArrayBuffer(f);
        });
      }
      return fetch("/api/qkd/file", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sample: sel }) })
        .then(function (r) { return r.json(); })
        .then(function (m) {
          return fetch("/api/qkd/file/" + m.handle)
            .then(function (r) { return r.arrayBuffer(); })
            .then(function (buf) { currentPayload = { mime: m.mime, bytes: new Uint8Array(buf) }; });
        });
    }
    var alFile = document.getElementById("al-file"), alUpload = document.getElementById("al-upload");
    if (alFile) alFile.addEventListener("change", function () {
      if (alFile.value === "upload") { if (alUpload) alUpload.hidden = false; }
      else { if (alUpload) alUpload.hidden = true; loadPayload(alFile.value); }
    });
    if (alUpload) alUpload.addEventListener("change", function () { loadPayload("upload"); });
    // Preload the default sample once at init so currentPayload is ready before any
    // human action (avoids a race when playing as Bob/Eve, where Alice is the computer).
    loadPayload("mission").then(function () { window.__payloadReady = true; });

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
    // Mirror this button-driven round into QkdActions so window.QkdActions.state() reflects
    // the same values the buttons produced (shared state layer — see qkd-actions.js). The
    // existing pending/finish render path below is untouched; this call is additive only.
    function finish(result, decision) {
      if (window.QkdActions) window.QkdActions.bobDecide(decision, result);
      var sc = window.QuantumIntercept.scoreRound(myRole, result, decision);
      score += sc.delta; scoreEl.textContent = "Score: " + score;
      if (score > peak) { peak = score; if (peak >= 1) postScore(peak); }
      reveal.textContent = (sc.youWon ? "You win this round (+" + sc.delta + "). " : "You lose this round. ")
        + (result.eveHit ? "Eve was intercepting" : "Channel was clean")
        + " — QBER " + Math.round(result.sampleQBER * 100) + "%, key " + result.finalKey + " bits"
        + (decision === "abort" ? ", ABORTED." : ", KEPT.");
      info.textContent = "Pick your role above to play another round.";
      if (currentPayload && window.QkdFile) {
        var aBits = result.aKeyFinal || [];
        var ct = QkdFile.encrypt(currentPayload.bytes, aBits); // Alice encrypts with her final key
        var bobEl = document.getElementById("bob-file"), eveEl = document.getElementById("eve-file");
        if (decision === "keep") {
          var bobPt = QkdFile.decrypt(ct, result.bKeyFinal || []); // Bob decrypts with HIS key
          // clean channel => aKeyFinal === bKeyFinal => real file; Eve/noise => differ => garbles
          if (!result.eveHit) QkdFile.renderInto(bobEl, bobPt, currentPayload.mime);
          else QkdFile.scrambleInto(bobEl, ct);
        } else { bobEl.textContent = "(aborted — no delivery)"; }
        if (result.fileCracked) QkdFile.renderInto(eveEl, QkdFile.decrypt(ct, aBits), currentPayload.mime);
        else QkdFile.scrambleInto(eveEl, ct);
      }
    }

    function startRound() {
      reveal.textContent = ""; pending = {};
      if (window.QkdActions) window.QkdActions.advance(); // reset the shared action-layer state for a fresh round
      if (myRole === "alice") { info.textContent = "Set your key length and check sample, then Send key."; }
      else { var a = window.QuantumIntercept.computerStrategy("alice", {}, Math.random); pending.n = a.n; pending.s = a.s;
             if (window.QkdActions) window.QkdActions.aliceSet({ n: pending.n, s: pending.s }); // mirror computer-Alice's key
             if (myRole === "eve") info.textContent = "Choose how aggressively to intercept.";
             else { pending.p = window.QuantumIntercept.computerStrategy("eve", {}, Math.random).p;
                    if (window.QkdActions) window.QkdActions.eveIntercept(pending.p * 100); // mirror computer-Eve's intercept
                    resolveAndAwaitBob(); } }
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
      if (window.QkdActions) window.QkdActions.aliceSet({ n: pending.n, s: pending.s }); // mirror human-Alice's key
      pending.p = window.QuantumIntercept.computerStrategy("eve", {}, Math.random).p;
      if (window.QkdActions) window.QkdActions.eveIntercept(pending.p * 100); // mirror computer-Eve's intercept
      resolveAndAwaitBob();
    });
    // Eve controls
    solo.querySelectorAll(".ev").forEach(function (b) { b.addEventListener("click", function () {
      pending.p = parseFloat(b.getAttribute("data-p"));
      if (window.QkdActions) window.QkdActions.eveIntercept(pending.p * 100); // mirror human-Eve's intercept
      resolveAndAwaitBob(); }); });
    // Bob controls
    var keep = document.getElementById("btn-keep"), abort = document.getElementById("btn-abort");
    if (keep) keep.addEventListener("click", function () { if (pending && pending.result) finish(pending.result, "keep"); });
    if (abort) abort.addEventListener("click", function () { if (pending && pending.result) finish(pending.result, "abort"); });

    // default: show solo, no role chosen yet
    solo.hidden = false;
    window.addEventListener("pagehide", function () { if (peak >= 1) postScore(peak); });
  });
})();
