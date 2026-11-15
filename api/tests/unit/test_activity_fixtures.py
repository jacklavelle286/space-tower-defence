"""The admin editor's drafts against admin-api's validation (Phase 39, M3-04).

contracts/fixtures/activities/editor-drafts.json holds one draft per editor kind (all six interaction types, their
modes, and a two-step activity), exactly as web/admin/src/editor/model.ts builds them; web/admin/src/editor/
contract.test.ts proves the editor makes each one from its form. Here the server's own checks must find no problem
in any of them, so the editor and the API agree on the JSON shape of every type. The speech approval check needs the
table and is covered by test_admin_lifecycle.py; this file checks everything that needs only the definition.
"""

from __future__ import annotations

import copy
import json
from typing import Any

import pytest
from conftest import REPO

from shared.activity_types import INTERACTION_TYPES, MODES
from shared.content import definition_problems

FIXTURE = REPO / "contracts" / "fixtures" / "activities" / "editor-drafts.json"
DRAFTS: list[dict[str, Any]] = json.loads(FIXTURE.read_text(encoding="utf-8"))["drafts"]
KINDS = [draft["kind"] for draft in DRAFTS]


def test_every_type_and_mode_has_a_draft() -> None:
    kinds = set(KINDS)
    for interaction_type in INTERACTION_TYPES:
        if interaction_type in MODES:
            assert set(MODES[interaction_type]) <= kinds, interaction_type
        else:
            assert interaction_type in kinds
    assert "TWO_STEP" in kinds
    assert len(KINDS) == len(kinds)


@pytest.mark.parametrize("draft", DRAFTS, ids=KINDS)
def test_editor_draft_validates(draft: dict[str, Any]) -> None:
    definition = draft["definition"]
    assert definition_problems(definition, definition["activityId"]) == []


@pytest.mark.parametrize("draft", DRAFTS, ids=KINDS)
def test_solve_answer_is_accepted(draft: dict[str, Any]) -> None:
    """The answer the editor's preview-solve test gives is one the server would accept as right."""
    assert draft["solve"] in draft["definition"]["answerSpecification"]["accepted"]


def two_step() -> dict[str, Any]:
    return copy.deepcopy(next(d for d in DRAFTS if d["kind"] == "TWO_STEP")["definition"])


def test_part_prompt_is_checked_as_a_prompt() -> None:
    definition = two_step()
    definition["activityPayload"]["partPrompt"] = "<b>Which</b>"
    assert definition_problems(definition, "ma-9110") == [{"field": "activityPayload.partPrompt", "rule": "markup"}]
    definition["activityPayload"]["partPrompt"] = "No"
    assert definition_problems(definition, "ma-9110") == [{"field": "activityPayload.partPrompt", "rule": "length"}]


def test_part_prompt_is_refused_on_a_one_step_activity() -> None:
    definition = two_step()
    del definition["additionalSteps"]
    definition["answerSpecification"] = {"accepted": ["c"]}
    assert definition_problems(definition, "ma-9110") == [
        {"field": "activityPayload.partPrompt", "rule": "additionalProperties"}
    ]
