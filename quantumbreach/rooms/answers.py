import hashlib
import re

VALID_TYPES = {"exact", "number", "flag", "regex"}


def normalize_answer(raw, *, case_insensitive=True, trim=True, numeric=False) -> str:
    s = str(raw)
    if trim:
        s = s.strip()
    if numeric:
        try:
            f = float(s)
            return str(int(f)) if f.is_integer() else str(f)
        except ValueError:
            return s
    if case_insensitive:
        s = s.lower()
    return s


def hash_answer(raw, *, case_insensitive=True, trim=True, numeric=False) -> str:
    norm = normalize_answer(raw, case_insensitive=case_insensitive, trim=trim, numeric=numeric)
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()


def check_answer(*, submitted, stored, answer_type, case_insensitive, trim) -> bool:
    if answer_type == "regex":
        norm = normalize_answer(submitted, case_insensitive=case_insensitive, trim=trim)
        try:
            return re.fullmatch(stored, norm) is not None
        except re.error:
            return False
    numeric = answer_type == "number"
    return hash_answer(submitted, case_insensitive=case_insensitive,
                       trim=trim, numeric=numeric) == stored
