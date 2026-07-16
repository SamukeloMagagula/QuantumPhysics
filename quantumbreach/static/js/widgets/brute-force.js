(function () {
  function caesar(text, k) {
    k = ((k % 26) + 26) % 26;
    return text.replace(/[a-z]/gi, function (c) {
      var base = c <= "Z" ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + k) % 26) + base);
    });
  }
  document.querySelectorAll('[data-widget="brute-force"]').forEach(function (el) {
    el.innerHTML =
      '<label>Ciphertext</label><input class="bf-text" value="Esp dpncpe qwlr td BFLYEFX">' +
      '<div class="out bf-out"></div>';
    var text = el.querySelector(".bf-text");
    var out = el.querySelector(".bf-out");
    function render() {
      var lines = [];
      for (var k = 1; k <= 25; k++) {
        lines.push(String(k).padStart(2, "0") + ": " + caesar(text.value, -k));
      }
      out.textContent = lines.join("\n");
    }
    text.addEventListener("input", render);
    render();
  });
})();
