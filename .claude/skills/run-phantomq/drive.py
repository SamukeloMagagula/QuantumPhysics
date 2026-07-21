#!/usr/bin/env python3
"""Launch PhantomQ and drive it through a real browser, capturing screenshots.

This is the repo's verified launch-and-drive recipe. It:
  1. starts the app with `python app.py` (Waitress) on an isolated port + temp DB,
  2. waits for the /healthz endpoint,
  3. drives it in system Chrome via Playwright: the anonymous landing page (`/`,
     no sidebar, no guest identity yet) -> click "Enter Platform" into the
     sidebar app shell at `/dashboard` (this is where the guest identity is
     auto-provisioned) -> open a room -> use the interactive Caesar widget ->
     submit an answer -> tour the v2 pages (PhantomShell terminal, Quantum
     Intercept QKD game, GHOST chatbot),
  4. screenshots each step and prints what it observed,
  5. tears the server down and cleans up the temp DB.

Usage:
    python .claude/skills/run-phantomq/drive.py
    python .claude/skills/run-phantomq/drive.py --out ./screenshots --port 8130

Requirements (already present in this dev environment):
    pip install playwright        # the Python package
    # A system Chrome/Edge is used via channel="chrome"; no chromium download needed.
"""
import argparse
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))


def wait_for_health(base, timeout=30.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(base + "/healthz", timeout=1) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.4)
    return False


def drive(base, out):
    from playwright.sync_api import sync_playwright

    os.makedirs(out, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        pg = ctx.new_page()

        # 1. Anonymous landing page: no sidebar, no guest identity yet.
        pg.goto(base + "/", wait_until="networkidle")
        # let the one-time boot overlay (typewriter + fade-out) finish so the
        # screenshot shows the actual hero, not the "INITIALIZING..." splash.
        try:
            pg.wait_for_selector("#boot", state="detached", timeout=5000)
        except Exception:
            pass
        pg.screenshot(path=os.path.join(out, "1-landing.png"), full_page=True)
        for_schools = pg.query_selector("#for-schools")
        print("[landing] title:", pg.title(), "| #for-schools present:", for_schools is not None)
        assert for_schools is not None, "landing page missing #for-schools section"
        assert pg.query_selector(".sidebar") is None, "landing page should not have the sidebar"

        # 2. Click the landing CTA into the app shell. This is where a guest
        #    identity gets auto-provisioned (not on the anonymous landing page).
        with pg.expect_navigation(wait_until="networkidle"):
            pg.click("header.lp-topbar a.btn")
        assert pg.url.rstrip("/").endswith("/dashboard"), f"expected /dashboard, got {pg.url}"
        sidebar = pg.query_selector(".sidebar")
        print("[dashboard] url:", pg.url, "| sidebar present:", sidebar is not None,
              "| guest handle:", pg.text_content("#nav-name"))
        assert sidebar is not None, "dashboard missing the sidebar app shell"
        pg.screenshot(path=os.path.join(out, "2-dashboard.png"), full_page=True)

        pg.goto(base + "/paths/symmetric", wait_until="networkidle")
        pg.screenshot(path=os.path.join(out, "3-path.png"), full_page=True)

        pg.goto(base + "/rooms/the-shift", wait_until="networkidle")
        pg.wait_for_timeout(400)  # let widget JS mount
        pg.screenshot(path=os.path.join(out, "4-room.png"), full_page=True)
        widget = pg.query_selector('[data-widget="caesar-wheel"]')
        out_el = pg.query_selector('[data-widget="caesar-wheel"] .out')
        print("[room] caesar-wheel present:", widget is not None,
              "| widget output:", out_el.text_content() if out_el else None)

        q = 'div.q[data-question="plaintext"]'
        pg.fill(f"{q} input.answer", "hello world")
        pg.click(f"{q} button.submit")
        pg.wait_for_function(
            "() => { const r = document.querySelector("
            "'div.q[data-question=\"plaintext\"] .result');"
            " return r && r.textContent.trim().length > 0; }",
            timeout=5000)
        print("[answer] result:", pg.text_content(f"{q} .result"))
        print("[answer] nav chip:", pg.text_content("#nav-points"))
        pg.screenshot(path=os.path.join(out, "5-answered.png"), full_page=True)

        # v2 tour -- the sidebar shell persists across every app page.
        pg.goto(base + "/terminal", wait_until="networkidle")
        pg.fill("#shell-in", "caesar -d 3 Khoor"); pg.press("#shell-in", "Enter"); pg.wait_for_timeout(150)
        print("[terminal] sidebar present:", pg.query_selector(".sidebar") is not None,
              "| ran caesar -d 3 Khoor")
        pg.screenshot(path=os.path.join(out, "6-terminal.png"), full_page=True)

        # v3 tour: PhantomShell VFS + command packs (missions dir, cat a file, nmap the
        # QKD host). Screenshot shows the shell output pane populated by these runs.
        pg.fill("#shell-in", "ls missions"); pg.press("#shell-in", "Enter"); pg.wait_for_timeout(150)
        pg.fill("#shell-in", "cat missions/mission.txt"); pg.press("#shell-in", "Enter"); pg.wait_for_timeout(150)
        pg.fill("#shell-in", "nmap channel-q"); pg.press("#shell-in", "Enter"); pg.wait_for_timeout(150)
        shell_out = pg.text_content("#shell-out") or ""
        print("[terminal] ran ls missions / cat missions/mission.txt / nmap channel-q |",
              "mission.txt content visible:", "CLASSIFIED" in shell_out,
              "| nmap output visible:", "channel-q" in shell_out)
        assert "CLASSIFIED" in shell_out, "cat missions/mission.txt did not print the file body"
        pg.screenshot(path=os.path.join(out, "6b-terminal-packs.png"), full_page=True)

        # QKD Channel Heist (Solo): play as Eve on the network-map stage -- qubits stream
        # Alice->Bob over the fiber, Eve deploys a botnet, and (with no taps -> a clean
        # channel) computer-Bob KEEPs so Bob's pane de-scrambles the preloaded mission
        # sample. Screenshots the network map + heist, then the visible decrypt.
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-solo")
        pg.click('.role[data-role="eve"]')
        pg.wait_for_selector('#qkd-stage .stage-qubits .qubit', timeout=5000)
        pg.evaluate(
            "() => { var w = document.getElementById('ev-w'); w.value = 100; "
            "w.dispatchEvent(new Event('input')); }")
        pg.click("#ev-crack"); pg.wait_for_timeout(200)
        stage_qubits = pg.eval_on_selector_all("#qkd-stage .stage-qubits .qubit", "els => els.length")
        grid_workers = pg.eval_on_selector_all("#ev-grid .worker", "els => els.length")
        print("[qkd] solo heist | network-map qubits:", stage_qubits, "| botnet grid tiles:", grid_workers)
        assert stage_qubits and stage_qubits > 0, "the network-map stage rendered no qubits"
        pg.screenshot(path=os.path.join(out, "7-qkd-solo-heist.png"), full_page=True)

        pg.click("#ev-commit")  # no taps -> clean channel -> computer Bob KEEPs
        pg.wait_for_selector("#bob-file pre", timeout=6000)
        bob_file_text = pg.text_content("#bob-file pre") or ""
        print("[qkd] committed a clean intercept -> Bob's pane decrypted:", "CLASSIFIED" in bob_file_text)
        assert "CLASSIFIED" in bob_file_text, "Bob's pane did not decrypt the clean-channel file"
        pg.screenshot(path=os.path.join(out, "7b-qkd-file-reveal.png"), full_page=True)

        # Embedded terminal on /qkd: play a round entirely by typing, and confirm the
        # live feed sidebar narrated it (Tasks 2/8/9/10 of the uploads+terminal plan).
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-solo")
        pg.click('.role[data-role="eve"]')
        pg.wait_for_selector("#shell-in", timeout=5000)
        pg.fill("#shell-in", "eve tap 0 x"); pg.press("#shell-in", "Enter")
        pg.wait_for_timeout(150)
        pg.fill("#shell-in", "eve commit"); pg.press("#shell-in", "Enter")
        pg.wait_for_function("() => document.getElementById('qkd-score').textContent.indexOf('Score') >= 0", timeout=5000)
        feed_lines = pg.evaluate("() => document.getElementById('qkd-feed').children.length")
        print("[qkd] embedded terminal played a round | feed lines:", feed_lines)
        assert feed_lines and feed_lines > 1, "the live feed sidebar did not narrate the terminal-driven round"
        pg.screenshot(path=os.path.join(out, "10-qkd-terminal-and-feed.png"), full_page=True)

        # v3 parity check -- the SAME QkdActions intent functions the terminal's
        # `shell-qkd` commands call (qkd/alice/eve/bob) drive this round too, confirming
        # buttons and terminal share one state object (Task 12). QkdActions.bobDecide()
        # does not touch the #bob-file/#eve-file DOM panes on its own (only qkd.js's
        # button-driven finish() does, mirroring INTO QkdActions, not out of it), so this
        # is a state/console parity check rather than a new screenshot -- the button-flow
        # screenshot above (7b) is the reliable visible reveal.
        pg.evaluate("() => QkdActions.aliceSet({n:16,s:2,file:'mission'})")
        pg.evaluate("() => QkdActions.eveCrack({workers:100})")
        result = pg.evaluate("() => QkdActions.bobDecide('keep')")
        print("[qkd] QkdActions parity round (terminal-equivalent) | phase:",
              pg.evaluate("() => QkdActions.state().phase"),
              "| fileCracked:", result.get("result", {}).get("fileCracked") if isinstance(result, dict) else None)

        # Multiplayer file-heist + botnet (single human vs computer seats):
        # (a) as Alice, pick a sample + send -> the file decrypts in Alice's reveal pane;
        # (b) as Eve, deploy a botnet -> the animated worker grid renders.
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-multi")
        pg.click("[data-create='alice']")
        pg.wait_for_selector("#qm-start", timeout=8000); pg.click("#qm-start")
        pg.wait_for_selector("#qm-file", timeout=8000)
        pg.select_option("#qm-file", "mission"); pg.click("#qm-al-go")
        pg.wait_for_function(
            "() => { var v = document.querySelector('#qm-file-view'); return v && v.textContent.indexOf('CLASSIFIED') >= 0; }",
            timeout=8000)
        print("[qkd-mp] Alice sent a sample -> file decrypted in the multiplayer reveal pane")
        pg.screenshot(path=os.path.join(out, "9-qkd-mp-file-reveal.png"), full_page=True)

        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-multi")
        pg.click("[data-create='eve']")
        pg.wait_for_selector("#qm-start", timeout=8000); pg.click("#qm-start")
        pg.wait_for_selector("#qm-stage .stage-qubits .qubit", timeout=8000)
        pg.eval_on_selector("#qm-w", "el => { el.value = 64; el.dispatchEvent(new Event('input')); }")
        pg.wait_for_timeout(150)
        # tap a qubit on the shared wire, then deploy the botnet
        pg.click("#qm-stage .stage-qubits .qubit:nth-child(2)")
        pg.click('#qm-stage .tap-picker [data-basis="x"]')
        mp_tiles = pg.evaluate("() => document.querySelectorAll('#qm-grid .worker').length")
        mp_qubits = pg.evaluate("() => document.querySelectorAll('#qm-stage .stage-qubits .qubit').length")
        print("[qkd-mp] Eve tapped the wire + deployed a botnet | qubits:", mp_qubits, "| worker tiles:", mp_tiles)
        pg.screenshot(path=os.path.join(out, "9b-qkd-mp-eve-heist.png"), full_page=True)
        pg.click("#qm-eve-go")  # commit taps -> computer Bob decides -> synced replay
        pg.wait_for_timeout(1200)
        pg.screenshot(path=os.path.join(out, "9c-qkd-mp-replay.png"), full_page=True)

        # GHOST chatbot: the launcher lives in the app shell, so open it from an
        # app page (dashboard) rather than the anonymous landing page.
        pg.goto(base + "/dashboard", wait_until="networkidle")
        pg.click(".ghost-launch"); pg.fill(".ghost-input", "how do I start"); pg.press(".ghost-input", "Enter"); pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(out, "8-chatbot.png"), full_page=True)
        print("[chatbot] asked GHOST from /dashboard")

        browser.close()
    print("Screenshots written to:", os.path.abspath(out))


def main():
    ap = argparse.ArgumentParser(description="Launch and drive PhantomQ")
    ap.add_argument("--port", type=int, default=8130)
    ap.add_argument("--out", default=os.path.join(tempfile.gettempdir(), "phantomq-shots"))
    args = ap.parse_args()

    base = f"http://localhost:{args.port}"
    env = dict(os.environ)
    env["PHANTOMQ_PORT"] = str(args.port)
    env["PHANTOMQ_SECRET_KEY"] = "run-skill-demo-key"   # stable session, no warning
    env["PHANTOMQ_DB"] = tempfile.mktemp(suffix=".db")   # isolate from repo phantomq.db
    env["PYTHONUNBUFFERED"] = "1"

    print(f"Starting PhantomQ on {base} (db={env['PHANTOMQ_DB']}) ...")
    srv = subprocess.Popen([sys.executable, "app.py"], cwd=REPO_ROOT, env=env)
    try:
        if not wait_for_health(base):
            print("ERROR: server did not become healthy in time", file=sys.stderr)
            return 1
        print("Server is up. Driving the UI ...")
        drive(base, args.out)
        return 0
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=10)
        except subprocess.TimeoutExpired:
            srv.kill()
        try:
            os.unlink(env["PHANTOMQ_DB"])
        except OSError:
            pass
        print("Server stopped.")


if __name__ == "__main__":
    raise SystemExit(main())
