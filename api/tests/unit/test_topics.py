"""The topic registry (contracts/topics.json, plan C19): the loader, and that the file matches its generator."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

from shared import topics
from shared.content import SUBJECTS

REPO = Path(__file__).resolve().parents[3]
GENERATOR = REPO / "scripts" / "gen_topics.py"
sys.path.insert(0, str(GENERATOR.parent))
import gen_topics  # noqa: E402


def test_registry_file_is_up_to_date_with_c19() -> None:
    """CI check: contracts/topics.json is exactly what scripts/gen_topics.py makes from the C19 tables."""
    result = subprocess.run(  # noqa: S603 - fixed arguments, no shell
        [sys.executable, "-B", str(GENERATOR), "--check"], capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stderr


def test_loader_reads_the_repository_file() -> None:
    assert topics.TOPICS_FILE == REPO / "contracts" / "topics.json"
    doc = json.loads(topics.TOPICS_FILE.read_text(encoding="utf-8"))
    assert topics.TOPICS_VERSION == doc["version"] == 1
    assert list(topics.TOPICS) == [entry["topicId"] for entry in doc["topics"]]
    # 99 rows in C19.1-C19.9; 11 topics are shared between two bands, so 88 topics.
    assert len(topics.TOPICS) == 88


def test_every_topic_is_well_formed() -> None:
    order = []
    for topic_id, topic in topics.TOPICS.items():
        assert topic.topic_id == topic_id
        assert re.fullmatch(r"[a-z0-9-]{1,40}", topic_id)
        assert topic.subject in SUBJECTS and topic_id.startswith(f"{topic.subject}-")
        assert 1 <= len(topic.title) <= 60 and topic.description and topic.audio
        assert topic.ages and set(topic.ages) <= {5, 6, 7} and list(topic.ages) == sorted(set(topic.ages))
        assert 1 <= len(topic.curriculum) <= 4
        assert topic.types and set(topic.types) <= {"PS", "NS", "OM", "AR", "MC", "TY"}
        order.append((SUBJECTS.index(topic.subject), topic.ages[0]))
    assert order == sorted(order)  # subject, then first age


def test_known_topics() -> None:
    count = topics.get_topic("maths-count-objects-to10")
    assert count is not None
    assert count.subject == "maths" and count.title == "Count objects to 10" and count.ages == (5,)
    assert count.curriculum[0] == "EYFS26.ELG.Number-1" and count.types == ("NS", "PS", "OM", "TY")
    # Marked (5-6) in C19.4, unmarked in C19.1: one entry with both ages.
    assert topics.TOPICS["maths-bonds-to10"].ages == (5, 6)
    assert topics.TOPICS["spelling-y1-exception-words"].ages == (6, 7)
    assert topics.TOPICS["phonics-gpc-letters-set-a"].title == "GPC letters set A"
    assert topics.TOPICS["maths-count-steps-2-5-10"].title == "Count steps 2, 5, 10"


def test_get_topic_unknown() -> None:
    assert topics.get_topic("maths-made-up") is None
    assert topics.get_topic(None) is None
    assert topics.get_topic(["maths-bonds-to5"]) is None


@pytest.mark.parametrize(
    ("topic_id", "low", "high", "allowed"),
    [
        ("maths-bonds-to10", 5, 6, True),
        ("maths-bonds-to10", 6, 6, True),
        ("maths-bonds-to10", 5, 7, False),
        ("maths-bonds-to5", 5, 5, True),
        ("maths-bonds-to5", 6, 6, False),
        ("maths-bonds-to5", 6, 5, False),
    ],
)
def test_allows_ages(topic_id: str, low: int, high: int, allowed: bool) -> None:
    assert topics.TOPICS[topic_id].allows_ages(low, high) is allowed


def test_title_from_id() -> None:
    assert gen_topics.title_from_id("maths-shape-name-2d-3d", "maths") == "Shape name 2D 3D"
    assert gen_topics.title_from_id("phonics-gpc-phase5-graphemes", "phonics") == "GPC phase 5 graphemes"
    assert gen_topics.title_from_id("spelling-y1-plurals-s-es", "spelling") == "Y1 plurals s es"


def test_generator_merges_shared_topics_and_refuses_bad_tables() -> None:
    header = f"| {' | '.join(gen_topics.COLUMNS)} |\n|{'---|' * len(gen_topics.COLUMNS)}\n"
    dash = gen_topics.EN_DASH

    def table(number: int, age: int, subject: str, rows: list[str]) -> str:
        return f"### C19.{number} Age {age} — {subject} ({len(rows)} topics)\n\n{header}" + "".join(
            f"{row}\n" for row in rows
        )

    one = f"| `maths-a` (5{dash}6) | First | X.1; Y.2 | NS | None | H | e |"
    two = f"| `maths-a` (5{dash}6) | Second | Y.2; Z.3 | MC, NS | Optional | H | e |"
    filler = "| `{s}-f{n}` | d | X.1 | MC | None | H | e |"
    tables = [table(1, 5, "maths", [one])]
    others = [(5, "phonics"), (5, "spelling"), (6, "maths"), (6, "phonics"), (6, "spelling"), (7, "maths")]
    for n, (age, subject) in enumerate([*others, (7, "phonics"), (7, "spelling")], start=2):
        rows = [two] if n == 4 else [filler.format(s=subject, n=n)]
        tables.append(table(n, age, subject, rows))
    registry = gen_topics.build_registry("\n".join(tables))
    merged = next(t for t in registry["topics"] if t["topicId"] == "maths-a")
    assert merged["ages"] == [5, 6] and merged["description"] == "First" and merged["audio"] == "None"
    assert merged["curriculum"] == ["X.1", "Y.2", "Z.3"] and merged["types"] == ["NS", "MC"]

    with pytest.raises(gen_topics.SourceError, match="heading says 2 topics"):
        gen_topics.build_registry("\n".join(tables).replace("(1 topics)", "(2 topics)", 1))
    with pytest.raises(gen_topics.SourceError, match="does not fit"):
        gen_topics.build_registry("\n".join(tables).replace(f"(5{dash}6) | First", f"(6{dash}7) | First"))
