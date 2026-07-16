import os

from quantumbreach.rooms.answers import check_answer
from quantumbreach.rooms.loader import load_path, load_room

CONTENT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "content")


def _q(room, task_id, qid):
    from quantumbreach.rooms.loader import find_question
    return find_question(room, task_id, qid)


def test_symmetric_path_has_four_rooms():
    path = load_path("symmetric", CONTENT)
    assert path.room_ids == ["the-shift", "brute-force", "frequency-analysis", "xor-otp"]
    for rid in path.room_ids:
        load_room(rid, CONTENT)  # must parse without error


def test_known_answers_validate():
    cases = [
        ("the-shift", "solve", "plaintext", "hello world"),
        ("the-shift", "solve", "key", "25"),
        ("brute-force", "crack", "secret", "QUANTUM"),
        ("frequency-analysis", "analyse", "password", "entropy"),
        ("xor-otp", "recover", "flag", "flag{xor_is_reversible}"),
    ]
    for room_id, task_id, qid, answer in cases:
        room = load_room(room_id, CONTENT)
        q = _q(room, task_id, qid)
        assert q is not None, f"{room_id}/{task_id}/{qid} missing"
        assert check_answer(submitted=answer, stored=q.answer,
                            answer_type=q.answer_type,
                            case_insensitive=q.case_insensitive, trim=q.trim), \
            f"answer for {room_id}/{qid} did not validate"


def test_wrong_answer_rejected():
    room = load_room("brute-force", CONTENT)
    q = _q(room, "crack", "secret")
    assert not check_answer(submitted="classical", stored=q.answer,
                            answer_type=q.answer_type,
                            case_insensitive=q.case_insensitive, trim=q.trim)
