from quantumbreach.crypto import (
    caesar_encrypt, caesar_decrypt, caesar_crack_all,
    xor_bytes, single_byte_xor, letter_frequencies,
)


def test_caesar_roundtrip():
    assert caesar_encrypt("Hello, World!", 3) == "Khoor, Zruog!"
    assert caesar_decrypt("Khoor, Zruog!", 3) == "Hello, World!"


def test_caesar_wraps_and_preserves_nonalpha():
    assert caesar_encrypt("xyz XYZ 123", 3) == "abc ABC 123"


def test_caesar_crack_all_contains_plaintext():
    ct = caesar_encrypt("attack at dawn", 7)
    candidates = dict(caesar_crack_all(ct))
    assert candidates[7] == "attack at dawn"
    assert len(candidates) == 25


def test_xor_bytes_roundtrip():
    ct = xor_bytes(b"secret", b"KEY")
    assert xor_bytes(ct, b"KEY") == b"secret"


def test_single_byte_xor():
    assert single_byte_xor(single_byte_xor(b"hi", 0x42), 0x42) == b"hi"


def test_letter_frequencies_sums_to_one():
    freqs = letter_frequencies("aabbc")
    assert abs(sum(freqs.values()) - 1.0) < 1e-9
    assert abs(freqs["a"] - 0.4) < 1e-9
    assert letter_frequencies("123 !!!") == {}
