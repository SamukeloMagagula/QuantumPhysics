// quantumbreach/static/js/vfs.js
(function () {
  var KEY = "pq_vfs";
  function dir(children) { return { type: "dir", children: children || {} }; }
  function file(content) { return { type: "file", content: content || "" }; }

  function create() {
    return {
      "/": dir({
        home: dir({
          operative: dir({
            missions: dir({ "mission.txt": file("CLASSIFIED: intercept the key exchange on channel Q.\n") }),
            captures: dir({})
          })
        })
      })
    };
  }
  function parts(p) { return p.split("/").filter(function (x) { return x.length; }); }
  function resolve(tree, cwd, path) {
    if (!path) path = ".";
    if (path[0] === "~") path = "/home/operative" + path.slice(1);
    var base = path[0] === "/" ? [] : parts(cwd);
    parts(path).forEach(function (seg) {
      if (seg === ".") return;
      if (seg === "..") { base.pop(); return; }
      base.push(seg);
    });
    return "/" + base.join("/");
  }
  function node(tree, abs) {
    var cur = tree["/"], segs = parts(abs);
    for (var i = 0; i < segs.length; i++) {
      if (!cur || cur.type !== "dir" || !cur.children[segs[i]]) return null;
      cur = cur.children[segs[i]];
    }
    return cur;
  }
  function parent(tree, abs) {
    var segs = parts(abs); var name = segs.pop();
    return { dir: node(tree, "/" + segs.join("/")), name: name };
  }
  function mkdir(tree, abs, opts) {
    var segs = parts(abs), cur = tree["/"];
    for (var i = 0; i < segs.length; i++) {
      if (!cur.children[segs[i]]) {
        if (!(opts && opts.recursive) && i < segs.length - 1) throw new Error("no such directory");
        cur.children[segs[i]] = dir();
      }
      cur = cur.children[segs[i]];
      if (cur.type !== "dir") throw new Error("not a directory");
    }
    return true;
  }
  function writeFile(tree, abs, content) {
    var pr = parent(tree, abs);
    if (!pr.dir || pr.dir.type !== "dir") throw new Error("no such directory");
    pr.dir.children[pr.name] = file(content);
    return true;
  }
  function readFile(tree, abs) {
    var n = node(tree, abs);
    if (!n) throw new Error("no such file");
    if (n.type !== "file") throw new Error("is a directory");
    return n.content;
  }
  function rm(tree, abs, opts) {
    var pr = parent(tree, abs), n = pr.dir && pr.dir.children[pr.name];
    if (!n) throw new Error("no such file or directory");
    if (n.type === "dir" && Object.keys(n.children).length && !(opts && opts.recursive)) throw new Error("directory not empty");
    delete pr.dir.children[pr.name];
    return true;
  }
  function list(tree, abs) {
    var n = node(tree, abs);
    if (!n) throw new Error("no such file or directory");
    if (n.type === "file") return [abs.split("/").pop()];
    return Object.keys(n.children).sort();
  }
  function load() { try { var s = localStorage.getItem(KEY); return s ? JSON.parse(s) : create(); } catch (e) { return create(); } }
  function save(tree) { try { localStorage.setItem(KEY, JSON.stringify(tree)); } catch (e) {} }

  window.PhantomVFS = { create: create, resolve: resolve, node: node, mkdir: mkdir,
    writeFile: writeFile, readFile: readFile, rm: rm, list: list, load: load, save: save };
})();
