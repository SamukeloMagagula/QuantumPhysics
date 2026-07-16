(function () {
  var ABORT = 0.11;
  function newRound(opts) {
    opts = opts || {}; var n = opts.n || 80; var eve = opts.eve != null ? opts.eve : Math.random() < 0.5;
    var C = window.PhantomCrypto.bb84;
    var alice = C.prepare(n);
    var channelBits = alice.bits, channelBases = alice.bases;
    if (eve) { var e = C.eveIntercept(alice.bits, alice.bases); channelBits = e.bits; channelBases = e.bases; }
    var bBases = []; for (var i = 0; i < n; i++) bBases.push(Math.random() < 0.5 ? "+" : "x");
    var meas = channelBits.map(function (bit, i) { return C.measure(bit, channelBases[i], bBases[i]); });
    var s = C.sift(alice.bases, bBases, alice.bits, meas);
    var qber = C.qber(s.aKey, s.bKey);
    return { eve: eve, qber: qber, keyBits: s.aKey.length, n: n };
  }
  function judge(round, decision) {
    var shouldAbort = round.qber > ABORT;
    var correct = (decision === "abort") === shouldAbort;
    var delta = correct ? (decision === "keep" ? round.keyBits : 25) : -20;
    return { correct: correct, delta: delta };
  }
  window.QuantumIntercept = { ABORT: ABORT, newRound: newRound, judge: judge };

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.getElementById("qkd"); if (!root) return;
    var meter = document.getElementById("qber-fill"), qtext = document.getElementById("qber-text");
    var info = document.getElementById("qkd-info"), scoreEl = document.getElementById("qkd-score");
    var photons = document.getElementById("qkd-photons");
    var score = 0, round = null, roundNo = 0, peak = 0;
    function render(r) {
      photons.innerHTML = "";
      for (var i = 0; i < Math.min(r.n, 40); i++) { var d = document.createElement("span"); d.className = "photon"; d.style.animationDelay = (i * 25) + "ms"; photons.appendChild(d); }
      var pct = Math.round(r.qber * 100);
      meter.style.width = Math.min(100, pct * 3) + "%";
      meter.className = "qber-fill " + (r.qber > window.QuantumIntercept.ABORT ? "hot" : "cool");
      qtext.textContent = "QBER: " + pct + "%  (abort line 11%)";
      info.textContent = "Round " + roundNo + " — sifted key: " + r.keyBits + " bits. Keep the key or abort?";
    }
    function next() { roundNo++; round = window.QuantumIntercept.newRound({}); render(round); }
    function decide(dec) {
      if (!round) return; var res = window.QuantumIntercept.judge(round, dec);
      score += res.delta; scoreEl.textContent = "Score: " + score;
      if (score > peak) { peak = score; if (peak >= 1) postScore(peak); }
      info.textContent = (res.correct ? "Correct! " : "Wrong. ") + (round.eve ? "Eve WAS listening." : "Channel was clean.") + " (" + (res.delta >= 0 ? "+" : "") + res.delta + ")";
      round = null;
      if (score < -40) { info.textContent += " — GAME OVER."; score = 0; peak = 0; setTimeout(function () { scoreEl.textContent = "Score: 0"; roundNo = 0; next(); }, 1500); }
      else setTimeout(next, 1400);
    }
    function postScore(s) { fetch("/api/qkd/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ score: Math.max(0, s) }) }).catch(function () {}); }
    document.getElementById("btn-keep").addEventListener("click", function () { decide("keep"); });
    document.getElementById("btn-abort").addEventListener("click", function () { decide("abort"); });
    next();
  });
})();
