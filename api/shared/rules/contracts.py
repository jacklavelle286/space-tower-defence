"""The shared contracts as data: contracts/limits.json and contracts/schemas/*.schema.json (Phase 12, M1-14).

The Python mirror of web/game-core/src/rules/contracts.generated.ts. TypeScript gets these files through a generator;
Python reads the same files directly, so there is nothing to regenerate and nothing that can drift.

Where the files are:
  in a Lambda zip   <zip root>/contracts/   (scripts/build_lambdas.py copies limits.json and schemas/ there,
                                             next to shared/)
  in the repository <repo>/contracts/       (api/shared/rules/ is three levels below the repository root)
The first of the two that holds limits.json wins; if neither does, importing this module fails loudly.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent  # .../shared/rules


def _find_contracts() -> Path:
    candidates = (_HERE.parents[1] / "contracts", _HERE.parents[2] / "contracts")  # zip root, then repository root
    for candidate in candidates:
        if (candidate / "limits.json").is_file():
            return candidate
    raise FileNotFoundError(f"contracts/limits.json not found in {[str(c) for c in candidates]}")


CONTRACTS_DIR: Path = _find_contracts()


def _load_limits() -> dict[str, Any]:
    limits = json.loads((CONTRACTS_DIR / "limits.json").read_text(encoding="utf-8"))
    limits.pop("$comment", None)  # the generator leaves the comment out of LIMITS too
    return limits


def _load_schemas() -> dict[str, Any]:
    """Every contract schema, keyed by its $id (the same keys as SCHEMAS in contracts.generated.ts)."""
    schemas: dict[str, Any] = {}
    for path in sorted((CONTRACTS_DIR / "schemas").glob("*.schema.json")):
        schema = json.loads(path.read_text(encoding="utf-8"))
        if schema.get("$id") != path.name:
            raise ValueError(f"{path.name}: $id must equal the file name")
        schemas[path.name] = schema
    return schemas


LIMITS: dict[str, Any] = _load_limits()
"""contracts/limits.json without its $comment. Treat as read-only."""

SCHEMAS: dict[str, Any] = _load_schemas()
"""The contract schemas as data, keyed by $id, for the validator in schema.py. Treat as read-only."""
