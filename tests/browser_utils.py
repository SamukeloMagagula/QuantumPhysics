import contextlib
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _chrome_ok():
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            b = p.chromium.launch(channel="chrome", headless=True)
            b.close()
        return True
    except Exception:
        return False


CHROME_OK = _chrome_ok()
requires_browser = pytest.mark.skipif(not CHROME_OK, reason="system Chrome/Playwright not available")


@contextlib.contextmanager
def live_server(content_dir=None):
    port = _free_port()
    env = dict(os.environ)
    env["PHANTOMQ_PORT"] = str(port)
    env["PHANTOMQ_SECRET_KEY"] = "browser-test-key"
    env["PHANTOMQ_DB"] = tempfile.mktemp(suffix=".db")
    if content_dir:
        env["PHANTOMQ_CONTENT"] = content_dir
    base = f"http://127.0.0.1:{port}"
    proc = subprocess.Popen([sys.executable, "app.py"], cwd=REPO_ROOT, env=env)
    try:
        for _ in range(60):
            try:
                with urllib.request.urlopen(base + "/healthz", timeout=1) as r:
                    if r.status == 200:
                        break
            except Exception:
                time.sleep(0.3)
        else:
            raise RuntimeError("server did not start")
        yield base
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        try:
            os.unlink(env["PHANTOMQ_DB"])
        except OSError:
            pass


@contextlib.contextmanager
def browser_page():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True)
        page = b.new_context(viewport={"width": 1280, "height": 900}).new_page()
        try:
            yield page
        finally:
            b.close()
