# Space Colony Defence - simulator results

**Read this first.** These tables come from a coarse headless model played by two heuristic 'players'. They are evidence for choosing INITIAL PLAYTEST SETTINGS. They are NOT validation with real children, and they say nothing about fun, readability, reading load or motor skills.

## How to re-run

```
cd tools/sim
python3 make_data.py     # writes game_data.json from the authored tables
python3 selftest.py      # invariants: caps, bounty accounting, sell/rebuy, determinism
python3 run_matrix.py    # about two and a half minutes on 8 cores; writes results.json
python3 tables.py --results   # writes tables.json and this file
python3 build_report.py  # rebuilds the design report from the template and the tables
python3 sim.py competent 0.6 1 1   # one campaign printed wave by wave: policy, learning success, meteor used (1/0), seed
python3 tune.py          # margin before every wave for the competent policy (add --adapt to re-tune; writes tuned.json)
```

## The two heuristic players

- **Competent**: follows a blueprint of which class suits which pad, holds a cheap Nova on a pad until the planned class unlocks, and orders its purchases greedily: before each purchase it test-plays the next two waves made tougher on a copy of the board and buys the affordable step with the most extra damage per credit. It buys during waves, buys Mira when the colony has leaked, and keeps meteor powers for bosses. It uses default targeting.
- **Naive child**: random open pad, 50% newest class / 30% cheapest / 20% random (if it cannot afford its choice it waits half the time, otherwise buys something it can afford), one to three purchases per preparation phase while pads are free, skips buying in 25% of preparation phases, upgrades with probability 0.15 (0.30 once every pad is full), makes one extra purchase attempt during 20% of waves, never sells, never changes targeting, uses a meteor power at a random moment of a boss wave 70% of the time (10% in other waves). Twenty seeds.
- **Learning success** 0%, 60%, 100%: each normal activity pays its reward with that probability (competent runs use an evenly spread pattern so they are repeatable; naive runs use seeded random outcomes). When powers are 'used', a meteor challenge succeeds with the same probability in the random-outcome runs, and always succeeds at 60% and 100% in the fixed-pattern competent runs; at 0% no power is ever earned, so the two 0% rows are identical by construction.
- **Margin**: the largest multiplier on every health value in a wave that the present board still stops with no leak and no further purchases. Margin 1.10 means the wave could be 10% tougher before the first leak.

## Competent player: main matrix

| Policy | Learning success | Outcome pattern | Meteor powers | Waves cleared | Colony health at end | Total leak damage | Bosses 10-50 (K = defeated, L = leaked) | Credits invested at end | Credits unspent | Bounty earned | Learning credits earned | Combat time at 1x (min) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| competent | 0% | pattern | unused | 50 | 20 | 0 | KKKKK | 4570 | 407 | 5037 | 0 | 40 |
| competent | 0% | pattern | used | 50 | 20 | 0 | KKKKK | 4570 | 407 | 5037 | 0 | 40 |
| competent | 60% | pattern | unused | 50 | 20 | 0 | KKKKK | 6030 | 402 | 5037 | 1500 | 38 |
| competent | 60% | pattern | used | 50 | 20 | 0 | KKKKK | 6030 | 402 | 5037 | 1500 | 37 |
| competent | 100% | pattern | unused | 50 | 20 | 0 | KKKKK | 6990 | 462 | 5037 | 2520 | 35 |
| competent | 100% | pattern | used | 50 | 20 | 0 | KKKKK | 6990 | 462 | 5037 | 2520 | 35 |
| competent | 60% | random, seed 1 | unused | 50 | 20 | 0 | KKKKK | 6330 | 367 | 5037 | 1765 | 37 |
| competent | 60% | random, seed 2 | unused | 50 | 20 | 0 | KKKKK | 6330 | 327 | 5037 | 1705 | 36 |
| competent | 60% | random, seed 3 | unused | 50 | 20 | 0 | KKKKK | 6000 | 372 | 5037 | 1420 | 37 |
| competent | 60% | random, seed 4 | unused | 50 | 20 | 0 | KKKKK | 6000 | 472 | 5037 | 1540 | 38 |
| competent | 60% | random, seed 5 | unused | 50 | 20 | 0 | KKKKK | 6030 | 337 | 5037 | 1435 | 37 |

## Naive child: distribution over seeds

| Policy | Learning success | Meteor powers | Seeds | Min waves cleared | Lower quartile | Median | Upper quartile | Max | Cleared >= 20 | Cleared >= 30 | Cleared 50 | Mean credits unspent at end |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| naive child (rarely upgrades) | 0% | unused | 20 | 29 | 32 | 36.0 | 40 | 44 | 20/20 | 19/20 | 0/20 | 903 |
| naive child (rarely upgrades) | 0% | used | 20 | 29 | 32 | 36.0 | 40 | 44 | 20/20 | 19/20 | 0/20 | 903 |
| naive child (rarely upgrades) | 60% | unused | 20 | 32 | 36 | 42.0 | 44 | 50 | 20/20 | 20/20 | 1/20 | 2236 |
| naive child (rarely upgrades) | 60% | used | 20 | 33 | 38 | 43.0 | 45 | 50 | 20/20 | 20/20 | 1/20 | 2312 |
| naive child (rarely upgrades) | 100% | unused | 20 | 31 | 38 | 41.0 | 44 | 49 | 20/20 | 20/20 | 0/20 | 2974 |
| naive child (rarely upgrades) | 100% | used | 20 | 35 | 37 | 43.0 | 44 | 50 | 20/20 | 20/20 | 1/20 | 2998 |
| same child, but always upgrades once every pad is full | 0% | unused | 20 | 36 | 45 | 50.0 | 50 | 50 | 20/20 | 20/20 | 11/20 | 480 |
| same child, but always upgrades once every pad is full | 60% | unused | 20 | 47 | 50 | 50.0 | 50 | 50 | 20/20 | 20/20 | 19/20 | 1325 |
| naive child, variant: all 16 pads open from wave 1 | 60% | unused | 20 | 31 | 32 | 35.5 | 39 | 44 | 20/20 | 20/20 | 0/20 | 1950 |

## Naive child at 60%: what happened at each boss

| Learning success | Meteor powers | Boss wave | Runs that reached it (of 20) | Boss defeated | Boss reached the colony | Run survived the wave |
|---|---|---|---|---|---|---|
| 60% | unused | 10 | 20 | 20 | 0 | 20 |
| 60% | unused | 20 | 20 | 20 | 0 | 20 |
| 60% | unused | 30 | 20 | 13 | 7 | 20 |
| 60% | unused | 40 | 14 | 12 | 2 | 14 |
| 60% | unused | 50 | 2 | 0 | 2 | 1 |
| 60% | used | 10 | 20 | 20 | 0 | 20 |
| 60% | used | 20 | 20 | 19 | 1 | 20 |
| 60% | used | 30 | 20 | 13 | 7 | 20 |
| 60% | used | 40 | 14 | 12 | 2 | 13 |
| 60% | used | 50 | 1 | 0 | 1 | 1 |

## Ablations: class bans, policy options, tick rate, pad staging

| Variant (competent policy, no meteor powers) | Learning success | Waves cleared | Colony health at end | Total leak damage | Bosses 10-50 (K = defeated, L = leaked) | Credits invested | Share of damage by class |
|---|---|---|---|---|---|---|---|
| without Pip | 0% | 50 | 20 | 1 | KKKKK | 4800 | Nova 49.5%, Juno 28.7%, Orion 21.7% |
| without Pip | 60% | 50 | 20 | 0 | KKKKK | 6130 | Nova 49.5%, Juno 28.9%, Orion 21.6% |
| without Juno | 0% | 50 | 11 | 62 | KKKKK | 4540 | Nova 66.0%, Orion 28.1%, Pip 5.9% |
| without Juno | 60% | 50 | 20 | 5 | KKKKK | 6030 | Nova 65.5%, Orion 29.6%, Pip 4.9% |
| without Orion | 0% | 50 | 20 | 0 | KKKKK | 4740 | Nova 59.1%, Juno 35.6%, Pip 5.3% |
| without Orion | 60% | 50 | 20 | 0 | KKKKK | 5970 | Nova 59.9%, Juno 34.9%, Pip 5.2% |
| without Mira | 0% | 50 | 20 | 0 | KKKKK | 4850 | Juno 35.8%, Nova 34.8%, Orion 24.4%, Pip 5.0% |
| without Mira | 60% | 50 | 20 | 0 | KKKKK | 6300 | Juno 38.5%, Nova 33.9%, Orion 22.7%, Pip 5.0% |
| without Sol | 0% | 50 | 20 | 0 | KKKKK | 4810 | Nova 40.7%, Juno 31.6%, Orion 22.5%, Pip 5.2% |
| without Sol | 60% | 50 | 20 | 0 | KKKKK | 6270 | Nova 41.7%, Juno 31.9%, Orion 21.4%, Pip 5.0% |
| Nova only (all five other classes removed) | 0% | 50 | 4 | 19 | KKKKK | 4160 | Nova 100.0% |
| Nova only (all five other classes removed) | 60% | 50 | 4 | 19 | KKKKK | 4160 | Nova 100.0% |
| no in-wave buying | 0% | 50 | 20 | 0 | KKKKK | 4670 | Juno 37.3%, Nova 32.9%, Orion 24.7%, Pip 5.2% |
| Orion L3 set to STRONG | 0% | 50 | 20 | 4 | KKKKK | 4710 | Juno 34.9%, Nova 31.2%, Orion 28.6%, Pip 5.3% |
| no selling (no swaps) | 0% | 50 | 20 | 0 | KKKKK | 4830 | Nova 74.3%, Juno 20.2%, Pip 5.5% |
| 60 Hz simulation tick | 0% | 50 | 20 | 0 | KKKKK | 4570 | Juno 36.0%, Nova 34.6%, Orion 24.3%, Pip 5.2% |
| 60 Hz simulation tick, 60% | 60% | 50 | 20 | 0 | KKKKK | 6030 | Juno 39.0%, Nova 34.6%, Orion 21.5%, Pip 5.0% |
| all 16 pads open from wave 1 | 0% | 50 | 20 | 9 | KKKKK | 4640 | Nova 38.2%, Juno 33.3%, Orion 23.4%, Pip 5.1% |

## Boss waves: margin of differently restricted boards (1.00 or more = the boss wave is stopped with no leak, no purchases during the wave, no powers)

| Board built by the competent policy (no meteor powers) | Learning success | Wave 10 King Wobble | Wave 20 Captain Clank | Wave 30 Queen Bubbla | Wave 40 The Mothership | Wave 50 The Great Glorp |
|---|---|---|---|---|---|---|
| all six classes (reference) | 0% | 2.07 | 1.63 | 1.56 | 1.3 | 1.16 |
| all six classes (reference) | 60% | 2.6 | 1.8 | 1.89 | 1.48 | 1.45 |
| without Pip | 0% | 2.05 | 1.25 | 1.53 | 1.27 | 1.21 |
| without Pip | 60% | 2.53 | 2.32 | 2.0 | 1.53 | 1.48 |
| without Juno | 0% | 2.07 | 1.92 | 1.73 | 1.38 | 1.39 |
| without Juno | 60% | 2.6 | 2.74 | 2.2 | 1.85 | 1.89 |
| without Orion | 0% | 2.07 | 1.18 | 1.06 | 1.07 | 1.06 |
| without Orion | 60% | 2.6 | 1.32 | 1.53 | 1.27 | 1.2 |
| without Mira | 0% | 2.07 | 1.63 | 1.56 | 1.33 | 1.31 |
| without Mira | 60% | 2.6 | 1.8 | 1.89 | 1.55 | 1.7 |
| without Sol | 0% | 2.07 | 1.63 | 1.62 | 1.3 | 1.21 |
| without Sol | 60% | 2.6 | 1.8 | 1.9 | 1.47 | 1.42 |
| Nova only | 0% | 2.05 | 1.43 | 1.35 | 1.29 | 1.2 |
| Nova only | 60% | 2.53 | 1.82 | 1.88 | 1.55 | 1.2 |

## Margin before each wave

| Wave | Target margin used for tuning | Margin, competent 0% learning | Margin, competent 60% learning |
|---|---|---|---|
| 1 | 4.0 | 4.59 | 4.59 |
| 2 | 3.75 | 3.19 | 3.19 |
| 3 | 3.5 | 9.12 | 9.12 |
| 4 | 3.25 | 3.27 | 3.99 |
| 5 | 3.0 | 3.48 | 4.18 |
| 6 | 2.9 | 4.33 | 4.83 |
| 7 | 2.8 | 3.02 | 3.28 |
| 8 | 2.7 | 7.72 | 9.64 |
| 9 | 2.6 | 3.12 | 3.74 |
| 10 | 2.0 | 2.07 | 2.6 |
| 11 | 2.4 | 2.87 | 3.15 |
| 12 | 2.35 | 5.93 | 8.77 |
| 13 | 2.3 | 2.62 | 2.74 |
| 14 | 2.25 | 7.16 | 9.89 |
| 15 | 2.2 | 2.58 | 3.74 |
| 16 | 2.15 | 2.19 | 2.96 |
| 17 | 2.1 | 2.29 | 3.07 |
| 18 | 2.05 | 2.09 | 2.83 |
| 19 | 2.0 | 2.22 | 2.92 |
| 20 | 1.6 | 1.63 | 1.8 |
| 21 | 1.85 | 2.3 | 2.76 |
| 22 | 1.81 | 2.18 | 2.36 |
| 23 | 1.78 | 1.9 | 2.48 |
| 24 | 1.74 | 3.69 | 4.36 |
| 25 | 1.7 | 1.76 | 2.17 |
| 26 | 1.66 | 1.79 | 2.34 |
| 27 | 1.62 | 2.75 | 3.25 |
| 28 | 1.59 | 1.66 | 1.93 |
| 29 | 1.55 | 1.49 | 1.87 |
| 30 | 1.35 | 1.56 | 1.89 |
| 31 | 1.45 | 1.46 | 1.93 |
| 32 | 1.43 | 1.47 | 1.72 |
| 33 | 1.41 | 1.48 | 1.82 |
| 34 | 1.39 | 1.48 | 1.81 |
| 35 | 1.36 | 1.59 | 1.75 |
| 36 | 1.34 | 1.41 | 1.61 |
| 37 | 1.32 | 1.34 | 1.59 |
| 38 | 1.3 | 1.36 | 1.63 |
| 39 | 1.28 | 1.32 | 1.63 |
| 40 | 1.18 | 1.3 | 1.48 |
| 41 | 1.22 | 1.31 | 1.89 |
| 42 | 1.21 | 1.17 | 1.53 |
| 43 | 1.19 | 1.23 | 1.52 |
| 44 | 1.18 | 1.17 | 1.51 |
| 45 | 1.16 | 1.13 | 1.55 |
| 46 | 1.15 | 1.19 | 1.55 |
| 47 | 1.13 | 1.18 | 1.37 |
| 48 | 1.11 | 1.08 | 1.29 |
| 49 | 1.1 | 1.18 | 1.25 |
| 50 | 1.06 | 1.16 | 1.45 |

## Wave durations and total combat time

| Measure (competent policy, 1x speed) | 0% learning | 60% | 100% |
|---|---|---|---|
| Shortest ordinary wave (s) | 24 | 21 | 21 |
| Longest ordinary wave (s) | 83 | 71 | 72 |
| Ordinary waves shorter than 25 s | 4 | 5 | 5 |
| Boss waves 10/20/30/40/50 (s) | 50 / 58 / 62 / 75 / 92 | 38 / 65 / 58 / 66 / 84 | 35 / 44 / 56 / 62 / 66 |
| Total campaign combat time (min) | 40.4 | 37.5 | 35.4 |

## Busiest authored waves

| Wave | Aliens scheduled | With descendants | Peak concurrent aliens (competent, 0%) | Worst peak in any campaign scenario | Worst peak of live descendants | Most astronaut shots in one second |
|---|---|---|---|---|---|---|
| 37 | 46 | 46 | 39 | 44 | 0 | 21 |
| 31 | 62 | 62 | 29 | 43 | 0 | 21 |
| 42 | 46 | 58 | 28 | 43 | 8 | 22 |
| 48 | 55 | 63 | 32 | 42 | 8 | 28 |
| 33 | 71 | 79 | 33 | 41 | 8 | 18 |
| 39 | 45 | 49 | 27 | 41 | 4 | 22 |

## Tick-rate check

| Simulation tick | Waves cleared | Health at end | Total leak damage | Credits invested | Combat time (min) |
|---|---|---|---|---|---|
| 30 per second (used for the matrix) | 50 | 20 | 0 | 4570 | 40.4 |
| 60 per second (the proposed game tick) | 50 | 20 | 0 | 4570 | 40.3 |

## Credits earned and spent per wave: competent player at 0%, 60% and 100% learning (no meteor powers)

| Wave | Bounty available | 0%: learning reward before wave | 0%: bounty earned | 0%: spent | 0%: sell refunds | 0%: credits after wave | 60%: learning reward | 60%: bounty | 60%: spent | 60%: refunds | 60%: credits after | 100%: learning reward | 100%: bounty | 100%: spent | 100%: refunds | 100%: credits after |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 24 | 0 | 24 | 150 | 0 | 24 | 0 | 24 | 150 | 0 | 24 | 0 | 24 | 150 | 0 | 24 |
| 2 | 32 | 0 | 32 | 50 | 0 | 6 | 0 | 32 | 50 | 0 | 6 | 30 | 32 | 50 | 0 | 36 |
| 3 | 16 | 0 | 16 | 0 | 0 | 22 | 30 | 16 | 50 | 0 | 2 | 30 | 16 | 50 | 0 | 32 |
| 4 | 36 | 0 | 36 | 50 | 0 | 8 | 0 | 36 | 0 | 0 | 38 | 30 | 36 | 50 | 0 | 48 |
| 5 | 46 | 0 | 46 | 50 | 0 | 4 | 30 | 46 | 110 | 0 | 4 | 30 | 46 | 120 | 0 | 4 |
| 6 | 15 | 0 | 15 | 0 | 0 | 19 | 30 | 15 | 0 | 0 | 49 | 30 | 15 | 0 | 0 | 49 |
| 7 | 34 | 0 | 34 | 0 | 0 | 53 | 0 | 34 | 50 | 0 | 33 | 30 | 34 | 50 | 0 | 63 |
| 8 | 18 | 0 | 18 | 50 | 0 | 21 | 30 | 18 | 60 | 0 | 21 | 30 | 18 | 60 | 0 | 51 |
| 9 | 74 | 0 | 74 | 60 | 0 | 35 | 0 | 74 | 60 | 0 | 35 | 30 | 74 | 120 | 0 | 35 |
| 10 | 82 | 0 | 82 | 60 | 0 | 57 | 30 | 82 | 60 | 0 | 87 | 30 | 82 | 120 | 0 | 27 |
| 11 | 102 | 0 | 102 | 280 | 150 | 29 | 40 | 102 | 340 | 150 | 39 | 40 | 102 | 280 | 150 | 39 |
| 12 | 21 | 0 | 21 | 0 | 0 | 50 | 0 | 21 | 0 | 0 | 60 | 40 | 21 | 60 | 0 | 40 |
| 13 | 90 | 0 | 90 | 110 | 0 | 30 | 40 | 90 | 170 | 0 | 20 | 40 | 90 | 110 | 0 | 60 |
| 14 | 20 | 0 | 20 | 0 | 0 | 50 | 0 | 20 | 0 | 0 | 40 | 40 | 20 | 80 | 0 | 40 |
| 15 | 64 | 0 | 64 | 60 | 0 | 54 | 40 | 64 | 120 | 0 | 24 | 40 | 64 | 0 | 0 | 144 |
| 16 | 39 | 0 | 39 | 50 | 0 | 43 | 40 | 39 | 50 | 0 | 53 | 40 | 39 | 270 | 75 | 28 |
| 17 | 82 | 0 | 82 | 110 | 0 | 15 | 0 | 82 | 80 | 0 | 55 | 40 | 82 | 80 | 0 | 70 |
| 18 | 76 | 0 | 76 | 60 | 0 | 31 | 40 | 76 | 220 | 75 | 26 | 40 | 76 | 170 | 75 | 91 |
| 19 | 117 | 0 | 117 | 170 | 75 | 53 | 0 | 117 | 80 | 0 | 63 | 40 | 117 | 290 | 75 | 33 |
| 20 | 97 | 0 | 97 | 60 | 0 | 90 | 40 | 97 | 120 | 0 | 80 | 40 | 97 | 0 | 0 | 170 |
| 21 | 123 | 0 | 123 | 180 | 0 | 33 | 50 | 123 | 240 | 0 | 13 | 50 | 123 | 220 | 0 | 123 |
| 22 | 60 | 0 | 60 | 60 | 0 | 33 | 0 | 60 | 50 | 0 | 23 | 50 | 60 | 170 | 0 | 63 |
| 23 | 84 | 0 | 84 | 60 | 0 | 57 | 50 | 84 | 60 | 0 | 97 | 50 | 84 | 130 | 0 | 67 |
| 24 | 20 | 0 | 20 | 60 | 0 | 17 | 0 | 20 | 0 | 0 | 117 | 50 | 20 | 0 | 0 | 137 |
| 25 | 88 | 0 | 88 | 60 | 0 | 45 | 50 | 88 | 150 | 0 | 105 | 50 | 88 | 150 | 0 | 125 |
| 26 | 114 | 0 | 114 | 170 | 75 | 64 | 50 | 114 | 340 | 150 | 79 | 50 | 114 | 260 | 0 | 29 |
| 27 | 44 | 0 | 44 | 170 | 75 | 13 | 0 | 44 | 0 | 0 | 123 | 50 | 44 | 100 | 0 | 23 |
| 28 | 69 | 0 | 69 | 60 | 0 | 22 | 50 | 69 | 110 | 0 | 132 | 50 | 69 | 0 | 0 | 142 |
| 29 | 133 | 0 | 133 | 140 | 0 | 15 | 0 | 133 | 150 | 0 | 115 | 50 | 133 | 300 | 0 | 25 |
| 30 | 126 | 0 | 126 | 0 | 0 | 141 | 50 | 126 | 100 | 0 | 191 | 50 | 126 | 0 | 0 | 201 |
| 31 | 178 | 0 | 178 | 260 | 0 | 59 | 60 | 178 | 300 | 0 | 129 | 60 | 178 | 390 | 0 | 49 |
| 32 | 82 | 0 | 82 | 130 | 0 | 11 | 0 | 82 | 200 | 0 | 11 | 60 | 82 | 150 | 0 | 41 |
| 33 | 151 | 0 | 151 | 0 | 0 | 162 | 60 | 151 | 170 | 0 | 52 | 60 | 151 | 170 | 0 | 82 |
| 34 | 160 | 0 | 160 | 150 | 0 | 172 | 0 | 160 | 150 | 0 | 62 | 60 | 160 | 200 | 0 | 102 |
| 35 | 92 | 0 | 92 | 150 | 0 | 114 | 60 | 92 | 150 | 0 | 64 | 60 | 92 | 150 | 0 | 104 |
| 36 | 76 | 0 | 76 | 260 | 75 | 5 | 60 | 76 | 160 | 180 | 220 | 60 | 76 | 290 | 180 | 130 |
| 37 | 165 | 0 | 165 | 0 | 0 | 170 | 0 | 165 | 260 | 0 | 125 | 60 | 165 | 260 | 0 | 95 |
| 38 | 154 | 0 | 154 | 300 | 0 | 24 | 60 | 154 | 260 | 0 | 79 | 60 | 154 | 260 | 0 | 49 |
| 39 | 134 | 0 | 134 | 150 | 0 | 8 | 0 | 134 | 150 | 0 | 63 | 60 | 134 | 150 | 0 | 93 |
| 40 | 195 | 0 | 195 | 150 | 0 | 53 | 60 | 195 | 0 | 0 | 318 | 60 | 195 | 330 | 0 | 18 |
| 41 | 191 | 0 | 191 | 200 | 0 | 44 | 75 | 191 | 520 | 0 | 64 | 75 | 191 | 130 | 0 | 154 |
| 42 | 127 | 0 | 127 | 130 | 0 | 41 | 0 | 127 | 0 | 0 | 191 | 75 | 127 | 260 | 0 | 96 |
| 43 | 87 | 0 | 87 | 0 | 0 | 128 | 75 | 87 | 150 | 0 | 203 | 75 | 87 | 0 | 0 | 258 |
| 44 | 215 | 0 | 215 | 180 | 0 | 163 | 0 | 215 | 330 | 0 | 88 | 75 | 215 | 280 | 0 | 268 |
| 45 | 131 | 0 | 131 | 260 | 0 | 34 | 75 | 131 | 260 | 0 | 34 | 75 | 131 | 280 | 0 | 194 |
| 46 | 237 | 0 | 237 | 170 | 0 | 101 | 75 | 237 | 280 | 0 | 66 | 75 | 237 | 300 | 0 | 206 |
| 47 | 126 | 0 | 126 | 0 | 0 | 227 | 0 | 126 | 0 | 0 | 192 | 75 | 126 | 330 | 0 | 77 |
| 48 | 202 | 0 | 202 | 410 | 0 | 19 | 75 | 202 | 430 | 0 | 39 | 75 | 202 | 100 | 0 | 254 |
| 49 | 168 | 0 | 168 | 0 | 0 | 187 | 0 | 168 | 100 | 0 | 107 | 75 | 168 | 330 | 0 | 167 |
| 50 | 220 | 0 | 220 | 0 | 0 | 407 | 75 | 220 | 0 | 0 | 402 | 75 | 220 | 0 | 0 | 462 |
| Total | 5037 | 0 | 5037 | 5230 | 450 |  | 1500 | 5037 | 6840 | 555 |  | 2520 | 5037 | 7800 | 555 |  |

## Credits earned and spent per wave: competent player at 0%, 60% and 100% learning (meteor powers used; at 0% no power is ever earned, so those columns equal the unused run)

| Wave | Bounty available | 0%: learning reward before wave | 0%: bounty earned | 0%: spent | 0%: sell refunds | 0%: credits after wave | 60%: learning reward | 60%: bounty | 60%: spent | 60%: refunds | 60%: credits after | 100%: learning reward | 100%: bounty | 100%: spent | 100%: refunds | 100%: credits after |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 24 | 0 | 24 | 150 | 0 | 24 | 0 | 24 | 150 | 0 | 24 | 0 | 24 | 150 | 0 | 24 |
| 2 | 32 | 0 | 32 | 50 | 0 | 6 | 0 | 32 | 50 | 0 | 6 | 30 | 32 | 50 | 0 | 36 |
| 3 | 16 | 0 | 16 | 0 | 0 | 22 | 30 | 16 | 50 | 0 | 2 | 30 | 16 | 50 | 0 | 32 |
| 4 | 36 | 0 | 36 | 50 | 0 | 8 | 0 | 36 | 0 | 0 | 38 | 30 | 36 | 50 | 0 | 48 |
| 5 | 46 | 0 | 46 | 50 | 0 | 4 | 30 | 46 | 110 | 0 | 4 | 30 | 46 | 120 | 0 | 4 |
| 6 | 15 | 0 | 15 | 0 | 0 | 19 | 30 | 15 | 0 | 0 | 49 | 30 | 15 | 0 | 0 | 49 |
| 7 | 34 | 0 | 34 | 0 | 0 | 53 | 0 | 34 | 50 | 0 | 33 | 30 | 34 | 50 | 0 | 63 |
| 8 | 18 | 0 | 18 | 50 | 0 | 21 | 30 | 18 | 60 | 0 | 21 | 30 | 18 | 60 | 0 | 51 |
| 9 | 74 | 0 | 74 | 60 | 0 | 35 | 0 | 74 | 60 | 0 | 35 | 30 | 74 | 120 | 0 | 35 |
| 10 | 82 | 0 | 82 | 60 | 0 | 57 | 30 | 82 | 60 | 0 | 87 | 30 | 82 | 60 | 0 | 87 |
| 11 | 102 | 0 | 102 | 280 | 150 | 29 | 40 | 102 | 340 | 150 | 39 | 40 | 102 | 340 | 150 | 39 |
| 12 | 21 | 0 | 21 | 0 | 0 | 50 | 0 | 21 | 0 | 0 | 60 | 40 | 21 | 60 | 0 | 40 |
| 13 | 90 | 0 | 90 | 110 | 0 | 30 | 40 | 90 | 170 | 0 | 20 | 40 | 90 | 110 | 0 | 60 |
| 14 | 20 | 0 | 20 | 0 | 0 | 50 | 0 | 20 | 0 | 0 | 40 | 40 | 20 | 80 | 0 | 40 |
| 15 | 64 | 0 | 64 | 60 | 0 | 54 | 40 | 64 | 120 | 0 | 24 | 40 | 64 | 0 | 0 | 144 |
| 16 | 39 | 0 | 39 | 50 | 0 | 43 | 40 | 39 | 50 | 0 | 53 | 40 | 39 | 270 | 75 | 28 |
| 17 | 82 | 0 | 82 | 110 | 0 | 15 | 0 | 82 | 80 | 0 | 55 | 40 | 82 | 80 | 0 | 70 |
| 18 | 76 | 0 | 76 | 60 | 0 | 31 | 40 | 76 | 220 | 75 | 26 | 40 | 76 | 170 | 75 | 91 |
| 19 | 117 | 0 | 117 | 170 | 75 | 53 | 0 | 117 | 80 | 0 | 63 | 40 | 117 | 290 | 75 | 33 |
| 20 | 97 | 0 | 97 | 60 | 0 | 90 | 40 | 97 | 120 | 0 | 80 | 40 | 97 | 0 | 0 | 170 |
| 21 | 123 | 0 | 123 | 180 | 0 | 33 | 50 | 123 | 240 | 0 | 13 | 50 | 123 | 220 | 0 | 123 |
| 22 | 60 | 0 | 60 | 60 | 0 | 33 | 0 | 60 | 50 | 0 | 23 | 50 | 60 | 170 | 0 | 63 |
| 23 | 84 | 0 | 84 | 60 | 0 | 57 | 50 | 84 | 60 | 0 | 97 | 50 | 84 | 130 | 0 | 67 |
| 24 | 20 | 0 | 20 | 60 | 0 | 17 | 0 | 20 | 0 | 0 | 117 | 50 | 20 | 0 | 0 | 137 |
| 25 | 88 | 0 | 88 | 60 | 0 | 45 | 50 | 88 | 150 | 0 | 105 | 50 | 88 | 150 | 0 | 125 |
| 26 | 114 | 0 | 114 | 170 | 75 | 64 | 50 | 114 | 340 | 150 | 79 | 50 | 114 | 260 | 0 | 29 |
| 27 | 44 | 0 | 44 | 170 | 75 | 13 | 0 | 44 | 0 | 0 | 123 | 50 | 44 | 100 | 0 | 23 |
| 28 | 69 | 0 | 69 | 60 | 0 | 22 | 50 | 69 | 110 | 0 | 132 | 50 | 69 | 0 | 0 | 142 |
| 29 | 133 | 0 | 133 | 140 | 0 | 15 | 0 | 133 | 150 | 0 | 115 | 50 | 133 | 300 | 0 | 25 |
| 30 | 126 | 0 | 126 | 0 | 0 | 141 | 50 | 126 | 100 | 0 | 191 | 50 | 126 | 0 | 0 | 201 |
| 31 | 178 | 0 | 178 | 260 | 0 | 59 | 60 | 178 | 300 | 0 | 129 | 60 | 178 | 390 | 0 | 49 |
| 32 | 82 | 0 | 82 | 130 | 0 | 11 | 0 | 82 | 200 | 0 | 11 | 60 | 82 | 150 | 0 | 41 |
| 33 | 151 | 0 | 151 | 0 | 0 | 162 | 60 | 151 | 170 | 0 | 52 | 60 | 151 | 170 | 0 | 82 |
| 34 | 160 | 0 | 160 | 150 | 0 | 172 | 0 | 160 | 150 | 0 | 62 | 60 | 160 | 200 | 0 | 102 |
| 35 | 92 | 0 | 92 | 150 | 0 | 114 | 60 | 92 | 150 | 0 | 64 | 60 | 92 | 150 | 0 | 104 |
| 36 | 76 | 0 | 76 | 260 | 75 | 5 | 60 | 76 | 160 | 180 | 220 | 60 | 76 | 290 | 180 | 130 |
| 37 | 165 | 0 | 165 | 0 | 0 | 170 | 0 | 165 | 260 | 0 | 125 | 60 | 165 | 260 | 0 | 95 |
| 38 | 154 | 0 | 154 | 300 | 0 | 24 | 60 | 154 | 260 | 0 | 79 | 60 | 154 | 260 | 0 | 49 |
| 39 | 134 | 0 | 134 | 150 | 0 | 8 | 0 | 134 | 150 | 0 | 63 | 60 | 134 | 150 | 0 | 93 |
| 40 | 195 | 0 | 195 | 150 | 0 | 53 | 60 | 195 | 0 | 0 | 318 | 60 | 195 | 330 | 0 | 18 |
| 41 | 191 | 0 | 191 | 200 | 0 | 44 | 75 | 191 | 520 | 0 | 64 | 75 | 191 | 130 | 0 | 154 |
| 42 | 127 | 0 | 127 | 130 | 0 | 41 | 0 | 127 | 0 | 0 | 191 | 75 | 127 | 260 | 0 | 96 |
| 43 | 87 | 0 | 87 | 0 | 0 | 128 | 75 | 87 | 150 | 0 | 203 | 75 | 87 | 0 | 0 | 258 |
| 44 | 215 | 0 | 215 | 180 | 0 | 163 | 0 | 215 | 330 | 0 | 88 | 75 | 215 | 280 | 0 | 268 |
| 45 | 131 | 0 | 131 | 260 | 0 | 34 | 75 | 131 | 260 | 0 | 34 | 75 | 131 | 280 | 0 | 194 |
| 46 | 237 | 0 | 237 | 170 | 0 | 101 | 75 | 237 | 280 | 0 | 66 | 75 | 237 | 300 | 0 | 206 |
| 47 | 126 | 0 | 126 | 0 | 0 | 227 | 0 | 126 | 0 | 0 | 192 | 75 | 126 | 330 | 0 | 77 |
| 48 | 202 | 0 | 202 | 410 | 0 | 19 | 75 | 202 | 430 | 0 | 39 | 75 | 202 | 100 | 0 | 254 |
| 49 | 168 | 0 | 168 | 0 | 0 | 187 | 0 | 168 | 100 | 0 | 107 | 75 | 168 | 330 | 0 | 167 |
| 50 | 220 | 0 | 220 | 0 | 0 | 407 | 75 | 220 | 0 | 0 | 402 | 75 | 220 | 0 | 0 | 462 |
| Total | 5037 | 0 | 5037 | 5230 | 450 |  | 1500 | 5037 | 6840 | 555 |  | 2520 | 5037 | 7800 | 555 |  |

## Per-wave detail: competent player, 0% learning, no meteor powers

| Wave | Duration at 1x (s) | Peak aliens | Peak live descendants | Aliens spawned | Leaks | Health after | Shield after | Deepest advance (share of route) | Credits invested | Board at Ready (pad:class level) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 33.5 | 6 | 0 | 6 | 0 | 20 | 0 | 0.59 | 150 | P09:No1 P12:No1 P16:No1 |
| 2 | 37.5 | 8 | 0 | 8 | 0 | 20 | 0 | 0.59 | 200 | P09:No1 P12:No1 P16:No1 |
| 3 | 24.8 | 2 | 0 | 8 | 0 | 20 | 0 | 0.19 | 200 | P04:No1 P09:No1 P12:No1 P16:No1 |
| 4 | 26.5 | 8 | 0 | 11 | 0 | 20 | 0 | 0.42 | 250 | P04:No1 P09:No1 P12:No1 P16:No1 |
| 5 | 24.0 | 7 | 0 | 14 | 0 | 20 | 0 | 0.39 | 300 | P02:No1 P04:No1 P09:No1 P12:No1 P16:No1 |
| 6 | 28.8 | 2 | 0 | 3 | 0 | 20 | 0 | 0.19 | 300 | P02:No1 P04:No1 P05:No1 P09:No1 P12:No1 P16:No1 |
| 7 | 25.8 | 5 | 0 | 8 | 0 | 20 | 0 | 0.27 | 300 | P02:No1 P04:No1 P05:No1 P09:No1 P12:No1 P16:No1 |
| 8 | 24.0 | 3 | 0 | 18 | 0 | 20 | 0 | 0.11 | 350 | P02:No1 P04:No1 P05:No1 P09:No1 P12:No1 P13:No1 P16:No1 |
| 9 | 41.0 | 12 | 0 | 29 | 0 | 20 | 0 | 0.38 | 410 | P02:No1 P04:No1 P05:No1 P09:No1 P12:No1 P13:No1 P16:No1 |
| 10 | 50.5 | 4 | 0 | 9 | 0 | 20 | 0 | 0.6 | 470 | P02:No1 P04:No1 P05:No1 P09:No1 P12:No1 P13:No2 P16:No1 |
| 11 | 32.6 | 10 | 0 | 30 | 0 | 20 | 0 | 0.28 | 530 | P02:No1 P04:No1 P05:Ju1 P09:No1 P12:No1 P13:No2 P16:No1 |
| 12 | 24.1 | 1 | 0 | 7 | 0 | 20 | 0 | 0.11 | 530 | P02:No1 P03:Pi1 P04:No1 P05:Ju1 P09:No1 P12:No1 P13:Ju1 P16:No1 |
| 13 | 32.4 | 22 | 0 | 45 | 0 | 20 | 0 | 0.4 | 640 | P02:No1 P03:Pi1 P04:No1 P05:Ju1 P09:No1 P12:No1 P13:Ju1 P16:No1 |
| 14 | 29.2 | 2 | 0 | 4 | 0 | 20 | 0 | 0.16 | 640 | P02:No1 P03:Pi1 P04:No1 P05:Ju1 P08:Ju1 P09:No1 P12:No1 P13:Ju1 P16:No1 |
| 15 | 45.4 | 9 | 0 | 19 | 0 | 20 | 0 | 0.41 | 700 | P02:No1 P03:Pi1 P04:No1 P05:Ju1 P08:Ju1 P09:No1 P12:No1 P13:Ju1 P16:No1 |
| 16 | 44.9 | 9 | 0 | 12 | 0 | 20 | 0 | 0.47 | 750 | P02:No1 P03:Pi1 P04:No1 P05:Ju1 P07:No1 P08:Ju1 P09:No1 P11:Pi1 P12:No1 P13:Ju1 P16:No1 |
| 17 | 35.0 | 15 | 0 | 21 | 0 | 20 | 0 | 0.47 | 860 | P02:No1 P03:Pi1 P04:No1 P05:Ju1 P07:No1 P08:Ju1 P09:No1 P11:Pi1 P12:No1 P13:Ju1 P16:No1 |
| 18 | 52.8 | 16 | 0 | 50 | 0 | 20 | 0 | 0.51 | 920 | P02:No1 P03:Pi1 P04:No1 P05:Ju1 P06:No1 P07:No1 P08:Ju1 P09:No1 P11:Pi1 P12:No2 P13:Ju1 P16:No1 |
| 19 | 51.6 | 17 | 0 | 34 | 0 | 20 | 0 | 0.45 | 980 | P02:No1 P03:Pi1 P04:No1 P05:Ju1 P06:No1 P07:No1 P08:Ju1 P09:No2 P11:Pi1 P12:No2 P13:Ju1 P16:No1 |
| 20 | 57.7 | 4 | 0 | 9 | 0 | 20 | 0 | 0.57 | 1040 | P02:No1 P03:Pi1 P04:No1 P05:Ju1 P06:No1 P07:No1 P08:Ju1 P09:Or1 P11:Pi1 P12:No2 P13:Ju1 P16:No1 |
| 21 | 49.1 | 23 | 0 | 38 | 0 | 20 | 0 | 0.47 | 1220 | P02:No1 P03:Pi2 P04:No2 P05:Ju1 P06:No1 P07:No1 P08:Ju1 P09:Or1 P11:Pi1 P12:No2 P13:Ju1 P16:No1 |
| 22 | 35.9 | 12 | 0 | 15 | 0 | 20 | 0 | 0.46 | 1280 | P01:No1 P02:No1 P03:Pi2 P04:No2 P05:Ju1 P06:No1 P07:No1 P08:Ju1 P09:Or1 P11:Pi1 P12:No2 P13:Ju1 P15:No1 P16:No1 |
| 23 | 40.5 | 14 | 0 | 22 | 0 | 20 | 0 | 0.45 | 1340 | P01:No1 P02:No2 P03:Pi2 P04:No2 P05:Ju1 P06:No1 P07:No1 P08:Ju1 P09:Or1 P11:Pi1 P12:No2 P13:Ju1 P15:No1 P16:No1 |
| 24 | 28.6 | 4 | 2 | 12 | 0 | 20 | 0 | 0.26 | 1400 | P01:No1 P02:No2 P03:Pi2 P04:No2 P05:Ju1 P06:No1 P07:No1 P08:Ju1 P09:Or1 P11:Pi1 P12:No2 P13:Ju1 P15:No1 P16:No2 |
| 25 | 41.4 | 26 | 4 | 48 | 0 | 20 | 0 | 0.57 | 1460 | P01:No1 P02:No2 P03:Pi2 P04:No2 P05:Ju1 P06:No1 P07:No2 P08:Ju1 P09:Or1 P11:Pi1 P12:No2 P13:Ju1 P15:No1 P16:No2 |
| 26 | 57.0 | 22 | 0 | 26 | 0 | 20 | 0 | 0.48 | 1520 | P01:No2 P02:No2 P03:Pi2 P04:No2 P05:Ju1 P06:No1 P07:No2 P08:Ju1 P09:Or1 P11:Pi1 P12:No2 P13:Ju1 P15:No1 P16:No2 |
| 27 | 39.9 | 4 | 4 | 10 | 0 | 20 | 0 | 0.31 | 1580 | P01:No2 P02:No2 P03:Pi2 P04:Or1 P05:Ju1 P06:No1 P07:No2 P08:Ju1 P09:Or1 P11:Pi1 P12:No2 P13:Ju1 P15:No1 P16:No2 |
| 28 | 40.5 | 17 | 4 | 28 | 0 | 20 | 0 | 0.51 | 1640 | P01:No2 P02:No2 P03:Pi2 P04:Or1 P05:Ju1 P06:No1 P07:No2 P08:Ju1 P09:Or1 P11:Pi1 P12:Or1 P13:Ju1 P15:No1 P16:No2 |
| 29 | 61.6 | 22 | 4 | 41 | 0 | 20 | 0 | 0.61 | 1780 | P01:No2 P02:No2 P03:Pi2 P04:Or1 P05:Ju1 P06:No2 P07:No2 P08:Ju1 P09:Or1 P11:Pi1 P12:Or1 P13:Ju1 P15:No1 P16:No2 |
| 30 | 62.1 | 8 | 0 | 19 | 0 | 20 | 0 | 0.58 | 1780 | P01:No2 P02:No2 P03:Pi2 P04:Or1 P05:Ju1 P06:No2 P07:No2 P08:Ju1 P09:Or1 P11:Pi2 P12:Or1 P13:Ju1 P15:No2 P16:No2 |
| 31 | 53.4 | 29 | 0 | 62 | 0 | 20 | 0 | 0.68 | 2040 | P01:No2 P02:No2 P03:Pi2 P04:Or1 P05:Ju1 P06:No2 P07:No2 P08:Ju1 P09:Or1 P11:Pi2 P12:Or1 P13:Ju1 P14:Ju1 P15:No2 P16:No2 |
| 32 | 59.5 | 16 | 0 | 17 | 0 | 20 | 0 | 0.66 | 2170 | P01:No2 P02:No2 P03:Pi2 P04:Or1 P05:Ju1 P06:No2 P07:No2 P08:Ju1 P09:Or1 P10:So1 P11:Pi2 P12:Or1 P13:Ju1 P14:Ju1 P15:No2 P16:No2 |
| 33 | 62.6 | 33 | 4 | 79 | 0 | 20 | 0 | 0.64 | 2170 | P01:No2 P02:No2 P03:Pi2 P04:Or1 P05:Ju2 P06:No2 P07:No2 P08:Ju1 P09:Or1 P10:So1 P11:Pi2 P12:Or1 P13:Ju1 P14:Ju1 P15:No2 P16:No2 |
| 34 | 56.2 | 29 | 0 | 45 | 0 | 20 | 0 | 0.71 | 2320 | P01:No2 P02:No2 P03:Pi2 P04:Or1 P05:Ju2 P06:No2 P07:No2 P08:Ju1 P09:Or1 P10:So1 P11:Pi2 P12:Or1 P13:Ju1 P14:Ju1 P15:No2 P16:No3 |
| 35 | 57.2 | 12 | 4 | 36 | 0 | 20 | 0 | 0.65 | 2470 | P01:No2 P02:No2 P03:Pi2 P04:Or1 P05:Ju2 P06:No2 P07:No3 P08:Ju1 P09:Or1 P10:So1 P11:Pi2 P12:Or1 P13:Ju1 P14:Ju1 P15:No2 P16:No3 |
| 36 | 51.5 | 22 | 2 | 40 | 0 | 20 | 3 | 0.68 | 2620 | P01:No2 P02:No2 P03:Pi2 P04:Or1 P05:Ju2 P06:No2 P07:No3 P08:Ju1 P09:Or1 P10:So1 P11:Pi2 P12:Or1 P13:Ju1 P14:Ju1 P15:Mi1 P16:No3 |
| 37 | 47.5 | 39 | 0 | 46 | 0 | 20 | 6 | 0.75 | 2620 | P01:No2 P02:No2 P03:Pi2 P04:Or1 P05:Ju2 P06:No2 P07:No3 P08:Ju1 P09:Or2 P10:So1 P11:Pi2 P12:Or1 P13:Ju1 P14:Ju1 P15:Mi1 P16:No3 |
| 38 | 61.6 | 25 | 6 | 53 | 0 | 20 | 10 | 0.68 | 2920 | P01:No2 P02:No2 P03:Pi2 P04:Or1 P05:Ju2 P06:No2 P07:No3 P08:Ju1 P09:Or2 P10:So1 P11:Pi3 P12:Or1 P13:Ju1 P14:Ju1 P15:Mi1 P16:No3 |
| 39 | 57.9 | 27 | 4 | 49 | 0 | 20 | 10 | 0.67 | 3070 | P01:No2 P02:No2 P03:Pi2 P04:Or1 P05:Ju2 P06:No2 P07:No3 P08:Ju2 P09:Or2 P10:So1 P11:Pi3 P12:Or1 P13:Ju1 P14:Ju1 P15:Mi1 P16:No3 |
| 40 | 75.3 | 6 | 4 | 25 | 0 | 20 | 10 | 0.71 | 3220 | P01:No2 P02:No3 P03:Pi2 P04:Or1 P05:Ju2 P06:No2 P07:No3 P08:Ju2 P09:Or2 P10:So1 P11:Pi3 P12:Or1 P13:Ju1 P14:Ju1 P15:Mi1 P16:No3 |
| 41 | 63.0 | 29 | 4 | 64 | 0 | 20 | 10 | 0.82 | 3420 | P01:No3 P02:No3 P03:Pi2 P04:Or1 P05:Ju2 P06:No2 P07:No3 P08:Ju2 P09:Or2 P10:So1 P11:Pi3 P12:Or1 P13:Ju1 P14:Ju1 P15:Mi1 P16:No3 |
| 42 | 53.9 | 28 | 4 | 58 | 0 | 20 | 10 | 0.83 | 3550 | P01:No3 P02:No3 P03:Pi2 P04:Or1 P05:Ju2 P06:No2 P07:No3 P08:Ju2 P09:Or2 P10:So2 P11:Pi3 P12:Or1 P13:Ju1 P14:Ju1 P15:Mi1 P16:No3 |
| 43 | 55.9 | 15 | 5 | 27 | 0 | 20 | 10 | 0.68 | 3550 | P01:No3 P02:No3 P03:Pi2 P04:Or1 P05:Ju2 P06:No2 P07:No3 P08:Ju2 P09:Or2 P10:So2 P11:Pi3 P12:Or1 P13:Ju2 P14:Ju1 P15:Mi1 P16:No3 |
| 44 | 83.3 | 28 | 8 | 76 | 0 | 20 | 10 | 0.87 | 3730 | P01:No3 P02:No3 P03:Pi2 P04:Or1 P05:Ju2 P06:No2 P07:No3 P08:Ju2 P09:Or2 P10:So2 P11:Pi3 P12:Or1 P13:Ju2 P14:Ju1 P15:Mi1 P16:No3 |
| 45 | 66.1 | 29 | 7 | 47 | 0 | 20 | 10 | 0.89 | 3990 | P01:No3 P02:No3 P03:Pi2 P04:Or1 P05:Ju2 P06:No2 P07:No3 P08:Ju2 P09:Or2 P10:So2 P11:Pi3 P12:Or1 P13:Ju2 P14:Ju1 P15:Mi2 P16:No3 |
| 46 | 69.0 | 34 | 4 | 71 | 0 | 20 | 10 | 0.64 | 4160 | P01:No3 P02:No3 P03:Pi2 P04:Or1 P05:Ju2 P06:No2 P07:No3 P08:Ju3 P09:Or2 P10:So2 P11:Pi3 P12:Or1 P13:Ju2 P14:Ju1 P15:Mi2 P16:No3 |
| 47 | 56.0 | 23 | 4 | 49 | 0 | 20 | 10 | 0.89 | 4160 | P01:No3 P02:No3 P03:Pi3 P04:Or1 P05:Ju2 P06:No2 P07:No3 P08:Ju3 P09:Or2 P10:So2 P11:Pi3 P12:Or1 P13:Ju2 P14:Ju1 P15:Mi2 P16:No3 |
| 48 | 62.5 | 32 | 8 | 63 | 0 | 20 | 10 | 0.89 | 4570 | P01:No3 P02:No3 P03:Pi3 P04:Or1 P05:Ju2 P06:No3 P07:No3 P08:Ju3 P09:Or2 P10:So2 P11:Pi3 P12:Or1 P13:Ju2 P14:Ju1 P15:Mi2 P16:No3 |
| 49 | 58.6 | 23 | 6 | 60 | 0 | 20 | 10 | 0.68 | 4570 | P01:No3 P02:No3 P03:Pi3 P04:Or1 P05:Ju3 P06:No3 P07:No3 P08:Ju3 P09:Or2 P10:So2 P11:Pi3 P12:Or1 P13:Ju2 P14:Ju1 P15:Mi2 P16:No3 |
| 50 | 92.0 | 10 | 6 | 29 | 0 | 20 | 10 | 0.83 | 4570 | P01:No3 P02:No3 P03:Pi3 P04:Or1 P05:Ju3 P06:No3 P07:No3 P08:Ju3 P09:Or2 P10:So2 P11:Pi3 P12:Or1 P13:Ju2 P14:Ju1 P15:Mi2 P16:No3 |

## Credits earned and spent per wave: naive child, 60% learning, no meteor powers (means over 20 seeds)

| Wave | Runs playing this wave (of 20) | Mean bounty earned | Mean learning reward before wave | Mean credits spent | Mean credits unspent after wave | Mean leak damage | Mean colony health after | Mean duration (s) | Max peak aliens | Runs defeated in this wave |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 20 | 24 | 0 | 89 | 85 | 0.0 | 20.0 | 28 | 6 | 0 |
| 2 | 20 | 32 | 20 | 54 | 83 | 0.0 | 20.0 | 29 | 8 | 0 |
| 3 | 20 | 16 | 26 | 42 | 82 | 0.0 | 20.0 | 24 | 3 | 0 |
| 4 | 20 | 36 | 10 | 51 | 78 | 0.0 | 20.0 | 23 | 8 | 0 |
| 5 | 20 | 46 | 12 | 35 | 100 | 0.0 | 20.0 | 25 | 10 | 0 |
| 6 | 20 | 15 | 15 | 58 | 72 | 0.0 | 20.0 | 29 | 3 | 0 |
| 7 | 20 | 34 | 14 | 23 | 97 | 0.0 | 20.0 | 28 | 5 | 0 |
| 8 | 20 | 18 | 20 | 47 | 88 | 0.0 | 20.0 | 23 | 6 | 0 |
| 9 | 20 | 74 | 15 | 36 | 140 | 0.0 | 20.0 | 40 | 15 | 0 |
| 10 | 20 | 82 | 20 | 37 | 205 | 0.0 | 20.0 | 41 | 5 | 0 |
| 11 | 20 | 102 | 28 | 120 | 216 | 0.0 | 20.0 | 35 | 16 | 0 |
| 12 | 20 | 21 | 28 | 99 | 166 | 0.0 | 20.0 | 24 | 2 | 0 |
| 13 | 20 | 90 | 22 | 38 | 239 | 0.0 | 20.0 | 33 | 29 | 0 |
| 14 | 20 | 20 | 30 | 18 | 272 | 0.0 | 20.0 | 28 | 2 | 0 |
| 15 | 20 | 64 | 20 | 38 | 318 | 0.0 | 20.0 | 43 | 12 | 0 |
| 16 | 20 | 39 | 18 | 171 | 204 | 0.0 | 20.0 | 38 | 9 | 0 |
| 17 | 20 | 82 | 26 | 84 | 228 | 0.0 | 20.0 | 34 | 16 | 0 |
| 18 | 20 | 76 | 26 | 60 | 270 | 0.0 | 20.0 | 51 | 21 | 0 |
| 19 | 20 | 117 | 34 | 39 | 382 | 0.0 | 20.0 | 52 | 19 | 0 |
| 20 | 20 | 97 | 24 | 32 | 470 | 0.0 | 20.0 | 59 | 6 | 0 |
| 21 | 20 | 123 | 32 | 144 | 482 | 0.0 | 20.0 | 47 | 25 | 0 |
| 22 | 20 | 60 | 30 | 132 | 440 | 0.0 | 20.0 | 33 | 12 | 0 |
| 23 | 20 | 84 | 28 | 67 | 485 | 0.0 | 20.0 | 45 | 17 | 0 |
| 24 | 20 | 20 | 32 | 47 | 490 | 0.0 | 20.0 | 30 | 5 | 0 |
| 25 | 20 | 88 | 32 | 74 | 536 | 0.0 | 20.0 | 43 | 27 | 0 |
| 26 | 20 | 114 | 35 | 170 | 514 | 0.2 | 20.0 | 56 | 24 | 0 |
| 27 | 20 | 44 | 35 | 62 | 531 | 0.0 | 20.0 | 47 | 5 | 0 |
| 28 | 20 | 69 | 45 | 75 | 570 | 0.0 | 20.0 | 46 | 18 | 0 |
| 29 | 20 | 132 | 20 | 42 | 679 | 0.5 | 20.0 | 66 | 30 | 0 |
| 30 | 20 | 91 | 28 | 32 | 765 | 4.2 | 19.6 | 87 | 10 | 0 |
| 31 | 20 | 174 | 39 | 34 | 945 | 1.6 | 19.4 | 66 | 38 | 0 |
| 32 | 20 | 72 | 33 | 50 | 1000 | 4.1 | 18.9 | 68 | 17 | 0 |
| 33 | 20 | 140 | 36 | 16 | 1160 | 4.9 | 18.6 | 75 | 40 | 1 |
| 34 | 19 | 149 | 19 | 65 | 1225 | 3.3 | 18.6 | 66 | 36 | 0 |
| 35 | 19 | 87 | 35 | 24 | 1322 | 1.4 | 18.6 | 70 | 15 | 0 |
| 36 | 19 | 69 | 32 | 43 | 1380 | 3.2 | 18.6 | 64 | 26 | 0 |
| 37 | 19 | 123 | 41 | 32 | 1513 | 10.6 | 13.1 | 55 | 44 | 5 |
| 38 | 14 | 149 | 30 | 23 | 1639 | 2.4 | 17.6 | 71 | 30 | 0 |
| 39 | 14 | 120 | 39 | 26 | 1772 | 4.3 | 16.9 | 70 | 38 | 0 |
| 40 | 14 | 162 | 26 | 52 | 1908 | 5.9 | 17.0 | 99 | 9 | 0 |
| 41 | 14 | 168 | 48 | 27 | 2097 | 10.4 | 14.2 | 74 | 38 | 1 |
| 42 | 13 | 101 | 46 | 20 | 2196 | 10.5 | 9.6 | 60 | 41 | 3 |
| 43 | 10 | 79 | 52 | 95 | 2198 | 3.4 | 12.1 | 65 | 19 | 0 |
| 44 | 10 | 167 | 60 | 48 | 2377 | 13.3 | 7.3 | 84 | 37 | 5 |
| 45 | 5 | 101 | 60 | 30 | 2419 | 12.8 | 9.2 | 70 | 30 | 2 |
| 46 | 3 | 195 | 25 | 253 | 2099 | 12.0 | 11.3 | 83 | 36 | 0 |
| 47 | 3 | 118 | 25 | 0 | 2242 | 2.7 | 11.7 | 63 | 28 | 0 |
| 48 | 3 | 141 | 50 | 20 | 2413 | 18.3 | 6.3 | 64 | 36 | 1 |
| 49 | 2 | 131 | 38 | 0 | 2806 | 10.0 | 10.0 | 73 | 32 | 0 |
| 50 | 2 | 62 | 38 | 165 | 2740 | 24.0 | 1.0 | 111 | 8 | 1 |

## Credits earned and spent per wave: naive child, 0% learning (means over 20 seeds; powers used and unused are the same run because no power is ever earned)

| Wave | Runs playing this wave (of 20) | Mean bounty earned | Mean learning reward before wave | Mean credits spent | Mean credits unspent after wave | Mean leak damage | Mean colony health after | Mean duration (s) | Max peak aliens | Runs defeated in this wave |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 20 | 24 | 0 | 89 | 85 | 0.0 | 20.0 | 28 | 6 | 0 |
| 2 | 20 | 32 | 0 | 44 | 74 | 0.0 | 20.0 | 31 | 8 | 0 |
| 3 | 20 | 16 | 0 | 36 | 54 | 0.0 | 20.0 | 24 | 5 | 0 |
| 4 | 20 | 36 | 0 | 30 | 60 | 0.0 | 20.0 | 24 | 11 | 0 |
| 5 | 20 | 46 | 0 | 28 | 78 | 0.0 | 20.0 | 27 | 13 | 0 |
| 6 | 20 | 15 | 0 | 41 | 52 | 0.0 | 20.0 | 32 | 3 | 0 |
| 7 | 20 | 34 | 0 | 16 | 70 | 0.0 | 20.0 | 32 | 6 | 0 |
| 8 | 20 | 18 | 0 | 24 | 64 | 0.0 | 20.0 | 24 | 8 | 0 |
| 9 | 20 | 74 | 0 | 40 | 98 | 0.0 | 20.0 | 45 | 19 | 0 |
| 10 | 20 | 82 | 0 | 49 | 132 | 0.0 | 20.0 | 49 | 5 | 0 |
| 11 | 20 | 102 | 0 | 64 | 169 | 0.0 | 20.0 | 38 | 15 | 0 |
| 12 | 20 | 21 | 0 | 90 | 100 | 0.0 | 20.0 | 24 | 2 | 0 |
| 13 | 20 | 90 | 0 | 50 | 141 | 0.0 | 20.0 | 35 | 30 | 0 |
| 14 | 20 | 20 | 0 | 64 | 98 | 0.0 | 20.0 | 29 | 2 | 0 |
| 15 | 20 | 64 | 0 | 36 | 125 | 0.0 | 20.0 | 45 | 11 | 0 |
| 16 | 20 | 39 | 0 | 86 | 78 | 0.0 | 20.0 | 44 | 9 | 0 |
| 17 | 20 | 82 | 0 | 18 | 142 | 0.0 | 20.0 | 36 | 16 | 0 |
| 18 | 20 | 76 | 0 | 57 | 162 | 0.0 | 20.0 | 60 | 20 | 0 |
| 19 | 20 | 117 | 0 | 58 | 220 | 0.0 | 20.0 | 57 | 19 | 0 |
| 20 | 20 | 86 | 0 | 52 | 254 | 1.5 | 18.9 | 77 | 5 | 0 |
| 21 | 20 | 123 | 0 | 110 | 267 | 0.0 | 18.9 | 52 | 28 | 0 |
| 22 | 20 | 60 | 0 | 109 | 218 | 0.0 | 18.9 | 37 | 13 | 0 |
| 23 | 20 | 84 | 0 | 42 | 261 | 0.0 | 18.9 | 54 | 19 | 0 |
| 24 | 20 | 20 | 0 | 30 | 251 | 0.0 | 18.9 | 31 | 5 | 0 |
| 25 | 20 | 88 | 0 | 22 | 316 | 0.0 | 18.9 | 48 | 27 | 0 |
| 26 | 20 | 112 | 0 | 154 | 274 | 0.8 | 18.9 | 64 | 24 | 0 |
| 27 | 20 | 44 | 0 | 64 | 254 | 0.0 | 18.9 | 52 | 5 | 0 |
| 28 | 20 | 68 | 0 | 59 | 263 | 0.3 | 18.9 | 56 | 18 | 0 |
| 29 | 20 | 127 | 0 | 50 | 340 | 2.2 | 18.3 | 73 | 31 | 0 |
| 30 | 20 | 66 | 0 | 32 | 374 | 7.2 | 17.4 | 97 | 10 | 1 |
| 31 | 19 | 166 | 0 | 32 | 512 | 4.4 | 16.6 | 71 | 43 | 1 |
| 32 | 18 | 61 | 0 | 43 | 531 | 7.7 | 14.3 | 72 | 17 | 1 |
| 33 | 17 | 132 | 0 | 27 | 630 | 7.1 | 12.6 | 77 | 39 | 3 |
| 34 | 14 | 135 | 0 | 44 | 669 | 5.0 | 13.2 | 67 | 34 | 3 |
| 35 | 11 | 88 | 0 | 53 | 645 | 1.0 | 16.8 | 72 | 14 | 0 |
| 36 | 11 | 65 | 0 | 45 | 665 | 4.8 | 16.5 | 67 | 25 | 0 |
| 37 | 11 | 110 | 0 | 25 | 751 | 11.6 | 10.7 | 55 | 43 | 4 |
| 38 | 7 | 145 | 0 | 11 | 1017 | 4.4 | 17.1 | 77 | 29 | 0 |
| 39 | 7 | 98 | 0 | 29 | 1086 | 11.9 | 14.9 | 73 | 36 | 1 |
| 40 | 6 | 42 | 0 | 0 | 1156 | 18.8 | 11.3 | 109 | 10 | 1 |
| 41 | 5 | 157 | 0 | 48 | 1260 | 14.6 | 8.8 | 74 | 33 | 1 |
| 42 | 4 | 88 | 0 | 15 | 1251 | 14.8 | 6.2 | 60 | 41 | 1 |
| 43 | 3 | 60 | 0 | 0 | 1228 | 8.7 | 8.7 | 73 | 21 | 0 |
| 44 | 3 | 146 | 0 | 27 | 1348 | 22.3 | 0.7 | 82 | 36 | 2 |
| 45 | 1 | 52 | 0 | 0 | 1544 | 12.0 | -1.0 | 58 | 31 | 1 |

## Credits earned and spent per wave: naive child, 100% learning, no meteor powers (means over 20 seeds)

| Wave | Runs playing this wave (of 20) | Mean bounty earned | Mean learning reward before wave | Mean credits spent | Mean credits unspent after wave | Mean leak damage | Mean colony health after | Mean duration (s) | Max peak aliens | Runs defeated in this wave |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 20 | 24 | 0 | 89 | 85 | 0.0 | 20.0 | 28 | 6 | 0 |
| 2 | 20 | 32 | 30 | 61 | 86 | 0.0 | 20.0 | 28 | 8 | 0 |
| 3 | 20 | 16 | 30 | 48 | 84 | 0.0 | 20.0 | 23 | 3 | 0 |
| 4 | 20 | 36 | 30 | 61 | 90 | 0.0 | 20.0 | 23 | 8 | 0 |
| 5 | 20 | 46 | 30 | 44 | 122 | 0.0 | 20.0 | 23 | 10 | 0 |
| 6 | 20 | 15 | 30 | 52 | 114 | 0.0 | 20.0 | 28 | 2 | 0 |
| 7 | 20 | 34 | 30 | 51 | 128 | 0.0 | 20.0 | 26 | 5 | 0 |
| 8 | 20 | 18 | 30 | 34 | 142 | 0.0 | 20.0 | 23 | 3 | 0 |
| 9 | 20 | 74 | 30 | 38 | 208 | 0.0 | 20.0 | 37 | 14 | 0 |
| 10 | 20 | 82 | 30 | 34 | 286 | 0.0 | 20.0 | 38 | 4 | 0 |
| 11 | 20 | 102 | 40 | 113 | 316 | 0.0 | 20.0 | 34 | 12 | 0 |
| 12 | 20 | 21 | 40 | 86 | 290 | 0.0 | 20.0 | 24 | 1 | 0 |
| 13 | 20 | 90 | 40 | 40 | 380 | 0.0 | 20.0 | 33 | 27 | 0 |
| 14 | 20 | 20 | 40 | 48 | 392 | 0.0 | 20.0 | 28 | 2 | 0 |
| 15 | 20 | 64 | 40 | 26 | 470 | 0.0 | 20.0 | 42 | 9 | 0 |
| 16 | 20 | 39 | 40 | 170 | 379 | 0.0 | 20.0 | 38 | 9 | 0 |
| 17 | 20 | 82 | 40 | 114 | 386 | 0.0 | 20.0 | 34 | 16 | 0 |
| 18 | 20 | 76 | 40 | 54 | 449 | 0.0 | 20.0 | 52 | 20 | 0 |
| 19 | 20 | 117 | 40 | 40 | 566 | 0.0 | 20.0 | 52 | 19 | 0 |
| 20 | 20 | 93 | 40 | 14 | 685 | 0.5 | 19.6 | 58 | 5 | 0 |
| 21 | 20 | 123 | 50 | 154 | 704 | 0.0 | 19.6 | 46 | 26 | 0 |
| 22 | 20 | 60 | 50 | 107 | 707 | 0.0 | 19.6 | 32 | 13 | 0 |
| 23 | 20 | 84 | 50 | 79 | 762 | 0.0 | 19.6 | 43 | 19 | 0 |
| 24 | 20 | 20 | 50 | 16 | 817 | 0.0 | 19.6 | 28 | 5 | 0 |
| 25 | 20 | 88 | 50 | 30 | 925 | 0.0 | 19.6 | 42 | 26 | 0 |
| 26 | 20 | 114 | 50 | 134 | 955 | 0.0 | 19.6 | 56 | 23 | 0 |
| 27 | 20 | 44 | 50 | 106 | 943 | 0.0 | 19.6 | 45 | 5 | 0 |
| 28 | 20 | 69 | 50 | 58 | 1004 | 0.0 | 19.6 | 42 | 18 | 0 |
| 29 | 20 | 133 | 50 | 36 | 1151 | 0.1 | 19.6 | 65 | 30 | 0 |
| 30 | 20 | 116 | 50 | 51 | 1266 | 1.2 | 18.8 | 81 | 10 | 0 |
| 31 | 20 | 176 | 60 | 22 | 1480 | 0.6 | 18.4 | 63 | 39 | 0 |
| 32 | 20 | 73 | 60 | 50 | 1563 | 2.8 | 17.1 | 67 | 17 | 1 |
| 33 | 19 | 144 | 60 | 38 | 1699 | 3.3 | 17.2 | 75 | 38 | 2 |
| 34 | 17 | 153 | 60 | 52 | 1813 | 1.9 | 19.1 | 61 | 36 | 0 |
| 35 | 17 | 90 | 60 | 36 | 1927 | 0.6 | 19.0 | 68 | 15 | 0 |
| 36 | 17 | 72 | 60 | 55 | 2003 | 2.1 | 18.6 | 61 | 25 | 1 |
| 37 | 16 | 128 | 60 | 26 | 2129 | 11.7 | 13.8 | 55 | 44 | 1 |
| 38 | 15 | 150 | 60 | 43 | 2279 | 1.9 | 14.7 | 70 | 29 | 0 |
| 39 | 15 | 117 | 60 | 47 | 2408 | 4.7 | 14.3 | 67 | 37 | 1 |
| 40 | 14 | 172 | 60 | 83 | 2531 | 4.6 | 16.3 | 95 | 9 | 0 |
| 41 | 14 | 169 | 75 | 18 | 2756 | 10.9 | 13.1 | 73 | 33 | 1 |
| 42 | 13 | 99 | 75 | 37 | 2897 | 11.0 | 7.8 | 60 | 42 | 6 |
| 43 | 7 | 80 | 75 | 23 | 2914 | 3.4 | 14.7 | 64 | 17 | 0 |
| 44 | 7 | 177 | 75 | 90 | 3077 | 12.4 | 11.6 | 87 | 38 | 2 |
| 45 | 5 | 105 | 75 | 0 | 3181 | 12.0 | 9.0 | 72 | 30 | 1 |
| 46 | 4 | 182 | 75 | 32 | 3297 | 12.8 | 4.8 | 76 | 36 | 1 |
| 47 | 3 | 116 | 75 | 110 | 3291 | 3.3 | 6.7 | 63 | 27 | 0 |
| 48 | 3 | 128 | 75 | 0 | 3494 | 14.7 | 0.7 | 56 | 38 | 2 |
| 49 | 1 | 120 | 75 | 0 | 4032 | 12.0 | 2.0 | 65 | 29 | 0 |
| 50 | 1 | 54 | 75 | 0 | 4161 | 27.0 | -13.0 | 106 | 8 | 1 |

## Credits earned and spent per wave: naive child, 60% learning, meteor powers used (means over 20 seeds)

| Wave | Runs playing this wave (of 20) | Mean bounty earned | Mean learning reward before wave | Mean credits spent | Mean credits unspent after wave | Mean leak damage | Mean colony health after | Mean duration (s) | Max peak aliens | Runs defeated in this wave |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 20 | 24 | 0 | 89 | 85 | 0.0 | 20.0 | 28 | 6 | 0 |
| 2 | 20 | 32 | 20 | 54 | 83 | 0.0 | 20.0 | 29 | 8 | 0 |
| 3 | 20 | 16 | 26 | 42 | 82 | 0.0 | 20.0 | 24 | 3 | 0 |
| 4 | 20 | 36 | 10 | 51 | 78 | 0.0 | 20.0 | 23 | 8 | 0 |
| 5 | 20 | 46 | 12 | 35 | 100 | 0.0 | 20.0 | 25 | 10 | 0 |
| 6 | 20 | 15 | 15 | 58 | 72 | 0.0 | 20.0 | 29 | 3 | 0 |
| 7 | 20 | 34 | 14 | 23 | 97 | 0.0 | 20.0 | 28 | 5 | 0 |
| 8 | 20 | 18 | 20 | 47 | 88 | 0.0 | 20.0 | 23 | 6 | 0 |
| 9 | 20 | 74 | 15 | 36 | 140 | 0.0 | 20.0 | 40 | 15 | 0 |
| 10 | 20 | 82 | 20 | 35 | 207 | 0.0 | 20.0 | 42 | 5 | 0 |
| 11 | 20 | 102 | 28 | 97 | 240 | 0.0 | 20.0 | 35 | 14 | 0 |
| 12 | 20 | 21 | 22 | 113 | 170 | 0.0 | 20.0 | 24 | 2 | 0 |
| 13 | 20 | 90 | 30 | 53 | 237 | 0.0 | 20.0 | 33 | 29 | 0 |
| 14 | 20 | 20 | 20 | 28 | 250 | 0.0 | 20.0 | 28 | 2 | 0 |
| 15 | 20 | 64 | 18 | 54 | 278 | 0.0 | 20.0 | 43 | 12 | 0 |
| 16 | 20 | 39 | 26 | 139 | 204 | 0.0 | 20.0 | 39 | 9 | 0 |
| 17 | 20 | 82 | 26 | 56 | 256 | 0.0 | 20.0 | 34 | 17 | 0 |
| 18 | 20 | 76 | 34 | 80 | 286 | 0.0 | 20.0 | 53 | 20 | 0 |
| 19 | 20 | 117 | 24 | 18 | 410 | 0.0 | 20.0 | 54 | 21 | 0 |
| 20 | 20 | 93 | 26 | 32 | 497 | 0.5 | 19.6 | 61 | 6 | 0 |
| 21 | 20 | 123 | 28 | 200 | 447 | 0.0 | 19.6 | 49 | 25 | 0 |
| 22 | 20 | 60 | 32 | 144 | 396 | 0.0 | 19.6 | 34 | 12 | 0 |
| 23 | 20 | 84 | 32 | 90 | 422 | 0.0 | 19.6 | 47 | 17 | 0 |
| 24 | 20 | 20 | 35 | 46 | 431 | 0.0 | 19.6 | 31 | 5 | 0 |
| 25 | 20 | 88 | 35 | 22 | 533 | 0.0 | 19.6 | 44 | 27 | 0 |
| 26 | 20 | 114 | 45 | 182 | 509 | 0.0 | 19.6 | 57 | 25 | 0 |
| 27 | 20 | 44 | 20 | 100 | 473 | 0.0 | 19.6 | 48 | 5 | 0 |
| 28 | 20 | 69 | 28 | 78 | 491 | 0.0 | 19.6 | 47 | 19 | 0 |
| 29 | 20 | 132 | 32 | 33 | 622 | 0.6 | 19.6 | 67 | 30 | 0 |
| 30 | 20 | 91 | 28 | 48 | 692 | 4.2 | 19.7 | 88 | 9 | 0 |
| 31 | 20 | 175 | 18 | 42 | 844 | 1.0 | 19.7 | 63 | 40 | 0 |
| 32 | 20 | 72 | 36 | 36 | 916 | 4.0 | 19.3 | 68 | 17 | 0 |
| 33 | 20 | 141 | 30 | 10 | 1077 | 4.8 | 19.2 | 76 | 40 | 0 |
| 34 | 20 | 148 | 42 | 40 | 1227 | 3.2 | 18.4 | 63 | 36 | 1 |
| 35 | 19 | 88 | 32 | 46 | 1285 | 1.0 | 19.3 | 70 | 15 | 0 |
| 36 | 19 | 70 | 35 | 57 | 1333 | 3.2 | 19.2 | 64 | 26 | 0 |
| 37 | 19 | 126 | 32 | 28 | 1462 | 12.6 | 12.2 | 55 | 43 | 2 |
| 38 | 17 | 149 | 35 | 39 | 1590 | 2.2 | 13.5 | 73 | 29 | 0 |
| 39 | 17 | 107 | 46 | 34 | 1709 | 5.6 | 12.5 | 65 | 41 | 3 |
| 40 | 14 | 163 | 43 | 19 | 1851 | 5.4 | 15.9 | 99 | 10 | 1 |
| 41 | 13 | 173 | 58 | 22 | 2034 | 8.8 | 15.3 | 71 | 36 | 0 |
| 42 | 13 | 111 | 35 | 41 | 2139 | 7.0 | 12.8 | 60 | 40 | 2 |
| 43 | 11 | 80 | 34 | 46 | 2176 | 3.6 | 14.9 | 66 | 19 | 0 |
| 44 | 11 | 171 | 48 | 26 | 2368 | 14.8 | 10.5 | 89 | 38 | 2 |
| 45 | 9 | 96 | 58 | 81 | 2406 | 11.6 | 10.2 | 69 | 30 | 3 |
| 46 | 6 | 158 | 50 | 10 | 2458 | 16.7 | 7.3 | 72 | 38 | 3 |
| 47 | 3 | 115 | 50 | 100 | 2776 | 3.7 | 14.7 | 68 | 28 | 0 |
| 48 | 3 | 137 | 50 | 0 | 2963 | 20.3 | 4.0 | 65 | 39 | 2 |
| 49 | 1 | 135 | 0 | 0 | 2762 | 9.0 | 13.0 | 68 | 29 | 0 |
| 50 | 1 | 62 | 75 | 0 | 2899 | 24.0 | 6.0 | 111 | 8 | 0 |

## Credits earned and spent per wave: naive child, 100% learning, meteor powers used (means over 20 seeds)

| Wave | Runs playing this wave (of 20) | Mean bounty earned | Mean learning reward before wave | Mean credits spent | Mean credits unspent after wave | Mean leak damage | Mean colony health after | Mean duration (s) | Max peak aliens | Runs defeated in this wave |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 20 | 24 | 0 | 89 | 85 | 0.0 | 20.0 | 28 | 6 | 0 |
| 2 | 20 | 32 | 30 | 61 | 86 | 0.0 | 20.0 | 28 | 8 | 0 |
| 3 | 20 | 16 | 30 | 48 | 84 | 0.0 | 20.0 | 23 | 3 | 0 |
| 4 | 20 | 36 | 30 | 61 | 90 | 0.0 | 20.0 | 23 | 8 | 0 |
| 5 | 20 | 46 | 30 | 44 | 122 | 0.0 | 20.0 | 23 | 10 | 0 |
| 6 | 20 | 15 | 30 | 52 | 114 | 0.0 | 20.0 | 28 | 2 | 0 |
| 7 | 20 | 34 | 30 | 51 | 128 | 0.0 | 20.0 | 26 | 5 | 0 |
| 8 | 20 | 18 | 30 | 34 | 142 | 0.0 | 20.0 | 23 | 3 | 0 |
| 9 | 20 | 74 | 30 | 38 | 208 | 0.0 | 20.0 | 37 | 14 | 0 |
| 10 | 20 | 82 | 30 | 15 | 306 | 0.0 | 20.0 | 39 | 4 | 0 |
| 11 | 20 | 102 | 40 | 148 | 300 | 0.0 | 20.0 | 34 | 12 | 0 |
| 12 | 20 | 21 | 40 | 67 | 294 | 0.0 | 20.0 | 24 | 1 | 0 |
| 13 | 20 | 90 | 40 | 24 | 400 | 0.0 | 20.0 | 34 | 28 | 0 |
| 14 | 20 | 20 | 40 | 40 | 420 | 0.0 | 20.0 | 28 | 2 | 0 |
| 15 | 20 | 64 | 40 | 28 | 496 | 0.0 | 20.0 | 42 | 9 | 0 |
| 16 | 20 | 39 | 40 | 188 | 387 | 0.0 | 20.0 | 37 | 9 | 0 |
| 17 | 20 | 82 | 40 | 42 | 468 | 0.0 | 20.0 | 34 | 16 | 0 |
| 18 | 20 | 76 | 40 | 42 | 542 | 0.0 | 20.0 | 52 | 19 | 0 |
| 19 | 20 | 117 | 40 | 51 | 648 | 0.0 | 20.0 | 53 | 19 | 0 |
| 20 | 20 | 97 | 40 | 66 | 719 | 0.0 | 20.0 | 55 | 5 | 0 |
| 21 | 20 | 123 | 50 | 146 | 746 | 0.0 | 20.0 | 47 | 26 | 0 |
| 22 | 20 | 60 | 50 | 110 | 746 | 0.0 | 20.0 | 34 | 12 | 0 |
| 23 | 20 | 84 | 50 | 45 | 835 | 0.0 | 20.0 | 45 | 19 | 0 |
| 24 | 20 | 20 | 50 | 38 | 868 | 0.0 | 20.0 | 29 | 4 | 0 |
| 25 | 20 | 88 | 50 | 34 | 971 | 0.0 | 20.0 | 43 | 27 | 0 |
| 26 | 20 | 114 | 50 | 222 | 913 | 0.2 | 20.0 | 56 | 23 | 0 |
| 27 | 20 | 44 | 50 | 68 | 940 | 0.0 | 20.0 | 46 | 5 | 0 |
| 28 | 20 | 69 | 50 | 80 | 979 | 0.0 | 20.0 | 44 | 19 | 0 |
| 29 | 20 | 132 | 50 | 78 | 1083 | 0.4 | 20.0 | 65 | 28 | 0 |
| 30 | 20 | 96 | 50 | 40 | 1188 | 3.6 | 19.6 | 85 | 9 | 0 |
| 31 | 20 | 175 | 60 | 37 | 1387 | 1.1 | 19.6 | 67 | 42 | 0 |
| 32 | 20 | 73 | 60 | 52 | 1468 | 3.5 | 19.1 | 68 | 17 | 0 |
| 33 | 20 | 143 | 60 | 21 | 1650 | 4.2 | 18.6 | 77 | 40 | 0 |
| 34 | 20 | 152 | 60 | 72 | 1790 | 2.5 | 17.6 | 65 | 34 | 0 |
| 35 | 20 | 85 | 60 | 19 | 1916 | 1.7 | 17.4 | 70 | 15 | 0 |
| 36 | 20 | 70 | 60 | 48 | 1997 | 2.9 | 16.9 | 65 | 25 | 1 |
| 37 | 19 | 130 | 60 | 42 | 2104 | 9.4 | 12.4 | 55 | 42 | 4 |
| 38 | 15 | 149 | 60 | 24 | 2225 | 2.3 | 15.3 | 71 | 29 | 2 |
| 39 | 13 | 118 | 60 | 47 | 2316 | 5.2 | 17.1 | 69 | 35 | 0 |
| 40 | 13 | 159 | 60 | 48 | 2486 | 6.5 | 17.2 | 97 | 10 | 1 |
| 41 | 12 | 175 | 75 | 72 | 2657 | 8.8 | 17.6 | 74 | 34 | 0 |
| 42 | 12 | 115 | 75 | 5 | 2843 | 7.2 | 15.1 | 62 | 41 | 1 |
| 43 | 11 | 77 | 75 | 81 | 2919 | 4.4 | 15.3 | 66 | 19 | 0 |
| 44 | 11 | 169 | 75 | 25 | 3139 | 14.9 | 8.5 | 87 | 40 | 4 |
| 45 | 7 | 89 | 75 | 0 | 3274 | 15.1 | 7.7 | 70 | 32 | 3 |
| 46 | 4 | 145 | 75 | 0 | 3258 | 16.5 | 6.0 | 69 | 39 | 2 |
| 47 | 2 | 120 | 75 | 75 | 3228 | 2.0 | 12.5 | 62 | 24 | 0 |
| 48 | 2 | 139 | 75 | 130 | 3312 | 15.5 | 8.5 | 62 | 38 | 1 |
| 49 | 1 | 156 | 75 | 0 | 3153 | 3.0 | 18.0 | 70 | 29 | 0 |
| 50 | 1 | 220 | 75 | 0 | 3448 | 0.0 | 20.0 | 79 | 8 | 0 |

## Minimal player: three Novas on the three weakest starting pads, nothing bought afterwards

| Wave | Leaks | Colony health after | Duration (s) |
|---|---|---|---|
| 1 | 0 | 20 | 18.1 |
| 2 | 0 | 20 | 19.6 |
| 3 | 0 | 20 | 22.3 |
| 4 | 0 | 20 | 21.3 |
| 5 | 0 | 20 | 29.4 |
| 6 | 0 | 20 | 28.9 |
| 7 | 0 | 20 | 37.2 |
| 8 | 0 | 20 | 24.0 |
| 9 | 0 | 20 | 72.6 |
| 10 | 1 | 15 | 85.5 |
| 11 | 7 | 8 | 58.7 |
| 12 | 0 | 8 | 24.5 |
| 13 | 8 | 0 | 45.8 |

## Standalone challenges

| Challenge | Policy | Learning success | Runs | Result | Colony health at end | Combat time (s) |
|---|---|---|---|---|---|---|
| Blob Parade | competent | 0% | 1 | 5 of 5 | 20 | 153 |
| Blob Parade | competent | 60% | 1 | 5 of 5 | 20 | 144 |
| Blob Parade | naive child | 60% | 10 | 10 of 10 runs cleared every wave | 20.0 (min 20) | 144 |
| Wobble Rematch | competent | 0% | 1 | 3 of 3 | 20 | 108 |
| Wobble Rematch | competent | 60% | 1 | 3 of 3 | 20 | 106 |
| Wobble Rematch | naive child | 60% | 10 | 10 of 10 runs cleared every wave | 20.0 (min 20) | 128 |
| Bubble Trouble | competent | 0% | 1 | 6 of 6 | 20 | 229 |
| Bubble Trouble | competent | 60% | 1 | 6 of 6 | 20 | 225 |
| Bubble Trouble | naive child | 60% | 10 | 10 of 10 runs cleared every wave | 20.0 (min 20) | 228 |

## Endless continuation

| Policy | Learning success | Highest wave cleared | Defeated in wave | Peak concurrent aliens | Spawns deferred by the caps (whole run) | Wave at which the reference board was complete | Credits unspent at the end |
|---|---|---|---|---|---|---|---|
| competent | 0% | 87 | 88 | 41 | 0 | 63 | 4787 |
| competent | 60% | 95 | 96 | 47 | 0 | 54 | 9208 |
| competent | 100% | 95 | 96 | 47 | 0 | 49 | 11578 |
