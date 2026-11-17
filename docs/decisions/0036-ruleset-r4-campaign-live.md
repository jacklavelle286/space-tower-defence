# 0036. Ruleset r4 adds the endless generator; new games play r4 + luna-1-c2; badges are server code
Status: Proposed · Date: 2026-11-17

Context: Gate J (Phases 50-56) brings the 50-wave campaign, meteor offers, badges, challenges, endless and resets.
r3 is published (create-only), so C11's endless numbers cannot be added to it. C15 lists "badge definitions" in the
ruleset, but r3 has none. Playtest P3 and the gate's deploy check (a meteor offer after wave 9 on production) need the
campaign live.

Decision:
- **r4, mechanics 4** = r3 unchanged + `endless` (C11, copied from tools/sim). Mechanics 4 because the generator is a rule
  a mechanics 3 game-core does not have. game-core's `endlessWave` matches every row of the simulator's endless samples.
- **luna-1-c2** = luna-1-c1's map and first-contact + the CAMPAIGN (the simulator's 50 waves) + the three C13 challenges.
  Pads open wave by wave in a campaign (C3.3); a challenge keeps its fixed pads.
- **current.json names r4 + luna-1-c2** (Phase 56). Games already started keep r1 + luna-1-c1.
- **Bounds files** gain fields only when a ruleset needs them, so published files keep their bytes:
  `targetingFromLevel`, `powerAwardRotation` and a CAMPAIGN wave set's `endless {maxBounty, learningReward}`.
- **Endless blocks** are planned by the server (F §3.6, C24.6): K = 10, never a repeat, maths → phonics → spelling
  fallback, no slot when everything is used, nothing above interval 998. An endless wave beyond the bounds table is
  refused (fail closed).
- **Badges are conditions in server code** (`api/shared/badges.py`, C12's table exactly) with names in the player's copy,
  not ruleset data [PROPOSAL].

Alternatives: edit r3 (published: the release refuses changed bytes); a separate endless ruleset without the campaign
switch (P3 could not run on production); badge definitions in a new ruleset (a data format for rules that are each a
small piece of code, with no second consumer).

Consequences: the next release publishes r4, luna-1-c2 and the r4 bounds file (20 KB). Changing a badge rule is a code
change through a release, not a data change. API tests that describe the Milestone 1 pair pin their own pointer
(r1 + luna-1-c1) instead of reading current.json. Tuning after P3 adds r5 / luna-1-c3 with a simulator run behind each
number (Phase 56).

Evidence: web/game-core/src/data/sim-agreement.test.ts (campaign, challenges, endless samples); api/tests/unit
(test_badges, test_endless, test_lifecycle, test_resets); docs/build-phases.md gate log row J.
