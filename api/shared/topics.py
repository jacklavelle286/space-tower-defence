"""The topic registry as data: contracts/topics.json (plan C19).

contracts/topics.json is generated from the C19 tables by scripts/gen_topics.py. It is found the same way
shared/rules/contracts.py finds limits.json: next to shared/ in a Lambda zip (scripts/build_lambdas.py copies it into
contracts/), otherwise in the repository's contracts/.

Topic IDs are append-only: never renamed, never reused (C19). Treat TOPICS as read-only.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from shared.rules.contracts import CONTRACTS_DIR

TOPICS_FILE = CONTRACTS_DIR / "topics.json"


@dataclass(frozen=True)
class Topic:
    """One registry entry. `ages` is the band(s) the topic is taught at; `curriculum` holds the C19 references as
    written (free text, not codes); `types` are the C20 interaction-type abbreviations (PS, NS, OM, AR, MC, TY)."""

    topic_id: str
    subject: str
    title: str
    description: str
    ages: tuple[int, ...]
    curriculum: tuple[str, ...]
    types: tuple[str, ...]
    audio: str

    def allows_ages(self, min_age: int, max_age: int) -> bool:
        """True when every age in min_age..max_age is one of this topic's ages."""
        return min_age <= max_age and all(age in self.ages for age in range(min_age, max_age + 1))


def _topic(entry: dict[str, Any]) -> Topic:
    return Topic(
        topic_id=entry["topicId"],
        subject=entry["subject"],
        title=entry["title"],
        description=entry["description"],
        ages=tuple(entry["ages"]),
        curriculum=tuple(entry["curriculum"]),
        types=tuple(entry["types"]),
        audio=entry["audio"],
    )


def _load() -> tuple[int, dict[str, Topic]]:
    doc = json.loads(TOPICS_FILE.read_text(encoding="utf-8"))
    topics: dict[str, Topic] = {}
    for entry in doc["topics"]:
        topic = _topic(entry)
        if topic.topic_id in topics:
            raise ValueError(f"{TOPICS_FILE.name}: duplicate topicId {topic.topic_id}")
        topics[topic.topic_id] = topic
    return doc["version"], topics


TOPICS_VERSION, TOPICS = _load()
"""TOPICS: topicId -> Topic, in registry order (subject, first age, C19 order)."""


def get_topic(topic_id: object) -> Topic | None:
    """The registry entry for `topic_id`, or None when it is not a registered topic."""
    return TOPICS.get(topic_id) if isinstance(topic_id, str) else None
