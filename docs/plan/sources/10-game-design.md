# 10 - Game design: combat, economy and simulator evidence

Specialist source material for the Space Colony Defence implementation plan: section C (game design), with inputs to F (run resources), I (validation) and J (backlog). British English. Written 2026-11-14.

**This file is generated.** Every table is printed from `sim/game_data.json` (design tables) or `sim/results.json` (simulator output) by `sim/tables.py`, and the result numbers quoted in the prose are filled in from the same files by `sim/build_report.py`. If the data changes, re-run the commands in section 16.7 and this document follows.

## 0. Status of what is in here

| Label | Meaning in this report |
|---|---|
| **CONFIRMED** | Fixed by the approved specification. Cited as `prompt.md:<line>` (file `/home/jack/Documents/Projects/space-tower-defence/prompt.md`, read in full). |
| **PROPOSAL** | My design recommendation. **Every name, number, coordinate, formula and rule in this report is a PROPOSAL and an INITIAL PLAYTEST SETTING unless it carries another label.** None of it is validated balance. |
| **SIM** | A number produced by running the headless simulator in `sim/`. Reproducible from the files. Evidence about a coarse model with heuristic players. **Not validation with real children.** |
| **VERIFIED** | Read directly in a file; path given. |
| **UNVERIFIED** | Stated from memory; not confirmed here. Collected in section 20. |

"Spine S4" and similar point at `/tmp/claude-1000/-home-jack-Documents-Projects-space-tower-defence/21e4d7b3-740a-407a-9ce4-b4a3156f1b6c/scratchpad/spine.md` (VERIFIED: read in full; it is a v0.1 draft, so section 18 lists what this design needs added or confirmed there).

Files produced with this report, all in `/tmp/claude-1000/-home-jack-Documents-Projects-space-tower-defence/21e4d7b3-740a-407a-9ce4-b4a3156f1b6c/scratchpad/sim/`:

| File | What it is |
|---|---|
| `game_data.json` | Machine-readable version of ALL tables: simulation rules, map, colony, classes, combat rules, economy, aliens, caps, bosses, 50 waves, powers, endless formulas, badges, challenges, performance budget. |
| `make_data.py` | Authoring helper that writes `game_data.json` (compact wave definitions, the toughness curve, the frozen tuning output). |
| `sim.py` | The headless fixed-timestep simulator and the heuristic players. Python 3 standard library only. |
| `tune.py` | Measures the "margin" before every wave and, with `--adapt`, rescales waves to a target margin curve. Used to choose the numbers; not part of the game. |
| `run_matrix.py`, `results.json`, `results.md` | The scenario matrix (263 runs), its raw output and the result tables. |
| `selftest.py` | Invariant checks on the data and the simulator, and an independent check of the worked example's arithmetic. |
| `example.py` | The worked early-run example, executed through the simulator. |
| `tables.py`, `build_report.py`, `design.tmpl` | Table printer, report assembler and the text template of this document. |

---

## 1. The decisions that matter most

1. **One clock.** A fixed 60-tick-per-second simulation; 1x and 2x are "how many ticks per frame"; pause is zero ticks. Combat has no randomness. Attacks resolve in the tick they fire (there are no simulated projectiles).
2. **One route, 16 pads, opened in stages.** The route is 40 tiles long. Six good pads are open at the start and two more open with each new class (after waves 5, 10, 15, 20 and 25). The first screen stays simple for a five-year-old and every newly unlocked class has a free pad waiting. Fallback: open all 16 from wave 1, which is one data value per pad; in the simulator the naive player then gets less far (16.3).
3. **Unlock order kept as proposed**: Nova at the start, then Pip, Juno, Orion, Mira, Sol after waves 5, 10, 15, 20 and 25. The first four unlocks all add firepower, so a child who always buys "the new one" has attackers before the two non-attacking classes arrive.
4. **Small deployment caps keep the team mixed**: Pip 3, Juno 4, Orion 3, Mira 2, Sol 2; Nova uncapped.
5. **Credits come from two places only**: defeated aliens and successful normal learning activities (CONFIRMED prompt.md:447). No wave-clear bonus. A run starts with 150. The campaign offers 5037 credits of bounty and 2520 of learning rewards; the reference 16-astronaut level-3 board costs 6990.
6. **Selling returns 70% of everything paid for that astronaut, rounded down to a multiple of 5.** Sell-then-rebuy always loses credits (proof in 5.7).
7. **The colony has 20 health and up to 10 shield points.** Small aliens cost 1 health; the five bosses cost 8 / 10 / 12 / 14 / 20. A boss that gets through is a heavy blow, not an automatic defeat, except the last one against an unshielded colony.
8. **Six alien traits, each a single exact rule**: armour (flat reduction), bubble layers (absorb a number of hits), flying (halves Juno's blast), healer (shared 3-second pulse), splitter, carrier. Each rewards a different class without requiring it.
9. **Five bosses built only from those traits.** No new routes, projectiles or pad effects.
10. **Meteor powers follow a fixed rotation** (Frost Pulse, Comet Burst, Colony Shield, ...): one charge per successful meteor challenge, kept until used, at most two of each.
11. **Endless continuation is a pure function of the wave number**, built from waves 41-49 and the five bosses, with caps reached at waves 80 (speed), 101 (counts), 110 (boss health) and 120 (health).
12. **Simulator verdict against the design targets** (SIM, section 16). Competent player, 0% learning, no powers: clears wave 50 with 20 health; smallest margin 1.08. Competent, 60%: clears with 20 health. Naive child, 60%: clears between 32 and 50 waves over 20 seeds, median 42, and 20 of 20 reach wave 30. Every boss is beaten without powers and with any one class removed. The soft spots are listed plainly in 16.6.

---

## 2. Simulation rules

All PROPOSAL except where marked.

### 2.1 Time

- **Tick.** One simulation step is exactly 1/60 simulation second. Durations in the data are simulation seconds and are converted to whole ticks once, at load: `ticks = round(seconds * 60)`. Speeds are tiles per simulation second; movement per tick is `speed / 60`.
- **Battle speed.** The frame loop keeps an accumulator: `acc += realFrameSeconds * speedFactor`, with `speedFactor` 1 or 2; while `acc >= 1/60` it runs one tick and subtracts 1/60. At most 8 ticks run per rendered frame and anything left over is discarded, so a slow laptop plays in slow motion instead of falling ever further behind.
- **Pause** is zero ticks. Opening a dialog or learning panel, or hiding the page, pauses; returning stays paused until the player resumes (CONFIRMED prompt.md:273). Choosing a Comet Burst target also pauses, so aiming is untimed.
- **Frame rate never changes outcomes** (CONFIRMED prompt.md:303): damage, movement and rewards depend only on the tick count. The simulator gives the same result at 30 and 60 ticks per second (SIM, 16.5).
- **Preparation**: no ticks run and nothing is on a timer (CONFIRMED prompt.md:503: no countdown; Ready starts the wave).
- **Everything resets at wave start**: every attacker is ready to fire, Mira's recharge starts from zero, no alien or slow exists, per-wave power-use flags are cleared. So no timer or cooldown is ever part of a saved snapshot. This confirms the assumption written into spine S4.

### 2.2 Determinism and arithmetic

- Combat uses **no random numbers**. The same wave against the same board with the same commands on the same ticks always gives the same result (CONFIRMED intent prompt.md:409).
- Every alien gets a unique integer id in spawn order (CONFIRMED prompt.md:391). Ties are broken by "further along the route", then by lower id.
- Health, damage, credits, shield points, bounties and timers (in ticks) are integers. Route progress is fractional. If exact reproduction of a battle in another language is ever wanted (for example to share test replays between the TypeScript engine and a Python checker), progress can be held as a whole number of 1/10,000 tile; this design does not require it. The rounding rules, once:

| Quantity | Rule |
|---|---|
| Alien health in a wave | `max(1, floor(baseHealth * hpMult + 0.5))` |
| Sol buff on damage | `floor((damage * (100 + buffPct) + 50) / 100)` |
| Juno blast on a flying alien | `ceil(damage / 2)` |
| Armour | `max(1, damage - armour)` |
| Patchling heal | `floor(6 * hpMult + 0.5)`, never above maximum health |
| Comet Burst | `ceil(maxHealth * pct / 100)`, removed directly from health |
| Sell refund | `floor(floor(invested * 70 / 100) / 5) * 5` |

- Order of steps for one hit: base damage; Sol buff; flying halving (Juno only); a bubble layer absorbs the whole hit if one exists; armour; health.

### 2.3 What happens inside one tick

1. Apply queued player commands (place, upgrade, sell, change targeting, use a power) in the order they arrived. Each is validated against the state at that moment (credits, pad open and free, class unlocked, cap), so two quick clicks can never drive credits negative (AC-09).
2. Scheduled spawns that are due, then descendant releases that are due (both respect the caps in 6.3).
3. Support timers: Mira's shield pulses, the Patchling heal pulse.
4. Astronaut attacks in pad-id order, P01 to P16. A boss's phase change resolves at the moment the damage lands.
5. Alien movement in id order; an alien that reaches the end of the route leaks at once.
6. Defeat check (colony health 0 or less), then wave-complete check.

### 2.4 Attacks resolve instantly

An astronaut whose timer is ready and who has a target in range fires on that tick; the damage, slow or blast is applied on that same tick and the timer restarts. Beams, comets and star bursts are drawn afterwards and have no effect on the simulation.

Why: (1) nothing can be "wasted in flight", which would confuse a young player and complicate the rules; (2) the simulation then has only two kinds of entity, astronauts and aliens, which is much easier to write, test and keep deterministic in a first game; (3) at 2x the cosmetic effects simply play faster and combat stays readable (CONFIRMED need prompt.md:303). The price is that a comet visibly lands a moment after its damage; Juno's effect should therefore be a very short streak plus an impact ring drawn at the exact blast radius.

An astronaut that was idle fires on the first tick a target comes into range. Upgrading does not reset an attack timer. A newly placed attacker is ready at once; a newly placed Mira starts a full recharge, so re-placing her can never speed up shield pulses.

---

## 3. Map

### 3.1 Space and route

- Logical space is a grid of 20 by 11 tiles. Coordinates are tile-centre coordinates: x from 0 (left) to 19, y from 0 (top) to 10. One unit is one tile. The angled 2D look (CONFIRMED prompt.md:279) is a matter of art and projection; the rules work in this flat space, and range, blast and buff previews must be drawn by passing the logical circle through the same projection, so that the preview is the truth (CONFIRMED need prompt.md:331).
- One route (CONFIRMED prompt.md:281), authored as a polyline. Aliens appear at the portal at (0, 2); the colony gate is at (19, 3). Total length 40 tiles. Flying aliens follow exactly this polyline (CONFIRMED prompt.md:301).

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

"Route progress" is distance travelled along the polyline: 0 at the portal, 40 at the colony. An alien's position is a pure function of its progress.

The shape is a serpentine with three U-bends. Each bend has one pad from which three stretches of path are within short range. Those three PRIME pads are the obvious strong spots, and finding them is the first tactical lesson the map teaches.

### 3.2 Build pads

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

"Route in range r" is the length of route within r tiles of the pad centre; divide it by an alien's speed to get the seconds that alien spends in range. Every pad is exactly 2 tiles from the nearest stretch of route, so every attacker (shortest range 2.5) reaches the path from every pad. "Pads within 4.5 / 6.0" counts the other pads inside Sol's two buff radii.

**Range rule**: an alien is in range when the distance from the pad centre to the alien's point on the route is less than or equal to the range. Alien size is ignored.

### 3.3 Pads open in stages (PROPOSAL, with a fallback)

| When | Pads that open | Pads open in total | Class unlocked at the same moment |
|---|---|---|---|
| start of run | P02, P04, P05, P09, P12, P16 | 6 | Nova |
| after wave 5 (preparing wave 6) | P03, P13 | 8 | Pip |
| after wave 10 (preparing wave 11) | P08, P11 | 10 | Juno |
| after wave 15 (preparing wave 16) | P06, P07 | 12 | Orion |
| after wave 20 (preparing wave 21) | P01, P15 | 14 | Mira |
| after wave 25 (preparing wave 26) | P10, P14 | 16 | Sol |

Reasons:

- **A simple first screen.** A five-year-old sees six glowing pads, all of them good, not sixteen of very different quality. "Very hard to lose early" then holds even for random placement: the weakest of the six starting pads still has 5.5 tiles of route in range.
- **Every new class has somewhere to go.** A child who has filled every pad would otherwise meet a new astronaut with nowhere to put it, and nothing tells them they are allowed to sell. With staging, two fresh pads open at the same moment as each class and one of them suits it: P13 and P08 are PRIME pads that open with Pip and Juno; P06 and P07 are long-range perches for Orion; P15 is the balcony for Mira; P10 is the beacon mound for Sol.
- **No saved state.** Whether a pad is open is a function of the highest completed wave.
- **Evidence** (SIM, 16.3): with the same naive player at 60% learning, staged pads gave a median of 42 waves cleared; all 16 pads open from wave 1 gave 35.5. The competent player completes the campaign either way.

Fallback: set every pad's `opensAfterWave` to 0; nothing else changes. The spec says pads are "predefined" (CONFIRMED prompt.md:281) and says nothing about staged opening, so this is plainly my proposal.

---

## 4. The colony

| Rule | Value |
|---|---|
| Health | 20 (an integer). 0 or less is defeat, which is terminal for the run (CONFIRMED prompt.md:675). |
| Shield points | Separate from health, capped at 10. Leak damage comes off shield points first, then health. |
| Sources of shield | Mira's pulses (5.5) and the Colony Shield power (section 10). The power may lift the shield to an absolute cap of 20 for the rest of that wave; anything above 10 is removed when the wave ends. |
| Between waves | Health and shield carry over unchanged (both are in the snapshot). Nothing regenerates while preparing. |
| Repair | +3 health when a boss wave is completed, whether or not the boss was defeated; +1 health per completed wave while a level-3 Mira is deployed (at most 1 per wave in total). Never above 20. |
| Leak damage | Per alien type (section 6): 1 for small aliens, 2 for sturdy ones, 4 for an Alien Craft, 8 / 10 / 12 / 14 / 20 for the five bosses. |

No alien damages, disables or blocks an astronaut or a pad: nothing in this design lets anything except a player command change an astronaut (CONFIRMED prompt.md:297, AC-07).

Why 20 and these leak values: a child can let twenty Moon Blobs through over a run before losing, which is a great deal of forgiveness early on; and a boss leak of 8 to 14 leaves a healthy colony standing, so failing to stop a boss is a setback to recover from, not the end of a long run. The small repair after each boss makes clearing a boss feel good and gives a struggling player something back.

---

## 5. Astronaut roster

The six roles are CONFIRMED (prompt.md:305-355); the names are the spec's proposals; every number is an initial playtest setting.

### 5.1 Classes

| Name | Role | Unlocks | Deployment cap | Targeting options | Total cost to level 3 |
|---|---|---|---|---|---|
| Nova | Laser Scout | start | no cap | FRONT (default), FAST | 260 |
| Pip | Frost Explorer | after wave 5 | 3 | FRONT (default), FAST | 310 |
| Juno | Comet Engineer | after wave 10 | 4 | CROWD (default), FRONT | 500 |
| Orion | Orbit Ranger | after wave 15 | 3 | FRONT (default), STRONG from level 3 | 600 |
| Mira | Shield Specialist | after wave 20 | 2 | none (does not attack) | 620 |
| Sol | Beacon Commander | after wave 25 | 2 | none (does not attack) | 650 |

### 5.2 Levels, costs and values

| Class | Level | Cost of this level | Cumulative cost | Sell refund at this level | Range (tiles) | Attack period (s) | Damage per hit | Damage per second | Special values |
|---|---|---|---|---|---|---|---|---|---|
| Nova - Laser Scout | 1 | 50 | 50 | 35 | 2.5 | 1 | 10 | 10.0 | - |
|  | 2 | 60 | 110 | 75 | 2.5 | 0.6 | 10 | 16.7 | - |
|  | 3 | 150 | 260 | 180 | 3 | 0.6 | 16 | 26.7 | - |
| Pip - Frost Explorer | 1 | 60 | 60 | 40 | 2.5 | 0.8 | 5 | 6.2 | slow 30% for 3s (single target) |
|  | 2 | 80 | 140 | 95 | 2.5 | 0.8 | 6 | 7.5 | slow 40% for 4s (single target) |
|  | 3 | 170 | 310 | 215 | 2.5 | 0.8 | 7 | 8.8 | slow 40% for 4s to every alien within 1 tile of the target |
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

Each level changes something a child can see and a preview can show (AC-08): Nova fires faster at level 2, then reaches further and hits harder at 3; Pip's frost gets stronger and longer at 2 and becomes a small area at 3; Juno's blast ring grows at 2 and hits harder at 3; Orion reaches further at 2 and hits much harder at 3; Mira's pulses grow at 2 and quicken at 3, with a repair; Sol's bonus grows at 2 and its ring widens at 3. These follow the spec's level descriptions line by line (CONFIRMED prompt.md:312-314, 320-322, 328-330, 336-338, 344-346, 352-354).

### 5.3 Targeting

| Mode | Exact rule |
|---|---|
| FRONT | the alien in range that is furthest along the route (default for every attacking class) |
| FAST | the alien in range with the highest current speed; ties -> FRONT |
| CROWD | the alien in range with the most aliens inside the blast radius around it; ties -> FRONT |
| STRONG | the alien in range with the highest current health; ties -> FRONT (Orion from level 3) |

- Every attacking class defaults to a mode that is sensible if never touched; the naive simulated player never changes it.
- At most two modes per class, shown as two picture buttons. Orion gains STRONG at level 3 (CONFIRMED prompt.md:346).
- Pip, within its chosen mode, first prefers an alien that is not currently slowed, so it spreads its frost instead of re-freezing one alien.
- Juno defaults to CROWD because a blast centred on the front alien wastes the half of the circle that lies ahead of the group.

### 5.4 Pip's slow (CONFIRMED need: a cap and a stacking policy, prompt.md:323)

- A slow reduces an alien's speed by a percentage for a duration.
- **No stacking.** An alien has one slow at a time. A stronger slow replaces it, strength and duration both; an equally strong one keeps whichever remaining time is longer; a weaker one is ignored.
- **Cap: 50%.** No effect or combination may reduce speed by more than half, so no alien can ever be stopped. Pip reaches 40%; Frost Pulse reaches the cap.
- **Bosses take slows at half strength** (Pip 15% or 20%, Frost Pulse 25%), so slowing is an advantage against bosses without becoming the required answer.
- A bubble layer absorbs Pip's damage but the slow still applies.

### 5.5 Mira's shield and repair (CONFIRMED need: no unlimited stacking or invulnerability, prompt.md:339)

- Every `period` seconds of wave time each Mira adds her shield points to the colony shield, up to the cap of 10. The first pulse comes one full period after the wave starts, or after she is placed.
- At most 2 Miras. Two level-3 Miras add at most 20 shield points a minute and the shield never holds more than 10; shields soak up a trickle of leaks but cannot save a colony from a wave that is getting through.
- Level 3 also repairs 1 health when a wave is cleared; total Mira repair is capped at 1 per wave however many Miras there are.
- Mira needs no range and no view of the path; any pad will do.

### 5.6 Sol's buff (CONFIRMED need: strongest wins, no loops, prompt.md:355)

- Sol adds a percentage to the damage of Nova, Pip, Juno and Orion standing on pads whose centres are within Sol's radius of Sol's pad.
- An astronaut in range of two Sols gets only the larger percentage. Sol does not buff Sol, Mira or itself, and Sol's strength depends only on its own level, so there is no recursion.
- The buff changes damage only: not range, rate, slow strength, shield pulses or bounties.

### 5.7 Selling

- Selling removes the astronaut and returns `floor(floor(invested * 70 / 100) / 5) * 5` credits, where `invested` is the purchase price plus every upgrade paid for that astronaut. The refund at each level is a column of the roster table.
- Selling and placing are separate transactions (CONFIRMED prompt.md:281). The interface may offer them back to back as a "swap", but the rules see a sale followed by a purchase.
- **Proof that selling and re-buying cannot create credits.** Let W = credits + the sum of `invested` over all deployed astronauts. Placing and upgrading move credits into `invested`, so W is unchanged. Selling removes `invested` and returns a refund of at most 0.7 * invested, which is less than `invested`, so W falls by at least 30% of that astronaut's cost. No shop action raises W; only bounties and learning rewards do. After any sequence of sales and purchases the player therefore holds no more than before, and strictly less if anything was sold. W is also exactly the quantity the server bounds in spine S6 rule 1. `selftest.py` runs 20,000 random shop actions and checks that W never rises and credits never go negative (SIM: passes).

### 5.8 Deployment caps

| Class | Cap | Why |
|---|---|---|
| Nova | none | Always available, so a free pad can always be filled and no cap can leave a child with nothing to buy. |
| Pip | 3 | Slows do not stack; three Pips already cover the three bends. |
| Juno | 4 | One per PRIME pad plus one. |
| Orion | 3 | One per inner pad. |
| Mira | 2 | Stops shield stacking drifting towards invulnerability. |
| Sol | 2 | Strongest-wins already limits it; a second Sol only helps a different part of the map. |

The cap appears on the class card as a small row of tokens ("three Orion badges, one left").

Why cap Juno and Orion at all: while tuning without caps, the simulator's player ended up with one-class boards, first seven Junos doing most of the damage and, after I toned Juno down, mostly Orions. Those intermediate runs are not among the saved results, so treat that sentence as my observation rather than reproducible evidence. Caps are the most direct and most child-readable way to keep a team mixed.

### 5.9 Why this unlock order (CONFIRMED need to choose and explain, prompt.md:357)

| Unlock | Arrives for | What it adds at that moment | How it supports the bosses |
|---|---|---|---|
| Nova, start | waves 1-5 (Moon Blobs, Meteor Mites) | Dependable single-target damage; the only class the first block needs. | King Wobble can be beaten with Nova alone. |
| Pip, after wave 5 | Shellbacks from wave 6 | The first support choice (the spec's block 1-9 names "early support choices", CONFIRMED prompt.md:413): slowed aliens take more hits from everyone nearby. | King Wobble spends longer under fire, at half strength. |
| Juno, after wave 10 | tight groups (wave 11), swarms (wave 13) | Area damage; PRIME pad P08 opens with her. | Clears Captain Clank's Meteor Mite escort. |
| Orion, after wave 15 | the Shellback parade (wave 16) | A heavy shot that armour barely dents, and reach across half the map. | Captain Clank (armour 5 at first) and every later boss: a slow single target stays inside Orion's range for most of its walk. |
| Mira, after wave 20 | healers, splitters and carriers (waves 21-29) | Insurance, just as there start to be more ways for something to slip through. | Softens a boss leak at 30, 40 and 50. |
| Sol, after wave 25 | the second half | A multiplier, once there are ten or more attackers to multiply. | Queen Bubbla onwards. |

Alternatives considered and rejected: **Mira earlier** (a child who buys the newest class would spend on a non-attacker while firepower is thin; and in the simulator the naive player, with powers unused, defeated the first two bosses in every seed without any shield class); **Orion before Juno** (groups arrive before heavy armour does, and one slow heavy shot is the weakest answer to a swarm).

No boss requires a class: section 16.4 gives the boss-wave margin of boards built with each class removed in turn, and of a Nova-only board.

---

## 6. Aliens

The nine catalogue entries are CONFIRMED as a list (prompt.md:365-381; names after the first four are the spec's proposals). Statistics and trait rules are initial playtest settings.

### 6.1 Catalogue

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

- **Health** in a wave is the base health times that wave's health multiplier (section 8). **Speed** is the base speed times the wave's speed multiplier. Armour, bubble layers, leak damage and bounty do not scale.
- **Bounty** is paid once, when the alien is defeated by any means. An alien that reaches the colony pays nothing.
- Defeat is a burst of stars; each trait has a silhouette or motion cue, so colour is never the only signal (CONFIRMED prompt.md:299).
- "Bubble Swarm" is the catalogue name for a cluster; each bubble is an ordinary alien with its own id, health and bounty.

Why these trait rules: each gives some class an advantage without shutting any class out.

| Trait | Rewards | Everything else still works |
|---|---|---|
| Armour 4 (Shellback) | Big hits: Orion loses 8% of a 50-damage shot, a level-1 Nova loses 40%. | Every hit does at least 1; a level-3 Nova keeps 75%. |
| Bubble layers (Bubble Guard) | Fast hitters and blasts: each hit of any size pops one layer. | Orion pops a layer too; it merely spends a big shot doing so. |
| Flying (Orbit Flutter) | Aimed shots: Nova, Pip and Orion are unaffected. | Juno still does half damage. |
| Small and many (Bubble Swarm, Meteor Mite) | Juno's blast. | Nova pops one bubble per shot. |
| Healer (Patchling) | Burst and area damage that catches the Patchling with its patients. | The heal is small and never stacks. |

### 6.2 Carriers and splitters (CONFIRMED rules prompt.md:387-401)

- When a Split Slime or an Alien Craft is **defeated**, its descendants are queued at the parent's route progress and released one every 0.25 s from that exact point, the first on the next tick. Releasing them one at a time stops them sitting exactly on top of each other while still spawning every one at the parent's progress.
- Each descendant is a normal alien with a new unique id and its own bounty. Parent and descendant bounties are separate lines of the catalogue: a Craft pays 6 and each of its Moon Blobs pays 4; a Split Slime pays 3 and each Slimelet pays 1.
- A carrier or splitter that **reaches the colony** applies its own leak damage and releases nothing (CONFIRMED prompt.md:399).
- A wave may name a Craft's cargo (waves 38, 43 and 47 do). Cargo may not contain Crafts or Split Slimes. Slimelets never split. Only a boss release may contain Split Slimes. So descendants are never more than two generations deep.
- **A wave is complete only when** the schedule is exhausted, no release is queued, and no alien is active (CONFIRMED prompt.md:393, AC-10). `selftest.py` checks over a whole campaign that defeated plus leaked equals spawned in every wave, and that bounty earned equals bounty available whenever nothing leaked (SIM: passes).
- **No duplication on pause, reload or retry** (CONFIRMED prompt.md:397): pause runs zero ticks, and nothing is saved during a wave. A reload or a save-and-exit returns to the wave-start snapshot, and the whole wave, ids included, is generated again from the same definition (spine S3.2).

### 6.3 Caps (CONFIRMED need prompt.md:401, 405)

| Limit | Value |
|---|---|
| Maximum active aliens (hard cap, descendants included) | 60 |
| Scheduled spawns wait while this many aliens are active (soft cap) | 48 |
| Maximum live descendants | 24 |
| Gap between descendants released by one parent | 0.25s |
| Minimum gap between deferred scheduled spawns | 0.25s |
| Maximum descendant depth | 2 |

What happens at a cap: a scheduled spawn that is due while 48 or more aliens are active **waits**; waiting spawns are released in schedule order, at most one every 0.25 s, as room appears. A descendant release waits at its parent's defeat position while 60 aliens are active or 24 descendants are alive. Nothing is ever dropped, duplicated or re-priced, so the bounty a wave offers is a constant. The 12-alien gap between the two limits is headroom reserved for descendants.

In the authored campaign the caps are a safety net: the worst peak in any simulated campaign scenario was 44 aliens (wave 37) and the most live descendants at once was 10 (SIM). In endless mode these caps, with the bound on scheduled spawns per wave, are what keep object counts bounded.

### 6.4 "No enemy may require a class that is not yet unlocked" (CONFIRMED prompt.md:301)

By construction: before wave 6 only Moon Blobs and Meteor Mites appear and only Nova exists; a Shellback (wave 6) still takes 6 damage from each level-1 Nova hit; a wave-8 swarm bubble pops to one Nova shot; flying affects only Juno; bubble layers and healing treat every class alike or favour the fast ones. By simulation: a Nova-only player cleared 50 waves, and the campaign is completed with any single class removed (SIM, 16.4).

---

## 7. Bosses

Proposal names, all built from the catalogue's traits. They obey the same rules as every alien: they walk the one route, never damage, disable or block astronauts or pads, and fire nothing (CONFIRMED prompt.md:403).

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

Rules:

- Boss health is an absolute number; it is **not** multiplied by the wave's health multiplier. Escorts, and anything a boss releases, are ordinary aliens of that wave and are multiplied.
- A phase begins the moment the boss's health falls to or below its threshold. If one hit crosses two thresholds, both phases' actions run, in order. Phase actions run before the defeat check, so a boss's releases can never be skipped and the bounty a boss wave offers is a constant.
- "Gains N bubble layers" sets the boss's layers to N. "Gives 1 bubble layer" raises every non-boss alien within the radius to at least 1 layer. This is the spec's "enemy shields help other aliens" (CONFIRMED prompt.md:297) in its simplest form.
- Releases follow the descendant rules in 6.2 and count towards the same caps.
- Slows work at half strength on bosses.
- **A boss that reaches the colony** applies its leak damage, is removed, pays no bounty and releases nothing more. The wave still completes when everything else is resolved, and the run continues if the colony has health left.
- Completing a boss wave repairs 3 health.
- The visual cues are part of the definition: every phase change must be readable from shape and motion (plates falling off, a door opening, a colour change with steam), not from a number.

For the competent player at 0% learning the five boss waves last 50 / 58 / 62 / 75 / 92 seconds at 1x, all inside the guide of about 150 s, and their margins are 2.07 / 1.63 / 1.56 / 1.3 / 1.16 (SIM).

---

## 8. The 50-wave campaign

CONFIRMED structure: 50 authored waves; bosses on 10, 20, 30, 40 and 50; one fixed route; new enemies introduced gently; later challenge mainly from more aliens, faster aliens and stronger combinations (prompt.md:385, 405, 409-433).

### 8.1 How to read the table

- **Spawn groups**: `count type @start every spacing`. A group's first alien appears `start` seconds after the wave begins and the rest follow at the stated spacing. Groups overlap freely; that is how combinations are authored. Nothing is random.
- **Modifiers**: the wave's health multiplier ("toughness") and, from wave 31, its speed multiplier. Toughness rises in straight lines between anchors (x1 at wave 1, x1.4 at wave 10, x3.2 at 20, x4.8 at 30, x6 at 40, x7 at 50), rounded to 0.05. Speed is x1 up to wave 30 and then rises by 0.05 every four waves to x1.25.
- **Aliens scheduled (with descendants)**: the bracketed number also counts everything a splitter, carrier or boss can release.
- **Total bounty available**: the credits on offer if nothing leaks. This is `maxBounty[w]` for the server-side bound in spine S6.
- **Duration** and **peak concurrent aliens** are simulator outputs (SIM): duration for the competent player at 0% and at 60% learning; peak for the competent player at 0%, and the worst peak seen in any campaign scenario, naive player included.
- **Margin**: the largest factor by which every health value in that wave could be multiplied before the competent player's board (0% learning, no powers, no purchases during the wave) lets its first alien through. 2.0 means "could be twice as tough"; 1.08 is thin.

### 8.2 The schedule, one row per wave

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

### 8.3 How the schedule was built

1. I wrote each wave's composition and timing by hand to follow the spec's blocks: waves 1-9 placement and basics; 11-19 flying, shields and group combinations; 21-29 healers, splitters and carriers; 31-39 denser and faster; 41-49 escalation.
2. Each new alien first appears **alone and in small numbers**: Meteor Mite (wave 3), Shellback (6), Bubble Swarm (8), Orbit Flutter (12), Bubble Guard (14), Split Slime (24), Alien Craft (27). The Patchling (22) arrives with Moon Blobs only, because a healer alone has nobody to heal. These introduction waves are deliberately left much easier than their neighbours (margins from about 2 up to 9).
3. The wave after each boss shows off the class that has just unlocked against familiar aliens: tight groups for Juno in wave 11, a Shellback parade for Orion in wave 16.
4. `tune.py` then scaled the **counts** of each ordinary wave, keeping its time span, and set each **boss's health**, so that the competent player's margin follows a target curve: about 4 at wave 1, 2.6 at wave 9, 2.0 at wave 19, 1.55 at wave 29, 1.28 at wave 39 and 1.10 at wave 49, with boss waves set a little below their neighbours. Finally, by hand, I eased wave 48 slightly and lowered the health of the last three bosses (16.4 says why), which is why those three boss waves now sit level with their neighbours rather than below them. Counts were preferred to toughness as the lever because the spec asks for "more aliens" first (CONFIRMED prompt.md:405).
5. The result is a sawtooth: boss, then a gentler wave with a new toy, a build-up, and the next boss.

The margin curve is the real design decision; the counts are its consequence. It is deliberately very generous early and thin only at the end, because a defeat is terminal (CONFIRMED prompt.md:675) and would send a small child back to wave 1 of a campaign with about 40.4 minutes of combat alone.

---

## 9. Economy

### 9.1 Rules

| Rule | Value | Status |
|---|---|---|
| Starting credits | 150: exactly three Novas | PROPOSAL (a fixed allowance is CONFIRMED prompt.md:447) |
| Sources of credits | Bounties from defeated aliens; one reward per successful normal learning activity | CONFIRMED prompt.md:447 |
| Wave-clear bonus | **None** | PROPOSAL (decision below) |
| Meteor challenge reward | A power charge, never credits | CONFIRMED prompt.md:439 |
| Wrong answers | Cost nothing, neither credits nor health. Three wrong answers end the activity with no reward. | CONFIRMED prompt.md:451 |
| Activities per interval | One normal activity, so rewards cannot be farmed | CONFIRMED prompt.md:453 |
| Same at every age | Combat data, prices, bounties and rewards contain no age input at all | CONFIRMED prompt.md:449, AC-13 |
| On defeat or a fresh restart | Credits back to 150, only Nova available, board empty, powers gone, six pads open. Best completed wave, badges and learning summaries are kept. | CONFIRMED prompt.md:455-465, AC-14 |
| Wallet | None. Credits belong to one run and are never shared between saved runs. | CONFIRMED prompt.md:447, 467 |
| Selling | 70% of everything paid, rounded down to 5 (5.7) | PROPOSAL |

**No wave-clear bonus: why.** The spec names two sources of credits and I see no reason to add a third. A bonus would also weaken the link the game is built on: learning is how you get ahead. The usual argument for a clear bonus is to stop a struggling player spiralling, since leaked aliens pay nothing and a weak board therefore earns less. Here that job is done by things already in the design: the learning reward does not depend on how the last wave went; early margins are very wide; clearing a boss repairs the colony; and Mira exists. It also keeps the server's bound to one line (spine S6 rule 1).

### 9.2 Learning rewards

| Interval | Credits for a successful normal activity (same for every age) | Intervals | Credits in block at 100% | Mean bounty of the following waves | Reward as a share of that bounty |
|---|---|---|---|---|---|
| after waves 1-9 | 30 | 9 | 270 | 39 | 76% |
| after waves 10-19 | 40 | 10 | 400 | 71 | 56% |
| after waves 20-29 | 50 | 10 | 500 | 86 | 58% |
| after waves 30-39 | 60 | 10 | 600 | 139 | 43% |
| after waves 40-49 | 75 | 10 | 750 | 170 | 44% |
| Total |  | 49 | 2520 |  |  |

The reward for the activity after wave w depends on w alone and is pinned on the slot when the run is created (spine S3.3). It is the same number for a five-year-old counting stars and a seven-year-old doing number bonds (CONFIRMED Example A, prompt.md:1110-1124).

### 9.3 Income curves

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

The 60% column is an expected value. Bounty assumes nothing leaks; a board that leaks earns less.

### 9.4 Where the credits go

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

- At 0% learning a perfect player ever holds 150 + 5037 credits, about three quarters of the reference board. In the simulator the competent player had 4570 invested at the end of wave 50 and completed the campaign (SIM).
- At 60% the competent player had 6030 invested. At 100% it had the whole reference board (6990), completed at wave 49 (SIM).
- So learning is worth about half as much again as combat income. It never gates progress; it speeds it up. That is the intended reading of "optional bonuses should make play more rewarding without an unrecoverable question-failure lock" (CONFIRMED prompt.md:451).

### 9.5 Purchasing power of one correct answer

| Interval | Reward | Share of a new Nova (50) | Share of the newest class at level 1 | Share of a Nova level-2 upgrade (60) | Share of a Nova level-3 upgrade (150) |
|---|---|---|---|---|---|
| after waves 1-9 | 30 | 60% | Nova: 60% | 50% | 20% |
| after waves 10-19 | 40 | 80% | Juno: 36% | 67% | 27% |
| after waves 20-29 | 50 | 100% | Mira: 31% | 83% | 33% |
| after waves 30-39 | 60 | 120% | Sol: 40% | 100% | 40% |
| after waves 40-49 | 75 | 150% | Sol: 50% | 125% | 50% |

Read with the reward table: early on, one correct answer is worth three quarters of the next wave's whole bounty and more than half a new astronaut, so a child feels it at once. Later it is a little under half a wave's bounty and pays for a Nova's level-2 upgrade outright or half of its level 3. Prices rise with the classes (a level-3 Orion costs as much as twelve Novas), so the reward is stepped up block by block to stay meaningful. It is deliberately not scaled wave by wave, so that it is easy to say ("30 credits for a right answer") and easy for the server to check.

Roughly one purchase per wave is affordable throughout, a little more with good answers. Prices are multiples of 10 and bounties are small whole numbers, but a five-year-old should never need the arithmetic: a card is lit when it is affordable and, when it is not, shows how many more credits are needed.

---

## 10. Meteor powers

CONFIRMED: optional extra challenges after waves 9, 19, 29, 39 and 49, additional to the normal activity and with separate ids; success gives a temporary power useful for the boss; failing or declining must not make the boss unwinnable; powers belong to the run (prompt.md:439-441, 1156-1166).

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

Decisions and reasons:

- **A fixed mapping, not a choice.** Each meteor slot awards a named power, in a repeating order. A choice screen is one more decision for a young child just before a boss; and a fixed reward can be pinned on the slot when the run is created, which is what spine S3.3 and S6 rule 4 expect. The order starts with the power that needs no aiming (Frost Pulse), then introduces aiming (Comet Burst), then the shield, by which time Mira has shown what shields are.
- **Unused charges are kept** for the rest of the run, up to two of each. A child who forgets to press the button has not lost the reward. Charges are run resources: gone on defeat, abandon or a fresh run (CONFIRMED prompt.md:463), and restored with the wave-start snapshot if a wave is abandoned part-way (CONFIRMED Example E, prompt.md:1168-1180).
- **Each power once per wave**, with a 3-second lockout between powers, which mostly guards against double presses. Because limits are per wave, nothing about powers needs saving except the charge counts.
- **Comet Burst always lands on the route.** The target ring snaps to the nearest point of the path, so mouse and keyboard do the same thing and a click can never miss the only place aliens can be. With the keyboard the ring starts on the front-most alien and slides along the path.
- **Percentage damage** for Comet Burst means one definition serves wave 10, wave 50 and endless mode, with no per-charge "tier" to store.
- Keys 1, 2 and 3 act only while the battlefield has focus, never while a learning answer is being typed (CONFIRMED prompt.md:273).

**Every boss is beatable without any power** (SIM): the competent player defeats all five with powers unused at 0%, 60% and 100% learning (16.2), and the boss-wave margins in 16.4 are all measured without powers. In the model, powers changed nothing for the competent player, who never needed them, and helped the naive player a little (16.3).

---

## 11. Endless continuation

CONFIRMED: optional, offered after the campaign badge is committed; a later defeat keeps the badge and the best completed wave; explicit limits so that "endless" never means unlimited objects; the normal activity precedes wave 51 (prompt.md:405, 435, 519, 1194-1202).

### 11.1 Generator

- Wave n >= 51 is a **pure function of n**: no seed and no randomness. Every run meets the same endless waves, and the server can compute the bounty bound for any n.
- With j = (n - 50) mod 10: for j = 1 to 9 the wave uses the spawn groups of authored wave 40 + j; for j = 0 (waves 60, 70, 80, ...) it is a boss wave. The five bosses come round in order, each with its own campaign escorts.
- Health, speed and counts follow the formulas below. Each has a cap.

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

### 11.2 Rewards

- Bounties are the catalogue values; an endless boss pays 100.
- The normal activity before each endless wave pays 75 credits, the value of the last campaign block. A meteor challenge precedes each endless boss (slots M-059, M-069, ...) and continues the same power rotation.
- Offline, the supply of prepared activities is finite; when it runs out the run waits at a preparation boundary (CONFIRMED prompt.md:721). That belongs to the content and offline sections; nothing here needs more than one activity per interval.

### 11.3 Plateau, and what the simulator shows

- From wave 120 every cap has been reached. From then on wave n and wave n + 50 are identical for ever, because templates repeat every 10 waves and bosses every 50. Nothing grows.
- At most 110 scheduled spawns per wave, 60 active aliens, 24 live descendants and 16 astronauts: object counts are bounded whatever the wave number.
- SIM: the competent player, by then holding the whole reference board, was defeated after clearing wave 87 at 0% learning, 95 at 60% and 95 at 100%; the peak was 47 aliens and no spawn had to wait for a cap. So with these formulas a strong board falls before the plateau, which also bounds how long an endless run, and its stored activity slots, can become. Whether that is the right length is a playtest question.
- **Open point, stated plainly.** Once the board is complete (wave 49 at 100% learning in the simulator), credits have nothing left to buy, in the last waves of the campaign and throughout endless mode. Learning rewards then stop changing the game. I have not added a credit sink (a paid colony repair, say), because that would be a new feature. If playtests show motivation dropping there, it is the first thing to consider, as a labelled scope change.

---

## 12. Badges

All badges are positive, personal and permanent. None compares players, ranks anyone or can be lost (CONFIRMED exclusions prompt.md:155). "Idempotent" means the award is a set-add of the badge id to the profile: applying it twice changes nothing (spine S7).

| Badge id | Name (proposal) | Exact award rule (idempotent: set-add of the badge id) | Permanent progression |
|---|---|---|---|
| first-steps | First Steps | highestCompletedWave >= 1 on any campaign run (awarded in COMPLETE_WAVE). | yes |
| boss-1 | Wobble Stopper | COMPLETE_WAVE for campaign wave 10. | yes |
| boss-2 | Clank Cracker | COMPLETE_WAVE for campaign wave 20 (same event records next-planet eligibility). | yes |
| boss-3 | Bubble Popper | COMPLETE_WAVE for campaign wave 30. | yes |
| boss-4 | Mothership Mover | COMPLETE_WAVE for campaign wave 40. | yes |
| campaign-luna-1 | Colony Hero | COMPLETE_WAVE for campaign wave 50; committed before the endless offer is shown. | yes |
| endless-60 | Star Voyager | COMPLETE_WAVE for endless wave 60. | yes |
| full-crew | Full Crew | A wave-start snapshot (START_WAVE) contains at least one astronaut of each of the six classes. | yes |
| top-team | Top Team | A wave-start snapshot contains at least one level-3 astronaut. | yes |
| safe-and-sound | Safe and Sound | COMPLETE_WAVE for a campaign boss wave (10/20/30/40/50) whose post-wave snapshot health is not lower than the health in that wave's start snapshot. | yes |
| meteor-catcher | Meteor Catcher | Any meteor slot resolves SUCCEEDED. | yes |
| bright-spark-10 | Bright Spark | Lifetime count of SUCCEEDED normal activities (sum of the learning summaries) reaches 10. | yes |
| bright-spark-50 | Brilliant Spark | Lifetime count of SUCCEEDED normal activities reaches 50. | yes |
| all-rounder | All-Rounder | Learning summaries show at least 5 SUCCEEDED activities in each of maths, phonics and spelling. | yes |
| keep-trying | Keep Trying | A slot resolves SUCCEEDED on its second or third attempt. | yes |
| challenge-blob-parade | Parade Marshal | Final wave of challenge 'blob-parade' completed. | yes |
| challenge-bubble-trouble | Bubble Wrangler | Final wave of challenge 'bubble-trouble' completed. | yes |
| challenge-wobble-rematch | Boss Buddy | Final wave of challenge 'wobble-rematch' completed. | yes |

Notes:

- Every rule is a condition on data the server already receives in an accepted operation (a completed wave number, a wave-start or post-wave snapshot, a slot resolution, a learning-summary counter), so no badge depends on unverifiable events inside a wave.
- `campaign-luna-1` is committed in the operation that completes wave 50, before the endless offer is shown (CONFIRMED prompt.md:435, AC-12). `boss-2` shares its event with next-planet eligibility (CONFIRMED prompt.md:419, 437).
- "Keep Trying" rewards persistence after a wrong answer. Nothing rewards speed, because activities are untimed (CONFIRMED prompt.md:503).
- All of them are permanent progression: they survive defeat, abandon and new runs. What "reset campaign progression" does to them is the lead's decision.

---

## 13. Standalone short challenges

CONFIRMED: they reuse the same game and activity systems with a short configured wave set and must not become a sandbox or a second engine (prompt.md:443).

| Id | Name | Campaign waves reused (in order) | Classes available | Starting credits | Astronauts already placed | Pads | Learning reward per interval | Meteor challenge | About |
|---|---|---|---|---|---|---|---|---|---|
| blob-parade | Blob Parade | 1, 2, 4, 5, 7 | Nova | 150 | none | pads open as when preparing wave 1 | 30 | no | Five gentle waves with only Nova on the six starting pads: a first taste, or a quick go. |
| wobble-rematch | Wobble Rematch | 7, 9, 10 | Nova, Pip | 200 | Nova L1 on P04, Nova L1 on P05, Nova L1 on P09, Nova L1 on P12 | pads open as when preparing wave 10 | 30 | yes: before the last wave, awards Frost Pulse | The team is already at its posts. Two warm-up waves, an optional meteor challenge for a Frost Pulse, then King Wobble. |
| bubble-trouble | Bubble Trouble | 8, 13, 14, 17, 18, 19 | Nova, Pip, Juno | 250 | Nova L1 on P02, Nova L1 on P04, Juno L1 on P05, Nova L1 on P09, Nova L1 on P12, Pip L1 on P13, Nova L1 on P16 | pads open as when preparing wave 16 | 40 | no | A ready-made team with one Juno and one Pip. Six waves of swarms, Bubble Guards and groups. |

What a challenge **is**: a run whose wave list is a short list of references to authored campaign waves (the same spawn groups at the same toughness), with its own starting snapshot: credits, classes, open pads and, for two of them, astronauts already at their posts. Everything else is the campaign's machinery unchanged: the same simulation, shop, sell rule and caps; one normal activity per interval with three attempts; the same save, suspend and defeat rules.

What a challenge **awards**: its own badge, the first time its last wave is completed; and learning-summary counts for each activity resolved in it, exactly as anywhere else (so those answers also count towards the Bright Spark badges).

What a challenge **does not award or touch**: campaign best wave, boss badges, the campaign badge, next-planet eligibility, any credits or powers outside the challenge, any other run. It cannot continue into endless mode. Losing one costs nothing beyond the challenge itself.

They are meant to be low-stakes. In the simulator the naive player cleared all three in every seed (SIM, 16.5). The two that start in mid-campaign begin with a ready-made board, because a child who places a single astronaut against wave 7 would otherwise lose at once.

---

## 14. Performance budget (feeds AC-42)

CONFIRMED: aim for smooth 60 fps with a measured minimum under the busiest authored wave; define and cap or pool an enemy, projectile and particle budget; simulation independent of frame count; no React re-render per frame (prompt.md:1030-1048). No frame rate has been measured. These are budgets to test against.

| Budget item | Proposed maximum |
|---|---|
| Active aliens (simulation entities) | 60 |
| Astronauts | 16 |
| Beam / comet-streak effects alive at once (pooled) | 32 |
| Blast-ring / frost-ring effects alive at once (pooled) | 16 |
| Particles alive at once (pooled; 8 per star burst) | 240 |
| Floating reward texts alive at once (pooled) | 24 |

- There are **no simulated projectiles** (2.4). What a player would call projectiles are render-only effects with fixed lifetimes, drawn from pools: a beam or comet streak (about 0.15 s), a blast or frost ring (about 0.3 s), a star burst of 8 particles (about 0.5 s), a floating "+4". When a pool is empty the oldest effect is recycled or the new one is skipped. The simulation never waits for, or reads, an effect.
- Alien sprites and health bars are pooled too: 60 are created once per battle scene and reused.
- The simulation itself is small: at most 16 astronauts checking at most 60 aliens when ready to fire.

Busiest authored waves in the simulator (SIM):

| Wave | Aliens scheduled | With descendants | Peak concurrent aliens (competent, 0%) | Worst peak in any campaign scenario | Worst peak of live descendants | Most astronaut shots in one second |
|---|---|---|---|---|---|---|
| 37 | 46 | 46 | 39 | 44 | 0 | 21 |
| 31 | 62 | 62 | 29 | 43 | 0 | 21 |
| 42 | 46 | 58 | 28 | 43 | 8 | 22 |
| 48 | 55 | 63 | 32 | 42 | 8 | 28 |
| 33 | 71 | 79 | 33 | 41 | 8 | 18 |
| 39 | 45 | 49 | 27 | 41 | 4 | 22 |

- The highest peak for the competent player was 39 aliens (wave 37); the highest in any campaign scenario was 44 (wave 37), where a weak board lets aliens pile up. The most astronaut shots in any one second was 28.
- **Proposed AC-42 measurement**: (a) play wave 37 at 2x on the reference laptop with a deliberately weak board, so the alien count is at its worst, and record the minimum and the 1%-low frame rate; (b) a synthetic scene with 60 aliens, 16 level-3 astronauts and every effect pool full, as the hard upper bound. The target figure is for the plan to set after the first prototype measurement.

---

## 15. Worked early-run example (waves 1-6)

Executed by `example.py` through the simulator, so the arithmetic and the outcomes are the model's own (SIM); `selftest.py` recomputes the credit totals straight from the data tables and checks they agree. All values are proposals.

**The same table applies to a five-year-old and to a seven-year-old.** Starting credits, class availability, aliens, bounties, prices and learning rewards are identical; the only difference is what is inside each activity slot (CONFIRMED Example A, prompt.md:1110-1124; AC-13).

### 15.1 Every activity answered correctly (on any of the three attempts)

| Wave | Credits at start of interval | Learning activity (identical reward for every age) | Purchases before Ready | Credits at Ready | Aliens | Bounty earned | Credits after wave | Leaks | Colony health |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 150 | - | Place Nova (Laser Scout) on P05: -50; Place Nova (Laser Scout) on P09: -50; Place Nova (Laser Scout) on P12: -50 | 0 | 6 Moon Blob | +24 | 24 | 0 | 20 |
| 2 | 24 | Activity after wave 1 (subject: maths), slot N-001: correct, +30 | Place Nova (Laser Scout) on P04: -50 | 4 | 8 Moon Blob | +32 | 36 | 0 | 20 |
| 3 | 36 | Activity after wave 2 (subject: phonics), slot N-002: correct, +30 | Upgrade Nova on P05 to level 2: -60 | 6 | 8 Meteor Mite | +16 | 22 | 0 | 20 |
| 4 | 22 | Activity after wave 3 (subject: spelling), slot N-003: correct, +30 | Place Nova (Laser Scout) on P16: -50 | 2 | 7 Moon Blob, 4 Meteor Mite | +36 | 38 | 0 | 20 |
| 5 | 38 | Activity after wave 4 (subject: maths), slot N-004: correct, +30 | Upgrade Nova on P09 to level 2: -60 | 8 | 9 Moon Blob, 5 Meteor Mite | +46 | 54 | 0 | 20 |
| 6 | 54 | Activity after wave 5 (subject: phonics), slot N-005: correct, +30 | Place Pip (Frost Explorer) on P13: -60 | 24 | 3 Shellback | +15 | 39 | 0 | 20 |

Board at the end: Nova on P04, P12 and P16 at level 1; Nova on P05 and P09 at level 2; Pip on P13. 39 credits in hand going into the activity after wave 6.

One line checked by hand: after wave 3 the player has 22 credits; the spelling activity pays 30, making 52; a Nova costs 50, leaving 2; wave 4 has 7 Moon Blobs at 4 credits and 4 Meteor Mites at 2, which is 28 + 8 = 36; and 2 + 36 = 38.

### 15.2 The six activity slots

| Slot | Shown after wave | Subject (rotation: maths, phonics, spelling) | Reward on success | Age-5 content | Age-7 content |
|---|---|---|---|---|---|
| N-001 | 1 | maths | 30 | supplied by the learning-content section | supplied by the learning-content section |
| N-002 | 2 | phonics | 30 | supplied by the learning-content section | supplied by the learning-content section |
| N-003 | 3 | spelling | 30 | supplied by the learning-content section | supplied by the learning-content section |
| N-004 | 4 | maths | 30 | supplied by the learning-content section | supplied by the learning-content section |
| N-005 | 5 | phonics | 30 | supplied by the learning-content section | supplied by the learning-content section |
| N-006 | 6 | spelling | 30 | supplied by the learning-content section | supplied by the learning-content section |

There is no activity before wave 1 (CONFIRMED prompt.md:519). The subject of the activity after wave w is `rotation[(w - 1) mod 3]`. A correct answer on the first, second or third attempt pays the same 30, once; three wrong answers pay nothing and cost nothing (CONFIRMED prompt.md:505-517).

### 15.3 Variant: the activities after waves 2 and 4 are failed

| Wave | Credits at start of interval | Learning activity (identical reward for every age) | Purchases before Ready | Credits at Ready | Aliens | Bounty earned | Credits after wave | Leaks | Colony health |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 150 | - | Place Nova (Laser Scout) on P05: -50; Place Nova (Laser Scout) on P09: -50; Place Nova (Laser Scout) on P12: -50 | 0 | 6 Moon Blob | +24 | 24 | 0 | 20 |
| 2 | 24 | Activity after wave 1 (subject: maths), slot N-001: correct, +30 | Place Nova (Laser Scout) on P04: -50 | 4 | 8 Moon Blob | +32 | 36 | 0 | 20 |
| 3 | 36 | Activity after wave 2 (subject: phonics), slot N-002: three wrong answers, +0 | (nothing bought) | 36 | 8 Meteor Mite | +16 | 52 | 0 | 20 |
| 4 | 52 | Activity after wave 3 (subject: spelling), slot N-003: correct, +30 | Place Nova (Laser Scout) on P16: -50 | 32 | 7 Moon Blob, 4 Meteor Mite | +36 | 68 | 0 | 20 |
| 5 | 68 | Activity after wave 4 (subject: maths), slot N-004: three wrong answers, +0 | Upgrade Nova on P05 to level 2: -60 | 8 | 9 Moon Blob, 5 Meteor Mite | +46 | 54 | 0 | 20 |
| 6 | 54 | Activity after wave 5 (subject: phonics), slot N-005: correct, +30 | Place Pip (Frost Explorer) on P13: -60 | 24 | 3 Shellback | +15 | 39 | 0 | 20 |

The child has 60 credits less than in 15.1 and therefore one level-2 upgrade fewer: the Nova on P09 stays at level 1. Nothing leaked and the colony is still at 20. Two failed activities delayed one purchase; they did not endanger the run (CONFIRMED need prompt.md:451).

### 15.4 What the example does not show

It is one sensible sequence, chosen by me. A child might put the first three Novas on any of the six open pads. The "minimal player" in 16.5, who puts three Novas on the three weakest starting pads and never buys anything again, still clears the first 12 waves.

---

## 16. The simulator and what it found

### 16.1 What the model is, and is not

`sim.py` is a headless fixed-timestep model of the rules in sections 2 to 13: movement along the route polyline; range checks from pad coordinates; the four targeting modes; damage with buff, flying, bubble layers and armour in the stated order; slows with no stacking, the cap and the boss factor; full-radius blasts; colony shield and repair; Sol's strongest-wins buff; the shared heal pulse; splitters and carriers with queued releases; boss phases with their releases and bubble gifts; leaks; bounties; purchases, upgrades and sales before and during waves; meteor powers with their limits; the caps with waiting spawns; the endless generator; and the challenges.

**It is a coarse model with heuristic players. It is not validation with real children.** It says nothing about whether the game is fun, whether a six-year-old can read the board at 2x, how long a child takes to notice the upgrade button, or how losing feels. It runs at 30 ticks per second with fractional timers where the game will use 60 whole ticks; the two were compared (16.5). Its one purpose is to stop the first playtest starting from numbers that are obviously broken.

**The players.**

- **Competent.** Has a plan for which class suits which pad: Juno on P05, P08, P13 and P14; Orion on P04, P09 and P12; Pip on P03 and P11; Sol on P10; Mira on P15 (and P01 if a second is needed); Nova elsewhere. It keeps a cheap Nova on a pad until the planned class unlocks, then sells it and places the planned class. It chooses what to buy next by test-playing the next two waves, made tougher, on a copy of the board and taking the affordable step that adds most damage per credit; it saves when a clearly better step is nearly affordable; it buys during waves; it buys Mira once the colony has leaked (or from wave 36); it uses default targeting; it keeps powers for bosses. It knows the next two waves exactly, which a child does not. Think of it as an attentive adult.
- **Naive child.** Picks a random open pad; buys the newest class half the time, the cheapest 30% and a random one 20% (when it cannot afford its choice it waits half the time and otherwise buys something it can afford); makes one to three purchases per preparation phase while pads are free; does nothing at all in a quarter of preparation phases; upgrades rarely (15% of the time, 30% once every pad is full); never sells and never changes targeting; fires a power at a random moment of a boss wave 70% of the time. Twenty seeds.
- **Learning success** of 0%, 60% and 100%: each normal activity pays with that probability. Competent runs use an evenly spread fixed pattern so they are repeatable, and five random-outcome seeds are reported too; naive runs use seeded random outcomes. With powers "used", a meteor challenge succeeds with the same probability in the random-outcome runs; in the fixed-pattern competent runs every meteor challenge succeeds at 60% and 100%. At 0% no power is ever earned, so the two 0% rows are the same by construction.

### 16.2 Competent player

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
| Waves 1-5 very hard to lose | **Met.** Margins in waves 1-9 lie between 3.02 and 9.12; the minimal player (three Novas on the three weakest starting pads, nothing bought afterwards) clears 12 waves. |

Margin before every wave:

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

### 16.3 Naive child

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

What this table shows that matters more than the headline:

- **For this child the limit is spending, not income.** At 100% learning they get no further than at 60% (median 41 against 42) and end with about 2974 credits unspent on average. The same child who always upgrades once the pads are full completes the campaign in 19 of 20 seeds at 60%. So the most valuable thing the interface can do for a young player is make spare credits obviously spendable: an unmistakable "you can upgrade me" cue on astronauts. That is a UX matter for section D, not a balance number.
- **Staged pads help this child**: median 42 with staging against 35.5 with all 16 pads open from the start.
- **Powers help a little**: median 43 with powers against 42 without.

What happened at each boss for the naive child at 60%:

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

The first two bosses are safe for this player. From Queen Bubbla onwards a boss sometimes reaches the colony, and the run nearly always survives it: the "heavy blow, not the end" behaviour intended in section 4. It also shows that the third boss is where an under-upgraded board starts to struggle.

### 16.4 No boss requires a class or a power

Each row is a whole campaign played by the competent player with one class removed (or all five non-Nova classes), with powers unused:

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

And the margin on each boss wave for those restricted boards, measured with no powers and no purchases during the wave. For this measurement only, the colony is treated as indestructible so that every boss wave is reached.

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

Reading these honestly:

- With any **one** class removed the campaign is completed at 0% and at 60% learning (fewest waves cleared: 50 and 50; lowest final health: 11 and 20). Bosses that reached the colony in those campaigns: at 0%, none; at 60%, none. The lowest boss-wave margin of any single-class-removed board at 0% learning is 1.06 (wave 30, without Orion). So no boss requires a particular class, and none requires a power.
- **That was not true of my first tuned numbers.** Without Orion and with no learning income, the board's margin on the last three bosses was 0.93, 0.94 and 0.92: each got through. I lowered the health of those three bosses by between a tenth and a sixth, to the values in section 7. Orion is still the strongest single answer to a boss, as its role says it should be; it is now an advantage rather than a necessity, by a small margin. If bosses feel too soft in playtests, this is the trade to revisit.
- A **Nova-only** player cleared 50 waves and ended with 4 health (0 bosses reached the colony). The starting class stays viable for the whole campaign, but only just: a board with no second class is at its limit in the last few waves.
- Without Juno at 0% learning the campaign is completed but not cleanly (see the leak-damage column): swarms and dense groups get through a board with no area damage. At 60% every single-class-removed board finishes with full health.
- A competent player who never sells ("no swaps") still completes the campaign at 0% learning.

### 16.5 Other checks

Wave durations and total combat time:

| Measure (competent policy, 1x speed) | 0% learning | 60% | 100% |
|---|---|---|---|
| Shortest ordinary wave (s) | 24 | 21 | 21 |
| Longest ordinary wave (s) | 83 | 71 | 72 |
| Ordinary waves shorter than 25 s | 4 | 5 | 5 |
| Boss waves 10/20/30/40/50 (s) | 50 / 58 / 62 / 75 / 92 | 38 / 65 / 58 / 66 / 84 | 35 / 44 / 56 / 62 / 66 |
| Total campaign combat time (min) | 40.4 | 37.5 | 35.4 |

Tick rate:

| Simulation tick | Waves cleared | Health at end | Total leak damage | Credits invested | Combat time (min) |
|---|---|---|---|---|---|
| 30 per second (used for the matrix) | 50 | 20 | 0 | 4570 | 40.4 |
| 60 per second (the proposed game tick) | 50 | 20 | 0 | 4570 | 40.3 |

Minimal player (three Novas on P16, P02, P04, nothing bought afterwards):

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

Standalone challenges:

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

Endless continuation:

| Policy | Learning success | Highest wave cleared | Defeated in wave | Peak concurrent aliens | Spawns deferred by the caps (whole run) | Wave at which the reference board was complete | Credits unspent at the end |
|---|---|---|---|---|---|---|---|
| competent | 0% | 87 | 88 | 41 | 0 | 63 | 4787 |
| competent | 60% | 95 | 96 | 47 | 0 | 54 | 9208 |
| competent | 100% | 95 | 96 | 47 | 0 | 49 | 11578 |

Self-checks in `selftest.py`, all passing: bosses on waves 10, 20, 30, 40 and 50; each alien's first wave matches the catalogue; no pad within a tile of the route; shop actions never raise credits plus investment and never go negative; deployment caps hold; every spawned alien is resolved exactly once; bounty earned equals bounty available when nothing leaks; identical inputs give identical runs; slows never exceed the cap; the shield is trimmed at wave end; the endless generator is deterministic, capped and periodic after the caps; the worked example's credit totals equal an independent calculation from the data tables.

### 16.6 Soft spots and misses, stated plainly

1. **The competent player is strong.** It plans its pads, knows the next two waves exactly and never misclicks. "Thin margin at 0% learning" is thin for that player; a real child who answers nothing correctly should not be expected to finish. I think that is acceptable in a game about learning, but it is a judgement, not a result.
2. **A few ordinary waves are shorter than the 25-second guide**: 4 waves at 0% learning and 5 at 60%, the shortest 21 s. They are gentle introduction waves and early waves against a strong board. The longest ordinary wave is 83 s and the longest boss wave about 90 s, both inside the guide.
3. **Nova alone only just finishes** (16.4), and Orion was close to required for the late bosses until I lowered three boss healths. Both results sit near their limits and could tip the other way with small changes.
4. **The naive child rarely completes the campaign** (1 of 20 at 60%) and is held back by not upgrading. Whether real children behave like that is unknown; the "always upgrades" variant shows how much the answer matters.
5. **Queen Bubbla (wave 30) is the first boss the naive board often fails to stop**: defeated in 13 of 20 runs. The run survives, but it may feel unfair. Candidates if so: fewer bubble layers, or less health.
6. **Powers barely matter in the model.** The competent player never needs them. They may matter more to children than to the model, or they may need to be stronger to feel worth an extra challenge.
7. **Credits have no use once the board is complete** (11.3).
8. **The challenges are almost impossible to lose** for both simulated players. That is intended for this audience, but it makes them practice rather than a test.
9. **The worst alien peak in the authored campaign (44) is within a few aliens of the scheduled-spawn soft cap (48).** A player weaker than my naive model could touch the cap in the busiest waves. The only effect is that a few spawns arrive a moment late.
10. **Class balance is only roughly right.** In the reference runs Nova, Juno and Orion each do a large share of the damage and Pip's value is its slow. But that depends on the competent player's fixed plan, and I did not search for stronger plans. The deployment caps are doing real work in keeping the board mixed.
11. **Results close to 1.0 are fragile.** A margin moves by several hundredths when an unrelated number changes, because the competent player then buys things in a slightly different order: wave 48 fell from 1.10 to 0.98 after I changed only boss health, and I eased it by hand. Read margins below about 1.15 as "about level", not as a guarantee.
12. **The model has no misplacement, no accidental sale, no hesitation and no reading of the board.** All of those belong to the playtests in section I.

### 16.7 How to re-run

```
cd /tmp/claude-1000/-home-jack-Documents-Projects-space-tower-defence/21e4d7b3-740a-407a-9ce4-b4a3156f1b6c/scratchpad/sim
python3 make_data.py          # authored tables -> game_data.json
python3 selftest.py           # invariants and the worked-example arithmetic
python3 run_matrix.py         # about two and a half minutes on 8 cores -> results.json
python3 tables.py --results   # tables.json and results.md
python3 build_report.py       # this report
```

`python3 sim.py competent 0.6 1 1` prints one campaign wave by wave (policy, learning success, powers used 1 or 0, seed). `python3 tune.py` prints the margin before every wave; `python3 tune.py --adapt` re-tunes counts and boss health to the target curve and writes `tuned.json`, whose values are then pasted into `make_data.py`.

`sim/results.md` holds every result table, including credits earned and spent per wave for the naive child at each learning level with powers used and unused, and for the competent player with powers used.

---

## 17. The numbers most likely to change in playtests

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
| Nova level-3 range (3.0) | The upgrade is too small to notice; or level-3 Novas cover everything | 2.75 to 3.25. Small changes matter because every pad is 2 tiles from the path. |
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
| Challenge presets and credits | Challenges are too easy to hold interest | Remove an astronaut from the preset |

---

## 18. Notes for the lead and the other sections

1. **Snapshot (spine S4)**: sufficient as drafted: colony health and shield, credits, available classes, placements (pad, class, level, targeting mode), power charges. No timers. At a wave boundary the shield is at most 10 and each power count at most 2.
2. **Derived, not stored**: which classes are available and which pads are open both follow from the highest completed wave (`unlockAfterWave` and `opensAfterWave` in the ruleset).
3. **Server bounds (spine S6)**: rule 2 should also check that each placement's pad is open at k and that the deployment caps hold. `maxBounty[w]` is the "Total bounty available" column for waves 1-50, and the endless generator computes it for any later wave. Rule 1 survives selling because of the invariant in 5.7.
4. **Slots (spine S3.3)**: a normal slot's reward is the block value for the wave it follows; a meteor slot's reward is one charge of the power given by the rotation. Both can be pinned when the run is created.
5. **Repairs**: the client applies the boss-clear and Mira repairs before it reports the post-wave snapshot; the server needs only health <= maximum.
6. **Challenges** need a run mode, or equivalent, carrying a challenge id, a short wave list of references to campaign waves, and a starting snapshot that may contain placements. Their slots can use the same N-001... ids within that run. They award only their badge and learning-summary counts.
7. **Badges**: ids and rules in section 12; every rule is a condition on an accepted operation.
8. **Ruleset contents**: `game_data.json` is shaped to become the first ruleset and campaign documents: classes, combat rules, aliens, caps, powers, economy and endless formulas in the ruleset; map, waves and bosses in the campaign. Where the line falls is the lead's call.
9. **UX requests (section D)**: a two-picture targeting toggle; a token row for deployment caps; an unmistakable "affordable upgrade" cue (16.3); a "swap" affordance on an occupied pad; previews of range, blast radius, buff radius and slow strength; and a next-wave strip of alien pictures, which is how a real player would get the foresight the competent simulated player was simply given.
10. **Learning section**: this design fixes only four things: one normal activity per interval; a reward that depends on the wave alone; the subject rotation index `(w - 1) mod 3`; and meteor slots after waves 9, 19, 29, 39 and 49 and before each endless boss.
11. **Tests (section I)**: the checks in `selftest.py` translate directly into game-core unit tests: caps, exact resolution of every spawned alien, bounty accounting, the sell invariant, the slow cap, determinism, phase releases never skipped. The simulator's per-wave outputs are not golden values for the real engine, which handles ticks differently; the invariants are what carry over.

---

## 19. Acceptance criteria touched by this design

| Criterion | How this design supports it | What tests or play still have to show |
|---|---|---|
| AC-07 pads only, stationary, cannot be damaged | Astronauts exist only on listed pads that are open; no rule lets an alien affect an astronaut or a pad (section 4) | Placement validation; a property test that only player commands change astronauts |
| AC-08 six roles and three levels observable, with previews | Every level changes a visible value (5.2); preview shapes are exact circles (range, blast, buff radius) | Art for three visual levels; preview accuracy |
| AC-09 purchases in combat, no negative balances | Commands applied one at a time at tick boundaries, each validated (2.3) | Interface race tests |
| AC-10 descendants resolved before the wave completes; no duplicates | Completion rule and release queue (6.2); self-check equalities | The same checks in game-core; a reload during a wave |
| AC-11 fifty waves, bosses at 10/20/30/40/50, fixed route | The table in section 8; one polyline | Data validation in CI |
| AC-12 endless offered after completion; badge survives | Badge rule and its ordering (section 12); endless generator (section 11) | State-machine tests (lead) |
| AC-13 same combat, funds and rewards at every age | No age input anywhere in the combat or economy data; worked example | A test that two runs with different age bands produce identical combat inputs |
| AC-14 failure resets run resources, keeps permanent progress | Reset list in 9.1 | State-machine tests (lead) |
| AC-42 busiest waves meet the measured target | Budget and busiest-wave table (section 14) | The measurement itself; no frame rate has been measured |

---

## 20. Claims I could not verify, and assumptions

- **UNVERIFIED (from memory)**: that addition, subtraction, multiplication, division and square root on JavaScript numbers give identical results in every browser engine, while functions such as `Math.sin` are not guaranteed to. I lean on it only for the advice to keep such functions out of the simulation. The design needs none of them: health, damage, credits and timers are integers; positions are fractional but use only addition, multiplication and comparison (a range check can compare squared distances, so not even a square root is needed); and the route is made of horizontal and vertical segments, so there is no trigonometry.
- **UNVERIFIED**: anything about Phaser's own timing options. The design assumes only that the scene can call the simulation zero or more times per rendered frame, which is ordinary application code.
- **Not checked against the other specialists' reports**: the learning-content, UX and state sections were being written at the same time. Section 18 lists where they must agree with this one.
- **Assumption**: a challenge is a kind of run. If the lead models it differently, the "awards / does not award" list in section 13 is what must be preserved.
- **Assumption**: next-planet eligibility at wave 20 and all persistence rules are the lead's; I only attach a badge to the same event.
- **Not evidence of balance**: every SIM number. They describe invented players in a simplified model.
- **Tuning history is not preserved**: remarks about earlier tuning passes (uncapped boards, the first boss healths) are my record of intermediate runs. The saved files do not reproduce them.

---

## Appendix A. Credits earned and spent per wave: competent player (SIM)

Powers unused. "Learning reward" is the reward received before that wave, for the activity after the previous wave. "Sell refunds" are credits returned when the player sold a holding Nova to place the planned class.

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

## Appendix B. Credits earned and spent per wave: naive child, 60% learning (SIM)

Means over the runs still playing at each wave; powers unused.

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

## Appendix C. Per-wave detail: competent player, 0% learning, no powers (SIM)

Board notation is pad:class and level (No Nova, Pi Pip, Ju Juno, Or Orion, Mi Mira, So Sol).

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
