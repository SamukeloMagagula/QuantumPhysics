from tests.browser_utils import live_server, browser_page, requires_browser


def run(pg, line):
    return pg.evaluate("(async () => await PhantomShell.run(%r))()" % line)


@requires_browser
def test_fs_pack():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/terminal", wait_until="networkidle")
        assert "/home/operative" in run(pg, "pwd")
        assert "missions" in run(pg, "ls")
        run(pg, "mkdir demo")
        run(pg, "echo hello > demo/a.txt")
        assert run(pg, "cat demo/a.txt").strip() == "hello"
        assert "a.txt" in run(pg, "ls demo")


@requires_browser
def test_text_pack():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/terminal", wait_until="networkidle")
        run(pg, "echo banana > f.txt")
        run(pg, "echo apple >> f.txt")
        assert run(pg, "sort f.txt").splitlines()[0].strip() == "apple"
        assert run(pg, "wc f.txt").strip().split()[0] == "2"  # 2 lines
        assert "apple" in run(pg, "grep apple f.txt")
