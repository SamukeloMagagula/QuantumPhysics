from tests.browser_utils import live_server, browser_page, requires_browser


@requires_browser
def test_vfs_resolve_and_crud():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/terminal", wait_until="networkidle")

        # resolve: handles .. and relative segments against cwd
        assert pg.evaluate(
            "PhantomVFS.resolve(PhantomVFS.create(), '/home/operative', '../operative/missions')"
        ) == "/home/operative/missions"

        # resolve: handles ~ and absolute paths
        assert pg.evaluate(
            "PhantomVFS.resolve(PhantomVFS.create(), '/home/operative', '~/captures')"
        ) == "/home/operative/captures"
        assert pg.evaluate(
            "PhantomVFS.resolve(PhantomVFS.create(), '/home/operative/missions', '/home/operative')"
        ) == "/home/operative"

        # seeded tree: mission file + empty captures dir
        assert pg.evaluate(
            "PhantomVFS.node(PhantomVFS.create(), '/home/operative/missions/mission.txt').type"
        ) == "file"
        assert pg.evaluate(
            "PhantomVFS.node(PhantomVFS.create(), '/home/operative/captures').type"
        ) == "dir"

        # mkdir -p then writeFile then readFile
        val = pg.evaluate("""(() => {
            var t = PhantomVFS.create();
            PhantomVFS.mkdir(t, '/home/operative/a/b', {recursive: true});
            PhantomVFS.writeFile(t, '/home/operative/a/b/f.txt', 'hi');
            return PhantomVFS.readFile(t, '/home/operative/a/b/f.txt');
        })()""")
        assert val == "hi"

        # list + rm round-trip on the same tree
        val2 = pg.evaluate("""(() => {
            var t = PhantomVFS.create();
            PhantomVFS.mkdir(t, '/home/operative/a/b', {recursive: true});
            PhantomVFS.writeFile(t, '/home/operative/a/b/f.txt', 'hi');
            var before = PhantomVFS.list(t, '/home/operative/a/b');
            PhantomVFS.rm(t, '/home/operative/a/b/f.txt', {});
            var after = PhantomVFS.list(t, '/home/operative/a/b');
            return JSON.stringify([before, after]);
        })()""")
        assert val2 == '[["f.txt"],[]]'

        # save/load round-trips through localStorage under key pq_vfs
        val3 = pg.evaluate("""(() => {
            var t = PhantomVFS.create();
            PhantomVFS.writeFile(t, '/home/operative/missions/mission.txt', 'patched');
            PhantomVFS.save(t);
            var loaded = PhantomVFS.load();
            return [localStorage.getItem('pq_vfs') !== null,
                    PhantomVFS.readFile(loaded, '/home/operative/missions/mission.txt')];
        })()""")
        assert val3 == [True, "patched"]
