#!/usr/bin/env python3
"""Authoring helper: writes game_data.json (the canonical machine-readable tables).

Space Colony Defence - INITIAL PLAYTEST SETTINGS. Not validated balance.
Edit the tables here, run `python3 make_data.py`, then re-run the simulator.
sim.py, run_matrix.py and tables.py read ONLY game_data.json.
Python 3 standard library only.
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# --------------------------------------------------------------------------
# Map (tile units; coordinates are tile-centre coordinates; x right, y down)
# --------------------------------------------------------------------------
MAP = {
    "planetId": "luna-1",
    "name": "Moonbeam Research Colony (proposal)",
    "grid": {"cols": 20, "rows": 11, "note": "x 0..19 left to right, y 0..10 top to bottom; one unit = one tile"},
    "route": [[0, 2], [4, 2], [4, 8], [8, 8], [8, 3], [12, 3], [12, 8], [16, 8], [16, 3], [19, 3]],
    "portal": [0, 2],
    "colony": [19, 3],
    "pads": [
        {"id": "P01", "x": 2, "y": 0, "opensAfterWave": 20, "note": "Portal lookout: sees only the entry stretch. A quiet spot for Mira, who needs no range."},
        {"id": "P02", "x": 2, "y": 4, "opensAfterWave": 0, "note": "Entry corner: first shots; covers the end of the entry stretch and the top of the first descent."},
        {"id": "P03", "x": 6, "y": 3, "opensAfterWave": 5, "note": "Mouth of the first U: modest short-range cover; good long-range cover."},
        {"id": "P04", "x": 6, "y": 5, "opensAfterWave": 0, "note": "Inside the first U: sees the descent and the climb; an excellent long-range pad."},
        {"id": "P05", "x": 6, "y": 7, "opensAfterWave": 0, "note": "PRIME - bottom of the first U: three path stretches within short range."},
        {"id": "P06", "x": 6, "y": 10, "opensAfterWave": 15, "note": "Below the first U: weak at short range; a perch for long-range Orion."},
        {"id": "P07", "x": 10, "y": 1, "opensAfterWave": 15, "note": "Above the top bend: weak at short range; a perch for long-range Orion."},
        {"id": "P08", "x": 10, "y": 4, "opensAfterWave": 10, "note": "PRIME - under the top bend: three path stretches within short range. Opens with Juno."},
        {"id": "P09", "x": 10, "y": 6, "opensAfterWave": 0, "note": "Command pad: centre of the map; an excellent long-range pad; all three PRIME pads are within Sol's first radius."},
        {"id": "P10", "x": 10, "y": 8, "opensAfterWave": 25, "note": "Beacon mound: little cover of its own, six pads within Sol's radius. Opens with Sol."},
        {"id": "P11", "x": 14, "y": 3, "opensAfterWave": 10, "note": "Mouth of the last U: modest short-range cover; good long-range cover."},
        {"id": "P12", "x": 14, "y": 5, "opensAfterWave": 0, "note": "Inside the last U: sees the last descent and the final climb; an excellent long-range pad."},
        {"id": "P13", "x": 14, "y": 7, "opensAfterWave": 5, "note": "PRIME - bottom of the last U: the last place to catch groups. Opens with Pip."},
        {"id": "P14", "x": 14, "y": 10, "opensAfterWave": 25, "note": "Below the last U: weak at short range; fine for long range."},
        {"id": "P15", "x": 18, "y": 1, "opensAfterWave": 20, "note": "Colony balcony: hardly sees the path - ideal for Mira."},
        {"id": "P16", "x": 18, "y": 5, "opensAfterWave": 0, "note": "Last line: covers the final climb and the colony approach."},
    ],
}

SIMULATION = {
    "tickRateHz": 60,
    "note": "Fixed timestep. One tick = 1/60 simulation second. 1x = accumulate real time, 2x = accumulate at double rate, pause = zero steps.",
    "maxCatchUpStepsPerFrame": 8,
    "speeds": [1, 2],
    "tickOrder": [
        "1 apply queued player commands (place, upgrade, sell, targeting, power) in arrival order",
        "2 scheduled spawns that are due, then descendant releases that are due (both respect caps)",
        "3 support timers: Mira shield pulses, Patchling heal pulse (global clock), boss phase checks",
        "4 astronaut attacks in pad-id order (P01..P16)",
        "5 alien movement in alien-id order; leaks resolved as they happen",
        "6 defeat check, then wave-complete check",
    ],
}

COLONY = {
    "maxHealth": 20,
    "shieldCap": 10,
    "shieldAbsoluteCap": 20,
    "repairOnBossClear": 3,
    "miraRepairCapPerWave": 1,
    "note": "Leak damage is removed from shield points first, then health. Health 0 = defeat. Shield above shieldCap (only possible from the Colony Shield power) is trimmed to shieldCap when the wave ends.",
}

# --------------------------------------------------------------------------
# Astronaut classes. cost = price of THAT level (purchase for L1, upgrade for L2/L3)
# --------------------------------------------------------------------------
CLASSES = {
    "nova": {
        "name": "Nova", "role": "Laser Scout", "unlockAfterWave": 0, "deployCap": None,
        "attack": "single", "targeting": ["FRONT", "FAST"], "targetingFromLevel": {"FAST": 1},
        "levels": [
            {"level": 1, "cost": 50, "range": 2.5, "period": 1.00, "damage": 10},
            {"level": 2, "cost": 60, "range": 2.5, "period": 0.60, "damage": 10},
            {"level": 3, "cost": 150, "range": 3.0, "period": 0.60, "damage": 16},
        ],
    },
    "pip": {
        "name": "Pip", "role": "Frost Explorer", "unlockAfterWave": 5, "deployCap": 3,
        "attack": "slow", "targeting": ["FRONT", "FAST"], "targetingFromLevel": {"FAST": 1},
        "levels": [
            {"level": 1, "cost": 60, "range": 2.5, "period": 0.80, "damage": 5, "slowPct": 30, "slowDuration": 3.0, "slowRadius": 0.0},
            {"level": 2, "cost": 80, "range": 2.5, "period": 0.80, "damage": 6, "slowPct": 40, "slowDuration": 4.0, "slowRadius": 0.0},
            {"level": 3, "cost": 170, "range": 2.5, "period": 0.80, "damage": 7, "slowPct": 40, "slowDuration": 4.0, "slowRadius": 1.0},
        ],
    },
    "juno": {
        "name": "Juno", "role": "Comet Engineer", "unlockAfterWave": 10, "deployCap": 4,
        "attack": "blast", "targeting": ["CROWD", "FRONT"], "targetingFromLevel": {"FRONT": 1},
        "levels": [
            {"level": 1, "cost": 110, "range": 2.5, "period": 1.80, "damage": 16, "splashRadius": 1.0},
            {"level": 2, "cost": 130, "range": 2.5, "period": 1.80, "damage": 16, "splashRadius": 1.4},
            {"level": 3, "cost": 260, "range": 2.5, "period": 1.80, "damage": 26, "splashRadius": 1.4},
        ],
    },
    "orion": {
        "name": "Orion", "role": "Orbit Ranger", "unlockAfterWave": 15, "deployCap": 3,
        "attack": "single", "targeting": ["FRONT", "STRONG"], "targetingFromLevel": {"STRONG": 3},
        "levels": [
            {"level": 1, "cost": 170, "range": 4.5, "period": 2.40, "damage": 50},
            {"level": 2, "cost": 100, "range": 6.0, "period": 2.40, "damage": 50},
            {"level": 3, "cost": 330, "range": 6.0, "period": 2.40, "damage": 90},
        ],
    },
    "mira": {
        "name": "Mira", "role": "Shield Specialist", "unlockAfterWave": 20, "deployCap": 2,
        "attack": "shield", "targeting": [], "targetingFromLevel": {},
        "levels": [
            {"level": 1, "cost": 160, "shieldPoints": 1, "period": 15.0, "repairOnWaveClear": 0},
            {"level": 2, "cost": 180, "shieldPoints": 2, "period": 15.0, "repairOnWaveClear": 0},
            {"level": 3, "cost": 280, "shieldPoints": 2, "period": 12.0, "repairOnWaveClear": 1},
        ],
    },
    "sol": {
        "name": "Sol", "role": "Beacon Commander", "unlockAfterWave": 25, "deployCap": 2,
        "attack": "buff", "targeting": [], "targetingFromLevel": {},
        "levels": [
            {"level": 1, "cost": 150, "buffPct": 15, "radius": 4.5},
            {"level": 2, "cost": 200, "buffPct": 25, "radius": 4.5},
            {"level": 3, "cost": 300, "buffPct": 25, "radius": 6.0},
        ],
    },
}

COMBAT_RULES = {
    "rangeRule": "An alien is in range when the distance from the pad centre to the alien's point on the route is <= range.",
    "instantHit": True,
    "damageOrder": ["base damage", "Sol buff: floor((base*(100+pct)+50)/100)", "flying: Juno blast halved, rounded up", "bubble layer absorbs the whole hit", "armour: max(1, damage - armour)", "health"],
    "slow": {
        "capPct": 50,
        "stacking": "none - an alien has one slow at a time; a stronger slow replaces it (strength and duration); an equally strong one keeps whichever remaining time is longer; a weaker one is ignored",
        "bossSlowFactor": 0.5,
    },
    "splash": "full-radius: every alien whose centre is within splashRadius of the target's position takes the full blast damage; nothing outside the previewed circle is damaged; no falloff",
    "buff": "an astronaut takes only the single largest buffPct among Sols whose radius reaches its pad; Sol never buffs Sol, Mira or itself; buff strength depends only on Sol's own level",
    "targetingModes": {
        "FRONT": "the alien in range that is furthest along the route (default for every attacking class)",
        "FAST": "the alien in range with the highest current speed; ties -> FRONT",
        "CROWD": "the alien in range with the most aliens inside the blast radius around it; ties -> FRONT",
        "STRONG": "the alien in range with the highest current health; ties -> FRONT (Orion from level 3)",
    },
    "pipTargetRule": "Within its chosen mode Pip first prefers aliens that are not currently slowed.",
    "sell": {"refundPct": 70, "roundDownTo": 5, "covers": "purchase price plus all paid upgrades"},
    "rounding": {
        "alienHealth": "max(1, floor(baseHealth * hpMult + 0.5))",
        "solBuff": "floor((damage * (100 + buffPct) + 50) / 100)",
        "junoBlastOnFlying": "ceil(damage / 2)",
        "armour": "max(1, damage - armour)",
        "patchlingHeal": "floor(amount * hpMult + 0.5), never above maximum health",
        "cometBurst": "ceil(maxHealth * pct / 100), removed directly from health",
        "sellRefund": "floor(floor(invested * 70 / 100) / 5) * 5",
    },
    "attackTiming": "An attacker fires on the first tick on which its timer is ready and a target is in range, then waits one attack period. All timers are ready at wave start. Upgrading keeps the timer. A newly placed attacker is ready at once; a newly placed Mira starts a full recharge.",
    "waveComplete": "The schedule is exhausted, no descendant release is queued, and no alien is active.",
}

ECONOMY = {
    "startingCredits": 150,
    "waveClearBonus": 0,
    "learningRewardByBlock": [
        {"afterWaveFrom": 1, "afterWaveTo": 9, "credits": 30},
        {"afterWaveFrom": 10, "afterWaveTo": 19, "credits": 40},
        {"afterWaveFrom": 20, "afterWaveTo": 29, "credits": 50},
        {"afterWaveFrom": 30, "afterWaveTo": 39, "credits": 60},
        {"afterWaveFrom": 40, "afterWaveTo": 49, "credits": 75},
    ],
    "endlessLearningReward": 75,
    "subjectRotation": ["maths", "phonics", "spelling"],
    "note": "Credits come only from defeated aliens and successful normal learning activities. Meteor challenges award powers, never credits.",
}

# --------------------------------------------------------------------------
# Aliens (base values; health is multiplied by the wave's hpMult, speed by speedMult)
# --------------------------------------------------------------------------
ALIENS = {
    "blob": {"name": "Moon Blob", "hp": 24, "speed": 1.0, "leak": 1, "bounty": 4, "firstWave": 1,
             "traits": {}, "traitRule": "No special rule.",
             "cue": "Round wobbling jelly; slow squash-and-stretch walk."},
    "mite": {"name": "Meteor Mite", "hp": 12, "speed": 2.0, "leak": 1, "bounty": 2, "firstWave": 3,
             "traits": {}, "traitRule": "No special rule: simply fast and fragile.",
             "cue": "Small pointed rock with legs; quick scurry with a dust trail."},
    "shell": {"name": "Shellback", "hp": 60, "speed": 0.7, "leak": 2, "bounty": 5, "firstWave": 6,
              "traits": {"armour": 4}, "traitRule": "Armour 4: every hit loses 4 damage, but always does at least 1.",
              "cue": "Wide domed shell; slow heavy plod; hits make a 'clonk' spark."},
    "swarm": {"name": "Bubble Swarm", "hp": 8, "speed": 1.3, "leak": 1, "bounty": 1, "firstWave": 8,
              "traits": {"cluster": True}, "traitRule": "Always arrives as a tight cluster of small bubbles (each bubble is one alien).",
              "cue": "Tiny bobbing bubbles in a bunch; bouncy hop."},
    "flutter": {"name": "Orbit Flutter", "hp": 20, "speed": 1.6, "leak": 1, "bounty": 3, "firstWave": 12,
                "traits": {"flying": True}, "traitRule": "Flying: follows the same route; Juno's blast does half damage to it (rounded up).",
                "cue": "Winged disc with a shadow on the path below; fluttering bob (visual only)."},
    "guard": {"name": "Bubble Guard", "hp": 34, "speed": 0.9, "leak": 2, "bounty": 5, "firstWave": 14,
              "traits": {"bubbles": 4}, "traitRule": "Four bubble layers: each layer absorbs one whole hit of any size, then pops. Layers never come back. Slows still apply.",
              "cue": "Alien inside four nested soap bubbles; a layer pops with each hit."},
    "patch": {"name": "Patchling", "hp": 26, "speed": 1.0, "leak": 1, "bounty": 4, "firstWave": 22,
              "traits": {"healer": {"amount": 6, "radius": 1.5, "period": 3.0}},
              "traitRule": "Healer: on a shared 3-second clock, every OTHER alien within 1.5 tiles of at least one Patchling regains 6 health multiplied by the wave's health multiplier (never above its maximum; being near several Patchlings gives one heal, not several).",
              "cue": "Carries a sticking-plaster flag; green sparkle ring on each heal pulse."},
    "slime": {"name": "Split Slime", "hp": 44, "speed": 0.8, "leak": 2, "bounty": 3, "firstWave": 24,
              "traits": {"children": [{"type": "slimelet", "count": 2}]},
              "traitRule": "Splitter: when defeated, releases 2 Slimelets at its route position. If it reaches the colony it does not split.",
              "cue": "Two-lobed blob with a visible seam; stretches as it oozes."},
    "slimelet": {"name": "Slimelet", "hp": 14, "speed": 1.2, "leak": 1, "bounty": 1, "firstWave": 24, "descendantOnly": True,
                 "traits": {}, "traitRule": "Descendant of Split Slime. Never splits again.",
                 "cue": "Half-size single-lobed slime; quick hop."},
    "craft": {"name": "Alien Craft", "hp": 120, "speed": 0.6, "leak": 4, "bounty": 6, "firstWave": 27,
              "traits": {"children": [{"type": "blob", "count": 4}]},
              "traitRule": "Carrier: when defeated, releases its cargo (default 4 Moon Blobs; a wave may name other cargo) at its route position. If it reaches the colony it applies its leak damage and releases nothing.",
              "cue": "Toy-like hovering saucer, low over the path; portholes show the passengers."},
}

CAPS = {
    "maxActiveAliens": 60,
    "scheduledSpawnSoftCap": 48,
    "maxLiveDescendants": 24,
    "descendantReleaseGap": 0.25,
    "deferredSpawnGap": 0.25,
    "maxDescendantDepth": 2,
    "rule": "A scheduled spawn that is due while 48 or more aliens are active waits (never dropped) and is released in schedule order, at most one every 0.25 s, as room appears. A descendant release waits at the parent's defeat position while 60 aliens are active or 24 descendants are alive. Deferred entities keep their identity and bounty; nothing is duplicated or lost. Depth: a Craft's cargo may not contain Crafts or Split Slimes (depth 1); only a boss release may contain Split Slimes, whose Slimelets are depth 2; nothing goes deeper.",
}

# --------------------------------------------------------------------------
# Bosses (health is absolute; it is NOT multiplied by the wave hpMult)
# --------------------------------------------------------------------------
BOSSES = {
    "boss1": {"name": "King Wobble", "wave": 10, "hp": 900, "speed": 0.5, "leak": 8, "bounty": 50, "armour": 0, "bubbles": 0,
              "based": "giant Moon Blob wearing a paper crown",
              "phases": [
                  {"fromPct": 100, "name": "Royal stroll", "speedFactor": 1.0, "armour": 0, "cue": "Blue, crown upright, slow wobble."},
                  {"fromPct": 50, "name": "Wobble dash", "speedFactor": 1.3, "armour": 0, "cue": "Turns pink with steam puffs, crown tilts, wobble doubles in speed."},
              ]},
    "boss2": {"name": "Captain Clank", "wave": 20, "hp": 2600, "speed": 0.45, "leak": 10, "bounty": 75, "armour": 5, "bubbles": 0,
              "based": "giant Shellback in bolted-on armour plates",
              "phases": [
                  {"fromPct": 100, "name": "Full plate", "speedFactor": 1.0, "armour": 5, "cue": "All plates on; hits spark."},
                  {"fromPct": 60, "name": "Cracked shell", "speedFactor": 1.15, "armour": 2, "cue": "Plates fall off with a clatter; cracks glow."},
                  {"fromPct": 25, "name": "Shell off", "speedFactor": 1.4, "armour": 0, "cue": "No shell, spotty pants showing; runs."},
              ]},
    "boss3": {"name": "Queen Bubbla", "wave": 30, "hp": 5200, "speed": 0.45, "leak": 12, "bounty": 100, "armour": 0, "bubbles": 8,
              "based": "giant Bubble Guard with a bubble-wand sceptre",
              "phases": [
                  {"fromPct": 100, "name": "First bubble", "speedFactor": 1.0, "armour": 0, "onEnter": {"selfBubbles": 8}, "cue": "Eight-layer bubble; a counter of layers floats above."},
                  {"fromPct": 66, "name": "Bubble gift", "speedFactor": 1.0, "armour": 0, "onEnter": {"selfBubbles": 8, "giveBubbles": {"layers": 1, "radius": 2.0}}, "cue": "Waves the wand: new bubble on herself, one layer on every alien within 2 tiles."},
                  {"fromPct": 33, "name": "Bubble storm", "speedFactor": 1.15, "armour": 0, "onEnter": {"selfBubbles": 8, "giveBubbles": {"layers": 1, "radius": 2.0}}, "cue": "Wand sparkles faster; same gift again; she speeds up."},
              ]},
    "boss4": {"name": "The Mothership", "wave": 40, "hp": 9000, "speed": 0.4, "leak": 14, "bounty": 125, "armour": 2, "bubbles": 0,
              "based": "giant Alien Craft with three cargo doors",
              "phases": [
                  {"fromPct": 100, "name": "Doors shut", "speedFactor": 1.0, "armour": 2, "cue": "Three closed doors with numbered lights."},
                  {"fromPct": 75, "name": "Door one", "speedFactor": 1.0, "armour": 2, "onEnter": {"release": [{"type": "mite", "count": 4}]}, "cue": "Door 1 drops open; Meteor Mites tumble out."},
                  {"fromPct": 50, "name": "Door two", "speedFactor": 1.0, "armour": 2, "onEnter": {"release": [{"type": "flutter", "count": 4}]}, "cue": "Door 2 opens; Orbit Flutters fly out."},
                  {"fromPct": 25, "name": "Door three", "speedFactor": 1.2, "armour": 0, "onEnter": {"release": [{"type": "shell", "count": 2}]}, "cue": "Door 3 opens; Shellbacks march out; hull plating falls away and the ship hurries."},
              ],
              "onDefeatRelease": [{"type": "blob", "count": 4}]},
    "boss5": {"name": "The Great Glorp", "wave": 50, "hp": 14000, "speed": 0.4, "leak": 20, "bounty": 150, "armour": 4, "bubbles": 0,
              "based": "mega alien that borrows one trick from each earlier boss",
              "phases": [
                  {"fromPct": 100, "name": "Armoured", "speedFactor": 1.0, "armour": 4, "cue": "Wears Clank's plates."},
                  {"fromPct": 70, "name": "Bubbled", "speedFactor": 1.0, "armour": 0, "onEnter": {"selfBubbles": 10, "release": [{"type": "swarm", "count": 6}]}, "cue": "Plates drop; ten-layer bubble inflates; a bubble swarm escapes."},
                  {"fromPct": 40, "name": "Cargo", "speedFactor": 1.1, "armour": 0, "onEnter": {"release": [{"type": "slime", "count": 2}, {"type": "mite", "count": 4}]}, "cue": "Belly hatch opens: two Split Slimes and Mites spill out."},
                  {"fromPct": 15, "name": "Wobble dash", "speedFactor": 1.35, "armour": 0, "cue": "Turns pink and steams like King Wobble; final rush."},
              ]},
}
for b in BOSSES.values():
    b["bossSlowFactor"] = 0.5
    b["rule"] = "Bosses never damage, disable or block astronauts or pads, use the one route, fire nothing. Slows work at half strength. A boss that reaches the colony applies its leak damage, is removed, and releases nothing further."


# --------------------------------------------------------------------------
# Waves. group = (type, count, at_seconds, gap_seconds[, cargo])
# --------------------------------------------------------------------------
def G(t, n, at, gap=0.0, cargo=None):
    g = {"type": t, "count": n, "at": float(at), "gap": float(gap)}
    if cargo:
        g["cargo"] = cargo
    return g


W = {}
NEW = {}
NOTE = {}

W[1] = [G("blob", 6, 0, 2.5)]
NEW[1] = "Moon Blob"
W[2] = [G("blob", 8, 0, 2.0)]
W[3] = [G("mite", 8, 0, 3.0)]
NEW[3] = "Meteor Mite (alone)"
W[4] = [G("blob", 6, 0, 2.0), G("mite", 4, 14, 1.5)]
W[5] = [G("blob", 9, 0, 1.6), G("mite", 5, 6, 2.5)]
W[6] = [G("shell", 3, 0, 9.0)]
NEW[6] = "Shellback (alone); Pip available"
W[7] = [G("blob", 8, 0, 1.8), G("shell", 2, 6, 7.0)]
W[8] = [G("swarm", 6, 0, 0.5), G("swarm", 6, 9, 0.5), G("swarm", 6, 18, 0.5)]
NEW[8] = "Bubble Swarm (alone)"
W[9] = [G("blob", 8, 0, 1.5), G("mite", 6, 4, 1.5), G("shell", 2, 14, 5.0), G("swarm", 8, 24, 0.5)]
W[10] = [G("blob", 4, 0, 2.0), G("boss1", 1, 8), G("blob", 4, 24, 2.0)]
NEW[10] = "BOSS King Wobble"

W[11] = [G("blob", 5, 0, 0.7), G("blob", 5, 8, 0.7), G("blob", 5, 16, 0.7), G("mite", 6, 24, 1.0)]
NOTE[11] = "Juno available; tight groups"
W[12] = [G("flutter", 7, 0, 3.5)]
NEW[12] = "Orbit Flutter (alone)"
W[13] = [G("swarm", 8, 0, 0.4), G("blob", 8, 4, 1.4), G("swarm", 8, 16, 0.4), G("mite", 6, 20, 1.0)]
W[14] = [G("guard", 4, 0, 7.0)]
NEW[14] = "Bubble Guard (alone)"
W[15] = [G("blob", 10, 0, 1.3), G("flutter", 5, 5, 2.0), G("shell", 3, 12, 4.0), G("mite", 6, 24, 0.9)]
W[16] = [G("shell", 5, 0, 4.0), G("mite", 8, 6, 1.5)]
NOTE[16] = "Orion available; Shellback parade"
W[17] = [G("guard", 4, 0, 4.0), G("blob", 10, 2, 1.5), G("flutter", 6, 16, 1.5)]
W[18] = [G("swarm", 10, 0, 0.35), G("swarm", 10, 7, 0.35), G("mite", 8, 12, 0.8), G("shell", 3, 14, 4.0), G("swarm", 10, 24, 0.35)]
W[19] = [G("blob", 10, 0, 1.2), G("guard", 3, 4, 5.0), G("flutter", 6, 14, 1.5), G("shell", 3, 18, 4.0), G("mite", 8, 30, 0.8)]
W[20] = [G("shell", 2, 0, 5.0), G("boss2", 1, 8), G("mite", 6, 26, 1.5)]
NEW[20] = "BOSS Captain Clank"

W[21] = [G("blob", 14, 0, 1.0), G("mite", 10, 6, 1.0), G("flutter", 6, 16, 1.5), G("shell", 2, 20, 4.0)]
NOTE[21] = "Mira available; breather"
W[22] = [G("blob", 6, 0, 1.2), G("patch", 2, 3, 3.0), G("blob", 6, 12, 1.2), G("patch", 1, 15, 0)]
NEW[22] = "Patchling (with Moon Blobs only)"
W[23] = [G("shell", 4, 0, 3.0), G("patch", 2, 2, 5.0), G("blob", 10, 10, 1.0), G("guard", 3, 14, 4.0), G("mite", 6, 28, 0.8)]
W[24] = [G("slime", 4, 0, 5.0)]
NEW[24] = "Split Slime (alone)"
W[25] = [G("slime", 4, 0, 4.0), G("mite", 10, 3, 1.0), G("flutter", 8, 14, 1.2), G("swarm", 10, 22, 0.35)]
W[26] = [G("guard", 5, 0, 3.0), G("patch", 3, 1.5, 5.0), G("blob", 12, 10, 1.0), G("shell", 4, 16, 3.0)]
NOTE[26] = "Sol available"
W[27] = [G("craft", 1, 0, 0), G("craft", 1, 18, 0)]
NEW[27] = "Alien Craft (alone; cargo 4 Moon Blobs)"
W[28] = [G("craft", 1, 0, 0), G("slime", 3, 4, 5.0), G("patch", 2, 6, 8.0), G("mite", 10, 20, 0.8)]
W[29] = [G("blob", 10, 0, 1.0), G("shell", 3, 3, 4.0), G("guard", 3, 8, 4.0), G("patch", 2, 10, 8.0),
         G("flutter", 6, 18, 1.2), G("craft", 1, 24, 0), G("swarm", 10, 30, 0.3)]
W[30] = [G("guard", 2, 0, 4.0), G("boss3", 1, 8), G("swarm", 8, 20, 0.35), G("swarm", 8, 34, 0.35)]
NEW[30] = "BOSS Queen Bubbla"

W[31] = [G("mite", 12, 0, 0.7), G("blob", 12, 4, 1.0), G("shell", 3, 8, 4.0), G("flutter", 8, 12, 1.0), G("mite", 12, 24, 0.7)]
NOTE[31] = "Mite rush"
W[32] = [G("shell", 7, 0, 3.0), G("guard", 4, 4, 4.0), G("patch", 2, 6, 8.0)]
NOTE[32] = "Shell wall"
W[33] = [G("swarm", 10, 0, 0.3), G("guard", 4, 4, 3.0), G("swarm", 10, 10, 0.3), G("shell", 3, 14, 3.5), G("flutter", 8, 20, 1.0), G("slime", 3, 22, 3.0), G("swarm", 10, 30, 0.3)]
NOTE[33] = "Bubble storm"
W[34] = [G("flutter", 12, 0, 1.0), G("patch", 3, 2, 5.0), G("blob", 14, 10, 0.8), G("shell", 3, 12, 3.0), G("flutter", 8, 22, 0.9)]
NOTE[34] = "Flutter flock"
W[35] = [G("craft", 2, 0, 12.0), G("mite", 12, 5, 0.8), G("slime", 3, 12, 4.0)]
NOTE[35] = "Craft convoy"
W[36] = [G("slime", 6, 0, 3.0), G("shell", 4, 5, 4.0), G("patch", 2, 6, 8.0), G("swarm", 12, 24, 0.3)]
NOTE[36] = "Slime tide"
W[37] = [G("guard", 7, 0, 2.5), G("patch", 3, 1.2, 6.0), G("blob", 14, 12, 0.8), G("mite", 10, 24, 0.7)]
NOTE[37] = "Guarded healers"
W[38] = [G("blob", 10, 0, 0.9), G("mite", 12, 2, 0.7), G("flutter", 8, 10, 1.0), G("shell", 3, 12, 4.0), G("craft", 1, 20, 0, [{"type": "mite", "count": 6}]), G("slime", 2, 24, 4.0)]
NOTE[38] = "Fast mix; craft carries Mites"
W[39] = [G("shell", 3, 0, 4.0), G("guard", 3, 3, 4.0), G("patch", 2, 5, 8.0), G("craft", 1, 12, 0), G("flutter", 8, 16, 1.0), G("swarm", 12, 30, 0.3), G("mite", 8, 34, 0.7)]
W[40] = [G("flutter", 4, 0, 1.5), G("boss4", 1, 8), G("mite", 6, 40, 1.0)]
NEW[40] = "BOSS The Mothership"

W[41] = [G("blob", 14, 0, 0.8), G("mite", 12, 4, 0.7), G("shell", 5, 10, 3.0), G("slime", 3, 14, 4.0), G("flutter", 10, 22, 0.9)]
NOTE[41] = "Breather before the final climb"
W[42] = [G("guard", 6, 0, 3.0), G("slime", 5, 3, 4.0), G("patch", 3, 5, 6.0), G("swarm", 12, 22, 0.3), G("mite", 10, 28, 0.7)]
W[43] = [G("craft", 2, 0, 12.0, [{"type": "mite", "count": 5}]), G("shell", 5, 4, 3.5), G("flutter", 10, 14, 0.9), G("patch", 2, 8, 8.0)]
W[44] = [G("swarm", 8, 0, 0.3), G("blob", 10, 3, 0.9), G("guard", 6, 10, 2.5), G("shell", 6, 14, 2.5), G("swarm", 8, 22, 0.3), G("flutter", 8, 26, 0.9), G("slime", 4, 30, 2.5), G("craft", 1, 34, 0)]
W[45] = [G("shell", 7, 0, 3.0), G("patch", 3, 2, 7.0), G("slime", 4, 8, 4.0), G("mite", 14, 20, 0.6), G("craft", 1, 24, 0)]
W[46] = [G("flutter", 14, 0, 0.8), G("guard", 8, 2, 2.2), G("blob", 14, 12, 0.7), G("patch", 3, 14, 5.0), G("slime", 5, 24, 3.0), G("craft", 1, 30, 0)]
W[47] = [G("craft", 2, 0, 12.0, [{"type": "flutter", "count": 4}]), G("shell", 5, 3, 3.5), G("mite", 14, 10, 0.6), G("guard", 4, 20, 3.0), G("swarm", 14, 34, 0.3)]
W[48] = [G("blob", 16, 0, 0.6), G("shell", 6, 2, 3.0), G("guard", 5, 6, 3.0), G("patch", 3, 8, 6.0), G("flutter", 12, 20, 0.7), G("slime", 4, 24, 3.0), G("mite", 12, 34, 0.6)]
W[49] = [G("craft", 2, 0, 12.0), G("shell", 5, 2, 3.5), G("guard", 5, 5, 3.5), G("patch", 3, 7, 6.0), G("flutter", 10, 20, 0.8), G("slime", 4, 26, 3.0), G("swarm", 14, 36, 0.3), G("mite", 10, 40, 0.6)]
NOTE[49] = "Everything together"
W[50] = [G("shell", 2, 0, 4.0), G("guard", 2, 2, 4.0), G("boss5", 1, 8), G("flutter", 6, 30, 1.0), G("patch", 2, 34, 6.0)]
NEW[50] = "BOSS The Great Glorp - campaign completion"


HP_ANCHORS = [(1, 1.0), (10, 1.4), (20, 3.2), (30, 4.8), (40, 6.0), (50, 7.0)]


def hp_mult(w):
    """Authored toughness ramp (initial playtest setting): piecewise linear through HP_ANCHORS, rounded to 0.05."""
    for (w0, m0), (w1, m1) in zip(HP_ANCHORS, HP_ANCHORS[1:]):
        if w0 <= w <= w1:
            v = m0 + (m1 - m0) * (w - w0) / float(w1 - w0)
            return round(v * 20) / 20.0
    return HP_ANCHORS[-1][1]


def speed_mult(w):
    """Authored speed tiers (initial playtest setting): +5% every four waves from wave 31."""
    if w <= 30:
        return 1.0
    return round(1.0 + 0.05 * ((w - 31) // 4 + 1), 2)


# Frozen output of tune.py (count scale per ordinary wave, boss health). tune.py --adapt writes tuned.json; these
# frozen copies are what ships in game_data.json. To re-tune: run tune.py --adapt, paste tuned.json here, re-run.
# Hand adjustments made after the last tuning pass (see the report, sections 8.3 and 16.4):
#   wave 48 count scale 1.05 -> 0.95; boss3 2650 -> 2200; boss4 2600 -> 2300; boss5 4100 -> 3600.
TUNED = {
    "countScale": {"4": 1.1, "5": 1.05, "7": 0.8, "9": 1.2, "11": 1.45, "13": 1.45, "15": 0.8, "16": 0.9, "17": 1.05, "18": 1.2, "19": 1.15, "21": 1.2, "23": 0.85, "25": 1.15, "26": 1.1, "28": 1.15, "29": 1.05, "31": 1.3, "32": 1.35, "33": 1.45, "34": 1.15, "35": 1.2, "36": 1.1, "37": 1.35, "38": 1.2, "39": 1.2, "41": 1.25, "42": 1.25, "43": 0.85, "44": 1.2, "45": 1.15, "46": 1.2, "47": 1.05, "48": 0.95, "49": 0.85},
    "bossHp": {"boss1": 450, "boss2": 1000, "boss3": 2200, "boss4": 2300, "boss5": 3600},
}
if os.environ.get("USE_TUNED_JSON") == "1" and os.path.exists(os.path.join(HERE, "tuned.json")):
    with open(os.path.join(HERE, "tuned.json")) as _f:
        TUNED = json.load(_f)


def scale_group(g, c):
    """Scale a group's count by c while keeping the time it takes to arrive (gap shrinks or grows)."""
    if g["type"].startswith("boss") or abs(c - 1.0) < 1e-9:
        return dict(g)
    n = g["count"]
    n2 = max(1, int(math.floor(n * c + 0.5)))
    g2 = dict(g)
    g2["count"] = n2
    if n > 1 and n2 > 1:
        gap = g["gap"] * (n - 1) / float(n2 - 1)
        g2["gap"] = max(0.25, round(gap * 20) / 20.0)
    return g2


def build_wave(w, c=None):
    if c is None:
        c = float(TUNED["countScale"].get(str(w), 1.0))
    groups = [scale_group(g, c) for g in W[w]]
    return {
        "wave": w,
        "groups": groups,
        "hpMult": hp_mult(w),
        "speedMult": speed_mult(w),
        "newThisWave": NEW.get(w, ""),
        "note": NOTE.get(w, ""),
        "boss": next((g["type"] for g in W[w] if g["type"].startswith("boss")), None),
    }


WAVES = [build_wave(w) for w in range(1, 51)]
for _b, _hp in TUNED.get("bossHp", {}).items():
    BOSSES[_b]["hp"] = int(_hp)

POWERS = {
    "frost_pulse": {"name": "Frost Pulse", "effect": "Every alien on the field is slowed by 50% for 6 s (bosses 25%). Obeys the normal strongest-slow rule and the 50% cap.",
                    "slowPct": 50, "duration": 6.0, "targeting": "none - whole field",
                    "mouse": "Click the power button (or its HUD icon).", "keyboard": "Press 1, or Tab to the button and press Enter/Space."},
    "comet_burst": {"name": "Comet Burst", "effect": "Every alien within 1.5 tiles of the chosen point on the route loses 50% of its MAXIMUM health (bosses 10%), ignoring armour and bubbles. Aliens brought to zero are defeated and pay their normal bounty.",
                    "radius": 1.5, "pctMaxHp": 50, "bossPctMaxHp": 10, "targeting": "a point on the route",
                    "mouse": "Click the power button, move the ring (it snaps to the nearest point of the route), click to drop. Right-click or Esc cancels without using the charge.",
                    "keyboard": "Press 2: the ring starts on the front-most alien. Left/Right arrows slide it along the route in half-tile steps, Enter/Space drops, Esc cancels."},
    "colony_shield": {"name": "Colony Shield", "effect": "Adds 10 shield points at once. May lift the shield above the normal cap of 10 up to the absolute cap of 20; anything above 10 is trimmed when the wave ends.",
                      "shieldPoints": 10, "targeting": "none",
                      "mouse": "Click the power button.", "keyboard": "Press 3, or Tab to the button and press Enter/Space."},
}
POWER_RULES = {
    "inventoryCapPerPower": 2,
    "perWaveUseLimitPerPower": 1,
    "sharedLockoutSeconds": 3.0,
    "persistence": "Unused charges stay in the run's inventory (they are run resources in the snapshot) until used, defeat, abandon or run completion. They never transfer to another run.",
    "usableIn": "any wave after the charge is earned (including the boss wave it was earned for)",
    "awardMapping": "fixed rotation by meteor challenge: Frost Pulse, Comet Burst, Colony Shield, then round again",
    "meteorSchedule": [
        {"afterWave": 9, "slotId": "M-009", "power": "frost_pulse", "charges": 1},
        {"afterWave": 19, "slotId": "M-019", "power": "comet_burst", "charges": 1},
        {"afterWave": 29, "slotId": "M-029", "power": "colony_shield", "charges": 1},
        {"afterWave": 39, "slotId": "M-039", "power": "frost_pulse", "charges": 1},
        {"afterWave": 49, "slotId": "M-049", "power": "comet_burst", "charges": 1},
    ],
    "pausedWhileTargeting": True,
    "note": "Choosing a Comet Burst target pauses the simulation (zero steps) so aiming is untimed. Cooldowns are per wave, so no timer state is ever saved.",
}

ENDLESS = {
    "startsAtWave": 51,
    "generator": "pure function of the wave number (no randomness, no seed): every run sees the same endless waves",
    "templateRule": "wave n with (n - 50) mod 10 = j uses the groups of authored campaign wave 40 + j for j = 1..9; j = 0 (waves 60, 70, ...) is a boss wave",
    "templateForOffset": {"1": 41, "2": 42, "3": 43, "4": 44, "5": 45, "6": 46, "7": 47, "8": 48, "9": 49},
    "bossCycle": ["boss1", "boss2", "boss3", "boss4", "boss5"],
    "bossEscortTemplates": {"boss1": 10, "boss2": 20, "boss3": 30, "boss4": 40, "boss5": 50},
    "hpMult": {"base": 7.0, "perWave": 0.10, "cap": 14.0, "formula": "min(cap, base + perWave * (n - 50))"},
    "speedMult": {"base": 1.25, "perWave": 0.005, "cap": 1.40, "formula": "min(cap, base + perWave * (n - 50))"},
    "countMult": {"base": 1.0, "perCycle": 0.05, "cap": 1.25, "formula": "min(cap, 1 + perCycle * floor((n - 51) / 10)); group count = ceil(count * countMult), gaps unchanged"},
    "maxScheduledSpawnsPerWave": 110,
    "bossHp": {"base": 4000, "perBoss": 1000, "cap": 10000, "formula": "min(cap, base + perBoss * k) for the k-th endless boss (k = 1 at wave 60); the boss keeps its own phases, speed and leak damage"},
    "bossBounty": 100,
    "meteorBeforeBoss": True,
    "learningReward": 75,
    "concurrencyCaps": "identical to the campaign caps (60 active, 48 scheduled soft cap, 24 live descendants)",
    "plateau": "after the last cap is reached every wave with the same template is identical for ever; nothing grows",
}

BADGES = [
    {"id": "first-steps", "name": "First Steps", "permanent": True, "rule": "highestCompletedWave >= 1 on any campaign run (awarded in COMPLETE_WAVE)."},
    {"id": "boss-1", "name": "Wobble Stopper", "permanent": True, "rule": "COMPLETE_WAVE for campaign wave 10."},
    {"id": "boss-2", "name": "Clank Cracker", "permanent": True, "rule": "COMPLETE_WAVE for campaign wave 20 (same event records next-planet eligibility)."},
    {"id": "boss-3", "name": "Bubble Popper", "permanent": True, "rule": "COMPLETE_WAVE for campaign wave 30."},
    {"id": "boss-4", "name": "Mothership Mover", "permanent": True, "rule": "COMPLETE_WAVE for campaign wave 40."},
    {"id": "campaign-luna-1", "name": "Colony Hero", "permanent": True, "rule": "COMPLETE_WAVE for campaign wave 50; committed before the endless offer is shown."},
    {"id": "endless-60", "name": "Star Voyager", "permanent": True, "rule": "COMPLETE_WAVE for endless wave 60."},
    {"id": "full-crew", "name": "Full Crew", "permanent": True, "rule": "A wave-start snapshot (START_WAVE) contains at least one astronaut of each of the six classes."},
    {"id": "top-team", "name": "Top Team", "permanent": True, "rule": "A wave-start snapshot contains at least one level-3 astronaut."},
    {"id": "safe-and-sound", "name": "Safe and Sound", "permanent": True, "rule": "COMPLETE_WAVE for a campaign boss wave (10/20/30/40/50) whose post-wave snapshot health is not lower than the health in that wave's start snapshot."},
    {"id": "meteor-catcher", "name": "Meteor Catcher", "permanent": True, "rule": "Any meteor slot resolves SUCCEEDED."},
    {"id": "bright-spark-10", "name": "Bright Spark", "permanent": True, "rule": "Lifetime count of SUCCEEDED normal activities (sum of the learning summaries) reaches 10."},
    {"id": "bright-spark-50", "name": "Brilliant Spark", "permanent": True, "rule": "Lifetime count of SUCCEEDED normal activities reaches 50."},
    {"id": "all-rounder", "name": "All-Rounder", "permanent": True, "rule": "Learning summaries show at least 5 SUCCEEDED activities in each of maths, phonics and spelling."},
    {"id": "keep-trying", "name": "Keep Trying", "permanent": True, "rule": "A slot resolves SUCCEEDED on its second or third attempt."},
    {"id": "challenge-blob-parade", "name": "Parade Marshal", "permanent": True, "rule": "Final wave of challenge 'blob-parade' completed."},
    {"id": "challenge-bubble-trouble", "name": "Bubble Wrangler", "permanent": True, "rule": "Final wave of challenge 'bubble-trouble' completed."},
    {"id": "challenge-wobble-rematch", "name": "Boss Buddy", "permanent": True, "rule": "Final wave of challenge 'wobble-rematch' completed."},
]

CHALLENGES = [
    {"id": "blob-parade", "name": "Blob Parade", "startingCredits": 150, "classes": ["nova"], "colonyHealth": 20,
     "padsOpenAsForWave": 1, "presetPlacements": [], "waves": [1, 2, 4, 5, 7], "learningReward": 30, "meteor": False,
     "about": "Five gentle waves with only Nova on the six starting pads: a first taste, or a quick go."},
    {"id": "wobble-rematch", "name": "Wobble Rematch", "startingCredits": 200, "classes": ["nova", "pip"], "colonyHealth": 20,
     "padsOpenAsForWave": 10,
     "presetPlacements": [{"pad": "P04", "class": "nova", "level": 1}, {"pad": "P05", "class": "nova", "level": 1},
                          {"pad": "P09", "class": "nova", "level": 1}, {"pad": "P12", "class": "nova", "level": 1}],
     "waves": [7, 9, 10], "learningReward": 30, "meteor": True, "meteorAfterIndex": 2, "meteorPower": "frost_pulse",
     "about": "The team is already at its posts. Two warm-up waves, an optional meteor challenge for a Frost Pulse, then King Wobble."},
    {"id": "bubble-trouble", "name": "Bubble Trouble", "startingCredits": 250, "classes": ["nova", "pip", "juno"], "colonyHealth": 20,
     "padsOpenAsForWave": 16,
     "presetPlacements": [{"pad": "P02", "class": "nova", "level": 1}, {"pad": "P04", "class": "nova", "level": 1},
                          {"pad": "P05", "class": "juno", "level": 1}, {"pad": "P09", "class": "nova", "level": 1},
                          {"pad": "P12", "class": "nova", "level": 1}, {"pad": "P13", "class": "pip", "level": 1},
                          {"pad": "P16", "class": "nova", "level": 1}],
     "waves": [8, 13, 14, 17, 18, 19], "learningReward": 40, "meteor": False,
     "about": "A ready-made team with one Juno and one Pip. Six waves of swarms, Bubble Guards and groups."},
]

PERFORMANCE = {
    "maxActiveAliens": 60,
    "maxAstronauts": 16,
    "maxBeamEffects": 32,
    "maxBlastEffects": 16,
    "maxParticles": 240,
    "starBurstParticles": 8,
    "maxFloatingTexts": 24,
    "note": "Attacks resolve instantly in the simulation; beams, comets and star bursts are pooled render-only effects with fixed lifetimes. When a pool is empty the oldest effect is recycled; simulation outcomes never depend on effects.",
}


def main():
    data = {
        "meta": {
            "title": "Space Colony Defence - combat and economy tables",
            "status": "INITIAL PLAYTEST SETTINGS - proposals, not validated balance",
            "rulesetVersion": "draft-r1",
            "campaignVersion": "luna-1-draft-c1",
            "generatedBy": "sim/make_data.py",
        },
        "simulation": SIMULATION,
        "map": MAP,
        "colony": COLONY,
        "classes": CLASSES,
        "combatRules": COMBAT_RULES,
        "economy": ECONOMY,
        "aliens": ALIENS,
        "caps": CAPS,
        "bosses": BOSSES,
        "waves": WAVES,
        "powers": POWERS,
        "powerRules": POWER_RULES,
        "endless": ENDLESS,
        "badges": BADGES,
        "challenges": CHALLENGES,
        "performance": PERFORMANCE,
    }
    out = os.path.join(HERE, "game_data.json")
    with open(out, "w") as f:
        json.dump(data, f, indent=1)
    print("wrote", out)


if __name__ == "__main__":
    main()
