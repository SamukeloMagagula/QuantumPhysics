WIDGET_IDS = frozenset({"caesar-wheel", "brute-force", "frequency", "xor-tool"})


def is_widget(widget_id: str) -> bool:
    return widget_id in WIDGET_IDS


def script_for(widget_id: str):
    return f"js/widgets/{widget_id}.js" if widget_id in WIDGET_IDS else None
