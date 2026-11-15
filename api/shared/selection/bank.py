"""Reading the published activity bank from the `content` table (spine S8.3 C1/C2, C24.3).

What `player-api` reads, and so what the admin path (Phase 20, M1-19) must write **[ASSUMPTION]**, named after
C22.1 and spine S8.3:

    header   pk "ACT", sk <activityId>
             subject, topicId, rewardCategory (NORMAL | METEOR), minAge, maxAge, interactionType,
             authoringMode (FIXED | TEMPLATE), state (DRAFT | PUBLISHED | RETIRED), publishedVersion
    version  pk "ACT#<activityId>", sk "V#<version>"  (immutable)
             the definition fields of C22.1 at the top level: interactionType, prompt, visualAssetReferences,
             activityPayload, answerSpecification, additionalSteps, introductionContent, and
             speechDefinitionReferences as resolved at publish: {variant: {speechId, speechVersion, clipKey}};
             withdrawn {at, reason} once withdrawn

Selection reads the header partition once (consistent Query, filtered in code) and then only the versions it chose
(one consistent BatchGetItem). Packs and run views read pinned versions the same way.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from shared.data import DynamoTable

HEADER_PK = "ACT"
SUBJECTS = ("maths", "phonics", "spelling")  # also the rotation order (C24.2) and the fallback order (C24.6)
CATEGORIES = ("NORMAL", "METEOR")


def version_key(activity_id: str, version: str) -> tuple[str, str]:
    return (f"ACT#{activity_id}", f"V#{version}")


@dataclass(frozen=True)
class Unit:
    """One selectable unit (C24.4): a published FIXED activity, by its header."""

    activity_id: str
    version: str
    subject: str
    topic_id: str
    category: str
    interaction_type: str


def _int(value: Any) -> int | None:
    return int(value) if isinstance(value, Decimal | int) and not isinstance(value, bool) else None


def units_for_band(headers: Iterable[Mapping[str, Any]], age_band: int) -> list[Unit]:
    """The headers selection may use for `age_band`: PUBLISHED, in age range, FIXED, with a published version.

    TEMPLATE activities are left out until the generator framework exists (Phase 41, C25) **[ASSUMPTION]**: a
    template cannot be materialised without its generator, so selecting one now would pin an unplayable slot.
    """
    units: list[Unit] = []
    for header in headers:
        min_age, max_age = _int(header.get("minAge")), _int(header.get("maxAge"))
        fields = (header.get("sk"), header.get("publishedVersion"), header.get("subject"), header.get("topicId"))
        if not all(isinstance(f, str) and f for f in fields) or min_age is None or max_age is None:
            continue
        if (
            header.get("state") != "PUBLISHED"
            or header.get("authoringMode") != "FIXED"
            or header.get("subject") not in SUBJECTS
            or header.get("rewardCategory") not in CATEGORIES
            or not min_age <= age_band <= max_age
        ):
            continue
        units.append(
            Unit(
                activity_id=str(header["sk"]),
                version=str(header["publishedVersion"]),
                subject=str(header["subject"]),
                topic_id=str(header["topicId"]),
                category=str(header["rewardCategory"]),
                interaction_type=str(header.get("interactionType") or ""),
            )
        )
    units.sort(key=lambda unit: unit.activity_id)
    return units


def read_units(content: DynamoTable, age_band: int) -> list[Unit]:
    """C1: one consistent Query of the whole header partition, filtered in code."""
    return units_for_band(content.query_prefix(HEADER_PK, ""), age_band)


def read_versions(content: DynamoTable, pins: Iterable[tuple[str, str]]) -> dict[tuple[str, str], dict[str, Any]]:
    """C2: the pinned versions `(activityId, version)` that exist, keyed by that pair. A pin with no item is absent
    from the result (the caller treats it exactly like a withdrawn version, spine S8.3)."""
    wanted = {version_key(activity_id, version): (activity_id, version) for activity_id, version in pins}
    found = content.batch_get(list(wanted))
    return {wanted[key]: item for key, item in found.items()}
