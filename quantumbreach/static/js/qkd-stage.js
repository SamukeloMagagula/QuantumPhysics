(function () {
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function mount(root, opts) {
    opts = opts || {};
    root.classList.add("stage");
    root.innerHTML = "";
    var net = el("div", "stage-net");
    var alice = el("div", "stage-node alice", "<span class='dev'>💻</span><span class='who'>Alice</span>");
    var fiber = el("div", "stage-fiber");
    var qubits = el("div", "stage-qubits");
    fiber.appendChild(qubits);
    var evetap = el("div", "stage-evetap", "<span class='dev'>🕵</span><span class='who'>Eve tap</span>");
    fiber.appendChild(evetap);
    var bob = el("div", "stage-node bob", "<span class='dev'>💻</span><span class='who'>Bob</span>");
    net.appendChild(alice); net.appendChild(fiber); net.appendChild(bob);

    var payload = el("div", "stage-payload");
    var timer = el("div", "stage-timer");
    var intrusion = el("div", "stage-intrusion");
    var ifill = el("div", "stage-intrusion-fill cool");
    intrusion.appendChild(ifill);
    var logBox = opts.feedEl || el("div", "stage-log");

    root.appendChild(payload); root.appendChild(net);
    root.appendChild(intrusion); root.appendChild(timer);
    if (!opts.feedEl) root.appendChild(logBox);

    var tapCb = null;
    var handle = {
      root: root, qubitsEl: qubits, payloadEl: payload, logEl: logBox, timerEl: timer,
      log: function (line, kind) {
        var d = el("div", "log-line " + (kind || "info")); d.textContent = line;
        logBox.appendChild(d);
        // Cap only log-line entries, not a feedEl's own header (e.g. #qkd-feed's <h4>).
        var lines = logBox.querySelectorAll(".log-line");
        while (lines.length > 200) { logBox.removeChild(lines[0]); lines = logBox.querySelectorAll(".log-line"); }
        logBox.scrollTop = logBox.scrollHeight;
      },
      setIntrusion: function (pct, abortLine) {
        var v = Math.max(0, Math.min(1, +pct || 0)); var line = abortLine == null ? 0.11 : abortLine;
        ifill.style.width = Math.round(v * 100) + "%";
        ifill.className = "stage-intrusion-fill " + (v > line ? "hot" : "cool");
      },
      setTimer: function (txt) { timer.textContent = txt; },
      onTap: function (cb) { tapCb = cb; },
      _emitTap: function (index, b) { if (tapCb) tapCb({ index: index, basis: b }); },
      setPayload: function (mime, thumbText) {
        payload.innerHTML = "";
        var chip = el("div", "payload-chip");
        chip.innerHTML = "<span class='pf'>" + ((mime || "").indexOf("image") === 0 ? "🖼" : (mime === "application/pdf" ? "📄" : "🗎")) + "</span> ";
        chip.appendChild(document.createTextNode(thumbText || "payload"));
        payload.appendChild(chip);
      },
      revealFile: function (paneEl, bytes, mime, mode) {
        if (!paneEl || !window.QkdFile) return Promise.resolve();
        var reduced = (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
          || (window.PhantomFX && window.PhantomFX.isOff && window.PhantomFX.isOff());
        if (mode === "scramble") { window.QkdFile.scrambleInto(paneEl, bytes || null); return Promise.resolve(); }
        paneEl.classList.add("decrypting");
        return new Promise(function (resolve) {
          var done = function () { paneEl.classList.remove("decrypting"); window.QkdFile.renderInto(paneEl, bytes, mime); resolve(); };
          if (reduced) { done(); } else { setTimeout(done, 500); }
        });
      },
      playReplay: function (replay, ropts) {
        replay = replay || {};
        var states = (replay.aBases || []).map(function (b) { return { basis: b }; });
        handle.streamQubits(states, { tappable: false });
        var qs = qubits.querySelectorAll(".qubit");
        (replay.eveTaps || []).forEach(function (t) { if (qs[t.i]) qs[t.i].classList.add("grabbed"); });
        (replay.sampleIndices || []).forEach(function (idx, k) {
          if (qs[idx]) qs[idx].classList.add((replay.sampleErrors || [])[k] ? "err" : "ok");
        });
        var errs = (replay.sampleErrors || []).filter(Boolean).length;
        var rate = (replay.sampleIndices || []).length ? errs / replay.sampleIndices.length : 0;
        handle.setIntrusion(rate, 0.11);
        handle.log("Replay: " + (replay.eveTaps || []).length + " qubits tapped, intrusion " + Math.round(rate * 100) + "%", "eve");
        return Promise.resolve();
      }
    };

    var taps = [];
    handle.tapsSoFar = function () { return taps.slice(); };
    handle.streamQubits = function (states, sopts) {
      sopts = sopts || {};
      qubits.innerHTML = ""; taps = [];
      var count = states.length;
      states.forEach(function (st, i) {
        var q = el("span", "qubit" + (sopts.tappable ? " tappable" : ""));
        q.textContent = st.glyph || (st.basis === "x" ? "◇" : st.basis === "+" ? "○" : "•");
        q.style.left = (count <= 1 ? 50 : (i / (count - 1)) * 92 + 4) + "%";
        if (sopts.tappable) {
          q.addEventListener("click", function () {
            if (q.classList.contains("grabbed")) return;
            openPicker(q, i);
          });
        }
        qubits.appendChild(q);
      });
    };
    function openPicker(q, i) {
      var old = root.querySelector(".tap-picker"); if (old) old.remove();
      var pk = el("div", "tap-picker");
      ["+", "x"].forEach(function (b) {
        var btn = el("button", "tap-basis"); btn.type = "button";
        btn.setAttribute("data-basis", b); btn.textContent = b === "x" ? "⊗" : "⊕";
        btn.addEventListener("click", function () {
          q.classList.add("grabbed"); pk.remove();
          taps.push({ i: i, basis: b }); handle._emitTap(i, b);
        });
        pk.appendChild(btn);
      });
      q.appendChild(pk);
    }
    return handle;
  }
  window.QuantumStage = { mount: mount };
})();
