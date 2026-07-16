(function () {
  function caesar(text, k) { k = ((k % 26) + 26) % 26;
    return String(text).replace(/[a-z]/gi, function (c) { var b = c <= "Z" ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + k) % 26) + b); }); }
  function caesarDecrypt(text, k) { return caesar(text, -k); }
  function brute(text) { var o = []; for (var k = 1; k <= 25; k++) o.push({ key: k, text: caesarDecrypt(text, k) }); return o; }

  function hexToBytes(h) { h = String(h).replace(/\s+/g, ""); var o = []; for (var i = 0; i + 1 < h.length; i += 2) o.push(parseInt(h.substr(i, 2), 16)); return o; }
  function bytesToHex(a) { return a.map(function (b) { return (b & 0xff).toString(16).padStart(2, "0"); }).join(""); }
  function strToBytes(s) { var o = []; for (var i = 0; i < s.length; i++) o.push(s.charCodeAt(i) & 0xff); return o; }
  function bytesToStr(a) { return a.map(function (b) { return String.fromCharCode(b); }).join(""); }
  function xor(data, key) { if (!key.length) throw new Error("empty key"); return data.map(function (b, i) { return b ^ key[i % key.length]; }); }
  function singleByteXor(data, k) { return data.map(function (b) { return b ^ (k & 0xff); }); }

  function b64encode(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64decode(s) { return decodeURIComponent(escape(atob(s))); }

  function freq(text) { var c = {}, t = 0; String(text).toLowerCase().replace(/[a-z]/g, function (ch) { c[ch] = (c[ch] || 0) + 1; t++; return ch; }); var o = {}; if (!t) return o; for (var k in c) o[k] = c[k] / t; return o; }

  function rnd(n) { return Math.floor(Math.random() * n); }
  var bb84 = {
    prepare: function (n) { var bits = [], bases = []; for (var i = 0; i < n; i++) { bits.push(rnd(2)); bases.push(rnd(2) ? "+" : "x"); } return { bits: bits, bases: bases }; },
    measure: function (bit, base, mbase) { return base === mbase ? bit : rnd(2); },
    eveIntercept: function (bits, bases) { var nb = [], nba = []; for (var i = 0; i < bits.length; i++) { var mb = rnd(2) ? "+" : "x"; var m = bb84.measure(bits[i], bases[i], mb); nb.push(m); nba.push(mb); } return { bits: nb, bases: nba }; },
    sift: function (aBases, bBases, aBits, bMeas) { var ak = [], bk = [], pos = []; for (var i = 0; i < aBases.length; i++) if (aBases[i] === bBases[i]) { ak.push(aBits[i]); bk.push(bMeas[i]); pos.push(i); } return { aKey: ak, bKey: bk, positions: pos }; },
    qber: function (ak, bk) { if (!ak.length) return 0; var m = 0; for (var i = 0; i < ak.length; i++) if (ak[i] !== bk[i]) m++; return m / ak.length; }
  };

  function sha256hex(str) { var enc = new TextEncoder().encode(str); return crypto.subtle.digest("SHA-256", enc).then(function (buf) { return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join(""); }); }

  window.PhantomCrypto = { caesar: caesar, caesarDecrypt: caesarDecrypt, brute: brute, hexToBytes: hexToBytes, bytesToHex: bytesToHex, strToBytes: strToBytes, bytesToStr: bytesToStr, xor: xor, singleByteXor: singleByteXor, b64encode: b64encode, b64decode: b64decode, freq: freq, bb84: bb84, sha256hex: sha256hex };
})();
