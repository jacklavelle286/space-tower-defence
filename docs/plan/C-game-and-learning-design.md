# C. Game and learning design

This section owns the combat design (roster, levels, prices, targeting and support rules, aliens, carriers, bosses, the 50-wave
schedule, meteor powers, badges, endless scaling, the economy, unlock order, caps and pads), the worked age-5 / age-7 early run, and the
learning design (curriculum mapping, the content bank for ages 5, 6 and 7, the activity schema, the six interaction types as data,
selection, templates, learning summaries and invalid-content handling).

It does not repeat what other sections own: screens and keyboard/mouse flows for the battlefield and the learning panel are in
[D. UX and content operations](D-ux-and-content-operations.md); the run, slot and session state machines, op processing and DynamoDB
design are in [F. State and data](F-state-and-data.md); routes and payloads are in [G. API contracts](G-api-contracts.md); the speech
pipeline and offline packs are in [E. Architecture](E-architecture.md) and [D](D-ux-and-content-operations.md).

**How to read the numbers.** Every number for game balance in this section (prices, health, speeds, counts, rewards, caps, thresholds,
formulas) is an **initial playtest setting [PROPOSAL]**, not validated balance, even where a table row carries no label of its own
(prompt.md:91, 359). Tables marked "SIM" are outputs of a headless simulator with invented players — evidence that the numbers are not
obviously broken, not evidence that children will enjoy them (section C17). The six class roles, the alien catalogue list, the bosses on
waves 10/20/30/40/50, the meteor positions, three attempts, untimed activities and "same combat and rewards at every age" are
**[CONFIRMED]** by the spec and cited where used.

**Where the numbers come from.** All combat and economy tables below were copied mechanically from the game-design research report
([sources/10-game-design.md](sources/10-game-design.md)), whose tables are themselves printed from the machine-readable data file
[game_data.json](../../tools/sim/game_data.json) in the balance simulator, now kept in the repository under
[tools/sim/](../../tools/sim/) (C17.8). The learning design draws on [sources/09-learning-design.md](sources/09-learning-design.md).
Names, states, keys and rules come from the design spine, [00-spine.md](00-spine.md); where this section and the spine disagree, the
spine wins.

---

## C1. The decisions that matter most

| # | Decision | Label |
|---|---|---|
| 1 | One fixed 60-tick-per-second simulation; 1x/2x = ticks per frame; pause = zero ticks. Combat uses **no random numbers**; attacks resolve in the tick they fire (no simulated projectiles). | **[PROPOSAL]** |
| 2 | Every timer and cooldown starts again at wave start, so **nothing time-based crosses a wave boundary** — [spine S4](00-spine.md#s4-snapshot-and-checkpoint-semantics-proposal)'s rule holds without extra snapshot fields (C2.5). | **[PROPOSAL]**, checked against spine S4 |
| 3 | One 40-tile serpentine route; 16 pads, 6 open at the start and 2 more with each new class. | **[PROPOSAL]** (fallback: all 16 open) |
| 4 | Unlock order Nova (start) → Pip (after 5) → Juno (after 10) → Orion (after 15) → Mira (after 20) → Sol (after 25): the first four unlocks all add firepower before the two non-attacking classes arrive. | **[PROPOSAL]**; pacing points **[CONFIRMED]** prompt.md:357 |
| 5 | Deployment caps Pip 3, Juno 4, Orion 3, Mira 2, Sol 2; Nova uncapped. | **[PROPOSAL]** |
| 6 | Credits come only from bounties and successful normal activities; start 150; **no wave-clear bonus**. Normal reward 30/40/50/60/75 by block of ten intervals, 75 in endless — identical at every age. | sources **[CONFIRMED]** prompt.md:447; values **[PROPOSAL]** |
| 7 | Selling returns 70% of everything paid for that astronaut, rounded down to a multiple of 5; sell-then-rebuy always loses credits. | **[PROPOSAL]** |
| 8 | Colony: 20 health, up to 10 shield points; small aliens leak 1, bosses 8/10/12/14/20. A boss leak is a heavy blow, not automatically the end. | **[PROPOSAL]** |
| 9 | Six alien traits, each one exact rule (armour, bubble layers, flying, healer, splitter, carrier). Five bosses built only from those traits; no new routes, projectiles or pad effects. | **[PROPOSAL]** within prompt.md:403 |
| 10 | Meteor powers in a fixed rotation (Frost Pulse, Comet Burst, Colony Shield, …): one charge per success, kept until used, at most two of each. | **[PROPOSAL]** |
| 11 | Endless waves are a pure function of the wave number, built from waves 41–49 and the five bosses, with every growth capped (all caps reached by wave 120). | **[PROPOSAL]** |
| 12 | Learning: age bank = the lower of the two school years a child of that age could be in; select-then-Check grammar; at least four options on choice types; canonical answers compared by exact equality; maths multiplied by templates, phonics and spelling hand-authored. | **[PROPOSAL]** |
| 13 | Selection is seeded, round-robin by topic inside a fixed subject rotation, never repeats an activity within a run, and fills every campaign slot at run creation or refuses to create the run. | **[PROPOSAL]** (spine S5.3) |
| 14 | Invalid content: only UNRESOLVED slots are voided; reward granted once; nothing counted; nothing replaced (spine S3.3). | **[PROPOSAL]** |

---

## C2. Simulation rules (game-core)

### C2.1 Time

A *fixed timestep* means the game advances in equal, discrete steps ("ticks") whatever the screen's frame rate; the renderer only draws
the latest state. That is what makes "browser frame rate must not change damage, movement or reward outcomes" (prompt.md:303) true by
construction; the same rule appears as AC-13. (AC-42 is only the busiest-wave performance target, C14.)

- One tick = 1/60 simulation second. Durations in the data are seconds, converted once at load: `ticks = round(seconds × 60)`. Speeds are
  tiles per second; movement per tick is `speed / 60`. **[PROPOSAL]**
- Battle speed 1x or 2x; the frame loop is the accumulator of [spine S10](00-spine.md#s10-react--phaser-split-proposal): an **integer** accumulator in units of 1/60,000 s (one tick =
  1,000 units, so no floating-point drift); each frame `acc += min(frameDeltaMs, 250) × speed` in those units, then step while
  `acc ≥ STEP` with at most **MAX = 30 steps per frame**. If the cap is hit, the remaining accumulator is **discarded**, so the game slows
  rather than spiralling into ever-longer catch-up frames. A slow laptop plays in slow motion rather than skipping. A test runs the same
  wave with 30, 60 and 144 Hz frame deltas and expects an identical tick count and post-wave snapshot. **[PROPOSAL]**
- Pause = zero ticks. A hidden page, an open dialog or the learning panel pauses; returning stays paused until Resume (prompt.md:273,
  **[CONFIRMED]**). Choosing a Comet Burst target also pauses, so aiming is untimed. **[PROPOSAL]**
- Preparation runs no ticks and has no countdown; Ready starts the wave (prompt.md:503, **[CONFIRMED]**).

### C2.2 Determinism and arithmetic

- No randomness in combat. Same wave, same board, same commands on the same ticks → same result (prompt.md:409). **[PROPOSAL]**
- Every alien gets a unique integer id in spawn order (prompt.md:391, **[CONFIRMED]**). Ties: further along the route, then lower id.
- Health, damage, credits, shield points, bounties and timers are integers; route progress is fractional, using only addition,
  multiplication and comparison (range checks compare squared distances; the route has only horizontal and vertical segments, so no
  trigonometry). **[PROPOSAL]**

Rounding rules, once:

| Quantity | Rule |
|---|---|
| Alien health in a wave | `max(1, floor(baseHealth * hpMult + 0.5))` |
| Sol buff on damage | `floor((damage * (100 + buffPct) + 50) / 100)` |
| Juno blast on a flying alien | `ceil(damage / 2)` |
| Armour | `max(1, damage - armour)` |
| Patchling heal | `floor(6 * hpMult + 0.5)`, never above maximum health |
| Comet Burst | `ceil(maxHealth * pct / 100)`, removed directly from health |
| Sell refund | `floor(floor(invested * 70 / 100) / 5) * 5` |

Order of steps for one hit: base damage → Sol buff → flying halving (Juno only) → a bubble layer absorbs the whole hit if one exists →
armour → health. **[PROPOSAL]**

### C2.3 Inside one tick

1. Apply queued player commands (place, upgrade, sell, targeting, power) in arrival order, each validated against the state at that moment
   (credits, pad open and free, class unlocked, cap) — so two quick clicks can never drive credits negative (AC-09). This is the [spine S10](00-spine.md#s10-react--phaser-split-proposal)
   rule "economy mutations are simulation commands validated at tick boundaries".
2. Scheduled spawns that are due, then due descendant releases (both respect the caps in C6.4).
3. Support timers: Mira's shield pulses, the shared Patchling heal pulse.
4. Astronaut attacks in pad order P01 → P16. A boss phase change resolves the moment the damage lands.
5. Alien movement in id order; an alien reaching the end of the route leaks at once.
6. Defeat check (colony health ≤ 0), then wave-complete check.

**[PROPOSAL]**

### C2.4 Attacks resolve instantly

An astronaut whose timer is ready and who has a target in range fires on that tick; damage, slow or blast is applied on the same tick and
the timer restarts. Beams, comets and star bursts are drawn afterwards and never affect the simulation. The reasons: nothing is "wasted in
flight" (confusing for a young child); the simulation has only two kinds of entity, astronauts and aliens, which is much easier to write,
test and keep deterministic in a first game; and at 2x the cosmetic effects simply play faster. A newly placed attacker is ready at once;
upgrading does not reset an attack timer; a newly placed Mira starts a full recharge, so re-placing her never speeds up pulses.
**[PROPOSAL]**

### C2.5 Check against spine S4 ("no timer or cooldown crosses a wave boundary; wave randomness from (seed, wave)")

| Timer or random element | Where it lives | Crosses a wave boundary? |
|---|---|---|
| Attack timers (all attackers) | reset to "ready" at wave start | No |
| Mira pulse timer | starts from zero at wave start (or when placed) | No |
| Patchling heal clock | starts at wave start | No |
| Slows on aliens, bubble layers, boss phases | belong to aliens; no alien survives a wave | No |
| Power "once per wave" flags and the 3 s shared lockout | cleared at wave start | No |
| Colony shield above 10 (from Colony Shield) | trimmed to 10 when the wave ends | No (snapshot `colony.shield` ≤ 10) |
| Power charges | integer counts in `snapshot.powers` | Carried, but they are counts, not timers |
| Wave randomness | **none**: campaign waves are authored; endless waves are a pure function of the wave number | Complies trivially; the run `seed` is used only by content selection |

**Verdict: the design complies with [spine S4](00-spine.md#s4-snapshot-and-checkpoint-semantics-proposal); the snapshot needs no timer fields.** Save-and-exit mid-wave therefore loses only the
current wave, as agreed (prompt.md:663-671 via spine S3.2).

---

## C3. Map, route and pads

### C3.1 Space and route

Logical space is a 20 × 11 tile grid (tile-centre coordinates, x 0–19, y 0–10). The angled 2D look (prompt.md:279) is art and projection
only; range, blast and buff previews must be drawn by passing the logical circle through the same projection so the preview is the truth
(prompt.md:331). One authored polyline route (prompt.md:281, **[CONFIRMED]** one route): aliens appear at the portal (0, 2), the colony gate
is at (19, 3), total length 40 tiles. Flying aliens follow exactly this polyline (prompt.md:301). Planet proposal name: Moonbeam Colony,
`planetId` `luna-1` (names as used in [D](D-ux-and-content-operations.md)). **[PROPOSAL]**

| Segment | From waypoint | To waypoint | Direction | Length (tiles) | Route progress at end |
|---|---|---|---|---|---|
| 1 | (0, 2) | (4, 2) | right | 4 | 4 |
| 2 | (4, 2) | (4, 8) | down | 6 | 10 |
| 3 | (4, 8) | (8, 8) | right | 4 | 14 |
| 4 | (8, 8) | (8, 3) | up | 5 | 19 |
| 5 | (8, 3) | (12, 3) | right | 4 | 23 |
| 6 | (12, 3) | (12, 8) | down | 5 | 28 |
| 7 | (12, 8) | (16, 8) | right | 4 | 32 |
| 8 | (16, 8) | (16, 3) | up | 5 | 37 |
| 9 | (16, 3) | (19, 3) | right | 3 | 40 |

The serpentine has three U-bends; each bend has one PRIME pad from which three stretches of path are within short range. Finding them is
the first tactical lesson the map teaches.

### C3.2 Build pads

Every pad is 1 or 2 tiles from the nearest stretch of route (the three PRIME pads P05, P08 and P13 are 1 tile away, the other thirteen
exactly 2), so every attacker (shortest range 2.5) reaches the path from every pad.
"Route in range r" is the length of route within r tiles of the pad centre; divide by an alien's speed for seconds in range.
"Pads within 4.5 / 6.0" counts the other pads inside Sol's two buff radii. Range rule: an alien is in range when the distance from the pad
centre to the alien's point on the route is ≤ the range; alien size is ignored. **[PROPOSAL]**
Pad **data IDs** are lower case, `p01` … `p16`, so they match the spine key-ID pattern `^[a-z0-9-]{1,40}$` ([spine S9.5](00-spine.md#s95-limits-one-shared-limits-file-read-by-client-and-handlers-numbers-assumption)) that
[G](G-api-contracts.md) §5.2 applies to `padId`; `P01` … `P16` are display labels only, used in this section's prose and tables.
**[PROPOSAL]**

| Pad | Tile (x, y) | Opens | Route in range 2.5 | range 3.0 | range 4.5 | range 6.0 | Pads within 4.5 | Pads within 6.0 | Tactical note |
|---|---|---|---|---|---|---|---|---|---|
| P01 | (2, 0) | after wave 20 | 3.0 | 4.2 | 6.0 | 7.7 | 1 | 2 | Portal lookout: sees only the entry stretch. A quiet spot for Mira, who needs no range. |
| P02 | (2, 4) | start | 6.0 | 8.2 | 10.1 | 12.5 | 3 | 4 | Entry corner: first shots; covers the end of the entry stretch and the top of the first descent. |
| P03 | (6, 3) | after wave 5 | 4.8 | 7.3 | 13.9 | 22.9 | 5 | 7 | Mouth of the first U: modest short-range cover; good long-range cover. |
| P04 | (6, 5) | start | 6.0 | 8.9 | 18.4 | 21.9 | 5 | 8 | Inside the first U: sees the descent and the climb; an excellent long-range pad. |
| P05 | (6, 7) | start | 9.0 | 10.5 | 14.1 | 18.8 | 5 | 7 | PRIME - bottom of the first U: three path stretches within short range. |
| P06 | (6, 10) | after wave 15 | 3.0 | 4.5 | 8.1 | 11.3 | 2 | 4 | Below the first U: weak at short range; a perch for long-range Orion. |
| P07 | (10, 1) | after wave 15 | 3.0 | 4.5 | 8.1 | 11.3 | 3 | 6 | Above the top bend: weak at short range; a perch for long-range Orion. |
| P08 | (10, 4) | after wave 10 | 9.0 | 10.5 | 14.1 | 18.9 | 7 | 9 | PRIME - under the top bend: three path stretches within short range. Opens with Juno. |
| P09 | (10, 6) | start | 6.0 | 8.9 | 18.1 | 21.3 | 6 | 11 | Command pad: centre of the map; an excellent long-range pad; all three PRIME pads are within Sol's first radius. |
| P10 | (10, 8) | after wave 25 | 4.0 | 6.5 | 13.1 | 22.0 | 6 | 8 | Beacon mound: little cover of its own, six pads within Sol's radius. Opens with Sol. |
| P11 | (14, 3) | after wave 10 | 4.0 | 6.5 | 13.1 | 21.0 | 6 | 7 | Mouth of the last U: modest short-range cover; good long-range cover. |
| P12 | (14, 5) | start | 6.0 | 8.9 | 18.1 | 20.7 | 5 | 9 | Inside the last U: sees the last descent and the final climb; an excellent long-range pad. |
| P13 | (14, 7) | after wave 5 | 9.0 | 10.5 | 14.1 | 18.9 | 6 | 7 | PRIME - bottom of the last U: the last place to catch groups. Opens with Pip. |
| P14 | (14, 10) | after wave 25 | 3.0 | 4.5 | 8.1 | 11.3 | 2 | 4 | Below the last U: weak at short range; fine for long range. |
| P15 | (18, 1) | after wave 20 | 2.5 | 3.2 | 5.0 | 6.7 | 2 | 3 | Colony balcony: hardly sees the path - ideal for Mira. |
| P16 | (18, 5) | start | 5.5 | 7.2 | 9.4 | 11.2 | 4 | 4 | Last line: covers the final climb and the colony approach. |

### C3.3 Pads open in stages

| When | Pads that open | Pads open in total | Class unlocked at the same moment |
|---|---|---|---|
| start of run | P02, P04, P05, P09, P12, P16 | 6 | Nova |
| after wave 5 (preparing wave 6) | P03, P13 | 8 | Pip |
| after wave 10 (preparing wave 11) | P08, P11 | 10 | Juno |
| after wave 15 (preparing wave 16) | P06, P07 | 12 | Orion |
| after wave 20 (preparing wave 21) | P01, P15 | 14 | Mira |
| after wave 25 (preparing wave 26) | P10, P14 | 16 | Sol |

Why **[PROPOSAL]**: a five-year-old first sees six glowing pads, all good (the weakest still has 5.5 tiles of route in range); every new
class arrives with a free pad that suits it (P13 and P08 are PRIME pads opening with Pip and Juno; P06/P07 are Orion perches; P15 is
Mira's balcony; P10 Sol's beacon mound), so a child who filled every pad is never stuck with a new astronaut and nowhere to put it; and
whether a pad is open is a pure function of `highestCompletedWave`, so nothing new is saved. SIM: the naive simulated child at 60% learning
reached a median of 42 waves with staging against 35.5 with all 16 pads open (C17.3). Fallback: set every pad's `opensAfterWave` to 0.
The spec says only that pads are predefined (prompt.md:281), so staging is plainly a proposal.

---

## C4. The colony

| Rule | Value |
|---|---|
| Health | 20 (an integer). 0 or less is defeat, which is terminal for the run (CONFIRMED prompt.md:675). |
| Shield points | Separate from health, capped at 10. Leak damage comes off shield points first, then health. |
| Sources of shield | Mira's pulses (C5.5) and the Colony Shield power (C10). The power may lift the shield to an absolute cap of 20 for the rest of that wave; anything above 10 is removed when the wave ends. |
| Between waves | Health and shield carry over unchanged (both are in the snapshot). Nothing regenerates while preparing. |
| Repair | +3 health when a boss wave is completed, whether or not the boss was defeated; +1 health per completed wave while a level-3 Mira is deployed (at most 1 per wave in total). Never above 20. |
| Leak damage | Per alien type (C6.1): 1 for small aliens, 2 for sturdy ones, 4 for an Alien Craft, 8 / 10 / 12 / 14 / 20 for the five bosses. |

No alien damages, disables or blocks an astronaut or a pad; nothing in the rules lets anything except a player command change an
astronaut (prompt.md:297, AC-07, **[CONFIRMED]**). Why 20 and these leaks **[PROPOSAL]**: a child can let nineteen Moon Blobs through over
a run and still play on (the twentieth ends it), which is generous early; a boss leak of 8–14 leaves a healthy colony standing, so a missed boss is a setback rather
than the end of a long run; the small boss-clear repair gives a struggling player something back. Repairs are applied by the client before
it reports the post-wave snapshot; the server only checks `0 < health ≤ 20` and `0 ≤ shield ≤ 10` ([spine S6](00-spine.md#s6-plausibility-bounds-proposal-per-op-against-the-stored-snapshot) rule 3).

---

## C5. Astronaut roster

The six roles and their level descriptions are **[CONFIRMED]** (prompt.md:305-355); the names and personalities are the spec's own
proposals; every number is an initial playtest setting **[PROPOSAL]**. `classId` values are the lower-case names (`nova`, `pip`, `juno`,
`orion`, `mira`, `sol`). **[ASSUMPTION]**

### C5.1 Classes

| Name | Role | Unlocks | Deployment cap | Targeting options | Total cost to level 3 |
|---|---|---|---|---|---|
| Nova | Laser Scout | start | no cap | FRONT (default), FAST | 260 |
| Pip | Frost Explorer | after wave 5 | 3 | FRONT (default), FAST | 310 |
| Juno | Comet Engineer | after wave 10 | 4 | CROWD (default), FRONT | 500 |
| Orion | Orbit Ranger | after wave 15 | 3 | FRONT (default), STRONG from level 3 | 600 |
| Mira | Shield Specialist | after wave 20 | 2 | none (does not attack) | 620 |
| Sol | Beacon Commander | after wave 25 | 2 | none (does not attack) | 650 |

Character-card lines (optional, unvoiced, prompt.md:1094-1104): Nova "Ready for launch!", Pip "Let's cool things down.", Juno "I've got a
bright idea.", Mira "The colony is in good hands.", Orion "I can see them coming.", Sol "Better together!".

### C5.2 Levels, purchase and upgrade prices, refunds and values

"Cost of this level" is the purchase price at level 1 and the upgrade price at levels 2 and 3; "Sell refund" is what selling returns at
that level (C5.7).

| Class | Level | Cost of this level | Cumulative cost | Sell refund at this level | Range (tiles) | Attack period (s) | Damage per hit | Damage per second | Special values |
|---|---|---|---|---|---|---|---|---|---|
| Nova - Laser Scout | 1 | 50 | 50 | 35 | 2.5 | 1 | 10 | 10.0 | - |
|  | 2 | 60 | 110 | 75 | 2.5 | 0.6 | 10 | 16.7 | - |
|  | 3 | 150 | 260 | 180 | 3 | 0.6 | 16 | 26.7 | - |
| Pip - Frost Explorer | 1 | 60 | 60 | 40 | 2.5 | 0.8 | 5 | 6.25 | slow 30% for 3s (single target) |
|  | 2 | 80 | 140 | 95 | 2.5 | 0.8 | 6 | 7.5 | slow 40% for 4s (single target) |
|  | 3 | 170 | 310 | 215 | 2.5 | 0.8 | 7 | 8.75 | slow 40% for 4s to every alien within 1 tile of the target |
| Juno - Comet Engineer | 1 | 110 | 110 | 75 | 2.5 | 1.8 | 16 | 8.9 | blast radius 1 tile, full damage to every alien inside |
|  | 2 | 130 | 240 | 165 | 2.5 | 1.8 | 16 | 8.9 | blast radius 1.4 tiles, full damage to every alien inside |
|  | 3 | 260 | 500 | 350 | 2.5 | 1.8 | 26 | 14.4 | blast radius 1.4 tiles, full damage to every alien inside |
| Orion - Orbit Ranger | 1 | 170 | 170 | 115 | 4.5 | 2.4 | 50 | 20.8 | - |
|  | 2 | 100 | 270 | 185 | 6 | 2.4 | 50 | 20.8 | - |
|  | 3 | 330 | 600 | 420 | 6 | 2.4 | 90 | 37.5 | unlocks the STRONG targeting option |
| Mira - Shield Specialist | 1 | 160 | 160 | 110 | - | - | - | - | +1 shield point every 15s (colony shield cap 10) |
|  | 2 | 180 | 340 | 235 | - | - | - | - | +2 shield points every 15s (colony shield cap 10) |
|  | 3 | 280 | 620 | 430 | - | - | - | - | +2 shield points every 12s (colony shield cap 10); +1 colony health when a wave is cleared |
| Sol - Beacon Commander | 1 | 150 | 150 | 105 | - | - | - | - | +15% damage to attacking astronauts on pads within 4.5 tiles |
|  | 2 | 200 | 350 | 245 | - | - | - | - | +25% damage to attacking astronauts on pads within 4.5 tiles |
|  | 3 | 300 | 650 | 455 | - | - | - | - | +25% damage to attacking astronauts on pads within 6 tiles |

Each level changes something a child can see and a preview can show (AC-08), following the spec's level lines one by one: Nova fires
faster at 2, reaches further and hits harder at 3; Pip's frost is stronger and longer at 2 and becomes a small area at 3; Juno's blast
ring grows at 2 and hits harder at 3; Orion reaches further at 2 and hits much harder (and gains STRONG targeting) at 3; Mira's pulses
grow at 2 and quicken at 3, with a capped repair; Sol's bonus grows at 2 and its ring widens at 3. Sol, a support-only class, gets no
invented damage upgrades (prompt.md:355).

### C5.3 Targeting

| Mode | Exact rule |
|---|---|
| FRONT | the alien in range that is furthest along the route (default for every attacking class) |
| FAST | the alien in range with the highest current speed; ties -> FRONT |
| CROWD | the alien in range with the most aliens inside the blast radius around it; ties -> FRONT |
| STRONG | the alien in range with the highest current health; ties -> FRONT (Orion from level 3) |

The targeting enum is exactly `FRONT | FAST | CROWD | STRONG` and the class IDs are `nova`, `pip`, `juno`, `mira`, `orion`, `sol`, as
recorded in [spine S9.5](00-spine.md#s95-limits-one-shared-limits-file-read-by-client-and-handlers-numbers-assumption) and used by [G](G-api-contracts.md) (`placements[]` items look like `{"padId": "p03", "classId": "nova",
"targeting": "FRONT"}`). **[PROPOSAL]**

- At most two modes per class, shown as two picture buttons ([D](D-ux-and-content-operations.md) owns the control). Every attacking class
  defaults to a sensible mode if never touched. Orion gains STRONG at level 3 (prompt.md:346, **[CONFIRMED]** "useful target-priority option").
- Pip, within its mode, prefers an alien that is not currently slowed, so it spreads its frost. Juno defaults to CROWD because a blast
  centred on the front alien wastes the half of the circle ahead of the group. **[PROPOSAL]**
- A targeting change is a placement attribute (`placements[].targeting`) and triggers the debounced SAVE_PREP like any purchase (spine S4).

### C5.4 Pip's slow: cap and stacking (prompt.md:323 asks for both)

- A slow reduces speed by a percentage for a duration. **No stacking**: an alien has one slow at a time; a new slow that is equal or
  stronger replaces it and keeps the longer of the two remaining times; a weaker one is ignored. **[PROPOSAL]**
- **Cap 50%**: no effect or combination can reduce speed by more than half, so no alien can ever be stopped. Pip reaches 40%; Frost Pulse
  reaches the cap. **[PROPOSAL]**
- **Bosses take slows at half strength** (Pip 15% or 20%, Frost Pulse 25%): an advantage against bosses, never the required answer.
- A bubble layer absorbs Pip's damage, but the slow still applies.

### C5.5 Mira's shield and repair limits (prompt.md:339: no unlimited stacking or invulnerability)

- Every `period` seconds of wave time each Mira adds her points to the colony shield, up to the cap of 10. The first pulse comes one full
  period after the wave starts or after she is placed.
- At most 2 Miras. Two level-3 Miras add at most 20 points a minute, and the shield never holds more than 10, so shields soak a trickle of
  leaks but cannot save a colony from a wave that is getting through.
- Level 3 also repairs 1 health when a wave is cleared; total Mira repair is capped at 1 per wave however many Miras there are.
- Mira cannot heal astronauts, because astronauts have no damage mechanic (prompt.md:339). She needs no view of the path; any pad works.

**[PROPOSAL]** throughout.

### C5.6 Sol's buff: strongest wins, no loops (prompt.md:355)

- Sol adds a percentage to the damage of Nova, Pip, Juno and Orion standing on pads whose centres are within Sol's radius of Sol's pad.
- An astronaut inside two Sols' radii gets only the larger percentage. Sol does not buff Sol, Mira or itself, and its strength depends
  only on its own level, so there is no recursion.
- The buff changes damage only — not range, rate, slow strength, shield pulses or bounties.

**[PROPOSAL]** throughout.

### C5.7 Selling and refunds (prompt.md:453)

- Selling removes the astronaut and returns `floor(floor(invested × 70 / 100) / 5) × 5` credits, where `invested` is the purchase price
  **plus every upgrade paid** for that astronaut. The refund at each level is the column in C5.2. **[PROPOSAL]**
- Selling and placing are separate transactions (prompt.md:281, **[CONFIRMED]**). The UI may offer a "swap", but the rules see a sale then
  a purchase.
- **Why sell-then-rebuy can never create credits.** Let W = credits + the sum of `invested` over deployed astronauts. Placing and
  upgrading move credits into `invested` (W unchanged). Selling removes `invested` and returns at most 70% of it, so W falls by at least
  30% of that astronaut's cost. No shop action raises W; only bounties and learning rewards do. W is exactly [spine S6](00-spine.md#s6-plausibility-bounds-proposal-per-op-against-the-stored-snapshot)'s
  `value(s) = credits + invested(placements)`, which is why the server's BUILD-phase bound `value(new) ≤ value(stored)` is sound. The
  simulator's self-test runs 20,000 random shop actions and checks W never rises and credits never go negative (SIM: passes).

### C5.8 Deployment caps

| Class | Cap | Why |
|---|---|---|
| Nova | none | Always available, so a free pad can always be filled and no cap can leave a child with nothing to buy. |
| Pip | 3 | Slows do not stack; three Pips already cover the three bends. |
| Juno | 4 | One per PRIME pad plus one. |
| Orion | 3 | One per inner pad. |
| Mira | 2 | Stops shield stacking drifting towards invulnerability. |
| Sol | 2 | Strongest-wins already limits it; a second Sol only helps a different part of the map. |

The cap appears on the class card as a row of tokens ("three Orion badges, one left"; UX in [D](D-ux-and-content-operations.md)).
Why cap Juno and Orion at all: in early, uncapped tuning the simulated player converged on one-class boards; caps are the most direct and
child-readable way to keep the team mixed. That observation came from intermediate runs that are not among the saved results, so treat
it as the designer's note rather than reproducible evidence. **[PROPOSAL]**

### C5.9 Unlock order, and why (prompt.md:357 asks for an order that supports early bosses)

"After wave 5" means available while preparing wave 6 (prompt.md:357, **[CONFIRMED]**). Available classes are derived from
`highestCompletedWave` and the pinned unlock schedule, never stored from the client ([spine S4](00-spine.md#s4-snapshot-and-checkpoint-semantics-proposal)).

| Unlock | Arrives for | What it adds at that moment | How it supports the bosses |
|---|---|---|---|
| Nova, start | waves 1-5 (Moon Blobs, Meteor Mites) | Dependable single-target damage; the only class the first block needs. | King Wobble can be beaten with Nova alone. |
| Pip, after wave 5 | Shellbacks from wave 6 | The first support choice (the spec's block 1-9 names "early support choices", CONFIRMED prompt.md:413): slowed aliens take more hits from everyone nearby. | King Wobble spends longer under fire, at half strength. |
| Juno, after wave 10 | tight groups (wave 11), swarms (wave 13) | Area damage; PRIME pad P08 opens with her. | Clears Captain Clank's Meteor Mite escort. |
| Orion, after wave 15 | the Shellback parade (wave 16) | A heavy shot that armour barely dents, and reach across half the map. | Captain Clank (armour 5 at first) and every later boss: a slow single target stays inside Orion's range for most of its walk. |
| Mira, after wave 20 | healers, splitters and carriers (waves 21-29) | Insurance, just as there start to be more ways for something to slip through. | Softens a boss leak at 30, 40 and 50. |
| Sol, after wave 25 | the second half | A multiplier, once there are ten or more attackers to multiply. | Queen Bubbla onwards. |

Alternatives considered and rejected **[PROPOSAL]**: *Mira earlier* — a child who buys the newest class would spend on a non-attacker
while firepower is thin, and in the simulator the naive player beat the first two bosses in every seed without any shield class;
*Orion before Juno* — groups arrive before heavy armour does, and one slow heavy shot is the weakest answer to a swarm. No boss requires
any class (C17.4).

---

## C6. Aliens

The nine catalogue entries are **[CONFIRMED]** as a list (prompt.md:365-381; names after the first four are the spec's proposals). Health,
speed, leak, bounty and trait rules are **[PROPOSAL]**.

### C6.1 Catalogue

| Alien | Base health | Base speed (tiles/s) | Leak damage | Bounty | Trait (exact rule) | First appears | Descendants and their bounties | Silhouette / motion cue |
|---|---|---|---|---|---|---|---|---|
| Moon Blob | 24 | 1 | 1 | 4 | No special rule. | wave 1 | - | Round wobbling jelly; slow squash-and-stretch walk. |
| Meteor Mite | 12 | 2 | 1 | 2 | No special rule: simply fast and fragile. | wave 3 | - | Small pointed rock with legs; quick scurry with a dust trail. |
| Shellback | 60 | 0.7 | 2 | 5 | Armour 4: every hit loses 4 damage, but always does at least 1. | wave 6 | - | Wide domed shell; slow heavy plod; hits make a 'clonk' spark. |
| Bubble Swarm | 8 | 1.3 | 1 | 1 | Always arrives as a tight cluster of small bubbles (each bubble is one alien). | wave 8 | - | Tiny bobbing bubbles in a bunch; bouncy hop. |
| Orbit Flutter | 20 | 1.6 | 1 | 3 | Flying: follows the same route; Juno's blast does half damage to it (rounded up). | wave 12 | - | Winged disc with a shadow on the path below; fluttering bob (visual only). |
| Bubble Guard | 34 | 0.9 | 2 | 5 | Four bubble layers: each layer absorbs one whole hit of any size, then pops. Layers never come back. Slows still apply. | wave 14 | - | Alien inside four nested soap bubbles; a layer pops with each hit. |
| Patchling | 26 | 1 | 1 | 4 | Healer: on a shared 3-second clock, every OTHER alien within 1.5 tiles of at least one Patchling regains 6 health multiplied by the wave's health multiplier (never above its maximum; being near several Patchlings gives one heal, not several). | wave 22 | - | Carries a sticking-plaster flag; green sparkle ring on each heal pulse. |
| Split Slime | 44 | 0.8 | 2 | 3 | Splitter: when defeated, releases 2 Slimelets at its route position. If it reaches the colony it does not split. | wave 24 | 2 Slimelet (bounty 1 each) | Two-lobed blob with a visible seam; stretches as it oozes. |
| Slimelet | 14 | 1.2 | 1 | 1 | Descendant of Split Slime. Never splits again. | wave 24 (as a descendant) | - | Half-size single-lobed slime; quick hop. |
| Alien Craft | 120 | 0.6 | 4 | 6 | Carrier: when defeated, releases its cargo (default 4 Moon Blobs; a wave may name other cargo) at its route position. If it reaches the colony it applies its leak damage and releases nothing. | wave 27 | 4 Moon Blob (bounty 4 each) | Toy-like hovering saucer, low over the path; portholes show the passengers. |

- Health in a wave = base health × that wave's health multiplier (C8); speed = base speed × the wave's speed multiplier. Armour, bubble
  layers, leak damage and bounty do not scale.
- Bounty is paid once, when the alien is defeated by any means. A leaked alien pays nothing.
- Defeat is a burst of stars; each trait has a silhouette or motion cue so colour is never the only signal (prompt.md:299, **[CONFIRMED]**).
- "Bubble Swarm" names a cluster; each bubble is an ordinary alien with its own id, health and bounty.

### C6.2 Why these traits: counters are advantages, not requirements (prompt.md:301)

| Trait | Rewards | Everything else still works |
|---|---|---|
| Armour 4 (Shellback) | Big hits: Orion loses 8% of a 50-damage shot, a level-1 Nova loses 40%. | Every hit does at least 1; a level-3 Nova keeps 75%. |
| Bubble layers (Bubble Guard) | Fast hitters and blasts: each hit of any size pops one layer. | Orion pops a layer too; it merely spends a big shot doing so. |
| Flying (Orbit Flutter) | Aimed shots: Nova, Pip and Orion are unaffected. | Juno still does half damage. |
| Small and many (Bubble Swarm, Meteor Mite) | Juno's blast. | Nova pops one bubble per shot. |
| Healer (Patchling) | Burst and area damage that catches the Patchling with its patients. | The heal is small and never stacks. |

### C6.3 Carriers and splitters (rules **[CONFIRMED]** prompt.md:387-401; mechanics **[PROPOSAL]**)

- When a Split Slime or Alien Craft is **defeated**, its descendants are queued at the parent's route progress and released one every
  0.25 s from that exact point, the first on the next tick (so they do not sit exactly on top of each other).
- Each descendant is a normal alien with a new unique id and its own bounty. Parent and offspring rewards are separate lines of the
  catalogue: a Craft pays 6 and each of its Moon Blobs 4; a Split Slime pays 3 and each Slimelet 1.
- A carrier or splitter that **reaches the colony** applies its own leak damage and releases nothing.
- A wave may name a Craft's cargo (waves 38, 43 and 47 do). Cargo may not contain Crafts or Split Slimes; Slimelets never split; only a
  boss release may contain Split Slimes. So descendants are never more than two generations deep.
- **A wave is complete only when** the schedule is exhausted, no release is queued and no alien is active (AC-10).
- **No duplication on pause, reload or retry**: pause runs zero ticks; nothing is saved during a wave; a reload or save-and-exit returns to
  the wave-start snapshot and the whole wave, ids included, is generated again from the same definition ([spine S3.2](00-spine.md#s32-operations-the-only-ways-run-state-changes)).

### C6.4 Object caps (prompt.md:401, 405)

| Limit | Value |
|---|---|
| Maximum active aliens (hard cap, descendants included) | 60 |
| Scheduled spawns wait while this many aliens are active (soft cap) | 48 |
| Maximum live descendants | 24 |
| Gap between descendants released by one parent | 0.25s |
| Minimum gap between deferred scheduled spawns | 0.25s |
| Maximum descendant depth | 2 |

At a cap, a scheduled spawn that is due while 48 or more aliens are active **waits**; waiting spawns are released in schedule order, at
most one every 0.25 s, as room appears. A descendant release waits at its parent's defeat position while 60 aliens are active or 24
descendants are alive. Nothing is dropped, duplicated or re-priced, so the bounty a wave offers is a constant (which the server bound
`maxBounty[w]` relies on). In the authored campaign the caps are a safety net (SIM worst peak 44 aliens at wave 37; most live descendants
10); in endless they are what keeps object counts bounded. **[PROPOSAL]**

### C6.5 No enemy requires a class that is not yet unlocked

By construction: before wave 6 only Moon Blobs and Meteor Mites appear and only Nova exists; a Shellback still takes 6 from each level-1
Nova hit; a swarm bubble pops to one Nova shot; flying affects only Juno; bubble layers and healing treat every class alike or favour the
fast ones. By simulation: a Nova-only board clears 50 waves, and the campaign is completed with any single class removed (C17.4).

---

## C7. Bosses

Proposal names, built only from catalogue traits. They walk the one route, never damage, disable or block astronauts or pads, and fire
nothing (prompt.md:403, **[CONFIRMED]** constraint). Every number is **[PROPOSAL]**.

| Boss (proposal name) | Wave | Appearance | Health | Speed (tiles/s) | Leak damage | Bounty | Escorts in the wave |
|---|---|---|---|---|---|---|---|
| King Wobble | 10 | giant Moon Blob wearing a paper crown | 450 | 0.5 | 8 | 50 | 4 Moon Blob; 4 Moon Blob |
| Captain Clank | 20 | giant Shellback in bolted-on armour plates | 1000 | 0.45 | 10 | 75 | 2 Shellback; 6 Meteor Mite |
| Queen Bubbla | 30 | giant Bubble Guard with a bubble-wand sceptre | 2200 | 0.45 | 12 | 100 | 2 Bubble Guard; 8 Bubble Swarm; 8 Bubble Swarm |
| The Mothership | 40 | giant Alien Craft with three cargo doors | 2300 | 0.4 | 14 | 125 | 4 Orbit Flutter; 6 Meteor Mite |
| The Great Glorp | 50 | mega alien that borrows one trick from each earlier boss | 3600 | 0.4 | 20 | 150 | 2 Shellback; 2 Bubble Guard; 6 Orbit Flutter; 2 Patchling |

| Boss | Phase | Name | Starts | Armour | Speed | On entering the phase | Visual cue |
|---|---|---|---|---|---|---|---|
| King Wobble | 1 | Royal stroll | from 100% health | 0 | x1 | - | Blue, crown upright, slow wobble. |
|  | 2 | Wobble dash | from 50% health | 0 | x1.3 | - | Turns pink with steam puffs, crown tilts, wobble doubles in speed. |
| Captain Clank | 1 | Full plate | from 100% health | 5 | x1 | - | All plates on; hits spark. |
|  | 2 | Cracked shell | from 60% health | 2 | x1.15 | - | Plates fall off with a clatter; cracks glow. |
|  | 3 | Shell off | from 25% health | 0 | x1.4 | - | No shell, spotty pants showing; runs. |
| Queen Bubbla | 1 | First bubble | from 100% health | 0 | x1 | gains 8 bubble layers | Eight-layer bubble; a counter of layers floats above. |
|  | 2 | Bubble gift | from 66% health | 0 | x1 | gains 8 bubble layers; gives 1 bubble layer to every alien within 2 tiles | Waves the wand: new bubble on herself, one layer on every alien within 2 tiles. |
|  | 3 | Bubble storm | from 33% health | 0 | x1.15 | gains 8 bubble layers; gives 1 bubble layer to every alien within 2 tiles | Wand sparkles faster; same gift again; she speeds up. |
| The Mothership | 1 | Doors shut | from 100% health | 2 | x1 | - | Three closed doors with numbered lights. |
|  | 2 | Door one | from 75% health | 2 | x1 | releases 4 Meteor Mite | Door 1 drops open; Meteor Mites tumble out. |
|  | 3 | Door two | from 50% health | 2 | x1 | releases 4 Orbit Flutter | Door 2 opens; Orbit Flutters fly out. |
|  | 4 | Door three | from 25% health | 0 | x1.2 | releases 2 Shellback | Door 3 opens; Shellbacks march out; hull plating falls away and the ship hurries. |
|  | end | Defeated | 0% health | - | - | releases 4 Moon Blob | Pops into a large star burst. |
| The Great Glorp | 1 | Armoured | from 100% health | 4 | x1 | - | Wears Clank's plates. |
|  | 2 | Bubbled | from 70% health | 0 | x1 | gains 10 bubble layers; releases 6 Bubble Swarm | Plates drop; ten-layer bubble inflates; a bubble swarm escapes. |
|  | 3 | Cargo | from 40% health | 0 | x1.1 | releases 2 Split Slime, 4 Meteor Mite | Belly hatch opens: two Split Slimes and Mites spill out. |
|  | 4 | Wobble dash | from 15% health | 0 | x1.35 | - | Turns pink and steams like King Wobble; final rush. |

Rules **[PROPOSAL]**:

- Boss health is an absolute number, **not** multiplied by the wave's health multiplier. Escorts and anything a boss releases are ordinary
  aliens of that wave and are multiplied.
- A phase begins the moment health falls to or below its threshold. If one hit crosses two thresholds, both phases' actions run in order.
  Phase actions run before the defeat check, so a boss's releases can never be skipped and a boss wave's bounty is a constant.
- "Gains N bubble layers" sets the boss's layers to N. "Gives 1 bubble layer" raises every non-boss alien within the radius to at least
  1 layer — the spec's "enemy shields help other aliens" in its simplest form (prompt.md:297).
- Releases follow C6.3 and count towards the same caps. Slows work at half strength on bosses.
- **A boss that reaches the colony** applies its leak damage, is removed, pays no bounty and releases nothing more; the wave still
  completes when everything else resolves, and the run continues if health remains. Completing a boss wave repairs 3 health.
- Phase cues are part of the definition: every phase change must be readable from shape and motion (plates falling off, a door opening, a
  colour change with steam), not from a number. Art in [D](D-ux-and-content-operations.md).

SIM: for the competent player at 0% learning the five boss waves last 50 / 58 / 62 / 75 / 92 s at 1x, with margins 2.07 / 1.63 / 1.56 /
1.3 / 1.16 (margin defined in C8.1).

---

## C8. The 50-wave campaign

**[CONFIRMED]** structure: 50 authored waves, bosses on 10/20/30/40/50, one fixed route, new enemies introduced gently, later challenge
mainly from more aliens, faster aliens and stronger combinations, and an actual wave table with counts, spacing, speeds, introductions and
boss parameters (prompt.md:385, 405, 409-433). Everything in the table is **[PROPOSAL]** except the SIM columns, which are simulator output.

### C8.1 How to read the table

- **Spawn groups**: `count type @start every spacing`. A group's first alien appears `start` seconds after the wave begins; the rest follow
  at the stated spacing. Groups overlap freely; nothing is random.
- **Modifiers**: the health multiplier ("toughness") and, from wave 31, the speed multiplier. Toughness rises linearly between anchors
  (x1 at wave 1, x1.4 at 10, x3.2 at 20, x4.8 at 30, x6 at 40, x7 at 50), rounded to 0.05. Speed is x1 to wave 30, then +0.05 every four
  waves to x1.25.
- **Aliens scheduled (with descendants)**: the bracketed number also counts everything a splitter, carrier or boss can release.
- **Total bounty available**: credits on offer if nothing leaks. This column is `maxBounty[w]` in the bounds file the server uses for the
  COMPLETE_WAVE bound ([spine S5.1](00-spine.md#s51-pins-and-game-data), S6 rule 3).
- **Last scheduled spawn** is rounded half to even (Python `round`) to whole seconds for reading, so 12.5 s (wave 1) shows as 12 and 18.5 s (wave 4) as 18; the data file holds the exact value.
- **Duration**, **peak concurrent aliens** and **margin** are SIM. *Margin* = the largest factor by which every health value in that wave
  could be multiplied before the competent player's board (0% learning, no powers, no purchases during the wave) lets its first alien
  through; 2.0 means "could be twice as tough", 1.08 is thin.

### C8.2 The schedule, one row per wave

| Wave | Spawn groups: count, type, start time, spacing | Modifiers | New this wave / note | Aliens scheduled (with descendants) | Total bounty available | Last scheduled spawn (s) | Duration at 1x (s): competent 0% / 60% | Peak concurrent aliens: competent 0% / worst seen in any campaign scenario | Margin (competent, 0% learning) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 6 Moon Blob @0s every 2.5s | health x1 | Moon Blob | 6 | 24 | 12 | 34 / 34 | 6 / 6 | 4.59 |
| 2 | 8 Moon Blob @0s every 2s | health x1.05 | - | 8 | 32 | 14 | 38 / 38 | 8 / 8 | 3.19 |
| 3 | 8 Meteor Mite @0s every 3s | health x1.1 | Meteor Mite (alone) | 8 | 16 | 21 | 25 / 23 | 2 / 5 | 9.12 |
| 4 | 7 Moon Blob @0s every 1.65s; 4 Meteor Mite @14s every 1.5s | health x1.15 | - | 11 | 36 | 18 | 26 / 21 | 8 / 11 | 3.27 |
| 5 | 9 Moon Blob @0s every 1.6s; 5 Meteor Mite @6s every 2.5s | health x1.2 | - | 14 | 46 | 16 | 24 / 21 | 7 / 13 | 3.48 |
| 6 | 3 Shellback @0s every 9s | health x1.2 | Shellback (alone); Pip available | 3 | 15 | 18 | 29 / 29 | 2 / 3 | 4.33 |
| 7 | 6 Moon Blob @0s every 2.5s; 2 Shellback @6s every 7s | health x1.25 | - | 8 | 34 | 13 | 26 / 26 | 5 / 6 | 3.02 |
| 8 | 6 Bubble Swarm @0s every 0.5s; 6 Bubble Swarm @9s every 0.5s; 6 Bubble Swarm @18s every 0.5s | health x1.3 | Bubble Swarm (alone) | 18 | 18 | 20 | 24 / 24 | 3 / 8 | 7.72 |
| 9 | 10 Moon Blob @0s every 1.15s; 7 Meteor Mite @4s every 1.25s; 2 Shellback @14s every 5s; 10 Bubble Swarm @24s every 0.4s | health x1.35 | - | 29 | 74 | 28 | 41 / 41 | 12 / 19 | 3.12 |
| 10 | 4 Moon Blob @0s every 2s; BOSS King Wobble @8s; 4 Moon Blob @24s every 2s | health x1.4 | BOSS King Wobble | 9 | 82 | 30 | 50 / 38 | 4 / 5 | 2.07 |
| 11 | 7 Moon Blob @0s every 0.45s; 7 Moon Blob @8s every 0.45s; 7 Moon Blob @16s every 0.45s; 9 Meteor Mite @24s every 0.6s | health x1.6 | Juno available; tight groups | 30 | 102 | 29 | 33 / 33 | 10 / 16 | 2.87 |
| 12 | 7 Orbit Flutter @0s every 3.5s | health x1.75 | Orbit Flutter (alone) | 7 | 21 | 21 | 24 / 24 | 1 / 2 | 5.93 |
| 13 | 12 Bubble Swarm @0s every 0.25s; 12 Moon Blob @4s every 0.9s; 12 Bubble Swarm @16s every 0.25s; 9 Meteor Mite @20s every 0.6s | health x1.95 | - | 45 | 90 | 25 | 32 / 31 | 22 / 30 | 2.62 |
| 14 | 4 Bubble Guard @0s every 7s | health x2.1 | Bubble Guard (alone) | 4 | 20 | 21 | 29 / 29 | 2 / 2 | 7.16 |
| 15 | 8 Moon Blob @0s every 1.65s; 4 Orbit Flutter @5s every 2.65s; 2 Shellback @12s every 8s; 5 Meteor Mite @24s every 1.1s | health x2.3 | - | 19 | 64 | 28 | 45 / 43 | 9 / 12 | 2.58 |
| 16 | 5 Shellback @0s every 4s; 7 Meteor Mite @6s every 1.75s | health x2.5 | Orion available; Shellback parade | 12 | 39 | 16 | 45 / 38 | 9 / 9 | 2.19 |
| 17 | 4 Bubble Guard @0s every 4s; 11 Moon Blob @2s every 1.35s; 6 Orbit Flutter @16s every 1.5s | health x2.65 | - | 21 | 82 | 24 | 35 / 31 | 15 / 17 | 2.29 |
| 18 | 12 Bubble Swarm @0s every 0.3s; 12 Bubble Swarm @7s every 0.3s; 10 Meteor Mite @12s every 0.6s; 4 Shellback @14s every 2.65s; 12 Bubble Swarm @24s every 0.3s | health x2.85 | - | 50 | 76 | 27 | 53 / 47 | 16 / 22 | 2.09 |
| 19 | 12 Moon Blob @0s every 1s; 3 Bubble Guard @4s every 5s; 7 Orbit Flutter @14s every 1.25s; 3 Shellback @18s every 4s; 9 Meteor Mite @30s every 0.7s | health x3 | - | 34 | 117 | 36 | 52 / 54 | 17 / 21 | 2.22 |
| 20 | 2 Shellback @0s every 5s; BOSS Captain Clank @8s; 6 Meteor Mite @26s every 1.5s | health x3.2 | BOSS Captain Clank | 9 | 97 | 34 | 58 / 65 | 4 / 6 | 1.63 |
| 21 | 17 Moon Blob @0s every 0.8s; 12 Meteor Mite @6s every 0.8s; 7 Orbit Flutter @16s every 1.25s; 2 Shellback @20s every 4s | health x3.35 | Mira available; breather | 38 | 123 | 24 | 49 / 49 | 23 / 28 | 2.3 |
| 22 | 6 Moon Blob @0s every 1.2s; 2 Patchling @3s every 3s; 6 Moon Blob @12s every 1.2s; 1 Patchling @15s | health x3.5 | Patchling (with Moon Blobs only) | 15 | 60 | 18 | 36 / 33 | 12 / 14 | 2.18 |
| 23 | 3 Shellback @0s every 4.5s; 2 Patchling @2s every 5s; 9 Moon Blob @10s every 1.1s; 3 Bubble Guard @14s every 4s; 5 Meteor Mite @28s every 1s | health x3.7 | - | 22 | 84 | 32 | 40 / 39 | 14 / 19 | 1.9 |
| 24 | 4 Split Slime @0s every 5s | health x3.85 | Split Slime (alone) | 4 (12) | 20 | 15 | 29 / 26 | 4 / 5 | 3.69 |
| 25 | 5 Split Slime @0s every 3s; 12 Meteor Mite @3s every 0.8s; 9 Orbit Flutter @14s every 1.05s; 12 Bubble Swarm @22s every 0.3s | health x4 | - | 38 (48) | 88 | 25 | 41 / 37 | 26 / 27 | 1.76 |
| 26 | 6 Bubble Guard @0s every 2.4s; 3 Patchling @1.5s every 5s; 13 Moon Blob @10s every 0.9s; 4 Shellback @16s every 3s | health x4.15 | Sol available | 26 | 114 | 25 | 57 / 53 | 22 / 25 | 1.79 |
| 27 | 1 Alien Craft @0s; 1 Alien Craft @18s | health x4.3 | Alien Craft (alone; cargo 4 Moon Blobs) | 2 (10) | 44 | 18 | 40 / 40 | 4 / 5 | 2.75 |
| 28 | 1 Alien Craft @0s; 3 Split Slime @4s every 5s; 2 Patchling @6s every 8s; 12 Meteor Mite @20s every 0.65s | health x4.5 | - | 18 (28) | 69 | 27 | 40 / 40 | 17 / 19 | 1.66 |
| 29 | 11 Moon Blob @0s every 0.9s; 3 Shellback @3s every 4s; 3 Bubble Guard @8s every 4s; 2 Patchling @10s every 8s; 6 Orbit Flutter @18s every 1.2s; 1 Alien Craft @24s; 11 Bubble Swarm @30s every 0.25s | health x4.65 | - | 37 (41) | 133 | 32 | 62 / 58 | 22 / 31 | 1.49 |
| 30 | 2 Bubble Guard @0s every 4s; BOSS Queen Bubbla @8s; 8 Bubble Swarm @20s every 0.35s; 8 Bubble Swarm @34s every 0.35s | health x4.8 | BOSS Queen Bubbla | 19 | 126 | 36 | 62 / 58 | 8 / 11 | 1.56 |
| 31 | 16 Meteor Mite @0s every 0.5s; 16 Moon Blob @4s every 0.75s; 4 Shellback @8s every 2.65s; 10 Orbit Flutter @12s every 0.8s; 16 Meteor Mite @24s every 0.5s | health x4.9, speed x1.05 | Mite rush | 62 | 178 | 32 | 53 / 46 | 29 / 43 | 1.46 |
| 32 | 9 Shellback @0s every 2.25s; 5 Bubble Guard @4s every 3s; 3 Patchling @6s every 4s | health x5.05, speed x1.05 | Shell wall | 17 | 82 | 18 | 60 / 54 | 16 / 17 | 1.47 |
| 33 | 15 Bubble Swarm @0s every 0.25s; 6 Bubble Guard @4s every 1.8s; 15 Bubble Swarm @10s every 0.25s; 4 Shellback @14s every 2.35s; 12 Orbit Flutter @20s every 0.65s; 4 Split Slime @22s every 2s; 15 Bubble Swarm @30s every 0.25s | health x5.15, speed x1.05 | Bubble storm | 71 (79) | 151 | 34 | 63 / 61 | 33 / 40 | 1.48 |
| 34 | 14 Orbit Flutter @0s every 0.85s; 3 Patchling @2s every 5s; 16 Moon Blob @10s every 0.7s; 3 Shellback @12s every 3s; 9 Orbit Flutter @22s every 0.8s | health x5.3, speed x1.05 | Flutter flock | 45 | 160 | 28 | 56 / 52 | 29 / 36 | 1.48 |
| 35 | 2 Alien Craft @0s every 12s; 14 Meteor Mite @5s every 0.7s; 4 Split Slime @12s every 2.65s | health x5.4, speed x1.1 | Craft convoy | 20 (36) | 92 | 20 | 57 / 55 | 12 / 15 | 1.59 |
| 36 | 7 Split Slime @0s every 2.5s; 4 Shellback @5s every 4s; 2 Patchling @6s every 8s; 13 Bubble Swarm @24s every 0.25s | health x5.5, speed x1.1 | Slime tide | 26 (40) | 76 | 27 | 52 / 51 | 22 / 26 | 1.41 |
| 37 | 9 Bubble Guard @0s every 1.9s; 4 Patchling @1.2s every 4s; 19 Moon Blob @12s every 0.6s; 14 Meteor Mite @24s every 0.5s | health x5.65, speed x1.1 | Guarded healers | 46 | 165 | 30 | 48 / 42 | 39 / 44 | 1.34 |
| 38 | 12 Moon Blob @0s every 0.75s; 14 Meteor Mite @2s every 0.6s; 10 Orbit Flutter @10s every 0.8s; 4 Shellback @12s every 2.65s; 1 Alien Craft @20s (cargo: 6 Meteor Mite); 2 Split Slime @24s every 4s | health x5.75, speed x1.1 | Fast mix; craft carries Mites | 43 (53) | 154 | 28 | 62 / 56 | 25 / 31 | 1.36 |
| 39 | 4 Shellback @0s every 2.65s; 4 Bubble Guard @3s every 2.65s; 2 Patchling @5s every 8s; 1 Alien Craft @12s; 10 Orbit Flutter @16s every 0.8s; 14 Bubble Swarm @30s every 0.25s; 10 Meteor Mite @34s every 0.55s | health x5.9, speed x1.15 | - | 45 (49) | 134 | 39 | 58 / 50 | 27 / 41 | 1.32 |
| 40 | 4 Orbit Flutter @0s every 1.5s; BOSS The Mothership @8s; 6 Meteor Mite @40s every 1s | health x6, speed x1.15 | BOSS The Mothership | 11 (25) | 195 | 45 | 75 / 66 | 6 / 10 | 1.3 |
| 41 | 18 Moon Blob @0s every 0.6s; 15 Meteor Mite @4s every 0.55s; 6 Shellback @10s every 2.4s; 4 Split Slime @14s every 2.65s; 13 Orbit Flutter @22s every 0.65s | health x6.1, speed x1.15 | Breather before the final climb | 56 (64) | 191 | 30 | 63 / 53 | 29 / 38 | 1.31 |
| 42 | 8 Bubble Guard @0s every 2.15s; 6 Split Slime @3s every 3.2s; 4 Patchling @5s every 4s; 15 Bubble Swarm @22s every 0.25s; 13 Meteor Mite @28s every 0.5s | health x6.2, speed x1.15 | - | 46 (58) | 127 | 34 | 54 / 48 | 28 / 43 | 1.17 |
| 43 | 2 Alien Craft @0s every 12s (cargo: 5 Meteor Mite); 4 Shellback @4s every 4.65s; 9 Orbit Flutter @14s every 1s; 2 Patchling @8s every 8s | health x6.3, speed x1.2 | - | 17 (27) | 87 | 22 | 56 / 51 | 15 / 21 | 1.23 |
| 44 | 10 Bubble Swarm @0s every 0.25s; 12 Moon Blob @3s every 0.75s; 7 Bubble Guard @10s every 2.1s; 7 Shellback @14s every 2.1s; 10 Bubble Swarm @22s every 0.25s; 10 Orbit Flutter @26s every 0.7s; 5 Split Slime @30s every 1.9s; 1 Alien Craft @34s | health x6.4, speed x1.2 | - | 62 (76) | 215 | 38 | 83 / 71 | 28 / 40 | 1.17 |
| 45 | 8 Shellback @0s every 2.55s; 3 Patchling @2s every 7s; 5 Split Slime @8s every 3s; 16 Meteor Mite @20s every 0.5s; 1 Alien Craft @24s | health x6.5, speed x1.2 | - | 33 (47) | 131 | 28 | 66 / 59 | 29 / 32 | 1.13 |
| 46 | 17 Orbit Flutter @0s every 0.65s; 10 Bubble Guard @2s every 1.7s; 17 Moon Blob @12s every 0.55s; 4 Patchling @14s every 3.35s; 6 Split Slime @24s every 2.4s; 1 Alien Craft @30s | health x6.6, speed x1.2 | - | 55 (71) | 237 | 36 | 69 / 66 | 34 / 39 | 1.19 |
| 47 | 2 Alien Craft @0s every 12s (cargo: 4 Orbit Flutter); 5 Shellback @3s every 3.5s; 15 Meteor Mite @10s every 0.55s; 4 Bubble Guard @20s every 3s; 15 Bubble Swarm @34s every 0.3s | health x6.7, speed x1.25 | - | 41 (49) | 126 | 38 | 56 / 49 | 23 / 28 | 1.18 |
| 48 | 15 Moon Blob @0s every 0.65s; 6 Shellback @2s every 3s; 5 Bubble Guard @6s every 3s; 3 Patchling @8s every 6s; 11 Orbit Flutter @20s every 0.75s; 4 Split Slime @24s every 3s; 11 Meteor Mite @34s every 0.65s | health x6.8, speed x1.25 | - | 55 (63) | 202 | 40 | 62 / 57 | 32 / 42 | 1.08 |
| 49 | 2 Alien Craft @0s every 12s; 4 Shellback @2s every 4.65s; 4 Bubble Guard @5s every 4.65s; 3 Patchling @7s every 6s; 9 Orbit Flutter @20s every 0.9s; 3 Split Slime @26s every 4.5s; 12 Bubble Swarm @36s every 0.35s; 9 Meteor Mite @40s every 0.65s | health x6.9, speed x1.25 | Everything together | 46 (60) | 168 | 45 | 59 / 56 | 23 / 37 | 1.18 |
| 50 | 2 Shellback @0s every 4s; 2 Bubble Guard @2s every 4s; BOSS The Great Glorp @8s; 6 Orbit Flutter @30s every 1s; 2 Patchling @34s every 6s | health x7, speed x1.25 | BOSS The Great Glorp - campaign completion | 13 (29) | 220 | 40 | 92 / 84 | 10 / 13 | 1.16 |

Totals: 1374 aliens scheduled across the campaign, 1600 with every possible descendant; 5037 credits of bounty.

### C8.3 How it was built

1. Each wave's composition and timing was written by hand to follow the spec's blocks: 1–9 placement and basics; 11–19 flying, shields and
   group combinations; 21–29 healers, splitters and carriers; 31–39 denser and faster; 41–49 escalation (prompt.md:413-431).
2. Each new alien first appears **alone and in small numbers**: Meteor Mite (3), Shellback (6), Bubble Swarm (8), Orbit Flutter (12),
   Bubble Guard (14), Split Slime (24), Alien Craft (27). The Patchling (22) arrives with Moon Blobs only, because a healer alone has
   nobody to heal. Introduction waves are deliberately easier than their neighbours (prompt.md:385).
3. The wave after each boss shows off the class just unlocked against familiar aliens (tight groups for Juno at 11, a Shellback parade for
   Orion at 16).
4. The tuning script then scaled each ordinary wave's **counts** (keeping its time span) and set each boss's health so the competent
   player's margin follows a target curve — about 4 at wave 1, 2.6 at 9, 2.0 at 19, 1.55 at 29, 1.28 at 39, 1.10 at 49 — with boss waves a
   little below their neighbours. Wave 48 and the last three bosses were then eased by hand (C17.4 says why). Counts were preferred to
   toughness as the lever because the spec asks for "more aliens" first (prompt.md:405).
5. The result is a sawtooth: boss, a gentler wave with a new toy, a build-up, the next boss.

The margin curve is the real design decision; the counts are its consequence. It is very generous early and thin only at the end,
because defeat is terminal and would send a small child back to wave 1 of a campaign with about 40 minutes of combat. **[PROPOSAL]**

---

## C9. Economy

### C9.1 Rules

| Rule | Value | Label |
|---|---|---|
| Starting credits | 150 — exactly three Novas (prompt.md:447 requires a fixed allowance sufficient for a viable basic defence) | **[PROPOSAL]** value; fixed allowance **[CONFIRMED]** |
| Sources of credits | bounties from defeated aliens; one reward per successful **normal** learning activity | **[CONFIRMED]** prompt.md:447 |
| Wave-clear bonus | none | **[PROPOSAL]** |
| Meteor challenge reward | one power charge, never credits | **[CONFIRMED]** prompt.md:439 (power); **[PROPOSAL]** (never credits) |
| Wrong answers | cost nothing (credits or health); three wrong answers end the activity with no reward | **[CONFIRMED]** prompt.md:451, 505-517 |
| Activities per interval | one normal activity, so rewards cannot be farmed | **[CONFIRMED]** prompt.md:453 |
| Same at every age | combat data, prices, bounties and rewards have **no age input at all** | **[CONFIRMED]** prompt.md:449, AC-13 |
| On defeat or a fresh run | credits 150, only Nova, empty board, no powers, six pads; best wave, badges, eligibility and summaries kept | **[CONFIRMED]** prompt.md:455-465, AC-14 |
| Wallet | none; credits belong to one run | **[CONFIRMED]** prompt.md:447, 467 |
| Selling | 70% of everything paid, rounded down to 5 (C5.7) | **[PROPOSAL]** |

**Why no wave-clear bonus.** The spec names two sources of credits and there is no reason to add a third. A bonus would weaken the link
the game is built on — learning is how you get ahead. The usual argument for one (stop a struggling player spiralling, since leaked aliens
pay nothing) is already covered: the learning reward does not depend on how the last wave went, early margins are very wide, clearing a
boss repairs the colony, and Mira exists. It also keeps the server bound to one line. **[PROPOSAL]**

### C9.2 Learning rewards (same for every age)

| Interval | Credits for a successful normal activity (same for every age) | Intervals | Credits in block at 100% | Mean bounty of the following waves | Reward as a share of that bounty |
|---|---|---|---|---|---|
| after waves 1-9 | 30 | 9 | 270 | 39 | 76% |
| after waves 10-19 | 40 | 10 | 400 | 71 | 56% |
| after waves 20-29 | 50 | 10 | 500 | 86 | 58% |
| after waves 30-39 | 60 | 10 | 600 | 139 | 43% |
| after waves 40-49 | 75 | 10 | 750 | 170 | 44% |
| Total |  | 49 | 2520 |  |  |

The reward for the slot after wave `w` depends on `w` alone; it is looked up in the pinned ruleset by `(kind, interval)` when the slot is
created and pinned on the slot ([spine S3.3](00-spine.md#s33-activity-slot)). Endless normal slots pay **75**; meteor slots pay a power (C10). Content never carries a reward
(C22.5). It is stepped by block rather than per wave so that it is easy to say ("30 credits for a right answer") and easy to check.
**[PROPOSAL]**

### C9.3 Income curves

| After wave (and the activity that follows it) | Cumulative bounty (no leaks) | Cumulative learning rewards at 100% | Total credits ever held at 0% learning (start + bounty) | at 60% (expected value) | at 100% |
|---|---|---|---|---|---|
| 5 | 154 | 150 | 304 | 394 | 454 |
| 10 | 377 | 310 | 527 | 713 | 837 |
| 15 | 674 | 510 | 824 | 1130 | 1334 |
| 20 | 1085 | 720 | 1235 | 1667 | 1955 |
| 25 | 1460 | 970 | 1610 | 2192 | 2580 |
| 30 | 1946 | 1230 | 2096 | 2834 | 3326 |
| 35 | 2609 | 1530 | 2759 | 3677 | 4289 |
| 40 | 3333 | 1845 | 3483 | 4590 | 5328 |
| 45 | 4084 | 2220 | 4234 | 5566 | 6454 |
| 50 | 5037 | 2520 | 5187 | 6699 | 7707 |

The 60% column is an expected value; bounty assumes nothing leaks (a board that leaks earns less).

### C9.4 Where the credits go

The reference board is the 16-astronaut mixed team the competent simulated player aims for:

| Class | Astronauts in the reference board | Cost each at level 3 | Cost |
|---|---|---|---|
| Nova | 5 | 260 | 1300 |
| Pip | 2 | 310 | 620 |
| Juno | 4 | 500 | 2000 |
| Orion | 3 | 600 | 1800 |
| Mira | 1 | 620 | 620 |
| Sol | 1 | 650 | 650 |
| Total | 16 |  | 6990 |

- At 0% learning a perfect player ever holds 150 + 5037 credits — about three quarters of the reference board. In the simulator the
  competent player had 4570 invested at the end of wave 50 and completed the campaign (SIM).
- At 60% it had 6030 invested; at 100% the whole reference board (6990), complete at wave 49 (SIM).
- So learning is worth about half as much again as combat income. It never gates progress; it speeds it up — the reading of "optional
  bonuses should make play more rewarding without an unrecoverable question-failure lock" (prompt.md:451).

### C9.5 Purchasing power of one correct answer

| Interval | Reward | Share of a new Nova (50) | Share of the newest class at level 1 (at the start of the block / after the mid-block unlock) | Share of a Nova level-2 upgrade (60) | Share of a Nova level-3 upgrade (150) |
|---|---|---|---|---|---|
| after waves 1-9 | 30 | 60% | Nova 60% / Pip 50% | 50% | 20% |
| after waves 10-19 | 40 | 80% | Juno 36% / Orion 24% | 67% | 27% |
| after waves 20-29 | 50 | 100% | Mira 31% / Sol 33% | 83% | 33% |
| after waves 30-39 | 60 | 120% | Sol 40% | 100% | 40% |
| after waves 40-49 | 75 | 150% | Sol 50% | 125% | 50% |

Early on, one correct answer is worth three quarters of the next wave's whole bounty and more than half a new astronaut, so a child feels
it at once. Later it is a little under half a wave's bounty and pays for a Nova's level-2 upgrade outright. Roughly one purchase per wave is
affordable throughout, a little more with good answers. A five-year-old should never need the arithmetic: a card lights when affordable
and otherwise shows how many more credits are needed ([D](D-ux-and-content-operations.md)).

### C9.6 Can a reasonable baseline defence progress without every bonus? (prompt.md:471)

| Question | Answer | Evidence |
|---|---|---|
| Does the starting allowance give a viable basic defence? | Yes. Three Novas on the three **weakest** starting pads, with nothing ever bought again, clear the first 9 waves without a leak and survive to wave 12 (leaks at waves 10 and 11; health 8 after wave 12; defeated in wave 13). | SIM, results.md "Minimal player" |
| Can the campaign be completed with **no** learning rewards and no powers? | Yes for a careful player: the competent policy clears wave 50 with full health at 0% learning (smallest margin 1.08). | SIM, C17.2 |
| Does a child who gets about 60% right and plays naively get far? | 20 of 20 seeds reached wave 30 (median 42). Only 1 of 20 completed the campaign — limited by **not spending**, not by income. | SIM, C17.3 |
| Do failed activities endanger an early run? | No: two failed activities in waves 1–6 delayed one purchase; nothing leaked (C16.4). | SIM |
| Where is playtesting required? | Whether real children upgrade (the biggest unknown); whether margins near 1.1 in waves 41–50 feel fair; whether Queen Bubbla (wave 30) feels unfair; whether the rewards feel worth answering for. | C17.6, C17.7 |

---

## C10. Meteor powers

**[CONFIRMED]**: optional extra challenges after waves 9, 19, 29, 39 and 49, additional to the normal activity, with separate IDs; success
gives a temporary power useful for the boss; failing or declining must not make the boss unwinnable; powers belong to the run; the spec
suggests a colony shield, a field-wide slowing pulse and a targeted comet burst and asks for quantities, cooldowns, targeting and caps
(prompt.md:439-441, 1156-1166). Everything below is **[PROPOSAL]**. Keyboard and mouse controls are copied here for completeness of the
definition; [D](D-ux-and-content-operations.md) owns the interaction.

| Power | Exact effect | Target | Mouse | Keyboard |
|---|---|---|---|---|
| Frost Pulse | Every alien on the field is slowed by 50% for 6 s (bosses 25%). Obeys the normal strongest-slow rule and the 50% cap. | none - whole field | Click the power button (or its HUD icon). | Press 1, or Tab to the button and press Enter/Space. |
| Comet Burst | Every alien within 1.5 tiles of the chosen point on the route loses 50% of its MAXIMUM health (bosses 10%), ignoring armour and bubbles. Aliens brought to zero are defeated and pay their normal bounty. | a point on the route | Click the power button, move the ring (it snaps to the nearest point of the route), click to drop. Right-click or Esc cancels without using the charge. | Press 2: the ring starts on the front-most alien. Left/Right arrows slide it along the route in half-tile steps, Enter/Space drops, Esc cancels. |
| Colony Shield | Adds 10 shield points at once. May lift the shield above the normal cap of 10 up to the absolute cap of 20; anything above 10 is trimmed when the wave ends. | none | Click the power button. | Press 3, or Tab to the button and press Enter/Space. |

| Meteor challenge | Slot | Power awarded on success | Charges |
|---|---|---|---|
| after wave 9 (before the wave-10 boss) | M-009 | Frost Pulse | 1 |
| after wave 19 (before the wave-20 boss) | M-019 | Comet Burst | 1 |
| after wave 29 (before the wave-30 boss) | M-029 | Colony Shield | 1 |
| after wave 39 (before the wave-40 boss) | M-039 | Frost Pulse | 1 |
| after wave 49 (before the wave-50 boss) | M-049 | Comet Burst | 1 |

| Rule | Value |
|---|---|
| Inventory cap | 2 charges of each power |
| Use limit | each power at most 1 time per wave |
| Shared lockout | 3s after any power before another can be used |
| Persistence | Unused charges stay in the run's inventory (they are run resources in the snapshot) until used, defeat, abandon or run completion. They never transfer to another run. |
| Usable in | any wave after the charge is earned (including the boss wave it was earned for) |
| Award mapping | fixed rotation by meteor challenge: Frost Pulse, Comet Burst, Colony Shield, then round again |
| Aiming | choosing a Comet Burst target pauses the simulation, so aiming is untimed |

Decisions and reasons **[PROPOSAL]**:

- **A fixed mapping, not a choice.** A choice screen is one more decision for a young child just before a boss, and a fixed reward can be
  pinned on the slot at run creation ([spine S3.3](00-spine.md#s33-activity-slot)). Order: the power with no aiming first, then aiming, then the shield, by which time Mira
  has shown what shields are. The mapping continues in endless (`M-059` is the sixth meteor → Colony Shield, and so on round).
- **Unused charges are kept** up to two of each. A child who forgets to press the button has not lost the reward. If a success would take
  a power above 2, the slot still resolves SUCCEEDED (and counts in the summary) but no charge is added; the panel says the store is full.
  In the campaign this cannot happen (Frost Pulse at most 2, Comet Burst at most 2, Colony Shield 1); it can in endless. This rule is
  recorded in spine S3.2 (`SUBMIT_ATTEMPT`): a success at the cap is accepted as SUCCEEDED with no reward rather than raising the cap in
  endless. **[PROPOSAL]**
- **Each power once per wave, with a 3 s shared lockout** (mostly a double-press guard). Because the limits are per wave, only charge
  counts are saved (`snapshot.powers`), and the server's bound "each power count ≤ stored count" holds (spine S6 rule 3) — charges enter
  only through the server's meteor grant.
- **Comet Burst always lands on the route**: the ring snaps to the nearest point of the path, so mouse and keyboard do the same thing and a
  click can never miss. Percentage damage means one definition serves wave 10, wave 50 and endless.
- Keys 1/2/3 act only while the battlefield has focus, never while a learning answer is being typed (prompt.md:273).
- **Declining**: a meteor offer can be dismissed only before its first attempt (`DISMISS_SLOT` → `DECLINED`; owner decision D-11).
- **Every boss is beatable without any power** (SIM, C17.4): the competent player defeats all five with powers unused at 0%, 60% and 100%.

---

## C11. Endless continuation and bounded scaling

**[CONFIRMED]**: optional, offered after the campaign badge is committed; a later defeat keeps the badge and best wave; explicit limits so
"endless" never means unlimited objects; the normal activity precedes wave 51 (prompt.md:405, 435, 519, 1194-1202). Mechanics
**[PROPOSAL]**.

### C11.1 Generator

- Wave `n ≥ 51` is a **pure function of n** (no seed, no randomness): every run meets the same endless waves and the bounds file can give
  `maxBounty[n]` for any n.
- With `j = (n − 50) mod 10`: for j = 1…9 the wave uses the spawn groups of authored wave `40 + j`; for j = 0 (60, 70, 80, …) it is a boss
  wave. The five bosses come round in order, each with its own campaign escorts.

| Quantity | Formula (n = wave number, n >= 51) | Cap | Wave at which the cap is reached |
|---|---|---|---|
| Health multiplier | min(cap, base + perWave * (n - 50)) with base 7, perWave 0.1 | x14 | 120 |
| Speed multiplier | min(cap, base + perWave * (n - 50)) with base 1.25, perWave 0.005 | x1.4 | 80 |
| Count multiplier | min(cap, 1 + perCycle * floor((n - 51) / 10)); group count = ceil(count * countMult), gaps unchanged | x1.25 | 101 |
| Scheduled spawns in one wave | after the count multiplier, if the total exceeds the bound every group is scaled down proportionally | 110 | bound, always in force |
| Boss health | min(cap, base + perBoss * k) with base 4000, perBoss 1000, for the k-th endless boss (k = 1 at wave 60); the boss keeps its own phases, speed and leak damage | 10000 | 110 |
| Concurrent aliens | identical to the campaign caps (60 active, 48 scheduled soft cap, 24 live descendants) | 60 / 48 / 24 | always in force |

| Wave | Template | Health | Speed | Count | Scheduled spawns | Boss health | Bounty available |
|---|---|---|---|---|---|---|---|
| 51 | groups of wave 41 | x7.1 | x1.255 | x1 | 56 | - | 191 |
| 55 | groups of wave 45 | x7.5 | x1.275 | x1 | 33 | - | 131 |
| 59 | groups of wave 49 | x7.9 | x1.295 | x1 | 46 | - | 168 |
| 60 | boss wave: King Wobble with the escorts of wave 10 | x8 | x1.3 | x1 | 9 | 5000 | 132 |
| 65 | groups of wave 45 | x8.5 | x1.325 | x1.05 | 38 | - | 169 |
| 70 | boss wave: Captain Clank with the escorts of wave 20 | x9 | x1.35 | x1.05 | 11 | 6000 | 129 |
| 80 | boss wave: Queen Bubbla with the escorts of wave 30 | x10 | x1.4 | x1.1 | 22 | 7000 | 133 |
| 90 | boss wave: The Mothership with the escorts of wave 40 | x11 | x1.4 | x1.15 | 13 | 8000 | 175 |
| 100 | boss wave: The Great Glorp with the escorts of wave 50 | x12 | x1.4 | x1.2 | 18 | 9000 | 190 |
| 101 | groups of wave 41 | x12.1 | x1.4 | x1.25 | 72 | - | 246 |
| 110 | boss wave: King Wobble with the escorts of wave 10 | x13 | x1.4 | x1.25 | 11 | 10000 | 140 |
| 120 | boss wave: Captain Clank with the escorts of wave 20 | x14 | x1.4 | x1.25 | 12 | 10000 | 131 |
| 130 | boss wave: Queen Bubbla with the escorts of wave 30 | x14 | x1.4 | x1.25 | 24 | 10000 | 135 |
| 200 | boss wave: The Great Glorp with the escorts of wave 50 | x14 | x1.4 | x1.25 | 18 | 10000 | 190 |

### C11.2 Rewards and slots

- Bounties are the catalogue values; an endless boss pays 100. The normal activity before each endless wave pays 75. A meteor challenge
  precedes each endless boss (`M-059`, `M-069`, …) and continues the power rotation. **[PROPOSAL]**
- Slots are planned in blocks of K = 10 intervals by `CHOOSE_ENDLESS` and by each endless `COMPLETE_WAVE` while
  `plannedThrough < (wave − 1) + K` ([spine S5.3](00-spine.md); mechanics in [F](F-state-and-data.md)). Selection is C24.6.
- Offline, the prepared buffer is finite; when it runs out the run waits at a preparation boundary — "Reconnect to get more activities"
  (prompt.md:721, AC-34, **[CONFIRMED]**).
- Hard cap: `COMPLETE_WAVE` at wave 999 sets `status=COMPLETED` (spine S3.2; keeps three-digit slot IDs). **[ASSUMPTION]**

### C11.3 Plateau, and what the simulator shows

- From wave 120 every cap has been reached; from then on wave n and wave n + 50 are identical (templates repeat every 10 waves, bosses
  every 50). Nothing grows.
- At most 110 scheduled spawns per wave, 60 active aliens, 24 live descendants and 16 astronauts — bounded whatever the wave number.
- SIM: the competent player holding the whole reference board was defeated after clearing wave 87 at 0% learning and 95 at 60% and 100%;
  peak 47 aliens; no spawn had to wait for a cap. So a strong board falls well before the plateau and well before the 999 cap, which also
  bounds how many slots an endless run accumulates. Whether that is the right length is a playtest question.
- **Stated plainly:** once the board is complete (wave 49 at 100% learning in the simulator), credits have nothing left to buy. Learning
  rewards then stop changing the game. No credit sink is proposed, because that would be a new feature; if playtests show motivation
  dropping there it is the first thing to consider, as a labelled scope change.

---

## C12. Badges

All badges are positive, personal and permanent. None compares players, ranks anyone or can be lost by playing (prompt.md:155 excludes
rankings and sibling comparison). The server derives every badge from data in an accepted op; the client never sends a badge ID
([spine S2](00-spine.md#s2-trust-model-confirmed-family-level-trust-mechanisms-proposal)). An award is a map set-add `SET badges.#b = if_not_exists(badges.#b, :now)`, so applying it twice changes nothing (spine S7.1).

Two rules from the spine shape this list (both **[PROPOSAL]** in the spine):

- **Badges are thresholds re-evaluated on every `COMPLETE_WAVE`** (spine S8.1), not one-off events, so after a `CAMPAIGN_PROGRESS` reset
  (`badges = {}`) a still-running run re-earns what it reaches ([F](F-state-and-data.md) §10.2). Each rule below is therefore written as a
  condition on the run and its post-wave snapshot, which that op already reads (spine S7.1 step (a)).
- **Campaign-progress badges only on `mode = CAMPAIGN` runs** (spine S3.1 `mode`). Challenge runs earn only their own challenge badge and
  the mode-independent ones marked "any". The final `COMPLETE_WAVE` of a `CHALLENGE` run may write the PROFILE `badges` map **only** —
  never planets, best wave or next-planet eligibility (spine S3.2). **[PROPOSAL]**

| Badge id | Name (proposal) | Award condition (evaluated in the op named) | Mode | Label |
|---|---|---|---|---|
| `first-steps` | First Steps | `COMPLETE_WAVE` with `highestCompletedWave ≥ 1` | CAMPAIGN | **[PROPOSAL]** |
| `boss-1` | Wobble Stopper | `COMPLETE_WAVE` with `highestCompletedWave ≥ 10` | CAMPAIGN | **[PROPOSAL]** |
| `boss-2` | Clank Cracker | `highestCompletedWave ≥ 20` (the same op makes next-planet eligibility true: `bestCompletedWave ≥ 20`, derived, prompt.md:419, 437) | CAMPAIGN | **[PROPOSAL]**; eligibility **[CONFIRMED]** |
| `boss-3` | Bubble Popper | `highestCompletedWave ≥ 30` | CAMPAIGN | **[PROPOSAL]** |
| `boss-4` | Mothership Mover | `highestCompletedWave ≥ 40` | CAMPAIGN | **[PROPOSAL]** |
| `campaign-luna-1` | Colony Hero | `highestCompletedWave ≥ 50`; committed in the `COMPLETE_WAVE` that sets `campaignCompletedAt`, **before** the endless offer is shown | CAMPAIGN | **[CONFIRMED]** prompt.md:435, AC-12; name **[PROPOSAL]** |
| `endless-60` | Star Voyager | `highestCompletedWave ≥ 60` (stage ENDLESS) | CAMPAIGN | **[PROPOSAL]** |
| `safe-and-sound` | Safe and Sound | `COMPLETE_WAVE` of a boss wave (10/20/30/40/50) whose post-wave `colony.health` ≥ the stored wave-start snapshot's health (the boss-clear repair counts) | CAMPAIGN | **[PROPOSAL]** |
| `full-crew` | Full Crew | `COMPLETE_WAVE` whose post-wave placements include at least one of each of the six classes | any | **[PROPOSAL]** |
| `top-team` | Top Team | `COMPLETE_WAVE` whose post-wave placements include at least one level-3 astronaut | any | **[PROPOSAL]** |
| `challenge-blob-parade` | Parade Marshal | `COMPLETE_WAVE` of the final wave of wave set `blob-parade` | CHALLENGE | **[PROPOSAL]** |
| `challenge-bubble-trouble` | Bubble Wrangler | final wave of `bubble-trouble` | CHALLENGE | **[PROPOSAL]** |
| `challenge-wobble-rematch` | Boss Buddy | final wave of `wobble-rematch` | CHALLENGE | **[PROPOSAL]** |

Notes:

- `safe-and-sound` can be computed because, in `IN_WAVE`, the stored snapshot *is* the wave-start snapshot (spine S4).
- Nothing rewards speed, because activities are untimed (prompt.md:503).
- **No learning-outcome badges in v1.** The research also proposed five badges awarded on a resolving `SUBMIT_ATTEMPT` (`meteor-catcher`,
  `keep-trying`, `bright-spark-10`, `bright-spark-50`, `all-rounder`). They are left out of the v1 ruleset **[PROPOSAL]** because:
  spine S3.2 gives `SUBMIT_ATTEMPT` no PROFILE effect and S8.1 evaluates badges on `COMPLETE_WAVE`; three of them would need a Query of
  `SUM#` items that spine S7.1 step (a) does not allow; the `CAMPAIGN_PROGRESS` reset (`badges = {}`, S8.2) would wipe badges earned from
  learning, while `LEARNING_HISTORY` would leave them — one reset touching another category (prompt.md:231); and success-count badges sit
  uneasily beside summaries that are not a scoring system (prompt.md:527). Adding them later is a labelled scope change that needs a
  spine amendment: a PROFILE update on the resolving `SUBMIT_ATTEMPT`, a `SUM#` read in S7.1 step (a) for the summary-based ones, and a
  badge `category` so `CAMPAIGN_PROGRESS` and `LEARNING_HISTORY` each clear only their own badges (prompt.md:231).
- Badge IDs match the spine key-ID pattern `^[a-z0-9-]{1,40}$` (spine S9.5). Badge art is in [D](D-ux-and-content-operations.md).

---

## C13. Standalone short challenges (wave sets)

**[CONFIRMED]**: challenges reuse the same game and activity systems with a short configured wave set and must not become a sandbox or a
second engine (prompt.md:443). Under [spine S3.1](00-spine.md#s31-run-persisted-fields) (wave sets) a challenge is an ordinary run whose pinned wave set has `mode = CHALLENGE`; its slots use
the same `N-001…` IDs within that run. **[PROPOSAL]**

| Id | Name | Campaign waves reused (in order) | Classes available | Starting credits | Astronauts already placed | Pads | Meteor challenge | About |
|---|---|---|---|---|---|---|---|---|
| blob-parade | Blob Parade | 1, 2, 4, 5, 7 | Nova | 150 | none | pads open as when preparing wave 1 | no | Five gentle waves with only Nova on the six starting pads: a first taste, or a quick go. |
| wobble-rematch | Wobble Rematch | 7, 9, 10 | Nova, Pip | 200 | Nova L1 on P04, Nova L1 on P05, Nova L1 on P09, Nova L1 on P12 | pads open as when preparing wave 10 | yes: before the last wave, awards Frost Pulse | The team is already at its posts. Two warm-up waves, an optional meteor challenge for a Frost Pulse, then King Wobble. |
| bubble-trouble | Bubble Trouble | 8, 13, 14, 17, 18, 19 | Nova, Pip, Juno | 250 | Nova L1 on P02, Nova L1 on P04, Juno L1 on P05, Nova L1 on P09, Nova L1 on P12, Pip L1 on P13, Nova L1 on P16 | pads open as when preparing wave 16 | no | A ready-made team with one Juno and one Pip. Six waves of swarms, Bubble Guards and groups. |

- A challenge's `waves[]` are references to authored campaign waves (same spawn groups, same toughness); its wave set carries its own
  starting snapshot (credits, available classes, open pads and optional pre-placed astronauts) and `meteorAfter[]`. Learning rewards are
  **not** a wave-set field: like every slot, a challenge slot takes its reward from the pinned ruleset by `(kind, interval)` (spine S3.3),
  so every challenge pays 30 per correct answer (intervals 1–6 fall in the first block of C9.2). The research gave Bubble Trouble 40; the
  simulator ran it at 40, but the competent policy also cleared all six waves at 0% learning with full health, so the lower reward does
  not change its viability (SIM, results.md "Standalone challenges"). Everything else — simulation, shop, sell rule, caps, three attempts, save, suspend, defeat — is the campaign's machinery.
- A challenge **awards** its own badge the first time its last wave is completed, plus learning-summary counts like any activity. It
  **does not** touch campaign best wave, boss or campaign badges, next-planet eligibility or any other run, and cannot continue into
  endless. Losing one costs nothing beyond the challenge.
- They are deliberately low-stakes: in the simulator the naive player cleared all three in every seed (SIM). Two start with a ready-made
  board because a child placing one astronaut against wave 7 would otherwise lose at once.
- Milestone 1's "small wave set" is simply a short wave set of this kind ([F](F-state-and-data.md), [J](J-execution-backlog.md)).

---

## C14. Performance budget (feeds AC-42)

**[CONFIRMED]** need: smooth 60 fps with an explicitly measured minimum under the busiest authored wave (prompt.md:1032). No frame rate has
been measured; these are budgets to test against. **[PROPOSAL]**

| Budget item | Proposed maximum |
|---|---|
| Active aliens (simulation entities) | 60 |
| Astronauts | 16 |
| Beam / comet-streak effects alive at once (pooled) | 32 |
| Blast-ring / frost-ring effects alive at once (pooled) | 16 |
| Particles alive at once (pooled; 8 per star burst) | 240 |
| Floating reward texts alive at once (pooled) | 24 |

There are **no simulated projectiles**; what a player calls projectiles are pooled render-only effects with fixed lifetimes (beam or comet
streak ≈0.15 s, ring ≈0.3 s, an 8-particle star burst ≈0.5 s). When a pool is empty the oldest effect is recycled or the new one skipped;
the simulation never waits for an effect. Busiest authored waves (SIM):

| Wave | Aliens scheduled | With descendants | Peak concurrent aliens (competent, 0%) | Worst peak in any campaign scenario | Worst peak of live descendants | Most astronaut shots in one second |
|---|---|---|---|---|---|---|
| 37 | 46 | 46 | 39 | 44 | 0 | 21 |
| 31 | 62 | 62 | 29 | 43 | 0 | 21 |
| 42 | 46 | 58 | 28 | 43 | 8 | 22 |
| 48 | 55 | 63 | 32 | 42 | 8 | 28 |
| 33 | 71 | 79 | 33 | 41 | 8 | 18 |
| 39 | 45 | 49 | 27 | 41 | 4 | 22 |

Proposed AC-42 measurement: (a) wave 37 at 2x with a deliberately weak board (worst alien count), recording minimum and 1%-low frame rate;
(b) a synthetic scene with 60 aliens, 16 level-3 astronauts and every effect pool full. The target figure is set after the first prototype
measurement, scheduled in M2 on the children's laptop ([J](J-execution-backlog.md) task M2-13; method in [I](I-validation.md)), and is
then written into this section through a decision record. AC-42 is only this performance target; frame-rate determinism is a separate
rule (prompt.md:303, AC-13; C2.1). **[PROPOSAL]**

---

## C15. Where these numbers live in the build

| Document ([spine S5.1](00-spine.md#s51-pins-and-game-data)) | Contents from this section | Notes |
|---|---|---|
| Ruleset `/game-data/ruleset/<version>.json` | `mechanics` integer; simulation constants; colony; classes and levels; targeting; combat rules (slow cap, buff rule, shield cap, rounding); aliens and traits; bosses and phases; caps; powers and power rules; economy (learning reward blocks, endless reward, sell rate, subject rotation); endless formulas; badge definitions | `game_data.json` is already shaped this way **[PROPOSAL]** |
| Planet document `/game-data/campaign/<version>.json` | map, route polyline, pads with `opensAfterWave`; `waveSets{campaign:{mode CAMPAIGN, waves[50], meteorAfter[9,19,29,39,49], startCredits 150, unlocks}, blob-parade:{…}, wobble-rematch:{…}, bubble-trouble:{…}}` | spine S3.1 |
| Bounds file (generated by a TypeScript build script from `game-core`) | `maxBounty[w]` (the "Total bounty available" column; endless computed), prices and cumulative costs (for `invested`), unlock waves, pad opening, caps, power inventory cap, colony maxima | spine S5.1, S6; Python reads numbers only |

All game data is authored in the repository under `game-data/` (to create) and published as `/game-data/<kind>/<version>.json` with the
kinds `ruleset`, `campaign`, `asset-manifest` and `bounds`; `/game-data/current.json` names the versions for new runs (spine S5.1).

`game-core` owns the formulas; the selftest invariants in C17.5 become its unit tests ([I](I-validation.md)). Any change to a rule (not a
number) bumps `mechanics` (spine S5.1). The game-data build refuses any wave set with `3 + (finalWave − 1) + len(meteorAfter) > 100`,
the DynamoDB transaction limit for creating a run: the campaign is 3 + 49 + 5 = 57 actions and the three challenges are far below it.
**[PROPOSAL]**

When [game_data.json](../../tools/sim/game_data.json) seeds the first ruleset and planet document, align three things in it with this
section **[VERIFIED]** by reading the file on 2026-11-14:

- Its badge list still defines the five learning-outcome badges dropped in C12; remove them.
- It describes `full-crew` and `top-team` on the **wave-start** snapshot and the boss badges as completion events; this section evaluates
  every badge on `COMPLETE_WAVE` against the **post-wave** snapshot as `highestCompletedWave ≥ n` thresholds (C12).
- `simulation.tickOrder` lists "boss phase checks" under step 3 (support timers); this section and `sim.py` resolve a phase change the
  moment the damage lands (step 4 of C2.3). Correct the note.

---

## C16. Worked early run: the same game for a five-year-old and a seven-year-old

This answers prompt.md:56 and 1204: a detailed early run with real credit arithmetic, purchases and upgrades, and age-appropriate activities
for both ages. **The credit table applies, unchanged, to the age-5 child and the age-7 child**: same starting allowance, same classes,
same aliens, same bounties, same prices, same slot IDs, same subject in each interval and the same reward for each success (prompt.md:1110-1124,
AC-13). Only the question inside each slot differs (C16.2). All values are initial playtest settings **[PROPOSAL]**.

### C16.1 Credits, purchases and upgrades, waves 1–10 (every activity answered correctly on one of its three attempts)

Executed through the simulator (SIM): waves 1–6 are the report's scripted example
([example.py](../../tools/sim/example.py)); waves 7–10 extend the same script with "place Nova on P02", "upgrade P12", "upgrade P04",
"upgrade P13", run in memory with the same `run()` function. Nothing leaked; the colony stayed at 20 health throughout. That extension
was a one-off run during planning and is **not** in `example.py`, which still stops at wave 6 (its `run()` defaults to `waves=6`;
**[VERIFIED]** by reading the file). Adding the four extra commands to the script, so the table can be regenerated, is a small follow-up
for the first balance task. **[PROPOSAL]**

| Wave | Credits at start of interval | Learning activity (identical reward for every age) | Purchases before Ready | Credits at Ready | Aliens | Bounty earned | Credits after wave | Leaks | Colony health |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 150 | - | Place Nova (Laser Scout) on P05: -50; Place Nova (Laser Scout) on P09: -50; Place Nova (Laser Scout) on P12: -50 | 0 | 6 Moon Blob | +24 | 24 | 0 | 20 |
| 2 | 24 | Activity after wave 1 (subject: maths), slot N-001: correct, +30 | Place Nova (Laser Scout) on P04: -50 | 4 | 8 Moon Blob | +32 | 36 | 0 | 20 |
| 3 | 36 | Activity after wave 2 (subject: phonics), slot N-002: correct, +30 | Upgrade Nova on P05 to level 2: -60 | 6 | 8 Meteor Mite | +16 | 22 | 0 | 20 |
| 4 | 22 | Activity after wave 3 (subject: spelling), slot N-003: correct, +30 | Place Nova (Laser Scout) on P16: -50 | 2 | 7 Moon Blob, 4 Meteor Mite | +36 | 38 | 0 | 20 |
| 5 | 38 | Activity after wave 4 (subject: maths), slot N-004: correct, +30 | Upgrade Nova on P09 to level 2: -60 | 8 | 9 Moon Blob, 5 Meteor Mite | +46 | 54 | 0 | 20 |
| 6 | 54 | Activity after wave 5 (subject: phonics), slot N-005: correct, +30 | Place Pip (Frost Explorer) on P13: -60 | 24 | 3 Shellback | +15 | 39 | 0 | 20 |
| 7 | 39 | Activity after wave 6 (subject: spelling), slot N-006: correct, +30 | Place Nova (Laser Scout) on P02: -50 | 19 | 6 Moon Blob, 2 Shellback | +34 | 53 | 0 | 20 |
| 8 | 53 | Activity after wave 7 (subject: maths), slot N-007: correct, +30 | Upgrade Nova on P12 to level 2: -60 | 23 | 6 Bubble Swarm, 6 Bubble Swarm, 6 Bubble Swarm | +18 | 41 | 0 | 20 |
| 9 | 41 | Activity after wave 8 (subject: phonics), slot N-008: correct, +30 | Upgrade Nova on P04 to level 2: -60 | 11 | 10 Moon Blob, 7 Meteor Mite, 2 Shellback, 10 Bubble Swarm | +74 | 85 | 0 | 20 |
| 10 | 85 | Activity after wave 9 (subject: spelling), slot N-009: correct, +30; then meteor M-009 (maths): correct, +1 Frost Pulse charge (no credits) | Upgrade Pip on P13 to level 2: -80 | 35 | 4 Moon Blob, 1 BOSS King Wobble, 4 Moon Blob | +82 | 117 | 0 | 20 |

Board at Ready for wave 10: Nova L1 on P02 and P16; Nova L2 on P04, P05, P09 and P12; Pip L2 on P13 (7 astronauts, 680 credits invested).
The Frost Pulse charge was kept, not used (the simulated player held it; King Wobble fell without it). Clearing wave 10 repairs 3 health
(already at the cap of 20) and awards `boss-1` (`first-steps` was awarded at wave 1).

Arithmetic checks, by hand:

- Wave 4: 22 credits + 30 (N-003) = 52; a Nova costs 50 → 2; wave 4 pays 7 Moon Blobs × 4 + 4 Meteor Mites × 2 = 36 → 38.
- Wave 9 → 10: 85 + 30 (N-009) = 115; Pip level 2 costs 80 → 35; wave 10 pays 8 Moon Blobs × 4 + King Wobble 50 = 82 → 117.
- Invested at Ready for wave 10: two level-1 Novas 2 × 50 = 100, four level-2 Novas 4 × 110 = 440, Pip at level 2 = 140; total 680.
  Cross-check: 150 start + bounties of waves 1–9 (24 + 32 + 16 + 36 + 46 + 15 + 34 + 18 + 74 = 295) + learning (9 × 30 = 270) = 715
  credits ever held before wave 10's bounty; 715 − 35 in hand at Ready = 680 invested. The [spine S6](00-spine.md#s6-plausibility-bounds-proposal-per-op-against-the-stored-snapshot) value `credits + invested` is 715 at
  that moment, which is what the server's BUILD-phase bound compares against.

### C16.2 The questions in each slot (same slot, same subject, same reward; different content)

Subject rotation is maths → phonics → spelling by interval (`N-k` subject = rotation[(k−1) mod 3]); meteor *j* uses rotation[(j−1) mod 3],
so `M-009` is maths — never the same subject as `N-009` (spelling). Activity IDs, topic IDs and speech IDs follow the spine key-ID pattern
(lower case, hyphens). Items marked † are records in C25.5 (three in full, the rest one line each); the others are illustrative rows from the topic tables (C19). All content
is **[PROPOSAL]** (illustrative, not reviewed). The age-6 column shows the coverage a six-year-old would get in the same intervals.

| Slot (after wave) | Subject | Reward on success | Age 5 activity (type) | Age 7 activity (type) | Age 6 (coverage) |
|---|---|---|---|---|---|
| `N-001` (1) | maths | 30 | † `ma-0101` count 8 pictured stars, choose 8 on a 0–10 track (NUMBER_SELECT, template `COUNT_OBJECTS`) | † `ma-0301` "14 + ? = 20", choose 6 on a 0–20 track (NUMBER_SELECT, template `BOND_TO`) — the spec's own pair (prompt.md:1116-1118) | † `ma-0201` "7 = ? − 9" → 16 (TYPED numeric) |
| `N-002` (2) | phonics | 30 | † `ph-0102` press Play, hear /sh/, choose "sh" from s, sh, ch, th (MULTIPLE_CHOICE; Example B, prompt.md:1128) | † `ph-0302` sort sea, head, dream, bread, meat, instead by the sound of "ea" (OBJECT_MOVE sort) | † `ph-0202` hear the alien name "chom", choose its name tag (MULTIPLE_CHOICE) |
| `N-003` (3) | spelling | 30 | † `sp-0103` build "cat" from tiles c, a, t, o, n (ARRANGE letters) | † `sp-0303` "hop + ing": type "hopping" (TYPED word) | † `sp-0203` build "rain" from r, ai, n, ay, a (ARRANGE letters) |
| `N-004` (4) | maths | 30 | † `ma-0104` share 6 stars fairly between Nova and Pip (OBJECT_MOVE distribute) | † `ma-0304` order 38, 83, 30, 80 smallest first (ARRANGE sequence) | `maths-count-steps-2-5-10`: 5, 10, 15, ? → 20 (TYPED numeric) |
| `N-005` (5) | phonics | 30 | † `ph-0105` hear /m/, choose the picture that starts with it: moon (PICTURE_SELECT) | † `ph-0305` hear "knee", choose the written word from need, knit, knee, neat (MULTIPLE_CHOICE) | `phonics-gpc-split-digraphs`: hear "kite", choose from kit, kite, cut, cute (MULTIPLE_CHOICE) |
| `N-006` (6) | spelling | 30 | † `sp-0106` "d _ g" with a dog picture, choose "o" from o, i, u, a (MULTIPLE_CHOICE) | † `sp-0306` read "knight", choose the matching picture (PICTURE_SELECT) | `spelling-y1-plurals-s-es`: "one fox, two …" → foxes (MULTIPLE_CHOICE) |
| `N-007` (7) | maths | 30 | `maths-bonds-to10`: ten-frame with 7 filled, "how many more to make 10?" → 3 (NUMBER_SELECT) | `maths-add-two-digit`: 34 + 20 = ? → 54 (TYPED numeric) | `maths-add-within20`: 9 + 7 = ? → 16 (TYPED numeric) |
| `N-008` (8) | phonics | 30 | `phonics-blend-cvc`: read "pin", choose the picture from pin, pan, pen, pig (PICTURE_SELECT) | `phonics-tricky-read-y2`: hear "because", choose from because, became, before, behind (MULTIPLE_CHOICE) | `phonics-tricky-read-y1`: hear "said", choose from said, sad, side, says (MULTIPLE_CHOICE) |
| `N-009` (9) | spelling | 30 | `spelling-tricky-set1`: hear "the", choose from the, thu, tha, teh (MULTIPLE_CHOICE) | `spelling-y2-contractions`: "did not" → didn't from didnt, did'nt, didn't, din't (MULTIPLE_CHOICE) | `spelling-y1-prefix-un`: "un + lock" → build "unlock" (ARRANGE letters) |
| `M-009` (9, meteor, optional) | maths | 1 Frost Pulse charge | † `ma-0107` "What is one more than 6?" → 7 (TYPED numeric, template `ONE_MORE_LESS`) | † `ma-0307` two parts, one Check: "Which number is in the 5 times table?" (12, 18, 25, 32) **and** "5 × 6 = ?" (MULTIPLE_CHOICE + TYPED) | `maths-multiply-groups-arrays`: 3 rockets with 2 astronauts each → 6 (NUMBER_SELECT) |

What is identical for both children in every row: the slot ID and its reward marker; the reward amount (from the pinned ruleset by slot,
never from content); up to three attempts with no timer and no penalty; an unresolved activity waits across refreshes with its attempts
and option order intact; Ready is available only once the normal slot has resolved; the meteor is optional and can be declined before its
first attempt; the next wave's aliens are the same (prompt.md:1110-1124, 1156-1166; AC-13, AC-15, AC-16, AC-17).

### C16.3 One interval step by step (age 5 and age 7 side by side, after wave 1)

| Step | Age 5 (`N-001`, `ma-0101`) | Age 7 (`N-001`, `ma-0301`) | Same for both |
|---|---|---|---|
| Wave 1 cleared | 24 credits; `phase = ACTIVITY` | 24 credits; `phase = ACTIVITY` | `COMPLETE_WAVE` applied; the next-phase rule finds `N-001` UNRESOLVED |
| Panel opens | "How many stars?" — 8 stars, a 0–10 track; a skippable demonstration card shows the first time this concept appears (`intro: AUTO`) | "14 + ? = 20" — a 0–20 track | Untimed; nothing is consumed by opening, waiting or the demonstration |
| Attempt 1 | selects 7, presses Check → "Not quite. Have another go." (7 marked tried, tries left 2) | selects 4, Check → same message | One `SUBMIT_ATTEMPT {slotId N-001, answer}` per Check; written locally before feedback ([spine S4](00-spine.md#s4-snapshot-and-checkpoint-semantics-proposal)) |
| Refresh | same question, 7 still marked, tries left 2 | same question, 4 still marked | attempts live on the slot (AC-17) |
| Attempt 2 | selects 8 → "You got it! +30 space credits" | selects 6 → "You got it! +30 space credits" | slot `SUCCEEDED`; +30 in the same transaction; `SUM#maths#<topic>` +1 completed, +1 succeeded |
| Build | 54 credits; buys a Nova (−50) → 4; Ready | 54 credits; buys a Nova (−50) → 4; Ready | same board, same wave 2 |

### C16.4 Variant: the activities after waves 2 and 4 are failed (three wrong answers each)

| Wave | Credits at start of interval | Learning activity (identical reward for every age) | Purchases before Ready | Credits at Ready | Aliens | Bounty earned | Credits after wave | Leaks | Colony health |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 150 | - | Place Nova (Laser Scout) on P05: -50; Place Nova (Laser Scout) on P09: -50; Place Nova (Laser Scout) on P12: -50 | 0 | 6 Moon Blob | +24 | 24 | 0 | 20 |
| 2 | 24 | Activity after wave 1 (subject: maths), slot N-001: correct, +30 | Place Nova (Laser Scout) on P04: -50 | 4 | 8 Moon Blob | +32 | 36 | 0 | 20 |
| 3 | 36 | Activity after wave 2 (subject: phonics), slot N-002: three wrong answers, +0 | (nothing bought) | 36 | 8 Meteor Mite | +16 | 52 | 0 | 20 |
| 4 | 52 | Activity after wave 3 (subject: spelling), slot N-003: correct, +30 | Place Nova (Laser Scout) on P16: -50 | 32 | 7 Moon Blob, 4 Meteor Mite | +36 | 68 | 0 | 20 |
| 5 | 68 | Activity after wave 4 (subject: maths), slot N-004: three wrong answers, +0 | Upgrade Nova on P05 to level 2: -60 | 8 | 9 Moon Blob, 5 Meteor Mite | +46 | 54 | 0 | 20 |
| 6 | 54 | Activity after wave 5 (subject: phonics), slot N-005: correct, +30 | Place Pip (Frost Explorer) on P13: -60 | 24 | 3 Shellback | +15 | 39 | 0 | 20 |

The child has earned 60 credits less than in C16.1 by wave 6 (two rewards of 30). Credits in hand after wave 6 are the same (39) because
one level-2 upgrade (Nova on P09, 60) was not bought; that Nova stays at level 1. Nothing leaked;
the colony is still at 20. Two failed activities delayed one purchase; they did not endanger the run (prompt.md:451). Both summaries
record `failed + 1` for those topics; no credits or health were taken away (SIM; AC-16).

---

## C17. Simulator evidence

### C17.1 What the model is, and is not

`sim.py` is a headless fixed-timestep model of the rules in C2–C13: movement along the polyline; range from pad coordinates; the four
targeting modes; damage with buff, flying, bubbles and armour in the stated order; slows with no stacking, the cap and the boss factor;
full-radius blasts; colony shield and repair; strongest-wins buff; the shared heal pulse; splitters and carriers with queued releases; boss
phases; leaks; bounties; buying, upgrading and selling before and during waves; meteor powers with their limits; caps with waiting spawns;
the endless generator; and the challenges. Python 3 standard library only.

**It is a coarse model with heuristic players. It is not validation with real children.** It says nothing about fun, whether a
six-year-old can read the board at 2x, how long a child takes to notice the upgrade button, or how losing feels. It runs the matrix at 30
ticks per second with fractional timers where the game will use 60 whole ticks (the two were compared: identical outcomes, C17.5). Its one
purpose is to stop the first playtest starting from numbers that are obviously broken.

Players:

- **Competent** — a pad plan per class (Juno on P05, P08, P13, P14; Orion on P04, P09, P12; Pip on P03, P11; Sol on P10; Mira on P15/P01;
  Nova elsewhere), holds a cheap Nova on a pad until the planned class unlocks, buys by test-playing the next two waves (made tougher) on a
  copy of the board, buys during waves, keeps powers for bosses. It knows the next two waves exactly, which a child does not. Think of an
  attentive adult.
- **Naive child** — random open pad; buys the newest class half the time, the cheapest 30%, a random one 20%; does nothing in a quarter
  of preparation phases; upgrades rarely (15%, 30% once every pad is full); never sells or changes targeting; fires a power at a random
  moment of a boss wave 70% of the time. Twenty seeds.
- **Learning success** 0%, 60%, 100%: each normal activity pays with that probability (competent: a fixed evenly spread pattern plus five
  random seeds; naive: seeded random). With powers "used", meteor challenges succeed with the same probability in the random-outcome
  runs, and always succeed at 60% and 100% in the fixed-pattern competent runs; at 0% no power is ever earned, so the two 0% rows are
  identical by construction.

### C17.2 Competent player

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

| Design target | Result (SIM) |
|---|---|
| Competent, 0% learning, no powers: clears wave 50; a thin margin is fine | **Met.** Cleared 50 with 20 health and 0 leak damage. Margins in waves 41-49 lie between 1.08 and 1.31; the smallest of the campaign is 1.08 at wave 48; the final boss wave has 1.16. |
| Competent, 60%: clears comfortably | **Met.** Cleared 50 with 20 health on the fixed pattern and on all five random-outcome seeds. |
| Waves 1-5 very hard to lose | **Met.** Margins in waves 1-9 lie between 3.02 and 9.12; the minimal player (three Novas on the three weakest starting pads, nothing bought afterwards) clears waves 1-9 without a leak, leaks in waves 10 and 11 (health 8 after wave 12) and is defeated in wave 13. |

### C17.3 Naive child

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

| Design target | Result (SIM) |
|---|---|
| Naive, 60%: clears at least wave 20 in most seeds | **Met.** 20 of 20 seeds. |
| Ideally reaches 30 or more | **Met in this model.** 20 of 20 seeds; range 32 to 50, median 42. Only 1 of 20 completed the campaign. |

For this child **the limit is spending, not income**: at 100% learning they get no further than at 60% and end with about 2974 credits
unspent; the same child who always upgrades once the pads are full completes the campaign in 19 of 20 seeds at 60%. So the most valuable
thing the interface can do for a young player is make spare credits obviously spendable — an unmistakable "you can upgrade me" cue
([D](D-ux-and-content-operations.md)). Boss outcomes for the naive child at 60%:

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

### C17.4 No boss requires a class or a power

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

Boss-wave margins for restricted boards (no powers, no in-wave purchases; colony treated as indestructible for this measurement only):

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

Reading these honestly: with any **one** class removed the campaign is completed at 0% and 60% learning; the lowest single-class-removed
boss margin at 0% is 1.06 (waves 30 and 50, without Orion). The first tuned numbers did **not** pass this: without Orion and with no learning
income the last three bosses got through (margins about 0.93), so their health was lowered by a tenth to a sixth. Orion remains the
strongest single answer to a boss, as its role says; it is now an advantage rather than a necessity, by a small margin. A Nova-only board
finishes with 4 health: the starting class stays viable for the whole campaign, but only just.

### C17.5 Other checks

| Measure (competent policy, 1x speed) | 0% learning | 60% | 100% |
|---|---|---|---|
| Shortest ordinary wave (s) | 24 | 21 | 21 |
| Longest ordinary wave (s) | 83 | 71 | 72 |
| Ordinary waves shorter than 25 s | 4 | 5 | 5 |
| Boss waves 10/20/30/40/50 (s) | 50 / 58 / 62 / 75 / 92 | 38 / 65 / 58 / 66 / 84 | 35 / 44 / 56 / 62 / 66 |
| Total campaign combat time (min) | 40.4 | 37.5 | 35.4 |

Same campaign at 30 and at 60 ticks per second (competent, 0%): 50 waves, 20 health, 0 leak damage, 4570 invested both times; combat time
40.4 and 40.3 minutes. Endless (SIM):

| Policy | Learning success | Highest wave cleared | Defeated in wave | Peak concurrent aliens | Spawns deferred by the caps (whole run) | Wave at which the reference board was complete | Credits unspent at the end |
|---|---|---|---|---|---|---|---|
| competent | 0% | 87 | 88 | 41 | 0 | 63 | 4787 |
| competent | 60% | 95 | 96 | 47 | 0 | 54 | 9208 |
| competent | 100% | 95 | 96 | 47 | 0 | 49 | 11578 |

Self-checks in `selftest.py`, all passing: bosses on 10/20/30/40/50; each alien's first wave matches the catalogue; no pad within a tile of
the route; shop actions never raise credits plus investment and never go negative; deployment caps hold; every spawned alien is resolved
exactly once; bounty earned equals bounty available when nothing leaks; identical inputs give identical runs; slows never exceed the cap;
the shield is trimmed at wave end; the endless generator is deterministic, capped and periodic after the caps; the worked example's credit
totals equal an independent calculation from the data tables. These invariants (not the per-wave numbers) become `game-core` unit tests
([I](I-validation.md)).

### C17.6 Soft spots, stated plainly

1. The competent player is strong; "thin margin at 0% learning" is thin *for that player*. A child who answers nothing correctly should not
   be expected to finish — a judgement, not a result.
2. A few ordinary waves are shorter than about 25 s (4 at 0%, 5 at 60%; shortest 21 s): gentle introduction waves against a strong board.
3. Nova alone only just finishes; Orion was close to required for the late bosses until three boss healths were lowered. Both sit near
   their limits.
4. The naive child rarely completes the campaign (1 of 20 at 60%), held back by not upgrading. Whether real children behave like that is
   unknown.
5. Queen Bubbla (wave 30) is the first boss the naive board often fails to stop (13 of 20 defeated). The run survives, but it may feel
   unfair. Candidates: fewer bubble layers or less health.
6. Powers barely matter in the model. They may matter more to children, or may need to be stronger to feel worth an extra challenge.
7. Credits have no use once the board is complete (C11.3).
8. The challenges are almost impossible to lose — intended for this audience, but practice rather than a test.
9. The worst campaign alien peak (44) is within a few of the 48 soft cap; a weaker player could touch it (effect: a few spawns arrive a
   moment late).
10. Class balance is only roughly right; the deployment caps are doing real work.
11. Margins below about 1.15 are fragile: wave 48 moved from 1.10 to 0.98 after an unrelated boss-health change and was eased by hand.
    Read them as "about level", not a guarantee.
12. The model has no misplacement, accidental sale, hesitation or reading of the board — all of that belongs to playtests ([I](I-validation.md)).

### C17.7 Numbers most likely to change in playtests

| Number (current value) | Observation that would trigger a change | Likely direction |
|---|---|---|
| Toughness curve for waves 31-50 (x4.9 to x7) and the late wave counts | Most children who do upgrade still lose in the 30s or 40s; or nearly every child finishes a first run without a leak | Lower, or raise, the last two anchors, then re-run `tune.py --adapt` |
| Counts in waves 1-9 | A child who places three Novas loses health before wave 6; or the first waves are over too quickly to watch | Fewer or more Moon Blobs; wider or tighter spacing |
| Colony health (20) and boss leak damage (8 / 10 / 12 / 14 / 20) | One boss leak ends runs that were otherwise going well; or leaks feel free | Health up or boss leaks down; or the reverse |
| Boss health (450 / 1000 / 2200 / 2300 / 3600) and boss speeds | A boss dies before its phases can be seen; a boss reaches the colony for most children; boss waves drag | Each boss on its own; aim for 40 to 100 s |
| Queen Bubbla's 8 bubble layers, three times | Children do not understand why their shots do nothing | Fewer layers, or a clearer layer counter |
| Learning rewards (30 / 40 / 50 / 60 / 75) | Children who answer well hardly notice the reward; or children who answer badly cannot keep up at all | Change the block values; keep one value per block |
| Starting credits (150) | Children want a fourth astronaut at once; or wave 1 is trivial | 150 to 200 |
| Deployment caps (Pip 3, Juno 4, Orion 3) | Children are upset at being refused a favourite; or boards turn into one class | Raise or lower by one |
| Nova level-3 range (3.0) | The upgrade is too small to notice; or level-3 Novas cover everything | 2.75 to 3.25. Small changes matter because most pads are exactly 2 tiles from the path. |
| Pip's slow (30% then 40%, for 3 then 4 s) and its level-3 radius (1.0) | Slowed aliens do not look slower; or a level-3 Pip makes waves crawl | Strength first, then duration |
| Juno's blast radius (1.0 then 1.4) and damage (16 then 26) | Juno seems useless outside swarm waves; or clears whole waves alone | Radius is the sensitive one |
| Orion's period (2.4 s) and damage (50 then 90) | Orion's slow shot is dull to watch; or bosses melt | Shorter period with less damage |
| Shellback armour (4) and Bubble Guard layers (4) | The traits go unnoticed in late waves | Armour could grow by block; layers to 5 |
| Mira's pulses (1 or 2 points every 15 s, then every 12 s) and the shield cap (10) | Mira seems to do nothing; or two Miras make leaks irrelevant | Pulse size first, then the cap |
| Sol (+15% then +25%; radius 4.5 then 6.0) | Children cannot tell that Sol does anything | Make the effect visible first; then the percentage |
| Sell refund (70%) | Children are upset at losing credits when moving an astronaut | 80%, or a free undo for a purchase made in the same preparation phase |
| Meteor powers (50% slow for 6 s; half of maximum health within 1.5 tiles, a tenth for bosses; +10 shield) | Powers are forgotten or feel weak | Stronger effects before more charges |
| Spawn spacing and the 2x speed | Groups are unreadable at 2x; waves drag at 1x | Spacing; possibly 1.5x in place of 2x |
| Staged pads (6, then 2 more five times) | Children ask why they cannot use the other pads, or do not notice new ones | Open more at the start; celebrate each opening |
| Endless slope (+0.10 toughness per wave) | Endless runs end too soon to be worth choosing, or last for hours | Slope and caps |

### C17.8 How to re-run it

The simulator, its data and its saved results are kept in the repository under [tools/sim/](../../tools/sim/) (copied from the planning
work), with [game_data.json](../../tools/sim/game_data.json) as the seed of the first ruleset and planet documents (C15) and
[results.md](../../tools/sim/results.md) as the saved output behind the SIM tables. It is plain Python 3 with no dependencies, so it needs no
packaging. It is a design tool, not product code: it is never deployed, and the TypeScript `game-core` (not the simulator) is the
authority for rules. **[PROPOSAL]**

To re-run after a balance change (`-B` stops Python writing `__pycache__/` folders into the repository):

```
cd tools/sim
python3 -B make_data.py          # authored tables -> game_data.json
python3 -B selftest.py           # invariants and the worked-example arithmetic
python3 -B run_matrix.py         # ~2.5 minutes on 8 cores -> results.json
python3 -B tables.py --results   # tables.json and results.md
python3 -B sim.py competent 0.6 1 1   # one campaign, wave by wave (policy, learning success, powers used, seed)
python3 -B tune.py               # margin before every wave; --adapt re-tunes counts and boss health to the target curve
```

Checked on 2026-11-14 **[VERIFIED]**: `python3 -B tools/sim/selftest.py` prints "selftest: all checks passed". Two known rough edges,
both verified by running or reading the files:

- `python3 -I tools/sim/selftest.py` fails with `ModuleNotFoundError: No module named 'sim'`, because isolated mode drops the script's
  folder from the import path. Plain `python3 -B` works. Making the scripts importable under `-I` is a small tidy-up, not a blocker.
- `build_report.py` (which regenerated the research report's tables during planning) still writes to `tools/research/10-game-design.md`, a
  path that does not exist in this repository. Do not run it until its output path is pointed at
  [sources/10-game-design.md](sources/10-game-design.md) or the script is retired; the published report is a record of the planning-time
  numbers, and C is where current numbers live.

Every number change made during playtests goes through the simulator first ([J](J-execution-backlog.md) M4-07).

---

## C18. Learning content: curriculum basis and age mapping

England's national curriculum is the agreed reference (prompt.md:475, **[CONFIRMED]**). Sources read for the research (all on GOV.UK,
checked 2026-11-14 by the learning-design research,
[sources/09-learning-design.md](sources/09-learning-design.md), **[VERIFIED]** there): the mathematics and English programmes of study (key stage 1),
English Appendix 1 (spelling), the EYFS statutory framework effective 1 September 2026 (early learning goals), Development Matters, the
national-curriculum overview table (age → year group), Letters and Sounds 2007 (phase progression), the reading framework (pronouncing
phonemes), and the DfE validated-phonics list. A revised national curriculum is due for first teaching in September 2028, so every
curriculum reference carries a framework prefix (`NC14`, `EYFS26`, `DM23`, `LS07`) and can be re-mapped later without touching pinned runs.
**[PROPOSAL]**

### C18.1 Age band → bank

- `ageBand` = age in completed years on the run-creation date (Europe/London), accepted only if 5, 6 or 7; pinned on the run ([spine S5.1](00-spine.md#s51-pins-and-game-data);
  prompt.md:219-221). A birthday affects new runs only (AC-06). **[CONFIRMED]** behaviour.
- Bank for band N = every published, selectable activity with `minAge ≤ N ≤ maxAge`. **An activity may span at most two adjacent ages**
  (`maxAge − minAge ≤ 1`): shared 5–6 and 6–7 items cut authoring cost, and forbidding 5–7 keeps "questions differ by age" plainly true.
  **[PROPOSAL]**
- Each birthday age spans two school years (a 5-year-old may be in Reception or Year 1). The bank is anchored on the **lower** year,
  stretching into the upper one, because there is no adaptive difficulty and no parent override to rescue a child from a bank that is too
  hard, and a too-hard item has a real cost (no reward after three attempts) where a too-easy one costs only a little stretch. **[PROPOSAL]**

| Band | Could be in school year | Anchor for the bank | Mix realised through the topic list | Phonics stage reference |
|---|---|---|---|---|
| 5 | Reception or Year 1 | End-of-Reception early learning goals, plus the first part of Year 1 | about three quarters Reception-stage topics, one quarter early Year 1 | Letters and Sounds phases 2–4; no phase 5 graphemes required |
| 6 | Year 1 or Year 2 | The Year 1 programme of study, complete | about one fifth consolidation from band 5, most of the rest Year 1, a little early Year 2 | Phase 5 ("throughout Year 1"); pseudo-words as in the year 1 check |
| 7 | Year 2 or Year 3 | The Year 2 programme of study, complete | about one quarter Year 1 consolidation, three quarters Year 2; no Year 3 content | Phase 6 ("throughout Year 2") and the Year 2 spelling appendix |

The caveat to print in operator notes and keep in mind: *the age bank is a curated product decision. A birthday does not tell us a child's
school year, the phonics programme their school uses, or what they can do. The game never changes difficulty in response, never labels
content with a school year, and never shows the child a level* (prompt.md:475). Children aged 4 or 8 have no bank: `CONTENT_UNAVAILABLE
{reason: AGE_OUT_OF_RANGE}` (C24.8); the eighth-birthday cliff is owner decision D-3.

---

## C19. Topic tables by age and subject (ages 5, 6 and 7)

**How to read them.** `topicId` is the stable key used by selection, the learning summary (`SUM#<subject>#<topicId>`) and the admin
filter. Format `<subject>-<area>-<specific>`, lower case, at most 40 characters, matching the spine's key-ID pattern
`^[a-z0-9-]{1,40}$` ([spine S9.5](00-spine.md#s95-limits-one-shared-limits-file-read-by-client-and-handlers-numbers-assumption)). **Topic IDs are append-only: never renamed, never reused** — summaries are keyed on them; the
child-facing title can change. The topic registry (ID, child-facing title, subject, bands, curriculum references) is one versioned JSON
file in the repository shipped to both apps and both API Lambdas; adding a topic is a normal release. **[PROPOSAL]**

Types: PS picture selection · NS number selection · OM moving/counting/sorting objects · AR arranging letters or ordered items · MC multiple
choice · TY typed numeric or word (C20). Audio: *None* = no clip needed; *Optional* = a clip helps but a picture or text also identifies the
target; *Required* = the answer depends on hearing (the answer area stays hidden until the clip bytes are local). Tiers: A = whole word,
B = isolated continuant or vowel sound (needs a listening check), C = isolated stop and similar (risky; the bank works even if tier C
fails the Milestone 0 listening spike — [D](D-ux-and-content-operations.md) D9). Tier B and C sounds are spoken with the engine in
`tts_phoneme_engine` (default `neural`; the M0 bake-off may switch it to `generative`); a sound that fails the listening test is either
authored at tier A or replaced by a human recording **[CONFIRMED by owner, 2026-11-14]**, and its `word-only` verdict is recorded in
`content/listening-verdicts.json` (to create) so a machine check refuses an isolated-sound (`PHONEME`) definition for it (spine S5.2).
Source: T = template (generator kind, C25), H = hand-authored.
"(5–6)" / "(6–7)" marks a topic shared with the neighbouring band. Examples illustrate format only; every real item goes through review
(C22.3). All rows **[PROPOSAL]**; the curriculum statements the codes point to were verified by the research.

### C19.1 Age 5 — maths (13 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `maths-count-objects-to10` | Counts up to 10 pictured objects and gives the numeral; or counts out a number of objects | EYFS26.ELG.Number-1; DM23.R "count objects…", "link the number symbol…"; NC14.Ma.Y1.NPV-4 | NS, PS, OM, TY | None | T `COUNT_OBJECTS`, `COUNT_OUT` | 8 stars → choose 8 on a 0–10 number track |
| `maths-count-subitise-to5` | Recognises dice and five-frame patterns up to 5 | EYFS26.ELG.Number-2 | NS, PS | None | T `COUNT_OBJECTS` (dice layouts) | dice face of 4 → choose 4. Untimed, so it cannot force true subitising; it still practises the patterns |
| `maths-count-objects-to20` | Counts 11–20 objects set out in ten-frames or rows | EYFS26.ELG.NumPat-1; DM23.R "count beyond 10"; NC14.Ma.Y1.NPV-2 | NS, TY | None | T `COUNT_OBJECTS` | a full ten-frame and 4 more → 14 |
| `maths-compare-to10` | Finds the most, the fewest or the same; orders three or four numbers | EYFS26.ELG.NumPat-2; NC14.Ma.Y1.NPV-4 | PS, MC, AR | None | T `PICK_EXTREME`, `ORDER_NUMBERS` | four plates of stars (3, 6, 4, 8): "Which has the most?" |
| `maths-number-one-more-less-to10` | One more or one less than a number to 10 | DM23.R "one more than or one less than"; NC14.Ma.Y1.NPV-3 | NS, TY, MC | None | T `ONE_MORE_LESS` | "One more than 6?" → 7 |
| `maths-bonds-to5` | Parts that make 5, with take-away facts | EYFS26.ELG.Number-3 | NS, MC, OM | None | T `BOND_TO` | five-frame with 3 filled: "How many more to make 5?" → 2 |
| `maths-bonds-to10` | Parts that make 10 on a ten-frame | EYFS26.ELG.Number-3; NC14.Ma.Y1.AS-2 | NS, MC, OM | None | T `BOND_TO` | ten-frame with 7 filled → 3 |
| `maths-add-within10` | Combines two pictured groups, total up to 10 | EYFS26.ELG.Number-1; NC14.Ma.Y1.AS-3 | NS, TY, OM | None | T `ADD_WITHIN` | 4 rockets and 3 rockets → 7 |
| `maths-subtract-within10` | Takes away with pictures, starting from up to 10 | EYFS26.ELG.Number-3; NC14.Ma.Y1.AS-3 | NS, TY | None | T `SUB_WITHIN` | 8 aliens, 3 fade away → 5 |
| `maths-double-halve-to10` | Doubles to 5 + 5; halves an even number to 10 | EYFS26.ELG.Number-3, NumPat-3 | NS, OM | None | T `DOUBLE_HALVE` | "Double 4" → 8 |
| `maths-share-equal-groups` | Shares objects equally between two | EYFS26.ELG.NumPat-3 | OM, MC | None | T `SHARE_EQUALLY` | share 6 stars between Nova and Pip → 3 each |
| `maths-pattern-repeating` (5–6) | Continues an AB, AAB, ABB or ABC pattern of shapes | DM23.R "continue, copy and create repeating patterns"; NC14.Ma.Y1.Notes | PS, AR | None | T `PATTERN_NEXT`, some H | circle, triangle, circle, triangle, ? → circle |
| `maths-shape-name-2d` | Recognises and names circle, triangle, square, rectangle | NC14.Ma.Y1.G-1; EYFS maths programme (shape) | PS, MC, OM | None | H | "Which one is a triangle?" from four shapes |

### C19.2 Age 5 — phonics (9 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `phonics-gpc-letters-set-a` | Hears a sound (or a word) and chooses its letter: s a t p i n m d g o c k | EYFS26.ELG.WordReading-1; LS07 phase 2 sets 1–3 | MC, PS | Required. Tier B for s, a, i, n, m, o; tier C for t, p, d, g, c, k | H | hear /s/ → s from s, a, t, p |
| `phonics-gpc-letters-set-b` | Same for e u r h b f l j v w x y z qu, and ck ff ll ss zz | EYFS26.ELG.WordReading-1; LS07 phase 2 sets 4–5, phase 3 sets 6–7 | MC, PS | Required. Tier B for e, u, f, l, v, z, x; tier C for r, h, b, j, w, y, qu | H | hear "van": "Which letter does it start with?" → v from v, f, w, n |
| `phonics-initial-sounds` | Picks the picture that begins with the sound heard | EYFS26.ELG.WordReading-1; LS07 phase 2 | PS | Required (sound) | H | hear /m/ → moon from moon, sun, cat, dog |
| `phonics-gpc-consonant-digraphs` (5–6) | Hears the sound, chooses ch, sh, th or ng | EYFS26.ELG.WordReading-1 ("at least 10 digraphs"); LS07 phase 3 | MC | Required. Tier B (sh, ch); tier C (th, ng) | H | hear /sh/ → sh from s, sh, ch, th |
| `phonics-gpc-vowel-digraphs` (5–6) | Hears the sound, chooses ai, ee, igh, oa, oo, ar, or, ur, ow, oi, ear, air, er | EYFS26.ELG.WordReading-1; LS07 phase 3 | MC | Required, tier B | H | hear /ee/ → ee from ee, ai, oa, oo |
| `phonics-blend-cvc` | Reads a CVC word and chooses its picture; or hears a word and chooses it in writing | EYFS26.ELG.WordReading-2; DM23.R "blend sounds into words" | PS, MC | Tier A, or none when the child reads | H | read "pin" → the pin from pin, pan, pen, pig |
| `phonics-blend-digraph-words` | The same with phase 3 graphemes | EYFS26.ELG.WordReading-2 | PS, MC | Tier A, or none | H | hear "ship" → ship from ship, shop, chip, sheep |
| `phonics-blend-adjacent-consonants` (5–6) | Words with adjacent consonants (CVCC, CCVC) | NC14.EnApp1.Y1 revision "words with adjacent consonants"; LS07 phase 4 | PS, MC | Tier A, or none | H | hear "frog" → frog from frog, fog, from, flag |
| `phonics-tricky-read-set1` | Hears a common exception word and chooses it in writing | EYFS26.ELG.WordReading-3; LS07 phase 2–3 tricky words | MC | Required, tier A | H | hear "she" → she from she, he, we, me |

### C19.3 Age 5 — spelling (8 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `spelling-cvc-build` | Builds a CVC word from letter tiles (picture and word cue) | EYFS26.ELG.Writing-2; NC14.EnApp1.Y1 revision | AR | Optional word clip, tier A | H | tiles c, a, t, o, n → "cat" |
| `spelling-cvc-missing-letter` | Chooses the missing first, middle or last letter | EYFS26.ELG.Writing-2 | MC | Optional | H | d _ g with a dog picture → o from o, i, u, a |
| `spelling-sounds-count` | Counts the sounds in a spoken word (segmenting before spelling) | EYFS26.ELG.Writing-2; NC14.EnApp1.Y1 revision "segmenting spoken words into sounds" | NS | Required, tier A | H | hear "ship" → 3 |
| `spelling-digraph-build` | Builds words with sh, ch, th, ng, ai, ee, oa, oo from grapheme tiles | EYFS26.ELG.Writing-2; NC14.EnApp1.Y1 revision | AR | Optional, tier A | H | tiles sh, i, p, ch, o → "ship" |
| `spelling-double-letters` (5–6) | ff, ll, ss, zz, ck after a short vowel | NC14.EnApp1.Y1 "ff, ll, ss, zz and ck" | MC, AR | Optional | H | bell picture → bell from bel, bell, bal, ball |
| `spelling-adjacent-consonants-build` | Builds CVCC and CCVC words | NC14.EnApp1.Y1 revision "words with adjacent consonants" | AR | Optional, tier A | H | tiles f, r, o, g, l → "frog" |
| `spelling-tricky-set1` | Spells the, to, I, no, go, he, she, we, me, be | LS07 phases 3–4 (tricky words to spell); EYFS26.ELG.WordReading-3 | MC, AR | Required, tier A (no picture is possible) | H | hear "the" → the from the, thu, tha, teh |
| `spelling-alphabet-upper-lower` (5–6) | Matches capital and lower-case letters (also helps with keyboard keycaps) | NC14.En.Y1.Sp-2 (weaker link: letter knowledge) | MC, PS | Optional letter-name clip | H | "Which is the little letter for G?" → g from g, q, j, y |

Typed *word* answers are deliberately absent at age 5 (owner decision D-7): keycaps show capitals while early readers learn lower-case
letters, so tiles are kinder. Typed *numbers* are fine.

### C19.4 Age 6 — maths (14 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `maths-count-to100` | Says what comes next or before; fills a gap on a number track or hundred square | NC14.Ma.Y1.NPV-1, NPV-2 | NS, TY, AR | None | T `SEQUENCE_GAP` | 47, 48, ?, 50 → 49 |
| `maths-count-steps-2-5-10` | Continues counting in 2s, 5s and 10s | NC14.Ma.Y1.NPV-2 | TY, NS, MC | None | T `SKIP_COUNT` | 5, 10, 15, ? → 20 |
| `maths-compare-to100` | More than, less than, most, least; orders numbers | NC14.Ma.Y1.NPV-4 | MC, PS, AR | None | T `PICK_EXTREME`, `ORDER_NUMBERS` | "Which is the least?" 31, 13, 30, 23 → 13 |
| `maths-number-one-more-less-to100` | One more or one less than any number to 100 | NC14.Ma.Y1.NPV-3 | TY, NS | None | T `ONE_MORE_LESS` | "One less than 60?" → 59 |
| `maths-number-words-to20` | Matches numerals and number words 1–20 | NC14.Ma.Y1.NPV-5 | MC, TY | None | T `NUMBER_WORD` | "twelve" → 12 |
| `maths-bonds-to10` (5–6) | Recalls bonds to 10 as number sentences | NC14.Ma.Y1.AS-2 | NS, TY, MC | None | T `BOND_TO` | 6 + ? = 10 → 4 |
| `maths-bonds-to20` (6–7) | Bonds and related subtraction facts within 20 | NC14.Ma.Y1.AS-2 | NS, TY | None | T `BOND_TO` | 13 + ? = 20 → 7 |
| `maths-add-within20` | Adds one-digit and two-digit numbers to 20, including 0 | NC14.Ma.Y1.AS-1, AS-3 | TY, NS, MC | None | T `ADD_WITHIN` | 9 + 7 = ? → 16 |
| `maths-subtract-within20` | Subtracts within 20 | NC14.Ma.Y1.AS-1, AS-3 | TY, NS, MC | None | T `SUB_WITHIN` | 16 − 7 = ? → 9 |
| `maths-missing-number-within20` | Finds a missing number in any position | NC14.Ma.Y1.AS-4 | TY, NS | None | T `MISSING_NUMBER` | 7 = ? − 9 → 16 |
| `maths-double-halve-to20` | Doubles numbers to 10; halves even numbers to 20 | NC14.Ma.Y1.Notes (doubling); NC14.Ma.Y1.F-1 | NS, TY, OM | None | T `DOUBLE_HALVE` | "Half of 14" → 7 |
| `maths-multiply-groups-arrays` | Counts equal groups and simple arrays | NC14.Ma.Y1.MD-1 | NS, TY, PS | None | T `EQUAL_GROUPS` | 3 rockets with 2 astronauts each → 6 |
| `maths-pattern-repeating` (5–6) | Longer and two-attribute repeating patterns | NC14.Ma.Y1.Notes | PS, AR | None | T `PATTERN_NEXT`, some H | square, square, circle, square, square, ? → circle |
| `maths-shape-name-2d-3d` | Names rectangles, squares, circles, triangles, cuboids, cubes, pyramids, spheres; sorts flat from solid | NC14.Ma.Y1.G-1 | PS, MC, OM | None | H | sort six shapes into "flat" and "solid" |

### C19.5 Age 6 — phonics (9 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `phonics-gpc-consonant-digraphs` (5–6) | Consolidation of ch, sh, th, ng | NC14.En.Y1.WR-2 | MC | Required, tier B/C | H | as age 5 |
| `phonics-gpc-vowel-digraphs` (5–6) | Consolidation of the phase 3 vowel graphemes | NC14.En.Y1.WR-2 | MC | Required, tier B | H | hear /oa/ → oa from oa, ow, oo, ai |
| `phonics-blend-adjacent-consonants` (5–6) | CCVCC and CCCVC words | NC14.En.Y1.WR-3; LS07 phase 4 | MC, PS | Tier A | H | hear "stamp" → stamp from stamp, stomp, stump, tramp |
| `phonics-gpc-phase5-graphemes` | Chooses the word or grapheme for ay, ou, ie, ea, oy, ir, ue, aw, wh, ph, ew, oe, au | NC14.En.Y1.WR-2; LS07 phase 5 | MC, PS | Required, tier A or B | H | hear "cloud" → cloud from cloud, clown, could, cold |
| `phonics-gpc-split-digraphs` | a–e, e–e, i–e, o–e, u–e minimal pairs | NC14.EnApp1.Y1 rows a–e to u–e | MC | Required, tier A | H | hear "kite" → kite from kit, kite, cut, cute |
| `phonics-alt-pronunciation` (6–7) | Same grapheme, different sound: ow, ea, oo, ie | NC14.En.Y1.WR-2 | MC, OM | Tier A (key words) | H | "Which word has the same ow sound as snow?" → grow from grow, down, town, brown |
| `phonics-pseudo-words` (6–7) | "Alien names": hears a made-up word and chooses its spelling | NC14.En.Y1.WR-3; year 1 check format (S12) | MC, PS | Required; SSML phonemes | H | hear "chom" → chom from chom, shom, chon, chob |
| `phonics-endings-read` | Reads words with –s, –es, –ing, –ed, –er, –est; two-syllable words | NC14.En.Y1.WR-5, WR-6 | MC, NS | Tier A | H | hear "jumping" → jumping from jumped, jumping, jumper, jumps |
| `phonics-tricky-read-y1` | Year 1 common exception words | NC14.En.Y1.WR-4; NC14.EnApp1.Y1 common exception words | MC | Required, tier A | H | hear "said" → said from said, sad, side, says |

### C19.6 Age 6 — spelling (12 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `spelling-double-letters` (5–6) | ff, ll, ss, zz, ck | NC14.EnApp1.Y1 | MC, AR, TY | Optional | H | off, well, miss, buzz, back |
| `spelling-alphabet-upper-lower` (5–6) | Capital and lower-case pairs | NC14.En.Y1.Sp-2 | MC | Optional | H | as age 5 |
| `spelling-y1-nk-tch-ve` | /ŋ/ before k; –tch; /v/ at the end of words | NC14.EnApp1.Y1 rows | MC, AR, TY | Tier A or picture | H | hear "catch" → catch from cach, catch, katch, cotch |
| `spelling-y1-vowel-digraphs-1` | ai/ay/a–e, ee/ea/e–e, igh/ie/i–e, oa/ow/oe/o–e, oo/ue/ew/u–e | NC14.EnApp1.Y1 vowel digraph rows | AR, MC, TY | Tier A plus picture | H | tiles r, ai, n, ay, a → "rain" |
| `spelling-y1-vowel-digraphs-2` | ar, or/ore/aw/au, air/ear/are, er/ir/ur, ou/ow, oi/oy | NC14.EnApp1.Y1 vowel digraph rows | AR, MC, TY | Tier A plus picture | H | hear "bird" → bird from berd, bird, burd, bid |
| `spelling-y1-plurals-s-es` | Adds –s or –es | NC14.En.Y1.Sp-3a | MC, TY | None | H | "one fox, two …" → foxes from foxs, foxes, foxis, foxez |
| `spelling-y1-endings-ing-ed-er-est` | Adds endings with no change to the root | NC14.En.Y1.Sp-3c | TY, MC, AR | None | H | "jump + ed" → jumped |
| `spelling-y1-prefix-un` | Adds un– | NC14.En.Y1.Sp-3b | AR, TY | None | H | "un + lock" → unlock |
| `spelling-y1-compound-words` | Joins two words | NC14.EnApp1.Y1 compound words | AR | Optional | H | tiles foot, ball, bed, room with a football picture → "football" |
| `spelling-y1-y-ph-wh-k` | –y endings; ph and wh; k before e, i, y | NC14.EnApp1.Y1 rows | MC, TY | Tier A | H | hear "happy" → happy from happy, happi, hapy, happee |
| `spelling-y1-exception-words` (6–7) | Year 1 common exception words | NC14.En.Y1.Sp-1b | MC, TY, AR | Required, tier A | H | hear "said" → said from sed, said, siad, sayd |
| `spelling-y1-days-and-alphabet` | Orders and spells the days of the week; puts letters in alphabetical order | NC14.En.Y1.Sp-1c, Sp-2a | AR, MC, TY | Optional | H | order d, b, e, c → b, c, d, e |

### C19.7 Age 7 — maths (14 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `maths-count-steps-2-3-5-10` | Counts in 2s, 3s, 5s from 0 and in 10s from any number, forwards and backwards | NC14.Ma.Y2.NPV-1 | TY, NS, AR | None | T `SKIP_COUNT` | 37, 47, 57, ? → 67 |
| `maths-placevalue-tens-ones` | Tens and ones in a two-digit number; partitions | NC14.Ma.Y2.NPV-2 | MC, TY, NS | None | T `PLACE_VALUE` | "Which number has 4 tens and 7 ones?" → 47 |
| `maths-compare-symbols-to100` | Compares and orders to 100; uses <, > and = | NC14.Ma.Y2.NPV-4 | AR, MC, NS | None | T `ORDER_NUMBERS`, `COMPARE_FILL` | order 38, 83, 30, 80 → 30, 38, 80, 83 |
| `maths-number-words-to100` | Matches numerals and words to 100 | NC14.Ma.Y2.NPV-5 | MC, TY | None | T `NUMBER_WORD` | "sixty-four" → 64 |
| `maths-bonds-to20` (6–7) | Fluent recall of facts to 20 | NC14.Ma.Y2.AS-2 | NS, TY | None | T `BOND_TO` | 14 + ? = 20 → 6 |
| `maths-bonds-tens-to100` | Related facts to 100 with multiples of 10 | NC14.Ma.Y2.AS-2 | TY, NS, MC | None | T `BOND_TO` | 30 + ? = 100 → 70 |
| `maths-add-two-digit` | Two-digit plus ones, plus tens, plus two-digit; three one-digit numbers | NC14.Ma.Y2.AS-3 | TY, MC | None | T `ADD_WITHIN` | 34 + 20 = ? → 54 |
| `maths-subtract-two-digit` | Two-digit minus ones, tens, two-digit | NC14.Ma.Y2.AS-3 | TY, MC | None | T `SUB_WITHIN` | 58 − 6 = ? → 52 |
| `maths-missing-number-inverse-to100` | Uses the inverse to find a missing number | NC14.Ma.Y2.AS-5 | TY, NS | None | T `MISSING_NUMBER` | ? − 20 = 35 → 55 |
| `maths-times-tables-2-5-10` | Multiplication facts for 2, 5 and 10 | NC14.Ma.Y2.MD-1, MD-2 | TY, NS, MC | None | T `TIMES_TABLE` | 5 × 6 = ? → 30 |
| `maths-divide-2-5-10` | Division facts for 2, 5 and 10 | NC14.Ma.Y2.MD-1, MD-2 | TY, NS, MC | None | T `TIMES_TABLE` | 40 ÷ 5 = ? → 8 |
| `maths-odd-even-to100` | Recognises odd and even numbers | NC14.Ma.Y2.MD-1 | OM, MC | None | T `ODD_EVEN_SORT` | sort 7, 12, 15, 18, 21, 30 |
| `maths-pattern-sequences` | Shape patterns in different orientations; number sequences | NC14.Ma.Y2.PD-1 | PS, AR, TY | None | T `SKIP_COUNT`, some H | 3, 6, 9, ?, 15 → 12 |
| `maths-shape-properties` | Sides, vertices, edges, faces; vertical line symmetry; sorts shapes | NC14.Ma.Y2.G-1, G-2, G-4 | PS, NS, OM, MC | None | H | "How many vertices does a square-based pyramid have?" → 5 |

### C19.8 Age 7 — phonics (8 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `phonics-alt-pronunciation` (6–7) | Sorts words by the sound a shared grapheme makes | NC14.En.Y2.WR-2 | OM, MC | Tier A (key words) | H | sort sea, dream, meat / head, bread, instead by the sound of "ea" |
| `phonics-alt-spellings` | Finds words that share a sound spelt differently | NC14.En.Y2.Sp-1b; NC14.En.Y2.WR-2 | MC, OM | Tier A | H | "Which word has the same vowel sound as rain?" → play from play, plan, pull, pile |
| `phonics-gpc-y2-consonant-spellings` | dge/ge/g, soft c, kn/gn, wr | NC14.EnApp1.Y2 rows | MC | Tier A | H | hear "knee" → knee from knee, need, neat, knit |
| `phonics-gpc-y2-vowel-patterns` | a before l and ll, o as /ʌ/, –ey, a after w and qu, or and ar after w, –y as /aɪ/ | NC14.EnApp1.Y2 rows | MC, OM | Tier A | H | hear "walk" → walk from walk, work, woke, wake |
| `phonics-syllables-multi` | Two- and three-syllable words; counts the beats | NC14.En.Y2.WR-3 | MC, NS | Tier A | H | "How many beats in hospital?" → 3 |
| `phonics-suffix-words-read` | Words with –ment, –ness, –ful, –less, –ly, –tion | NC14.En.Y2.WR-4 | MC | Tier A | H | hear "careful" → careful from careful, careless, carefully, cared |
| `phonics-tricky-read-y2` | Year 2 common exception words | NC14.En.Y2.WR-5; NC14.EnApp1.Y2 | MC | Required, tier A | H | hear "because" → because from because, became, before, behind |
| `phonics-pseudo-words` (6–7) | Harder alien names (phase 5 graphemes, adjacent consonants) | NC14.En.Y2.WR-1 | MC, PS | Required; SSML phonemes | H | hear "jound" → jound from jound, jond, joond, jund |

### C19.9 Age 7 — spelling (12 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `spelling-y1-exception-words` (6–7) | Consolidation of year 1 exception words | NC14.En.Y1.Sp-1b | TY, MC | Required, tier A | H | hear "friend" → type friend |
| `spelling-y2-dge-ge-j` | /dʒ/ spelt dge, ge, g, j | NC14.EnApp1.Y2 | MC, TY | Tier A | H | hear "bridge" → bridge from brige, bridge, bridj, brigde |
| `spelling-y2-soft-c-kn-gn-wr` | /s/ spelt c; kn, gn; wr | NC14.EnApp1.Y2 | MC, TY, AR | Tier A | H | hear "wrong" → wrong from rong, wrong, wong, wronge |
| `spelling-y2-le-el-al-il` | Endings –le, –el, –al, –il | NC14.EnApp1.Y2 | MC, TY | Tier A | H | hear "camel" → camel from camle, camel, camal, camil |
| `spelling-y2-y-endings` | –y as /aɪ/; y to i before –es, –ed, –er, –est; –ey | NC14.EnApp1.Y2 | MC, TY | None, or tier A | H | "one baby, two …" → babies from babys, babies, babyes, babbies |
| `spelling-y2-suffix-rules` | Drops the e; doubles the consonant | NC14.EnApp1.Y2 | TY, MC | None | H | "hop + ing" → hopping |
| `spelling-y2-vowel-oddities` | a before l and ll; o as /ʌ/; a after w and qu; or and ar after w; s as /ʒ/ | NC14.EnApp1.Y2 | MC, TY | Tier A | H | hear "walk" → walk from wolk, walk, wawk, warlk |
| `spelling-y2-suffixes` | –ment, –ness, –ful, –less, –ly | NC14.En.Y2.Sp-2 | MC, TY, AR | None | H | "care + ful" → careful from careful, carefull, carful, carefel |
| `spelling-y2-contractions` | can't, didn't, hasn't, couldn't, it's, I'll | NC14.En.Y2.Sp-1d | MC, TY, AR | None | H | "did not" → didn't from didnt, did'nt, didn't, din't |
| `spelling-y2-tion` | Words ending –tion | NC14.EnApp1.Y2 | MC, TY | Tier A | H | hear "station" → station from stashun, station, stasion, staytion |
| `spelling-y2-homophones` | Chooses the right word or picture for a homophone | NC14.En.Y2.Sp-1f; NC14.EnApp1.Y2 homophones | PS, MC | None — audio cannot tell homophones apart | H | read "knight" → the picture of the knight, not the night sky |
| `spelling-y2-exception-words` | Year 2 common exception words | NC14.En.Y2.Sp-1c | MC, TY | Required, tier A | H | hear "because" → because from becos, because, becuase, becaus |

### C19.10 Coverage against the spec's subject list (prompt.md:477-483)

| Spec requirement (prompt.md:477-483) | Where it is covered |
|---|---|
| Maths: counting | `maths-count-*` at every age |
| Maths: comparing numbers | `maths-compare-*` at every age |
| Maths: addition, subtraction | `maths-add-*`, `maths-subtract-*`, `maths-missing-number-*` |
| Maths: shapes | `maths-shape-name-2d` (5), `.name-2d-3d` (6), `.properties` (7) |
| Maths: patterns | `maths-pattern-repeating` (5, 6), `.sequences` (7) |
| Maths: number bonds | `maths-bonds-to5`, `.to10`, `.to20`, `.tens-to100` |
| Maths: age-appropriate times tables | counting in 2s, 5s, 10s (6); `maths-times-tables-2-5-10` and `maths-divide-2-5-10` (7). None at 5, by design |
| Phonics: grapheme/sound | `phonics-gpc-*`, `phonics-alt-*` |
| Phonics: blending | `phonics-blend-*`, `phonics-pseudo-words`, `phonics-endings-read`, `phonics-syllables-multi` |
| Spelling: arranging letters | every AR row in the spelling tables |
| Spelling: completing words | `spelling-cvc-missing-letter`, MC "which is spelt correctly" rows |
| Spelling: typing words | TY rows at ages 6 and 7 |

Fractions, measurement, money, time and statistics are statutory at key stage 1 but not in the spec's subject list; they are left out of
version one and listed as later candidates. Accent: no sound-discrimination item may depend on the bath/trap split or on u-in-but versus
oo-in-foot, because a single southern-British synthetic voice (the default is Amazon Polly's en-GB voice Amy, **[CONFIRMED by owner,
2026-11-14]**) would mark some children's home accent as wrong. **[PROPOSAL]**

### Years 3 to 5 (YG2, owner 2026-11-28)

The owner asked for Year 2 and Year 4, with a Hard mode that plays the year above
([ADR-0056](../decisions/0056-school-years-and-hard-mode.md)). A band is a school year: band = year + 5, so the tables above
(ages 5, 6, 7) are Reception, Year 1 and Year 2, and these are Year 3 (band 8), Year 4 (band 9) and Year 5 (band 10). Phonics
stops at Year 2; from Year 3 the third subject is **grammar and punctuation** (English Appendix 2), and the rotation for bands 8
and above is maths, grammar, spelling **[CONFIRMED by owner 2026-11-28]**. Spelling follows English Appendix 1, which gives
Years 3–4 and Years 5–6 one list each, so those topics are marked (8–9) and (10–11).

Codes: `NC14.Ma.Y3.NPV-1` is the National Curriculum 2014, maths, Year 3, number and place value, statement 1 (NPV, AS addition
and subtraction, MD multiplication and division, F fractions, decimals and percentages, M measurement, G properties of shape, PD
position and direction, S statistics), numbered in the order the programme of study lists them. English rows quote the Appendix
heading. **[UNVERIFIED: the statement numbers and quotations are from memory of the DfE programmes of study (2013, updated
2015); check them against the published documents at the YG2 review.]** Source: D = drafted with AI in the admin (YG3) and
reviewed by the owner; T = an existing generator where one fits. Audio is None for these rows: a spelling question shows the
word's meaning or a picture, or asks which spelling is right, rather than relying on a clip.

### C19.11 Band 8 (Year 3) — maths (16 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `maths-count-multiples-4-8-50-100` | Counts in 4s, 8s, 50s and 100s; finds 10 or 100 more or less | NC14.Ma.Y3.NPV-1 | TY, NS, AR | None | T `SKIP_COUNT`, D | 350, 400, 450, ? → 500 |
| `maths-placevalue-hundreds` | Hundreds, tens and ones in a three-digit number | NC14.Ma.Y3.NPV-2 | MC, TY | None | T `PLACE_VALUE`, D | "What is the 6 worth in 362?" → 60 |
| `maths-compare-order-to1000` | Compares and orders numbers to 1000 | NC14.Ma.Y3.NPV-3 | AR, MC | None | T `ORDER_NUMBERS`, D | order 509, 590, 95, 950 |
| `maths-number-words-to1000` | Matches numerals and words to 1000 | NC14.Ma.Y3.NPV-5 | MC, TY | None | D | "four hundred and seven" → 407 |
| `maths-add-sub-mental-3digit` | Adds or subtracts ones, tens or hundreds to a three-digit number in the head | NC14.Ma.Y3.AS-1 | TY, MC | None | T `ADD_WITHIN`, `SUB_WITHIN`, D | 546 + 300 → 846 |
| `maths-add-sub-written-3digit` | Adds and subtracts two three-digit numbers | NC14.Ma.Y3.AS-2 | TY | None | D | 368 + 257 → 625 |
| `maths-estimate-inverse-check` | Estimates an answer and checks it with the inverse | NC14.Ma.Y3.AS-3, AS-4 | MC, TY | None | D | "412 − 199 is about…" → 200 |
| `maths-times-tables-3-4-8` | Multiplication and division facts for the 3, 4 and 8 times tables | NC14.Ma.Y3.MD-1 | TY, NS, MC | None | T `TIMES_TABLE` | 8 × 7 → 56 |
| `maths-multiply-2digit-by-1digit` | Two-digit times one-digit, using known tables | NC14.Ma.Y3.MD-2 | TY, MC | None | D | 23 × 4 → 92 |
| `maths-fractions-of-amounts` | Finds unit and simple non-unit fractions of a set of objects | NC14.Ma.Y3.F-2 | TY, OM, MC | None | D | ¼ of 12 stars → 3 |
| `maths-fractions-equivalent-compare` | Equivalent fractions with small denominators; compares and orders fractions | NC14.Ma.Y3.F-4, F-6 | MC, AR | None | D | "Which is bigger, ⅓ or ⅕?" |
| `maths-fractions-add-sub-same-denom` | Adds and subtracts fractions with the same denominator within one whole | NC14.Ma.Y3.F-5 | MC, TY | None | D | ²⁄₇ + ³⁄₇ → ⁵⁄₇ |
| `maths-time-analogue-roman` | Tells the time to the nearest minute, including Roman numeral clocks | NC14.Ma.Y3.M-4, M-5 | MC, TY | None | D | a clock face at 7:38 |
| `maths-money-change` | Adds amounts of money and gives change | NC14.Ma.Y3.M-3 | TY, MC | None | D | £1 for a 65p rocket → 35p change |
| `maths-angles-right-lines` | Right angles, angles bigger or smaller than a right angle; parallel and perpendicular lines | NC14.Ma.Y3.G-3, G-4, G-5 | MC, PS | None | D | "Which angle is smaller than a right angle?" |
| `maths-bar-charts-pictograms` | Reads scaled bar charts, pictograms and tables to answer one- and two-step questions | NC14.Ma.Y3.S-1, S-2 | MC, TY | None | D | a pictogram where each star is 2 aliens |

### C19.12 Band 8 (Year 3) — grammar (9 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `grammar-word-classes` (8–9) | Finds the noun, verb, adjective or adverb in a sentence | NC14.En.App2.Y3 terminology; NC14.En.App2.Y2 terminology | MC, PS | None | D | "The robot zoomed quickly." Which word is the adverb? |
| `grammar-a-or-an` | Chooses a or an by the next word's first sound | NC14.En.App2.Y3 "Word: a or an" | MC | None | D | "___ alien" → an |
| `grammar-prefixes-super-anti-auto` | Makes and reads nouns with super-, anti- and auto- | NC14.En.App2.Y3 "Word: prefixes" | MC, TY | None | D | "super + market" → supermarket |
| `grammar-word-families` | Groups words that share a root, like solve, solution, dissolve | NC14.En.App2.Y3 "Word: word families" | OM, MC | None | D | which word is not in the family of "help"? |
| `grammar-conjunctions-time-cause` | Joins clauses with when, before, after, while, so, because | NC14.En.App2.Y3 "Sentence: conjunctions" | MC | None | D | "We hid ___ the meteor hit." → when |
| `grammar-adverbs-prepositions-time` | Shows time, place and cause with adverbs and prepositions (then, soon, during, because of) | NC14.En.App2.Y3 "Sentence: adverbs and prepositions" | MC | None | D | "We waited ___ the storm." → during |
| `grammar-present-perfect` | Uses the present perfect (has landed) as well as the simple past (landed) | NC14.En.App2.Y3 "Text: present perfect" | MC | None | D | "She ___ her helmet." → has lost |
| `grammar-inverted-commas` | Puts inverted commas round the words someone says | NC14.En.App2.Y3 "Punctuation: inverted commas" | MC, AR | None | D | which sentence punctuates the speech correctly? |
| `grammar-sentence-punctuation` | Capital letters, full stops, question marks and exclamation marks; commas in a list | NC14.En.App2.Y2 punctuation | MC, PS | None | D | "where is the rocket" → needs a question mark |

### C19.13 Band 8 (Year 3) — spelling (12 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `spelling-suffixes-doubling` (8–9) | Adds -ing, -er, -en, -ed to longer words, doubling where the last syllable is stressed | NC14.En.App1.Y3-4 "adding suffixes beginning with vowel letters to words of more than one syllable" | MC, TY, AR | None | D | begin + ing → beginning |
| `spelling-y-and-ou-sounds` (8–9) | The /ɪ/ sound spelt y (gym, myth) and the /ʌ/ sound spelt ou (young, touch) | NC14.En.App1.Y3-4 "the /ɪ/ sound spelt y"; "the /ʌ/ sound spelt ou" | MC, AR | None | D | "Which is right: jym or gym?" |
| `spelling-prefixes-dis-mis-in-re` (8–9) | Adds dis-, mis-, in-, il-, im-, ir-, re-, sub-, inter-, super-, anti-, auto- | NC14.En.App1.Y3-4 "more prefixes" | MC, TY | None | D | the opposite of "possible" → impossible |
| `spelling-suffixes-ation-ly` (8–9) | Adds -ation and -ly (including -ally) | NC14.En.App1.Y3-4 "the suffix -ation"; "the suffix -ly" | MC, TY | None | D | inform → information |
| `spelling-endings-sure-ture` (8–9) | Words ending in -sure and -ture | NC14.En.App1.Y3-4 "words with endings sounding like /ʒə/ or /tʃə/" | MC, AR | None | D | "pic___" → picture |
| `spelling-endings-tion-sion-ssion-cian` (8–9) | Endings that sound like "shun": -tion, -sion, -ssion, -cian | NC14.En.App1.Y3-4 "endings which sound like /ʒən/"; "endings which sound like /ʃən/" | MC | None | D | music → musician |
| `spelling-suffix-ous` (8–9) | Adds -ous (poisonous, famous, various) | NC14.En.App1.Y3-4 "the suffix -ous" | MC, TY | None | D | "fame" → famous |
| `spelling-ch-for-k-and-sh` (8–9) | ch for the /k/ sound (school, chorus) and the /ʃ/ sound (chef, machine) | NC14.En.App1.Y3-4 "the /k/ sound spelt ch"; "the /ʃ/ sound spelt ch" | MC | None | D | "Which is right: skeme or scheme?" |
| `spelling-gue-que-sc` (8–9) | -gue and -que endings; the /s/ sound spelt sc | NC14.En.App1.Y3-4 "-gue and -que"; "the /s/ sound spelt sc" | MC, AR | None | D | tongue, antique, science |
| `spelling-ei-eigh-ey` (8–9) | The /eɪ/ sound spelt ei, eigh or ey | NC14.En.App1.Y3-4 "the /eɪ/ sound spelt ei, eigh, or ey" | MC | None | D | eight, vein, obey |
| `spelling-homophones-y3-4` (8–9) | Chooses between homophones and near-homophones (accept/except, whether/weather) | NC14.En.App1.Y3-4 "homophones and near-homophones" | MC | None | D | "I don't know ___ it will rain." → whether |
| `spelling-word-list-y3-4` (8–9) | Spells words from the Year 3 and 4 word list | NC14.En.App1.Y3-4 word list | MC, AR, TY | None | D | "Which is right: calender or calendar?" |

### C19.14 Band 9 (Year 4) — maths (17 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `maths-count-6-7-9-25-1000` | Counts in 6s, 7s, 9s, 25s and 1000s; finds 1000 more or less | NC14.Ma.Y4.NPV-1, NPV-2 | TY, NS, AR | None | T `SKIP_COUNT`, D | 63, 72, 81, ? → 90 |
| `maths-negative-numbers-count` | Counts back through zero into negative numbers | NC14.Ma.Y4.NPV-3 | NS, TY | None | D | 3 less than 1 → −2 |
| `maths-placevalue-four-digit` | The value of each digit in a four-digit number | NC14.Ma.Y4.NPV-4 | MC, TY | None | T `PLACE_VALUE`, D | the 7 in 7,245 is worth → 7000 |
| `maths-round-10-100-1000` | Rounds any number to the nearest 10, 100 or 1000 | NC14.Ma.Y4.NPV-7 | MC, TY | None | D | 4,682 to the nearest 100 → 4,700 |
| `maths-roman-numerals-to100` | Reads Roman numerals to 100 | NC14.Ma.Y4.NPV-9 | MC, TY | None | D | XLVII → 47 |
| `maths-add-sub-4digit` | Adds and subtracts numbers with up to four digits | NC14.Ma.Y4.AS-1, AS-2 | TY, MC | None | D | 3,456 + 1,278 → 4,734 |
| `maths-times-tables-to12` | All multiplication and division facts up to 12 × 12 | NC14.Ma.Y4.MD-1 | TY, NS, MC | None | T `TIMES_TABLE` | 7 × 9 → 63 |
| `maths-multiply-mental-facts` | Multiplies by 0 and 1, multiplies three numbers, uses factor pairs | NC14.Ma.Y4.MD-2, MD-3 | TY, MC | None | D | 2 × 6 × 5 → 60 |
| `maths-multiply-3digit-by-1digit` | Three-digit times one-digit, written out | NC14.Ma.Y4.MD-4 | TY | None | D | 243 × 6 → 1,458 |
| `maths-fractions-equivalent-families` | Families of equivalent fractions | NC14.Ma.Y4.F-1 | MC, OM | None | D | which is not equal to ½: 2⁄4, 3⁄6, 4⁄6? |
| `maths-decimals-tenths-hundredths` | Tenths and hundredths as decimals; ¼, ½, ¾ as decimals | NC14.Ma.Y4.F-2, F-5, F-6 | MC, TY | None | D | ¾ → 0.75 |
| `maths-divide-by-10-100` | Divides a one- or two-digit number by 10 or 100 | NC14.Ma.Y4.F-7 | TY, MC | None | D | 37 ÷ 100 → 0.37 |
| `maths-area-perimeter-rectilinear` | Perimeter of rectilinear shapes; area by counting squares | NC14.Ma.Y4.M-2, M-3 | TY, MC | None | D | a 6 by 4 rectangle: perimeter → 20 cm |
| `maths-time-12-24-hour` | Converts between analogue, 12-hour and 24-hour times | NC14.Ma.Y4.M-5, M-6 | MC, TY | None | D | 7:15 pm → 19:15 |
| `maths-angles-acute-obtuse` | Acute and obtuse angles; sorts triangles and quadrilaterals | NC14.Ma.Y4.G-1, G-2 | MC, PS, OM | None | D | "Which angle is obtuse?" |
| `maths-symmetry-lines` | Lines of symmetry; completes a symmetric figure | NC14.Ma.Y4.G-3, G-4 | MC, PS | None | D | how many lines of symmetry has a square? → 4 |
| `maths-coordinates-first-quadrant` | Reads and plots coordinates; describes a translation | NC14.Ma.Y4.PD-1, PD-2, PD-3 | MC, TY | None | D | the alien is at (3, 5); move 2 right → (5, 5) |

### C19.15 Band 9 (Year 4) — grammar (8 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `grammar-plural-or-possessive-s` | Tells a plural -s from a possessive -s | NC14.En.App2.Y4 "Word: plural and possessive -s" | MC | None | D | "the robot's arm" or "the robots arm"? |
| `grammar-standard-english-verbs` | Uses standard English verb forms (we were, I did) | NC14.En.App2.Y4 "Word: standard English forms for verb inflections" | MC | None | D | "We ___ late." → were |
| `grammar-expanded-noun-phrases` | Builds noun phrases with adjectives, nouns and preposition phrases | NC14.En.App2.Y4 "Sentence: expanded noun phrases" | MC, AR | None | D | "the alien" → "the tall alien with green spots" |
| `grammar-fronted-adverbials` | Starts a sentence with an adverbial and puts a comma after it | NC14.En.App2.Y4 "Sentence: fronted adverbials"; "Punctuation: commas after fronted adverbials" | MC | None | D | "Later that day, we landed." Where does the comma go? |
| `grammar-pronouns-for-cohesion` | Chooses a pronoun or a noun so a passage is clear and not repetitive | NC14.En.App2.Y4 "Text: pronouns and nouns for cohesion" | MC | None | D | "Pip saw Nova. ___ waved." → She |
| `grammar-speech-punctuation` | Punctuates direct speech: inverted commas, commas, capital letters | NC14.En.App2.Y4 "Punctuation: direct speech" | MC, AR | None | D | "Come here, said Max." → "Come here," said Max. |
| `grammar-apostrophes-plural-possession` | Puts the apostrophe after the s for plural possession | NC14.En.App2.Y4 "Punctuation: apostrophes to mark plural possession" | MC | None | D | the aliens' ship (more than one alien) |
| `grammar-determiners-pronouns` | Determiners, pronouns and possessive pronouns | NC14.En.App2.Y4 terminology | MC, PS | None | D | "That helmet is ___." → mine |

### C19.16 Band 9 (Year 4) — spelling (1 topic)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `spelling-possessive-apostrophe-plurals` | Places the possessive apostrophe in regular and irregular plurals (girls', children's) | NC14.En.App1.Y3-4 "possessive apostrophe with plural words" | MC | None | D | the children's rockets |

### C19.17 Band 10 (Year 5) — maths (18 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `maths-placevalue-to-million` | Reads, writes and compares numbers to 1,000,000 | NC14.Ma.Y5.NPV-1 | MC, TY, AR | None | D | the 4 in 945,210 is worth → 40,000 |
| `maths-steps-powers-of-10` | Counts forwards and back in 10s, 100s, 1000s, 10,000s and 100,000s | NC14.Ma.Y5.NPV-2 | TY, NS | None | D | 245,000 + 10,000 → 255,000 |
| `maths-negative-numbers-context` | Negative numbers in context, such as temperatures | NC14.Ma.Y5.NPV-3 | NS, TY, MC | None | D | −4 °C warms by 7 degrees → 3 °C |
| `maths-round-to-100000` | Rounds to the nearest 10, 100, 1000, 10,000 or 100,000 | NC14.Ma.Y5.NPV-4 | MC, TY | None | D | 348,612 to the nearest 10,000 → 350,000 |
| `maths-roman-numerals-to1000` | Reads Roman numerals to 1000 and years | NC14.Ma.Y5.NPV-6 | MC, TY | None | D | MCMXC → 1990 |
| `maths-add-sub-large-numbers` | Adds and subtracts numbers with more than four digits | NC14.Ma.Y5.AS-1, AS-2 | TY, MC | None | D | 45,320 − 12,815 → 32,505 |
| `maths-factors-multiples` | Factors, factor pairs, common factors and multiples | NC14.Ma.Y5.MD-1 | MC, OM, TY | None | D | "Which is a factor of 36: 7, 8 or 9?" |
| `maths-prime-numbers` | Prime and composite numbers; primes to 19 | NC14.Ma.Y5.MD-2, MD-3 | MC, OM | None | D | sort 11, 15, 17, 21 into prime and not prime |
| `maths-square-cube-numbers` | Square and cube numbers and their notation | NC14.Ma.Y5.MD-8 | TY, MC | None | D | 4³ → 64 |
| `maths-multiply-divide-10-100-1000` | Multiplies and divides whole numbers and decimals by 10, 100 and 1000 | NC14.Ma.Y5.MD-7 | TY, MC | None | D | 3.6 × 100 → 360 |
| `maths-long-multiplication` | Multiplies up to four digits by one or two digits | NC14.Ma.Y5.MD-4 | TY | None | D | 34 × 26 → 884 |
| `maths-short-division-remainders` | Short division with remainders | NC14.Ma.Y5.MD-6 | TY, MC | None | D | 437 ÷ 6 → 72 r 5 |
| `maths-fractions-mixed-improper` | Converts between mixed numbers and improper fractions | NC14.Ma.Y5.F-3 | MC, TY | None | D | 2⅓ → ⁷⁄₃ |
| `maths-fractions-add-sub-related` | Adds and subtracts fractions with related denominators | NC14.Ma.Y5.F-4 | MC, TY | None | D | ½ + ⅜ → ⅞ |
| `maths-decimals-thousandths-round` | Thousandths; rounds decimals; orders numbers with three decimal places | NC14.Ma.Y5.F-7, F-8, F-9 | MC, AR, TY | None | D | 3.46 to one decimal place → 3.5 |
| `maths-percentages` | Per cent as parts per hundred; equivalents of ½, ¼, ⅕, ⅖, ⅘ | NC14.Ma.Y5.F-11, F-12 | MC, TY | None | D | ¼ → 25% |
| `maths-area-rectangles` | Area of rectangles in cm² and m²; perimeter of composite shapes | NC14.Ma.Y5.M-3, M-4 | TY, MC | None | D | 7 m by 5 m → 35 m² |
| `maths-angles-degrees-turns` | Acute, obtuse and reflex angles; angles on a line and round a point | NC14.Ma.Y5.G-2, G-4 | MC, TY | None | D | angles on a straight line: 110° and ? → 70° |

### C19.18 Band 10 (Year 5) — grammar (7 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `grammar-suffixes-ate-ise-ify` | Turns nouns and adjectives into verbs with -ate, -ise, -ify | NC14.En.App2.Y5 "Word: converting nouns or adjectives into verbs" | MC, TY | None | D | "pure" → purify |
| `grammar-verb-prefixes` | Changes a verb's meaning with dis-, de-, mis-, over-, re- | NC14.En.App2.Y5 "Word: verb prefixes" | MC, TY | None | D | "to do it again" → redo |
| `grammar-relative-clauses` | Relative clauses with who, which, where, when, whose, that | NC14.En.App2.Y5 "Sentence: relative clauses" | MC | None | D | "The robot ___ fixed the ship is Max." → who |
| `grammar-modal-verbs-possibility` | Shows how likely something is with modal verbs and adverbs (might, must, perhaps, surely) | NC14.En.App2.Y5 "Sentence: degrees of possibility" | MC | None | D | which word makes it least certain? |
| `grammar-cohesion-adverbials` | Links ideas with adverbials of time, place and number (later, nearby, secondly) | NC14.En.App2.Y5 "Text: cohesion within a paragraph"; "linking ideas across paragraphs" | MC | None | D | "___, we packed. Secondly, we launched." → Firstly |
| `grammar-parenthesis` | Brackets, dashes or commas for parenthesis | NC14.En.App2.Y5 "Punctuation: brackets, dashes or commas to indicate parenthesis" | MC | None | D | "Nova (the bravest astronaut) led the way." |
| `grammar-commas-for-meaning` | Uses commas to make the meaning clear | NC14.En.App2.Y5 "Punctuation: commas to clarify meaning" | MC | None | D | "Let's eat, Grandma!" |

### C19.19 Band 10 (Year 5) — spelling (10 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `spelling-cious-tious-cial-tial` (10–11) | Endings -cious, -tious, -cial and -tial | NC14.En.App1.Y5-6 "endings which sound like /ʃəs/"; "endings which sound like /ʃəl/" | MC | None | D | vicious, ambitious, official, partial |
| `spelling-ant-ance-ent-ence` (10–11) | Endings -ant, -ance, -ancy, -ent, -ence, -ency | NC14.En.App1.Y5-6 "words ending in -ant, -ance/-ancy, -ent, -ence/-ency" | MC | None | D | "Which is right: independant or independent?" |
| `spelling-able-ible-ably-ibly` (10–11) | Endings -able, -ible, -ably, -ibly | NC14.En.App1.Y5-6 "words ending in -able and -ible" | MC, TY | None | D | "Which is right: sensable or sensible?" |
| `spelling-suffixes-after-fer` (10–11) | Adds suffixes to words ending in -fer (referring, reference) | NC14.En.App1.Y5-6 "adding suffixes beginning with vowel letters to words ending in -fer" | MC | None | D | prefer + ed → preferred |
| `spelling-hyphens` (10–11) | Hyphens joining a prefix to a word starting with a vowel (co-ordinate, re-enter) | NC14.En.App1.Y5-6 "use of the hyphen" | MC | None | D | re + enter → re-enter |
| `spelling-ei-after-c` (10–11) | ee sound spelt ei after c, and the words that break the rule | NC14.En.App1.Y5-6 "words with the /i:/ sound spelt ei after c" | MC | None | D | receive, ceiling |
| `spelling-ough-words` (10–11) | The many sounds of ough | NC14.En.App1.Y5-6 "words containing the letter-string ough" | MC, AR | None | D | though, through, cough, rough |
| `spelling-silent-letters` (10–11) | Words with silent letters (doubt, island, knight) | NC14.En.App1.Y5-6 "words with silent letters" | MC, AR | None | D | "Which is right: nite or knight?" |
| `spelling-homophones-y5-6` (10–11) | Homophones and words often confused (advice/advise, stationary/stationery) | NC14.En.App1.Y5-6 "homophones and other words that are often confused" | MC | None | D | "Can you give me some ___?" → advice |
| `spelling-word-list-y5-6` (10–11) | Spells words from the Year 5 and 6 word list | NC14.En.App1.Y5-6 word list | MC, AR, TY | None | D | "Which is right: neccessary or necessary?" |

---

## C20. The six interaction types (data definitions)

The six types are **[CONFIRMED]** (prompt.md:485-497), as are keyboard equivalents and per-type normalisation (prompt.md:499). This section
defines each type **as data**: payload, answer specification, the canonical answer the client sends, when the answer is complete, and
publish-time validation. How each type looks and is operated by mouse and keyboard is owned by [D](D-ux-and-content-operations.md) (D6);
the grammar is the same for all six — select (or place, or type), then press Check. Enum values: `PICTURE_SELECT`, `NUMBER_SELECT`,
`OBJECT_MOVE`, `ARRANGE`, `MULTIPLE_CHOICE`, `TYPED`. **[PROPOSAL]**

### C20.1 Canonical answers: one normaliser, exact equality

Spine S7.2: answers are canonicalised **once, in TypeScript**, by a shared package used by the player and admin apps. A *canonical answer*
is one fixed string form of an answer, so that "is this right?" becomes "is this string in the accepted list?". Published versions store
accepted answers already in canonical form; the browser (offline) and the server (authoritative) both compare by exact string equality;
Python validates only the shape (length ≤ 64, allowed characters). There is no second normaliser that could disagree. An answer that cannot
be canonicalised (empty, wrong characters) never becomes an op; if a malformed one reaches the server it is `REJECTED VALIDATION_FAILED`
(a client bug; [spine S9.1](00-spine.md#s91-error-table-source--http--client-action) error table). **[PROPOSAL]**

The normalisation rules deliberately avoid language built-ins (`Number()`, `trim()`, Unicode case folding) that behave differently across
engines, and are expressed as a short list of named primitive steps. One shared vectors file (in `contracts/` (to create), per spine S10) will be run by Vitest
and pytest so the TS canonicaliser and the Python shape check agree, and so template generators (Python) are proven to emit
already-canonical answers. Separators `;`, `=`, `,` and `|` are reserved and may not appear in option IDs, tile values or zone/bin/object IDs;
publish validation refuses them (C22.2).

The canonical answer is **one string of at most 64 characters for every interaction type** (spine S3.3, S9.5): ARRANGE uses tile
*values*, and a two-step activity's answer is the two step answers joined by `|` (C20.3). There is no "array of option IDs" form.
**[PROPOSAL]**

| Type (mode) | Payload (authored) | `answerSpecification` (stored, canonical) | Canonical answer sent in `SUBMIT_ATTEMPT` | Complete when | Correct when |
|---|---|---|---|---|---|
| `PICTURE_SELECT` | `options[]` 4–6 of `{id a–f, assetId, alt, caption?}`; `layout`; optional `stimulus` | `{accepted: ["b"]}` (exactly one) | the option ID, e.g. `"b"` | one option selected | equal to the accepted ID |
| `NUMBER_SELECT` | `numberSet` `{kind: RANGE, min, max, step}` or `{kind: LIST, values[]}`; `display` `TRACK` (≤21) or `GRID` (hundred square); `stimulus` | `{accepted: ["8"]}` | decimal integer, no sign, no leading zeros: `"8"` | one number selected | equal |
| `OBJECT_MOVE` (`DISTRIBUTE`) | `objectAssetId`, `objectAlt`, `sourceCount` 2–12, `zones[]` 1–3 `{id, label, assetId?}`, `requireAllPlaced` | `{accepted: ["z1=3;z2=3"]}` | zone counts sorted by zone ID, `id=n` joined by `;` | ≥1 placed (all when `requireAllPlaced`) | equal |
| `OBJECT_MOVE` (`SORT`) | `objects[]` 4–8 `{id, text or assetId, alt}`; `bins[]` 2–3 `{id, label}` | `{accepted: ["o1=ee;o2=e;…"]}` | object→bin pairs sorted by object ID | every object in a bin | equal |
| `ARRANGE` (`LETTERS`) | `tiles[]` `{id, value, text or assetId, alt?}`; `slots`; mandatory `cue` | `{accepted: ["cat"]}` | the **values** of the placed tiles, in order, concatenated — so the two "o" tiles in "moon" are interchangeable and `sh`+`i`+`p` equals `s`+`h`+`i`+`p` | every slot filled | in the accepted list |
| `ARRANGE` (`SEQUENCE`) | 3–6 `tiles[]`, `orderLabel` ("smallest first") | `{accepted: ["30,38,80,83"]}` | tile values in order joined by `,` | every slot filled | in the accepted list ("meaningful order", prompt.md:499) |
| `MULTIPLE_CHOICE` | `options[]` 4–6 `{id a–f, text}`; `optionStyle` `TEXT`/`GRAPHEME`/`WORD`/`NUMERAL`; optional `stimulus` | `{accepted: ["c"]}` (exactly one) | the option ID | one option selected | equal |
| `TYPED` (`NUMERIC`) | `stimulus`, `maxLength` 1–3; on-screen digit keypad | `{accepted: ["8"]}` (integer 0–999) | remove whitespace (explicit set: space, tab, CR, LF, no-break space); must match `^[0-9]{1,3}$`; strip leading zeros (`"08"` → `"8"`); number words not accepted in v1 | ≥1 digit | equal ("equivalent numeric representations", prompt.md:499) |
| `TYPED` (`WORD`) | mandatory `cue` (picture, clip or rule text such as "hop + ing"); `maxLength` 2–12; on-screen a–z + apostrophe keypad | `{accepted: ["hopping"], caseSensitive: false}` | trim the same whitespace set; collapse internal runs to one space; curly apostrophes U+2018/U+2019/U+02BC → `'`; hyphens U+2010–U+2014 → `-`; lower-case by explicit A–Z → a–z mapping unless `caseSensitive`; must match `^[a-z' -]{1,maxLength}$`. Internal spaces kept: "foot ball" ≠ "football" | ≥1 letter | in the accepted list ("whitespace/case for spelling", prompt.md:499) |
| Two-step (any primary + one `additionalSteps[]`) | each step has its own type, payload and spec | `{accepted: ["c\|30"]}` (per-step canonical joined by `\|`) | per-step canonical answers joined by `\|` | every step complete | in the accepted list (all steps right) |

Publish-time validation per type **[PROPOSAL]**:

| Type | Rules (in addition to C22.2) |
|---|---|
| `PICTURE_SELECT` | 4–6 options, IDs unique from `a`–`f`; every `assetId` exists in the asset manifest, is distinct and flagged text-free (prompt.md:1090); `alt` 1–60 characters and unique; exactly one correct; captions only where they do not give the answer away |
| `NUMBER_SELECT` | set size 5–101; integers 0–100; the answer is in the set; a `RANGE` divides evenly by its step |
| `OBJECT_MOVE` | `DISTRIBUTE`: single zone target between 1 and `sourceCount − 2` (so "move everything" is never right by accident); sharing counts consistent with the question. `SORT`: every bin receives ≥1 object; reviewer confirms no object could belong in two bins |
| `ARRANGE` | `LETTERS`: values lower-case letters or apostrophe, 1–4 characters; 2–8 slots; between `slots` and `slots + 3` tiles; every accepted word buildable with exactly `slots` tiles; cue mandatory; the stored shuffle must not already spell the answer. `SEQUENCE`: 3–6 tiles, all placed, values distinct, one accepted order unless the reviewer records why |
| `MULTIPLE_CHOICE` | 4–6 options; text 1–24 characters, unique after trimming and case-folding; graphemes and words lower case unless a capital is the point; exactly one correct; for "which is spelt correctly?" no distractor may be a real word that sounds like the target |
| `TYPED` | `NUMERIC`: answer has at most `maxLength` digits. `WORD`: cue mandatory; accepted entries in British spelling, unique, fit `maxLength`; more than one accepted entry needs a reviewer note. The field must have spellcheck, autocorrect, autocomplete and autocapitalise off (D owns) |

**Why at least four options** on `PICTURE_SELECT` and `MULTIPLE_CHOICE`: the client greys out options already tried and blocks an identical
resubmission (no op is created), so with three options two different wrong answers would leave only the right one and the third try could
never fail. Four to six keeps "three incorrect = no reward" a real outcome. Naturally two- or three-way questions ("which is more?",
"<, > or =") are recast as "pick the largest of four", an ordering task or a sort. (Owner decision D-8; spine S3.3.)

### C20.2 What one attempt is

> **One attempt = one press of Check on a complete answer for the whole activity**, recorded as one `SUBMIT_ATTEMPT` op whose `opId` is
> the attempt ID ([spine S3.2](00-spine.md#s32-operations-the-only-ways-run-state-changes)–S3.3).

- The op is written to the local op log before any feedback is shown (spine S4 durability rule); attempts are numbered 1–3 by the server.
- First correct → `SUCCEEDED`, reward once; third incorrect → `FAILED`, no reward (prompt.md:513-515, **[CONFIRMED]**).
- The same `opId` delivered twice is the same attempt and returns the original result (`ALREADY_APPLIED`; AC-18).
- **Never consumes an attempt** (spine S3.3, **[CONFIRMED]** list plus **[PROPOSAL]** guards): opening, reading, waiting, leaving,
  refreshing; viewing or skipping a demonstration; Play, replay, Stop, Loading, audio failure, Retry (AC-22); selecting, moving, typing;
  Check on an incomplete answer (blocked client-side with a nudge); resubmitting an answer identical to an earlier one on that slot
  (client-only "You've tried that one"); a network failure (the op already exists locally and is retried under the same ID); Check on an
  audio-required activity before Play has ever been pressed (client nudge "Press Play to listen first").
- The server counts every `SUBMIT_ATTEMPT` it receives; there is no server identical-answer rule (spine S3.3).

### C20.3 Multi-step activities (prompt.md:521)

- An activity has one primary step and at most one `additionalSteps[]` entry in version one, each `{interactionType, prompt?,
  activityPayload, answerSpecification}`.
- All steps are on one panel with **one Check**; Check is complete only when every step is complete.
- **One Check = one attempt for the whole activity**: correct only if every step is correct. Three attempts in total, one reward, one
  slot, one summary update ([spine S3.3](00-spine.md#s33-activity-slot): "one SUBMIT_ATTEMPT = the whole answer").
- After an incorrect attempt the client (which holds the per-step answers in the pack) keeps steps that were right locked with a tick and
  marks wrong steps "Try this part again" — the same information a single-step activity gives. The server judges only the whole joined
  answer (step answers joined by `|`, still one string ≤ 64 characters); the client re-derives the per-step marks from the recorded canonical answer after a refresh.

### C20.4 Feedback after resolution

The correct answer is shown once the slot has resolved (SUCCEEDED or FAILED), never after attempt 1 or 2: identical for every child, no
reward at stake, no effect on later selection — feedback, not adaptive help (owner decision D-4). Wording and form are in
[D](D-ux-and-content-operations.md) D6.4. **[PROPOSAL]**

---

## C21. Speech references in activities

Speech definitions, preview, approval and delivery are owned by [D](D-ux-and-content-operations.md) (D9) and [E](E-architecture.md);
this section defines only how an activity refers to clips. **[PROPOSAL]**

| Variant | Meaning |
|---|---|
| `prompt` | the stimulus: the sound or word the question is about (the big Play button) |
| `instruction` | the on-screen instruction read aloud; usually a shared stem reused by many activities |
| `option-<a–f>` | a clip for one option ("tap to hear this word") |
| `bin-<id>` | a clip for a sorting bin's key sound or word |
| `intro-1` … `intro-3` | demonstration cards |
| `answer` | played from the "The answer was…" line |

- Variant names match `^(prompt|instruction|answer|option-[a-f]|bin-[a-z0-9]{1,8}|intro-[1-3])$`; one clip per variant in version one.
- In a draft, `speechDefinitionReferences` maps variant → `{speechId, speechVersion}`. At publish, the version pins resolved refs
  `{variant → speechId, speechVersion, clipKey}` and publish ConditionChecks that every referenced speech version is approved ([spine S5.2](00-spine.md#s52-activities-templates-speech)).
  The slot copies them into its `clips` map (`{speechId, speechVersion, clipKey}` per variant).
- The player speech request carries only `{runId, slotId, variant}`; the service resolves the speech **from the slot's pinned clips map**
  and signs that `clipKey` ([F](F-state-and-data.md) §4.2, [G](G-api-contracts.md) R15; spine S2 and S9 `POST /api/speech`). It reads no
  `content` item (the `tts` function has no read access to the content table). A player never sends text, SSML, a voice or a `speechId`.
  The response carries the clip's `sha256`, which the browser checks after download.

What the speech definitions behind these references look like **[CONFIRMED by owner, 2026-11-14]** (spine S5.2; pipeline in
[D](D-ux-and-content-operations.md) D9 and [E](E-architecture.md); evidence in [sources/06-polly-tts.md](sources/06-polly-tts.md) and
[sources/11-voice-engine.md](sources/11-voice-engine.md)):

| Field | Values | How it is set |
|---|---|---|
| `kind` | `WORD`, `PHONEME`, `LETTER_NAME`, `INSTRUCTION`, `DICTATION` | chosen when the definition is drafted **[PROPOSAL]**; guides which variant it suits (a `prompt` for an isolated sound is a `PHONEME`, a dictated spelling word a `DICTATION`, a shared stem an `INSTRUCTION`) |
| `provider` | `"polly"` | fixed in v1 |
| `engine` | `generative` for most kinds; `tts_phoneme_engine` (default `neural`) for `PHONEME` and `LETTER_NAME` | server configuration, never the operator or the player |
| `voiceId` | `Amy` (en-GB) by default | server configuration `tts_voice_id` |

- **A clip is synthesised once, ever.** Its key is a hash of the text/SSML, voice, engine and settings, so every activity that uses the same
  words in the same voice shares one clip (for example the instruction stem "Which letter is missing?" used by dozens of spelling items).
  This keeps the clip counts in C26.2 an upper bound.
- **Changing the voice or engine affects new previews only.** Approved clips keep their bytes until someone previews and approves again;
  nothing is silently re-voiced, so an approved activity always plays what the operator listened to (C22.3 item 5).
- **Play** (meets AC-19 and AC-22): the browser stores each clip's bytes once per `clipKey`, fetched while the run is prepared. If the
  slot's pinned clip is already stored, playback starts **at once** from local bytes and `POST /api/speech` is sent at the same time, so the
  authenticated speech call still happens on every Play. Otherwise the client waits for the response, downloads, checks `sha256`, stores
  and plays. Offline, only local bytes are used. A failure offers Retry and never costs an attempt (C20.2).
- Sounds that fail the listening test fall back to a **human recording** or a tier-A whole-word item (C19). Amazon Nova Sonic was
  considered and rejected (conversational speech-to-speech, no SSML, not in eu-west-2; [sources/11-voice-engine.md](sources/11-voice-engine.md)).
- `audioRequirement` (`NONE` | `OPTIONAL` | `REQUIRED`) on the activity: `REQUIRED` needs at least a `prompt` clip (or option/bin clips that
  carry the sound); **every phonics activity has at least one clip** (prompt or instruction), so "phonics gets a visible Play control"
  (prompt.md:271) holds for every phonics item.
- Owner decision D-1: allow clips beyond phonics stimuli — dictated spelling words that cannot be pictured ("said", "because") and a small
  library of shared instruction stems, because a five-year-old may not be able to read "Which letter is missing?". Same approved pipeline.
  Accepted as recommended **[CONFIRMED by owner, 2026-11-14]**.

---

## C22. Activity definition schema, validation and lifecycle

Fixed points: the suggested field list (prompt.md:547-548); drafts, validation, immutable published versions, retirement that preserves
versions used by existing runs (prompt.md:531-545, 552); players never submit content, set rewards or send text to speech (prompt.md:550);
human review before anything reaches the published bank (prompt.md:525). Storage layout (header, draft, versions in the `content` table) is
[spine S8.3](00-spine.md#s83-table-content-no-gsi); routes are [G](G-api-contracts.md); the editor UX is [D](D-ux-and-content-operations.md) D8.

### C22.1 Fields

The spec's suggested names are kept; additions are marked "(added)". **[PROPOSAL]** unless marked.

| Field | Type | Rules |
|---|---|---|
| `schemaVersion` (added) | integer | 1 |
| `activityId` | string | operator-chosen at creation (makes create idempotent, [G](G-api-contracts.md)); key-ID pattern `^[a-z0-9-]{1,40}$`; convention `ma-`, `ph-`, `sp-` + four digits (`ma-0101`). Immutable, never reused. Carries no age, topic or reward meaning. |
| `version` | string | the non-reusable version ID = UTC publish timestamp, e.g. `20261114T100000Z` (content sort key `V#<id>`); the display "v3" is derived by counting ([spine S8.3](00-spine.md#s83-table-content-no-gsi)) |
| `state` (spec name `status`, prompt.md:548; renamed to match the spine S8.3 header attribute) | enum | header `state`: `DRAFT` (never published), `PUBLISHED`, `RETIRED`; per version: `withdrawn{at, reason}` (C22.4) |
| `subject` | enum | `maths`, `phonics`, `spelling`. **Identity-level**: immutable once a version is published (spine S5.2) |
| `topicId` | string | must exist in the topic registry under the same subject. Identity-level |
| `minAge`, `maxAge` | integer | 5–7 in version one; `minAge ≤ maxAge`; `maxAge − minAge ≤ 1`. May change between versions |
| `curriculumReference` | 1–4 strings | framework-prefixed codes (`NC14.Ma.Y2.AS-2`, `EYFS26.ELG.Number-1`, …); optional free-text `curriculumNote` |
| `interactionType` | enum | type of the primary step (C20). Identity-level |
| `prompt` | `{text}` | 3–120 characters plain text; British spelling; no markup, no names or personal data; guide: ≤8 words at age 5, ≤14 at age 7 |
| `visualAssetReferences` | asset IDs | every asset used by prompt, payload or demonstration; each exists in the asset manifest with alt text and is flagged text-free (prompt.md:1090) |
| `activityPayload`, `answerSpecification` | objects | per type (C20). Absent on template activities |
| `additionalSteps` (added) | 0–1 items | `{interactionType, prompt?, activityPayload, answerSpecification}` (C20.3) |
| `authoringMode` (added) | enum | `FIXED` or `TEMPLATE`. Identity-level |
| `template` (added) | object | for `TEMPLATE`: `{generatorKind, generatorVersion, domain, presentation}` (C25) |
| `introductionContent` | object | optional demonstration (C22.6) |
| `speechDefinitionReferences` | map | variant → speech ref (C21) |
| `audioRequirement` (added) | enum | `NONE`, `OPTIONAL`, `REQUIRED` |
| `rewardCategory` | enum | `NORMAL` or `METEOR` (C22.5). Identity-level |
| `title` (added) | string | operator-facing list title (spine S8.3 header) |
| `source` (added) | enum | `HANDWRITTEN`, `TEMPLATE`, `IMPORT`, `AI_ASSISTED` — provenance for the audit trail only; never relaxes review |
| author metadata | object | `{createdBy, createdAt, updatedBy, updatedAt}` set by the server from the token, never from the body |
| review metadata | object | `review{checklist, previewSolvedDraftRevision}` plus `reviewedAt` and `notes`, recorded at publish; `publishedBy`/`reviewedBy` come from the token (spine S5.2) |
| `definitionHash` (added) | SHA-256 | over the canonical definition at publish; proves immutability |
| `draftRevision` (added) | integer | drafts only; optimistic concurrency: every save, publish and approve names it, and a stale value is `409 DRAFT_CONFLICT` (spine S5.2, S8.3) |
| `fromDraftRevision` (added) | integer | written on the new version and the header at publish; a repeated publish whose `draftRevision` equals it returns the existing version instead of a second one (safe retry) |

A published definition is capped at 8 KB of JSON (well inside the 64 KB draft body limit, spine S9.5), which keeps packs and items small.
The header item in the `ACT` partition carries `title, subject, topicId, rewardCategory, minAge, maxAge, interactionType, authoringMode,
domainSize, state, publishedVersion, fromDraftRevision, updatedAt` (spine S8.3) — exactly what selection and bank status need without
reading versions.

### C22.2 Publish-time validation common to every type

Publishing fails with a per-field error list (`[{field, rule}]`, [spine S9](00-spine.md#s9-api-surface-proposal-all-routes-under-api-json-authorization-bearer-access-token)) unless all hold (plus the per-type rules in C20.1):

1. The document matches the schema; unknown fields are rejected.
2. Topic exists and belongs to the subject; ages in range and at most one year apart.
3. Identity-level fields unchanged from the previous version: `subject`, `topicId`, `rewardCategory`, `authoringMode` and `interactionType`
   are locked once a version is published (rule `locked_after_publish`, spine S5.2). Only `minAge`/`maxAge` and content vary between versions.
4. Every asset reference exists in the current asset manifest with alt text.
5. Every speech reference uses a valid variant and points at an approved speech version with a stored clip; `REQUIRED` audio has at least
   a `prompt` (or option/bin) clip.
6. Every phonics activity has at least one clip.
7. The answer lies inside the payload (correct option exists, value in the number set, word buildable from the tiles, …); accepted answers
   are stored in canonical form (computed by the shared TS package in the admin app; shape-checked by admin-api), each one string ≤ 64
   characters; the reserved separators `;` `=` `,` `|` are refused inside option IDs, tile values, zone/bin/object IDs and answer values.
8. Demonstration content, if any, is valid (C22.6).
9. Template activities pass the exhaustive domain check (C25.3).
10. The review checklist is complete and the preview-solve gate passed for this exact `draftRevision`.

### C22.3 Human review, recorded

One operator may author and review their own item (a family product), but review is a separate, recorded act; `reviewedBy` comes from the
token. Checklist (all ticked): (1) I worked the answer out myself and it matches the specification; (2) exactly one right answer — nothing
else on screen could reasonably be accepted; (3) wording suits the youngest age in the range, British spelling; (4) pictures unambiguous at
the size shown, alt text neither adds nor hides information; (5) I listened to every clip and each says the intended sound or word; (6) no
homophone, heteronym ("read", "wind") or accent-dependent trap; (7) nothing personal, branded or frightening.

**Preview-solve gate:** Publish is enabled only after the operator has solved the preview of this exact draft revision correctly (three
sampled instances for a template). A wrong answer key is the most damaging content error, and this catches it for one click. Imported and
AI-drafted items go through the same checklist and gate. **[PROPOSAL]**

### C22.4 Lifecycle (spine S5.2, S8.3)

| Header state / version flag | Editable | Selectable for new runs | Served to runs that pinned it |
|---|---|---|---|
| `DRAFT` (never published) | yes | no | — |
| `PUBLISHED` — only `publishedVersion` is selectable | no (an edit is a new draft → new version) | yes, for each age `minAge…maxAge` | yes |
| `RETIRED` | no | no | **yes, exactly as before** — attempts, rewards and summaries behave normally |
| version `withdrawn{at, reason}` (exceptional) | no | no (withdrawing the published version also retires the activity) | **no** — pinned UNRESOLVED slots are voided (C27) |

- Publishing version n+1 replaces `publishedVersion`; earlier versions stay readable for the runs that pinned them (AC-23). Nothing
  published is ever deleted (prompt.md:545). No resurrection: to bring a retired activity back, copy it to a draft and publish a new version.
- *Retire* is ordinary housekeeping (stale, dull, replaced). *Withdraw* is for content that is **wrong** and needs a written reason
  (prompt.md:556 asks to distinguish them). **[CONFIRMED]** distinction; mechanics **[PROPOSAL]**.

### C22.5 Reward category

- `NORMAL` activities fill `N-…` slots; `METEOR` activities fill `M-…` slots. One value per activity, immutable.
- **The activity never contains an amount, a power or a multiplier.** A slot's reward comes from the pinned ruleset by `(kind, interval)`
  ([spine S3.3](00-spine.md#s33-activity-slot)): credits for that interval (C9.2), or the power for that meteor (C10). So nobody can set a reward through content
  (prompt.md:550) and reward opportunity cannot vary by age (prompt.md:449, AC-13).
- Meteor authoring guidance: the same age pitch as normal items, never harder curriculum content; prefer the richer formats (sorting,
  arranging, a two-step activity) so it feels like a challenge.
- Test worth having: for two runs with the same ruleset and campaign versions and different age bands, the list of
  `(slotId, kind, reward)` is identical ([I](I-validation.md)).

### C22.6 Concept demonstration (`introductionContent`)

The spec allows "a short educational demonstration before a new concept", not "an adaptive hint sequence triggered by failure"
(prompt.md:275). Structure `{conceptId (defaults to topicId), cards[1–3]}`, each card `{text ≤120, assetId?, alt?, speechVariant?}`; Next,
Start and Skip only. **[PROPOSAL]**

1. **Automatically, once per concept per run, at its first appearance** — decided at slot planning and stored on the slot (`intro: AUTO`):
   in slot order, the first slot of each concept whose activity carries a demonstration. Skippable.
2. **On request** on any slot whose activity carries one (`intro: ON_REQUEST`): a "Show me" button that behaves the same before and after an
   incorrect attempt (owner decision D-2, accepted as recommended **[CONFIRMED by owner, 2026-11-14]**).
3. Never opened by the system because of an incorrect attempt; never after resolution; never consumes an attempt; never timed.
4. The demonstration works a *different* example and must not contain the activity's answer; template generators exclude the
   demonstration's example values from the domain.

---

## C23. Content operations that touch this design (pointers)

| Concern | Owner |
|---|---|
| Admin screens, draft editor, publish/retire/withdraw flows, bank-status view | [D](D-ux-and-content-operations.md) D8 |
| Speech drafting, preview, listening checklist, approval, quality gate, Milestone 0 listening spike | [D](D-ux-and-content-operations.md) D9 |
| Routes, request bodies, idempotent create, revision conflicts | [G](G-api-contracts.md) |
| Content table keys, publish transaction, withdraw transaction | [spine S8.3](00-spine.md#s83-table-content-no-gsi); [F](F-state-and-data.md) |
| Generated art: activity pictures (≈80 at the eligibility threshold, all text-free with alt text) | [D](D-ux-and-content-operations.md) D10 |

---

## C24. Selection when a run is created

### C24.1 Fixed points (all **[CONFIRMED]**)

One normal activity in each interval; none before wave 1; none on the wave-50 completion screen; one before wave 51 if the player
continues (prompt.md:505-519). Optional meteor activities after waves 9, 19, 29, 39 and 49, additional to the normal one (prompt.md:439).
Subjects rotate automatically; topic and activity come from the run's age bank "with enough variation that fresh runs differ"; no
performance-based adjustment (prompt.md:501). Every activity has a stable identifier within the run; reloading never selects a new
question; normal and meteor activities have separate IDs (prompt.md:523). Age band and content versions are pinned at creation
(prompt.md:221). Endless uses a finite prepared buffer and never silently repeats (prompt.md:721). Everything below is **[PROPOSAL]**
([spine S5.3](00-spine.md)).

### C24.2 The slot plan

| Slots | Rule | Campaign result |
|---|---|---|
| Normal `N-001` … `N-049` | `N-k` follows wave k; subject = rotation[(k − 1) mod 3], rotation = maths, phonics, spelling | 17 maths, 16 phonics, 16 spelling. After waves 1–6: maths, phonics, spelling, maths, phonics, spelling |
| Meteor `M-009`, `M-019`, `M-029`, `M-039`, `M-049` | meteor j (1…5) follows wave 10j − 1; subject = rotation[(j − 1) mod 3] | maths, phonics, spelling, maths, phonics |
| Endless, intervals 50, 51, … | `N-<i>` for each interval i; `M-<i>` for each interval ending in 9; same two formulas (meteor j continues counting) | first block (intervals 50–59): `N-050`…`N-059` + `M-059` (spelling) |
| Challenge wave set (k waves) | `N-001`…`N-(k−1)`, `M-<p>` for each `p` in the wave set's `meteorAfter` | e.g. `wobble-rematch`: `N-001`, `N-002`, `M-002` |

The rotation start is fixed, not seeded, so it is predictable and testable. The meteor subject is never the same as the normal subject in
the same interval (checked by arithmetic for the first 60 bosses). `CREATE_RUN` writes all campaign slots (`N-001…N-049` + five `M-…` =
54 slot Puts, within spine G7's ≤57 actions) with `plannedThrough = finalWave − 1`.

### C24.3 Inputs

- `ageBand` (5, 6 or 7) and `seed` (64 random bits from the server, pinned on the run; tests inject one). A retried `CREATE_RUN` with the
  same `runId` returns the stored run, never a re-selection ([spine S3.2](00-spine.md#s32-operations-the-only-ways-run-state-changes)).
- The bank as read at that moment: one consistent Query of the `ACT` header partition (spine S8.3 C1), filtered in code to
  `state = PUBLISHED`, `minAge ≤ ageBand ≤ maxAge`, by `subject` and `rewardCategory`; each header gives `activityId`, `publishedVersion`,
  `topicId`, `authoringMode` and `domainSize`. No index is needed (a few hundred items).
- Then a de-duplicated consistent BatchGetItem of the chosen versions (template domains, speech refs, presentation data).

### C24.4 The algorithm

For each of the six groups (three subjects × `NORMAL`/`METEOR`), independently:

1. **Units.** A fixed activity is one unit. A template is up to **two** units per campaign (or per endless block): two different
   instances, so no single template dominates a run.
2. **Group by topic.** Shuffle the topic list with the seed; shuffle the units inside each topic with the seed; a template's second
   instance goes to the back of its topic's queue.
3. **Fill the group's slots in slot order by round-robin over topics**, skipping topics that have run out. This gives the widest topic
   spread (at ages 6 and 7, 14 maths topics and 17 maths slots: every topic once and three twice; at age 5, 13 topics: four twice) and never the same topic in consecutive slots of a
   subject while another topic still has units.
4. **No repeats.** A fixed activity at most once per run; a template instance (`activityId` + parameters) at most once per run.
5. **If a queue runs dry before its slots are full, stop: the run is not created** (`CONTENT_UNAVAILABLE {reason: BANK_NOT_READY}`).
   Campaign slots are never left empty and never filled from another age.

Then for the chosen units:

6. **Template instances**: draw parameters from the domain with the seed (re-draw on collision within the run); run the generator
   (shared Python module in `player-api`) and store the result as the slot's `resolved` snapshot (C25).
7. **Presentation**: shuffle option and tile order with the seed and store it on the slot (`presentation`); a tile shuffle that already
   spells the answer is re-drawn. The correct answer's position changes between runs but never between refreshes.
8. **Demonstration flags**: walking slots in play order, the first slot of each concept whose activity has a demonstration gets
   `intro: AUTO`; later ones `ON_REQUEST`.
9. **Reward**: from the pinned ruleset by `(kind, interval)` (C9.2, C10).
10. **Persist** every slot `UNRESOLVED` with its pins in the same transaction as the run ([spine S3.2](00-spine.md#s32-operations-the-only-ways-run-state-changes), G7).

### C24.5 Deterministic draws

```
draw(seed, label, i)       = first 8 bytes of SHA-256("<seed>|<label>|<i>") as an unsigned integer
shuffle(list, seed, label) = Fisher–Yates choosing index draw(seed, label, i) mod (i + 1)
labels: "topics:NORMAL:maths", "units:maths-bonds-to10", "params:N-001", "order:N-002", "endless:50:…"
```

Labelled hash draws, rather than a library random generator, because each decision gets its own stream (adding a decision later does not
disturb the others), the result is identical on any Python version (Python documents that most `random` algorithms may change between
versions), and it is trivial to reproduce in a test. The stored slots are always the authority; the seed exists for tests, audit and
endless planning ([spine S5.3](00-spine.md)). Run-level pins: `seed`, `ageBand`, `selection{algorithmVersion, bankReadAt, packId}` with `packId` = hash of
the ordered slot references (spine S3.1). The topic registry version is deliberately **not** pinned: topic IDs are append-only (C19),
so a run's slots and summaries stay meaningful under any later registry. **[PROPOSAL]**

### C24.6 Endless blocks: a finite buffer, honestly

- Blocks of K = 10 intervals (plus the meteor for the interval ending in 9) are planned inside `CHOOSE_ENDLESS` and each endless
  `COMPLETE_WAVE` while `plannedThrough < (wave − 1) + K`, so 10–19 intervals are in hand ([spine S5.3](00-spine.md)). Each block uses the same algorithm
  with label `endless:<first interval>`, from the **bank published at that moment**, for the **pinned age band**, **excluding everything
  already used in the run**; each template may contribute up to two new instances per block. Slot writes are `attribute_not_exists` Puts
  (spine S3.3).
- **A subject's bank is used up (online):** that interval falls back to the next subject that still has unused content, in the order
  maths, phonics, spelling. Because the band's maths templates must offer ≥500 instances (C24.7), this gives hundreds of endless waves in
  hand at every age. **Everything used up:** no slot is written for that interval and the child sees "You have done every activity we have
  for now" — never a repeat (owner decision D-6; alternative: a deliberate second cycle).
- **Never above interval 998:** endless planning never creates a slot for an interval above 998, so slot IDs stay three digits and the
  wave-999 hard cap (C11.2) needs no slot (spine S5.3).
- **Offline with the buffer used up:** the run pauses in BUILD — "Reconnect to get more activities" — and nothing is repeated or invented
  (prompt.md:721, AC-34). Readiness "Ready offline up to wave N" is [D](D-ux-and-content-operations.md)/[F](F-state-and-data.md).
- The rewards of endless slots are the ruleset values (75 credits; the next power in the rotation), the same at every age.

### C24.7 Eligibility thresholds: when is an age band "eligible"?

A band is eligible when **both** hold: (1) **feasibility** — the algorithm can fill all 49 normal and 5 meteor slots; (2) **variety** —
each group holds at least twice what one run uses, spread over enough topics. Thresholds are server configuration, shown on
`GET /api/admin/bank-status` ([spine S5.3](00-spine.md), S9), and must never be set below the hard minimums. **[PROPOSAL]**

| Group | One campaign uses | Hard minimum (units) | Eligibility threshold, version one | Comfortable target |
|---|---|---|---|---|
| Maths, normal | 17 | 17 | 34 | 60 or more (templates make this easy) |
| Phonics, normal | 16 | 16 | 32 | 48 |
| Spelling, normal | 16 | 16 | 32 | 48 |
| Maths, meteor | 2 | 2 | 4 | 6 |
| Phonics, meteor | 2 | 2 | 4 | 6 |
| Spelling, meteor | 1 | 1 | 2 | 4 |

Additional conditions: at least five topics per subject with two or more units each; the band's `NORMAL` maths templates together offer
≥500 instances and its `METEOR` maths templates ≥50 (so the endless fallback has hundreds of waves in hand and reward opportunity stays the
same across ages deep into endless). Counting rule: a fixed activity counts 1; a template counts 2 if its `domainSize` ≥ 20, otherwise 1.
What the threshold buys: two fresh runs drawing n from a bank of B share about n²/B items — at the threshold (16 from 32) about half a run's
phonics items in common with the previous run; at the target (16 from 48) about a third.

Milestone 1 sets the thresholds to 1 and declares one activity interval — labelled as milestone configuration, not the product rule
([B](B-scope-and-decisions.md), [J](J-execution-backlog.md)).

**As built in Phase 42 (M3-07) [PROPOSAL]:** the table above, the topic condition and the template-instance totals are
`PLAN_CONFIG` in `api/shared/selection/plan.py`; a band that meets every condition, and that the selector can fill a whole
campaign for without the subject fallback, is eligible and plays by C24.4 exactly. The Milestone 1 rules (thresholds 1, subject
fallback on) are kept as `STARTER_CONFIG`, and the live configuration (`LIVE_CONFIG`) applies them to a band that is **not yet
eligible** instead of refusing it (`starter_until_eligible`), because the starter bank of 2026-11-16 is far below the thresholds at
every age and the plan's rule alone would make every new game `BANK_NOT_READY`. Each band moves to the plan's rules by itself once
bank status shows it eligible; turning `starter_until_eligible` off restores C24.8 exactly. A run is still never partial: with
nothing left to fill a slot it is `BANK_NOT_READY`. Bank status (R30) and selection count with the same function
(`api/shared/selection/bank.py` `group_units`).

### C24.8 Content unavailable (prompt.md:219)

| Situation | Reason code | Child sees |
|---|---|---|
| Age from date of birth is under 5 or over 7 | `AGE_OUT_OF_RANGE` | "We don't have activities for your age yet." |
| Band 5–7 but the bank is below a threshold or cannot fill the slots | `BANK_NOT_READY` | "Activities for your age are still being made. Please come back soon." |

Checked when the planet list is shown (so Start is honest before it is pressed, `GET /api/planets` `available/reason`) and again inside run
creation (`409 CONTENT_UNAVAILABLE{reason}`, [spine S9.1](00-spine.md#s91-error-table-source--http--client-action)). The account, profile, progress and existing runs stay usable; only new runs are
blocked. No nearest-age fallback, no partial run. Responses and logs carry `ageBand` or the reason code, never the date of birth.

### C24.9 Properties worth testing ([I](I-validation.md))

1. Same seed and same bank → identical slot list. 2. Different seeds → different slot lists. 3. No fixed `activityId` and no template
`(activityId, parameters)` twice in a run (endless blocks included). 4. Subjects of `N-k` and `M-…` follow the two formulas; counts 17/16/16
and 2/2/1. 5. Every topic with enough units appears before any topic appears a third time. 6. The reward list is identical for ages 5, 6
and 7. 7. A bank one unit short of feasibility produces `CONTENT_UNAVAILABLE`, never a partial run. 8. Publishing, retiring or superseding
content after creation changes nothing in the run. 9. Reloading returns the same slots, options in the same order.

---

## C25. Templates

Content may come from deterministic templates, with human review before anything reaches the bank (prompt.md:525). **[PROPOSAL]**
throughout.

### C25.1 The model (spine S5.2)

- **A template is an ordinary activity** with `authoringMode = TEMPLATE`: same ID space, lifecycle, bank and review. In place of a payload
  and answer it carries `template = {generatorKind, generatorVersion, domain, presentation}`. No separate template entity exists.
- **A generator kind is code**: a pure function from `(domain, parameters)` to `{prompt, activityPayload, answerSpecification}`, with
  companions `enumerate(domain)` and `check(instance)`. It lives in one shared Python module used by `admin-api` (preview, validation) and
  `player-api` (run creation, endless planning). **The browser never runs a generator.**
- **`generatorVersion` freezes behaviour**: once released, a `(kind, version)` pair never changes its output; a change is a new version.
- **Instances are materialised when slots are planned** and stored on the slot as `resolved` (parameters + prompt + payload + canonical
  accepted answers). Judging and the offline pack use that snapshot, so a later code change cannot alter a pinned question
  (prompt.md:552; AC-23).
- **Operators create templates without code** by choosing a kind and filling in bounds; adding a new *kind* is a developer task with tests.
- Rejected alternative: expanding each template into hundreds of fixed activities at authoring time (floods the bank and the admin list,
  needs batch review).

### C25.2 Generator kinds

| Kind | Parameters and bounds | Typical output | Bands |
|---|---|---|---|
| `COUNT_OBJECTS` | count in a range (1–10 or 11–20); object asset from a set; arrangement scatter, row, ten-frame or dice | NS, TY | 5 |
| `COUNT_OUT` | target 2–10; tray holds target + 2 or 3, never more than 12 | OM distribute, one zone | 5 |
| `PICK_EXTREME` | four distinct values in a range; ask most/fewest or largest/smallest | PS, MC | 5, 6 |
| `ORDER_NUMBERS` | three to five distinct values in a range; ascending or descending; optional reversed-digit pair | AR sequence | 5, 6, 7 |
| `ONE_MORE_LESS` | n in a range; plus or minus 1 (plus or minus 10 for band 7); result stays in range | NS, TY, MC | 5, 6 |
| `BOND_TO` | total 5, 10, 20 or 100 (tens only); one part; four sentence forms; frame or sentence | NS, TY, MC | 5, 6, 7 |
| `ADD_WITHIN` | a + b with sum ≤ N; flags for crossing ten and for operand shape (two-digit + ones, + tens, + two-digit, three one-digit) | TY, NS, MC | 5, 6, 7 |
| `SUB_WITHIN` | a − b with b ≤ a ≤ N; same flags | TY, NS, MC | 5, 6, 7 |
| `MISSING_NUMBER` | six sentence forms including "a = ? − b"; within N | TY, NS | 6, 7 |
| `DOUBLE_HALVE` | n up to a maximum; double, or halve an even number | NS, TY | 5, 6 |
| `SHARE_EQUALLY` | total from 4, 6, 8, 10, 12 shared between 2 or 3 where it divides exactly | OM distribute, all placed | 5, 6 |
| `EQUAL_GROUPS` | 2–5 groups of 2, 5 or 10, pictured as groups or an array | NS, TY | 6 |
| `SKIP_COUNT` | step from a set (2, 5, 10; plus 3 for band 7); start; direction; next term or a gap | TY, NS, MC | 6, 7 |
| `SEQUENCE_GAP` | consecutive numbers within 0–100 with one gap; forwards or backwards | NS, TY | 6 |
| `NUMBER_WORD` | n in 1–20 or 20–100; word to numeral or numeral to word, from one reviewed British word list ("forty", "twenty-one") | MC, TY | 6, 7 |
| `PLACE_VALUE` | n in 10–99; tens digit, ones digit, or "t tens and o ones" | MC, TY, NS | 7 |
| `COMPARE_FILL` | "a < ?" or "? > b" with four candidate numbers of which exactly one works | MC | 7 |
| `TIMES_TABLE` | table 2, 5 or 10; multiplier 1–12; four forms including division | TY, NS, MC | 7 |
| `ODD_EVEN_SORT` | six distinct numbers in a range, at least two odd and two even | OM sort | 7 |
| `PATTERN_NEXT` | unit AB, AAB, ABB or ABC; shapes that differ in shape, not only colour; two or three repeats shown | PS | 5, 6 |

Distractors for multiple-choice outputs come deterministically from a fixed near-miss list (answer ± 1, ± 2, ± 10, digits reversed, the
other operand), de-duplicated, kept in range and never equal to the answer; an instance that cannot supply three is removed from the
domain. A first release needs only eight kinds (`COUNT_OBJECTS`, `ORDER_NUMBERS`, `ONE_MORE_LESS`, `BOND_TO`, `ADD_WITHIN`, `SUB_WITHIN`,
`SKIP_COUNT`, `TIMES_TABLE`), which cover most maths topics at all three ages.

**Version 1 as built (Phase 41, 2026-11-16).** `api/shared/generators/` implements 17 kinds at `generatorVersion` 1: all of the table
except `PATTERN_NEXT`, `EQUAL_GROUPS` and `COMPARE_FILL`, and `COUNT_OBJECTS` with the dice arrangement only (counts 1–6). Those three
kinds and the scatter, row and ten-frame arrangements need a question picture made of several pictures (a row of shapes, groups,
an array, N objects), which the learning panel cannot show yet; `COMPARE_FILL` also needs `<` and `>` in text, which the plain-text
rule refuses as markup. They are refused with rule `not_supported_yet` until a later version adds them **[ASSUMPTION]**. Each kind's
domain fields are listed in `numbers.py` and `objects.py`; a numeric kind can be shown as `NUMBER_SELECT` (the template's
`presentation` gives the number set and display), `TYPED` numeric (`presentation.maxLength`, default 3) or `MULTIPLE_CHOICE`. A
domain above 5,000 instances is refused (`domain_too_large`), not sampled; the cap counts instances, not raw combinations, so
a within-100 domain whose build drops pairs over the total still fits. Enumeration stops at 50,000 raw combinations (a work
bound for publish), and a domain above that is also `domain_too_large` **[ASSUMPTION, Phase 41 review]**. A template may reference only an `instruction`
clip **[ASSUMPTION]**, so `audioRequirement` on a template is `NONE` or `OPTIONAL`; `REQUIRED` is refused with rule
`not_for_template` (no clip could meet it) **[ASSUMPTION, Phase 41 review]**.

### C25.3 What makes this safe

1. **Bounded domain**: every parameter has explicit bounds; the whole domain is capped at 5,000 instances ([spine S5.2](00-spine.md#s52-activities-templates-speech)); `domainSize` is
   stored on the header for eligibility.
2. **Exhaustive machine check at publish**: every instance is generated and checked — numbers in range, never negative, exactly one correct
   answer, the answer inside the payload, options distinct, prompt within length, answers already canonical. One failure blocks publication.
3. **Human review** of wording, bounds and representation on a rendered sample that includes the smallest, the largest and a few middle
   instances, then the preview-solve gate on three instances.
4. **Deterministic**: same template version and parameters → same instance.
5. **No free text**: a generator produces only numbers, fixed stems and asset references.

### C25.4 Which topics suit templates

| Suits templates | Needs hand-authoring |
|---|---|
| Counting, comparing, ordering, one more/less, bonds, addition, subtraction, missing numbers, doubling and halving, skip counting, times tables, place value, odd/even, number words, simple repeating patterns | Shape naming and shape properties (tied to specific art and to facts such as "a square-based pyramid has 5 vertices"); any picture comparison with real-world objects; anything with sentences or context ("word problems"); all phonics; all spelling |

Phonics and spelling are hand-authored against a finite set of approved clips because every sound must be listened to by a person
(prompt.md:609 via [D](D-ux-and-content-operations.md)); word choice needs judgement a generator lacks (homophones, heteronyms, accent,
accidental real-word distractors, picture clarity, whether a grapheme has been taught); and English spelling is not regular enough to
generate plausible-but-wrong misspellings by rule. Authoring-time help (a reviewed word list turned into drafts) is fine (C26.3).

### C25.5 Worked records (illustrative, abbreviated)

Author/review metadata, `schemaVersion` and `definitionHash` omitted. IDs follow the spine patterns. All **[PROPOSAL]**.

A template, age 7 (`N-001` in C16.2) — `maths-bonds-to20`, shared 6–7:

```json
{ "activityId": "ma-0301", "authoringMode": "TEMPLATE", "subject": "maths", "topicId": "maths-bonds-to20",
  "minAge": 6, "maxAge": 7, "rewardCategory": "NORMAL", "interactionType": "NUMBER_SELECT", "audioRequirement": "NONE",
  "curriculumReference": ["NC14.Ma.Y1.AS-2", "NC14.Ma.Y2.AS-2"],
  "template": { "generatorKind": "BOND_TO", "generatorVersion": 1,
    "domain": { "totals": [20], "part": { "min": 1, "max": 19 }, "forms": ["a + ? = T", "? + a = T"] },
    "presentation": { "numberSet": { "kind": "RANGE", "min": 0, "max": 20, "step": 1 }, "display": "TRACK" } } }
```

Domain 19 parts × 2 forms = 38 instances (counts as 2 units). **[PROPOSAL, Phase 41]** The BOND_TO version 1 domain field is
`totals` (a list, so one template can cover several totals), not `total`; this record was amended to match, and
`api/tests/unit/test_generators.py` checks this exact record. Pinned instance `{part: 14, form: "a + ? = T"}` → "14 + ? = 20",
`answerSpecification {accepted: ["6"]}`.

A fixed phonics item, age 5 (`N-002`; Example B) — shared 5–6:

```json
{ "activityId": "ph-0102", "authoringMode": "FIXED", "subject": "phonics", "topicId": "phonics-gpc-consonant-digraphs",
  "minAge": 5, "maxAge": 6, "rewardCategory": "NORMAL", "interactionType": "MULTIPLE_CHOICE", "audioRequirement": "REQUIRED",
  "curriculumReference": ["EYFS26.ELG.WordReading-1", "LS07.Phase3"],
  "prompt": { "text": "Listen. Which letters make this sound?" },
  "activityPayload": { "optionStyle": "GRAPHEME",
    "options": [ { "id": "a", "text": "s" }, { "id": "b", "text": "sh" }, { "id": "c", "text": "ch" }, { "id": "d", "text": "th" } ] },
  "answerSpecification": { "accepted": ["b"] },
  "speechDefinitionReferences": { "prompt": { "speechId": "phoneme-sh", "speechVersion": "20261120T101400Z" },
                                  "instruction": { "speechId": "instruction-listen-which-letters", "speechVersion": "20261120T101500Z" } } }
```

If the isolated /sh/ fails the listening check, the same point is authored at tier A: "Listen. Which letters start this word?" with
`word-ship`. This is also the recommended Milestone 1 activity (one activity, one clip, prompt.md:1271).

A two-step meteor, age 7 (`M-009`):

```json
{ "activityId": "ma-0307", "authoringMode": "FIXED", "subject": "maths", "topicId": "maths-times-tables-2-5-10",
  "minAge": 7, "maxAge": 7, "rewardCategory": "METEOR", "interactionType": "MULTIPLE_CHOICE", "audioRequirement": "NONE",
  "curriculumReference": ["NC14.Ma.Y2.MD-1", "NC14.Ma.Y2.MD-2"],
  "prompt": { "text": "Two parts. Do both, then press Check." },
  "activityPayload": { "partPrompt": "Which number is in the 5 times table?", "optionStyle": "NUMERAL",
    "options": [ { "id": "a", "text": "12" }, { "id": "b", "text": "18" }, { "id": "c", "text": "25" }, { "id": "d", "text": "32" } ] },
  "additionalSteps": [ { "interactionType": "TYPED", "prompt": { "text": "5 × 6 = ?" },
      "activityPayload": { "mode": "NUMERIC", "maxLength": 2 }, "answerSpecification": { "accepted": ["30"] } } ],
  "answerSpecification": { "accepted": ["c|30"] } }
```

Attempt 1 "c|35" → incorrect; part one kept with a tick, part two "Try this part again"; tries left 2. Attempt 2 "c|30" → SUCCEEDED → one
Frost Pulse charge, one summary update.

Other records referenced in C16.2 (one line each; full fields as above):

| ID | Age | Topic | Type | Content | Answer (canonical) | Clips |
|---|---|---|---|---|---|---|
| `ma-0101` | 5 | `maths-count-objects-to10` | NUMBER_SELECT, template `COUNT_OBJECTS` (count 3–10 × 4 objects × 2 arrangements = 64) | "How many stars?" — 8 stars, track 0–10 | `8` | none |
| `sp-0103` | 5 | `spelling-cvc-build` | ARRANGE letters | cat picture; tiles c, a, t, o, n; 3 slots | `cat` ("cot" is a real word but not the cued one) | `word-cat` (optional) |
| `ma-0104` | 5 | `maths-share-equal-groups` | OBJECT_MOVE distribute, template `SHARE_EQUALLY` (12 instances → 1 unit) | "Share the stars fairly." 6 stars, zones Nova / Pip | `z1=3;z2=3` | none |
| `ph-0105` | 5 | `phonics-initial-sounds` | PICTURE_SELECT | hear /m/; moon, sun, cat, dog (no captions) | `a` | `phoneme-m`, `instruction-listen-which-picture` |
| `sp-0106` | 5 | `spelling-cvc-missing-letter` | MULTIPLE_CHOICE | "d _ g" with a dog picture; o, i, u, a | `a` | none |
| `ma-0107` | 5 | `maths-number-one-more-less-to10` (METEOR) | TYPED numeric, template `ONE_MORE_LESS` | "What is one more than 6?" | `7` | none |
| `ma-0201` | 6 | `maths-missing-number-within20` | TYPED numeric, template `MISSING_NUMBER` | "7 = ? − 9" | `16` | none |
| `ph-0202` | 6–7 | `phonics-pseudo-words` | MULTIPLE_CHOICE | alien name "chom"; chom, shom, chon, chob | `a` | `pseudo-chom` (explicit phoneme SSML) |
| `sp-0203` | 6 | `spelling-y1-vowel-digraphs-1` | ARRANGE letters | rain picture; tiles r, ai, n, ay, a | `rain` | `word-rain` |
| `ph-0302` | 6–7 | `phonics-alt-pronunciation` | OBJECT_MOVE sort | sea, head, dream, bread, meat, instead into "like tree" / "like bed" | `o1=ee;o2=e;o3=ee;o4=e;o5=ee;o6=e` | `word-tree`, `word-bed`, `instruction-sort-by-sound` |
| `sp-0303` | 7 | `spelling-y2-suffix-rules` | TYPED word | "hop + ing" | `hopping` | none |
| `ma-0304` | 7 | `maths-compare-symbols-to100` | ARRANGE sequence, template `ORDER_NUMBERS` (72 instances) | 38, 83, 30, 80 smallest first | `30,38,80,83` | none |
| `ph-0305` | 7 | `phonics-gpc-y2-consonant-spellings` | MULTIPLE_CHOICE | hear "knee"; need, knit, knee, neat | `c` | `word-knee`, `instruction-listen-which-word` |
| `sp-0306` | 7 | `spelling-y2-homophones` | PICTURE_SELECT | read "knight"; night sky, knight, kite, knot (no clip: audio cannot tell homophones apart) | `b` | none |

---

## C26. Learning summaries and bank sizing

### C26.1 Learning summary model (prompt.md:469, 527)

One counter item per player per topic: `SUM#<subject>#<topicId>` with `completed`, `succeeded`, `failed`, `lastResolvedAt`; invariant
`completed = succeeded + failed`; subject totals are sums ([spine S8.1](00-spine.md#s81-table-game-pk-pk-sk-sk-both-strings-no-gsi-no-ttl-except-syssignups)). Not a mastery or scoring system. **[CONFIRMED]** scope;
**[PROPOSAL]** mechanics.

| Event | Effect |
|---|---|
| Activity opened, demonstration viewed, audio played | none |
| Attempt 1 or 2 incorrect | none (recorded on the slot only) |
| Correct on any attempt → `SUCCEEDED` | `completed +1`, `succeeded +1`, in the resolving transaction (exactly once, AC-18) |
| Third incorrect → `FAILED` | `completed +1`, `failed +1`, same transaction |
| Activity left unfinished (refresh, save and exit, run abandoned or lost with the slot UNRESOLVED) | none — an interrupted activity is not a failure (prompt.md:469) |
| Meteor declined → `DECLINED` | none |
| Slot voided → `VOIDED` | none (C27) |
| Run later defeated, abandoned or completed | none; what was counted stays counted |
| `LEARNING_HISTORY` reset | all `SUM#` items deleted; nothing else touched (spine S8.2) |

Meteor results count like any other (owner decision D-5). The summary holds no attempt numbers, times, answers or age band. **Nothing reads
the summary to choose content** (prompt.md:165, 501); the only other reader is the progress screen (no badge reads it; C12).
Progress-screen design ("Activities done", "Stars", neutral "Still practising"; no percentages, grades or comparisons) is in
[D](D-ux-and-content-operations.md).

### C26.2 How much content version one needs (at the C24.7 thresholds)

| Group | Per band | Shared with a neighbouring band | Distinct records to author |
|---|---|---|---|
| Maths, normal | 34 units ≈ 11 templates (22 units) + 12 fixed | a few (bonds to 10/20, repeating patterns) | ≈30 template rows + 32 fixed |
| Phonics, normal | 32 fixed | 8 shared 5–6, 8 shared 6–7 | 80 |
| Spelling, normal | 32 fixed | 8 shared 5–6, 8 shared 6–7 | 80 |
| Maths, meteor | 4 units = 2 templates | none | 6 templates |
| Phonics, meteor | 4 fixed | 2 + 2 | 8 |
| Spelling, meteor | 2 fixed | 1 + 1 | 4 |
| **Total** | | | **≈240 records (≈36 template rows)** |

Supporting material: ≈200 approved clips (≈80 phonics stimuli, 50 spelling words, 25 instruction stems, 20 demonstration clips, 25 others;
an upper bound, because identical text in the same voice and engine is one shared clip, C21)
and ≈80 activity pictures (35–40 nouns for age 5, 15 for ages 6–7, counting objects, shapes, frames, dice). Pictures are the hidden
dependency for age-5 phonics and spelling. Rough operator effort ≈20–25 hours across the content phases. All **[UNVERIFIED]** estimates
until a first batch is authored. Pack size ≈54 definitions + ≈55–90 distinct clips per campaign; budget 2 MB (measure clip sizes in
Milestone 0).

### C26.3 Authoring sequence and sources

Content phases A–H below are authoring stages, not the build phases of [J](J-execution-backlog.md); each sits inside the milestone shown.

| Content phase | Milestone | What | Done when |
|---|---|---|---|
| A | M0 | listening matrix, rendered with the AWS CLI from the same canonical inputs the preview route will use (Polly, en-GB, Amy); nothing published | `tts_phoneme_engine` decided (`neural` unless `generative` passes); a list of sounds approved for isolated use, with `word-only` verdicts recorded in `content/listening-verdicts.json` (to create); human recordings listed for any sound that fails |
| B | M1 | one activity + one clip (`ph-0102` with `phoneme-sh`, or its tier-A twin), re-rendered and approved through the real preview route in the minimal admin app | Play works through the real service; three attempts and one reward; refresh keeps attempts; playtest P1 |
| C | start of M3 | the worked records of C25.5 (≈17 activities, 12 clips) | every type and mode works mouse-only and keyboard-only; shared vectors pass in both languages |
| D | M3 | the first eight generator kinds and ≈30 template rows | maths groups at threshold in every band |
| E | M3 | phonics items, age 5 first, then 6, then 7 | phonics groups at threshold; every clip reviewed |
| F | M3 | spelling items, age 5 (tiles and pictures), then 6, then 7 | spelling groups at threshold |
| G | M3–M4 | meteor pool; demonstration cards | bank status shows every band eligible — "content complete for version one" |
| H | after release | top up to comfortable targets; more generator kinds | two consecutive runs share about a third of hand-authored items |

Imports and AI-assisted drafting are content *sources*, never around review (prompt.md:525, 554): an import creates **drafts only**, row by
row, never publishes or approves a clip, and never overwrites operator-authored content ([spine S8.3](00-spine.md#s83-table-content-no-gsi) C8). AI drafting happens outside the
product into the same spreadsheet columns; rows carry `source = AI_ASSISTED` and pass the same checklist, preview-solve gate and listening
check. Never trust it for answer keys, pronunciation, curriculum claims or British spelling. Detailed import UX is
[D](D-ux-and-content-operations.md) D8.6. **[PROPOSAL]**

---

## C27. Invalid-content handling (spine S3.3)

The spec requires the admin to prevent future selection of a critical content error, and existing-run handling that is deliberate,
preserves progress, never silently replaces a saved activity and never charges it as a failed answer — distinct from ordinary retirement
(prompt.md:556, **[CONFIRMED]**). Mechanism **[PROPOSAL]** per [spine S3.3](00-spine.md#s33-activity-slot):

| | Retirement (ordinary) | Withdrawal (exceptional) |
|---|---|---|
| When | fine but no longer wanted: superseded, dull, replaced | **wrong**: wrong answer key, two right answers, a clip with the wrong sound, a misleading picture |
| Future selection | removed | removed |
| Runs that pinned it | **unaffected**: presented, attempted, rewarded and counted as before | pinned **UNRESOLVED** slots are voided and compensated |
| Writes | header `state = RETIRED` + audit | version `withdrawn{at, reason}` (+ retire if it is the published version) + audit; **writes nothing to the `game` table** |
| Needs | one click | a written reason and a confirmation showing the effect on bank thresholds |

How a slot is voided — **only by a run op, only if UNRESOLVED** (spine S3.2–S3.3):

| Slot status when the withdrawal is discovered | What happens |
|---|---|
| `UNRESOLVED`, not yet current (a later interval) | Nothing yet. When it becomes current, the run view shows `withdrawn: true`; the online client shows "This one had a mistake, so we took it away. You still get your reward." and sends `DISMISS_SLOT` → `VOIDED`, reward granted once, phase advances by the next-phase rule. |
| `UNRESOLVED` and current, with 0–2 attempts | Same: `DISMISS_SLOT` → `VOIDED` + reward; or, if a `SUBMIT_ATTEMPT` arrives first (for example from an offline device), the server checks the pin **first**: nothing judged or counted, slot `VOIDED`, outcome `VOIDED`, reward granted once. Recorded attempts are kept for audit and ignored. |
| `SUCCEEDED` | unchanged; the reward was granted and cannot be granted twice |
| `FAILED` | **unchanged** (stays FAILED, still counted) — documented limitation, owner decision D-9 |
| `DECLINED` / `VOIDED` | unchanged; a replayed op naming an already-VOIDED slot is an APPLIED no-op (revision +1), which keeps offline branches aligned |

- **Reward**: exactly the slot's pinned reward (credits or the meteor power), through the same `(runId, slotId)` marker as a success — the
  slot condition `#status = :unresolved` — so it is granted at most once.
- **Summary**: a voided slot is neither a success nor a failure; counters do not change.
- **Nothing is replaced**: the corrected item, if any, is published as a new version and enters the bank for future selections only.
- A pinned version that cannot be found is treated exactly like a withdrawn one (VOID) and logged at ERROR (spine S8.3).
- Limitation: an offline branch that already moved past the slot keeps what it saw locally until it syncs; the server then applies the
  rules above. If the server voids a slot that the offline branch had already resolved as FAILED, the cloud keeps what the child saw:
  the VOID reward is granted, then the next queued `SAVE_PREP` carries the lower local credits, so the reward does not stick (spine S3.3;
  pairs with D-9). **[PROPOSAL]**
- Operator runbook: withdraw with a reason (the confirmation warns if a band drops below threshold, in which case new runs for that band
  are honestly blocked until topped up); if fixable, copy to draft, correct, review, preview-solve, publish; if the fault is a clip,
  withdraw or retire every activity version using it (v1 has no speech-withdrawal route and no "used by" index; the runbook finds the
  activities, spine S5.2); check bank status; record the fault in the decision log and add a checklist line if
  it was a new kind of fault ([D](D-ux-and-content-operations.md) D9.6).

---

## C28. Owner decisions touching this section

The owner accepted every D-decision below as recommended **[CONFIRMED by owner, 2026-11-14]** ([spine S13](00-spine.md#s13-owner-decisions)). The three rows marked
"(new)" are this section's own design choices; they are covered by the owner's approval of the plan's design decisions and stay
**[PROPOSAL]** settings that playtests may revisit. The owner's voice and speech decisions are applied in C19 and C21.

| # | Decision | Accepted answer |
|---|---|---|
| D-1 | Clips beyond phonics stimuli (dictated spelling words, instruction stems) | yes |
| D-2 | "Show me" still available after an incorrect attempt | yes |
| D-3 | Eighth birthday: no bank for age 8 | accept for v1; the only legitimate fix is curated content with `maxAge = 8` |
| D-4 | Show the correct answer after resolution | yes |
| D-5 | Meteor results count in summaries | yes |
| D-6 | Endless bank exhausted | subject fallback, never repeat |
| D-7 | Typed words at age 5 | no; tiles |
| D-8 | Client-only "tried that" guard + ≥4 options | yes, together |
| D-9 | Already-FAILED slots on a withdrawn version stay FAILED | accept |
| D-11 | Meteor skip only before the first attempt | yes |
| (new) | Staged pad opening vs all 16 pads from wave 1 (C3.3) | staged |
| (new) | No wave-clear bonus (C9.1) | none |
| (new) | A credit sink after the board is complete (C11.3) | not in v1; revisit after playtests as a labelled scope change |

---

## C29. Acceptance criteria this section supports

| AC | Design element | What tests or play must still show ([I](I-validation.md)) |
|---|---|---|
| AC-07 | pads only; no rule lets an alien affect an astronaut or pad (C3, C4) | placement validation; property test that only player commands change astronauts |
| AC-08 | every level changes a visible value; previews are exact circles (C5) | art for three visual levels; preview accuracy |
| AC-09 | commands validated one at a time at tick boundaries (C2.3) | UI race tests |
| AC-10 | completion rule, release queue, self-check equalities (C6.3) | same checks in `game-core`; reload during a wave |
| AC-11 | 50-row schedule, bosses 10/20/30/40/50, one polyline (C8) | data validation in CI |
| AC-12 | `campaign-luna-1` committed before the offer; endless generator (C11, C12) | state-machine tests ([F](F-state-and-data.md)) |
| AC-13 | no age input in combat or economy data; rewards from ruleset by slot; worked example (C9, C16); fixed timestep with an integer accumulator, so frame rate cannot change outcomes (C2.1, prompt.md:303) | two runs with different age bands have identical combat inputs and `(slotId, kind, reward)` lists; the same wave at 30/60/144 Hz frame deltas gives an identical tick count and post-wave snapshot |
| AC-14 | reset list (C9.1) | state-machine tests |
| AC-15–AC-17 | one `N` slot per interval, separate `M` slots, attempts and presentation on the slot (C20.2, C24) | refresh after two wrong answers; ten minutes and ten plays change nothing |
| AC-18 | attempt = opId; summary in the resolving transaction (C20.2, C26.1) | duplicate delivery; same wrong answer under a new ID (client-blocked) |
| AC-19, AC-22 | every Play sends the authenticated speech request, even when playback starts at once from stored bytes; Play, Retry and Loading never cost an attempt (C20.2, C21) | network log shows one `POST /api/speech` per Play online; failure and Retry leave attempts and credits unchanged |
| AC-23 | immutable versions; slots pin `activityId@version` and clips (C22.4) | publish v2 of a pinned activity; the run still shows v1 with its audio |
| AC-34 | finite endless buffer (C24.6) | go offline in endless and use up the buffer |
| AC-41 | every type defined with keyboard and mouse flows (C20; UX in [D](D-ux-and-content-operations.md)) | one activity of each type keyboard-only, then mouse-only |
| AC-42 | budgets and busiest-wave list (C14) | the M2 measurement that sets the target, then the release measurement against it |

---

## Unverified items to check

| Item | Why it matters | How and when to check | Milestone |
|---|---|---|---|
| Which isolated sounds (tiers B and C, C19) Polly says acceptably, and whether the `generative` engine honours `<phoneme>` (AWS documentation is contradictory) **[UNVERIFIED]** | Decides `tts_phoneme_engine`, which phonics items can use isolated sounds, and which need a tier-A twin or a human recording | The M0 listening bake-off: render the listening matrix with the AWS CLI on both engines, listen, record verdicts in `content/listening-verdicts.json` (to create) ([D](D-ux-and-content-operations.md) D9) | M0 |
| Clip sizes and the 2 MB per-campaign pack budget (C26.2) **[UNVERIFIED]** | Pack preparation time and offline storage on the children's laptop | Measure the M0 bake-off MP3 sizes; multiply by the 55–90 distinct clips per campaign | M0 |
| Bank sizing, clip and picture counts and ≈20–25 hours of operator effort (C26.2) **[UNVERIFIED]** estimates | Whether every age band can reach eligibility (C24.7) in M3 as planned | Time the first authored batch (content phase C, the C25.5 records) and re-estimate | M3 |
| Busiest-wave frame rate against the C14 budgets **[UNVERIFIED]**; nothing has been measured | AC-42 has no target until it is measured | Measure wave 37 and the synthetic full-pool scene at 2x on the children's laptop ([J](J-execution-backlog.md) M2-13) | M2 |
| Balance numbers (all of C5–C11) suit real five- to seven-year-olds **[UNVERIFIED]**; the simulator's players are heuristics (C17.1, C17.6) | Too hard or too easy loses the children; the C17.7 list says which numbers move first | Child playtests P1 (M1), P2 (M2) and the balance playtests in M4, each number change re-run through [tools/sim/](../../tools/sim/) first ([I](I-validation.md)) | M1, M2, M4 |
