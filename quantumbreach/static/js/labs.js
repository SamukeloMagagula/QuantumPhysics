(function () {
  var KEY = "phantomq.labs";
  function all() { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } }
  function save(a) { localStorage.setItem(KEY, JSON.stringify(a)); }
  function list() { return all(); }
  function get(id) { return all().filter(function (l) { return l.id === id; })[0] || null; }
  function create(lab) { var a = all(); lab.id = "lab_" + Date.now().toString(36); lab.createdAt = new Date().toISOString(); a.push(lab); save(a); return lab; }
  function remove(id) { save(all().filter(function (l) { return l.id !== id; })); }
  function norm(s) { return String(s).trim().toLowerCase(); }
  function check(id, ans) { var l = get(id); return !!l && norm(l.answer) === norm(ans); }
  function exportYaml(id) {
    var l = get(id); if (!l) return Promise.resolve("# lab not found");
    return window.PhantomCrypto.sha256hex(norm(l.answer)).then(function (h) {
      return ["id: " + l.id.replace(/[^a-z0-9-]/gi, "-"),
        "title: " + JSON.stringify(l.title),
        "summary: " + JSON.stringify(l.prompt.slice(0, 80)),
        "difficulty: Easy", "estimated_minutes: 5", "tags: [user-lab]", "prerequisites: []",
        "tasks:", "  - id: solve", "    title: " + JSON.stringify(l.title),
        "    questions:", "      - id: flag",
        "        prompt: " + JSON.stringify(l.prompt),
        "        answer_type: exact", "        answer: " + h, "        points: 10",
        l.hint ? "        hint: " + JSON.stringify(l.hint) : ""].filter(Boolean).join("\n");
    });
  }
  window.PhantomLabs = { list: list, get: get, create: create, remove: remove, check: check, exportYaml: exportYaml };
})();
