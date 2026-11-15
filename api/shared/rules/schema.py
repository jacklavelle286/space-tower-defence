"""A small JSON Schema validator for the contract schemas in contracts/schemas/ (Python mirror of schema.ts).

It implements only the keywords web/game-core/scripts/gen-contracts.ts allows (SUPPORTED_KEYWORDS below; a test checks
both lists are equal and that the schemas use nothing else), and it checks them in the same fixed order as schema.ts,
so both languages report the same problems in the same order:

  $ref, type (a wrong type stops this node), const, enum, minLength, maxLength, pattern, minimum, maximum,
  minItems, maxItems, items, required (in the schema's order), properties (in the schema's order),
  then each key of the value sorted by UTF-16 code unit: propertyNames, then additionalProperties; allOf; if/then.

A problem is {"field", "rule"}: field is a path such as op.payload.placements[0].level and rule is the keyword that
failed. Values are never copied into a problem (G section 1.2). Identical problems are reported once.

Where Python and JavaScript differ, this file follows JavaScript (contracts/fixtures/README.md):
  - booleans are never numbers (in Python, True is an int), and an integral float such as 1.0 is an integer;
  - `$` ends the string only; Python's `$` also matches before a final newline, so it becomes `\\Z` here;
  - keys are sorted by UTF-16 code unit, as Array.prototype.sort does, not by code point.
"""

from __future__ import annotations

import math
import re
from functools import cache
from typing import Any

from shared.rules.contracts import SCHEMAS

# The same list, in the same order, as SUPPORTED_KEYWORDS in web/game-core/scripts/gen-contracts.ts.
SUPPORTED_KEYWORDS: tuple[str, ...] = (
    "$ref",
    "type",
    "const",
    "enum",
    "pattern",
    "minLength",
    "maxLength",
    "minimum",
    "maximum",
    "properties",
    "required",
    "additionalProperties",
    "propertyNames",
    "items",
    "minItems",
    "maxItems",
    "allOf",
    "if",
    "then",
)
ANNOTATIONS: tuple[str, ...] = ("$schema", "$id", "$defs", "$comment", "title", "description")

Problem = dict[str, str]


def is_node(value: Any) -> bool:
    return isinstance(value, dict)


def is_number(value: Any) -> bool:
    """typeof value === "number" for a parsed JSON value: an int or a float, never a bool."""
    return isinstance(value, int | float) and not isinstance(value, bool)


def is_integer(value: Any) -> bool:
    """Number.isInteger: an int, or a float with no fraction (1.0); never a bool."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    return isinstance(value, float) and value.is_integer()


@cache
def _regex(pattern: str) -> re.Pattern[str]:
    """Compile a schema pattern with JavaScript's meaning of `$` (end of string only) and ASCII \\d, \\w."""
    out: list[str] = []
    in_class = False
    escaped = False
    for char in pattern:
        if escaped:
            out.append(char)
            escaped = False
        elif char == "\\":
            out.append(char)
            escaped = True
        elif char == "[" and not in_class:
            in_class = True
            out.append(char)
        elif char == "]" and in_class:
            in_class = False
            out.append(char)
        elif char == "$" and not in_class:
            out.append(r"\Z")
        else:
            out.append(char)
    return re.compile("".join(out), re.ASCII)


def _utf16_key(text: str) -> bytes:
    """Sort key giving JavaScript's default string order (UTF-16 code units)."""
    return text.encode("utf-16-be", "surrogatepass")


def _type_matches(type_name: str, value: Any) -> bool:
    if type_name == "object":
        return is_node(value)
    if type_name == "array":
        return isinstance(value, list)
    if type_name == "string":
        return isinstance(value, str)
    if type_name == "integer":
        return is_integer(value)
    if type_name == "number":
        return is_number(value) and math.isfinite(value)
    if type_name == "boolean":
        return isinstance(value, bool)
    if type_name == "null":
        return value is None
    raise ValueError(f"schema uses unknown type {type_name}")


def deep_equal(a: Any, b: Any) -> bool:
    """JSON equality as schema.ts's deepEqual sees it: 1 equals 1.0, but true never equals 1."""
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if is_number(a) and is_number(b):
        return a == b
    if isinstance(a, str) and isinstance(b, str):
        return a == b
    if a is None or b is None:
        return a is None and b is None
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(deep_equal(x, y) for x, y in zip(a, b, strict=True))
    if is_node(a) and is_node(b):
        return len(a) == len(b) and all(k in b and deep_equal(a[k], b[k]) for k in a)
    return False


def _resolve_ref(ref: str, base_id: str) -> tuple[dict[str, Any], str]:
    """Resolve "file.schema.json#/$defs/x", "#/$defs/x" or "file.schema.json" against the current schema's $id."""
    file, _, pointer = ref.partition("#")
    schema_id = base_id if file == "" else file
    target: Any = SCHEMAS.get(schema_id)
    for part in (p for p in pointer.split("/") if p != ""):
        target = target.get(part) if is_node(target) else None
    if not is_node(target):
        raise ValueError(f"cannot resolve $ref {ref} from {base_id}")
    return target, schema_id


def _num(schema: dict[str, Any], key: str) -> int | float | None:
    value = schema.get(key)
    return value if is_number(value) else None


def _check(schema: dict[str, Any], base_id: str, value: Any, path: str, out: list[Problem]) -> None:
    def fail(rule: str, field: str = path) -> None:
        problem = {"field": field, "rule": rule}
        if problem not in out:
            out.append(problem)

    ref = schema.get("$ref")
    if isinstance(ref, str):
        target, target_id = _resolve_ref(ref, base_id)
        _check(target, target_id, value, path, out)

    if "type" in schema:
        type_ = schema["type"]
        types = type_ if isinstance(type_, list) else [type_]
        if not any(isinstance(t, str) and _type_matches(t, value) for t in types):
            fail("type")
            return
    if "const" in schema and not deep_equal(value, schema["const"]):
        fail("const")
    enum_values = schema.get("enum")
    if isinstance(enum_values, list) and not any(deep_equal(e, value) for e in enum_values):
        fail("enum")

    if isinstance(value, str):
        min_length = _num(schema, "minLength")
        max_length = _num(schema, "maxLength")
        if min_length is not None and len(value) < min_length:  # len() counts code points, as JSON Schema does
            fail("minLength")
        if max_length is not None and len(value) > max_length:
            fail("maxLength")
        pattern = schema.get("pattern")
        if isinstance(pattern, str) and not _regex(pattern).search(value):
            fail("pattern")

    if is_number(value):
        minimum = _num(schema, "minimum")
        maximum = _num(schema, "maximum")
        if minimum is not None and value < minimum:
            fail("minimum")
        if maximum is not None and value > maximum:
            fail("maximum")

    if isinstance(value, list):
        min_items = _num(schema, "minItems")
        max_items = _num(schema, "maxItems")
        if min_items is not None and len(value) < min_items:
            fail("minItems")
        if max_items is not None and len(value) > max_items:
            fail("maxItems")
        items = schema.get("items")
        if is_node(items):
            for i, item in enumerate(value):
                _check(items, base_id, item, f"{path}[{i}]", out)

    if is_node(value):
        required = schema.get("required")
        if isinstance(required, list):
            for name in required:
                if isinstance(name, str) and name not in value:
                    fail("required", f"{path}.{name}")
        properties = schema["properties"] if is_node(schema.get("properties")) else {}
        for name, sub in properties.items():
            if is_node(sub) and name in value:
                _check(sub, base_id, value[name], f"{path}.{name}", out)
        property_names = schema.get("propertyNames")
        additional = schema.get("additionalProperties")
        for key in sorted(value, key=_utf16_key):
            field = f"{path}.{key}"
            if is_node(property_names):
                name_problems: list[Problem] = []
                _check(property_names, base_id, key, field, name_problems)
                if name_problems:
                    fail("propertyNames", field)
            if key in properties:
                continue
            if additional is False:
                fail("additionalProperties", field)
            elif is_node(additional):
                _check(additional, base_id, value[key], field, out)

    all_of = schema.get("allOf")
    if isinstance(all_of, list):
        for sub in all_of:
            if is_node(sub):
                _check(sub, base_id, value, path, out)

    condition = schema.get("if")
    then = schema.get("then")
    if is_node(condition) and is_node(then):
        silent: list[Problem] = []
        _check(condition, base_id, value, path, silent)
        if not silent:
            _check(then, base_id, value, path, out)


def validate(schema_id: str, value: Any, root: str = "op") -> list[Problem]:
    """Validate `value` against the contract schema with this $id (for example "op.schema.json").

    Returns every problem found, in the fixed order described at the top of this file; an empty list means valid.
    """
    schema = SCHEMAS.get(schema_id)
    if not is_node(schema):
        raise ValueError(f"unknown schema {schema_id}")
    out: list[Problem] = []
    _check(schema, schema_id, value, root, out)
    return out


__all__: list[str] = ["ANNOTATIONS", "SUPPORTED_KEYWORDS", "deep_equal", "is_integer", "is_number", "validate"]
