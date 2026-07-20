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
  function eveCrack(o) { st.eve.workers = (o && o.workers != null) ? (o.workers | 0) : st.eve.workers; emit(); }
  function eveStopCrack() { st.eve.workers = 0; emit(); }
  function bobDecide(decision, presolved) {
    var result = presolved;
    if (!result) {
      var cfg = { n: st.alice.n, s: st.alice.s, p: st.eve.p };
      result = window.QuantumIntercept.resolveRound(cfg, Math.random);
    }
    // botnet crack decision: file crackable if final key short enough for the worker count within window
    var keyBits = result.finalKey || 0;
    result.fileCracked = st.eve.workers > 0 && window.PhantomBotnet.crackableWithin(keyBits, st.eve.workers, window.PhantomBotnet.ROUND_WINDOW);
    st.lastResult = { result: result, decision: decision };
    st.phase = "resolve"; emit();
    return st.lastResult;
  }
  function advance() { st.phase = "setup"; st.eve = { p: 0, workers: 0 }; st.lastResult = null; emit(); }
  window.QkdActions = { state: function () { return st; }, subscribe: subscribe,
    aliceSet: aliceSet, eveIntercept: eveIntercept, eveCrack: eveCrack, eveStopCrack: eveStopCrack,
    bobDecide: bobDecide, advance: advance };
})();
