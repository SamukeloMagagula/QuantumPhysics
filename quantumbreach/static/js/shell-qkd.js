// quantumbreach/static/js/shell-qkd.js
// Terminal commands (qkd/alice/eve/bob) that drive the SAME QkdActions state the
// on-page /qkd buttons write to. QkdActions is only ever defined on /qkd — running
// these on /terminal alone degrades to a friendly guard message rather than throwing
// (a known/acceptable cross-page limitation; parity is proven on /qkd).
(function () {
  var S = window.PhantomShell; if (!S) return;
  function A() { return window.QkdActions; }
  S.extend({
    qkd: function (p) { var sub = p.args[0];
      if (sub === "status") { if (!A()) return "qkd: open the QKD page first"; var s = A().state(); return "phase:" + s.phase + " n:" + s.alice.n + " workers:" + s.eve.workers; }
      return "usage: qkd status | alice set ... | eve intercept N | eve crack --workers N | bob keep|abort"; },
    alice: function (p) { if (!A()) return "qkd: open the QKD page first";
      if (p.args[0] !== "set") return "usage: alice set --len N --sample S --file <name>";
      var o = {}; if (p.flags.len) o.n = +p.flags.len; if (p.flags.sample) o.s = +p.flags.sample; if (p.flags.file) o.file = p.flags.file;
      A().aliceSet(o); return "alice: key set"; },
    eve: function (p) { if (!A()) return "qkd: open the QKD page first";
      if (p.args[0] === "intercept") { A().eveIntercept(+p.args[1] || 0); return "eve: intercepting " + (p.args[1] || 0) + "%"; }
      if (p.args[0] === "crack") { if (p.flags.stop) { A().eveStopCrack(); return "eve: crack stopped"; }
        var w = p.flags.workers ? (+p.flags.workers) : (+p.args[1] || 8); A().eveCrack({ workers: w }); return "eve: " + w + " workers cracking"; }
      return "usage: eve intercept <0-100> | eve crack [--workers N] | eve crack --stop"; },
    bob: function (p) { if (!A()) return "qkd: open the QKD page first";
      var d = p.args[0]; if (d !== "keep" && d !== "abort") return "usage: bob keep|abort";
      var r = A().bobDecide(d); return "bob: " + d + " — " + (r.result.fileCracked ? "EVE CRACKED THE FILE" : "delivered:" + (d === "keep" && !r.result.eveHit)); }
  });
})();
