// quantumbreach/static/js/shell-fs.js
(function () {
  var S = window.PhantomShell, V = window.PhantomVFS; if (!S || !V) return;
  function env() { return S.env; }
  function abs(path) { var e = env(); return V.resolve(e.tree, e.cwd, path || "."); }
  S.extend({
    pwd: function () { return env().cwd; },
    cd: function (p) { var a = abs(p.args[0] || "~"); var n = V.node(env().tree, a);
      if (!n || n.type !== "dir") return "cd: no such directory: " + (p.args[0] || ""); env().cwd = a; return ""; },
    ls: function (p) { try { return V.list(env().tree, abs(p.args[0])).join(p.flags.l || p.flags.la ? "\n" : "  "); }
      catch (e) { return "ls: " + e.message; } },
    cat: function (p) { if (!p.args[0]) return "usage: cat <file>";
      try { return V.readFile(env().tree, abs(p.args[0])); } catch (e) { return "cat: " + e.message; } },
    mkdir: function (p) { if (!p.args[0]) return "usage: mkdir <dir>";
      try { V.mkdir(env().tree, abs(p.args[0]), { recursive: !!p.flags.p }); S.persist(); return ""; } catch (e) { return "mkdir: " + e.message; } },
    touch: function (p) { if (!p.args[0]) return "usage: touch <file>";
      try { V.writeFile(env().tree, abs(p.args[0]), ""); S.persist(); return ""; } catch (e) { return "touch: " + e.message; } },
    rm: function (p) { if (!p.args[0]) return "usage: rm [-r] <path>";
      try { V.rm(env().tree, abs(p.args[0]), { recursive: !!p.flags.r }); S.persist(); return ""; } catch (e) { return "rm: " + e.message; } },
    cp: function (p) { if (p.args.length < 2) return "usage: cp <src> <dst>";
      try { var c = V.readFile(env().tree, abs(p.args[0])); V.writeFile(env().tree, abs(p.args[1]), c); S.persist(); return ""; } catch (e) { return "cp: " + e.message; } },
    mv: function (p) { if (p.args.length < 2) return "usage: mv <src> <dst>";
      try { var c = V.readFile(env().tree, abs(p.args[0])); V.writeFile(env().tree, abs(p.args[1]), c); V.rm(env().tree, abs(p.args[0]), {}); S.persist(); return ""; } catch (e) { return "mv: " + e.message; } },
    echo: function (p) { return p.args.join(" "); },
    head: function (p) { try { return V.readFile(env().tree, abs(p.args[0])).split("\n").slice(0, 10).join("\n"); } catch (e) { return "head: " + e.message; } },
    tail: function (p) { try { var L = V.readFile(env().tree, abs(p.args[0])).split("\n"); return L.slice(Math.max(0, L.length - 10)).join("\n"); } catch (e) { return "tail: " + e.message; } },
    find: function (p) { var out = []; (function walk(a) { var n = V.node(env().tree, a); if (!n) return; out.push(a);
      if (n.type === "dir") Object.keys(n.children).forEach(function (k) { walk(a === "/" ? "/" + k : a + "/" + k); }); })(abs(p.args[0] || ".")); return out.join("\n"); },
    tree: function (p) { var lines = []; (function walk(a, depth) { var n = V.node(env().tree, a); if (!n || n.type !== "dir") return;
      Object.keys(n.children).sort().forEach(function (k) { lines.push(Array(depth + 1).join("  ") + k); walk(a === "/" ? "/" + k : a + "/" + k, depth + 1); }); })(abs(p.args[0] || "."), 0); return lines.join("\n") || "(empty)"; }
  });
})();
