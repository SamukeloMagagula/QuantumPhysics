(function () {
  var code = null, role = null, timer = null, lastPhase = null, mounted = false;

  function api(url, body) {
    return fetch(url, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json(); });
  }
  function $(id) { return document.getElementById(id); }

  function mount(container) {
    if (mounted) return;
    mounted = true;
    container.querySelectorAll("[data-create]").forEach(function (b) {
      b.addEventListener("click", function () {
        api("/api/qkd/game", { role: b.getAttribute("data-create") }).then(function (d) {
          if (d.error) { $("qm-hint").textContent = d.error; return; } enter(d.code, d.role, true); });
      });
    });
    container.querySelectorAll("[data-join]").forEach(function (b) {
      b.addEventListener("click", function () {
        var c = ($("qm-code").value || "").toUpperCase().trim(); if (c.length !== 4) { $("qm-hint").textContent = "Enter a 4-letter code."; return; }
        api("/api/qkd/game/" + c + "/join", { role: b.getAttribute("data-join") }).then(function (d) {
          if (d.error) { $("qm-hint").textContent = d.error; return; } enter(c, d.role, false); });
      });
    });
    $("qm-start").addEventListener("click", function () { api("/api/qkd/game/" + code + "/start", {}).then(render); });
  }

  function enter(c, r, isHost) {
    code = c; role = r; $("qm-join").hidden = true; $("qm-play").hidden = false; $("qm-mycode").textContent = c;
    $("qm-start").hidden = !isHost;
    if (timer) clearInterval(timer); timer = setInterval(poll, 1500); poll();
  }
  function poll() { api("/api/qkd/game/" + code).then(render); }

  function render(st) {
    if (!st || st.error) return;
    $("qm-seats").innerHTML = st.seats.map(function (s) {
      return '<span class="chip' + (s.role === st.yourRole ? ' on' : '') + '">' + s.role + ": " + s.name + (s.submitted ? " ✓" : "") + "</span>";
    }).join("");
    $("qm-start").hidden = !(st.phase === "lobby" && $("qm-start").hidden === false);
    $("qm-scores").innerHTML = st.scores.map(function (s) { return '<span class="chip">' + s.role + ": " + s.score + "</span>"; }).join("");
    if (st.phase === "bob_decision" && typeof st.sampleQBER === "number") {
      var pct = Math.round(st.sampleQBER * 100); $("qm-qber").style.width = Math.min(100, pct * 3) + "%";
      $("qm-qber").className = "qber-fill " + (st.sampleQBER > 0.11 ? "hot" : "cool");
    }
    if (st.phase !== lastPhase) { $("qm-photons").innerHTML = ""; for (var i = 0; i < 24; i++) { var d = document.createElement("span"); d.className = "photon"; d.style.animationDelay = (i * 25) + "ms"; $("qm-photons").appendChild(d); } lastPhase = st.phase; }
    renderControls(st); renderStatus(st);
  }

  function renderStatus(st) {
    var map = { lobby: "Waiting in the lobby…", alice_setup: "Alice is setting up the key…",
      eve_move: "Eve is choosing whether to intercept…", bob_decision: "Bob is deciding keep or abort…",
      resolve: "Round over — see the result below.", ended: "Game over." };
    $("qm-status").textContent = (st.youAreUpNow ? "Your move. " : "") + (map[st.phase] || "");
  }

  function renderControls(st) {
    var box = $("qm-controls"), rv = $("qm-reveal");
    // Preserve Eve's in-progress botnet panel across 1.5s polls (don't wipe her slider/intercept).
    var keepEve = st.youAreUpNow && st.phase === "eve_move" && $("qm-w");
    if (!keepEve) box.innerHTML = "";
    rv.textContent = "";
    if (st.lastResult) {
      var lr = st.lastResult;
      rv.textContent = "Round " + lr.round + ": " + (lr.eveHit ? "Eve intercepted" : "clean") +
        ", QBER " + Math.round(lr.sampleQBER * 100) + "%, key " + lr.finalKey + " bits, Bob " + lr.bobDecision.toUpperCase() + ".";
    }
    if (!st.youAreUpNow) return;
    if (st.phase === "alice_setup") {
      box.innerHTML = '<label>Key length <input id="qm-n" type="range" min="8" max="64" value="24"></label>' +
        '<label>Check sample <input id="qm-s" type="range" min="0" max="24" value="6"></label>' +
        '<label>Payload <select id="qm-file">' +
          '<option value="mission">mission.txt</option>' +
          '<option value="codes">codes.txt</option>' +
          '<option value="photo">photo.png</option>' +
        '</select></label>' +
        '<button class="btn" id="qm-al-go" type="button">Send key</button>';
      $("qm-al-go").addEventListener("click", function () {
        act({ n: parseInt($("qm-n").value, 10), s: parseInt($("qm-s").value, 10), file: $("qm-file").value }); });
    } else if (st.phase === "eve_move") {
      if (keepEve) return;   // panel already built on a prior poll — keep Eve's selection
      var pIntercept = 0;
      box.innerHTML =
        '<div class="qm-intercepts"><span class="muted">Intercept:</span>' +
          '<button class="chip qm-ev on" data-p="0" type="button">None</button>' +
          '<button class="chip qm-ev" data-p="0.25" type="button">Light</button>' +
          '<button class="chip qm-ev" data-p="0.5" type="button">Heavy</button>' +
          '<button class="chip qm-ev" data-p="1" type="button">Full</button>' +
        '</div>' +
        '<label>Workers <span id="qm-w-val">0</span><input id="qm-w" type="range" min="0" max="100" value="0"></label>' +
        '<div id="qm-grid" class="worker-grid"></div>' +
        '<p class="muted"><span id="qm-rate">0</span> keys/s · ETA <span id="qm-eta">—</span> · detection +<span id="qm-detect">0</span>%</p>' +
        '<button class="btn" id="qm-eve-go" type="button">Commit move</button>';
      var drawPanel = function () {
        var w = parseInt($("qm-w").value, 10) || 0;
        $("qm-w-val").textContent = w;
        window.PhantomBotnet.renderPanel(
          { grid: $("qm-grid"), rate: $("qm-rate"), eta: $("qm-eta"), detect: $("qm-detect") },
          w, 24, pIntercept);   // 24 = display-only key-length estimate (Eve can't see Alice's n)
      };
      box.querySelectorAll(".qm-ev").forEach(function (b) {
        b.addEventListener("click", function () {
          box.querySelectorAll(".qm-ev").forEach(function (x) { x.classList.remove("on"); });
          b.classList.add("on"); pIntercept = parseFloat(b.getAttribute("data-p")); drawPanel();
        });
      });
      $("qm-w").addEventListener("input", drawPanel);
      $("qm-eve-go").addEventListener("click", function () {
        act({ p: pIntercept, workers: parseInt($("qm-w").value, 10) || 0 }); });
      drawPanel();
    } else if (st.phase === "bob_decision") {
      box.innerHTML = '<button class="btn" id="qm-keep" type="button">KEEP KEY</button>' +
        '<button class="btn ghost" id="qm-abort" type="button">ABORT</button>';
      $("qm-keep").addEventListener("click", function () { act({ decision: "keep" }); });
      $("qm-abort").addEventListener("click", function () { act({ decision: "abort" }); });
    } else if (st.phase === "resolve") {
      box.innerHTML = '<button class="btn" id="qm-next" type="button">Next round</button>';
      $("qm-next").addEventListener("click", function () { act({ next: true }); });
    }
  }
  function act(action) { api("/api/qkd/game/" + code + "/act", { action: action }).then(render); }

  window.QKDMulti = { mount: mount };
})();
