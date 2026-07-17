(function () {
  var ABORT = 0.11, DETECT = 25;
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
             stolen: stolen, eveHit: eveHit, intercepted: intercepted, aBases: aBases, bBases: bBases };
  }

  function scoreRound(role, result, decision) {
    var eve = !!result.eveHit, defender = 0, eveDelta = 0;
    if (decision === "abort") { if (eve) defender = DETECT; }
    else { if (eve) eveDelta = result.stolen || 0; else defender = result.finalKey || 0; }
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
})();
