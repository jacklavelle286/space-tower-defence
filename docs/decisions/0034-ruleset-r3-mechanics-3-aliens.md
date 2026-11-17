# 0034. Ruleset r3 with mechanics 3 holds the alien catalogue, traits as data, carriers and caps; current.json stays on r1
Status: Proposed · Date: 2026-11-17

Context: Phase 26 (M2-03) adds the ten aliens of [C §C6.1](../plan/C-game-and-learning-design.md#c61-catalogue) with their
traits, carriers and splitters (C6.3) and the object caps (C6.4). r1 and r2 are published create-only, so the catalogue needs a
new ruleset version ([game-data/README.md](../../game-data/README.md)). C15: a change to a *rule*, not a number, bumps `mechanics`.

Decision: add `game-data/ruleset/r3.json`, **mechanics 3**: r2 unchanged plus every alien of `tools/sim/game_data.json`, number
for number, with its `traits` object key for key (`armour`, `bubbles`, `flying`, `cluster`, `healer`, `children`) and
`descendantOnly` (Slimelet). Mechanics 3 because each trait is a rule a mechanics 2 game-core would not apply (a Shellback with
no armour, a Split Slime that never splits); a planet document's spawn group may also name a carrier's `cargo` (C6.3, waves 38,
43, 47). Mechanics 1 and 2 refuse `traits` and `cargo`. Parse rules: a release list names only aliens that release nothing
themselves (C6.3: no Crafts or Split Slimes in cargo, Slimelets never split); a ruleset with releases needs
`maxDescendantDepth` ≥ 1; every healer shares one period (one clock); a wave never schedules a `descendantOnly` alien. The
bounds file's `maxBounty` counts descendants and cargo (equal to the simulator's C8.2 column for all 45 non-boss waves).
Simulation: traits are data read through `AlienStats`, no per-alien code. Releases per parent: the first on the tick after
the defeat, each next one 15 ticks (0.25 s) after the previous came out; held at the defeat point while 60 aliens or 24
descendants are alive; scheduled spawns wait at 48 alive, and a waiting one comes out at most one per 15 ticks; nothing is
dropped; a wave is complete only with no release queued. `current.json` keeps naming r1 + luna-1-c1.

Where C and the simulator differ, game-core follows C: (1) the simulator releases a parent's k-th descendant at defeat + k × 0.25 s,
so the first two come out 14 ticks apart at 60 Hz; (2) a release the caps held comes out in the simulator together with every
other one due from that parent, game-core keeps one gap per parent (C6.4 table); (3) the heal clock starts at wave start (C2.5),
the simulator's when the first Patchling appears: they differ only if a Patchling spawns exactly on a 3 s multiple. The
deferred-spawn gap (C6.4) is now applied for every mechanics number; no r1 or r2 wave can reach 48 aliens (luna-1-c1 schedules
6 and 8), so no reachable outcome changes.

Alternatives: edit r2 (published; the release refuses changed bytes); mechanics 2 for r3 (old clients would play the traits
wrong); per-alien code switches (traits would not be data); the simulator's release times (the 0.25 s gap of C6.4 would not hold).

Consequences: switching `current.json` to r3 needs a planet document whose waves use the new aliens (luna-1-c1 has Moon Blobs
only), the bounds fixture regenerated (`--write-fixture`), and r3 published before any run can pin it. Bosses (Phase 27) add
boss releases that may contain Split Slimes (generation 2) and boss phases: a rule change, so mechanics 4 in a new ruleset (or
r3 amended, as ADR-0033 was, if r3 is not yet published; Phase 27 did the latter, below). Release-timing difference (1) is reported for the simulator's owner;
`tools/sim` is unchanged.

Amended in Phase 27 (M2-04), before r3 was published: r3 gains `bosses`, the five bosses of
[C §C7](../plan/C-game-and-learning-design.md#c7-bosses) number for number from `tools/sim/game_data.json` (initial playtest
settings): absolute health and speed, `slowFactorPct` 50, `phases` (from 100%, strictly lower; armour, speed factor, on entering
`selfBubbles` / `giveBubbles` / `release`), optional `onDefeatRelease`. A boss release may hold a Split Slime (depth 2); a wave
schedules at most one boss. The phase is a pure function of health (`bossPhaseAt`, integers); every phase one hit reaches runs
before the defeat check; a phase never ends; a boss wave cleared repairs 3. **Still mechanics 3**: no mechanics 3 game-core or
r3 has been published, mechanics 1 and 2 refuse `bosses`, and a Phase 26 parser would refuse it as an unknown key. Simulator
differences: release timing (1) applies to the Mothership's doors; 0.45 × 1.15 tiles/s (517.5 units a tick) rounds to 517, so
Queen Bubbla's baseline wave ends one tick later. Both models agree the C17.4 "Nova only" board beats each boss
(`python3 -B tools/sim/boss_baseline.py`; `web/game-core/src/sim/bosses.test.ts`).

Amended in Phase 28 (M2-05, M2-10), before r3 was published: r3 gains `powers`, the three meteor powers of
[C §C10](../plan/C-game-and-learning-design.md#c10-meteor-powers) number for number from `tools/sim/game_data.json`, under
the contracts' hyphenated key IDs (`frost-pulse`, `comet-burst`, `colony-shield`; the simulator's `frost_pulse` etc.), each with
an `effect` the simulation reads instead of the ID: `slow` (50% for 6 s, the C5.4 rules: cap, one slow at a time, a boss at its
`slowFactorPct`, so 25%), `burst` (within 1.5 tiles of a route point, ceil(50% of maximum health), a boss 10%, straight off
health: no armour, no bubble layer popped, flying not halved; boss phases and the defeat check as for a shot) and `shield` (+10 up
to `shieldAbsoluteCap` 20). `powerRules` gains `perWaveUseLimitPerPower` 1, `sharedLockoutSeconds` 3 and `awardRotation`
(Frost Pulse, Comet Burst, Colony Shield, round again; `meteorAward`), required with `powers` and refused without them. **Still
mechanics 3**: no mechanics 3 game-core or r3 has been published, mechanics 1 and 2 refuse `powers` (their game-core has no
`usePower`), and a Phase 27 parser would refuse it as an unknown key. Simulation: `usePower` is a command applied at a tick
boundary like the others; a charge is spent only by a use; a use is refused with a reason (`UNKNOWN_POWER`, `NOT_NOW` outside a
wave, `NO_CHARGE`, `POWER_USED_THIS_WAVE`, `POWER_LOCKED`, `BAD_TARGET`); the use counts and the lockout live on the Battle and are
cleared when the wave ends, which also trims the shield to 10; the snapshot carries only the counts. The inventory cap is enforced
in one place, the reducer's grant (`grantPowerCharge`; its Python mirror `_grant`): nothing in a battle adds a charge. Simulator
difference (4), found here: the simulator counts a slow down in float seconds, so its 6 s Frost Pulse lasts 361 ticks and Pip's
4 s 241; game-core's last 360 and 240 (C2.1 `round(seconds × 60)`). Whole boss waves with powers on fixed ticks agree with
`python3 -B tools/sim/power_baseline.py` run with game-core's timing (difference 1 and whole-tick slows); `tools/sim` is unchanged.
Determinism (M2-10): the Great Glorp's wave through the real frame loop at 30, 60 and 144 Hz, 2x, jittery frames, pauses and
the 30-step cap gives the same tick count, post-wave snapshot, event log and final state.

Evidence: **[VERIFIED]** 2026-11-17: `web/game-core/src/data/sim-agreement.test.ts` (every r3 alien number and trait, the
rounding rules, C8.2 bounty per wave); `web/game-core/src/sim/aliens.test.ts` (one test per trait, C6.3 releases, C6.4 caps,
a stress wave of 240 aliens that reaches 60 alive and 24 descendants and never passes them, five whole waves where both models
agree); `web/game-core/src/data/game-data.test.ts` (mechanics 3 parse rules); `node game-core/scripts/build-bounds.ts --check`.
Phase 27: `web/game-core/src/sim/bosses.test.ts` (each boss's phases and actions, slows and heals on bosses, leaks, no
state across waves, determinism, the baseline defence per boss and four mixed-board boss waves agreeing with the simulator);
every boss number and all 50 campaign waves' bounty in `sim-agreement.test.ts`; the boss parse rules in `game-data.test.ts`.
Phase 28: `web/game-core/src/sim/powers.test.ts` (each power's effect, charges, the cap, refusals, the per-wave limit and the
lockout, nothing across a wave, four whole boss waves with powers agreeing with the simulator);
`web/game-core/src/sim/determinism.test.ts` (the frame-rate test); the power parse rules in `game-data.test.ts`; every power
number and rule in `sim-agreement.test.ts`; `web/game-core/src/purity.test.ts` (no wall clock or host randomness).
