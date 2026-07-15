from quantumbreach.widgets import WIDGET_IDS, is_widget, script_for


def test_known_widgets():
    assert "caesar-wheel" in WIDGET_IDS
    assert is_widget("xor-tool")
    assert not is_widget("nope")


def test_script_path():
    assert script_for("frequency") == "js/widgets/frequency.js"
    assert script_for("nope") is None
