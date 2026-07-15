from quantumbreach.rooms.answers import normalize_answer, hash_answer, check_answer


def test_normalize_trims_and_lowercases():
    assert normalize_answer("  Hello ") == "hello"


def test_normalize_numeric_canonicalizes():
    assert normalize_answer("007", numeric=True) == "7"
    assert normalize_answer(" 3 ", numeric=True) == "3"


def test_hash_is_stable():
    assert hash_answer("Hello") == hash_answer("  hello ")


def test_check_exact():
    stored = hash_answer("photon")
    assert check_answer(submitted="PHOTON", stored=stored, answer_type="exact",
                        case_insensitive=True, trim=True)
    assert not check_answer(submitted="proton", stored=stored, answer_type="exact",
                            case_insensitive=True, trim=True)


def test_check_number():
    stored = hash_answer("3", numeric=True)
    assert check_answer(submitted="3", stored=stored, answer_type="number",
                        case_insensitive=True, trim=True)


def test_check_regex_uses_pattern_not_hash():
    assert check_answer(submitted="flag{abc123}", stored=r"flag\{[a-z0-9]+\}",
                        answer_type="regex", case_insensitive=True, trim=True)
    assert not check_answer(submitted="nope", stored=r"flag\{[a-z0-9]+\}",
                            answer_type="regex", case_insensitive=True, trim=True)


def test_check_regex_case_insensitive_pattern():
    # A mixed-case pattern still matches when case_insensitive is on.
    assert check_answer(submitted="FLAG{ABC}", stored=r"flag\{[A-Z]+\}",
                        answer_type="regex", case_insensitive=True, trim=True)


def test_check_regex_malformed_pattern_returns_false():
    assert not check_answer(submitted="anything", stored="[unclosed",
                            answer_type="regex", case_insensitive=True, trim=True)
