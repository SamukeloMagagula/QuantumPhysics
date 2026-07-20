// quantumbreach/static/js/shell-text.js
(function () {
  var S = window.PhantomShell, V = window.PhantomVFS, C = window.PhantomCrypto; if (!S || !V) return;
  function read(path) { return V.readFile(S.env.tree, V.resolve(S.env.tree, S.env.cwd, path)); }
  S.extend({
    grep: function (p) { var pat = p.args[0], f = p.args[1]; if (!pat || !f) return "usage: grep <pattern> <file>";
      try { return read(f).split("\n").filter(function (l) { return l.indexOf(pat) >= 0; }).join("\n"); } catch (e) { return "grep: " + e.message; } },
    wc: function (p) { try { var t = read(p.args[0]); var lines = t.split("\n"); if (lines[lines.length - 1] === "") lines.pop();
      return lines.length + " " + t.split(/\s+/).filter(Boolean).length + " " + t.length + " " + p.args[0]; } catch (e) { return "wc: " + e.message; } },
    sort: function (p) { try { return read(p.args[0]).split("\n").filter(function (x) { return x.length; }).sort().join("\n"); } catch (e) { return "sort: " + e.message; } },
    uniq: function (p) { try { var out = [], prev; read(p.args[0]).split("\n").forEach(function (l) { if (l !== prev) out.push(l); prev = l; }); return out.join("\n"); } catch (e) { return "uniq: " + e.message; } },
    diff: function (p) { try { var a = read(p.args[0]).split("\n"), b = read(p.args[1]).split("\n"), out = [];
      for (var i = 0; i < Math.max(a.length, b.length); i++) { if (a[i] !== b[i]) out.push("< " + (a[i] || "") + "\n> " + (b[i] || "")); } return out.join("\n") || "(identical)"; } catch (e) { return "diff: " + e.message; } },
    strings: function (p) { try { return (read(p.args[0]).match(/[ -~]{4,}/g) || []).join("\n"); } catch (e) { return "strings: " + e.message; } },
    xxd: function (p) { try { var t = read(p.args[0]).slice(0, 256); var out = []; for (var i = 0; i < t.length; i += 16) { var chunk = t.slice(i, i + 16);
      var hex = chunk.split("").map(function (c) { return ("0" + c.charCodeAt(0).toString(16)).slice(-2); }).join(" ");
      out.push(("0000000" + i.toString(16)).slice(-7) + ": " + hex); } return out.join("\n"); } catch (e) { return "xxd: " + e.message; } },
    hexdump: function (p) { return S.registry.xxd(p); },
    md5sum: function (p) { try { return "(md5 simulated) " + read(p.args[0]).length + "  " + p.args[0]; } catch (e) { return "md5sum: " + e.message; } },
    sha256sum: function (p) { try { var name = p.args[0]; return C.sha256hex(read(name)).then(function (h) { return h + "  " + name; }); } catch (e) { return "sha256sum: " + e.message; } }
  });
})();
