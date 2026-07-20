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


@requires_browser
def test_redirect_is_quote_aware():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/terminal", wait_until="networkidle")

        # A '>' inside a quoted argument must NOT trigger redirection — the
        # whole quoted string (including '>') is a single argument to
        # caesar, not an output path. Regression for a bug where the raw-line
        # regex matched the quoted '>' before quote-aware tokenizing,
        # truncating the command and silently writing garbage to a bogus
        # "noon\"" file instead of printing the cipher.
        assert run(pg, 'caesar -e 3 "attack > noon"') == "dwwdfn > qrrq"

        # ...and no bogus quoted-filename file was created by it.
        assert '"' not in run(pg, "ls")

        # Real (unquoted) redirection must still work, including append.
        run(pg, "mkdir demo2")
        run(pg, "echo hello > demo2/a.txt")
        assert run(pg, "cat demo2/a.txt").strip() == "hello"
        run(pg, "echo world >> demo2/a.txt")
        assert run(pg, "cat demo2/a.txt").strip() == "hello\nworld"


@requires_browser
def test_net_pack():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/terminal", wait_until="networkidle")
        out = run(pg, "nmap channel-q")
        assert "alice" in out.lower() and "bob" in out.lower() and "eve" in out.lower()


@requires_browser
def test_sys_pack():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/terminal", wait_until="networkidle")
        assert "PhantomOS" in run(pg, "uname -a")
        assert "sudoers" in run(pg, "sudo rm -rf /")
        assert "usage" in run(pg, "man ls").lower()
