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

        # v2.1 tour: QKD role-based Solo round (pick Solo mode, play Bob, then ABORT)
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.click("#mode-solo")
        pg.click('.role[data-role="bob"]'); pg.wait_for_timeout(300)
        try:
            pg.click("#btn-abort")
        except Exception:
            pass
        pg.wait_for_timeout(300)
        print("[qkd] sidebar present:", pg.query_selector(".sidebar") is not None,
              "| played a Solo round as Bob")
        pg.screenshot(path=os.path.join(out, "7-qkd.png"), full_page=True)

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
