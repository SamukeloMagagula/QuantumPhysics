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
          if (!f) return "alice: upload cancelled";
          var msg = "alice: uploaded " + f.name + " (" + f.type + ", " + f.size + " bytes)";
          if (f.snippet) msg += ": \"" + f.snippet + "\"";
          return msg;
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
