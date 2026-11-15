"""Per-type checks of an activity step: its payload and its accepted answers (C20.1, C22.2 rule 7; Phase 36, M3-02).

Python checks the SHAPE of canonical answers only (spine S7.2, C20.1): the canonicaliser is the TypeScript one in
web/shared/src/learning/canonical.ts. What is checked here is that every accepted answer is already a canonical string
for its type and lies inside its payload, so a published answer key can always be matched by exact string equality.

The payload of each type, as admin-api accepts it (C20.1, with sources/09 §4.4 for detail C20.1 leaves open):

    MULTIPLE_CHOICE           {optionStyle, options[4-6]{id a-f, text 1-24}, stimulus?}
    PICTURE_SELECT            {options[4-6]{id a-f, assetId, alt 1-60, caption? 1-24}, layout? "GRID", stimulus?}
    NUMBER_SELECT             {numberSet {kind RANGE, min, max, step} | {kind LIST, values[]}, display TRACK|GRID,
                               stimulus?}; 5-101 whole numbers 0-100, a TRACK holds at most 21
    OBJECT_MOVE  DISTRIBUTE   {mode, objectAssetId, objectAlt, sourceCount 2-12, zones[1-3]{id, label, assetId?},
                               requireAllPlaced}
                 SORT         {mode, objects[4-8]{id, text | assetId, alt}, bins[2-3]{id, label}}
    ARRANGE      LETTERS      {mode, tiles[]{id, value, text? | assetId?, alt?}, slots 2-8, cue?}
                 SEQUENCE     {mode, tiles[3-6]{id, value, text? | assetId?, alt?}, slots (= every tile), orderLabel}
    TYPED        NUMERIC      {mode, maxLength 1-3, stimulus?}
                 WORD         {mode, maxLength 2-12, cue?}
    stimulus                  {assetId, alt}
    cue                       {assetId?, alt?, text?}: a picture (with alt) and/or rule text such as "hop + ing"

The canonical answer of each type (one string of at most 64 characters, contracts/limits.json `answer`):

    MULTIPLE_CHOICE, PICTURE_SELECT   the option ID                       "c"
    NUMBER_SELECT, TYPED NUMERIC      decimal, no sign, no leading zero   "8"
    OBJECT_MOVE DISTRIBUTE            every zone, sorted by ID, id=count  "z1=3;z2=3"
    OBJECT_MOVE SORT                  every object, sorted by ID, id=bin  "o1=ee;o2=e"
    ARRANGE LETTERS                   tile values in order, concatenated  "ship"
    ARRANGE SEQUENCE                  tile values in order, joined by ,   "30,38,80,83"
    TYPED WORD                        lower case, single spaces           "hopping"

"Sorted by ID" is plain code-point order of ASCII IDs, which Python's sorted() and JavaScript's default sort agree on.
IDs of zones, bins, objects and tiles match `^[a-z0-9]{1,8}$` (the `bin-<id>` speech variant uses the same form, G
R15), so none can hold a reserved separator. Limits marked [ASSUMPTION] in the code are not in the plan.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from functools import cache
from pathlib import Path
from typing import Any

from shared.rules.contracts import LIMITS

Problem = dict[str, str]

ANSWER_SHAPE = re.compile(LIMITS["answer"]["pattern"])
ANSWER_MAX = LIMITS["answer"]["maxLength"]
SEPARATORS: tuple[str, ...] = tuple(LIMITS["answer"]["reservedSeparators"])
STEP_JOINER: str = LIMITS["answer"]["stepJoiner"]
KEY_ID = re.compile(LIMITS["ids"]["keyId"].removeprefix("^").removesuffix("$"))
PART_ID = re.compile(r"[a-z0-9]{1,8}")  # zone, bin, object and tile IDs [ASSUMPTION], as the bin-<id> variant
DECIMAL = re.compile(r"0|[1-9][0-9]*")

INTERACTION_TYPES = ("MULTIPLE_CHOICE", "PICTURE_SELECT", "NUMBER_SELECT", "TYPED", "ARRANGE", "OBJECT_MOVE")
MODES: dict[str, tuple[str, ...]] = {
    "OBJECT_MOVE": ("DISTRIBUTE", "SORT"),
    "ARRANGE": ("LETTERS", "SEQUENCE"),
    "TYPED": ("NUMERIC", "WORD"),
}
OPTION_IDS = ("a", "b", "c", "d", "e", "f")
OPTION_STYLES = ("TEXT", "GRAPHEME", "WORD", "NUMERAL")
LAYOUTS = ("GRID",)  # sources/09 §4.4 names GRID as the default and no other [ASSUMPTION]
DISPLAYS = ("TRACK", "GRID")
CHOICE_COUNT = (4, 6)  # D-8
OPTION_TEXT_MAX = 24
ALT_MAX = 60
LABEL_MAX = 24  # zone and bin labels, captions, object text [ASSUMPTION]
CUE_TEXT_MAX = 40  # rule text such as "hop + ing" [ASSUMPTION]
ORDER_LABEL_MAX = 40  # "smallest first" [ASSUMPTION]
NUMBER_RANGE = (0, 100)
NUMBER_SET_SIZE = (5, 101)
TRACK_MAX = 21
SOURCE_COUNT = (2, 12)
ZONE_COUNT = (1, 3)
SORT_OBJECTS = (4, 8)
BIN_COUNT = (2, 3)
LETTER_SLOTS = (2, 8)
LETTER_EXTRA_TILES = 3
LETTER_VALUE = re.compile(r"[a-z']{1,4}")
SEQUENCE_TILES = (3, 6)
SEQUENCE_VALUE = re.compile(r"[a-z0-9'-]+(?: [a-z0-9'-]+)*")
SEQUENCE_VALUE_MAX = 12  # [ASSUMPTION]
NUMERIC_MAX_LENGTH = (1, 3)
WORD_MAX_LENGTH = (2, 12)
WORD_ANSWER = re.compile(r"[a-z'-]+(?: [a-z'-]+)*")  # C20.1 ^[a-z' -]{1,maxLength}$ after trimming and collapsing
LETTERS_ANSWER = re.compile(r"[a-z']+")
MAX_ACCEPTED = 8  # a list of accepted answers, where a type allows more than one [ASSUMPTION]

ASSET_MANIFEST = Path(__file__).resolve().parent / "activity_assets.json"


def problem(name: str, rule: str) -> Problem:
    return {"field": name, "rule": rule}


@cache
def asset_manifest() -> dict[str, Mapping[str, Any]]:
    """assetId -> manifest entry, for the activity pictures (shared/activity_assets.json)."""
    doc = json.loads(ASSET_MANIFEST.read_text(encoding="utf-8"))
    return {str(entry["id"]): entry for entry in doc["assets"]}


# --- Small value checks ---------------------------------------------------------------------------------------------


def as_int(value: Any) -> int | None:
    """An integer from JSON or DynamoDB (Decimal); None for anything else, booleans included."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, Decimal) and value == value.to_integral_value():
        return int(value)
    return None


def has_control(value: str) -> bool:
    return any(ord(ch) < 32 or ord(ch) == 127 for ch in value)


def text_ok(value: Any, low: int, high: int) -> bool:
    """Plain text: `low`..`high` characters, no surrounding spaces, no control characters, no markup."""
    return (
        isinstance(value, str)
        and low <= len(value) <= high
        and value == value.strip()
        and not has_control(value)
        and "<" not in value
        and ">" not in value
    )


def in_range(value: Any, bounds: tuple[int, int]) -> bool:
    number = as_int(value)
    return number is not None and bounds[0] <= number <= bounds[1]


def answer_shape_ok(answer: str) -> bool:
    return len(answer) <= ANSWER_MAX and bool(ANSWER_SHAPE.fullmatch(answer))


def decimal_text(value: int) -> str:
    return str(value)


# --- What one step offers to the definition-level checks -------------------------------------------------------------


@dataclass
class Step:
    """One checked step: its problems, and what the answer and reference checks need from its payload."""

    interaction_type: str
    mode: str | None = None
    problems: list[Problem] = field(default_factory=list)
    option_ids: list[str] = field(default_factory=list)
    bin_ids: list[str] = field(default_factory=list)
    assets: list[tuple[str, str]] = field(default_factory=list)  # (field, assetId) for every picture used
    needs_cue: bool = False  # ARRANGE LETTERS and TYPED WORD: a cue in the payload or a prompt clip (C20.1)
    has_cue: bool = False
    accepted_count: tuple[int, int] = (1, 1)
    note_when_many: bool = False  # SEQUENCE and TYPED WORD: more than one accepted entry needs a reviewer note
    case_sensitive_allowed: bool = False  # TYPED WORD's answerSpecification may carry caseSensitive
    payload_ok: bool = False  # the payload checked, so the answers can be checked against it
    answer_rule: Callable[[str], str | None] = lambda _answer: None


def _keys(doc: Mapping[str, Any], prefix: str, allowed: set[str], required: set[str]) -> list[Problem]:
    problems = [problem(f"{prefix}.{k}", "additionalProperties") for k in doc if k not in allowed]
    problems += [problem(f"{prefix}.{k}", "required") for k in sorted(required) if k not in doc]
    return problems


def _items(value: Any, name: str, bounds: tuple[int, int], problems: list[Problem]) -> list[Any]:
    """`value` as a list of objects, with a `count` problem when its length is outside `bounds`."""
    if not isinstance(value, list):
        problems.append(problem(name, "type"))
        return []
    if not bounds[0] <= len(value) <= bounds[1]:
        problems.append(problem(name, "count"))
    return value


def _part_ids(items: Sequence[Any], name: str, problems: list[Problem]) -> list[str]:
    """The IDs of zones, bins, objects or tiles: PART_ID, unique."""
    ids: list[str] = []
    for index, item in enumerate(items):
        value = item.get("id") if isinstance(item, Mapping) else None
        if not (isinstance(value, str) and PART_ID.fullmatch(value)):
            problems.append(problem(f"{name}.{index}.id", "pattern"))
        elif value in ids:
            problems.append(problem(f"{name}.{index}.id", "duplicate"))
        else:
            ids.append(value)
    return ids


def _asset(value: Any, name: str, step: Step) -> None:
    if isinstance(value, str) and KEY_ID.fullmatch(value):
        step.assets.append((name, value))
    else:
        step.problems.append(problem(name, "pattern"))


def _alt(value: Any, name: str, problems: list[Problem]) -> None:
    if not text_ok(value, 1, ALT_MAX):
        problems.append(problem(name, "length"))


def _stimulus(payload: Mapping[str, Any], prefix: str, step: Step) -> None:
    if "stimulus" not in payload:
        return
    stimulus, name = payload["stimulus"], f"{prefix}.stimulus"
    if not isinstance(stimulus, Mapping):
        step.problems.append(problem(name, "type"))
        return
    step.problems.extend(_keys(stimulus, name, {"assetId", "alt"}, {"assetId", "alt"}))
    if "assetId" in stimulus:
        _asset(stimulus["assetId"], f"{name}.assetId", step)
    if "alt" in stimulus:
        _alt(stimulus["alt"], f"{name}.alt", step.problems)


def _cue(payload: Mapping[str, Any], prefix: str, step: Step) -> None:
    step.needs_cue = True
    if "cue" not in payload:
        return
    step.has_cue = True  # a cue is there; what is wrong with it is reported below
    cue, name = payload["cue"], f"{prefix}.cue"
    if not isinstance(cue, Mapping):
        step.problems.append(problem(name, "type"))
        return
    step.problems.extend(_keys(cue, name, {"assetId", "alt", "text"}, set()))
    if "assetId" not in cue and "text" not in cue:
        step.problems.append(problem(name, "empty"))
        return
    if "assetId" in cue:
        _asset(cue["assetId"], f"{name}.assetId", step)
        if "alt" not in cue:
            step.problems.append(problem(f"{name}.alt", "required"))
    if "alt" in cue:
        if "assetId" not in cue:
            step.problems.append(problem(f"{name}.alt", "needs_asset"))
        _alt(cue["alt"], f"{name}.alt", step.problems)
    if "text" in cue and not text_ok(cue["text"], 1, CUE_TEXT_MAX):
        step.problems.append(problem(f"{name}.text", "length"))


# --- The six types --------------------------------------------------------------------------------------------------


def _choice_ids(options: Sequence[Any], prefix: str, problems: list[Problem]) -> list[str]:
    ids: list[str] = []
    for index, option in enumerate(options):
        value = option.get("id") if isinstance(option, Mapping) else None
        if value not in OPTION_IDS or value in ids:
            problems.append(problem(f"{prefix}.options.{index}.id", "unique_a_to_f"))
        else:
            ids.append(str(value))
    return ids


def _choice_answer(option_ids: list[str]) -> Callable[[str], str | None]:
    return lambda answer: None if answer in option_ids else "not_an_option"


def _multiple_choice(payload: Mapping[str, Any], prefix: str, step: Step) -> None:
    problems = step.problems
    problems.extend(_keys(payload, prefix, {"optionStyle", "options", "stimulus"}, {"optionStyle", "options"}))
    if "optionStyle" in payload and payload["optionStyle"] not in OPTION_STYLES:
        problems.append(problem(f"{prefix}.optionStyle", "enum"))
    _stimulus(payload, prefix, step)
    options = _items(payload.get("options"), f"{prefix}.options", CHOICE_COUNT, problems)
    seen: set[str] = set()
    for index, option in enumerate(options):
        name = f"{prefix}.options.{index}"
        if not isinstance(option, Mapping) or set(option) != {"id", "text"}:
            problems.append(problem(name, "shape"))
            continue
        text = option["text"]
        if not text_ok(text, 1, OPTION_TEXT_MAX):
            problems.append(problem(f"{name}.text", "length"))
        elif text.casefold() in seen:
            problems.append(problem(f"{name}.text", "duplicate"))  # unique after trimming and case-folding
        else:
            seen.add(text.casefold())
    step.option_ids = _choice_ids([o for o in options if isinstance(o, Mapping)], prefix, problems)
    step.answer_rule = _choice_answer(step.option_ids)


def _picture_select(payload: Mapping[str, Any], prefix: str, step: Step) -> None:
    problems = step.problems
    problems.extend(_keys(payload, prefix, {"options", "layout", "stimulus"}, {"options"}))
    if "layout" in payload and payload["layout"] not in LAYOUTS:
        problems.append(problem(f"{prefix}.layout", "enum"))
    _stimulus(payload, prefix, step)
    options = _items(payload.get("options"), f"{prefix}.options", CHOICE_COUNT, problems)
    assets: set[str] = set()
    alts: set[str] = set()
    for index, option in enumerate(options):
        name = f"{prefix}.options.{index}"
        if not isinstance(option, Mapping):
            problems.append(problem(name, "shape"))
            continue
        problems.extend(_keys(option, name, {"id", "assetId", "alt", "caption"}, {"id", "assetId", "alt"}))
        asset = option.get("assetId")
        if "assetId" in option:
            if asset in assets:
                problems.append(problem(f"{name}.assetId", "duplicate"))
            else:
                _asset(asset, f"{name}.assetId", step)
                if isinstance(asset, str):
                    assets.add(asset)
        alt = option.get("alt")
        if "alt" in option:
            if not text_ok(alt, 1, ALT_MAX):
                problems.append(problem(f"{name}.alt", "length"))
            elif alt.casefold() in alts:
                problems.append(problem(f"{name}.alt", "duplicate"))
            else:
                alts.add(alt.casefold())
        if "caption" in option and not text_ok(option["caption"], 1, LABEL_MAX):
            problems.append(problem(f"{name}.caption", "length"))
    step.option_ids = _choice_ids([o for o in options if isinstance(o, Mapping)], prefix, problems)
    step.answer_rule = _choice_answer(step.option_ids)


def number_set_values(number_set: Any) -> list[int] | None:
    """The numbers of a NUMBER_SELECT set in display order, or None when the set is not well formed (C20.1)."""
    if not isinstance(number_set, Mapping):
        return None
    low_bound, high_bound = NUMBER_RANGE
    if number_set.get("kind") == "RANGE" and set(number_set) == {"kind", "min", "max", "step"}:
        low, high, step = (as_int(number_set[k]) for k in ("min", "max", "step"))
        if low is None or high is None or step is None or step < 1:
            return None
        if low < low_bound or high > high_bound or low > high or (high - low) % step:
            return None
        return list(range(low, high + 1, step))
    if number_set.get("kind") == "LIST" and set(number_set) == {"kind", "values"}:
        raw = number_set["values"]
        values = [as_int(v) for v in raw] if isinstance(raw, list) else [None]
        if any(v is None or not low_bound <= v <= high_bound for v in values) or len(set(values)) != len(values):
            return None
        return [v for v in values if v is not None]
    return None


def _number_select(payload: Mapping[str, Any], prefix: str, step: Step) -> None:
    problems = step.problems
    problems.extend(_keys(payload, prefix, {"numberSet", "display", "stimulus"}, {"numberSet", "display"}))
    _stimulus(payload, prefix, step)
    values = number_set_values(payload.get("numberSet")) if "numberSet" in payload else []
    if values is None:
        problems.append(problem(f"{prefix}.numberSet", "shape"))  # RANGE dividing by its step, or LIST; 0-100
        values = []
    elif "numberSet" in payload and not NUMBER_SET_SIZE[0] <= len(values) <= NUMBER_SET_SIZE[1]:
        problems.append(problem(f"{prefix}.numberSet", "count"))
    display = payload.get("display")
    if "display" in payload and display not in DISPLAYS:
        problems.append(problem(f"{prefix}.display", "enum"))
    elif display == "TRACK" and len(values) > TRACK_MAX:
        problems.append(problem(f"{prefix}.display", "track_max"))
    texts = {decimal_text(v) for v in values}

    def rule(answer: str) -> str | None:
        if not DECIMAL.fullmatch(answer):
            return "answer_format"
        if not texts:
            return None  # the number set's own problem is reported already
        return None if answer in texts else "not_in_set"

    step.answer_rule = rule


def _pairs(answer: str) -> list[tuple[str, str]] | None:
    """`a=1;b=2` as [(a, 1), (b, 2)], or None when it is not that form."""
    pairs = []
    for part in answer.split(";"):
        key, sep, value = part.partition("=")
        if not sep or not key or not value or "=" in value:
            return None
        pairs.append((key, value))
    return pairs


def _distribute(payload: Mapping[str, Any], prefix: str, step: Step) -> None:
    problems = step.problems
    fields = {"mode", "objectAssetId", "objectAlt", "sourceCount", "zones", "requireAllPlaced"}
    problems.extend(_keys(payload, prefix, fields, fields))
    if "objectAssetId" in payload:
        _asset(payload["objectAssetId"], f"{prefix}.objectAssetId", step)
    if "objectAlt" in payload:
        _alt(payload["objectAlt"], f"{prefix}.objectAlt", problems)
    source = as_int(payload.get("sourceCount"))
    if "sourceCount" in payload and not in_range(source, SOURCE_COUNT):
        problems.append(problem(f"{prefix}.sourceCount", "range"))
        source = None
    require_all = payload.get("requireAllPlaced")
    if "requireAllPlaced" in payload and not isinstance(require_all, bool):
        problems.append(problem(f"{prefix}.requireAllPlaced", "type"))
    zones = _items(payload.get("zones"), f"{prefix}.zones", ZONE_COUNT, problems)
    for index, zone in enumerate(zones):
        name = f"{prefix}.zones.{index}"
        if not isinstance(zone, Mapping):
            problems.append(problem(name, "shape"))
            continue
        problems.extend(_keys(zone, name, {"id", "label", "assetId"}, {"id", "label"}))
        if "label" in zone and not text_ok(zone["label"], 1, LABEL_MAX):
            problems.append(problem(f"{name}.label", "length"))
        if "assetId" in zone:
            _asset(zone["assetId"], f"{name}.assetId", step)
    zone_ids = sorted(_part_ids(zones, f"{prefix}.zones", problems))

    def rule(answer: str) -> str | None:
        pairs = _pairs(answer)
        if pairs is None or not all(DECIMAL.fullmatch(count) for _, count in pairs):
            return "answer_format"
        if [zone for zone, _ in pairs] != zone_ids:
            return "zone_order"  # every zone once, sorted by zone ID
        counts = [int(count) for _, count in pairs]
        total = sum(counts)
        if total == 0:
            return "nothing_placed"
        if source is not None and total > source:
            return "too_many"
        if require_all is True and source is not None and total != source:
            return "all_placed"
        if len(counts) == 1 and source is not None and not 1 <= counts[0] <= source - 2:
            return "single_zone_target"  # "move everything" is never right by accident (C20.1)
        return None

    step.answer_rule = rule


def _sort(payload: Mapping[str, Any], prefix: str, step: Step) -> None:
    problems = step.problems
    problems.extend(_keys(payload, prefix, {"mode", "objects", "bins"}, {"mode", "objects", "bins"}))
    objects = _items(payload.get("objects"), f"{prefix}.objects", SORT_OBJECTS, problems)
    for index, item in enumerate(objects):
        name = f"{prefix}.objects.{index}"
        if not isinstance(item, Mapping):
            problems.append(problem(name, "shape"))
            continue
        problems.extend(_keys(item, name, {"id", "text", "assetId", "alt"}, {"id", "alt"}))
        if ("text" in item) == ("assetId" in item):
            problems.append(problem(name, "text_or_asset"))
        if "text" in item and not text_ok(item["text"], 1, LABEL_MAX):
            problems.append(problem(f"{name}.text", "length"))
        if "assetId" in item:
            _asset(item["assetId"], f"{name}.assetId", step)
        if "alt" in item:
            _alt(item["alt"], f"{name}.alt", problems)
    bins = _items(payload.get("bins"), f"{prefix}.bins", BIN_COUNT, problems)
    for index, item in enumerate(bins):
        name = f"{prefix}.bins.{index}"
        if not isinstance(item, Mapping):
            problems.append(problem(name, "shape"))
            continue
        problems.extend(_keys(item, name, {"id", "label"}, {"id", "label"}))
        if "label" in item and not text_ok(item["label"], 1, LABEL_MAX):
            problems.append(problem(f"{name}.label", "length"))
    object_ids = sorted(_part_ids(objects, f"{prefix}.objects", problems))
    bin_ids = _part_ids(bins, f"{prefix}.bins", problems)
    step.bin_ids = bin_ids

    def rule(answer: str) -> str | None:
        pairs = _pairs(answer)
        if pairs is None:
            return "answer_format"
        if [item for item, _ in pairs] != object_ids:
            return "object_order"  # every object once, sorted by object ID
        if any(target not in bin_ids for _, target in pairs):
            return "not_a_bin"
        if {target for _, target in pairs} != set(bin_ids):
            return "bin_empty"  # every bin receives at least one object
        return None

    step.answer_rule = rule


def _tiles(payload: Mapping[str, Any], prefix: str, step: Step, value_ok: Callable[[Any], bool]) -> list[str]:
    """The tile values in stored order (only well-formed tiles)."""
    problems = step.problems
    tiles = payload.get("tiles")
    if not isinstance(tiles, list):
        problems.append(problem(f"{prefix}.tiles", "type"))
        return []
    values: list[str] = []
    for index, tile in enumerate(tiles):
        name = f"{prefix}.tiles.{index}"
        if not isinstance(tile, Mapping):
            problems.append(problem(name, "shape"))
            continue
        problems.extend(_keys(tile, name, {"id", "value", "text", "assetId", "alt"}, {"id", "value"}))
        if not value_ok(tile.get("value")):
            problems.append(problem(f"{name}.value", "pattern"))
        else:
            values.append(tile["value"])
        if "text" in tile and "assetId" in tile:
            problems.append(problem(name, "text_or_asset"))
        if "text" in tile and not text_ok(tile["text"], 1, LABEL_MAX):
            problems.append(problem(f"{name}.text", "length"))
        if "assetId" in tile:
            _asset(tile["assetId"], f"{name}.assetId", step)
            if "alt" not in tile:
                problems.append(problem(f"{name}.alt", "required"))
        if "alt" in tile:
            if "assetId" not in tile:
                problems.append(problem(f"{name}.alt", "needs_asset"))
            _alt(tile["alt"], f"{name}.alt", problems)
    _part_ids(tiles, f"{prefix}.tiles", problems)
    return values if len(values) == len(tiles) else []


def buildable(word: str, values: Sequence[str], slots: int) -> bool:
    """Whether `word` is the concatenation of exactly `slots` of the tile `values`, each tile used at most once."""
    remaining = list(values)

    def build(rest: str, left: int) -> bool:
        if left == 0:
            return rest == ""
        for index, value in enumerate(remaining):
            if value and rest.startswith(value):
                remaining[index] = ""
                if build(rest[len(value) :], left - 1):
                    return True
                remaining[index] = value
        return False

    return build(word, slots)


def _letters(payload: Mapping[str, Any], prefix: str, step: Step) -> None:
    problems = step.problems
    problems.extend(_keys(payload, prefix, {"mode", "tiles", "slots", "cue"}, {"mode", "tiles", "slots"}))
    _cue(payload, prefix, step)
    values = _tiles(payload, prefix, step, lambda v: isinstance(v, str) and bool(LETTER_VALUE.fullmatch(v)))
    slots = as_int(payload.get("slots"))
    if "slots" in payload and not in_range(slots, LETTER_SLOTS):
        problems.append(problem(f"{prefix}.slots", "range"))
        slots = None
    tiles = payload.get("tiles")
    if slots is not None and isinstance(tiles, list) and not slots <= len(tiles) <= slots + LETTER_EXTRA_TILES:
        problems.append(problem(f"{prefix}.tiles", "count"))  # between slots and slots + 3 tiles
    step.accepted_count = (1, MAX_ACCEPTED)

    def rule(answer: str) -> str | None:
        if not LETTERS_ANSWER.fullmatch(answer):
            return "answer_format"
        if slots is None or not values:
            return None  # the payload's own problems are reported already
        if not buildable(answer, values, slots):
            return "not_buildable"
        if any("".join(values[i:j]) == answer for i in range(len(values)) for j in range(i + 1, len(values) + 1)):
            return "shuffle_spells_answer"  # no run of neighbouring tiles in the stored order may spell the answer
        return None

    step.answer_rule = rule


def _sequence(payload: Mapping[str, Any], prefix: str, step: Step) -> None:
    problems = step.problems
    fields = {"mode", "tiles", "slots", "orderLabel"}
    problems.extend(_keys(payload, prefix, fields, fields))

    def value_ok(value: Any) -> bool:
        return isinstance(value, str) and len(value) <= SEQUENCE_VALUE_MAX and bool(SEQUENCE_VALUE.fullmatch(value))

    values = _tiles(payload, prefix, step, value_ok)
    tiles = payload.get("tiles")
    if isinstance(tiles, list) and not SEQUENCE_TILES[0] <= len(tiles) <= SEQUENCE_TILES[1]:
        problems.append(problem(f"{prefix}.tiles", "count"))
    if len(set(values)) != len(values):
        problems.append(problem(f"{prefix}.tiles", "values_distinct"))
    if "slots" in payload and not (isinstance(tiles, list) and as_int(payload["slots"]) == len(tiles)):
        problems.append(problem(f"{prefix}.slots", "all_placed"))  # every tile is placed
    if "orderLabel" in payload and not text_ok(payload["orderLabel"], 1, ORDER_LABEL_MAX):
        problems.append(problem(f"{prefix}.orderLabel", "length"))
    step.accepted_count = (1, MAX_ACCEPTED)
    step.note_when_many = True  # one accepted order unless the reviewer records why

    def rule(answer: str) -> str | None:
        order = answer.split(",")
        if any(not value_ok(v) for v in order):
            return "answer_format"
        if not values:
            return None
        if sorted(order) != sorted(values):
            return "not_a_permutation"  # every tile, once
        if order == values:
            return "shuffle_spells_answer"  # [ASSUMPTION] the LETTERS rule, applied to sequences too
        return None

    step.answer_rule = rule


def _numeric(payload: Mapping[str, Any], prefix: str, step: Step) -> None:
    problems = step.problems
    problems.extend(_keys(payload, prefix, {"mode", "maxLength", "stimulus"}, {"mode", "maxLength"}))
    _stimulus(payload, prefix, step)
    max_length = as_int(payload.get("maxLength"))
    if "maxLength" in payload and not in_range(max_length, NUMERIC_MAX_LENGTH):
        problems.append(problem(f"{prefix}.maxLength", "range"))
        max_length = None

    def rule(answer: str) -> str | None:
        if not DECIMAL.fullmatch(answer) or len(answer) > NUMERIC_MAX_LENGTH[1]:
            return "answer_format"  # an integer 0-999 with no leading zero
        if max_length is not None and len(answer) > max_length:
            return "max_length"
        return None

    step.answer_rule = rule


def _word(payload: Mapping[str, Any], prefix: str, step: Step) -> None:
    problems = step.problems
    problems.extend(_keys(payload, prefix, {"mode", "maxLength", "cue"}, {"mode", "maxLength"}))
    _cue(payload, prefix, step)
    max_length = as_int(payload.get("maxLength"))
    if "maxLength" in payload and not in_range(max_length, WORD_MAX_LENGTH):
        problems.append(problem(f"{prefix}.maxLength", "range"))
        max_length = None
    step.accepted_count = (1, MAX_ACCEPTED)
    step.note_when_many = True
    step.case_sensitive_allowed = True

    def rule(answer: str) -> str | None:
        if not WORD_ANSWER.fullmatch(answer):
            return "answer_format"  # lower case, no surrounding or double spaces (already canonical)
        if max_length is not None and len(answer) > max_length:
            return "max_length"
        return None

    step.answer_rule = rule


_BY_TYPE: dict[tuple[str, str | None], Callable[[Mapping[str, Any], str, Step], None]] = {
    ("MULTIPLE_CHOICE", None): _multiple_choice,
    ("PICTURE_SELECT", None): _picture_select,
    ("NUMBER_SELECT", None): _number_select,
    ("OBJECT_MOVE", "DISTRIBUTE"): _distribute,
    ("OBJECT_MOVE", "SORT"): _sort,
    ("ARRANGE", "LETTERS"): _letters,
    ("ARRANGE", "SEQUENCE"): _sequence,
    ("TYPED", "NUMERIC"): _numeric,
    ("TYPED", "WORD"): _word,
}


def check_payload(interaction_type: Any, payload: Any, prefix: str) -> Step:
    """Check one step's payload; `prefix` is its field (`activityPayload`, `additionalSteps.0.activityPayload`)."""
    step = Step(interaction_type=str(interaction_type))
    if interaction_type not in INTERACTION_TYPES:
        return step  # the interactionType's own enum problem is reported by the caller
    if not isinstance(payload, Mapping):
        step.problems.append(problem(prefix, "type"))
        return step
    mode = None
    if interaction_type in MODES:
        mode = payload.get("mode")
        if mode not in MODES[interaction_type]:
            step.problems.append(problem(f"{prefix}.mode", "enum"))
            return step
    step.mode = mode
    before = len(step.problems)
    _BY_TYPE[(interaction_type, mode)](payload, prefix, step)
    step.payload_ok = len(step.problems) == before
    return step


def accepted_list(spec: Any, name: str, step: Step) -> tuple[list[Problem], list[str] | None]:
    """An answerSpecification's shape: `{accepted[, caseSensitive]}` with a list of strings."""
    if not isinstance(spec, Mapping):
        return [problem(name, "type")], None
    allowed = {"accepted", "caseSensitive"} if step.case_sensitive_allowed else {"accepted"}
    problems = _keys(spec, name, allowed, {"accepted"})
    if "caseSensitive" in spec and spec["caseSensitive"] is not False:
        # The canonical answer shape (contracts/limits.json `answer`) has no capitals, so a case-sensitive answer
        # could never be sent; refused until the plan widens the shape.
        problems.append(problem(f"{name}.caseSensitive", "const"))
    accepted = spec.get("accepted")
    if not (isinstance(accepted, list) and all(isinstance(a, str) for a in accepted)):
        if "accepted" in spec:
            problems.append(problem(f"{name}.accepted", "type"))
        return problems, None
    return problems, list(accepted)


def check_answers(step: Step, accepted: Sequence[str], name: str) -> list[Problem]:
    """Every accepted answer is canonical for `step`'s type and inside its payload (C22.2 rule 7)."""
    problems: list[Problem] = []
    low, high = step.accepted_count
    if not low <= len(accepted) <= high:
        problems.append(problem(name, "exactly_one" if (low, high) == (1, 1) else "count"))
    seen: set[str] = set()
    for index, answer in enumerate(accepted):
        entry = f"{name}.{index}"
        if answer in seen:
            problems.append(problem(entry, "duplicate"))
            continue
        seen.add(answer)
        if not answer_shape_ok(answer):
            problems.append(problem(entry, "answer_shape"))  # one string <= 64 characters, canonical characters
            continue
        if step.interaction_type in INTERACTION_TYPES and (rule := step.answer_rule(answer)) is not None:
            problems.append(problem(entry, rule))
    return problems
