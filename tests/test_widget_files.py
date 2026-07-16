import os

WIDGET_DIR = os.path.join("quantumbreach", "static", "js", "widgets")


def test_all_widget_scripts_exist():
    for name in ["caesar-wheel", "brute-force", "frequency", "xor-tool"]:
        path = os.path.join(WIDGET_DIR, name + ".js")
        assert os.path.exists(path), path
        with open(path, encoding="utf-8") as f:
            body = f.read()
        assert 'data-widget="' + name + '"' in body
