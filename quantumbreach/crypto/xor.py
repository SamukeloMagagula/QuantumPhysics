def xor_bytes(data: bytes, key: bytes) -> bytes:
    if not key:
        raise ValueError("key must be non-empty")
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))


def single_byte_xor(data: bytes, key: int) -> bytes:
    return bytes(b ^ (key & 0xFF) for b in data)
