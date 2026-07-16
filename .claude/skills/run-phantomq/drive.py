#!/usr/bin/env python3
"""Launch PhantomQ and drive it through a real browser, capturing screenshots.

This is the repo's verified launch-and-drive recipe. It:
  1. starts the app with `python app.py` (Waitress) on an isolated port + temp DB,
  2. waits for the /healthz endpoint,
  3. drives it in system Chrome via Playwright: home -> sign up -> open a room ->
     use the interactive Caesar widget -> submit an answer,
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

        pg.goto(base + "/", wait_until="networkidle")
        pg.screenshot(path=os.path.join(out, "1-home.png"), full_page=True)
        print("[home] title:", pg.title())

        pg.goto(base + "/auth/signup", wait_until="networkidle")
        pg.fill("input[name=username]", "demo_player")
        pg.fill("input[name=password]", "pw12")
        pg.click("button[type=submit]")
        pg.wait_for_load_state("networkidle")
        print("[signup] landed on:", pg.url)
        pg.screenshot(path=os.path.join(out, "2-home-loggedin.png"), full_page=True)

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
