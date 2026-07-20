import math
from quantumbreach.qkd import botnet


def test_speed_scales_with_workers():
    assert botnet.keys_per_sec(10) == 10 * botnet.BASE_RATE


def test_short_key_cracks_long_key_does_not():
    # 12-bit key with 8 workers within a 20s window: crackable
    assert botnet.crackable_within(12, 8, botnet.ROUND_WINDOW) is True
    # 128-bit key: not crackable in the round window
    assert botnet.crackable_within(128, 100, botnet.ROUND_WINDOW) is False


def test_worker_cost_and_detection():
    assert botnet.worker_cost(30) == 3
    assert botnet.detection_delta(0.5) == 50
