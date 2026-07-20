// quantumbreach/static/js/shell-sys.js
(function () {
  var S = window.PhantomShell; if (!S) return;
  var start = Date.now();
  S.extend({
    ps: function () { var procs = ["  PID CMD", "    1 phantom-init", "   42 phantomshell"];
      if (window.PhantomBotnet && window.PhantomBotnet.pids) window.PhantomBotnet.pids().forEach(function (pid) { procs.push("  " + pid + " botnet-worker"); });
      return procs.join("\n"); },
    top: function () { return S.registry.ps({ args: [], flags: {} }) + "\n(load: quantum)"; },
    kill: function (p) { var pid = p.args[0]; if (window.PhantomBotnet && window.PhantomBotnet.kill) { return window.PhantomBotnet.kill(pid) ? "killed " + pid : "kill: no such process: " + pid; } return "kill: no such process: " + pid; },
    uname: function () { return "PhantomOS ghost 5.0-quantum x86_64 GNU/PhantomShell"; },
    date: function () { return new Date().toString(); },
    history: function () { return "(history is per-session; use ArrowUp)"; },
    sudo: function () { return "operative is not in the sudoers file. This incident will be reported."; },
    neofetch: function () { return "PhantomOS // Ghost Protocol\n  uptime: " + Math.floor((Date.now() - start) / 1000) + "s\n  shell: PhantomShell v3\n  theme: neon-matrix"; },
    man: function (p) { var c = p.args[0]; if (!c) return "what manual page do you want?"; return (S.man && S.man[c]) ? "NAME\n  " + c + "\nUSAGE\n  " + S.man[c] : "No manual entry for " + c; }
  });
})();
