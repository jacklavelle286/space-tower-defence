"""The ops batch: `POST /api/runs/{runId}/ops` (R11; spine S7.1, F §8.1, G §5; M1-17).

The one write path for run state after creation. A batch is checked as a whole first (`check_envelope`: size,
JSON, the envelope schema, `protocolVersion`), then `OpsBatch.apply` takes the ops strictly in order. For each op,
with every `game` read consistent:

  (a) read RUN, SESSION and the slots the op can touch; `opId` in `recentOps` (or an `attemptId` on the addressed
      slot) -> ALREADY_APPLIED with the original logical result; nothing is written. Checked before everything else
  (b) SESSION `sessionId` and `generation` equal the batch's      else STALE_SESSION, stop
  (c) run not terminal                                            else REJECTED RUN_TERMINAL
  (d) `expectedRevision == revision`                              else REJECTED STALE_REVISION
  (e) the pinned bounds file loads and (LD6) the (version, wave set) is not marked invalid (both skipped for ABANDON,
      FINISH_RUN) else REJECTED CONTENT_VERSION_UNSUPPORTED
  (f) phase, wave, current slot } the rules reducer, shared/rules else REJECTED PHASE_MISMATCH
  (g) payload schema            } (the browser's decisions)       else REJECTED VALIDATION_FAILED
      plus the placements' values against the pinned bounds file (pads, classes, levels, targeting)
  (h) plausibility bounds (shared/plausibility.py, spine S6; Phase 30) else REJECTED CHECKPOINT_OUT_OF_BOUNDS
  (i) one TransactWriteItems (G5): ConditionCheck SESSION (the fence) + Update RUN (`revision = :expected`)
      [+ Update SLOT (`attribute_exists(pk) AND status = UNRESOLVED`)] [+ Update SUM#] [+ Update PROFILE]

Any refusal of the transaction (a lost race on any condition, a transaction conflict, throttling) is followed by a
jittered 20-100 ms pause and the op starts again at (a), so the loser of a duplicate-delivery race answers
ALREADY_APPLIED. After three tries the batch stops with 503 THROTTLED. The first REJECTED or STALE_SESSION stops the
batch too; every later op is NOT_PROCESSED.

Rewards are granted at most once because the slot condition `status = UNRESOLVED` is in the same transaction as the
reward, and a slot never returns to UNRESOLVED. The attempt's identity is its `opId`, stored on the slot as
`attemptId` for the life of the run.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from botocore.exceptions import ClientError

from shared.badges import earned as earned_badges
from shared.bounds import KEY_ID, BoundsUnavailable
from shared.data import DynamoTable, cancellation_reasons, is_transient
from shared.errors import ApiError
from shared.plausibility import plausibility_problems
from shared.rules import reduce, validate
from shared.rules.contracts import LIMITS
from shared.rules.next_phase import slot_id_for
from shared.runs import PROTOCOL_VERSION, TERMINAL, new_slot_item, plain, resolved_of, run_sk, slot_prefix, slot_sk
from shared.selection.bank import read_units, read_versions, version_key
from shared.selection.endless import blocks_to_plan, build_block, choose_block, endless_specs
from shared.selection.plan import instance_key
from shared.session import SESSION_SK, generation_of, iso_z

OPS_MAX_BYTES: int = LIMITS["bodyMaxBytes"]["ops"]
RECENT_OPS: int = LIMITS["recentOpsWindow"]
TRIES = 3  # step (i): three tries, then 503 THROTTLED (spine S7.1)
PROFILE_SK = "PROFILE"
SLOT_ID = re.compile(LIMITS["ids"]["slotId"].removesuffix("$") + r"\Z")
_PAYLOAD_PROBLEM = re.compile(r"^body\.ops\[\d+\]\.payload\.")
_NAMED_KEY_RULES = frozenset({"additionalProperties", "propertyNames"})

# The RUN fields the reducer may change; every one is written by name (spine S9.5: named attributes only).
_REDUCED_FIELDS = ("status", "stage", "phase", "wave", "highestCompletedWave", "plannedThrough", "snapshot")
_IN_PROGRESS_ONLY = ("phase", "snapshot")  # removed when a run ends (spine S3.1, S4)
# Outcomes that change the addressed SLOT item; a status-only change (VOIDED, DECLINED) appends no attempt.
_SLOT_OUTCOMES = ("VOIDED", "DECLINED", "INCORRECT", "RESOLVED_SUCCEEDED", "RESOLVED_FAILED")
_STATUS_ONLY = ("VOIDED", "DECLINED")


def jitter_seconds(random: Callable[[], float]) -> float:
    """The pause before an op is tried again: 20-100 ms, uniformly jittered (spine S7.1)."""
    return 0.02 + 0.08 * random()


# --- Batch-level checks (400 / 409 before any op is looked at) -------------------------------------------------------


def _envelope_problem(problem: Mapping[str, str]) -> dict[str, str]:
    """A schema problem as the 400 reports it. For an unknown key the field would be the caller's key name, so it is
    reported against the object that holds it instead (G §1.2: nothing the caller typed is echoed)."""
    field_path, rule = problem["field"], problem["rule"]
    if rule in _NAMED_KEY_RULES:
        field_path = field_path.rsplit(".", 1)[0]
    return {"field": field_path, "rule": rule}


OPS_ENVELOPE = "op-envelope.schema.json"
ENDLESS_ENVELOPE = "endless-envelope.schema.json"


def check_envelope(body: Mapping[str, Any], schema: str = OPS_ENVELOPE) -> dict[str, Any]:
    """The batch-level checks of G §5.3, after size and JSON: the envelope schema (op count, each op's own fields, an
    op `type` the route does not take: CHOOSE_ENDLESS and CREATE_RUN in /ops, anything but one CHOOSE_ENDLESS in R12's
    ENDLESS_ENVELOPE) -> 400 VALIDATION_FAILED; then `protocolVersion` newer than this server -> 409
    PROTOCOL_UNSUPPORTED. Payload problems are left for step (g), so the ops before a bad one still count."""
    problems = [p for p in validate(schema, body, root="body") if not _PAYLOAD_PROBLEM.match(p["field"])]
    if problems:
        unique: list[dict[str, str]] = []
        for problem in map(_envelope_problem, problems):
            if problem not in unique:
                unique.append(problem)
        raise ApiError("VALIDATION_FAILED", details=unique)
    if body["protocolVersion"] > PROTOCOL_VERSION:
        # Only possible after a rollback (G §9). There is no previous version yet, so nothing is "too old" (426).
        raise ApiError("PROTOCOL_UNSUPPORTED", "Protocol version is newer than this server supports")
    return dict(body)


# --- Results ---------------------------------------------------------------------------------------------------------


@dataclass
class BatchOutcome:
    """`results` has one entry per op, in order. `stop` is None (HTTP 200), "STALE_SESSION_FIRST" (409: the first op
    failed the fence) or "THROTTLED" (503)."""

    results: list[dict[str, Any]] = field(default_factory=list)
    stop: str | None = None


def _attempt_view(attempt: Mapping[str, Any]) -> dict[str, Any]:
    """`{n, correct, slotStatus, rewardGranted}` as it was when the attempt was applied (F §8.3): a correct attempt
    resolved the slot, the third wrong one failed it, any other left it UNRESOLVED."""
    n = int(attempt["n"])
    correct = attempt.get("correct") is True
    status = "SUCCEEDED" if correct else "FAILED" if n >= LIMITS["attemptsPerSlot"] else "UNRESOLVED"
    return {"n": n, "correct": correct, "slotStatus": status, "rewardGranted": correct}


def _recorded_attempt(slot: Mapping[str, Any] | None, op_id: str) -> Mapping[str, Any] | None:
    attempts = slot.get("attempts") if slot is not None else None
    if not isinstance(attempts, list):
        return None
    return next((a for a in attempts if isinstance(a, Mapping) and a.get("attemptId") == op_id), None)


# --- Reading one op's world (step (a)) -----------------------------------------------------------------------------


@dataclass
class _Reads:
    run: dict[str, Any]
    session: dict[str, Any] | None
    slots: dict[str, dict[str, Any]]  # slotId -> SLOT item, for the slots this op can touch that exist
    addressed: str | None  # SUBMIT_ATTEMPT's or DISMISS_SLOT's slotId, when it is a well-formed slot ID


def _slot_ids(run: Mapping[str, Any], op: Mapping[str, Any]) -> tuple[str | None, list[str]]:
    """The addressed slot (SUBMIT_ATTEMPT, DISMISS_SLOT) and every slot the next-phase rule may read after this op."""
    wave = int(run.get("wave") or 0)
    wanted: list[str] = []
    addressed: str | None = None
    if op["type"] in ("SUBMIT_ATTEMPT", "DISMISS_SLOT"):
        slot_id = op["payload"].get("slotId") if isinstance(op["payload"], Mapping) else None
        if isinstance(slot_id, str) and SLOT_ID.match(slot_id):
            addressed = slot_id
            wanted.append(slot_id)
        interval = wave - 1  # resolving the current slot looks at the same interval
    elif op["type"] == "CHOOSE_ENDLESS":
        interval = int(run.get("finalWave") or 0)  # the offer moves on to interval finalWave (normally N-<finalWave>)
    else:
        interval = wave  # COMPLETE_WAVE moves on to the interval of the wave just cleared
    if op["type"] in ("SUBMIT_ATTEMPT", "DISMISS_SLOT", "COMPLETE_WAVE", "CHOOSE_ENDLESS") and interval >= 1:
        wanted += [slot_id_for("NORMAL", interval), slot_id_for("METEOR", interval)]
    return addressed, list(dict.fromkeys(wanted))


# --- Building the reducer's state ----------------------------------------------------------------------------------


def _accepted(version: Mapping[str, Any] | None, slot: Mapping[str, Any]) -> list[str] | None:
    """The pinned version's accepted canonical answers, or None when the version is withdrawn, missing or has no
    usable list (all three are treated alike: the slot is voided, F §4.4). A template slot's answers are its
    materialised instance's (`resolved`, C25.1), which only counts while the pinned version stands."""
    if version is None or version.get("withdrawn"):
        return None
    resolved = resolved_of(slot)
    spec = (resolved if resolved is not None else version).get("answerSpecification")
    accepted = spec.get("accepted") if isinstance(spec, Mapping) else None
    if not isinstance(accepted, list) or not accepted or not all(isinstance(a, str) for a in accepted):
        return None
    return list(accepted)


def _slot_state(slot: Mapping[str, Any], accepted: list[str] | None) -> dict[str, Any]:
    attempts = slot.get("attempts") if isinstance(slot.get("attempts"), list) else []
    return {
        "slotId": slot.get("slotId"),
        "kind": slot.get("kind"),
        "status": slot.get("status"),
        "attempts": [
            {
                "n": plain(a.get("n")),
                "attemptId": a.get("attemptId"),
                "answer": a.get("answer"),
                "correct": a.get("correct"),
            }
            for a in attempts
            if isinstance(a, Mapping)
        ],
        "accepted": accepted or [],
        "withdrawn": accepted is None,
        "reward": plain(slot.get("reward")),
    }


def run_state(
    run: Mapping[str, Any], slots: Sequence[Mapping[str, Any]], power_cap: int, accepted: Mapping[str, list[str] | None]
) -> dict[str, Any]:
    """The reducer's RunState (contracts/schemas/run-state.schema.json) from the stored items. `accepted` gives, for
    the addressed slot, its accepted answers (None: withdrawn or missing); other slots are only looked at by the
    next-phase rule, which reads their status."""
    state: dict[str, Any] = {
        name: plain(run.get(name))
        for name in (
            "mode",
            "status",
            "stage",
            "wave",
            "finalWave",
            "highestCompletedWave",
            "plannedThrough",
            "revision",
        )
    }
    state["campaignCompleted"] = run.get("campaignCompletedAt") is not None
    state["powerChargeCap"] = power_cap
    for name in _IN_PROGRESS_ONLY:
        if run.get(name) is not None:
            state[name] = plain(run[name])
    state["slots"] = [_slot_state(slot, accepted.get(str(slot.get("slotId")), [])) for slot in slots]
    return state


# --- Step (g): values against the pinned data ----------------------------------------------------------------------


def pinned_value_problems(op: Mapping[str, Any], bounds: Mapping[str, Any], wave_set_id: str) -> list[dict[str, str]]:
    """Placement values the schema cannot know: the pad is on this wave set's map, the class is in this wave set, the
    level exists for the class, the targeting mode is one the class has (G §5.2 common field rules). Uniqueness,
    unlock waves, caps and credit values are plausibility bounds (step (h), Phase 30)."""
    placements = op["payload"].get("placements") if op["type"] in ("SAVE_PREP", "START_WAVE", "COMPLETE_WAVE") else None
    if not isinstance(placements, list):
        return []
    wave_set = bounds["waveSets"][wave_set_id]
    # A schema 2 planet has several maps: a placement must be on a pad of this wave set's map (Gate M, LD2).
    pads = wave_set.get("pads", bounds["pads"])
    problems: list[dict[str, str]] = []
    for index, placement in enumerate(placements):
        where = f"op.payload.placements[{index}]"
        if placement["padId"] not in pads:
            problems.append({"field": f"{where}.padId", "rule": "enum"})
        class_id = placement["classId"]
        cls = bounds["classes"].get(class_id) if class_id in wave_set["classes"] else None
        if cls is None:
            problems.append({"field": f"{where}.classId", "rule": "enum"})
            continue
        if placement["level"] > len(cls["levelCosts"]):
            problems.append({"field": f"{where}.level", "rule": "maximum"})
        if placement["targeting"] not in cls["targeting"]:
            problems.append({"field": f"{where}.targeting", "rule": "enum"})
    return problems


# --- Step (i): the G5 transaction ----------------------------------------------------------------------------------


def run_update(
    old: Mapping[str, Any], new: Mapping[str, Any], *, op_id: str, generation: int, now: str
) -> dict[str, Any]:
    """The revision-conditioned Update RUN (F §12.3): the reducer's changed fields by name, `revision`, `recentOps`
    (the handler-built list, last 32), `lastPlayedAt`, `writerGeneration`; `phase` and `snapshot` removed when the
    run ends. The only way a RUN changes after creation."""
    recent = [entry for entry in old.get("recentOps") or [] if isinstance(entry, Mapping)]
    recent = [*({"opId": e.get("opId"), "revision": plain(e.get("revision"))} for e in recent)]
    recent.append({"opId": op_id, "revision": new["revision"]})
    sets: dict[str, Any] = {
        "revision": new["revision"],
        "recentOps": recent[-RECENT_OPS:],
        "lastPlayedAt": now,
        "writerGeneration": generation,
    }
    for name in _REDUCED_FIELDS:
        if name in new and plain(old.get(name)) != new[name]:
            sets[name] = new[name]
    if new.get("campaignCompleted") and old.get("campaignCompletedAt") is None:
        sets["campaignCompletedAt"] = now
    removes = [name for name in _IN_PROGRESS_ONLY if name not in new and old.get(name) is not None]
    names = {f"#{name}": name for name in [*sets, *removes]}
    update = "SET " + ", ".join(f"#{name} = :{name}" for name in sets)
    if removes:
        update += " REMOVE " + ", ".join(f"#{name}" for name in removes)
    values: dict[str, Any] = {f":{name}": value for name, value in sets.items()}
    values[":expected"] = plain(old["revision"])
    return {"update": update, "names": names, "values": values, "condition": "#revision = :expected"}


def slot_update(new_slot: Mapping[str, Any], outcome: str, *, now: str) -> dict[str, Any]:
    """Update SLOT, only while it is UNRESOLVED (the reward's at-most-once marker, F §4.2): append the attempt and set
    the status, or (VOIDED, DECLINED) set the status only."""
    names = {"#pk": "pk", "#status": "status"}
    values: dict[str, Any] = {":unresolved": "UNRESOLVED", ":status": new_slot["status"]}
    update = "SET #status = :status"
    if outcome not in _STATUS_ONLY:
        last = new_slot["attempts"][-1]
        names["#attempts"] = "attempts"
        values[":attempt"] = [{**last, "recordedAt": now}]
        update += ", #attempts = list_append(#attempts, :attempt)"
    return {
        "update": update,
        "names": names,
        "values": values,
        "condition": "attribute_exists(#pk) AND #status = :unresolved",
    }


def _planned_slot_state(item: Mapping[str, Any]) -> dict[str, Any]:
    """A freshly planned slot as the reducer sees it: UNRESOLVED, no attempts (only its status matters until played)."""
    return {
        "slotId": item["slotId"],
        "kind": item["kind"],
        "status": "UNRESOLVED",
        "attempts": [],
        "accepted": [],
        "withdrawn": False,
        "reward": dict(item["reward"]),
    }


def summary_sk(slot: Mapping[str, Any]) -> str:
    subject, topic = slot.get("subject"), slot.get("topicId")
    if not all(isinstance(v, str) and KEY_ID.match(v) for v in (subject, topic)):
        raise ValueError("a slot's subject or topicId is not a key ID")
    return f"SUM#{subject}#{topic}"


def summary_update(succeeded: bool, *, now: str) -> dict[str, Any]:
    """Update SUM#<subject>#<topicId>: the learning summary counts a resolution exactly once, because it is in the
    resolving transaction (AC-18). Created on first use by `if_not_exists`."""
    return {
        "update": (
            "SET #completed = if_not_exists(#completed, :zero) + :one, "
            "#succeeded = if_not_exists(#succeeded, :zero) + :succeeded, "
            "#failed = if_not_exists(#failed, :zero) + :failed, #lastResolvedAt = :now"
        ),
        "names": {
            "#completed": "completed",
            "#succeeded": "succeeded",
            "#failed": "failed",
            "#lastResolvedAt": "lastResolvedAt",
        },
        "values": {":zero": 0, ":one": 1, ":succeeded": int(succeeded), ":failed": int(not succeeded), ":now": now},
        "condition": None,
    }


def profile_best_update(planet_id: str, entry: Mapping[str, Any]) -> dict[str, Any]:
    """Update PROFILE with a new best wave only (see profile_update)."""
    return profile_update((planet_id, entry), [], now="", badges_map_exists=True)


def profile_update(
    best: tuple[str, Mapping[str, Any]] | None, badges: list[str], *, now: str, badges_map_exists: bool
) -> dict[str, Any]:
    """Update PROFILE (F §12.3): a new best wave writes the whole per-planet entry, so it works after a progress reset
    left `planets` empty; each new badge is `SET badges.#b = if_not_exists(badges.#b, :now)`, so a badge is awarded
    once and its first date kept (C12). A profile without a badges map gets the map whole. `attribute_exists(pk)`, so
    it can never recreate a deleted profile."""
    sets: list[str] = []
    names: dict[str, str] = {"#pk": "pk"}
    values: dict[str, Any] = {}
    if best is not None:
        planet_id, entry = best
        names.update({"#planets": "planets", "#planet": planet_id})
        values[":entry"] = dict(entry)
        sets.append("#planets.#planet = :entry")
    if badges:
        names["#badges"] = "badges"
        if badges_map_exists:
            values[":now"] = now
            for i, badge in enumerate(badges):
                names[f"#b{i}"] = badge
                sets.append(f"#badges.#b{i} = if_not_exists(#badges.#b{i}, :now)")
        else:
            values[":badges"] = {badge: now for badge in badges}
            sets.append("#badges = :badges")
    return {"update": "SET " + ", ".join(sets), "names": names, "values": values, "condition": "attribute_exists(#pk)"}


# --- The batch -----------------------------------------------------------------------------------------------------


Log = Callable[..., None]


@dataclass
class _Decision:
    """What steps (a)-(h) decided for one op on one set of reads. With `actions`, `result` is what the op answers if
    the G5 transaction commits; without, `result` is final."""

    result: dict[str, Any]
    revision: int | None = None  # for the log line: the applied (or original) revision, else the run's revision
    actions: list[dict[str, Any]] | None = None
    level: str = "INFO"
    log_code: str | None = None  # a log-only code: VERSION_MISSING, THROTTLED
    slot_id: str | None = None
    throttled: bool = False


class OpsBatch:
    """Applies one checked envelope to one run, op by op. Everything time- or chance-dependent comes in from the
    caller, so tests control it."""

    def __init__(
        self,
        *,
        table: DynamoTable,
        content: Callable[[], DynamoTable],
        bounds: Callable[[str, str], Any],
        now: Callable[[], datetime],
        sleep: Callable[[float], None],
        random: Callable[[], float],
        log: Log,
        resumable: Callable[[str, str], bool] = lambda _campaign, _wave_set: True,
    ) -> None:
        self.table = table
        self._content = content
        self._bounds = bounds
        self._resumable = resumable  # Gate M, LD6: False for a (version, wave set) marked invalid (shared/versions.py)
        self._now = now
        self._sleep = sleep
        self._random = random
        self._log = log

    def apply(self, pk: str, run_id: str, envelope: Mapping[str, Any]) -> BatchOutcome:
        """Every op in order, one log line each. Raises ApiError NOT_FOUND when the run does not exist under this
        caller's key."""
        outcome = BatchOutcome()
        ops: list[Mapping[str, Any]] = envelope["ops"]
        for index, op in enumerate(ops):
            decision = self._one(pk, run_id, envelope, op)
            result = decision.result
            outcome.results.append(result)
            self._log(
                decision.level,
                opId=op["opId"],
                type=op["type"],
                slotId=decision.slot_id,
                result=result["result"],
                code=result.get("code") or decision.log_code,
                revision=decision.revision,
                generation=envelope["generation"],
            )
            if decision.throttled or result["result"] in ("REJECTED", "STALE_SESSION"):
                if decision.throttled:
                    outcome.stop = "THROTTLED"
                elif index == 0 and result["result"] == "STALE_SESSION":
                    outcome.stop = "STALE_SESSION_FIRST"
                outcome.results += [{"opId": later["opId"], "result": "NOT_PROCESSED"} for later in ops[index + 1 :]]
                break
        return outcome

    def _one(self, pk: str, run_id: str, envelope: Mapping[str, Any], op: Mapping[str, Any]) -> _Decision:
        """Up to TRIES passes through (a)-(i). Every pass reads again: a retry never reuses a stale read."""
        slot_id: str | None = None
        for attempt in range(1, TRIES + 1):
            decision = self._decide(pk, run_id, envelope, op)
            slot_id = decision.slot_id
            if decision.actions is None:
                return decision
            try:
                self.table.transact_write(decision.actions)
            except ClientError as error:
                if cancellation_reasons(error) is None and not is_transient(error):
                    raise
                if attempt < TRIES:
                    self._sleep(jitter_seconds(self._random))
                continue
            return decision
        return _Decision(
            result={"opId": op["opId"], "result": "NOT_PROCESSED"},
            level="WARNING",
            log_code="THROTTLED",
            slot_id=slot_id,
            throttled=True,
        )

    def _read(self, pk: str, run_id: str, op: Mapping[str, Any]) -> _Reads:
        run = self.table.get_item(pk, run_sk(run_id))
        if run is None:
            raise ApiError("NOT_FOUND")
        session = self.table.get_item(pk, SESSION_SK)
        addressed, slot_ids = _slot_ids(run, op)
        # One consistent GetItem per slot (at most three): player-api's role has no BatchGetItem on `game` (E.6.4).
        found = (self.table.get_item(pk, slot_sk(run_id, slot_id)) for slot_id in slot_ids)
        slots = {str(item.get("slotId")): item for item in found if item is not None}
        return _Reads(run=run, session=session, slots=slots, addressed=addressed)

    def _decide(self, pk: str, run_id: str, envelope: Mapping[str, Any], op: Mapping[str, Any]) -> _Decision:
        """Steps (a)-(h) on fresh consistent reads, and the G5 actions when the op is to be applied."""
        op_id = op["opId"]
        reads = self._read(pk, run_id, op)
        run = reads.run
        addressed_slot = reads.slots.get(reads.addressed) if reads.addressed else None
        revision = int(plain(run.get("revision")) or 0)

        def final(result: dict[str, Any], at: int | None = revision) -> _Decision:
            return _Decision(result={"opId": op_id, **result}, revision=at, slot_id=reads.addressed)

        # (a) duplicate: before everything else, so a resend after a takeover or after the run ended is still "done".
        entry = next((e for e in run.get("recentOps") or [] if isinstance(e, Mapping) and e.get("opId") == op_id), None)
        recorded = _recorded_attempt(addressed_slot, op_id) if op["type"] == "SUBMIT_ATTEMPT" else None
        if entry is not None or recorded is not None:
            result: dict[str, Any] = {"result": "ALREADY_APPLIED"}
            if entry is not None:
                result["appliedRevision"] = plain(entry.get("revision"))
            if recorded is not None:
                result["attempt"] = _attempt_view(recorded)
            return final(result, result.get("appliedRevision"))

        def rejected(code: str, details: Any = None) -> _Decision:
            return final({"result": "REJECTED", "code": code, **({"details": details} if details is not None else {})})

        # (b) the fence: this batch's tenure must still hold the lease.
        session = reads.session
        if (
            session is None
            or session.get("sessionId") != envelope["sessionId"]
            or generation_of(session) != envelope["generation"]
        ):
            return final({"result": "STALE_SESSION"})
        # (c), (d)
        if run.get("status") in TERMINAL:
            return rejected("RUN_TERMINAL")
        if op["expectedRevision"] != revision:
            return rejected("STALE_REVISION")
        # (e) pins loadable; a run that cannot be interpreted may still be closed.
        bounds: Mapping[str, Any] | None = None
        pins = run.get("pins") if isinstance(run.get("pins"), Mapping) else {}
        if op["type"] not in ("ABANDON", "FINISH_RUN"):
            try:
                bounds = self._bounds(str(pins.get("rulesetVersion")), str(pins.get("campaignVersion")))
            except (BoundsUnavailable, ValueError):
                return rejected("CONTENT_VERSION_UNSUPPORTED")
            if str(run.get("waveSetId")) not in bounds["waveSets"]:
                return rejected("CONTENT_VERSION_UNSUPPORTED")
            if not self._resumable(str(pins.get("campaignVersion")), str(run.get("waveSetId"))):
                return rejected("CONTENT_VERSION_UNSUPPORTED")  # invalid: only ABANDON or FINISH_RUN may close it

        # The addressed slot's pinned version: read only when an attempt could be judged or voided.
        accepted: dict[str, list[str] | None] = {}
        version_missing = False
        if addressed_slot is not None and addressed_slot.get("status") == "UNRESOLVED":
            version = self._content().get_item(
                *version_key(str(addressed_slot.get("activityId")), str(addressed_slot.get("activityVersion")))
            )
            accepted[str(reads.addressed)] = _accepted(version, addressed_slot)
            version_missing = version is None
        power_cap = int(bounds["powerInventoryCap"]) if bounds is not None else 0
        state = run_state(run, list(reads.slots.values()), power_cap, accepted)

        # (f), (g): the shared rules decide, exactly as the browser's reducer did.
        reduced = reduce(state, op)
        if reduced["result"] == "REJECTED":
            return rejected(reduced["code"], reduced.get("details"))
        if bounds is not None:
            problems = pinned_value_problems(op, bounds, str(run.get("waveSetId")))
            if problems:
                return rejected("VALIDATION_FAILED", problems)
            # (h) plausibility bounds, against the stored snapshot (spine S6): only checkpoint ops have any.
            stored = {
                "waveSetId": str(run.get("waveSetId")),
                "highestCompletedWave": int(plain(run.get("highestCompletedWave")) or 0),
                "snapshot": plain(run.get("snapshot")) or {},
            }
            problems = plausibility_problems(bounds, stored, op) if run.get("snapshot") is not None else []
            if problems:
                return rejected("CHECKPOINT_OUT_OF_BOUNDS", problems)

        # Endless (Phase 54, F §3.6): CHOOSE_ENDLESS, and an endless COMPLETE_WAVE that falls behind, plan the next
        # blocks of slots, chosen now from the bank. They join the state so the next-phase rule sees them
        # (CHOOSE_ENDLESS lands on N-<finalWave>); they are written in the same transaction, after the fixed ones.
        planned: list[dict[str, Any]] = []
        if (
            bounds is not None
            and reduced["state"]["status"] == "IN_PROGRESS"
            and op["type"] in ("CHOOSE_ENDLESS", "COMPLETE_WAVE")
        ):
            ws_bounds = bounds["waveSets"].get(str(run.get("waveSetId")), {})
            if op["type"] == "CHOOSE_ENDLESS" and "endless" not in ws_bounds:
                return rejected("CONTENT_VERSION_UNSUPPORTED")  # no endless generator for this wave set
            if reduced["state"]["stage"] == "ENDLESS" and "endless" in ws_bounds:
                planned, through = self._plan_endless(pk, run_id, run, bounds, ws_bounds, int(reduced["state"]["wave"]))
                if through is not None:
                    state = {
                        **state,
                        "plannedThrough": through,
                        "slots": [*state["slots"], *map(_planned_slot_state, planned)],
                    }
                    reduced = reduce(state, op)

        # (i) the G5 transaction. Action order is fixed (CancellationReasons come back in this order):
        #     0 SESSION fence, 1 RUN, then SLOT, SUM# and PROFILE when the op needs them, then planned endless slots.
        new_state = reduced["state"]
        outcome = reduced.get("outcome")
        now = iso_z(self._now())
        actions = [
            self.table.condition_check_action(
                pk,
                SESSION_SK,
                condition="#sessionId = :sessionId AND #generation = :generation",
                names={"#sessionId": "sessionId", "#generation": "generation"},
                values={":sessionId": envelope["sessionId"], ":generation": envelope["generation"]},
            ),
            self.table.update_action(
                pk,
                run_sk(run_id),
                **run_update(run, new_state, op_id=op_id, generation=envelope["generation"], now=now),
            ),
        ]
        if outcome in _SLOT_OUTCOMES and addressed_slot is not None:
            new_slot = next(s for s in new_state["slots"] if s["slotId"] == reads.addressed)
            form = slot_update(new_slot, outcome, now=now)
            actions.append(self.table.update_action(pk, slot_sk(run_id, str(reads.addressed)), **form))
            if outcome in ("RESOLVED_SUCCEEDED", "RESOLVED_FAILED"):
                form = summary_update(outcome == "RESOLVED_SUCCEEDED", now=now)
                actions.append(self.table.update_action(pk, summary_sk(addressed_slot), **form))
        if op["type"] == "COMPLETE_WAVE":
            profile_action = self._profile_action(pk, run, new_state, now)
            if profile_action is not None:
                actions.append(profile_action)

        for item in planned:
            actions.append(self.table.put_action(item, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}))

        result = {"opId": op_id, "result": "APPLIED", "appliedRevision": new_state["revision"]}
        if outcome is not None:
            result["outcome"] = outcome
        if "attempt" in reduced:
            result["attempt"] = reduced["attempt"]
        # A pinned version that cannot be found is treated as withdrawn, and logged at ERROR (F §4.4). Every other VOID
        # is logged with code VOIDED and its slotId: the audit trail of a withdrawal reaching a child's run (Phase 44).
        missing = outcome == "VOIDED" and version_missing
        return _Decision(
            result=result,
            revision=new_state["revision"],
            actions=actions,
            level="ERROR" if missing else "INFO",
            log_code="VERSION_MISSING" if missing else "VOIDED" if outcome == "VOIDED" else None,
            slot_id=reads.addressed,
        )

    def _plan_endless(
        self,
        pk: str,
        run_id: str,
        run: Mapping[str, Any],
        bounds: Mapping[str, Any],
        ws_bounds: Mapping[str, Any],
        wave_after: int,
    ) -> tuple[list[dict[str, Any]], int | None]:
        """The slot items of the endless blocks due now (C24.6), and the new plannedThrough (None: nothing due)."""
        blocks = blocks_to_plan(int(plain(run.get("plannedThrough")) or 0), wave_after)
        if not blocks:
            return [], None
        pins = run.get("pins") if isinstance(run.get("pins"), Mapping) else {}
        seed = str(pins.get("seed") or run_id)
        content = self._content()
        units = read_units(content, int(plain(pins.get("ageBand")) or 0))
        existing = self.table.query_prefix(pk, slot_prefix(run_id), attributes=("activityId", "resolved"))
        used = {str(s.get("activityId")) for s in existing}
        taken = {
            instance_key(str(s.get("activityId")), plain(s["resolved"]).get("params", {}))
            for s in existing
            if isinstance(s.get("resolved"), Mapping)
        }
        items: list[dict[str, Any]] = []
        for first, last in blocks:
            specs = endless_specs(
                first,
                last,
                reward=int(ws_bounds["endless"]["learningReward"]),
                meteors_before=len(ws_bounds["meteorAfter"]),
                final_wave=int(ws_bounds["finalWave"]),
                rotation=list(bounds.get("powerAwardRotation", [])),
            )
            label = f"endless:{first}"
            picks = choose_block(specs, units, seed=seed, label=label, used_activities=used)
            versions = read_versions(content, {(u.activity_id, u.version) for _, u in picks})
            for plan in build_block(picks, versions, seed=seed, label=label, taken_instances=taken):
                used.add(plan.unit.activity_id)
                if plan.resolved is not None:
                    taken.add(instance_key(plan.unit.activity_id, plan.resolved.get("params", {})))
                items.append(new_slot_item(pk=pk, run_id=run_id, plan=plan))
        return items, blocks[-1][1]

    def _profile_action(
        self, pk: str, run: Mapping[str, Any], new_state: Mapping[str, Any], now: str
    ) -> dict[str, Any] | None:
        """The PROFILE action of a COMPLETE_WAVE, only when something changes (F §12.3): a CAMPAIGN run raises its
        planet's bestCompletedWave; any run adds the C12 badges it has newly earned (shared/badges.py), each with
        if_not_exists. A CHALLENGE run never touches `planets` (spine S3.2), only `badges`."""
        profile = self.table.get_item(pk, PROFILE_SK, attributes=("pk", "planets", "badges"))
        if profile is None:
            return None  # a whole-profile reset is under way; its new generation fails this op's fence anyway
        best_entry: tuple[str, dict[str, Any]] | None = None
        if run.get("mode") == "CAMPAIGN":
            planet_id = str(run.get("planetId"))
            planets = profile.get("planets") if isinstance(profile.get("planets"), Mapping) else {}
            entry = plain(planets.get(planet_id)) if isinstance(planets.get(planet_id), Mapping) else {}
            best = entry.get("bestCompletedWave")
            wave = int(new_state["highestCompletedWave"])
            if not (isinstance(best, int) and not isinstance(best, bool) and best >= wave):
                best_entry = (planet_id, {**entry, "bestCompletedWave": wave})
        held = profile.get("badges") if isinstance(profile.get("badges"), Mapping) else None
        stored = plain(run.get("snapshot")) if isinstance(run.get("snapshot"), Mapping) else None
        new_badges = [b for b in earned_badges(run, stored, new_state) if held is None or b not in held]
        if best_entry is None and not new_badges:
            return None
        form = profile_update(best_entry, new_badges, now=now, badges_map_exists=held is not None)
        return self.table.update_action(pk, PROFILE_SK, **form)
