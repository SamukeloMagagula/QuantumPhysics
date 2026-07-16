(function () {
  function hexToBytes(h) {
    h = h.replace(/\s+/g, "");
    var out = [];
    for (var i = 0; i + 1 < h.length; i += 2) out.push(parseInt(h.substr(i, 2), 16));
    return out;
  }
  document.querySelectorAll('[data-widget="xor-tool"]').forEach(function (el) {
    el.innerHTML =
      '<label>Ciphertext (hex)</label><input class="xt-hex" value="242e2325393a2d301d2b311d3027342730312b202e273f">' +
      '<label>Single-byte key (0–255)</label><input class="xt-key" type="number" min="0" max="255" value="66">' +
      '<div class="out xt-out"></div>' +
      '<button class="btn ghost xt-all" type="button">Try all 256 keys</button>' +
      '<div class="out xt-brute"></div>';
    var hex = el.querySelector(".xt-hex");
    var key = el.querySelector(".xt-key");
    var out = el.querySelector(".xt-out");
    var brute = el.querySelector(".xt-brute");
    function decode(bytes, k) {
      return bytes.map(function (b) { return String.fromCharCode(b ^ k); }).join("");
    }
    function render() {
      var bytes = hexToBytes(hex.value);
      out.textContent = decode(bytes, parseInt(key.value, 10) & 0xff);
    }
    hex.addEventListener("input", render);
    key.addEventListener("input", render);
    el.querySelector(".xt-all").addEventListener("click", function () {
      var bytes = hexToBytes(hex.value);
      var lines = [];
      for (var k = 0; k < 256; k++) {
        var s = decode(bytes, k);
        if (/^[\x20-\x7e]+$/.test(s)) lines.push(k + ": " + s);
      }
      brute.textContent = lines.join("\n");
    });
    render();
  });
})();
