# 0033. Ruleset r2 with mechanics 2 holds the six-class roster; current.json stays on r1 until Phase 25
Status: Proposed · Date: 2026-11-16

Context: Phase 24 (M2-01) adds the six classes at three levels with purchase, upgrade, sell, caps and unlock waves
([C §C5](../plan/C-game-and-learning-design.md#c5-astronaut-roster)). r1 is published create-only, so the roster needs a new
ruleset version ([game-data/README.md](../../game-data/README.md)). C15 says a change to a *rule* bumps `mechanics`, and
`game-core` supports a mechanics number forever once a run can pin it ([spine S5.1](../plan/00-spine.md#s51-pins-and-game-data)).
r1's parser knows one attack kind (`single`) and no per-level targeting.

Decision: add `game-data/ruleset/r2.json`, **mechanics 2**, with all six classes copied number for number from
`tools/sim/game_data.json`, including each attack kind's level fields (`slowPct`, `splashRadius`, `shieldPoints`, `buffPct`,
...) and `targetingFromLevel`. Colony, alien, economy, sell and caps are r1's, unchanged. Mechanics 2 is a rule change: five
attack kinds with their own level shapes, modes that open at a level (Orion's STRONG at 3, C5.3), classes that do not aim
(Mira, Sol: no modes; their placements store `FRONT` because the snapshot schema requires a mode), and unlock waves applied
in a CAMPAIGN wave set (C5.9; a CHALLENGE keeps its fixed list, C13). Phase 24 simulates `single` and `blast` fully;
`slow` deals its damage, and `shield`/`buff` stand without effect until Phase 25 (M2-02) adds C5.4–C5.6.
`current.json` keeps naming r1 + luna-1-c1.

Alternatives: edit r1 (published; the release refuses changed bytes); r2 with only costs, ranges and damage, and r3 for the
support values in Phase 25 (an r2 whose Mira does nothing by design, and one more version for no gain); mechanics 1 for r2
(the r1 parser and simulation cannot express the new kinds, so old clients would mis-simulate).

Consequences: mechanics 2 is complete only after Phase 25, so **current.json must not name r2 before Phase 25's gate**.
Until then no run can pin r2: the release writes a bounds file only for the current pair, and `POST /api/runs` refuses a
pair without one (`CONTENT_VERSION_UNSUPPORTED`). The next release publishes r2.json create-only; if Phase 25 needs a data
change after that (for example the slow cap in the ruleset), it adds r3. Switching to r2 (or r3) needs: the support rules
done; a planet document whose wave sets list the new classes (luna-1-c1's `first-contact` lists only Nova, so switching
changes nothing visible until such a document exists); the bounds fixture regenerated (`--write-fixture`); `player-api`'s
S6 checks reviewed for `targetingFromLevel` (M2-07). Bounds list `FRONT` as the only valid mode for Mira and Sol.

Amended in Phase 25 (M2-02), before r2 was published: r2 gains a top-level `slow` block, `capPct` 50
(the simulator's `combatRules.slow.capPct`) and `refreshWithinSeconds` 0.15 (the threshold in the simulator's Pip
preference, `sim.py` `Game._pick`), required in mechanics 2 and refused in mechanics 1; and CROWD is accepted only for a
`blast` class. Mira's and Sol's numbers were already in r2. So no r3 is needed for Phase 25.

Evidence: **[VERIFIED]** 2026-11-16: `web/game-core/src/data/sim-agreement.test.ts` checks every r2 number against
`tools/sim/game_data.json` and every price, cumulative cost and refund against the simulator's C5.2 table;
`web/game-core/src/sim/economy.test.ts` (Phase 24 rules); `node game-core/scripts/build-bounds.ts --check` passes with r2 present.
