"""Allow-list logging (plan G §15, spine S2).

A log line is built only from the fields in ALLOWED_FIELDS. Anything else handed to the logger (an unknown field, a
value of the wrong type, an over-long string, a free-text message) is dropped and the line says how many were dropped
in `droppedFields`, so a mistake shows up in the logs without the data itself ever being written. Exceptions and stack
traces are never formatted: their text can contain request values.

Powertools Logger does the plumbing (stdout handler, POWERTOOLS_LOG_LEVEL, POWERTOOLS_SERVICE_NAME); the formatter
below decides what is written.

    log = ApiLogger("player-api")
    log.line(requestId="...", routeKey="GET /api/me", status=200, durationMs=12)
"""

from __future__ import annotations

import json
import logging
import math
from collections.abc import Iterable, Mapping
from typing import IO, Any

from aws_lambda_powertools import Logger
from aws_lambda_powertools.logging.formatter import BasePowertoolsFormatter

# G §15. `type` is the op type (player-api and tts only). `action`, `activityId`, `speechId`, `versionId` are for admin
# audit lines. `errorType` (an exception's class name, never its message) is in G §15 for INTERNAL errors, and the
# formatter's own `level` and `droppedFields` are in G §15 too (all three [PROPOSAL], Phase 7).
ALLOWED_FIELDS: frozenset[str] = frozenset(
    {
        "requestId",
        "routeKey",
        "status",
        "durationMs",
        "sub",
        "runId",
        "slotId",
        "opId",
        "type",
        "result",
        "code",
        "revision",
        "generation",
        "action",
        "activityId",
        "speechId",
        "versionId",
        "errorType",
    }
)

MAX_STRING = 128


def _allowed(key: object, value: object) -> bool:
    if key not in ALLOWED_FIELDS:
        return False
    if isinstance(value, bool | int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, str):
        return len(value) <= MAX_STRING
    return False


class AllowListFormatter(BasePowertoolsFormatter):
    """Writes one JSON object per record: `level`, the allowed fields, and `droppedFields` when anything was dropped."""

    def __init__(self) -> None:
        super().__init__()
        self._keys: dict[str, Any] = {}

    # Persistent keys (Powertools `append_keys`). Only allowed fields are kept; Powertools' own defaults such as
    # `service` and `sampling_rate` are not on the list, so they are never written.
    def append_keys(self, **additional_keys: Any) -> None:
        self._keys.update({k: v for k, v in additional_keys.items() if _allowed(k, v)})

    def get_current_keys(self) -> dict[str, Any]:
        return dict(self._keys)

    def remove_keys(self, keys: Iterable[str]) -> None:
        for key in keys:
            self._keys.pop(key, None)

    def clear_state(self) -> None:
        self._keys = {}

    # A Lambda handles one request at a time, so the thread-safe variants share the same store.
    def thread_safe_append_keys(self, **additional_keys: Any) -> None:
        self.append_keys(**additional_keys)

    def thread_safe_get_current_keys(self) -> dict[str, Any]:
        return self.get_current_keys()

    def thread_safe_remove_keys(self, keys: Iterable[str]) -> None:
        self.remove_keys(keys)

    def thread_safe_clear_keys(self) -> None:
        self.clear_state()

    def format(self, record: logging.LogRecord) -> str:
        fields = record.msg if isinstance(record.msg, Mapping) else None
        dropped = 0 if fields is not None else 1  # a free-text message is never written
        line: dict[str, Any] = {"level": record.levelname}
        for key, value in {**self._keys, **(fields or {})}.items():
            if value is None:
                continue  # an optional field that is simply absent
            if _allowed(key, value):
                line[key] = value
            else:
                dropped += 1
        if dropped:
            line["droppedFields"] = dropped
        return json.dumps(line, sort_keys=True, separators=(",", ":"))


class ApiLogger:
    """One structured line per call. Use `line(**fields)`; there is deliberately no free-text message."""

    def __init__(self, service: str, stream: IO[str] | None = None) -> None:
        self._logger = Logger(service=service, logger_formatter=AllowListFormatter(), stream=stream)
        # The allow-list formatter must be the only way out. Without this, records also reach the root logger (the
        # Lambda runtime's handler), which writes the raw field dict; Powertools' de-duplication filter normally
        # stops that, but POWERTOOLS_LOG_DEDUPLICATION_DISABLED=true removes the filter.
        logging.getLogger(self._logger.name).propagate = False

    def line(self, level: str = "INFO", **fields: Any) -> None:
        log = {"INFO": self._logger.info, "WARNING": self._logger.warning, "ERROR": self._logger.error}[level]
        log(fields)
