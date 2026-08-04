# QKD Multiplayer "Among Us" Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide role↔identity in multiplayer QKD, give Eve three named risk/reward interception methods, and add a post-round-3 accusation vote that decides the winner — per `docs/superpowers/specs/2026-07-30-qkd-among-us-design.md`.

**Architecture:** All changes live in `quantumbreach/qkd/engine.py` (one pure classifier function), `quantumbreach/qkd/service.py` (anonymity projection, method dispatch, new `accusation` phase), and `quantumbreach/static/js/qkd-multi.js` (codename rendering, method picker, accusation/reveal UI). No new DB schema — everything new lives inside the existing `qkd_games.config` JSON blob. Solo mode, the BB84 engine's core `resolve_round` math, file store, and botnet crack-odds are untouched.

**Tech Stack:** Flask + SQLite (existing `quantumbreach/qkd/*`), vanilla ES5 JS (existing `static/js/qkd-multi.js`, `qkd-stage.js`), pytest (`tests/test_qkd_engine.py`, `tests/test_qkd_multiplayer.py`), Playwright browser tests (`tests/test_ui_qkd_multi.py`, `tests/browser_utils.py`).

## Global Constraints

- No new DB tables/columns; new state lives in `cfg` (the JSON `qkd_games.config` column). — per spec §"Data Model Changes"
- Solo mode (`quantumbreach/static/js/qkd.js`, the non-multiplayer `/qkd` flow) is not touched by this plan.
- The BB84 physics in `engine.resolve_round` (photon draw order, sifting, QBER, `finalKey`, `stolen`, `eveHit`) is unchanged — all three Eve methods must resolve through it exactly as today, only varying its `eveTaps`/`p` inputs.
- Win condition is vote accuracy alone: crew wins iff **both** Alice's and Bob's accusations name the true Eve seat. No heist-outcome tiebreak.
- Anonymity: a seat only ever sees its own true `role`/`kind`/`name`; every other seat is shown only as a `codename` + `submitted` flag, until `phase == "ended"`.
- Round-by-round scores are not shown mid-game; a `roundsCompleted`/`roundsTotal` counter replaces them until `ended`.
- `_clean_action`/`_clean_accusation` never raise on a malformed-but-well-typed payload from a legitimate phase — bad shapes are coerced to a safe default (existing "round never bricks" contract), consistent with today's `_clean_action`.

---

## File Structure

- `quantumbreach/qkd/engine.py` — **modify**: add `classify_error_shape(n, sample_indices, sample_errors)`; rewrite `computer_strategy`'s `"eve"` branch to emit the new `{"method": "computer_random", ...}` shape.
- `quantumbreach/qkd/service.py` — **modify**: codename pool + `create_game` anonymity assignment; `game_state` seat/scores/history/accusation/reveal projection; `_clean_action` eve-method rewrite; new `_clean_accusation`; `submit_action` accusation branch; `advance()` eve_move method dispatch + errorShape/history bookkeeping; `_next_round` → `_start_accusation`; new `_advance_accusation`/`_resolve_accusation` replacing `_end_game`; `_is_up`/`_maybe_timeout` accusation cases.
- `quantumbreach/static/js/qkd-multi.js` — **modify**: codename-aware seat/score rendering; Eve method picker (tap/spoof/bruteforce) replacing the always-on tap+workers panel; accusation screen; reveal/results screen.
- `tests/test_qkd_engine.py` — **modify**: add `classify_error_shape` unit tests.
- `tests/test_qkd_multiplayer.py` — **modify**: fix tests broken by the anonymity/method/accusation contract changes; add new tests for anonymity, spoof expansion, bruteforce zero-interception, evidence visibility, and the full accusation arc.
- `tests/test_ui_qkd_multi.py` — **modify**: fix the two browser tests that assumed the old always-visible tap+workers panel; add a browser test that drives a full 3-round game through to the reveal screen.
- `docs/QKD_MULTIPLAYER.md` — **modify**: document the new anonymity model, Eve's three methods, and the accusation phase.

---

### Task 1: Engine — `classify_error_shape` + computer Eve's new action shape

**Files:**
- Modify: `quantumbreach/qkd/engine.py`
- Test: `tests/test_qkd_engine.py`

**Interfaces:**
- Produces: `engine.classify_error_shape(n: int, sample_indices: list[int], sample_errors: list[bool]) -> str` (`"none" | "clustered" | "scattered"`) — consumed by `service._resolve_scoring`/`advance()` in Task 4.
- Produces: `engine.computer_strategy("eve", public, rng)` now returns `{"method": "computer_random", "p": float, "workers": 0}` instead of `{"p": float}` — consumed by `service.advance()`'s eve_move dispatch in Task 4.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_qkd_engine.py (append)

def test_classify_error_shape_none_when_no_errors():
    assert engine.classify_error_shape(24, [3, 9, 15], [False, False, False]) == "none"


def test_classify_error_shape_clustered_when_errors_bunch():
    # errors at 10,11,12 out of n=24: span=2, n//3=8, span <= 8 -> clustered
    assert engine.classify_error_shape(24, [2, 10, 11, 12, 20], [False, True, True, True, False]) == "clustered"


def test_classify_error_shape_scattered_when_errors_spread_out():
    # errors at 0 and 23 out of n=24: span=23, n//3=8, span > 8 -> scattered
    assert engine.classify_error_shape(24, [0, 12, 23], [True, False, True]) == "scattered"


def test_classify_error_shape_single_error_is_clustered():
    assert engine.classify_error_shape(24, [12], [True]) == "clustered"


def test_computer_strategy_eve_emits_method_shape():
    out = engine.computer_strategy("eve", {}, lambda: 0.0)   # r=0.0 -> p=0.0 branch
    assert out == {"method": "computer_random", "p": 0.0, "workers": 0}
    out2 = engine.computer_strategy("eve", {}, lambda: 0.99)  # r=0.99 -> p=1.0 branch
    assert out2 == {"method": "computer_random", "p": 1.0, "workers": 0}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_qkd_engine.py -k "classify_error_shape or computer_strategy_eve" -v`
Expected: FAIL — `classify_error_shape` doesn't exist; `computer_strategy("eve", ...)` still returns `{"p": ...}`.

- [ ] **Step 3: Implement**

In `quantumbreach/qkd/engine.py`, add after `resolve_round`:

```python
def classify_error_shape(n, sample_indices, sample_errors):
    """Classify a round's sampled-error positions as a detection signature.

    'clustered' (errors bunch inside roughly a third of the stream) is the
    'spoof' signature (Eve guessed one basis across a contiguous window);
    'scattered' is the 'tap'/random-intercept signature; 'none' is no
    sampled error at all. Threshold (n // 3) is a tunable heuristic, not a
    physics constant.
    """
    errs = [sample_indices[k] for k, bad in enumerate(sample_errors) if bad]
    if not errs:
        return "none"
    if len(errs) == 1:
        return "clustered"
    span = max(errs) - min(errs)
    return "clustered" if span <= max(1, n // 3) else "scattered"
```

Replace the `"eve"` branch of `computer_strategy`:

```python
    if role == "eve":
        r = rng()
        p = 0.0 if r < 0.35 else 0.25 if r < 0.6 else 0.5 if r < 0.85 else 1.0
        return {"method": "computer_random", "p": p, "workers": 0}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_qkd_engine.py -v`
Expected: PASS (all, including the pre-existing `test_scoring_and_strategy` — check it does not assert the old `{"p": ...}` shape; if it does, update that one assertion to the new shape in the same commit).

- [ ] **Step 5: Commit**

```bash
git add quantumbreach/qkd/engine.py tests/test_qkd_engine.py
git commit -m "feat(qkd-engine): classify_error_shape + computer Eve emits method-shaped action"
```

---

### Task 2: Anonymity — codenames assigned at game creation, hidden from other seats

**Files:**
- Modify: `quantumbreach/qkd/service.py`
- Test: `tests/test_qkd_multiplayer.py`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `cfg["anon"] = {"alice": codename, "bob": codename, "eve": codename}`, set once at `create_game`. `game_state(...)`'s `seats` list entries are now **either** `{"role", "kind", "name", "submitted"}` (your own seat, or any seat once `phase == "ended"`) **or** `{"codename", "submitted"}` (another seat, pre-reveal) — consumed by `qkd-multi.js` in Task 3 and by the accusation UI in Task 7. `game_state` gains `view["roundsTotal"] = ROUNDS` (always present) and, pre-`"ended"`, `view["roundsCompleted"] = len(cfg.get("history", []))` in place of `view["scores"]` (scores only appear at `"ended"`).

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_qkd_multiplayer.py — replace test_create_join_start_and_lobby_state with:

def test_create_join_start_and_lobby_state(app):
    host = _guest(app)
    r = host.post("/api/qkd/game", json={"role": "alice"})
    assert r.status_code == 200
    code = r.get_json()["code"]
    assert r.get_json()["role"] == "alice"

    bob = _guest(app)
    assert bob.post(f"/api/qkd/game/{code}/join", json={"role": "bob"}).get_json()["role"] == "bob"
    # taking a claimed role fails
    assert bob.post(f"/api/qkd/game/{code}/join", json={"role": "alice"}).status_code == 409
    # unknown game
    assert bob.post("/api/qkd/game/ZZZZ/join", json={"role": "eve"}).status_code == 404

    state = host.get(f"/api/qkd/game/{code}").get_json()
    assert state["phase"] == "lobby"
    assert state["yourRole"] == "alice"
    own = next(s for s in state["seats"] if s.get("role") == "alice")
    assert own["kind"] == "human" and own["name"]
    others = [s for s in state["seats"] if s.get("role") is None]
    assert len(others) == 2
    for s in others:
        assert set(s.keys()) == {"codename", "submitted"}   # no role/kind/name leak
    assert len({s["codename"] for s in others}) == 2         # distinct codenames

    host.post(f"/api/qkd/game/{code}/start")
    assert host.get(f"/api/qkd/game/{code}").get_json()["phase"] == "alice_setup"


def test_anonymity_holds_from_bobs_view_too(app):
    host = _guest(app)
    code = host.post("/api/qkd/game", json={"role": "alice"}).get_json()["code"]
    bob = _guest(app)
    bob.post(f"/api/qkd/game/{code}/join", json={"role": "bob"})
    host.post(f"/api/qkd/game/{code}/start")
    st = bob.get(f"/api/qkd/game/{code}").get_json()
    own = next(s for s in st["seats"] if s.get("role") == "bob")
    assert own["name"]
    others = [s for s in st["seats"] if s.get("role") is None]
    assert len(others) == 2 and all(set(s.keys()) == {"codename", "submitted"} for s in others)


def test_mid_game_view_hides_scores_shows_rounds_progress(app):
    c, code = _solo_game(app, "bob")
    st = c.get(f"/api/qkd/game/{code}").get_json()
    assert "scores" not in st
    assert st["roundsTotal"] == service.ROUNDS
    assert st["roundsCompleted"] == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_qkd_multiplayer.py -k "lobby_state or anonymity_holds or mid_game_view" -v`
Expected: FAIL — today's `seats` entries all carry `role`/`kind`/`name`; `scores` is always present; no `roundsTotal`/`roundsCompleted`/`cfg["anon"]`.

- [ ] **Step 3: Implement**

In `quantumbreach/qkd/service.py`, add the codename pool near the top (after `ROLES`):

```python
ROLES = ("alice", "bob", "eve")
_CODENAMES = ("Node-Cyan", "Node-Amber", "Node-Violet", "Node-Coral", "Node-Slate", "Node-Gold")
```

Change `create_game` to assign codenames at creation and store them as the game's initial config:

```python
def create_game(db, user, role):
    if role not in ROLES:
        raise GameError("bad role")
    code = _new_code(db)
    anon = dict(zip(ROLES, random.sample(_CODENAMES, len(ROLES))))
    cur = db.execute(
        "INSERT INTO qkd_games (code, phase, round, config) VALUES (?, 'lobby', 0, ?)",
        (code, json.dumps({"anon": anon})))
    gid = cur.lastrowid
    for r in ROLES:
        if r == role:
            db.execute("INSERT INTO qkd_game_seats (game_id, role, kind, user_id, display_name) VALUES (?,?, 'human', ?, ?)",
                       (gid, r, user["id"], user["display_name"]))
        else:
            db.execute("INSERT INTO qkd_game_seats (game_id, role, kind, display_name) VALUES (?,?, 'computer', 'Computer')", (gid, r))
    db.commit()
    return {"code": code, "role": role}
```

Rewrite `game_state`'s `seats`/`scores` construction (replace the `view = {...}` block's `"seats"` and `"scores"` entries, and everything after, with):

```python
def game_state(db, code, user):
    g = _game(db, code)
    _maybe_timeout(db, g)
    g = _game(db, code)
    seats = _seats(db, g["id"])
    your = _seat_for_user(db, g["id"], user["id"]) if user else None
    your_role = your["role"] if your else None
    cfg = json.loads(g["config"] or "{}")
    anon = cfg.get("anon") or {}
    reveal_all = g["phase"] == "ended"
    seat_views = []
    for s in seats:
        if s["role"] == your_role or reveal_all:
            seat_views.append({"role": s["role"], "kind": s["kind"], "name": s["display_name"],
                                "submitted": s["action"] is not None})
        else:
            seat_views.append({"codename": anon.get(s["role"], s["role"]), "submitted": s["action"] is not None})
    view = {
        "code": g["code"], "phase": g["phase"], "round": g["round"],
        "yourRole": your_role,
        "seats": seat_views,
        "roundsTotal": ROUNDS,
        "youAreUpNow": _is_up(g["phase"], your_role, seats),
    }
    if reveal_all:
        view["scores"] = [{"role": s["role"], "name": s["display_name"], "score": s["score"]} for s in seats]
    else:
        view["roundsCompleted"] = len(cfg.get("history", []))
    # Alice and Bob both see the round's evidence during Bob's decision (Eve never does).
    if g["phase"] == "bob_decision" and your_role in ("alice", "bob") and "result" in cfg:
        view["sampleQBER"] = cfg["result"]["sampleQBER"]
        view["errorShape"] = cfg["result"].get("errorShape")
    if your_role in ("alice", "bob") or reveal_all:
        view["history"] = cfg.get("history", [])
    # Full reveal only at resolve/ended; file visibility is computed per seat.
    if g["phase"] in ("resolve", "ended") and "lastResult" in cfg:
        lr = dict(cfg["lastResult"])                 # shallow copy; never mutate stored cfg
        f = dict(lr.get("file") or {})
        cracked = bool(f.get("cracked"))
        visible = (
            your_role == "alice"
            or (your_role == "bob" and lr.get("bobDecision") == "keep" and not lr.get("eveHit"))
            or (your_role == "eve" and cracked)
        )
        lr["file"] = {
            "visible": visible,
            "cracked": cracked,
            "sample": f.get("sample") if visible else None,
            "mime": f.get("mime") if visible else None,
            "isUpload": bool(f.get("isUpload")) if visible else False,
        }
        if "aliceConfig" in lr:
            ac = dict(lr["aliceConfig"])
            ac.pop("file", None)
            ac.pop("fileMime", None)
            lr["aliceConfig"] = ac
        view["lastResult"] = lr
    if reveal_all:
        if "accusationResult" in cfg:
            view["accusationResult"] = cfg["accusationResult"]
        if "reveal" in cfg:
            view["reveal"] = cfg["reveal"]
    return view
```

(Note: `view["history"]` and `errorShape`/round bookkeeping are populated starting Task 4 — `cfg.get("history", [])` safely returns `[]` until then, and `cfg["result"].get("errorShape")` safely returns `None` until then, so this task's tests pass on their own.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_qkd_multiplayer.py -v`
Expected: PASS for the 3 new/updated tests. Some other existing tests may now fail because they read `state["seats"]`/`scores` by role for seats that aren't the caller's own — that's expected and fixed in Tasks 4/6 (each fixes the specific tests its own contract change breaks). Confirm the only new failures are: `test_bob_qber_hidden_from_eve` (should still pass — verify), and none among the ones this task didn't touch report an *unexpected* new failure unrelated to seats/scores/anon. If any other test unexpectedly breaks here, it's this task's regression — fix it now, don't defer.

- [ ] **Step 5: Commit**

```bash
git add quantumbreach/qkd/service.py tests/test_qkd_multiplayer.py
git commit -m "feat(qkd-mp): assign per-game codenames at creation; hide role/kind/name of other seats until reveal"
```

---

### Task 3: Anonymity — client renders codenames, not roles

**Files:**
- Modify: `quantumbreach/static/js/qkd-multi.js`
- Test: `tests/test_ui_qkd_multi.py`

**Interfaces:**
- Consumes: `st.seats[i]` is `{role,kind,name,submitted}` or `{codename,submitted}` (Task 2); `st.roundsTotal`/`st.roundsCompleted` (Task 2); `st.scores` present only at `"ended"` (Task 2).
- Produces: no new interfaces for later tasks — this is leaf UI rendering.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_ui_qkd_multi.py (append)

@requires_browser
def test_mp_lobby_shows_codenames_not_roles_for_other_seats():
    with live_server() as base, two_player_pages() as (alice, bob):
        alice.goto(base + "/qkd", wait_until="networkidle")
        alice.click("#mode-multi")
        alice.click('[data-create="alice"]')
        alice.wait_for_function("() => (document.getElementById('qm-mycode').textContent || '').length === 4", timeout=8000)
        code = alice.inner_text("#qm-mycode").strip()

        bob.goto(base + "/qkd", wait_until="networkidle")
        bob.click("#mode-multi")
        bob.fill("#qm-code", code)
        bob.click('[data-join="bob"]')
        bob.wait_for_timeout(500)

        seats_text = alice.inner_text("#qm-seats")
        assert "bob:" not in seats_text.lower() and "eve:" not in seats_text.lower()
        assert "Node-" in seats_text   # the other two seats show codenames
        assert "alice:" in seats_text.lower()   # Alice's own seat still shows her real role
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ui_qkd_multi.py -k codenames_not_roles -v`
Expected: FAIL — today's render shows `"bob: Computer"`/`"eve: Computer"` chips.

- [ ] **Step 3: Implement**

In `quantumbreach/static/js/qkd-multi.js`, replace the `render` function's seat/score lines:

```javascript
  function render(st) {
    if (!st || st.error) return;
    $("qm-seats").innerHTML = st.seats.map(function (s) {
      var mine = s.role === st.yourRole;
      var label = s.role ? (s.role + ": " + s.name) : s.codename;
      return '<span class="chip' + (mine ? ' on' : '') + '">' + label + (s.submitted ? " ✓" : "") + "</span>";
    }).join("");
    $("qm-start").hidden = !(st.phase === "lobby" && $("qm-start").hidden === false);
    if (st.scores) {
      $("qm-scores").innerHTML = st.scores.map(function (s) { return '<span class="chip">' + s.role + ": " + s.score + "</span>"; }).join("");
    } else {
      $("qm-scores").innerHTML = '<span class="chip">Round ' + (st.roundsCompleted || 0) + " of " + (st.roundsTotal || 3) + "</span>";
    }
    if (stage && st.phase === "bob_decision" && typeof st.sampleQBER === "number") {
      stage.setIntrusion(st.sampleQBER, 0.11);  // Bob (and Alice) see the intrusion on the shared stage meter
    }
    if (stage && st.phase !== lastPhase) {
      if (st.phase === "eve_move") stage.log("Alice staked her key.", "info");
      if (st.phase === "resolve" && st.lastResult) stage.log("Bob " + st.lastResult.bobDecision.toUpperCase() + "S the key.", "bob");
    }
    lastPhase = st.phase;
    renderControls(st); renderStatus(st);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_ui_qkd_multi.py -k codenames_not_roles -v`
Expected: PASS.

- [ ] **Step 5: Run the full existing MP browser suite for regressions**

Run: `python -m pytest tests/test_ui_qkd_multi.py -v`
Expected: PASS for tests not touched by later tasks (`test_mp_alice_has_sample_picker`, `test_mp_reveal_renders_a_file_pane`, `test_mp_alice_can_upload_a_file`, `test_mp_upload_preview_shows_immediately`, `test_two_players_play_a_multiplayer_round`). `test_mp_eve_has_botnet_panel`, `test_mp_eve_taps_and_replay_render`, and `test_mp_round_narrates_into_the_feed_sidebar` are expected to still pass here (Task 3 doesn't touch the Eve panel) — confirm before moving on; if the Eve-panel tests already broke at this step, something in Task 3's diff leaked into the controls renderer and must be fixed now.

- [ ] **Step 6: Commit**

```bash
git add quantumbreach/static/js/qkd-multi.js tests/test_ui_qkd_multi.py
git commit -m "feat(qkd-mp): render codenames for other seats; replace mid-game scores with a rounds-progress chip"
```

---

### Task 4: Eve's three methods (server) — tap / spoof / bruteforce dispatch + evidence

**Files:**
- Modify: `quantumbreach/qkd/service.py`
- Test: `tests/test_qkd_multiplayer.py`

**Interfaces:**
- Consumes: `engine.classify_error_shape` (Task 1), `engine.computer_strategy("eve", ...)` returning `{"method": "computer_random", ...}` (Task 1).
- Produces: `cfg["eve"]` is now `{"method": "tap", "taps": [...], "workers": int}` | `{"method": "spoof", "start": int, "len": int, "basis": "+"|"x", "workers": int}` | `{"method": "bruteforce", "workers": int}` | `{"method": "computer_random", "p": float, "workers": int}`. `cfg["result"]["errorShape"]` and `cfg["lastResult"]["errorShape"]` (`"none"|"clustered"|"scattered"`). `cfg["history"]`: a list, one entry appended per resolved round, each `{"round": int, "sampleQBER": float, "errorShape": str, "eveHit": bool, "method": str}` — consumed by the reveal screen in Task 7 and already read by Task 2's `roundsCompleted`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_qkd_multiplayer.py

# -- fix the one existing test whose action shape is now stale --
def test_mp_eve_taps_drive_resolution(app):
    # Human Eve submits an explicit tap-method action; verify it lands in cfg and resolves with it.
    c, code = _solo_game(app, "eve")   # computer Alice auto-plays -> eve_move (human Eve)
    with app.app_context():
        db = get_db()
        g = service._game(db, code)
        cfg = json.loads(g["config"] or "{}")
        cfg["alice"] = {"n": 6, "s": 0, "file": "mission"}
        service._set_config(db, g["id"], cfg)
        db.commit()
    taps = [{"i": i, "basis": "x"} for i in range(6)] + [{"i": 999, "basis": "z"}, {"bad": 1}]
    c.post(f"/api/qkd/game/{code}/act", json={"action": {"method": "tap", "taps": taps, "workers": 0}})
    cfg = _raw_cfg(app, code)
    assert cfg["eve"]["method"] == "tap"
    assert isinstance(cfg["eve"]["taps"], list)
    assert all(t["basis"] in ("+", "x") for t in cfg["eve"]["taps"])   # junk dropped
    assert cfg["lastResult"]["eveHit"] is True                        # taps caused interception


# -- new tests for the method dispatch --

def test_missing_method_defaults_to_bruteforce_zero_interception(app):
    c, code = _solo_game(app, "eve")
    with app.app_context():
        db = get_db()
        g = service._game(db, code)
        cfg = json.loads(g["config"] or "{}")
        cfg["alice"] = {"n": 8, "s": 4, "file": "mission"}
        service._set_config(db, g["id"], cfg)
        db.commit()
    # No "method" key at all -- an old-shaped/malformed payload.
    c.post(f"/api/qkd/game/{code}/act", json={"action": {"taps": [{"i": 0, "basis": "x"}], "workers": 0}})
    cfg = _raw_cfg(app, code)
    assert cfg["eve"]["method"] == "bruteforce"
    assert cfg["lastResult"]["eveHit"] is False      # bruteforce never touches qubits
    assert cfg["lastResult"]["sampleQBER"] == 0.0
    assert cfg["lastResult"]["errorShape"] == "none"


def test_spoof_window_expands_to_contiguous_single_basis_taps(app):
    c, code = _solo_game(app, "eve")
    with app.app_context():
        db = get_db()
        g = service._game(db, code)
        cfg = json.loads(g["config"] or "{}")
        cfg["alice"] = {"n": 10, "s": 8, "file": "mission"}
        service._set_config(db, g["id"], cfg)
        db.commit()
    c.post(f"/api/qkd/game/{code}/act", json={"action": {"method": "spoof", "start": 2, "len": 4, "basis": "x", "workers": 0}})
    cfg = _raw_cfg(app, code)
    assert cfg["eve"]["method"] == "spoof"
    assert cfg["eve"]["start"] == 2 and cfg["eve"]["len"] == 4 and cfg["eve"]["basis"] == "x"
    assert cfg["lastResult"]["eveHit"] is True   # a spoofed window always intercepts every qubit in it


def test_spoof_window_clamped_to_n(app):
    c, code = _solo_game(app, "eve")
    with app.app_context():
        db = get_db()
        g = service._game(db, code)
        cfg = json.loads(g["config"] or "{}")
        cfg["alice"] = {"n": 8, "s": 0, "file": "mission"}
        service._set_config(db, g["id"], cfg)
        db.commit()
    # start+len wildly out of range must not crash -- clamped into [0, n)
    r = c.post(f"/api/qkd/game/{code}/act", json={"action": {"method": "spoof", "start": 999, "len": 999, "basis": "+", "workers": 0}})
    assert r.status_code == 200
    cfg = _raw_cfg(app, code)
    assert cfg["eve"]["start"] + cfg["eve"]["len"] <= 8
    assert r.get_json()["phase"] in ("bob_decision", "resolve", "ended")   # advanced, not bricked


def test_bruteforce_method_zero_qber_and_none_errorshape(app):
    c, code = _solo_game(app, "eve")
    with app.app_context():
        db = get_db()
        g = service._game(db, code)
        cfg = json.loads(g["config"] or "{}")
        cfg["alice"] = {"n": 8, "s": 4, "file": "mission"}
        service._set_config(db, g["id"], cfg)
        db.commit()
    c.post(f"/api/qkd/game/{code}/act", json={"action": {"method": "bruteforce", "workers": 50}})
    cfg = _raw_cfg(app, code)
    assert cfg["eve"]["method"] == "bruteforce" and cfg["eve"]["workers"] == 50
    assert cfg["lastResult"]["eveHit"] is False
    assert cfg["lastResult"]["errorShape"] == "none"


def test_alice_sees_evidence_during_bob_decision_not_just_bob(app):
    # Human Alice + human Bob; computer Eve. After Alice submits, computer Eve auto-plays
    # (method="computer_random"), landing on bob_decision -- Alice's own view must now
    # also carry sampleQBER/errorShape, not just Bob's.
    host = _guest(app)
    code = host.post("/api/qkd/game", json={"role": "alice"}).get_json()["code"]
    bob = _guest(app)
    bob.post(f"/api/qkd/game/{code}/join", json={"role": "bob"})
    host.post(f"/api/qkd/game/{code}/start")
    host.post(f"/api/qkd/game/{code}/act", json={"action": {"n": 16, "s": 8, "file": "mission"}})
    st = host.get(f"/api/qkd/game/{code}").get_json()
    assert st["phase"] == "bob_decision"
    assert "sampleQBER" in st and "errorShape" in st


def test_history_records_one_entry_per_round(app):
    c, code = _solo_game(app, "bob")
    c.post(f"/api/qkd/game/{code}/act", json={"action": {"decision": "abort"}})
    st = c.get(f"/api/qkd/game/{code}").get_json()
    assert len(st["history"]) == 1
    entry = st["history"][0]
    assert set(entry.keys()) == {"round", "sampleQBER", "errorShape", "eveHit", "method"}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_qkd_multiplayer.py -k "eve_taps_drive_resolution or defaults_to_bruteforce or spoof_window or bruteforce_method or alice_sees_evidence or history_records" -v`
Expected: FAIL — `_clean_action`'s eve branch still uses `{p, taps, workers}`; `advance()`'s `eve_move` still builds `resolve_cfg` from `p`/`eveTaps` directly; no `errorShape`/`history` anywhere; `game_state` doesn't gate `sampleQBER` to Alice.

- [ ] **Step 3: Implement**

In `quantumbreach/qkd/service.py`, replace the `role == "eve"` branch of `_clean_action`:

```python
        if role == "eve":
            method = action.get("method")
            if method not in ("tap", "spoof", "bruteforce"):
                method = "bruteforce"
            out = {"method": method, "workers": max(0, min(100, int(action.get("workers", 0) or 0)))}
            if method == "tap":
                raw = action.get("taps")
                taps = []
                if isinstance(raw, list):
                    seen = set()
                    for t in raw[:512]:
                        if not isinstance(t, dict):
                            continue
                        b = t.get("basis")
                        try:
                            idx = int(t.get("i"))
                        except (TypeError, ValueError):
                            continue
                        if b in ("+", "x") and 0 <= idx < 512 and idx not in seen:
                            seen.add(idx); taps.append({"i": idx, "basis": b})
                        if len(taps) >= 128:
                            break
                out["taps"] = taps
            elif method == "spoof":
                try:
                    start = max(0, int(action.get("start", 0)))
                except (TypeError, ValueError):
                    start = 0
                try:
                    length = max(1, min(512, int(action.get("len", 1))))
                except (TypeError, ValueError):
                    length = 1
                basis = action.get("basis")
                out["start"] = start
                out["len"] = length
                out["basis"] = basis if basis in ("+", "x") else "+"
            return out
```

Replace `advance()`'s `eve_move` branch:

```python
        elif phase == "eve_move":
            n = cfg["alice"]["n"]
            method = act.get("method") or "bruteforce"
            workers = int(act.get("workers", 0) or 0)
            eve_cfg = {"method": method, "workers": workers}
            resolve_cfg = {"n": n, "s": cfg["alice"]["s"]}
            if method == "computer_random":
                p = float(act.get("p", 0) or 0)
                eve_cfg["p"] = p
                resolve_cfg["p"] = p
            elif method == "tap":
                taps = act.get("taps") or []
                eve_cfg["taps"] = taps
                resolve_cfg["p"] = 0.0
                resolve_cfg["eveTaps"] = taps
            elif method == "spoof":
                start = max(0, min(n - 1, int(act.get("start", 0))))
                length = max(1, min(n - start, int(act.get("len", 1))))
                basis = act.get("basis") if act.get("basis") in ("+", "x") else "+"
                eve_cfg.update({"start": start, "len": length, "basis": basis})
                resolve_cfg["p"] = 0.0
                resolve_cfg["eveTaps"] = [{"i": i, "basis": basis} for i in range(start, start + length)]
            else:  # bruteforce: zero qubit interception, only the botnet crack matters
                resolve_cfg["p"] = 0.0
            cfg["eve"] = eve_cfg
            result = resolve_round(resolve_cfg, random.random)
            result["errorShape"] = classify_error_shape(result["n"], result["sampleIndices"], result["sampleErrors"])
            cfg["result"] = result
            cur = db.execute(
                "UPDATE qkd_games SET config=?, phase='bob_decision', updated_at=CURRENT_TIMESTAMP "
                "WHERE id=? AND phase='eve_move'", (json.dumps(cfg), gid))
            db.commit()
            if cur.rowcount == 0:
                continue  # lost the race; our locally-computed result is discarded
```

Add the import at the top of `service.py`:

```python
from .engine import resolve_round, score_round, computer_strategy, classify_error_shape
```

In `_resolve_scoring`, add `errorShape` to `lastResult` and append to `cfg["history"]` (insert right after the `cfg["lastResult"] = {...}` block, before `_set_config`):

```python
    cfg["lastResult"] = {
        "eveHit": result["eveHit"], "sampleQBER": result["sampleQBER"], "finalKey": result["finalKey"],
        "stolen": result["stolen"], "sifted": result["sifted"], "bobDecision": decision,
        "aliceConfig": cfg["alice"], "eveConfig": cfg["eve"], "perRole": per_role, "round": g["round"],
        "errorShape": result.get("errorShape", "none"),
        "file": {"sample": _sample, "mime": _mime, "cracked": file_cracked, "isUpload": _is_upload},
        "replay": {
            "n": result.get("n"),
            "aBases": result.get("aBases", []),
            "bBases": result.get("bBases", []),
            "eveTaps": (cfg.get("eve") or {}).get("taps", []),
            "sampleIndices": result.get("sampleIndices", []),
            "sampleErrors": result.get("sampleErrors", []),
        },
    }
    cfg.setdefault("history", []).append({
        "round": g["round"], "sampleQBER": result["sampleQBER"], "errorShape": result.get("errorShape", "none"),
        "eveHit": result["eveHit"], "method": (cfg.get("eve") or {}).get("method", "bruteforce"),
    })
    _set_config(db, gid, cfg)
    db.commit()
```

(Note: the `replay.eveTaps` field previously read `cfg["eve"]["eveTaps"]`, which no longer exists — it now reads `cfg["eve"].get("taps", [])`, which is `[]` for `spoof`/`bruteforce`/`computer_random`. This is an acceptable narrowing: the replay animation for `tap` rounds is unchanged; `spoof`/`bruteforce` rounds simply animate no per-qubit tap flashes, which is correct — a spoof window isn't a discrete tap list. Extending the replay to show the spoof window is deferred to Task 7 if time allows, not required by this task.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_qkd_multiplayer.py -v`
Expected: PASS for every test in the file except the two `_next_round`-ends-the-game tests (`test_double_next_at_final_round_writes_score_once`) and any test still asserting the pre-Task-6 accusation contract — those are fixed in Task 6. Confirm no *other* unexpected failures; if `test_mp_eve_botnet_cracks_short_key_and_scores` or similar botnet tests fail, check they still pass `eve_p=1`/`eve_workers` through the `_play_full_round_human_bob` helper unchanged (that helper bypasses `_clean_action`/`advance()` entirely by writing `cfg` directly, so it should be unaffected — if it fails, the regression is in `_resolve_scoring`, not the helper).

- [ ] **Step 5: Commit**

```bash
git add quantumbreach/qkd/service.py tests/test_qkd_multiplayer.py
git commit -m "feat(qkd-mp): Eve picks tap/spoof/bruteforce per round; errorShape + history evidence for Alice+Bob"
```

---

### Task 5: Eve's three methods (client) — method picker UI

**Files:**
- Modify: `quantumbreach/static/js/qkd-multi.js`
- Test: `tests/test_ui_qkd_multi.py`

**Interfaces:**
- Consumes: server now expects `{method, taps?, start?, len?, basis?, workers}` from `POST /api/qkd/game/<code>/act` during `eve_move` (Task 4).
- Produces: no new interfaces for later tasks.

- [ ] **Step 1: Update the two browser tests that assumed the old always-visible tap+workers panel**

```python
# tests/test_ui_qkd_multi.py — replace test_mp_eve_has_botnet_panel with:

@requires_browser
def test_mp_eve_bruteforce_method_shows_botnet_panel():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-multi")
        pg.click("[data-create='eve']")               # create as Eve; computer Alice auto-plays
        pg.wait_for_selector("#qm-start", timeout=8000)
        pg.click("#qm-start")                         # host starts -> computer Alice -> eve_move
        pg.wait_for_selector("[data-method='bruteforce']", timeout=8000)
        pg.click("[data-method='bruteforce']")
        pg.wait_for_selector("#qm-w", timeout=4000)   # botnet slider present for the bruteforce method
        pg.eval_on_selector("#qm-w", "el => { el.value = 40; el.dispatchEvent(new Event('input')); }")
        pg.wait_for_timeout(150)
        tiles = pg.evaluate("() => document.querySelectorAll('#qm-grid .worker').length")
        assert tiles == 40
        pg.click("#qm-eve-go")
        pg.wait_for_timeout(400)


# replace test_mp_eve_taps_and_replay_render with:

@requires_browser
def test_mp_eve_tap_method_taps_and_replay_render():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-multi")
        pg.click("[data-create='eve']")
        pg.wait_for_selector("#qm-start", timeout=8000); pg.click("#qm-start")
        pg.wait_for_selector("[data-method='tap']", timeout=8000)   # tap is the default-selected method
        pg.wait_for_selector("#qm-stage .stage-qubits .qubit", timeout=8000)
        pg.click("#qm-stage .stage-qubits .qubit:nth-child(1)")
        pg.click('#qm-stage .tap-picker [data-basis="x"]')
        pg.click("#qm-eve-go")                                                 # commit taps
        pg.wait_for_function("() => document.querySelectorAll('#qm-stage .stage-qubits .qubit').length > 0", timeout=8000)


@requires_browser
def test_mp_eve_spoof_method_shows_window_controls():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-multi")
        pg.click("[data-create='eve']")
        pg.wait_for_selector("#qm-start", timeout=8000); pg.click("#qm-start")
        pg.wait_for_selector("[data-method='spoof']", timeout=8000)
        pg.click("[data-method='spoof']")
        pg.wait_for_selector("#qm-spoof-start", timeout=4000)
        pg.wait_for_selector("#qm-spoof-len", timeout=4000)
        pg.click("#qm-eve-go")
        pg.wait_for_timeout(400)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_ui_qkd_multi.py -k "eve_bruteforce_method or eve_tap_method or eve_spoof_method" -v`
Expected: FAIL — no `[data-method]` buttons exist yet; `#qm-spoof-start`/`#qm-spoof-len` don't exist.

- [ ] **Step 3: Implement**

In `quantumbreach/static/js/qkd-multi.js`, replace the `eve_move` branch of `renderControls` (the whole `else if (st.phase === "eve_move") { ... }` block):

```javascript
    } else if (st.phase === "eve_move") {
      if (keepEve) return;   // panel already built on a prior poll — keep Eve's method/taps/slider
      var curMethod = "tap";
      box.innerHTML =
        '<p class="muted">Pick how you try to get in this round.</p>' +
        '<div class="qkd-roles">' +
          '<button class="chip on" type="button" data-method="tap">Tap</button>' +
          '<button class="chip" type="button" data-method="spoof">Spoof Bob</button>' +
          '<button class="chip" type="button" data-method="bruteforce">Brute-force</button>' +
        '</div>' +
        '<div id="qm-method-body"></div>' +
        '<button class="btn" id="qm-eve-go" type="button">Commit</button>';
      window.__qmTaps = [];
      window.__qmSpoof = { start: 0, len: 4, basis: "+" };
      var states = []; for (var qi = 0; qi < 24; qi++) states.push({ basis: "?" });
      function renderMethodBody() {
        var body = $("qm-method-body");
        if (curMethod === "tap") {
          body.innerHTML = '<p class="muted">Tap qubits on the wire and pick ⊕/⊗. Wrong basis disturbs the qubit — Bob (and Alice) will see the error.</p>';
          if (stage) {
            stage.streamQubits(states, { tappable: true });
            stage.onTap(function (t) { window.__qmTaps.push({ i: t.index, basis: t.basis });
              stage.log("Eve taps qubit " + t.index + " in " + (t.basis === "x" ? "⊗" : "⊕"), "eve"); });
          }
        } else if (curMethod === "spoof") {
          body.innerHTML =
            '<p class="muted">Impersonate Bob\'s receiver for a stretch of the stream — one guessed basis across the whole window.</p>' +
            '<label>Window start <input id="qm-spoof-start" type="range" min="0" max="23" value="0"></label>' +
            '<label>Window length <input id="qm-spoof-len" type="range" min="1" max="24" value="4"></label>' +
            '<label>Basis ' +
              '<select id="qm-spoof-basis"><option value="+">⊕</option><option value="x">⊗</option></select>' +
            '</label>';
          if (stage) stage.streamQubits(states, { tappable: false });
          $("qm-spoof-start").addEventListener("input", function () { window.__qmSpoof.start = parseInt(this.value, 10) || 0; });
          $("qm-spoof-len").addEventListener("input", function () { window.__qmSpoof.len = parseInt(this.value, 10) || 1; });
          $("qm-spoof-basis").addEventListener("change", function () { window.__qmSpoof.basis = this.value; });
        } else {
          body.innerHTML =
            '<p class="muted">No qubit interception — a quiet attempt to crack the sifted key after the fact.</p>' +
            '<label>Workers <span id="qm-w-val">0</span><input id="qm-w" type="range" min="0" max="100" value="0"></label>' +
            '<div id="qm-grid" class="worker-grid"></div>' +
            '<p class="muted"><span id="qm-rate">0</span> keys/s · ETA <span id="qm-eta">—</span></p>';
          if (stage) stage.streamQubits(states, { tappable: false });
          $("qm-w").addEventListener("input", function () { $("qm-w-val").textContent = $("qm-w").value;
            if (window.PhantomBotnet) window.PhantomBotnet.renderPanel({ grid: $("qm-grid"), rate: $("qm-rate"), eta: $("qm-eta") }, parseInt($("qm-w").value, 10) || 0, 24, 0); });
        }
      }
      renderMethodBody();
      box.querySelectorAll("[data-method]").forEach(function (b) {
        b.addEventListener("click", function () {
          curMethod = b.getAttribute("data-method");
          box.querySelectorAll("[data-method]").forEach(function (o) { o.classList.remove("on"); });
          b.classList.add("on");
          renderMethodBody();
        });
      });
      $("qm-eve-go").addEventListener("click", function () {
        var workers = curMethod === "bruteforce" && $("qm-w") ? (parseInt($("qm-w").value, 10) || 0) : 0;
        var action = { method: curMethod, workers: workers };
        if (curMethod === "tap") action.taps = window.__qmTaps || [];
        if (curMethod === "spoof") { action.start = window.__qmSpoof.start; action.len = window.__qmSpoof.len; action.basis = window.__qmSpoof.basis; }
        act(action);
      });
    } else if (st.phase === "bob_decision") {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_ui_qkd_multi.py -v`
Expected: PASS for all tests in the file (the 3 rewritten + all untouched ones from Task 3's step 5).

- [ ] **Step 5: Commit**

```bash
git add quantumbreach/static/js/qkd-multi.js tests/test_ui_qkd_multi.py
git commit -m "feat(qkd-mp): Eve method picker UI — Tap / Spoof Bob / Brute-force replace the always-on tap+workers panel"
```

---

### Task 6: Accusation phase (server) — vote, resolve, reveal

**Files:**
- Modify: `quantumbreach/qkd/service.py`
- Test: `tests/test_qkd_multiplayer.py`

**Interfaces:**
- Consumes: `cfg["anon"]` (Task 2), `cfg["history"]` (Task 4).
- Produces: new phase value `"accusation"`. `cfg["accusationResult"] = {"aliceAccused": codename, "bobAccused": codename, "eveCodename": codename, "crewWon": bool}`. `cfg["reveal"] = {"alice": {"name","kind","codename"}, "bob": {...}, "eve": {...}}`. Both consumed by `game_state`'s `reveal_all` branch (already wired in Task 2) and rendered in Task 7.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_qkd_multiplayer.py

# -- replace the two tests whose "_next_round ends the game directly" assumption is now wrong --

def test_next_round_at_final_round_starts_accusation_not_ended(app):
    c = _guest(app)
    code = c.post("/api/qkd/game", json={"role": "bob"}).get_json()["code"]
    c.post(f"/api/qkd/game/{code}/start")
    for _ in range(30):
        st = c.get(f"/api/qkd/game/{code}").get_json()
        if st["phase"] == "accusation":
            break
        if st["phase"] == "bob_decision":
            c.post(f"/api/qkd/game/{code}/act", json={"action": {"decision": "abort"}})
        elif st["phase"] == "resolve":
            c.post(f"/api/qkd/game/{code}/act", json={"action": {"next": True}})
    final = c.get(f"/api/qkd/game/{code}").get_json()
    assert final["phase"] == "accusation"
    assert final["round"] == service.ROUNDS


def test_double_next_at_final_round_starts_accusation_once(app):
    # A losing thread replaying a stale final-round resolve must not double-transition.
    c = _guest(app)
    code = c.post("/api/qkd/game", json={"role": "bob"}).get_json()["code"]
    c.post(f"/api/qkd/game/{code}/start")
    for _ in range(30):
        st = c.get(f"/api/qkd/game/{code}").get_json()
        if st["phase"] == "resolve" and st["round"] >= service.ROUNDS:
            break
        if st["phase"] == "bob_decision":
            c.post(f"/api/qkd/game/{code}/act", json={"action": {"decision": "abort"}})
        elif st["phase"] == "resolve":
            c.post(f"/api/qkd/game/{code}/act", json={"action": {"next": True}})
    with app.app_context():
        db = get_db()
        snap = service._game(db, code)
        assert snap["phase"] == "resolve" and snap["round"] >= service.ROUNDS
        service._next_round(db, snap)
        service._next_round(db, snap)   # stale replay -> guarded no-op
        after = service._game(db, code)
    assert after["phase"] == "accusation"


def _play_to_accusation(app, alice_role_kind="human"):
    """Drive a bob-human, alice/eve-computer game to the accusation phase."""
    c = _guest(app)
    code = c.post("/api/qkd/game", json={"role": "bob"}).get_json()["code"]
    c.post(f"/api/qkd/game/{code}/start")
    for _ in range(30):
        st = c.get(f"/api/qkd/game/{code}").get_json()
        if st["phase"] == "accusation":
            break
        if st["phase"] == "bob_decision":
            c.post(f"/api/qkd/game/{code}/act", json={"action": {"decision": "abort"}})
        elif st["phase"] == "resolve":
            c.post(f"/api/qkd/game/{code}/act", json={"action": {"next": True}})
    return c, code


def test_accusation_self_accusation_rejected(app):
    c, code = _play_to_accusation(app)
    with app.app_context():
        db = get_db()
        cfg = json.loads(service._game(db, code)["config"] or "{}")
        bob_codename = cfg["anon"]["bob"]   # Bob's own view never exposes his own codename (Task 2)
    r = c.post(f"/api/qkd/game/{code}/act", json={"action": {"accuse": bob_codename}})
    assert r.status_code == 400
    assert c.get(f"/api/qkd/game/{code}").get_json()["phase"] == "accusation"  # not bricked


def test_accusation_unknown_codename_rejected(app):
    c, code = _play_to_accusation(app)
    r = c.post(f"/api/qkd/game/{code}/act", json={"action": {"accuse": "Not-A-Real-Codename"}})
    assert r.status_code == 400
    assert c.get(f"/api/qkd/game/{code}").get_json()["phase"] == "accusation"


def _play_to_accusation_two_humans(app):
    """Alice+Bob both human (Eve computer) so both votes are fully controllable -- unlike a
    computer seat, whose vote auto-fills the instant the accusation phase starts and can't be
    overridden afterward (`_claim_action` only claims a still-null action)."""
    alice_c = _guest(app)
    code = alice_c.post("/api/qkd/game", json={"role": "alice"}).get_json()["code"]
    bob_c = _guest(app)
    bob_c.post(f"/api/qkd/game/{code}/join", json={"role": "bob"})
    alice_c.post(f"/api/qkd/game/{code}/start")
    for _ in range(60):
        st = alice_c.get(f"/api/qkd/game/{code}").get_json()
        if st["phase"] == "accusation":
            break
        if st["phase"] == "alice_setup":
            alice_c.post(f"/api/qkd/game/{code}/act", json={"action": {"n": 16, "s": 8}})
        elif st["phase"] == "bob_decision":
            bob_c.post(f"/api/qkd/game/{code}/act", json={"action": {"decision": "abort"}})
        elif st["phase"] == "resolve":
            bob_c.post(f"/api/qkd/game/{code}/act", json={"action": {"next": True}})
    return alice_c, bob_c, code


def test_accusation_crew_wins_iff_both_correct(app):
    alice_c, bob_c, code = _play_to_accusation_two_humans(app)
    with app.app_context():
        db = get_db()
        cfg = json.loads(service._game(db, code)["config"] or "{}")
        eve_codename = cfg["anon"]["eve"]
    alice_c.post(f"/api/qkd/game/{code}/act", json={"action": {"accuse": eve_codename}})
    bob_c.post(f"/api/qkd/game/{code}/act", json={"action": {"accuse": eve_codename}})
    st = alice_c.get(f"/api/qkd/game/{code}").get_json()
    assert st["phase"] == "ended"
    assert st["accusationResult"]["crewWon"] is True
    assert st["accusationResult"]["eveCodename"] == eve_codename
    assert st["reveal"]["eve"]["kind"] == "computer"


def test_accusation_eve_wins_when_either_vote_wrong(app):
    alice_c, bob_c, code = _play_to_accusation_two_humans(app)
    with app.app_context():
        db = get_db()
        cfg = json.loads(service._game(db, code)["config"] or "{}")
        eve_codename = cfg["anon"]["eve"]
        alice_codename = cfg["anon"]["alice"]
    alice_c.post(f"/api/qkd/game/{code}/act", json={"action": {"accuse": eve_codename}})   # Alice correct
    bob_c.post(f"/api/qkd/game/{code}/act", json={"action": {"accuse": alice_codename}})   # Bob wrong
    st = alice_c.get(f"/api/qkd/game/{code}").get_json()
    assert st["phase"] == "ended"
    assert st["accusationResult"]["crewWon"] is False


def test_accusation_eves_vote_never_counts(app):
    # Human Eve + human Bob; computer Alice. Eve's vote must be accepted (no UI tell) but must
    # never affect crewWon -- only Alice's and Bob's votes decide it.
    eve_c = _guest(app)
    code = eve_c.post("/api/qkd/game", json={"role": "eve"}).get_json()["code"]
    bob_c = _guest(app)
    bob_c.post(f"/api/qkd/game/{code}/join", json={"role": "bob"})
    eve_c.post(f"/api/qkd/game/{code}/start")
    for _ in range(60):
        st = eve_c.get(f"/api/qkd/game/{code}").get_json()
        if st["phase"] == "accusation":
            break
        if st["phase"] == "eve_move":
            eve_c.post(f"/api/qkd/game/{code}/act", json={"action": {"method": "bruteforce", "workers": 0}})
        elif st["phase"] == "bob_decision":
            bob_c.post(f"/api/qkd/game/{code}/act", json={"action": {"decision": "abort"}})
        elif st["phase"] == "resolve":
            bob_c.post(f"/api/qkd/game/{code}/act", json={"action": {"next": True}})
    with app.app_context():
        db = get_db()
        cfg = json.loads(service._game(db, code)["config"] or "{}")
        alice_codename = cfg["anon"]["alice"]
        eve_codename = cfg["anon"]["eve"]
    r = eve_c.post(f"/api/qkd/game/{code}/act", json={"action": {"accuse": alice_codename}})
    assert r.status_code == 200   # Eve's vote is accepted...
    st = eve_c.get(f"/api/qkd/game/{code}").get_json()
    assert st["phase"] == "accusation"   # ...but alone it can't resolve the game -- Bob (human) hasn't voted
    bob_c.post(f"/api/qkd/game/{code}/act", json={"action": {"accuse": eve_codename}})   # Bob correct
    final = eve_c.get(f"/api/qkd/game/{code}").get_json()
    assert final["phase"] == "ended"
    assert final["accusationResult"]["crewWon"] is True   # decided by Alice(computer)+Bob, not Eve's vote


def test_accusation_computer_seats_auto_vote_to_reach_ended(app):
    # Bob human, Alice+Eve computer: only Bob's vote is human; Alice's computer vote must
    # auto-fill so the game reaches 'ended' without a second human.
    c, code = _play_to_accusation(app)
    with app.app_context():
        db = get_db()
        g = service._game(db, code)
        cfg = json.loads(g["config"] or "{}")
        eve_codename = cfg["anon"]["eve"]
    c.post(f"/api/qkd/game/{code}/act", json={"action": {"accuse": eve_codename}})
    st = c.get(f"/api/qkd/game/{code}").get_json()
    assert st["phase"] == "ended"   # computer Alice auto-voted, letting the round resolve
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_qkd_multiplayer.py -k accusation -v`
Expected: FAIL — `phase` never becomes `"accusation"`; `submit_action` has no handling for it; `accusationResult`/`reveal` never appear.

- [ ] **Step 3: Implement**

In `quantumbreach/qkd/service.py`, replace `_next_round`'s final-round branch:

```python
def _next_round(db, g):
    gid = g["id"]
    fresh = _game(db, g["code"])
    if fresh["phase"] != "resolve":
        return  # already advanced by another request
    if fresh["round"] >= ROUNDS:
        _start_accusation(db, fresh)
        return
    # Atomic claim: only one request advances resolve -> next round.
    cur = db.execute(
        "UPDATE qkd_games SET round=round+1, phase='alice_setup', updated_at=CURRENT_TIMESTAMP "
        "WHERE id=? AND phase='resolve'", (gid,))
    if cur.rowcount == 0:
        db.commit()
        return  # lost the race
    db.execute("UPDATE qkd_game_seats SET action=NULL WHERE game_id=?", (gid,))
    cfg = json.loads(fresh["config"] or "{}")
    for k in ("alice", "eve", "result"):
        cfg.pop(k, None)
    _set_config(db, gid, cfg)
    db.commit()
    advance(db, _game(db, g["code"]))


def _start_accusation(db, g):
    cur = db.execute(
        "UPDATE qkd_games SET phase='accusation', updated_at=CURRENT_TIMESTAMP "
        "WHERE id=? AND phase='resolve'", (g["id"],))
    if cur.rowcount == 0:
        db.commit()
        return  # another request already started the accusation phase
    db.execute("UPDATE qkd_game_seats SET action=NULL WHERE game_id=?", (g["id"],))
    db.commit()
    _advance_accusation(db, _game(db, g["code"]))


def _clean_accusation(role, action, cfg):
    anon = cfg.get("anon") or {}
    valid = {v for k, v in anon.items() if k != role}
    guess = action.get("accuse") if isinstance(action, dict) else None
    if not isinstance(guess, str) or guess not in valid:
        raise GameError("bad action", 400)
    return guess


def _advance_accusation(db, game):
    g = _game(db, game["code"])
    if g["phase"] != "accusation":
        return
    gid = g["id"]
    cfg = json.loads(g["config"] or "{}")
    anon = cfg.get("anon") or {}
    for role in ("alice", "bob"):
        seat = _seat(db, gid, role)
        if seat["action"] is None and seat["kind"] == "computer":
            other_roles = [r for r in ROLES if r != role]
            guess = anon.get(random.choice(other_roles), "")
            _claim_action(db, gid, role, {"accuse": guess})
            db.commit()
    alice_seat = _seat(db, gid, "alice")
    bob_seat = _seat(db, gid, "bob")
    if alice_seat["action"] is not None and bob_seat["action"] is not None:
        _resolve_accusation(db, g, cfg)


def _resolve_accusation(db, g, cfg):
    gid = g["id"]
    cur = db.execute(
        "UPDATE qkd_games SET phase='ended', updated_at=CURRENT_TIMESTAMP "
        "WHERE id=? AND phase='accusation'", (gid,))
    if cur.rowcount == 0:
        db.commit()
        return  # another request already resolved the accusation
    anon = cfg.get("anon") or {}
    alice_accuse = json.loads(_seat(db, gid, "alice")["action"] or "{}").get("accuse")
    bob_accuse = json.loads(_seat(db, gid, "bob")["action"] or "{}").get("accuse")
    eve_codename = anon.get("eve")
    crew_won = alice_accuse == eve_codename and bob_accuse == eve_codename
    cfg["accusationResult"] = {
        "aliceAccused": alice_accuse, "bobAccused": bob_accuse,
        "eveCodename": eve_codename, "crewWon": crew_won,
    }
    reveal = {}
    for s in _seats(db, gid):
        reveal[s["role"]] = {"name": s["display_name"], "kind": s["kind"], "codename": anon.get(s["role"])}
    cfg["reveal"] = reveal
    _set_config(db, gid, cfg)
    db.commit()
    for s in _seats(db, gid):
        if s["kind"] == "human" and s["user_id"] is not None and s["score"] > 0:
            db.execute("INSERT INTO qkd_scores (user_id, score) VALUES (?,?)", (s["user_id"], s["score"]))
            _award_badge(db, s["user_id"], "qkd-operative")
    db.commit()
```

Delete the old `_end_game` function entirely (superseded by `_resolve_accusation`).

Update `_is_up` to cover the accusation phase (add before the final `return`):

```python
def _is_up(phase, role, seats):
    if role is None:
        return False
    need = {"alice_setup": "alice", "eve_move": "eve", "bob_decision": "bob"}.get(phase)
    if need and need == role:
        by_role = {s["role"]: s for s in seats}
        return by_role[role]["action"] is None
    if phase == "accusation":
        by_role = {s["role"]: s for s in seats}
        return by_role[role]["action"] is None
    return phase == "resolve"  # any human may advance to the next round
```

Update `submit_action` to route the `"accusation"` phase before the existing single-role `expected` lookup:

```python
def submit_action(db, code, user, action):
    g = _game(db, code)
    seat = _seat_for_user(db, g["id"], user["id"])
    if not seat:
        raise GameError("not seated in this game", 403)
    if not isinstance(action, dict):
        raise GameError("bad action", 400)
    role = seat["role"]
    phase = g["phase"]
    if phase == "resolve":
        if action.get("next"):
            _next_round(db, g)
        return game_state(db, code, user)
    if phase == "accusation":
        if seat["action"] is not None:
            return game_state(db, code, user)  # idempotent: already voted
        cfg = json.loads(g["config"] or "{}")
        guess = _clean_accusation(role, action, cfg)
        _claim_action(db, g["id"], role, {"accuse": guess})
        db.commit()
        _advance_accusation(db, _game(db, code))
        return game_state(db, code, user)
    expected = {"alice_setup": "alice", "eve_move": "eve", "bob_decision": "bob"}.get(phase)
    if expected != role:
        raise GameError("not your turn", 409)
    if seat["action"] is not None:
        return game_state(db, code, user)  # idempotent: already submitted
    action = _clean_action(expected, action)
    _claim_action(db, g["id"], role, action)  # atomic; a concurrent double-submit is a no-op for the loser
    db.commit()
    advance(db, _game(db, code))
    return game_state(db, code, user)
```

Update `_maybe_timeout` to add an `"accusation"` branch before the existing early-return:

```python
def _maybe_timeout(db, g):
    if g["phase"] == "accusation":
        stale = db.execute(
            "SELECT (strftime('%s','now') - strftime('%s', updated_at)) AS age FROM qkd_games WHERE id=?",
            (g["id"],)).fetchone()["age"]
        if stale is not None and stale > TIMEOUT_SECONDS:
            cfg = json.loads(g["config"] or "{}")
            anon = cfg.get("anon") or {}
            claimed_any = False
            for role in ("alice", "bob"):
                seat = _seat(db, g["id"], role)
                if seat["kind"] == "human" and seat["action"] is None:
                    other_roles = [r for r in ROLES if r != role]
                    guess = anon.get(random.choice(other_roles), "")
                    if _claim_action(db, g["id"], role, {"accuse": guess}):
                        claimed_any = True
                        db.commit()
            if claimed_any:
                _advance_accusation(db, _game(db, g["code"]))
        return
    if g["phase"] not in ("alice_setup", "eve_move", "bob_decision"):
        return
    stale = db.execute(
        "SELECT (strftime('%s','now') - strftime('%s', updated_at)) AS age FROM qkd_games WHERE id=?",
        (g["id"],)).fetchone()["age"]
    if stale is not None and stale > TIMEOUT_SECONDS:
        expected = {"alice_setup": "alice", "eve_move": "eve", "bob_decision": "bob"}[g["phase"]]
        seat = _seat(db, g["id"], expected)
        if seat["kind"] == "human" and seat["action"] is None:
            cfg = json.loads(g["config"] or "{}")
            claimed = _claim_action(db, g["id"], expected,
                                    computer_strategy(expected, _computer_public(cfg, g["phase"]), random.random))
            db.commit()
            if claimed:  # only the request that actually took over drives the machine
                advance(db, _game(db, g["code"]))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_qkd_multiplayer.py -v`
Expected: PASS for the entire file.

- [ ] **Step 5: Commit**

```bash
git add quantumbreach/qkd/service.py tests/test_qkd_multiplayer.py
git commit -m "feat(qkd-mp): accusation phase after round 3 — Alice+Bob vote, crew wins iff both name the real Eve"
```

---

### Task 7: Accusation + reveal (client) — vote screen and results screen

**Files:**
- Modify: `quantumbreach/static/js/qkd-multi.js`
- Test: `tests/test_ui_qkd_multi.py`

**Interfaces:**
- Consumes: `st.phase === "accusation"`, `st.seats[i].codename` (Task 2), `POST .../act` with `{accuse: codename}` (Task 6); `st.phase === "ended"` with `st.accusationResult`, `st.reveal`, `st.scores`, `st.history` (Task 6/Task 2).
- Produces: nothing further downstream — this is the final leaf task.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_ui_qkd_multi.py (append)

@requires_browser
def test_mp_full_game_reaches_accusation_and_reveal():
    with live_server() as base, two_player_pages() as (alice, bob):
        alice.goto(base + "/qkd", wait_until="networkidle")
        alice.click("#mode-multi")
        alice.click('[data-create="alice"]')
        alice.wait_for_function("() => (document.getElementById('qm-mycode').textContent || '').length === 4", timeout=8000)
        code = alice.inner_text("#qm-mycode").strip()

        bob.goto(base + "/qkd", wait_until="networkidle")
        bob.click("#mode-multi")
        bob.fill("#qm-code", code)
        bob.click('[data-join="bob"]')
        alice.click("#qm-start")

        for _ in range(3):
            alice.wait_for_selector("#qm-al-go", timeout=8000)
            alice.click("#qm-al-go")
            bob.wait_for_selector("#qm-keep", timeout=8000)
            bob.click("#qm-keep")
            bob.wait_for_selector("#qm-next", timeout=8000)
            bob.click("#qm-next")
            alice.wait_for_timeout(300)

        bob.wait_for_selector(".accuse-btn", timeout=8000)
        alice.wait_for_selector(".accuse-btn", timeout=8000)
        bob.click(".accuse-btn")
        alice.click(".accuse-btn")
        bob.wait_for_function("() => document.getElementById('qm-reveal').textContent.indexOf('Eve was') !== -1", timeout=8000)
        assert "Eve was" in bob.inner_text("#qm-reveal")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_ui_qkd_multi.py -k full_game_reaches_accusation -v`
Expected: FAIL — no `.accuse-btn` renders yet; `qm-reveal` never contains "Eve was".

- [ ] **Step 3: Implement**

In `quantumbreach/static/js/qkd-multi.js`, add an `accusation` branch to `renderControls` (insert before the closing `if (st.phase === "resolve") { ... }` block's `}` — i.e. as an `else if` alongside it) and a reveal render in `render`:

```javascript
    } else if (st.phase === "accusation") {
      var suspects = st.seats.filter(function (s) { return s.codename; });
      box.innerHTML = '<p class="muted">Round over. Who do you think is Eve?</p>' +
        suspects.map(function (s) {
          return '<button class="btn accuse-btn" type="button" data-accuse="' + s.codename + '">' + s.codename + "</button>";
        }).join("");
      suspects.forEach(function (s) {
        box.querySelector('[data-accuse="' + s.codename + '"]').addEventListener("click", function () {
          act({ accuse: s.codename });
        });
      });
    }
```

Add reveal rendering — extend `renderControls`'s existing `if (st.lastResult) { ... }` block's sibling logic by adding, right after that block (still inside `renderControls`, before `if (!st.youAreUpNow) return;`):

```javascript
    if (st.phase === "ended" && st.accusationResult && st.reveal) {
      var ar = st.accusationResult, rv2 = st.reveal;
      var lines = [
        "Eve was " + rv2.eve.name + " (" + rv2.eve.codename + ").",
        "Alice accused " + ar.aliceAccused + "; Bob accused " + ar.bobAccused + ".",
        ar.crewWon ? "Crew correctly caught Eve — crew wins!" : "Eve escaped detection — Eve wins!",
      ];
      $("qm-reveal").textContent = lines.join(" ");
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_ui_qkd_multi.py -k full_game_reaches_accusation -v`
Expected: PASS.

- [ ] **Step 5: Run the full browser MP suite for regressions**

Run: `python -m pytest tests/test_ui_qkd_multi.py -v`
Expected: PASS for every test in the file.

- [ ] **Step 6: Commit**

```bash
git add quantumbreach/static/js/qkd-multi.js tests/test_ui_qkd_multi.py
git commit -m "feat(qkd-mp): accusation vote screen + reveal/results screen naming Eve and the winner"
```

---

### Task 8: Docs — anonymity model, Eve's methods, accusation phase

**Files:**
- Modify: `docs/QKD_MULTIPLAYER.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing (terminal task).

- [ ] **Step 1: Read the current doc**

Run: `python - <<'EOF'
print(open("docs/QKD_MULTIPLAYER.md", encoding="utf-8").read())
EOF`

(No test for a docs-only change — verify by reading the diff before committing.)

- [ ] **Step 2: Update the doc**

Add a section (adapt heading level to match the existing doc's structure) covering:
- Codenames are assigned per-game at creation; every seat sees its own true role but every other seat only as a codename, until the post-game reveal.
- Eve picks one of three methods each round — `tap` (per-qubit, scattered detection), `spoof` (a contiguous window impersonating Bob's basis guess, clustered detection), `bruteforce` (the existing botnet crack, zero qubit interception) — mutually exclusive, chosen via `{method, ...}` in the `POST /api/qkd/game/<code>/act` body during `eve_move`.
- After round 3, the game enters an `accusation` phase: Alice and Bob each submit `{accuse: "<codename>"}` naming the other seat they believe is Eve; the crew wins only if both are correct.
- The final `ended` state includes `accusationResult` and `reveal` (real names/roles unmasked) in `game_state`.

- [ ] **Step 3: Commit**

```bash
git add docs/QKD_MULTIPLAYER.md
git commit -m "docs(qkd-mp): document anonymity, Eve's three methods, and the accusation phase"
```

---

## Self-Review Notes (already applied above)

- **Spec coverage:** anonymity (Task 2/3), three Eve methods (Task 1/4/5), evidence visibility to both Alice+Bob (Task 4), accusation phase + vote-only win condition (Task 6/7), no engine/schema changes (confirmed — only `engine.py` gains a pure classifier + a return-shape change to an existing function; `qkd_games`/`qkd_game_seats` untouched), docs (Task 8). Every spec section maps to a task.
- **Type consistency:** `cfg["eve"]["taps"]` (not `"eveTaps"`) is used consistently across Task 4's implementation, its test assertions, and the `replay.eveTaps` read in `_resolve_scoring`. `classify_error_shape(n, sample_indices, sample_errors)`'s signature matches every call site (Task 1's tests, Task 4's `advance()` call).
- **Placeholder scan:** no TBD/TODO; every step has literal code or a literal runnable test.
