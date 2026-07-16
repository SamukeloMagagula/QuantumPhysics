(function () {
  var KEY = "phantomq.fx";
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var off = localStorage.getItem(KEY) === "off" || reduced;
  var rafId = null;

  function apply() { document.body.classList.toggle("fx-off", off); }

  function matrix() {
    if (off || rafId) return;
    var c = document.getElementById("fx-bg");
    if (!c) return;
    var ctx = c.getContext("2d");
    function size() { c.width = window.innerWidth; c.height = window.innerHeight; }
    size(); window.addEventListener("resize", size);
    var glyphs = "01<>/\\[]{}#$%&*+=ABCDEFGHJKLMNPQRSTUVWXYZ".split("");
    var font = 14, cols = Math.floor(c.width / font);
    var drops = new Array(Math.ceil(cols)).fill(1);
    var last = 0;
    function frame(t) {
      if (off) { rafId = null; return; }
      rafId = requestAnimationFrame(frame);
      if (t - last < 60) return; last = t;  // ~16fps cap
      ctx.fillStyle = "rgba(11,15,20,.20)"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#2be0c5"; ctx.font = font + "px monospace";
      cols = Math.floor(c.width / font);
      for (var i = 0; i < cols; i++) {
        var ch = glyphs[Math.floor(Math.random() * glyphs.length)];
        ctx.fillText(ch, i * font, (drops[i] || 1) * font);
        if ((drops[i] || 1) * font > c.height && Math.random() > 0.975) drops[i] = 0;
        drops[i] = (drops[i] || 1) + 1;
      }
    }
    rafId = requestAnimationFrame(frame);
  }

  function typewriter(el, text, opts) {
    opts = opts || {};
    if (off) { el.textContent = text; if (opts.done) opts.done(); return; }
    el.textContent = ""; var i = 0;
    (function tick() {
      el.textContent = text.slice(0, ++i);
      if (i < text.length) setTimeout(tick, opts.speed || 22);
      else if (opts.done) opts.done();
    })();
  }

  function countUp(el, to) {
    to = parseInt(to, 10) || 0;
    if (off) { el.textContent = to; return; }
    var from = parseInt(el.getAttribute("data-count") || "0", 10), start = null;
    function step(t) {
      if (!start) start = t;
      var k = Math.min(1, (t - start) / 600);
      el.textContent = Math.round(from + (to - from) * k);
      if (k < 1) requestAnimationFrame(step); else el.setAttribute("data-count", to);
    }
    requestAnimationFrame(step);
  }

  function boot() {
    var b = document.getElementById("boot");
    if (!b) return;
    if (off || sessionStorage.getItem("phantomq.booted")) { b.remove(); return; }
    sessionStorage.setItem("phantomq.booted", "1");
    var line = b.querySelector(".line");
    typewriter(line, "INITIALIZING PHANTOMQ...\nESTABLISHING SECURE CHANNEL...\nACCESS GRANTED", {
      speed: 18, done: function () { setTimeout(function () { b.classList.add("hide"); setTimeout(function () { b.remove(); }, 600); }, 500); }
    });
    b.addEventListener("click", function () { b.remove(); });
  }

  window.PhantomFX = {
    init: function () { apply(); matrix(); boot();
      document.querySelectorAll("[data-typewriter]").forEach(function (el) { typewriter(el, el.textContent.trim(), { speed: 14 }); });
      document.querySelectorAll("[data-countup]").forEach(function (el) { countUp(el, el.getAttribute("data-countup")); });
    },
    setReducedMotion: function (v) { off = !!v; localStorage.setItem(KEY, off ? "off" : "on"); apply(); if (!off) matrix(); },
    isOff: function () { return off; },
    typewriter: typewriter, countUp: countUp
  };
  document.addEventListener("DOMContentLoaded", function () { window.PhantomFX.init(); });
})();
