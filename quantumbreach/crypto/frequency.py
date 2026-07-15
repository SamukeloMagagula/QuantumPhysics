def letter_frequencies(text: str) -> dict[str, float]:
    counts: dict[str, int] = {}
    total = 0
    for ch in text.lower():
        if "a" <= ch <= "z":
            counts[ch] = counts.get(ch, 0) + 1
            total += 1
    if total == 0:
        return {}
    return {ch: n / total for ch, n in counts.items()}
