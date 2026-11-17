# LD13: difficulty curves (Gate M)

Phase LD13 ([build-phases.md](../build-phases.md#phase-ld13--curve-tools);
[scope-level-designer.md §3.3](../plan/scope-level-designer.md#33-tier-3-flexible-routes-and-advanced-authoring)).
Date: 2026-11-17.

**What it is.** Levels → a level that owns the campaign → Waves tab → **Difficulty curve**: a chart and a table of the
campaign's waves against C8's anchors, for a range of waves.

| Column | Against | Source |
|---|---|---|
| Health (the wave's health multiplier) | the toughness curve, x1 at wave 1 to x7 at 50 | C8.1 (the live campaign matches it on all 50 waves: a test) |
| Margin: how much tougher the wave could be before the competent test player (0 % learning, no powers, no purchases during the wave) lets an alien through, found by trial in a Web Worker | the target sawtooth, about 4 at wave 1 to 1.10 at 49, boss waves 8 % below; presets: the campaign's, gentler (+20 %), tougher (-15 %) | C8.1, C8.3 |
| Length at 1x | an ordinary wave 25 s or more, a boss wave 40 to 100 s | C17.5 [ASSUMPTION: the scope's "25 s and 40-100 s bands"] |

**Set health from the toughness curve** puts C8.1's value on each wave of the range. **Set health to meet the margin
target** (after Measure) puts health x margin / target on each, rounded to 0.05 and kept in limits.json's range.
Below the table, the endless waves 51 to 60 the game would make after this campaign (C11).

| Check | Result |
|---|---|
| Exit: setting health from the curve gives margins within 15 % of the target | Pass on waves 6 and 7 of the live campaign (`web/game-core/src/bot/margin.test.ts`) |
| The measured margins agree with the simulator's (C8.2) | Waves 3, 9, 10, 25, 30, 37, 40, 50: within 0.05; the rest within 0.4 (waves 1 and 2 most apart). Lengths agree from wave 3 on (waves 1 and 2 are shorter here: 18 and 20 s against 34 and 38) |
| In a real browser | Chrome on the dev page `web/admin/level-preview.html`: waves 1 to 5 measured in under a second, no errors: [ld13/curve-panel.png](ld13/curve-panel.png). The whole campaign takes about 20 s on one core |

Files: `web/game-core/src/waves/curves.ts` (anchors, targets, bands, the fit; the phase entry named `map/curves.ts`, but
the wave tools live in `waves/`), `web/game-core/src/bot/margin.ts`, `web/admin/src/levels/curves/`.
