"""Generator kinds, version 1, whose output is not a single number (C25.2): moving, sorting, choosing and ordering.

    COUNT_OUT      OBJECT_MOVE DISTRIBUTE  target{2-10}, extras[2, 3], objects[...]       target, extra, object
    SHARE_EQUALLY  OBJECT_MOVE DISTRIBUTE  totals[4, 6, 8, 10, 12], groups[2, 3], objects  total, groups, object
    ODD_EVEN_SORT  OBJECT_MOVE SORT        values{0-100}                                   six values (ascending)
    PICK_EXTREME   MULTIPLE_CHOICE         values{0-100}, asks[LARGEST, SMALLEST]          four values, ask
    ORDER_NUMBERS  ARRANGE SEQUENCE        values{0-100}, count 3-5, directions            values, direction

Sets of values ("four distinct values in a range") are every combination of that many values from the range, in
increasing order (itertools.combinations order). The domain cap (5,000) therefore limits the width of the range: a
template that wants numbers to 100 uses a narrow window such as 30-42.

`objects` are picture IDs from OBJECT_NOUNS: each has a fixed singular and plural noun for the prompt and alt text.
"""

from __future__ import annotations

from collections.abc import Iterator
from itertools import combinations
from typing import Any

from shared.generators.base import (
    Generator,
    Instance,
    Output,
    Params,
    Problem,
    Reader,
    canonical_params,
    choice_options,
    spin,
)

Config = dict[str, Any]

OBJECT_NOUNS: dict[str, tuple[str, str]] = {
    "obj-star": ("star", "stars"),
    "obj-rocket": ("rocket", "rockets"),
    "obj-alien": ("alien", "aliens"),
    "obj-comet": ("comet", "comets"),
    "obj-planet": ("planet", "planets"),
    "obj-moon-rock": ("moon rock", "moon rocks"),
    "obj-alien-egg": ("alien egg", "alien eggs"),
}
OBJECTS = tuple(OBJECT_NOUNS)
SOURCE_MAX = 12  # OBJECT_MOVE sourceCount (C20.1): "never more than 12"
TRAY = {"id": "z1", "label": "Tray", "assetId": "tray"}  # [ASSUMPTION] COUNT_OUT's one zone
SHARE_ZONES = (("z1", "Nova"), ("z2", "Pip"), ("z3", "Juno"))  # the first three astronauts (C2 unlock order)
SORT_BINS = ({"id": "even", "label": "Even"}, {"id": "odd", "label": "Odd"})


def _prepared(reader: Reader, config: Config) -> tuple[Config | None, list[Problem]]:
    problems = reader.finish()
    return (None if problems or any(v is None for v in config.values()) else config), problems


def _article(noun: str) -> str:
    return f"an {noun}" if noun[0] in "aeiou" else f"a {noun}"


# --- COUNT_OUT ------------------------------------------------------------------------------------------------------


def _count_out_prepare(domain: Any) -> tuple[Config | None, list[Problem]]:
    r = Reader(domain)
    config = {
        "target": r.range("target", 2, 10),
        "extras": r.numbers("extras", (2, 3)),
        "objects": r.choices("objects", OBJECTS),
    }
    return _prepared(r, config)


def _count_out_params(c: Config) -> Iterator[Params]:
    lo, hi = c["target"]
    for target in range(lo, hi + 1):
        for extra in c["extras"]:
            for obj in c["objects"]:
                yield {"target": target, "extra": extra, "object": obj}


def _count_out_build(p: Params, c: Config, out: Output) -> Instance | None:
    target, extra, obj = p["target"], p["extra"], p["object"]
    source = target + extra
    if source > SOURCE_MAX:
        return None  # the tray holds target + 2 or 3, never more than 12 (C25.2)
    singular, plural = OBJECT_NOUNS[obj]
    payload = {
        "mode": "DISTRIBUTE",
        "objectAssetId": obj,
        "objectAlt": _article(singular),
        "sourceCount": source,
        "zones": [dict(TRAY)],
        "requireAllPlaced": False,
    }
    return Instance(p, f"Put {target} {plural} on the tray.", payload, (f"z1={target}",), (obj, TRAY["assetId"]))


# --- SHARE_EQUALLY --------------------------------------------------------------------------------------------------


def _share_prepare(domain: Any) -> tuple[Config | None, list[Problem]]:
    r = Reader(domain)
    config = {
        "totals": r.numbers("totals", (4, 6, 8, 10, 12)),
        "groups": r.numbers("groups", (2, 3)),
        "objects": r.choices("objects", OBJECTS),
    }
    return _prepared(r, config)


def _share_params(c: Config) -> Iterator[Params]:
    for total in c["totals"]:
        for groups in c["groups"]:
            for obj in c["objects"]:
                yield {"total": total, "groups": groups, "object": obj}


def _share_build(p: Params, c: Config, out: Output) -> Instance | None:
    total, groups, obj = p["total"], p["groups"], p["object"]
    if total % groups:
        return None  # only where it divides exactly (C25.2)
    singular, plural = OBJECT_NOUNS[obj]
    zones = [{"id": zone_id, "label": label} for zone_id, label in SHARE_ZONES[:groups]]
    payload = {
        "mode": "DISTRIBUTE",
        "objectAssetId": obj,
        "objectAlt": _article(singular),
        "sourceCount": total,
        "zones": zones,
        "requireAllPlaced": True,
    }
    accepted = ";".join(f"{zone['id']}={total // groups}" for zone in zones)
    return Instance(p, f"Share the {plural} fairly.", payload, (accepted,), (obj,))


# --- ODD_EVEN_SORT --------------------------------------------------------------------------------------------------


def _values_prepare(domain: Any, extra: dict[str, Any] | None = None) -> tuple[Reader, Config]:
    r = Reader(domain)
    return r, {"values": r.range("values", 0, 100), **(extra or {})}


def _odd_even_prepare(domain: Any) -> tuple[Config | None, list[Problem]]:
    r, config = _values_prepare(domain)
    return _prepared(r, config)


def _odd_even_params(c: Config) -> Iterator[Params]:
    lo, hi = c["values"]
    for values in combinations(range(lo, hi + 1), 6):
        yield {"values": list(values)}


def _rotated(values: list[int], p: Params) -> list[int]:
    turn = spin(canonical_params(p), len(values))
    return values[turn:] + values[:turn]


def _odd_even_build(p: Params, c: Config, out: Output) -> Instance | None:
    values: list[int] = p["values"]
    odd = sum(v % 2 for v in values)
    if odd < 2 or len(values) - odd < 2:
        return None  # at least two odd and two even (C25.2)
    shown = _rotated(values, p)
    objects = [{"id": f"o{i}", "text": str(v), "alt": str(v)} for i, v in enumerate(shown, start=1)]
    payload = {"mode": "SORT", "objects": objects, "bins": [dict(b) for b in SORT_BINS]}
    answer = ";".join(f"o{i}={'odd' if v % 2 else 'even'}" for i, v in enumerate(shown, start=1))
    return Instance(p, "Sort the numbers into odd and even.", payload, (answer,))


# --- PICK_EXTREME ---------------------------------------------------------------------------------------------------


def _pick_prepare(domain: Any) -> tuple[Config | None, list[Problem]]:
    r, config = _values_prepare(domain)
    config["asks"] = r.choices("asks", ("LARGEST", "SMALLEST"))
    return _prepared(r, config)


def _pick_params(c: Config) -> Iterator[Params]:
    lo, hi = c["values"]
    for values in combinations(range(lo, hi + 1), 4):
        for ask in c["asks"]:
            yield {"values": list(values), "ask": ask}


def _pick_build(p: Params, c: Config, out: Output) -> Instance | None:
    values: list[int] = p["values"]
    largest = p["ask"] == "LARGEST"
    shown = _rotated(values, p)
    options = choice_options([str(v) for v in shown])
    answer = shown.index(max(values) if largest else min(values))
    prompt = "Which number is the largest?" if largest else "Which number is the smallest?"
    payload = {"optionStyle": "NUMERAL", "options": options}
    return Instance(p, prompt, payload, (options[answer]["id"],))


# --- ORDER_NUMBERS --------------------------------------------------------------------------------------------------


def _order_prepare(domain: Any) -> tuple[Config | None, list[Problem]]:
    r, config = _values_prepare(domain)
    config["count"] = r.number("count", 3, 5)
    config["directions"] = r.choices("directions", ("ASCENDING", "DESCENDING"))
    return _prepared(r, config)


def _order_params(c: Config) -> Iterator[Params]:
    lo, hi = c["values"]
    for values in combinations(range(lo, hi + 1), c["count"]):
        for direction in c["directions"]:
            yield {"values": list(values), "direction": direction}


def _order_build(p: Params, c: Config, out: Output) -> Instance | None:
    values: list[int] = p["values"]
    ascending = p["direction"] == "ASCENDING"
    # Stored order: increasing order turned by one place, which is never increasing or decreasing for three or more
    # tiles (the publish rule `shuffle_spells_answer`). The run shows its own seeded tile order (C24.4 step 7).
    stored = values[1:] + values[:1]
    tiles = [{"id": f"t{i}", "value": str(v), "text": str(v)} for i, v in enumerate(stored, start=1)]
    label = "smallest first" if ascending else "largest first"
    payload = {"mode": "SEQUENCE", "tiles": tiles, "slots": len(tiles), "orderLabel": label}
    answer = ",".join(str(v) for v in (values if ascending else values[::-1]))
    return Instance(p, f"Put the numbers in order, {label}.", payload, (answer,))


GENERATORS = (
    Generator("COUNT_OUT", 1, ("OBJECT_MOVE",), _count_out_prepare, _count_out_params, _count_out_build),
    Generator("SHARE_EQUALLY", 1, ("OBJECT_MOVE",), _share_prepare, _share_params, _share_build),
    Generator("ODD_EVEN_SORT", 1, ("OBJECT_MOVE",), _odd_even_prepare, _odd_even_params, _odd_even_build),
    Generator("PICK_EXTREME", 1, ("MULTIPLE_CHOICE",), _pick_prepare, _pick_params, _pick_build),
    Generator("ORDER_NUMBERS", 1, ("ARRANGE",), _order_prepare, _order_params, _order_build),
)
