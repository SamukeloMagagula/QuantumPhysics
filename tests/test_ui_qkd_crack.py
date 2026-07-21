from tests.browser_utils import live_server, browser_page, requires_browser

PLAINTEXT_JS = "\"the quick brown fox jumps over the lazy dog 1234567890\""


@requires_browser
def test_crack_short_key_succeeds():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        out = pg.evaluate("""() => new Promise((resolve) => {
          var s = %s;
          var bytes = new Uint8Array(s.length); for (var i=0;i<s.length;i++) bytes[i]=s.charCodeAt(i);
          var key = [1,0,1,1,0,0];
          var ct = QkdFile.encrypt(bytes, key);
          QkdCrack.bruteForce(ct, 'text/plain', {maxBits: 8}).then(function (r) {
            resolve({ cracked: r.cracked, attempts: r.attempts, keyLen: r.keyBits ? r.keyBits.length : -1 });
          });
        })""" % PLAINTEXT_JS)
        assert out["cracked"] is True
        assert out["attempts"] > 0


@requires_browser
def test_crack_long_key_does_not_crack_within_small_maxbits():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        out = pg.evaluate("""() => new Promise((resolve) => {
          var s = %s;
          var bytes = new Uint8Array(s.length); for (var i=0;i<s.length;i++) bytes[i]=s.charCodeAt(i);
          var key = [1,0,1,1,0,0,1,0,1,1,0,1,0,0,1,1];  // 16-bit key
          var ct = QkdFile.encrypt(bytes, key);
          QkdCrack.bruteForce(ct, 'text/plain', {maxBits: 6}).then(function (r) {  // cap well below 16
            resolve({ cracked: r.cracked });
          });
        })""" % PLAINTEXT_JS)
        assert out["cracked"] is False


@requires_browser
def test_export_ciphertext_round_trips_through_decrypt():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        out = pg.evaluate("""() => {
          var payload = { mime: 'text/plain', bytes: new Uint8Array([72,73]) };
          var key = [1,0,1,1];
          var exported = QkdCrack.exportCiphertext(payload, key);
          var parsed = JSON.parse(exported);
          var cipherBytes = Uint8Array.from(atob(parsed.cipher), c => c.charCodeAt(0));
          var back = QkdFile.decrypt(cipherBytes, key);
          return { v: parsed.v, mime: parsed.mime, recovered: Array.from(back) };
        }""")
        assert out["v"] == 1 and out["mime"] == "text/plain"
        assert out["recovered"] == [72, 73]


@requires_browser
def test_crack_upload_resolves_on_cancel_instead_of_hanging():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        out = pg.evaluate("""() => new Promise((resolve) => {
          var p = QkdCrack.crackUpload({});
          p.then(function (r) { resolve({ settled: true, error: r.error }); });
          // force window focus to simulate the dialog closing without a pick
          setTimeout(function () { window.dispatchEvent(new Event('focus')); }, 50);
        })""")
        assert out["settled"] is True
        assert out["error"] in ("upload cancelled", "no file selected")


@requires_browser
def test_crack_upload_does_not_misreport_slow_processing_as_cancelled(tmp_path):
    upload_path = tmp_path / "slow.bin"
    upload_path.write_bytes(bytes((i * 37) % 256 for i in range(64)))  # 64 bytes, plausibility-neutral binary
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        pg.evaluate("""() => {
          window.__crackResult = null;
          QkdCrack.crackUpload({ maxBits: 18 }).then(function (r) { window.__crackResult = r; });
        }""")
        pg.set_input_files("#qkd-crack-upload-input", str(upload_path))
        # Simulate the OS dialog closing quickly (real browsers fire 'focus' right after file pick, well before bruteForce finishes)
        pg.evaluate("() => window.dispatchEvent(new Event('focus'))")
        pg.wait_for_function("() => window.__crackResult !== null", timeout=15000)
        result = pg.evaluate("() => window.__crackResult")
        assert result.get("error") != "upload cancelled"
        assert result["attempts"] > 0
