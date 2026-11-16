"""Reading the published activity bank from the `content` table (spine S8.3 C1/C2, C24.3).

What `player-api` reads, and so what the admin path (Phase 20, M1-19) must write **[ASSUMPTION]**, named after
C22.1 and spine S8.3:

    header   pk "ACT", sk <activityId>
             subject, topicId, rewardCategory (NORMAL | METEOR | BOTH), minAge, maxAge, interactionType,
             authoringMode (FIXED | TEMPLATE), state (DRAFT | PUBLISHED | RETIRED), publishedVersion,
             domainSize (1 for FIXED; a template's number of instances, written at publish)
    version  pk "ACT#<activityId>", sk "V#<version>"  (immutable)
             the definition fields of C22.1 at the top level: interactionType, prompt, visualAssetReferences,
             activityPayload, answerSpecification, additionalSteps, introductionContent, and
             speechDefinitionReferences as resolved at publish: {variant: {speechId, speechVersion, clipKey}};
             withdrawn {at, reason} once withdrawn; a TEMPLATE version holds `template` in place of prompt,
             activityPayload, answerSpecification and visualAssetReferences (shared/generators)

`rewardCategory` says which slot kinds the activity may fill: NORMAL slots, METEOR slots, or BOTH (either kind;
added 2026-11-16). It never sets the reward: that belongs to the slot (shared/selection/plan.py).

Selection reads the header partition once (consistent Query, filtered in code) and then only the versions it chose
(one consistent BatchGetItem). Packs and run views read pinned versions the same way.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from shared.data import DynamoTable

HEADER_PK = "ACT"
SUBJECTS = ("maths", "phonics", "spelling")  # also the rotation order (C24.2) and the fallback order (C24.6)
SLOT_KINDS = ("NORMAL", "METEOR")
CATEGORIES = (*SLOT_KINDS, "BOTH")  # a header's rewardCategory


def fills(category: str, slot_kind: str) -> bool:
    """True when a unit of `category` may fill a slot of `slot_kind`: its own kind, or any kind for BOTH."""
    return category == slot_kind or category == "BOTH"


def version_key(activity_id: str, version: str) -> tuple[str, str]:
    return (f"ACT#{activity_id}", f"V#{version}")


TEMPLATE_SECOND_UNIT_MIN = 20  # C24.7 counting rule: a template counts 2 if its domainSize >= 20, otherwise 1


def template_units(domain_size: int) -> int:
    """How many units a template gives a run (C24.4 rule 1, C24.7): up to two different instances, two only when its
    domain holds at least 20. Counted in `group_units`, the one counting function for selection and bank status."""
    if domain_size < 1:
        return 0
    return 2 if domain_size >= TEMPLATE_SECOND_UNIT_MIN else 1


@dataclass(frozen=True)
class Unit:
    """One selectable unit (C24.4): a published FIXED activity, or one instance slot of a published TEMPLATE
    (`instance` 0 or 1; the instance itself is drawn when the slot is planned, shared/selection/plan.py)."""

    activity_id: str
    version: str
    subject: str
    topic_id: str
    category: str  # NORMAL | METEOR | BOTH
    interaction_type: str
    instance: int = 0
    template: bool = False
    domain_size: int = field(default=1, compare=False)  # a template's domainSize (C24.7 instance totals); 1 if FIXED

    @property
    def key(self) -> str:
        """What "used once per run" counts: the activity, or the activity's n-th template instance."""
        return f"{self.activity_id}#{self.instance}" if self.template else self.activity_id


def _int(value: Any) -> int | None:
    return int(value) if isinstance(value, Decimal | int) and not isinstance(value, bool) else None


def units_for_band(headers: Iterable[Mapping[str, Any]], age_band: int) -> list[Unit]:
    """The units selection may use for `age_band`: headers PUBLISHED, in age range, with a published version. A FIXED
    activity is one unit; a TEMPLATE gives `template_units(domainSize)` units (a template with no domainSize is left
    out: it was never published by this code)."""
    units: list[Unit] = []
    for header in headers:
        min_age, max_age = _int(header.get("minAge")), _int(header.get("maxAge"))
        fields = (header.get("sk"), header.get("publishedVersion"), header.get("subject"), header.get("topicId"))
        if not all(isinstance(f, str) and f for f in fields) or min_age is None or max_age is None:
            continue
        mode = header.get("authoringMode")
        if (
            header.get("state") != "PUBLISHED"
            or mode not in ("FIXED", "TEMPLATE")
            or header.get("subject") not in SUBJECTS
            or header.get("rewardCategory") not in CATEGORIES
            or not min_age <= age_band <= max_age
        ):
            continue
        count = 1 if mode == "FIXED" else template_units(_int(header.get("domainSize")) or 0)
        for instance in range(count):
            units.append(
                Unit(
                    activity_id=str(header["sk"]),
                    version=str(header["publishedVersion"]),
                    subject=str(header["subject"]),
                    topic_id=str(header["topicId"]),
                    category=str(header["rewardCategory"]),
                    interaction_type=str(header.get("interactionType") or ""),
                    instance=instance,
                    template=mode == "TEMPLATE",
                    domain_size=1 if mode == "FIXED" else _int(header.get("domainSize")) or 0,
                )
            )
    units.sort(key=lambda unit: (unit.activity_id, unit.instance))
    return units


def group_units(units: Iterable[Unit]) -> dict[tuple[str, str], list[Unit]]:
    """THE counting function (C24.7, Phase 42): the units of each group (subject x slot kind), in the order given.

    A unit is in the group of its subject for every slot kind it `fills`, so a BOTH unit is counted in NORMAL and in
    METEOR. Selection builds its queues from these lists (shared/selection/plan.py `choose_units`) and bank status
    counts them (shared/selection/eligibility.py, R30), so the page and the selector can never disagree. A template
    is already one or two units here (`template_units`)."""
    groups: dict[tuple[str, str], list[Unit]] = {(s, k): [] for s in SUBJECTS for k in SLOT_KINDS}
    for unit in units:
        for kind in SLOT_KINDS:
            if unit.subject in SUBJECTS and fills(unit.category, kind):
                groups[(unit.subject, kind)].append(unit)
    return groups


def read_units(content: DynamoTable, age_band: int) -> list[Unit]:
    """C1: one consistent Query of the whole header partition, filtered in code."""
    return units_for_band(content.query_prefix(HEADER_PK, ""), age_band)


def read_versions(content: DynamoTable, pins: Iterable[tuple[str, str]]) -> dict[tuple[str, str], dict[str, Any]]:
    """C2: the pinned versions `(activityId, version)` that exist, keyed by that pair. A pin with no item is absent
    from the result (the caller treats it exactly like a withdrawn version, spine S8.3)."""
    wanted = {version_key(activity_id, version): (activity_id, version) for activity_id, version in pins}
    found = content.batch_get(list(wanted))
    return {wanted[key]: item for key, item in found.items()}
