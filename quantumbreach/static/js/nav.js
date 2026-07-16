(function () {
  var fx = document.getElementById("fx-toggle");
  if (fx) fx.addEventListener("click", function () {
    window.PhantomFX.setReducedMotion(!window.PhantomFX.isOff());
    fx.textContent = window.PhantomFX.isOff() ? "FX·off" : "FX";
  });
  var name = document.getElementById("nav-name");
  if (name) name.addEventListener("click", function () {
    var n = prompt("Choose your operative handle:", name.textContent.trim());
    if (!n) return;
    fetch("/api/rename", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n }) })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d.displayName) name.textContent = d.displayName; });
  });
})();
