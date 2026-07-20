// quantumbreach/static/js/qkd-file.js
(function () {
  // Deterministic, deliberately-weak keystream: a short sifted key => short period.
  // period = max(1, keyBits.length); byte i = f(keyBits, i). This is a TEACHING toy.
  function stretch(keyBits, nBytes) {
    var period = Math.max(1, keyBits.length);
    var out = new Uint8Array(nBytes);
    for (var i = 0; i < nBytes; i++) {
      // pack 8 bits (with wraparound over the period) into a byte, offset by i
      var b = 0;
      for (var j = 0; j < 8; j++) {
        var bit = keyBits[(i + j) % period] ? 1 : 0;
        b = (b << 1) | bit;
      }
      out[i] = b ^ (i & 0xff);
    }
    return out;
  }
  function xorStream(bytes, keyBits) {
    var ks = stretch(keyBits, bytes.length), out = new Uint8Array(bytes.length);
    for (var i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ ks[i];
    return out;
  }
  function bytesToDataUrl(bytes, mime) {
    var bin = ""; for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return "data:" + (mime || "application/octet-stream") + ";base64," + btoa(bin);
  }
  function renderInto(el, bytes, mime) {
    el.innerHTML = "";
    if (!bytes) { el.textContent = "(no payload)"; return; }
    if (mime && mime.indexOf("text/") === 0) {
      var pre = document.createElement("pre");
      var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      pre.textContent = s; el.appendChild(pre);
    } else if (mime && mime.indexOf("image/") === 0) {
      var img = document.createElement("img"); img.style.maxWidth = "100%"; img.src = bytesToDataUrl(bytes, mime); el.appendChild(img);
    } else if (mime === "application/pdf") {
      var emb = document.createElement("embed"); emb.type = "application/pdf"; emb.width = "100%"; emb.height = "360"; emb.src = bytesToDataUrl(bytes, mime); el.appendChild(emb);
    } else {
      el.textContent = "(binary payload, " + bytes.length + " bytes)";
    }
  }
  function scrambleInto(el, bytes) {
    el.innerHTML = "";
    var pre = document.createElement("pre"); pre.className = "scrambled";
    var s = "", n = Math.min(bytes ? bytes.length : 64, 256);
    for (var i = 0; i < n; i++) { var c = bytes ? bytes[i] : Math.floor(Math.random() * 256); s += (c < 16 ? "0" : "") + c.toString(16); }
    pre.textContent = s; el.appendChild(pre);
  }
  window.QkdFile = { stretch: stretch, encrypt: xorStream, decrypt: xorStream,
    bytesToDataUrl: bytesToDataUrl, renderInto: renderInto, scrambleInto: scrambleInto };
})();
