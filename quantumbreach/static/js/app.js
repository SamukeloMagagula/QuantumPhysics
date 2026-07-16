(function () {
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4000);
  }

  document.querySelectorAll(".q .submit").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var q = btn.closest(".q");
      var input = q.querySelector(".answer");
      var result = q.querySelector(".result");
      var payload = {
        taskId: q.dataset.task,
        questionId: q.dataset.question,
        answer: input.value,
      };
      fetch("/rooms/" + q.dataset.room + "/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          var d = res.d;
          if (!res.ok) {
            result.className = "result no";
            result.textContent = d.error || "Error.";
            return;
          }
          if (d.correct) {
            result.className = "result ok";
            result.textContent = d.alreadySolved
              ? "Correct (already solved)."
              : "Correct! +" + d.pointsAwarded + " XP";
            var chip = document.getElementById("nav-points");
            if (chip) chip.textContent = d.rank + " · " + d.totalPoints + " XP";
            (d.newBadges || []).forEach(function (b) {
              toast("🏅 Badge unlocked: " + b.name);
            });
            if (d.roomComplete) toast("✅ Room complete!");
          } else {
            result.className = "result no";
            result.textContent = "Not quite — try again.";
          }
        })
        .catch(function () {
          result.className = "result no";
          result.textContent = "Network error.";
        });
    });
  });
})();
