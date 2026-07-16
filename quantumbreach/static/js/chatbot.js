(function () {
  function normalize(s) { return (s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(); }
  function score(input, keys) {
    var n = " " + normalize(input) + " ", best = 0;
    keys.forEach(function (k) { var kk = normalize(k); if (kk && n.indexOf(" " + kk + " ") !== -1) best = Math.max(best, kk.length);
      else { kk.split(" ").forEach(function (w) { if (w.length > 2 && n.indexOf(" " + w + " ") !== -1) best = Math.max(best, w.length); }); } });
    return best;
  }
  function match(input) {
    var kb = window.GHOST_KB || [], top = null, topScore = 0;
    kb.forEach(function (it) { var s = score(input, it.keys); if (s > topScore) { topScore = s; top = it; } });
    return topScore > 0 ? top : null;
  }
  function reply(input) {
    var m = match(input);
    if (m) return { answer: m.answer, action: m.action || null };
    return { answer: "I didn't catch that. Try: how do I start, what is XOR, open the terminal, or take me to the QKD game.", action: null };
  }
  window.GhostBot = { normalize: normalize, match: match, reply: reply };

  // UI
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  document.addEventListener("DOMContentLoaded", function () {
    var launcher = el("button", "ghost-launch", "GHOST");
    var panel = el("div", "ghost-panel");
    panel.style.display = "none";
    panel.appendChild(el("div", "ghost-head", "GHOST // navigation assist"));
    var log = el("div", "ghost-log");
    panel.appendChild(log);
    var row = el("div", "ghost-row");
    var input = el("input", "ghost-input"); input.placeholder = "ask me where to go...";
    row.appendChild(input); panel.appendChild(row);
    document.body.appendChild(launcher); document.body.appendChild(panel);

    function add(who, text) { var m = el("div", "ghost-msg " + who, text); log.appendChild(m); log.scrollTop = log.scrollHeight; }
    add("bot", "I'm GHOST. Ask me how to start, what a cipher is, or say 'terminal' / 'qkd'.");
    launcher.addEventListener("click", function () { panel.style.display = panel.style.display === "none" ? "flex" : "none"; input.focus(); });
    function send() {
      var v = input.value.trim(); if (!v) return; add("me", v); input.value = "";
      var r = window.GhostBot.reply(v); add("bot", r.answer);
      if (r.action && r.action.type === "nav") { add("bot", "Taking you there..."); setTimeout(function () { window.location = r.action.href; }, 700); }
    }
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") send(); });
  });
})();
