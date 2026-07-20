// quantumbreach/static/js/qkd-actions.js
// Shared action layer for the solo QKD game: one state object, driven by intent
// functions that both the on-page buttons (qkd.js) and the terminal commands
// (shell-qkd.js) call. `subscribe` lets any view react to state changes.
(function () {
  var subs = [];
  var st = { phase: "setup", payload: null, alice: { n: 24, s: 6 }, eve: { p: 0, workers: 0 }, lastResult: null };
  function emit() { subs.forEach(function (fn) { try { fn(st); } catch (e) {} }); }
  function subscribe(fn) { subs.push(fn); fn(st); }
  function loadPayload(fileSel, done) {
    if (!fileSel || fileSel === "none") { st.payload = null; return done && done(); }
    fetch("/api/qkd/file", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sample: fileSel }) })
      .then(function (r) { return r.json(); })
      .then(function (meta) { return fetch("/api/qkd/file/" + meta.handle).then(function (r) { return r.arrayBuffer().then(function (buf) { return { meta: meta, bytes: new Uint8Array(buf) }; }); }); })
      .then(function (p) { st.payload = { mime: p.meta.mime, bytes: p.bytes }; emit(); done && done(); })
      .catch(function () { st.payload = null; done && done(); });
  }
  function aliceSet(o) { if (o.n != null) st.alice.n = o.n | 0; if (o.s != null) st.alice.s = o.s | 0; st.phase = "eve"; if (o.file) loadPayload(o.file, emit); else emit(); }
  function eveIntercept(pct) { st.eve.p = Math.max(0, Math.min(100, pct | 0)) / 100; emit(); }
  function eveCrack(o) {
    st.eve.workers = (o && o.workers != null) ? (o.workers | 0) : st.eve.workers;
    var pb = window.PhantomBotnet;
    if (pb) { pb._workers = []; for (var i = 0; i < st.eve.workers; i++) pb._workers.push(1001 + i); }
    emit();
  }
  function eveStopCrack() { st.eve.workers = 0; if (window.PhantomBotnet) window.PhantomBotnet._workers = []; emit(); }
  function bobDecide(decision, presolved) {
    var result = presolved;
    if (!result) {
      var cfg = { n: st.alice.n, s: st.alice.s, p: st.eve.p };
      result = window.QuantumIntercept.resolveRound(cfg, Math.random);
    }
    // botnet crack decision: file crackable if final key short enough for the LIVE worker
    // count (post-kill) within the round window. Reads window.PhantomBotnet._workers.length
    // rather than st.eve.workers so a terminal `kill <pid>` before deciding actually matters —
    // note this must NOT fall back to st.eve.workers when _workers.length is legitimately 0
    // (all workers killed), so a plain `||` on the length would silently undo every kill.
    var pb = window.PhantomBotnet;
    var liveWorkers = (pb && pb._workers) ? pb._workers.length : st.eve.workers;
    var keyBits = result.finalKey || 0;
    result.fileCracked = liveWorkers > 0 && pb && pb.crackableWithin(keyBits, liveWorkers, pb.ROUND_WINDOW);
    st.lastResult = { result: result, decision: decision };
    st.phase = "resolve"; emit();
    return st.lastResult;
  }
  function advance() { st.phase = "setup"; st.eve = { p: 0, workers: 0 }; st.lastResult = null; if (window.PhantomBotnet) window.PhantomBotnet._workers = []; emit(); }
  window.QkdActions = { state: function () { return st; }, subscribe: subscribe,
    aliceSet: aliceSet, eveIntercept: eveIntercept, eveCrack: eveCrack, eveStopCrack: eveStopCrack,
    bobDecide: bobDecide, advance: advance };
})();
