from tests.browser_utils import live_server, browser_page, requires_browser


@requires_browser
def test_encrypt_decrypt_roundtrip():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        js = """(function(){
          var key=[1,0,1,1,0,0,1,0,1,1];
          var data=new Uint8Array([72,73,33]); // 'HI!'
          var ct=QkdFile.encrypt(data,key);
          var pt=QkdFile.decrypt(ct,key);
          return Array.from(pt).join(',');
        })()"""
        assert pg.evaluate(js) == "72,73,33"


@requires_browser
def test_wrong_key_garbles():
    with live_server() as base, browser_page() as pg:
        pg.goto(base + "/qkd", wait_until="networkidle")
        js = """(function(){
          var data=new Uint8Array([72,73,33]);
          var ct=QkdFile.encrypt(data,[1,0,1,1]);
          var pt=QkdFile.decrypt(ct,[0,1,0,1]);
          return Array.from(pt).join(',') === '72,73,33';
        })()"""
        assert pg.evaluate(js) is False
