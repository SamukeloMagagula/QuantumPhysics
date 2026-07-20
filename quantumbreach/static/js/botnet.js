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
  window.PhantomBotnet = { BASE_RATE: BASE_RATE, ROUND_WINDOW: ROUND_WINDOW, OPS_BUDGET: OPS_BUDGET,
    keysPerSec: keysPerSec, crackEta: crackEta, workerCost: workerCost, detectionDelta: detectionDelta,
    crackableWithin: crackableWithin,
    // process bridge for ps/kill (Task 13 populates _workers)
    _workers: [], pids: function () { return this._workers.slice(); },
    kill: function (pid) { var i = this._workers.indexOf(+pid); if (i < 0) return false; this._workers.splice(i, 1); return true; } };
})();
