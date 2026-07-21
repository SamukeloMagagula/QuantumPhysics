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
