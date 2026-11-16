"""Number-fact generator kinds, version 1 (C25.2). Each answers with one whole number, so each can be shown as a
NUMBER_SELECT, a TYPED NUMERIC or a MULTIPLE_CHOICE activity (base.numeric). NUMBER_WORD's numeral-to-word direction
is choice only.

Every kind lists its `domain` fields below. Ranges are `{min, max}` (both included); lists name the values the
template uses, from the allowed set. Parameters are enumerated in the order written ("outer, ..., inner"), and that
order is part of the version: it decides which instance has which index.

    ONE_MORE_LESS   range{0-100}, changes[1, -1, 10, -10]                        n, change
    BOND_TO         totals[5, 10, 20, 100], part{0-100}, forms[4]                total, part, form
    ADD_WITHIN      a{0-100}, b{0-100}, max 1-100, crossTen ANY|ONLY|NEVER, shape PAIR|TENS|THREE   a, b (, c)
    SUB_WITHIN      a{0-100}, b{0-100}, crossTen ANY|ONLY|NEVER, shape PAIR|TENS                     a, b
    MISSING_NUMBER  max 1-100, parts{0-100}, forms[6]                            x, y, form  (x + y = s)
    DOUBLE_HALVE    n{0-100}, ops[DOUBLE, HALVE]                                 n, op
    SKIP_COUNT      steps[2, 3, 5, 10], start{0-100}, directions, asks[NEXT, GAP], terms 4-5, max 1-100
    SEQUENCE_GAP    start{0-100}, directions, terms 4-5                          start, direction, hide
    NUMBER_WORD     n{0-100}, directions[WORD_TO_NUMERAL, NUMERAL_TO_WORD]       n, direction
    PLACE_VALUE     n{10-99}, asks[TENS, ONES, NUMBER]                           n, ask
    TIMES_TABLE     tables[2, 5, 10], multiplier{1-12}, forms[4]                 table, multiplier, form
    COUNT_OBJECTS   count{1-6}, arrangements[DICE]                               count, arrangement

Defaults: crossTen ANY, shape PAIR, terms 4. Bounds marked [ASSUMPTION] are not in C25.2 (it gives the idea, not
every limit); the C19 examples all fit inside them.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from shared.generators.base import (
    DIVIDE,
    MINUS,
    NUMERIC_OUTPUTS,
    TIMES,
    Generator,
    Instance,
    Output,
    Params,
    Problem,
    Reader,
    numeric,
)
from shared.generators.words import number_word

Config = dict[str, Any]
DIRECTIONS = ("FORWARDS", "BACKWARDS")


def _prepared(reader: Reader, config: Config) -> tuple[Config | None, list[Problem]]:
    problems = reader.finish()
    return (None if problems or any(v is None for v in config.values()) else config), problems


# --- ONE_MORE_LESS --------------------------------------------------------------------------------------------------

CHANGE_WORDS = {1: "one more than", -1: "one less than", 10: "ten more than", -10: "ten less than"}


def _oml_prepare(domain: Any) -> tuple[Config | None, list[Problem]]:
    r = Reader(domain)
    return _prepared(r, {"range": r.range("range", 0, 100), "changes": r.numbers("changes", (1, -1, 10, -10))})


def _oml_params(c: Config) -> Iterator[Params]:
    lo, hi = c["range"]
    for n in range(lo, hi + 1):
        for change in c["changes"]:
            yield {"n": n, "change": change}


def _oml_build(p: Params, c: Config, out: Output) -> Instance | None:
    lo, hi = c["range"]
    n, change = p["n"], p["change"]
    answer = n + change
    if not lo <= answer <= hi:
        return None  # the result stays in range (C25.2)
    return numeric(p, f"What is {CHANGE_WORDS[change]} {n}?", answer, out, low=lo, high=hi, others=(n,))


# --- BOND_TO --------------------------------------------------------------------------------------------------------

BOND_FORMS = ("a + ? = T", "? + a = T", "T - a = ?", "T - ? = a")


def _bond_prepare(domain: Any) -> tuple[Config | None, list[Problem]]:
    r = Reader(domain)
    config = {
        "totals": r.numbers("totals", (5, 10, 20, 100)),
        "part": r.range("part", 0, 100),
        "forms": r.choices("forms", BOND_FORMS),
    }
    return _prepared(r, config)


def _bond_params(c: Config) -> Iterator[Params]:
    lo, hi = c["part"]
    for total in c["totals"]:
        for part in range(lo, hi + 1):
            for form in c["forms"]:
                yield {"total": total, "part": part, "form": form}


def _bond_build(p: Params, c: Config, out: Output) -> Instance | None:
    total, part, form = p["total"], p["part"], p["form"]
    if part > total or (total == 100 and part % 10):
        return None  # a part of 100 is a whole number of tens (C25.2)
    text = form.replace("T", str(total)).replace("a", str(part)).replace("-", MINUS)
    return numeric(p, text, total - part, out, low=0, high=total, others=(part, total))


# --- ADD_WITHIN and SUB_WITHIN -------------------------------------------------------------------------------------

CROSS_TEN = ("ANY", "ONLY", "NEVER")


def _choice(r: Reader, name: str, allowed: tuple[str, ...], default: str) -> str | None:
    """One value of `allowed` (not a list), or `default` when the field is left out."""
    raw = r._get(name, False)
    if raw is None:
        return default
    if not (isinstance(raw, str) and raw in allowed):
        r.fail(name, "enum")
        return None
    return raw


def _crosses(ones_a: int, ones_b: int, adding: bool) -> bool:
    return ones_a + ones_b >= 10 if adding else ones_a < ones_b


def _cross_ok(rule: str, crosses: bool) -> bool:
    return rule == "ANY" or (rule == "ONLY") == crosses


def _add_prepare(domain: Any) -> tuple[Config | None, list[Problem]]:
    r = Reader(domain)
    shape = _choice(r, "shape", ("PAIR", "TENS", "THREE"), "PAIR")
    config: Config = {
        "shape": shape,
        "a": r.range("a", 0, 100),
        "max": r.number("max", 1, 100),
        "crossTen": _choice(r, "crossTen", CROSS_TEN, "ANY"),
    }
    if shape != "THREE":
        config["b"] = r.range("b", 0, 100)
    elif config["crossTen"] not in (None, "ANY"):
        r.fail("crossTen", "shape_three")  # three one-digit numbers: crossing ten is not a choice [ASSUMPTION]
    elif config["a"] is not None and config["a"][1] > 9:
        r.fail("a", "shape_three")  # three ONE-DIGIT numbers
    return _prepared(r, config)


def _add_params(c: Config) -> Iterator[Params]:
    a_lo, a_hi = c["a"]
    if c["shape"] == "THREE":
        for a in range(a_lo, a_hi + 1):
            for b in range(a_lo, a_hi + 1):
                for d in range(a_lo, a_hi + 1):
                    yield {"a": a, "b": b, "c": d}
        return
    b_lo, b_hi = c["b"]
    for a in range(a_lo, a_hi + 1):
        for b in range(b_lo, b_hi + 1):
            yield {"a": a, "b": b}


def _add_build(p: Params, c: Config, out: Output) -> Instance | None:
    if c["shape"] == "THREE":
        a, b, d = p["a"], p["b"], p["c"]
        total = a + b + d
        if total > c["max"]:
            return None
        return numeric(p, f"{a} + {b} + {d} = ?", total, out, low=0, high=c["max"], others=(a + b, b + d))
    a, b = p["a"], p["b"]
    if a + b > c["max"] or (c["shape"] == "TENS" and b % 10):
        return None
    if not _cross_ok(c["crossTen"], _crosses(a % 10, b % 10, True)):
        return None
    return numeric(p, f"{a} + {b} = ?", a + b, out, low=0, high=c["max"], others=(a, b))


def _sub_prepare(domain: Any) -> tuple[Config | None, list[Problem]]:
    r = Reader(domain)
    config = {
        "shape": _choice(r, "shape", ("PAIR", "TENS"), "PAIR"),
        "a": r.range("a", 0, 100),
        "b": r.range("b", 0, 100),
        "crossTen": _choice(r, "crossTen", CROSS_TEN, "ANY"),
    }
    return _prepared(r, config)


def _sub_build(p: Params, c: Config, out: Output) -> Instance | None:
    a, b = p["a"], p["b"]
    if b > a or (c["shape"] == "TENS" and b % 10):
        return None  # b <= a: never negative (C25.2, C25.3)
    if not _cross_ok(c["crossTen"], _crosses(a % 10, b % 10, False)):
        return None
    return numeric(p, f"{a} {MINUS} {b} = ?", a - b, out, low=0, high=c["a"][1], others=(a, b))


# --- MISSING_NUMBER -------------------------------------------------------------------------------------------------

# Each form is one way of writing x + y = s with one number hidden; "c = ? - b" is C25.2's "a = ? - b".
MISSING_FORMS = ("a + ? = c", "? + b = c", "c = a + ?", "a - ? = c", "? - b = c", "c = ? - b")


def _missing_prepare(domain: Any) -> tuple[Config | None, list[Problem]]:
    r = Reader(domain)
    config = {
        "max": r.number("max", 1, 100),
        "parts": r.range("parts", 0, 100),
        "forms": r.choices("forms", MISSING_FORMS),
    }
    return _prepared(r, config)


def _missing_params(c: Config) -> Iterator[Params]:
    lo, hi = c["parts"]
    for x in range(lo, hi + 1):
        for y in range(lo, hi + 1):
            for form in c["forms"]:
                yield {"x": x, "y": y, "form": form}


def _missing_build(p: Params, c: Config, out: Output) -> Instance | None:
    x, y, form = p["x"], p["y"], p["form"]
    s = x + y
    if s > c["max"]:
        return None
    text, answer = {
        "a + ? = c": (f"{x} + ? = {s}", y),
        "? + b = c": (f"? + {y} = {s}", x),
        "c = a + ?": (f"{s} = {x} + ?", y),
        "a - ? = c": (f"{s} {MINUS} ? = {x}", y),
        "? - b = c": (f"? {MINUS} {y} = {x}", s),
        "c = ? - b": (f"{x} = ? {MINUS} {y}", s),
    }[form]
    return numeric(p, text, answer, out, low=0, high=c["max"], others=(x, y, s))


# --- DOUBLE_HALVE ---------------------------------------------------------------------------------------------------


def _dh_prepare(domain: Any) -> tuple[Config | None, list[Problem]]:
    r = Reader(domain)
    return _prepared(r, {"n": r.range("n", 0, 100), "ops": r.choices("ops", ("DOUBLE", "HALVE"))})


def _dh_params(c: Config) -> Iterator[Params]:
    lo, hi = c["n"]
    for n in range(lo, hi + 1):
        for op in c["ops"]:
            yield {"n": n, "op": op}


def _dh_build(p: Params, c: Config, out: Output) -> Instance | None:
    n, op = p["n"], p["op"]
    high = max(2 * c["n"][1], c["n"][1])
    if op == "DOUBLE":
        return numeric(p, f"What is double {n}?", 2 * n, out, low=0, high=high, others=(n,))
    if n % 2:
        return None  # halve an even number only (C25.2)
    return numeric(p, f"What is half of {n}?", n // 2, out, low=0, high=high, others=(n,))


# --- SKIP_COUNT and SEQUENCE_GAP ------------------------------------------------------------------------------------


def _skip_prepare(domain: Any) -> tuple[Config | None, list[Problem]]:
    r = Reader(domain)
    config = {
        "steps": r.numbers("steps", (2, 3, 5, 10)),
        "start": r.range("start", 0, 100),
        "directions": r.choices("directions", DIRECTIONS),
        "asks": r.choices("asks", ("NEXT", "GAP")),
        "terms": r.number("terms", 4, 5, 4),
        "max": r.number("max", 1, 100),
    }
    return _prepared(r, config)


def _hidden(asks: list[str], terms: int) -> list[int]:
    """Which term is replaced by "?": the last one for NEXT; each one between the first and the last for GAP."""
    out: list[int] = []
    if "GAP" in asks:
        out += list(range(1, terms - 1))
    if "NEXT" in asks:
        out.append(terms - 1)
    return out


def _skip_params(c: Config) -> Iterator[Params]:
    lo, hi = c["start"]
    for step in c["steps"]:
        for start in range(lo, hi + 1):
            for direction in c["directions"]:
                for hide in _hidden(c["asks"], c["terms"]):
                    yield {"step": step, "start": start, "direction": direction, "hide": hide}


def _sequence(p: Params, c: Config, out: Output, step: int, high: int) -> Instance | None:
    sign = 1 if p["direction"] == "FORWARDS" else -1
    terms = [p["start"] + sign * step * i for i in range(c["terms"])]
    if any(not 0 <= t <= high for t in terms):
        return None  # every term in 0..max: never negative (C25.3)
    hide = p["hide"]
    shown = ", ".join("?" if i == hide else str(t) for i, t in enumerate(terms))
    stem = "What comes next?" if hide == c["terms"] - 1 else "What is missing?"
    answer = terms[hide]
    return numeric(p, f"{stem} {shown}", answer, out, low=0, high=high, others=(answer + step, answer - step))


def _skip_build(p: Params, c: Config, out: Output) -> Instance | None:
    return _sequence(p, c, out, p["step"], c["max"])


def _gap_prepare(domain: Any) -> tuple[Config | None, list[Problem]]:
    r = Reader(domain)
    config = {
        "start": r.range("start", 0, 100),
        "directions": r.choices("directions", DIRECTIONS),
        "terms": r.number("terms", 4, 5, 4),
    }
    return _prepared(r, config)


def _gap_params(c: Config) -> Iterator[Params]:
    lo, hi = c["start"]
    for start in range(lo, hi + 1):
        for direction in c["directions"]:
            for hide in range(1, c["terms"]):  # any term but the first
                yield {"start": start, "direction": direction, "hide": hide}


def _gap_build(p: Params, c: Config, out: Output) -> Instance | None:
    return _sequence(p, c, out, 1, 100)


# --- NUMBER_WORD ----------------------------------------------------------------------------------------------------


def _word_prepare(domain: Any) -> tuple[Config | None, list[Problem]]:
    r = Reader(domain)
    config = {
        "n": r.range("n", 0, 100),
        "directions": r.choices("directions", ("WORD_TO_NUMERAL", "NUMERAL_TO_WORD")),
    }
    return _prepared(r, config)


def _word_output(c: Config, out: Output) -> str | None:
    """A word answer can only be chosen: NUMERAL_TO_WORD needs MULTIPLE_CHOICE (TYPED here is numeric only)."""
    if "NUMERAL_TO_WORD" in c["directions"] and out.interaction_type != "MULTIPLE_CHOICE":
        return "generator_output"
    return None


def _word_params(c: Config) -> Iterator[Params]:
    lo, hi = c["n"]
    for n in range(lo, hi + 1):
        for direction in c["directions"]:
            yield {"n": n, "direction": direction}


def _word_build(p: Params, c: Config, out: Output) -> Instance | None:
    n = p["n"]
    others = (n + 20, n - 20)  # the neighbouring tens word ("sixty-four", "forty-four") [ASSUMPTION]
    if p["direction"] == "WORD_TO_NUMERAL":
        return numeric(p, f"Which number is {number_word(n)}?", n, out, low=0, high=100, others=others)
    return numeric(
        p, f"Which word means {n}?", n, out, low=0, high=100, others=others, show=number_word, option_style="WORD"
    )


# --- PLACE_VALUE ----------------------------------------------------------------------------------------------------


def _units(n: int, unit: str) -> str:
    return f"{n} {unit}" if n == 1 else f"{n} {unit}s"


def _pv_prepare(domain: Any) -> tuple[Config | None, list[Problem]]:
    r = Reader(domain)
    return _prepared(r, {"n": r.range("n", 10, 99), "asks": r.choices("asks", ("TENS", "ONES", "NUMBER"))})


def _pv_params(c: Config) -> Iterator[Params]:
    lo, hi = c["n"]
    for n in range(lo, hi + 1):
        for ask in c["asks"]:
            yield {"n": n, "ask": ask}


def _pv_build(p: Params, c: Config, out: Output) -> Instance | None:
    n, ask = p["n"], p["ask"]
    tens, ones = divmod(n, 10)
    if ask == "TENS":
        return numeric(p, f"How many tens are in {n}?", tens, out, low=0, high=9, others=(ones,))
    if ask == "ONES":
        return numeric(p, f"How many ones are in {n}?", ones, out, low=0, high=9, others=(tens,))
    text = f"Which number has {_units(tens, 'ten')} and {_units(ones, 'one')}?"
    return numeric(p, text, n, out, low=10, high=99, others=(ones * 10 + tens, tens + ones))


# --- TIMES_TABLE ----------------------------------------------------------------------------------------------------

TIMES_FORMS = ("m x t = ?", "t x m = ?", "p / t = ?", "? x t = p")  # t table, m multiplier, p product


def _tt_prepare(domain: Any) -> tuple[Config | None, list[Problem]]:
    r = Reader(domain)
    config = {
        "tables": r.numbers("tables", (2, 5, 10)),
        "multiplier": r.range("multiplier", 1, 12),
        "forms": r.choices("forms", TIMES_FORMS),
    }
    return _prepared(r, config)


def _tt_params(c: Config) -> Iterator[Params]:
    lo, hi = c["multiplier"]
    for table in c["tables"]:
        for m in range(lo, hi + 1):
            for form in c["forms"]:
                yield {"table": table, "multiplier": m, "form": form}


def _tt_build(p: Params, c: Config, out: Output) -> Instance | None:
    t, m, form = p["table"], p["multiplier"], p["form"]
    product = t * m
    if form == "m x t = ?":
        return numeric(p, f"{m} {TIMES} {t} = ?", product, out, low=0, high=12 * t, others=(product + t, product - t))
    if form == "t x m = ?":
        return numeric(p, f"{t} {TIMES} {m} = ?", product, out, low=0, high=12 * t, others=(product + t, product - t))
    if form == "p / t = ?":
        return numeric(p, f"{product} {DIVIDE} {t} = ?", m, out, low=0, high=12, others=(t,))
    return numeric(p, f"? {TIMES} {t} = {product}", m, out, low=0, high=12, others=(t,))


# --- COUNT_OBJECTS --------------------------------------------------------------------------------------------------

# Version 1 draws dice faces only: the single pictures dice-1 ... dice-6 that the learning panel can already show as a
# question picture. Scatter, row and ten-frame arrangements of 1-20 objects need a picture of several objects, which
# the panel cannot draw yet (deferred: a later version, with a panel change).
ARRANGEMENTS = ("DICE",)


def _count_prepare(domain: Any) -> tuple[Config | None, list[Problem]]:
    r = Reader(domain)
    return _prepared(r, {"count": r.range("count", 1, 6), "arrangements": r.choices("arrangements", ARRANGEMENTS)})


def _count_params(c: Config) -> Iterator[Params]:
    lo, hi = c["count"]
    for count in range(lo, hi + 1):
        for arrangement in c["arrangements"]:
            yield {"count": count, "arrangement": arrangement}


def _count_build(p: Params, c: Config, out: Output) -> Instance | None:
    stimulus = {"assetId": f"dice-{p['count']}", "alt": "dots on a dice"}
    return numeric(p, "How many dots?", p["count"], out, low=1, high=10, stimulus=stimulus)


def _numeric(kind: str, prepare: Any, params: Any, build: Any, **extra: Any) -> Generator:
    return Generator(kind, 1, NUMERIC_OUTPUTS, prepare, params, build, **extra)


GENERATORS = (
    _numeric("ONE_MORE_LESS", _oml_prepare, _oml_params, _oml_build),
    _numeric("BOND_TO", _bond_prepare, _bond_params, _bond_build),
    _numeric("ADD_WITHIN", _add_prepare, _add_params, _add_build),
    _numeric("SUB_WITHIN", _sub_prepare, _add_params, _sub_build),
    _numeric("MISSING_NUMBER", _missing_prepare, _missing_params, _missing_build),
    _numeric("DOUBLE_HALVE", _dh_prepare, _dh_params, _dh_build),
    _numeric("SKIP_COUNT", _skip_prepare, _skip_params, _skip_build),
    _numeric("SEQUENCE_GAP", _gap_prepare, _gap_params, _gap_build),
    _numeric("NUMBER_WORD", _word_prepare, _word_params, _word_build, output_rule=_word_output),
    _numeric("PLACE_VALUE", _pv_prepare, _pv_params, _pv_build),
    _numeric("TIMES_TABLE", _tt_prepare, _tt_params, _tt_build),
    _numeric("COUNT_OBJECTS", _count_prepare, _count_params, _count_build),
)
