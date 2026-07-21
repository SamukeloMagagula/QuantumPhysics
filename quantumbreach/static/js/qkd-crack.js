// quantumbreach/static/js/qkd-crack.js
// Standalone ciphertext export + a REAL brute-force search (not a scripted
// animation): every key-bit pattern up to a length cap is tried through the
// existing QkdFile keystream and checked for plausible plaintext. No
// dependency on QkdActions, the phase machine, or the server (beyond the
// already-loaded QkdFile keystream functions).
(function () {
  function bytesToBase64(bytes) {
    var bin = ""; for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function base64ToBytes(b64) {
    var bin = atob(b64); var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function isPlausible(bytes, mime) {
    if (mime === "image/png") {
      if (bytes.length < 8) return false;
      var sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
      for (var i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return false;
      return true;
    }
    if (mime === "application/pdf") {
      return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
    }
    var n = Math.min(bytes.length, 512), printable = 0;
    for (var j = 0; j < n; j++) {
      var b = bytes[j];
      if ((b >= 0x20 && b <= 0x7E) || b === 9 || b === 10 || b === 13) printable++;
    }
    return n > 0 && (printable / n) >= 0.9;
  }
  function exportCiphertext(payload, keyBits) {
    if (!payload || !window.QkdFile) return JSON.stringify({ v: 1, error: "no payload" });
    var ct = window.QkdFile.encrypt(payload.bytes, keyBits || []);
    return JSON.stringify({ v: 1, mime: payload.mime, cipher: bytesToBase64(ct) });
  }
  function bruteForce(bytes, mime, opts) {
    opts = opts || {};
    var maxBits = opts.maxBits != null ? opts.maxBits : 22;
    var startTime = Date.now();
    var length = 1, counter = 0, attempts = 0;
    var BATCH = 50000;
    return new Promise(function (resolve) {
      function step() {
        var total = Math.pow(2, length);
        var batchEnd = Math.min(counter + BATCH, total);
        for (; counter < batchEnd; counter++) {
          var bits = [];
          for (var b = length - 1; b >= 0; b--) bits.push((counter >> b) & 1);
          var pt = window.QkdFile.decrypt(bytes, bits);
          attempts++;
          if (isPlausible(pt, mime)) {
            resolve({ cracked: true, keyBits: bits, attempts: attempts, elapsedMs: Date.now() - startTime, maxBits: maxBits });
            return;
          }
        }
        if (counter >= total) { length++; counter = 0; }
        if (length > maxBits) {
          resolve({ cracked: false, keyBits: null, attempts: attempts, elapsedMs: Date.now() - startTime, maxBits: maxBits });
          return;
        }
        setTimeout(step, 0);
      }
      step();
    });
  }
  function crackVfsPath(path, opts) {
    if (!window.PhantomVFS || !window.PhantomShell || !window.PhantomShell.env) {
      return Promise.resolve({ cracked: false, keyBits: null, attempts: 0, elapsedMs: 0, error: "VFS unavailable" });
    }
    var env = window.PhantomShell.env, raw;
    try { raw = window.PhantomVFS.readFile(env.tree, window.PhantomVFS.resolve(env.tree, env.cwd, path)); }
    catch (e) { return Promise.resolve({ cracked: false, keyBits: null, attempts: 0, elapsedMs: 0, error: e.message }); }
    var mime = "application/octet-stream", bytes, parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) {}
    if (parsed && parsed.v === 1 && typeof parsed.cipher === "string") {
      mime = parsed.mime || mime;
      bytes = base64ToBytes(parsed.cipher);
    } else {
      bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
    }
    return bruteForce(bytes, mime, opts || {});
  }
  var _uploadInput = null;
  function crackUpload(opts) {
    if (!_uploadInput) {
      _uploadInput = document.createElement("input");
      _uploadInput.type = "file"; _uploadInput.style.display = "none";
      document.body.appendChild(_uploadInput);
    }
    return new Promise(function (resolve) {
      _uploadInput.value = "";
      _uploadInput.onchange = function () {
        var f = _uploadInput.files && _uploadInput.files[0];
        if (!f) { resolve({ cracked: false, keyBits: null, attempts: 0, elapsedMs: 0, error: "no file selected" }); return; }
        var reader = new FileReader();
        reader.onload = function () {
          bruteForce(new Uint8Array(reader.result), f.type || "application/octet-stream", opts || {}).then(resolve);
        };
        reader.readAsArrayBuffer(f);
      };
      _uploadInput.click();
    });
  }
  function formatResult(r) {
    if (r.error) return "qkd crack: " + r.error;
    if (r.cracked) return "CRACKED in " + r.attempts + " attempts (" + (r.elapsedMs / 1000).toFixed(1) + "s) — key length " + r.keyBits.length + " bits.";
    return "not cracked — exhausted " + r.attempts + " attempts (" + (r.elapsedMs / 1000).toFixed(1) + "s), up to " + (r.maxBits || 22) + "-bit keys.";
  }
  window.QkdCrack = { exportCiphertext: exportCiphertext, bruteForce: bruteForce,
    crackVfsPath: crackVfsPath, crackUpload: crackUpload, formatResult: formatResult };
})();
