"""Run and slot items, and the views built from them (spine S3.1, S3.3, S8.1; F §3.1, §4.2; G §4.1, R9, R10).

Items are written with named attributes only; views name every field they return. Nothing is copied from an item
or a request wholesale (spine S2, S9.5), so a stored field that is not in a view cannot reach a response.

RUN (`U#<sub>` / `RUN#<runId>`), written once by CREATE_RUN (G7) and then only by the revision-conditioned Update of
the ops route (Phase 17):

    planetId, waveSetId, mode, status, stage, phase, wave, finalWave, highestCompletedWave, plannedThrough,
    snapshot{credits, placements, colony{health, shield}, powers}, revision, recentOps[{opId, revision}],
    writerGeneration, createdAt, lastPlayedAt, campaignCompletedAt (only once set),
    pins{ageBand, seed, rulesetVersion, campaignVersion, assetManifestVersion, protocolVersion,
         selection{algorithmVersion, bankReadAt, packId}}

SLOT (`U#<sub>` / `SLOT#<runId>#<slotId>`), created only by `Put attribute_not_exists(pk)`:

    slotId, kind, interval, subject, topicId, activityId, activityVersion, interactionType, resolved, presentation,
    intro, clips{variant: {speechId, speechVersion, clipKey}}, reward, status, attempts[]
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Mapping, Sequence
from decimal import Decimal
from typing import Any

from shared.rules.next_phase import current_slot_id
from shared.selection.plan import ALGORITHM_VERSION, SlotPlan, pack_id

RUN_PREFIX = "RUN#"
SLOT_PREFIX = "SLOT#"
PROTOCOL_VERSION = 1  # G §9: integers from 1 [PROPOSAL]
TERMINAL = frozenset({"DEFEATED", "ABANDONED", "COMPLETED"})


def run_sk(run_id: str) -> str:
    return f"{RUN_PREFIX}{run_id}"


def slot_sk(run_id: str, slot_id: str) -> str:
    return f"{SLOT_PREFIX}{run_id}#{slot_id}"


def slot_prefix(run_id: str) -> str:
    return f"{SLOT_PREFIX}{run_id}#"


def plain(value: Any) -> Any:
    """DynamoDB values as JSON-ready values: Decimal -> int (or float), maps and lists recursively."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, Mapping):
        return {str(k): plain(v) for k, v in value.items()}
    if isinstance(value, list | tuple | set):
        return [plain(v) for v in value]
    return value


def interval_of(slot_id: str) -> int:
    return int(slot_id[2:])


# --- Items ----------------------------------------------------------------------------------------------------------


def new_run_item(
    *,
    pk: str,
    run_id: str,
    planet_id: str,
    wave_set_id: str,
    wave_set_bounds: Mapping[str, Any],
    preset_placements: Sequence[Mapping[str, Any]],
    age_band: int,
    seed: str,
    ruleset_version: str,
    campaign_version: str,
    generation: int,
    plans: Sequence[SlotPlan],
    now: str,
) -> dict[str, Any]:
    """The RUN item CREATE_RUN puts (spine S3.2): IN_PROGRESS, AUTHORED, BUILD, wave 1, the wave set's start snapshot
    (the same numbers game-core's createRunState uses), revision 0."""
    final_wave = int(wave_set_bounds["finalWave"])
    return {
        "pk": pk,
        "sk": run_sk(run_id),
        "planetId": planet_id,
        "waveSetId": wave_set_id,
        "mode": wave_set_bounds["mode"],
        "status": "IN_PROGRESS",
        "stage": "AUTHORED",
        "phase": "BUILD",
        "wave": 1,
        "finalWave": final_wave,
        "highestCompletedWave": 0,
        "plannedThrough": final_wave - 1,
        "snapshot": {
            "credits": int(wave_set_bounds["startCredits"]),
            "placements": [dict(p) for p in preset_placements],
            "colony": {"health": int(wave_set_bounds["colonyHealth"]), "shield": 0},
            "powers": {},
        },
        "revision": 0,
        "recentOps": [],
        "writerGeneration": generation,
        "createdAt": now,
        "lastPlayedAt": now,
        "pins": {
            "ageBand": age_band,
            "seed": seed,
            "rulesetVersion": ruleset_version,
            "campaignVersion": campaign_version,
            "assetManifestVersion": None,  # no asset manifest is published yet [ASSUMPTION]: pinned once it exists
            "protocolVersion": PROTOCOL_VERSION,
            "selection": {"algorithmVersion": ALGORITHM_VERSION, "bankReadAt": now, "packId": pack_id(plans)},
        },
    }


def new_slot_item(*, pk: str, run_id: str, plan: SlotPlan) -> dict[str, Any]:
    """One UNRESOLVED slot with everything pinned at creation (spine S3.3)."""
    return {
        "pk": pk,
        "sk": slot_sk(run_id, plan.slot_id),
        "slotId": plan.slot_id,
        "kind": plan.kind,
        "interval": plan.interval,
        "subject": plan.unit.subject,
        "topicId": plan.unit.topic_id,
        "activityId": plan.unit.activity_id,
        "activityVersion": plan.unit.version,
        "interactionType": plan.unit.interaction_type,
        "resolved": plan.resolved,  # the materialised template instance, or None for a FIXED activity (C25.1)
        "presentation": dict(plan.presentation),
        "intro": plan.intro,
        "clips": {variant: dict(ref) for variant, ref in plan.clips.items()},
        "reward": dict(plan.reward),
        "status": "UNRESOLVED",
        "attempts": [],
    }


# --- Views ----------------------------------------------------------------------------------------------------------

_SUMMARY_FIELDS = (
    "planetId",
    "waveSetId",
    "mode",
    "status",
    "stage",
    "wave",
    "finalWave",
    "highestCompletedWave",
    "lastPlayedAt",
    "createdAt",
    "revision",
)
_OPTIONAL_SUMMARY_FIELDS = ("phase", "campaignCompletedAt")


def _pins(item: Mapping[str, Any]) -> Mapping[str, Any]:
    pins = item.get("pins")
    return pins if isinstance(pins, Mapping) else {}


def is_playable(item: Mapping[str, Any], playable: Callable[[Any, Any], bool]) -> bool:
    pins = _pins(item)
    return playable(pins.get("rulesetVersion"), pins.get("campaignVersion"))


def run_summary(item: Mapping[str, Any], playable: Callable[[Any, Any], bool]) -> dict[str, Any]:
    """RunSummary (G §4.1) from a RUN item: named fields only."""
    summary: dict[str, Any] = {"runId": str(item["sk"]).removeprefix(RUN_PREFIX)}
    for name in _SUMMARY_FIELDS:
        summary[name] = plain(item.get(name))
    for name in _OPTIONAL_SUMMARY_FIELDS:
        if item.get(name) is not None:
            summary[name] = plain(item[name])
    summary["playable"] = is_playable(item, playable)
    if not summary["playable"]:
        summary["reason"] = "CONTENT_VERSION_UNSUPPORTED"
    return summary


def current_slot_view(slot: Mapping[str, Any] | None, withdrawn: bool) -> dict[str, Any] | None:
    """`currentSlot` (G §4.1): the slot the phase names, with its recorded answers (AC-17), or None."""
    if slot is None:
        return None
    attempts = slot.get("attempts") if isinstance(slot.get("attempts"), list) else []
    return {
        "slotId": slot.get("slotId"),
        "kind": slot.get("kind"),
        "status": slot.get("status"),
        "attempts": [
            {"n": plain(a.get("n")), "answer": a.get("answer"), "correct": a.get("correct")}
            for a in attempts
            if isinstance(a, Mapping)
        ],
        "withdrawn": withdrawn,
    }


def current_slot_of(run: Mapping[str, Any]) -> str | None:
    """The current slot ID, derived from phase and wave (spine S3.2); None outside ACTIVITY/METEOR."""
    if run.get("status") != "IN_PROGRESS" or not isinstance(run.get("wave"), Decimal | int):
        return None
    return current_slot_id({"phase": run.get("phase"), "wave": int(run["wave"])})


def run_view(
    run: Mapping[str, Any],
    playable: Callable[[Any, Any], bool],
    current_slot: dict[str, Any] | None,
) -> dict[str, Any]:
    """RunView (G §4.1): RunSummary + plannedThrough, snapshot (absent when terminal), seed, pins, currentSlot,
    recentOpIds."""
    view = run_summary(run, playable)
    pins = _pins(run)
    view["plannedThrough"] = plain(run.get("plannedThrough"))
    if run.get("status") not in TERMINAL and isinstance(run.get("snapshot"), Mapping):
        view["snapshot"] = plain(run["snapshot"])
    view["seed"] = pins.get("seed")
    view["pins"] = {
        name: plain(pins.get(name))
        for name in ("ageBand", "rulesetVersion", "campaignVersion", "assetManifestVersion", "protocolVersion")
    }
    view["currentSlot"] = current_slot
    recent = run.get("recentOps") if isinstance(run.get("recentOps"), list) else []
    view["recentOpIds"] = [op.get("opId") for op in recent if isinstance(op, Mapping)]
    return view


def slot_entry(slot: Mapping[str, Any]) -> dict[str, Any]:
    """One compact `slots[]` entry of RunDetail (R9)."""
    attempts = slot.get("attempts")
    return {
        "slotId": slot.get("slotId"),
        "kind": slot.get("kind"),
        "status": slot.get("status"),
        "attemptsUsed": len(attempts) if isinstance(attempts, list) else 0,
    }


def sorted_slots(slots: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    """Play order: by interval, the normal slot before the meteor."""
    return sorted(slots, key=lambda s: (interval_of(str(s.get("slotId"))), str(s.get("slotId"))[0] != "N"))


# --- The pack (R10) -------------------------------------------------------------------------------------------------

# Copied from the pinned version, by name (G §4 R10 allow-list). Never: review records, identities, speech text or
# SSML, voice, engine, bucket names or keys, drafts, minAge/maxAge, generator parameters, definitionHash, audit.
_VERSION_FIELDS = (
    "interactionType",
    "prompt",
    "visualAssetReferences",
    "activityPayload",
    "additionalSteps",
    "answerSpecification",
    "introductionContent",
)
# Copied from the slot (pinned at creation).
_SLOT_FIELDS = ("slotId", "kind", "subject", "topicId", "activityId", "activityVersion", "presentation")
# A template slot's instance (`resolved`, C25.1): these fields stand where a FIXED version's would, so the player
# shows and judges it exactly like a FIXED activity. Its generator kind, version and parameters stay on the slot
# (G R10: no generator parameters in a pack).
RESOLVED_FIELDS = ("prompt", "activityPayload", "answerSpecification", "visualAssetReferences")


def resolved_of(slot: Mapping[str, Any]) -> Mapping[str, Any] | None:
    """The slot's materialised template instance, or None (a FIXED activity, or a malformed snapshot)."""
    resolved = slot.get("resolved")
    if isinstance(resolved, Mapping) and all(
        isinstance(resolved.get(name), Mapping | list) for name in RESOLVED_FIELDS
    ):
        return resolved
    return None


def pack_slot(slot: Mapping[str, Any], version: Mapping[str, Any] | None) -> dict[str, Any]:
    """One pack entry. A withdrawn or missing pinned version gives `withdrawn: true` and no definition. For a template
    slot the instance's prompt, payload, answers and pictures fill the definition fields, and `resolved` carries the
    same four fields (and nothing else); it is null for a FIXED slot and whenever the definition is omitted."""
    entry: dict[str, Any] = {name: plain(slot.get(name)) for name in _SLOT_FIELDS}
    entry["resolved"] = None
    entry["intro"] = slot.get("intro")
    clips = slot.get("clips") if isinstance(slot.get("clips"), Mapping) else {}
    entry["clips"] = {
        str(variant): ref.get("clipKey") for variant, ref in sorted(clips.items()) if isinstance(ref, Mapping)
    }
    entry["reward"] = plain(slot.get("reward"))
    withdrawn = version is None or bool(version.get("withdrawn"))
    entry["withdrawn"] = withdrawn
    if not withdrawn and version is not None:
        for name in _VERSION_FIELDS:
            if version.get(name) is not None:
                entry[name] = plain(version[name])
        resolved = resolved_of(slot)
        if resolved is not None:
            entry["resolved"] = {name: plain(resolved[name]) for name in RESOLVED_FIELDS}
            entry.update(entry["resolved"])
    return entry


def pack_body(
    run: Mapping[str, Any],
    slots: Sequence[Mapping[str, Any]],
    versions: Mapping[tuple[str, str], Mapping[str, Any]],
    playable: bool,
) -> dict[str, Any]:
    """The R10 manifest: one entry per UNRESOLVED slot up to plannedThrough, its packStatus, and `packHash`
    (SHA-256 of the canonical body without the hash)."""
    pins = _pins(run)
    planned = int(run.get("plannedThrough") or 0)
    entries: list[dict[str, Any]] = []
    missing: list[dict[str, str]] = []
    for slot in sorted_slots(slots):
        slot_id = str(slot.get("slotId"))
        if slot.get("status") != "UNRESOLVED" or interval_of(slot_id) > planned:
            continue
        version = versions.get((str(slot.get("activityId")), str(slot.get("activityVersion"))))
        entries.append(pack_slot(slot, version))
        if version is None:
            missing.append({"slotId": slot_id, "reason": "VERSION_MISSING"})
        if not playable:
            missing.append({"slotId": slot_id, "reason": "CONTENT_VERSION_UNSUPPORTED"})
    body: dict[str, Any] = {
        "protocolVersion": PROTOCOL_VERSION,
        "runId": str(run["sk"]).removeprefix(RUN_PREFIX),
        "revision": plain(run.get("revision")),
        "plannedThrough": planned,
        "gameData": {
            "rulesetVersion": pins.get("rulesetVersion"),
            "campaignVersion": pins.get("campaignVersion"),
            "assetManifestVersion": pins.get("assetManifestVersion"),
        },
        "slots": entries,
        "packStatus": {"state": "INCOMPLETE" if missing or not playable else "COMPLETE", "missing": missing},
    }
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    body["packHash"] = hashlib.sha256(canonical.encode()).hexdigest()
    return body
