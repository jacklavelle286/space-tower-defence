# AM0: can one drawn frame make an acceptable walk? (Gate M)

Spike for the alien maker (AM1; [scope-asset-kinds-and-makers.md §3.2](../plan/scope-asset-kinds-and-makers.md)).
Date: 2026-11-17. **Owner verdict: pending** (fill in at the end).

## What was built

- `web/shared/src/animator/` (`@scd/shared/animator`): `animate(svg)` makes six walk frames from one drawing by
  transforms only, as [art/STYLE.md §11](../../art/STYLE.md) does by hand. The whole drawing leans and squashes about
  the base (x 128, y 250); `antenna-front` and `antenna-back` (STYLE §9 ids) turn about the first point of their own
  path, lagging; `face` drifts 1-2 px. A drawing with no part names still walks: that is the **whole-sprite bob**
  fallback the scope named, with no separate code path.
- The six poses are the hand-drawn Moon Blob's numbers (`WALK`), which are STYLE §11's walk row.
- Tests: from `alien-blob-walk-01` the animator makes exactly the six hand-drawn blob poses; a drawing with no ids
  walks; an antenna turns about its own root (`web/shared/src/animator/animator.test.ts`).
- Preview: `python3 tools/art/am0_sheet.py` renders, for six repository aliens, the hand-drawn walk (top row) and the
  six frames made from frame 01 alone (bottom row): [am0/sheet.png](am0/sheet.png), and an animated GIF per alien with
  hand-drawn on the left and made on the right: [blob](am0/blob.gif), [shell](am0/shell.gif), [slime](am0/slime.gif),
  [guard](am0/guard.gif), [patch](am0/patch.gif), [mite](am0/mite.gif).

## What the sheet shows (Claude's reading; the owner judges)

| Alien | Hand-drawn walk moves | Made walk | Reading |
|---|---|---|---|
| Moon Blob | body lean and squash, antennae, face | the same | Identical (the blob's frames are the table) |
| Split Slime | lobes squash, face | lean and squash, face | Close; reads as the same walk |
| Shellback | legs step, shell steady | shell leans and squashes, legs still | Reads as sliding, not walking |
| Bubble Guard | legs and arm swing, antenna | whole body leans, antenna | Acceptable, stiffer |
| Patchling | feet step, flag sways | everything leans, flag with it | Acceptable; flag pole tilts with the body |
| Meteor Mite | runs, speed lines steady | leans hard; near the right edge the lean pushes the eyes off the canvas | Needs padding: the drawing must leave room to lean |

So: **a squishy, legless alien walks well** from one frame; **a legged one slides**. Two follow-ups would close most of
the gap, both inside AM1 rather than a new spike [PROPOSAL]:
1. Leg stepping: if the drawing names `leg-front` and `leg-back` (or `limbs`), rotate them ±8° in turn about their
   root, as the antennae are. The Alien kind already asks for STYLE §9 ids (`api/functions/picture_gen/kinds/alien.md`).
2. Padding: the Alien kind's framing rule (body 70-75% of the height, centred) leaves room; the maker should refuse a
   drawing whose outline comes within 16 px of the left or right edge, or shrink it, before making frames.

## Every state the renderer asks for, and how a made alien gets it

From `web/player/src/game/assets.ts` and `BattleScene.ts` [VERIFIED by reading, 2026-11-17]:

| Kind | State the renderer draws | Repository art | A made alien (AM1, mechanics 1: no traits) |
|---|---|---|---|
| Alien | movement loop (`alienArt(type).move`): walk, bob, fly or hover, 4-6 frames | one per alien | Walk, made by the animator (fallback: whole sprite, the same code with no part names) |
| Alien | defeat one-shot (`defeat`) | Split Slime's split, Craft's release; every other alien none | None: the shared star-burst pop plays, as for most aliens |
| Alien | flying shadow | Orbit Flutter only | None: no flying trait in mechanics 1 |
| Alien | layers overlay | Bubble Guard (trait) | None: no traits |
| Alien | frost tint when slowed | a tint, no art | Works as it is |
| Boss | a loop per phase, phase cue, bubble | five bosses | Out of scope: no boss maker (scope §3.2) |
| Astronaut | idle and attack per level (3), Nova's beam | six classes | Out of scope: the astronaut maker is not in Gate M (scope §3.3) |

Frames reach the game as PNGs through the asset manifest (LD8: an entry lists one URL per frame), so AM1 renders the
made frames to PNG (as the picture library already does for uploads and drawings) and stores them as one approved set.

## Owner verdict

- [ ] Good enough for the alien maker (with the two follow-ups above in AM1), or
- [ ] Use the whole-sprite bob only (no part motion), or
- [ ] Neither: AM1 must ask for each frame to be drawn (a drawing call per frame; cost and consistency risk)

Notes:
