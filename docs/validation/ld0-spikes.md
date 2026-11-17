# LD0 spikes: test players, admin bundle, check run time

Gate M, [Phase LD0](../build-phases.md#phase-ld0--spikes-typescript-bots-admin-bundle-check-run-time). Measured 2026-11-17 on
the development laptop (Intel Core Ultra 7 355, 8 threads, Node 24.22.3). **[VERIFIED by these runs]** unless a line says
otherwise.

How to repeat:

```sh
python3 tools/sim/bot_compare.py > /tmp/py.json                      # Python side, about 35 s on 8 cores
cd web/game-core && PY_RESULTS=/tmp/py.json npx vitest run -c vitest.spike.config.ts --silent=false
```

## 1. Do the TypeScript test players agree with the simulator?

The C17.1 policies are ported to `web/game-core/src/bot/` and play the game's own simulation at 60 ticks per second (the
simulator plays its own model at 30). The competent player runs with the simulator's hand-made Moonbeam plan and with a
plan derived from the map's geometry (`deriveBlueprint`), which is what a new map will get. Live pair: r4 + `luna-1-c2`.
Learning success follows the simulator's fixed pattern; meteor powers are used.

Derived plan for Moonbeam: p01 Nova, p02 Juno, p03 Orion, p04 Orion, p05 Juno, p06 Nova, p07 Sol, p08 Juno, p09 Pip,
p10 Orion, p11 Nova, p12 Pip, p13 Juno, p14 Nova, p15 Mira, p16 Nova (the hand plan shares Juno on p05, p08, p13, Orion on
p04 and Mira on p15).

**Campaign, waves cleared (colony health at the end)**

| Policy | Learning | Python | TS, simulator's plan | TS, derived plan | TS time |
|---|---|---|---|---|---|
| competent | 0% | 50 (20) | 50 (20) | 50 (20) | 19.5 s |
| competent | 60% | 50 (20) | 50 (20) | 50 (20) | 21.9 s |
| competent | 100% | 50 (20) | 50 (20) | 50 (20) | 21.4 s |
| minimal | 0% | 12, defeated in 13 (C17.2) | 12, defeated in 13; no leak in 1-9, leaks in 10 and 11, health 8 after 12 | - | 0.01 s |
| none | 0% | - | 2 (colony health absorbs waves 1-2) | - | <0.01 s |
| presets-only | 0% | - | 2 (the campaign has no presets) | - | <0.01 s |

**Naive child, 20 seeds: min / lower quartile / median / upper quartile / max waves cleared**

| Learning | Python | TS | TS time (20 seeds) |
|---|---|---|---|
| 0% | 29 / 32 / 36 / 39 / 44 | 29 / 31 / 34.5 / 36 / 44 | 3.5 s |
| 60% | 32 / 36 / 39.5 / 44 / 50 | 32 / 36 / 38 / 42 / 49 | 4.2 s |
| 100% | 35 / 36 / 43 / 44 / 50 | 32 / 36 / 40.5 / 43 / 47 | 4.4 s |

**Challenges, competent, waves cleared of the set (health)**: `blob-parade` 5/5, `wobble-rematch` 3/3, `bubble-trouble` 6/6,
health 20, at 0%, 60% and 100%, in Python and in TS with both plans.

Reading it:
- The competent and minimal players agree exactly. The proposed tolerance (competent within ±2 waves of Python at each
  learning rate) is met with no gap, and the derived plan does as well as the hand plan on Moonbeam.
- The naive child is 1.5 to 2.5 waves lower at the median in TS. Seeds do not pair (the generators differ), so only the
  spread can be compared; it sits inside Python's range at every rate. A likely cause is that a purchase made during a
  wave takes effect on the next tick in the game, where the simulator applies it at once **[UNVERIFIED]**. The naive
  result only ever warns (scope §5), so this does not block.
- So the two blocking rules of ADR-0032 (minimal clears 1-5; competent at 0% clears the set) rest on players that
  reproduce the C17 evidence. **Verdict: the bots give a meaningful signal on Moonbeam.** Whether the derived plan judges
  very different maps fairly is checked in LD5 with the known-bad fixtures.

## 2. Admin bundle with game-core

The admin app was built with game-core's parser, battle config and test players imported into its entry (temporary edit,
reverted), against the same build without them.

| Build | Main chunk raw | gzip -9 |
|---|---|---|
| Admin today | 476,951 B | 138,250 B |
| Admin + game-core + bots | 532,563 B | 156,084 B |
| Difference | +55.6 KB | **+17.4 KiB** |

No Phaser comes with it (game-core's purity test forbids it; `web/admin/src/no-phaser.test.ts` still passes). In LD5 the
bots run in a Web Worker, which Vite builds as its own chunk loaded only on the Test tab, so the main admin chunk grows
only by the parser and rules the editor needs [PROPOSAL].

## 3. Run time of a full check

One thread, Node 24: competent at 0/60/100% (63 s together), minimal, none, presets-only, and the naive child for 20 seeds
at three rates (12 s together): **75 s** for the 50-wave campaign. A challenge of 3-6 waves takes about a second per policy.
The competent player's look-ahead trials are almost all of it.

What it sets [PROPOSAL; the owner can change them]:
- **Test tab (LD5).** Run the policies in parallel Workers (one per competent learning rate, one for the naive seeds,
  up to `navigator.hardwareConcurrency - 1`): about 25 s for a campaign on a laptop like this one, with a progress bar and
  Cancel. Budget: 120 s for a campaign, 15 s for a challenge, after which the tab says the check is slow rather than
  failing. A browser is assumed to run V8 code at Node's speed **[UNVERIFIED; measure in LD5]**.
- **Publisher (LD6).** Re-run only the blocking checks (minimal, competent at 0%): about 20 s for a campaign here. Lambda
  CPU at 1769 MB is about one vCPU, slower than this laptop's core by an unknown factor **[UNVERIFIED; measure in LD6]**:
  start with a 300 s timeout, and record the warning results from the Test tab run on the same draft revision
  (`testPlayedDraftRevision`) instead of repeating them.

## Owner decisions

| Question | Proposal |
|---|---|
| Tolerance for the TS competent player | ±2 waves of Python at each learning rate (met with no gap) |
| Naive child 1.5-2.5 waves lower at the median | Accept: it only warns; recheck if a playtest disagrees |
| Budgets | As in section 3 |
