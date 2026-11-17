# AC-42: the first performance measurement (Phase 34, M2-13)

What this is for: the plan asks for "smooth 60 fps with an explicitly measured minimum under the busiest authored wave"
(`prompt.md:1032`). No target can be honest until it is measured on the laptop the children use, before the final art
adds load ([C §C14](../../plan/C-game-and-learning-design.md#c14-performance-budget-feeds-ac-42),
[I §I.3](../../plan/I-validation.md) AC-42). This file holds the procedure and the record; the target then goes into an
ADR that amends C14.

Status: **procedure ready, not yet run**. Figures below are **[UNVERIFIED]** until the owner fills them in.

## Procedure (about 15 minutes, on the children's laptop)

1. On the children's laptop, in the repository: `nvm use`, then
   `npm ci --prefix web && npm run build:perf -w player --prefix web && npm run preview:perf -w player --prefix web`.
   This is a **minified production build** (mode `perf`) that also contains the local battlefield; it is never released.
2. Plug the laptop in, close other apps, use the browser the children use, full screen, at the usual window size.
3. **Scenario (a), C14 (a): wave 37 at 2x with a weak board.** Open
   `http://localhost:4173/play/local?ruleset=r3&roster=all&credits=300&simWave=37&speed=2&perf=1`. Place two or three
   cheap astronauts (a weak board lets the most aliens onto the field), press **Ready** and let the wave finish without
   pausing. Repeat three times.
4. **Scenario (b), C14 (b): the synthetic scene.** Open
   `http://localhost:4173/play/local?ruleset=r3&stress=1&speed=2&perf=1`. Sixteen level-3 astronauts are already
   placed; press **Ready** and let the wave finish. Repeat three times.
5. After each run the frame recorder (top left) shows: minimum fps (the slowest frame), 1%-low fps (the slowest 1% of
   frames), average fps, the slowest frame in ms. Press **Copy the record** and paste it into the table below (or send
   it to Claude).
6. Optional, for the plan's other numbers (`prompt.md:1044`): note the first load and a cached load of
   `aliens.jackgl.com` (browser dev tools, Network, "Load"), and anything that felt slow.

Do not optimise anything during the measurement: the point is the figure as it is (risks: measuring on a faster machine;
art not yet packed into atlases, Phase 64).

## Record

| # | Date | Laptop (model, CPU threads, browser) | Scenario | Speed | Min fps | 1%-low fps | Avg fps | Slowest frame (ms) | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | | | (a) wave 37, weak board | 2x | | | | | |
| 2 | | | (a) | 2x | | | | | |
| 3 | | | (a) | 2x | | | | | |
| 4 | | | (b) stress | 2x | | | | | |
| 5 | | | (b) | 2x | | | | | |
| 6 | | | (b) | 2x | | | | | |

React commits during combat stay at 10 per second or fewer: proven by test (web/player/src/hud/BattlefieldControls.test.tsx,
"commits at most once per 100 ms of frames"), not measured here.

## Then

Claude writes the AC-42 target into an ADR from these figures: the target is the measured 1%-low with a stated margin, so
Phase 67 can check that art and sound did not push the busiest waves below it.
