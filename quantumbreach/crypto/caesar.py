def caesar_encrypt(text: str, key: int) -> str:
    k = key % 26
    out = []
    for ch in text:
        o = ord(ch)
        if 65 <= o <= 90:
            out.append(chr((o - 65 + k) % 26 + 65))
        elif 97 <= o <= 122:
            out.append(chr((o - 97 + k) % 26 + 97))
        else:
            out.append(ch)
    return "".join(out)


def caesar_decrypt(text: str, key: int) -> str:
    return caesar_encrypt(text, -key)


def caesar_crack_all(text: str) -> list[tuple[int, str]]:
    return [(k, caesar_decrypt(text, k)) for k in range(1, 26)]
