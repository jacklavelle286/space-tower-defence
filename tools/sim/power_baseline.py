#!/usr/bin/env python3
"""Boss waves with meteor powers used on fixed ticks (Phase 28, C10), for web/game-core/src/sim/powers.test.ts.

The board is boss_baseline.py's mixed board of every class (Pip's slow, Juno's blasts, Sol's buff, Mira's shield),
colony health and maximum 200 so every wave runs to its end. The run holds Frost Pulse 1, Comet Burst 2 and Colony
Shield 1, and on these ticks of the wave (60 Hz) it tries to use a power, before anything else happens in the tick
(the simulator's step 1, as game-core's commands):

    600   Frost Pulse                            used
    660   Frost Pulse again                      refused: each power once a wave
    900   Comet Burst on the boss's route point  used
    960   Colony Shield                          refused: the 3 s lockout after the comet (until tick 1080)
    1100  Colony Shield                          used
    1200  Comet Burst on the boss's route point  refused: once a wave, though a charge is left

The simulator's sim.py is not changed: a tiny scripted policy calls Game.use_power on those ticks. Each wave is run
twice: the simulator unchanged, and with game-core's timing rules, which are two:
  - C6.3's release times (boss_baseline.py; ADR-0034 difference 1); only the Mothership's and the Great Glorp's waves
    release anything;
  - whole-tick slows (C2.1 "durations ... converted once at load: ticks = round(seconds x 60)"). The simulator counts a
    slow down in float seconds, 1/60 at a time, and 6.0 - 360 x (1/60) is a hair above zero, so its Frost Pulse lasts
    361 ticks (and Pip's 4 s, 241); game-core's last 360 (and 240). A Frost Pulse slows every alien at once, so here
    the extra tick shows (ADR-0034, amended in Phase 28: difference 4).

Usage (about 5 s): python3 -B tools/sim/power_baseline.py
"""
import boss_baseline
import sim

# (tick, power, aimed at the boss?)
PLAN = [(600, "frost_pulse", False), (660, "frost_pulse", False), (900, "comet_burst", True),
        (960, "colony_shield", False), (1100, "colony_shield", False), (1200, "comet_burst", True)]
CHARGES = {"frost_pulse": 1, "comet_burst": 2, "colony_shield": 1}


class Script:
    """A policy that only uses powers, on exact ticks (called once per tick, before spawns, like game-core's step 1)."""

    def __init__(self, g):
        self.tick_interval = g.dt
        self.used = []
        self.burst = 0  # health Comet Bursts removed (sim.py counts only shots in dmg_total)

    def tick(self, g, t):
        for when, pid, aimed in PLAN:
            if when != g.tick:
                continue
            target = None
            if aimed:
                boss = next((a for a in g.active if a.alive and a.boss), None)
                target = None if boss is None else boss.prog
            before = [(a, a.hp) for a in g.active if a.alive]
            self.used.append((when, pid, bool(g.use_power(pid, target))))
            self.burst += sum(hp - a.hp for a, hp in before)


def play(wave, game_core_timing):
    d = sim.load_data()
    g = sim.Game(d, tick_hz=60, health=200)
    g.all_pads_open = True
    g.wave = 50  # every class unlocked
    for pad, cls, level, mode in boss_baseline.MIXED:
        g.force_place(cls, pad)
        for _ in range(level - 1):
            g.force_upgrade(pad)
        if mode is not None:
            assert g.set_mode(pad, mode)
    leaked = []
    leak = g._leak

    def record_leak(a):
        leaked.append(a.id)
        leak(a)

    g._leak = record_leak
    if game_core_timing:
        apply_slow = g._apply_slow

        def whole_tick_slow(a, pct, dur):
            # Half a tick less: the float countdown then ends after exactly round(dur x 60) ticks.
            apply_slow(a, pct, dur - g.dt / 2)

        g._apply_slow = whole_tick_slow

        def queue(spec, prog):
            k = 0
            for r in spec:
                for _ in range(r["count"]):
                    g.releases.append([g.t + g.dt + k * g.caps["descendantReleaseGap"], g._rel_seq, r["type"], prog])
                    g._rel_seq += 1
                    k += 1
        g._queue_release = queue
    g.credits = 0
    g.powers = dict(CHARGES)
    g.stats = sim.WaveStats(wave)
    script = Script(g)
    st = g.run_wave(g.wave_def(wave), script)
    return {
        "ticks": g.tick,
        "uses": script.used,
        "bossDefeated": bool(st.boss_killed),
        "defeated": st.kills,
        "leaked": leaked,
        "bounty": st.bounty,
        "shots": st.shots,
        "damage": g.dmg_total,
        "burst": script.burst,
        "health": g.health,
        "shield": g.shield,
        "spawned": st.spawned,
        "powers": g.powers,
    }


def main():
    for wave in (10, 20, 30, 40, 50):
        for timing in (False, True):
            r = play(wave, timing)
            print("wave %d %-22s %s" % (wave, "game-core timing:" if timing else "simulator unchanged:", r))


if __name__ == "__main__":
    main()
