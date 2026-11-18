# LD15: Make the waves for me (Gate M)

Phase LD15 ([build-phases.md](../build-phases.md#phase-ld15--make-the-waves-for-me)). Date: 2026-11-18.

**What it is.** Level editor → Waves tab → **Make the waves for me**: the 50 campaign waves from a number, then tuned
with the test player. A level without the campaign gets the live campaign's card with them.

**How the waves are made** (`web/game-core/src/waves/generate.ts`), all read from the live Moon campaign (luna-1-c2):

| Part | Rule |
|---|---|
| Order of aliens | plain first (slower first), then by trait: armour, cluster, flying, bubbles, healer, children. On r4 this is exactly the Moon's order |
| Introductions | waves 1, 3, 6, 8, 12, 14, 22, 24, 27 (then 17, 32, 34, 36, 16, 26): the new alien alone, about 18 s of them, a cluster alien in three bursts |
| Bosses | waves 10 to 50, weakest first, a small escort before and after |
| Other waves | aliens already met, about 1 + wave / 8 kinds, the newest again within six waves; scheduled health from a budget of 150 at wave 1 to 1,400 at 49, 12 % more before a boss; big groups in bursts |
| Multipliers | hpMult from C8.1 (divided by the preset's scale), speedMult 1 to wave 30 then 1.05 up to 1.25 |
| Spacing | an ordinary wave 25 s or more and no more than 48 aliens on the route at once (C17.5, C6.4), at the route's length |

**Tuning** (`web/admin/src/levels/curves/tune.ts`): measure every wave, set health with `fitHpMult`, measure again;
up to three fits, stopping when every ordinary wave is within 15 % of the target.

| Check | Result |
|---|---|
| 40 seeds: 50 waves the parser accepts, limits kept, bosses only on tenth waves, each alien first alone at its wave, ordinary waves 25 s or more | Pass (`generate.test.ts`) |
| Margins on the Moonbeam map, seed 1, before tuning | Close to the target already: most within 25 % |
| Seed 7: waves outside 15 % after fit 1, 2, 3, 4 | 17 (six below 1: a leak), 6, 2, 2 (waves 20 and 22) |
| Seed 2: after fit 1, 2, 3 | 3, 2, 2 |
| Time | 24 s for one measurement of 50 waves on one core (node); the admin splits it over three workers |

Boss waves keep their boss's own health, so only the escort moves and a boss wave may stay outside the band; the
message names any wave outside it. **[UNVERIFIED]** tuning time in the browser on the children's laptop (check: make
waves with tuning on and time it).
