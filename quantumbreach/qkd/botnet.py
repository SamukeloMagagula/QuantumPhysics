import math

BASE_RATE = 50000       # keys/sec per worker
ROUND_WINDOW = 20       # seconds Eve has to crack within a round
OPS_BUDGET = 100        # total ops Eve can spend per round


def keys_per_sec(workers):
    return max(0, int(workers)) * BASE_RATE


def crack_eta(key_bits, workers):
    kps = keys_per_sec(workers)
    if kps <= 0 or key_bits > 60:  # 2**60 keys is effectively unreachable
        return float("inf")
    return (2 ** int(key_bits)) / kps


def worker_cost(workers):
    return math.ceil(max(0, int(workers)) / 10)


def detection_delta(p):
    return round(float(p) * 100)


def crackable_within(key_bits, workers, window_seconds=ROUND_WINDOW):
    return crack_eta(key_bits, workers) <= window_seconds
