"""player-api reads a schema 2 planet document (Gate M, LD2): several maps, challenge waves, a map per wave set.

The fixture is web/game-core/src/data/fixtures/schema2-planet.json, the one game-core's tests parse, so both
languages read the same file. player-api only needs each wave set's mode, name, length and presets; game-core's parser
checks the rest at build time.
"""

from __future__ import annotations

import json

from conftest import REPO

from shared.game_data import _parse_planet

FIXTURE = REPO / "web" / "game-core" / "src" / "data" / "fixtures" / "schema2-planet.json"


def test_a_schema_2_document_parses_with_challenge_waves_counted_by_position() -> None:
    data = json.loads(FIXTURE.read_text())
    planet = _parse_planet(data, data["version"])
    sets = {ws.wave_set_id: ws for ws in planet.wave_sets}
    assert sets["blob-rush"].final_wave == 2  # [3, "blob-burst"]: a campaign wave and a challenge wave
    assert sets["blob-rush"].mode == "CHALLENGE"
    assert sets["campaign"].final_wave == 50
    assert len(sets["bubble-trouble"].preset_placements) == 7
