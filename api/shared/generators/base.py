"""What every generator kind shares (C25.1-C25.3): the domain reader, the output settings, the instance, and the helper
that turns "a question whose answer is one whole number" into any of the three numeric interaction types.

Nothing here does I/O. Every function returns the same value for the same arguments on every Python version: there is
no `random`, no clock, no set iteration order in any output (sets are only used for membership tests), and the one
place a choice looks random (`spin`) is a SHA-256 of the parameters.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

Problem = dict[str, str]
Params = dict[str, Any]

DOMAIN_PREFIX = "template.domain"
PRESENTATION_PREFIX = "template.presentation"
MINUS, TIMES, DIVIDE = "\u2212", "\u00d7", "\u00f7"  # shown in prompts; domain form strings use - x /

# The interaction types a numeric answer can be given in (C20.1), and what each needs from `presentation`.
NUMERIC_OUTPUTS = ("NUMBER_SELECT", "TYPED", "MULTIPLE_CHOICE")
TYPED_MAX_LENGTH_DEFAULT = 3  # [ASSUMPTION] the keypad takes up to three digits unless the template says fewer
CHOICE_DISTRACTORS = 3  # four options in all (C20.1, D-8)


def problem(name: str, rule: str) -> Problem:
    return {"field": name, "rule": rule}


def as_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, Decimal) and value == value.to_integral_value():
        return int(value)
    return None


def canonical_params(params: Mapping[str, Any]) -> str:
    """The one string form of an instance's parameters: its identity within a run (C24.4 rule 4)."""
    return json.dumps(dict(params), sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def spin(key: str, n: int) -> int:
    """A stable number in 0..n-1 from `key` (first 8 bytes of SHA-256), for choices that must not follow a pattern."""
    return int.from_bytes(hashlib.sha256(key.encode()).digest()[:8], "big") % n


# --- Reading a domain -----------------------------------------------------------------------------------------------


class Reader:
    """Reads a template's `domain` (or `presentation`) object field by field, collecting `{field, rule}` problems.

    Each method returns the value when it is well formed and None (with a problem recorded) when it is not. `finish`
    reports every key that no method asked for (rule additionalProperties), as the rest of the definition does."""

    def __init__(self, doc: Any, prefix: str = DOMAIN_PREFIX) -> None:
        self.prefix = prefix
        self.problems: list[Problem] = []
        self.asked: list[str] = []
        if not isinstance(doc, Mapping):
            self.problems.append(problem(prefix, "type"))
            doc = {}
        self.doc: Mapping[str, Any] = doc

    def _get(self, name: str, required: bool) -> Any:
        self.asked.append(name)
        if name not in self.doc:
            if required:
                self.problems.append(problem(f"{self.prefix}.{name}", "required"))
            return None
        return self.doc[name]

    def fail(self, name: str, rule: str) -> None:
        self.problems.append(problem(f"{self.prefix}.{name}" if name else self.prefix, rule))

    def range(self, name: str, low: int, high: int) -> tuple[int, int] | None:
        """`{min, max}`: whole numbers with low <= min <= max <= high."""
        raw = self._get(name, True)
        if raw is None:
            return None
        if not (isinstance(raw, Mapping) and set(raw) == {"min", "max"}):
            self.fail(name, "shape")
            return None
        lo, hi = as_int(raw["min"]), as_int(raw["max"])
        if lo is None or hi is None or not low <= lo <= hi <= high:
            self.fail(name, "range")
            return None
        return lo, hi

    def number(self, name: str, low: int, high: int, default: int | None = None) -> int | None:
        raw = self._get(name, default is None)
        if raw is None:
            return default
        value = as_int(raw)
        if value is None or not low <= value <= high:
            self.fail(name, "range")
            return None
        return value

    def numbers(self, name: str, allowed: Sequence[int]) -> list[int] | None:
        """A non-empty list of distinct whole numbers, each one of `allowed`; returned in `allowed` order."""
        raw = self._get(name, True)
        if raw is None:
            return None
        values = [as_int(v) for v in raw] if isinstance(raw, list) else None
        if not values or any(v not in allowed for v in values) or len(set(values)) != len(values):
            self.fail(name, "enum")
            return None
        return [v for v in allowed if v in values]

    def choices(self, name: str, allowed: Sequence[str], default: Sequence[str] | None = None) -> list[str] | None:
        """A non-empty list of distinct strings, each one of `allowed`; returned in `allowed` order."""
        raw = self._get(name, default is None)
        if raw is None:
            return None if default is None else list(default)
        if not (isinstance(raw, list) and raw and all(isinstance(v, str) and v in allowed for v in raw)):
            self.fail(name, "enum")
            return None
        if len(set(raw)) != len(raw):
            self.fail(name, "duplicate")
            return None
        return [v for v in allowed if v in raw]

    def finish(self) -> list[Problem]:
        for name in self.doc:
            if name not in self.asked:
                self.problems.append(problem(f"{self.prefix}.{name}", "additionalProperties"))
        return self.problems


# --- Output settings ------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Output:
    """How instances are shown: the activity's interaction type (identity-level) and the template's `presentation`."""

    interaction_type: str
    number_set: Mapping[str, Any] | None = None  # NUMBER_SELECT
    display: str | None = None  # NUMBER_SELECT
    max_length: int = TYPED_MAX_LENGTH_DEFAULT  # TYPED NUMERIC


def read_output(interaction_type: str, presentation: Any) -> tuple[Output | None, list[Problem]]:
    """`presentation` for `interaction_type`: NUMBER_SELECT needs `numberSet` and `display` (the number track or
    hundred square every instance is answered on; C25.5 worked record); TYPED may set `maxLength` (1-3, default 3);
    the other types take nothing. The values themselves are checked per instance by the per-type payload check."""
    reader = Reader({} if presentation is None else presentation, PRESENTATION_PREFIX)
    out: Output | None = None
    if interaction_type == "NUMBER_SELECT":
        number_set = reader._get("numberSet", True)
        display = reader._get("display", True)
        if isinstance(number_set, Mapping) and isinstance(display, str):
            out = Output(interaction_type, number_set=dict(number_set), display=display)
        elif number_set is not None and display is not None:
            reader.fail("numberSet" if not isinstance(number_set, Mapping) else "display", "type")
    elif interaction_type == "TYPED":
        max_length = reader.number("maxLength", 1, 3, TYPED_MAX_LENGTH_DEFAULT)
        if max_length is not None:
            out = Output(interaction_type, max_length=max_length)
    else:
        out = Output(interaction_type)
    problems = reader.finish()
    return (out if not problems else None), problems


# --- Instances ------------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Instance:
    """One generated activity: what a FIXED activity's version would hold for the same question (C25.1)."""

    params: Params
    prompt: str
    payload: dict[str, Any]
    accepted: tuple[str, ...]
    assets: tuple[str, ...] = field(default_factory=tuple)

    def resolved(self, kind: str, version: int) -> dict[str, Any]:
        """The slot's `resolved` snapshot (spine S3.3): parameters, prompt, payload and canonical accepted answers."""
        return {
            "generatorKind": kind,
            "generatorVersion": version,
            "params": dict(self.params),
            "prompt": {"text": self.prompt},
            "activityPayload": self.payload,
            "answerSpecification": {"accepted": list(self.accepted)},
            "visualAssetReferences": list(self.assets),
        }


def reversed_digits(n: int) -> int | None:
    text = str(n)
    return int(text[::-1]) if len(text) == 2 and text[1] != "0" else None


def near_misses(answer: int, others: Iterable[int] = ()) -> list[int]:
    """C25.2's fixed near-miss list, in order: answer +/- 1, +/- 2, +/- 10, digits reversed, the other operand(s)."""
    out = [answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, answer - 10]
    flipped = reversed_digits(answer)
    if flipped is not None:
        out.append(flipped)
    out.extend(others)
    return out


def distractors(answer: int, candidates: Iterable[int], low: int, high: int, key: str) -> list[int] | None:
    """Three wrong options from `candidates`: de-duplicated, kept in low..high, never the answer (C25.2). Which three
    of the usable ones is chosen by `spin(key)`, so the answer is not always in the same place among the sorted
    options. None when fewer than three are usable: that instance is removed from the domain."""
    usable: list[int] = []
    for value in candidates:
        if low <= value <= high and value != answer and value not in usable:
            usable.append(value)
    if len(usable) < CHOICE_DISTRACTORS:
        return None
    start = spin(key, len(usable))
    return [usable[(start + i) % len(usable)] for i in range(CHOICE_DISTRACTORS)]


def choice_options(texts: Sequence[str]) -> list[dict[str, str]]:
    return [{"id": "abcdef"[i], "text": text} for i, text in enumerate(texts)]


def numeric(
    params: Params,
    prompt: str,
    answer: int,
    out: Output,
    *,
    low: int,
    high: int,
    others: Iterable[int] = (),
    stimulus: Mapping[str, str] | None = None,
    show: Callable[[int], str] = str,
    option_style: str = "NUMERAL",
) -> Instance | None:
    """A question whose answer is the whole number `answer`, in the activity's numeric interaction type:

        NUMBER_SELECT    the template's number set and display; accepted [answer]
        TYPED            NUMERIC with the template's maxLength; accepted [answer]
        MULTIPLE_CHOICE  the answer and three near misses (in low..high), shown by `show` (numerals by default),
                         options in increasing order with IDs a-d; accepted [the answer's ID]

    The answer is already canonical (a decimal integer, no sign, no leading zero; C20.1). Whether it fits the number
    set or maxLength is the per-type check's job at publish (content.template_report)."""
    if answer < 0:
        return None
    assets = (stimulus["assetId"],) if stimulus is not None else ()
    extra: dict[str, Any] = {"stimulus": dict(stimulus)} if stimulus is not None else {}
    if out.interaction_type == "NUMBER_SELECT":
        payload = {"numberSet": dict(out.number_set or {}), "display": out.display, **extra}
        return Instance(params, prompt, payload, (str(answer),), assets)
    if out.interaction_type == "TYPED":
        payload = {"mode": "NUMERIC", "maxLength": out.max_length, **extra}
        return Instance(params, prompt, payload, (str(answer),), assets)
    if out.interaction_type == "MULTIPLE_CHOICE":
        wrong = distractors(answer, near_misses(answer, others), low, high, canonical_params(params))
        if wrong is None:
            return None
        values = sorted([answer, *wrong])
        options = choice_options([show(v) for v in values])
        payload = {"optionStyle": option_style, "options": options, **extra}
        return Instance(params, prompt, payload, (options[values.index(answer)]["id"],), assets)
    return None


# --- The generator record -------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Generator:
    """One `(kind, version)`. Once released its output never changes; new behaviour is a new version (C25.1).

    prepare(domain)              -> (config, problems): the domain's bounds checked and normalised
    params(config)               -> every parameter combination, in one fixed order (the raw domain)
    build(params, config, out)   -> the instance, or None when that combination is removed from the domain (C25.2:
                                    a result out of range, no three distractors, ...)
    """

    kind: str
    version: int
    outputs: tuple[str, ...]
    prepare: Callable[[Any], tuple[Any, list[Problem]]]
    params: Callable[[Any], Iterable[Params]]
    build: Callable[[Params, Any, Output], Instance | None]
    output_rule: Callable[[Any, Output], str | None] = lambda _config, _out: None
