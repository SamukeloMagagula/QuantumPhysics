(function () {
  document.querySelectorAll('[data-widget="frequency"]').forEach(function (el) {
    el.innerHTML =
      '<label>Text to analyse</label><textarea class="fq-text" rows="3"></textarea>' +
      '<div class="bar-freq"></div><div class="out fq-out"></div>';
    var text = el.querySelector(".fq-text");
    var bars = el.querySelector(".bar-freq");
    var out = el.querySelector(".fq-out");
    function render() {
      var counts = {}, total = 0;
      (text.value.toLowerCase().match(/[a-z]/g) || []).forEach(function (ch) {
        counts[ch] = (counts[ch] || 0) + 1; total++;
      });
      bars.innerHTML = "";
      var max = 0;
      "abcdefghijklmnopqrstuvwxyz".split("").forEach(function (ch) {
        max = Math.max(max, counts[ch] || 0);
      });
      "abcdefghijklmnopqrstuvwxyz".split("").forEach(function (ch) {
        var b = document.createElement("div");
        b.className = "b";
        b.style.height = (max ? (100 * (counts[ch] || 0) / max) : 0) + "%";
        b.title = ch + ": " + (counts[ch] || 0);
        bars.appendChild(b);
      });
      if (total) {
        var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
        out.textContent = "Most common letter: '" + top + "' (" +
          ((100 * counts[top] / total).toFixed(1)) + "%). In English that is usually 'e'.";
      } else {
        out.textContent = "";
      }
    }
    text.addEventListener("input", render);
    render();
  });
})();
