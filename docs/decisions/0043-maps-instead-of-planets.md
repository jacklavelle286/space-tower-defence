# 0043. Maps instead of planets: each map is its own adventure, all open from the start
Status: Proposed · Date: 2026-11-20

Context: the owner made a level called "Fire Planet" on the Moon with "The 50 campaign waves" ticked and published it,
expecting a new planet on Home; instead it replaced the Moon's campaign map and waves for new games (luna-1-a2;
[VERIFIED] in current.json and the content table, 2026-11-20). Planets (ADR-0039, ADR-0040) put a layer between a map and
what children see: a level goes onto a planet, one level owns that planet's campaign, others add challenges, and a planet
is released separately. The owner, 2026-11-20: "drop the concept of planets - and just do maps as i think its overly
complicated"; chosen: "Each map is its own adventure" and "All open from the start".

Decision: the admin site speaks only of maps. A map is one level on its own planet, which the admin makes and releases
for the operator: New map creates the planet (planetId = the level ID, look "moon", the chosen backdrop) and the level,
which always holds its 50-wave adventure (made, or the Moon's); publishing a map whose planet is not released yet
releases it straight after (R56), so publish means "on Home". Home lists every released map with its adventure first,
then its challenges, and every map is open from the start: `player-api` reports each released planet unlocked and no
longer refuses a run with PLANET_LOCKED (it was the wave-20 unlock of spine S8.1). The Moon (luna-1, the repository map)
stays the first map. Older levels on the Moon get "Make it its own map" (a draft moves, a published level is copied).
The Planets page, Make a planet for me and Copy/Move to planet leave the admin. Game data, routes and infrastructure do
not change: the planet document, current.json schema 2 and the planet routes stay as they are, used underneath.

Alternatives: keep one adventure with challenges on many maps and hide planets only in the admin (smallest change, but
"which map is the adventure's" stays a trap); remove planets from the game data too (a schema change to every reader,
the publisher and saved games, for no visible gain).

Consequences: amends ADR-0040 (planets are made and released by the admin, not by hand) and spine S8.1 (no unlock
order); current.json order is now only the order maps are listed. Release stays irreversible, so a published map stays
on Home (its wave sets can be retired in Versions). A level ID is limited to 34 characters for a new map (a planet's
versions are `<planetId>-a<n>` within 40). Challenges that older Moon levels put on the Moon stay on the Moon until
retired in Versions.

Evidence: `api/tests/unit/test_runs.py` (a second released planet starts a run without progress),
`api/tests/unit/test_current.py` (both listed open); admin tests named in build-phases.md LD22.
