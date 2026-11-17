# 0035. The AC-42 performance target, from the first measurement
Status: Proposed · Date: 2026-11-17

Context: AC-42 asks for "smooth 60 fps with an explicitly measured minimum under the busiest authored wave"
(`prompt.md:1032`). C14 leaves the number open until a measurement on the family's machine
([C §C14](../plan/C-game-and-learning-design.md#c14-performance-budget-feeds-ac-42), I.3 AC-42, M2-13). The owner ran the
Phase 34 procedure on the machine the children play on (8 CPU threads, Chrome 150 engine; canvas 1095×602 at
devicePixelRatio 1), in the perf build (minified, placeholder art not yet packed into atlases), on 2026-11-17
([record](../validation/performance/ac42-measurement.md)). Scenario (a), wave 37 at 2x with a weak board: average 60 fps,
1%-low 59.5, minimum 59.5 over 23.8 s. Scenario (b), 60 tough aliens against 16 level-3 astronauts at 2x: average 59.9,
1%-low 53, minimum 29.9 (one 33 ms frame) over 13.7 s.

Decision: the AC-42 target, on that machine and browser, at 2x: **the busiest authored wave (C14 (a)) keeps a 1%-low of at
least 55 fps and an average of at least 58**; **the synthetic scene (C14 (b)) keeps a 1%-low of at least 45 fps**. Single
frames are not targeted: one 33 ms frame among 800 is not visible to a child, and the minimum depends on the browser's own
pauses. The margins (59.5 → 55, 53 → 45) leave room for the final art, sound and effects (Phases 64-66) without hiding a
real regression; Phase 67 measures again against these numbers. This amends C14 by reference: its "target set after the
first measurement" is this ADR.

Alternatives: 60 fps minimum (not met even now by the stress scene, and dominated by one-off browser pauses); no number until
the final art (the plan sets it before art adds load, so a regression can be seen); a target from the headless run on a
build server (no graphics card: it measured 15-21 fps, which says nothing about the children's machine).

Consequences: Phase 67 repeats the procedure (three runs of each scenario) and the target is met or becomes tasks. The first
measurement was one run of each scenario, in the editor's built-in browser (VS Code, Electron, the same Chrome 150 engine);
Phase 67 should use the browser the children open, to confirm. The frame recorder's wave label was fixed after this run (it
named the next wave after a cleared one); the figures are unaffected.

Evidence: docs/validation/performance/ac42-measurement.md (the two copied records); web/player/src/hud/frameStats.ts
(minimum = slowest frame, 1%-low = mean of the slowest 1%); C14.
