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
    var logBox = el("div", "stage-log");

    root.appendChild(payload); root.appendChild(net);
    root.appendChild(intrusion); root.appendChild(timer); root.appendChild(logBox);

    var tapCb = null;
    var handle = {
      root: root, qubitsEl: qubits, payloadEl: payload, logEl: logBox, timerEl: timer,
      log: function (line, kind) { var d = el("div", "log-line " + (kind || "info")); d.textContent = line; logBox.appendChild(d); logBox.scrollTop = logBox.scrollHeight; },
      setIntrusion: function (pct, abortLine) {
        var v = Math.max(0, Math.min(1, +pct || 0)); var line = abortLine == null ? 0.11 : abortLine;
        ifill.style.width = Math.round(v * 100) + "%";
        ifill.className = "stage-intrusion-fill " + (v > line ? "hot" : "cool");
      },
      setTimer: function (txt) { timer.textContent = txt; },
      onTap: function (cb) { tapCb = cb; },
      _emitTap: function (index, b) { if (tapCb) tapCb({ index: index, basis: b }); },
      setPayload: function () {}, streamQubits: function () {}, revealFile: function () {}, playReplay: function () {}
    };
    return handle;
  }
  window.QuantumStage = { mount: mount };
})();
