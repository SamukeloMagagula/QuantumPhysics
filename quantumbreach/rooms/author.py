"""Compute the stored answer hash for a room.yaml question.

Usage:
    python -m quantumbreach.rooms.author "photon"
    python -m quantumbreach.rooms.author --number 25
"""
import sys

from .answers import hash_answer


def main(argv):
    numeric = False
    args = []
    for a in argv:
        if a == "--number":
            numeric = True
        else:
            args.append(a)
    if not args:
        print('Usage: python -m quantumbreach.rooms.author [--number] "<answer>"')
        return 1
    print(hash_answer(args[0], numeric=numeric))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
