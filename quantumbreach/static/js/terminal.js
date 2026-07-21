(function () {
  // flags: single-dash tokens (-d, -e, -r ...) are always booleans (caesar/xor/b64 and
  // others depend on this). Double-dash tokens (--len, --sample ...) capture the NEXT
  // token as their value when it exists and isn't itself a flag (e.g. "--len 12" ->
  // flags.len = "12"); with no following value they fall back to boolean true, same
  // as single-dash.
  function parse(line) {
    var toks = [], re = /"([^"]*)"|'([^']*)'|(\S+)/g, m;
    while ((m = re.exec(line))) toks.push(m[1] != null ? m[1] : m[2] != null ? m[2] : m[3]);
    var cmd = toks.shift() || "", args = [], flags = {};
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t[0] !== "-") { args.push(t); continue; }
      var name = t.replace(/^-+/, "");
      if (t.slice(0, 2) === "--" && toks[i + 1] != null && toks[i + 1][0] !== "-") { flags[name] = toks[++i]; }
      else { flags[name] = true; }
    }
    return { cmd: cmd, args: args, flags: flags };
  }

  var C = window.PhantomCrypto;
  var registry = {
    help: function () { return [
      "FILES:  pwd cd ls cat mkdir touch rm cp mv echo head tail find tree",
      "TEXT:   grep wc sort uniq diff strings xxd hexdump md5sum sha256sum",
      "NET:    ifconfig ip ping nmap netstat ssh",
      "SYSTEM: ps top kill uname date history man sudo neofetch banner",
      "CRYPTO: caesar xor brute freq b64",
      "GAME:   qkd alice eve bob   |   LABS: lab create|list|play|export|delete",
      "Type 'man <cmd>' for usage."].join("\n"); },
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
    // quote-aware redirection detection: tokenize first (mirroring parse()'s
    // tokenizer) and track which tokens came from a quoted segment, so a
    // literal '>' inside quotes (e.g. caesar -e 3 "attack > noon") is never
    // mistaken for the output-redirect operator.
    var redir = null;
    var toks = [], quoted = [], re = /"([^"]*)"|'([^']*)'|(\S+)/g, tm;
    while ((tm = re.exec(line))) {
      quoted.push(tm[1] != null || tm[2] != null);
      toks.push(tm[1] != null ? tm[1] : tm[2] != null ? tm[2] : tm[3]);
    }
    for (var i = 0; i < toks.length; i++) {
      if (quoted[i]) continue; // never redirect on a quoted token
      var mm = /^(>>?)(.*)$/.exec(toks[i]);
      if (!mm) continue;
      var mode = mm[1], path = mm[2];
      if (!path && i + 1 < toks.length) path = toks[i + 1]; // '> file' form
      if (path) {
        redir = { mode: mode, path: path };
        line = toks.slice(0, i).map(function (t, idx) { return quoted[idx] ? '"' + t + '"' : t; }).join(" ");
        break;
      }
    }
    var p = parse(line); if (!p.cmd) return Promise.resolve("");
    p.raw = line;
    var fn = registry[p.cmd];
    if (!fn) return Promise.resolve("phantomshell: command not found: " + p.cmd);
    return Promise.resolve().then(function () { return fn(p); }).then(function (res) {
      if (redir && typeof res === "string" && window.PhantomVFS && env.tree) {
        var abs = PhantomVFS.resolve(env.tree, env.cwd, redir.path);
        var prev = redir.mode === ">>" ? (function () { try { return PhantomVFS.readFile(env.tree, abs); } catch (e) { return ""; } })() : "";
        PhantomVFS.writeFile(env.tree, abs, prev + res + (res.slice(-1) === "\n" ? "" : "\n"));
        window.PhantomShell.persist();
        return "";
      }
      return res;
    }).catch(function (e) { return "error: " + (e && e.message ? e.message : e); });
  }
  window.PhantomShell = { parse: parse, run: run, registry: registry };
  window.PhantomShell.man = {
    ls: "ls [-l] [path] — list directory contents",
    cd: "cd <path> — change directory",
    cat: "cat <file> — print a file",
    grep: "grep <pattern> <file> — filter lines",
    nmap: "nmap <target> — scan the quantum channel",
    qkd: "qkd status | qkd export | qkd crack <path>|--upload [--maxbits N]",
    eve: "eve tap <index> <basis +|x> | eve commit [--workers N] | eve crack [--workers N] | eve crack --stop",
    alice: "alice set --len N --sample S --file <name> | alice upload",
    bob: "bob keep|abort — decide on the received key"
  };

  // --- environment + pack extension (v3) ---
  var env = { tree: (window.PhantomVFS ? PhantomVFS.load() : null), cwd: "/home/operative" };
  window.PhantomShell.env = env;
  window.PhantomShell.extend = function (obj) { Object.keys(obj).forEach(function (k) { registry[k] = obj[k]; }); };
  window.PhantomShell.persist = function () { if (window.PhantomVFS && env.tree) PhantomVFS.save(env.tree); };

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
      else if (e.key === "Tab") { e.preventDefault(); var val = input.value; var sp = val.indexOf(" ");
        if (sp === -1) { var cur = val.trim(); var names = Object.keys(window.PhantomShell.registry); var hit = names.filter(function (n) { return n.indexOf(cur) === 0; }); if (hit.length === 1) input.value = hit[0] + " "; }
        else if (window.PhantomVFS) { var lastSp = val.lastIndexOf(" "); var frag = val.slice(lastSp + 1);
          try { var entries = PhantomVFS.list(env.tree, env.cwd); var phit = entries.filter(function (n) { return n.indexOf(frag) === 0; }); if (phit.length === 1) input.value = val.slice(0, lastSp + 1) + phit[0]; } catch (ex) {} }
      }
    });
    root.addEventListener("click", function () { input.focus(); });
    input.focus();
  });
})();
