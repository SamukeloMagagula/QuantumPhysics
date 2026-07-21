(function () {
  var BASE_RATE = 50000, ROUND_WINDOW = 20, OPS_BUDGET = 100;
  function keysPerSec(workers) { return Math.max(0, workers | 0) * BASE_RATE; }
  function crackEta(keyBits, workers) {
    var kps = keysPerSec(workers);
    if (kps <= 0 || keyBits > 60) return Infinity;
    return Math.pow(2, keyBits | 0) / kps;
  }
  function workerCost(workers) { return Math.ceil(Math.max(0, workers | 0) / 10); }
  function detectionDelta(p) { return Math.round((+p || 0) * 100); }
  function crackableWithin(keyBits, workers, windowSeconds) { return crackEta(keyBits, workers) <= (windowSeconds || ROUND_WINDOW); }
  // Shared botnet-panel render used by both Solo (qkd.js) and Multiplayer (qkd-multi.js).
  // els = { grid, rate, eta, detect } — any DOM element may be null.
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
  window.PhantomBotnet = { BASE_RATE: BASE_RATE, ROUND_WINDOW: ROUND_WINDOW, OPS_BUDGET: OPS_BUDGET,
    keysPerSec: keysPerSec, crackEta: crackEta, workerCost: workerCost, detectionDelta: detectionDelta,
    crackableWithin: crackableWithin, renderPanel: renderPanel,
    // process bridge for ps/kill (Task 13 populates _workers)
    _workers: [], pids: function () { return this._workers.slice(); },
    kill: function (pid) { var i = this._workers.indexOf(+pid); if (i < 0) return false; this._workers.splice(i, 1); return true; } };
})();
