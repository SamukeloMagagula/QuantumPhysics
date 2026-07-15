# (threshold, title) sorted ascending; highest threshold <= points wins.
RANKS = [
    (0, "Script Kiddie"),
    (50, "Codebreaker"),
    (120, "Keymaster"),
    (220, "Cipherpunk"),
    (350, "Quantum Operative"),
]


def rank_for_points(points: int) -> str:
    title = RANKS[0][1]
    for threshold, name in RANKS:
        if points >= threshold:
            title = name
    return title
