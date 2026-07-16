(function () {
  function parse(line) {
    var toks = [], re = /"([^"]*)"|'([^']*)'|(\S+)/g, m;
    while ((m = re.exec(line))) toks.push(m[1] != null ? m[1] : m[2] != null ? m[2] : m[3]);
    var cmd = toks.shift() || "", args = [], flags = {};
    toks.forEach(function (t) { if (t[0] === "-") flags[t.replace(/^-+/, "")] = true; else args.push(t); });
    return { cmd: cmd, args: args, flags: flags };
  }

  var C = window.PhantomCrypto;
  var registry = {
    help: function () { return "Commands:\n  help, clear, banner, whoami, rename <name>\n  ls [rooms], open <room-id>, leaderboard\n  caesar -e|-d <key> <text>\n  xor <keyhex> <text>\n  brute <text>\n  freq <text>\n  b64 -e|-d <text>\n  lab create | lab list | lab play <id> | lab export <id> | lab delete <id>"; },
    banner: function () { return "PhantomShell v2 // Ghost Protocol\nType 'help' to begin."; },
    clear: function () { return { clear: true }; },
    whoami: function () { return (window.__PQ_USER || "operative"); },
    rename: function (p) { var n = p.args.join(" "); if (!n) return "usage: rename <name>";
      return fetch("/api/rename", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) })
        .then(function (r) { return r.json(); }).then(function (d) { return d.displayName ? "renamed to " + d.displayName : (d.error || "error"); }); },
    ls: function () { return fetch("/api/rooms").then(function (r) { return r.json(); }).catch(function () { return { rooms: [] }; })
        .then(function (d) { return (d.rooms || []).map(function (x) { return "  " + x.id + "  (" + x.title + ")"; }).join("\n") || "(no rooms)"; }); },
    open: function (p) { var id = p.args[0]; if (!id) return "usage: open <room-id>"; window.location = "/rooms/" + id; return "opening " + id + "..."; },
    leaderboard: function () { window.location = "/leaderboard"; return "opening leaderboard..."; },
    caesar: function (p) { var k = parseInt(p.args[0], 10); var text = p.args.slice(1).join(" "); if (isNaN(k)) return "usage: caesar -e|-d <key> <text>"; return p.flags.d ? C.caesarDecrypt(text, k) : C.caesar(text, k); },
    xor: function (p) { var key = p.args[0], text = p.args.slice(1).join(" "); if (!key || !text) return "usage: xor <keyhex> <text>"; var kb = C.hexToBytes(key); var db = C.strToBytes(text); return C.bytesToHex(C.xor(db, kb)); },
    brute: function (p) { var t = p.args.join(" "); return C.brute(t).map(function (r) { return String(r.key).padStart(2, "0") + ": " + r.text; }).join("\n"); },
    freq: function (p) { var f = C.freq(p.args.join(" ")); var top = Object.keys(f).sort(function (a, b) { return f[b] - f[a]; }).slice(0, 5); return top.map(function (k) { return k + ": " + (f[k] * 100).toFixed(1) + "%"; }).join("  ") || "(no letters)"; },
    b64: function (p) { var t = p.args.join(" "); try { return p.flags.d ? C.b64decode(t) : C.b64encode(t); } catch (e) { return "bad input"; } },
    lab: function (p) {
      var L = window.PhantomLabs, sub = p.args[0];
      if (sub === "list") { var a = L.list(); return a.length ? a.map(function (l) { return "  " + l.id + "  " + l.title + " [" + l.type + "]"; }).join("\n") : "(no labs yet — run: lab create)"; }
      if (sub === "delete") { L.remove(p.args[1]); return "deleted " + p.args[1]; }
      if (sub === "export") { return L.exportYaml(p.args[1]); }
      if (sub === "play") { var l = L.get(p.args[1]); if (!l) return "no such lab"; return "wizardPlay:" + l.id; }
      if (sub === "create") { return "wizardCreate"; }
      return "usage: lab create | lab list | lab play <id> | lab export <id> | lab delete <id>";
    }
  };
  window.__PQ_registry = registry;

  function run(line) {
    var p = parse(line); if (!p.cmd) return Promise.resolve("");
    var fn = registry[p.cmd];
    if (!fn) return Promise.resolve("phantomshell: command not found: " + p.cmd);
    try { return Promise.resolve(fn(p)); }
    catch (e) { return Promise.resolve("error: " + (e && e.message ? e.message : e)); }
  }
  window.PhantomShell = { parse: parse, run: run, registry: registry };

  // Interactive shell (only on the terminal page)
  document.addEventListener("DOMContentLoaded", function () {
    var root = document.getElementById("shell"); if (!root) return;
    var out = document.getElementById("shell-out"), input = document.getElementById("shell-in");
    var history = [], hi = 0;
    var wizard = null;
    function print(text) { var d = document.createElement("div"); d.className = "sh-line"; d.textContent = text; out.appendChild(d); out.scrollTop = out.scrollHeight; }
    print("PhantomShell v2 // Ghost Protocol — type 'help'");
    function startCreate() {
      wizard = { step: 0, data: { type: "freeform" }, kind: "create",
        prompts: ["title? ", "prompt/description? ", "type (caesar|xor|freeform)? ", "answer? ", "hint (optional)? "] };
      print(wizard.prompts[0]);
    }
    function startPlay(id) { var l = window.PhantomLabs.get(id); wizard = { step: 0, kind: "play", id: id }; print(l.prompt); print("your answer? "); }
    function feedWizard(line) {
      if (wizard.kind === "create") {
        var keys = ["title", "prompt", "type", "answer", "hint"];
        wizard.data[keys[wizard.step]] = line; wizard.step++;
        if (wizard.step < wizard.prompts.length) { print(wizard.prompts[wizard.step]); }
        else { var lab = window.PhantomLabs.create(wizard.data); print("created " + lab.id + " — run: lab play " + lab.id); wizard = null; }
      } else if (wizard.kind === "play") {
        var ok = window.PhantomLabs.check(wizard.id, line); print(ok ? "CORRECT — flag captured." : "wrong, try again (lab play " + wizard.id + ")"); wizard = null;
      }
    }
    function submit() {
      var line = input.value; input.value = "";
      if (wizard) { print("$ " + line); feedWizard(line); return; }
      if (line.trim()) { history.push(line); hi = history.length; }
      print("$ " + line);
      Promise.resolve(window.PhantomShell.run(line)).then(function (res) {
        if (res && res.clear) { out.innerHTML = ""; return; }
        if (res === "wizardCreate") { startCreate(); return; }
        if (typeof res === "string" && res.indexOf("wizardPlay:") === 0) { startPlay(res.split(":")[1]); return; }
        if (res != null && res !== "") print(String(res));
      }).catch(function (e) { print("error: " + (e && e.message ? e.message : e)); });
    }
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") submit();
      else if (e.key === "ArrowUp") { if (hi > 0) input.value = history[--hi] || ""; e.preventDefault(); }
      else if (e.key === "ArrowDown") { if (hi < history.length) input.value = history[++hi] || ""; }
      else if (e.key === "Tab") { e.preventDefault(); var cur = input.value.trim(); var names = Object.keys(window.PhantomShell.registry).concat(["lab"]); var hit = names.filter(function (n) { return n.indexOf(cur) === 0; }); if (hit.length === 1) input.value = hit[0] + " "; }
    });
    root.addEventListener("click", function () { input.focus(); });
    input.focus();
  });
})();
