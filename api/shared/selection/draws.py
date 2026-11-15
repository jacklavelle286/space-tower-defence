"""Deterministic draws for selection (C24.5).

    draw(seed, label, i)       = first 8 bytes of SHA-256("<seed>|<label>|<i>") as an unsigned integer
    shuffle(list, seed, label) = Fisher-Yates choosing index draw(seed, label, i) mod (i + 1)

Each decision has its own label, so adding a decision later leaves the others unchanged, and the answer is the same on
every Python version (unlike `random`, whose algorithms may change between versions).
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence


def draw(seed: str, label: str, i: int) -> int:
    digest = hashlib.sha256(f"{seed}|{label}|{i}".encode()).digest()
    return int.from_bytes(digest[:8], "big")


def shuffle[T](items: Sequence[T], seed: str, label: str) -> list[T]:
    """A new list: `items` in the order the seed and label decide."""
    out = list(items)
    for i in range(len(out) - 1, 0, -1):
        j = draw(seed, label, i) % (i + 1)
        out[i], out[j] = out[j], out[i]
    return out
