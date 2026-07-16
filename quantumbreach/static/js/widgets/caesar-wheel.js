(function () {
  function caesar(text, k) {
    k = ((k % 26) + 26) % 26;
    return text.replace(/[a-z]/gi, function (c) {
      var base = c <= "Z" ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + k) % 26) + base);
    });
  }
  document.querySelectorAll('[data-widget="caesar-wheel"]').forEach(function (el) {
    el.innerHTML =
      '<label>Text</label><input class="cw-text" value="Hello, World!">' +
      '<label>Shift: <span class="cw-k">3</span></label>' +
      '<input class="cw-shift" type="range" min="0" max="25" value="3">' +
      '<div class="out"></div>';
    var text = el.querySelector(".cw-text");
    var shift = el.querySelector(".cw-shift");
    var klabel = el.querySelector(".cw-k");
    var out = el.querySelector(".out");
    function render() {
      klabel.textContent = shift.value;
      out.textContent = caesar(text.value, parseInt(shift.value, 10));
    }
    text.addEventListener("input", render);
    shift.addEventListener("input", render);
    render();
  });
})();
