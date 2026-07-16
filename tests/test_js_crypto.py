from tests.browser_utils import live_server, browser_page, requires_browser


@requires_browser
def test_crypto_module_functions():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/", wait_until="networkidle")
        assert pg.evaluate("PhantomCrypto.caesar('Hello, World!', 3)") == "Khoor, Zruog!"
        assert pg.evaluate("PhantomCrypto.caesarDecrypt('Khoor', 3)") == "Hello"
        assert pg.evaluate("PhantomCrypto.brute('Khoor').length") == 25
        assert pg.evaluate("PhantomCrypto.bytesToStr(PhantomCrypto.singleByteXor(PhantomCrypto.singleByteXor(PhantomCrypto.strToBytes('hi'),66),66))") == "hi"
        assert pg.evaluate("PhantomCrypto.b64decode(PhantomCrypto.b64encode('flag{x}'))") == "flag{x}"
        # BB84: with no Eve and matching bases, sifted keys agree (qber 0)
        assert pg.evaluate("""(() => {
          const c = PhantomCrypto.bb84;
          const a = c.prepare(200);
          const bBases = a.bases.slice();
          const meas = a.bits.map((bit,i)=>c.measure(bit,a.bases[i],bBases[i]));
          const s = c.sift(a.bases,bBases,a.bits,meas);
          return c.qber(s.aKey,s.bKey);
        })()""") == 0
        # known-answer hash matches server engine (sha256 of 'hello world')
        assert pg.evaluate("PhantomCrypto.sha256hex('hello world')") == "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
