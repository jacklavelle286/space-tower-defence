#!/usr/bin/env python3
"""The baseline defence against each boss (Phase 27, C17.4 "No boss requires a class or a power").

The baseline defence is the C17.4 "Nova only" board: the competent policy with every class but Nova removed, 0%
learning, no meteor powers, as it stands when each boss wave starts (tune.measure, the same run that gives the
"Nova only" row of the C17.4 boss-margin table: 2.05 / 1.43 / 1.35 / 1.29 / 1.2). Nova is the starting class, so a
win with it alone shows that no boss needs any other class or any power.

For each boss wave this prints the board and its margin (30 Hz, as C17.4), then plays the wave once at 60 Hz with
that board fixed: no purchases, no powers, colony health 20. web/game-core/src/sim/bosses.test.ts plays the same
waves with the same boards and checks its numbers against these.

Two runs per wave: the simulator unchanged, and with C6.3's release times (a parent's k-th release at defeat + one
tick + k x 0.25 s, which is what game-core does; ADR-0034 difference 1). Only the Mothership and the Great Glorp
release anything, so the other three rows are the same both ways.

Then the same five waves with a mixed board of every class (Pip's slow on a boss at half strength, Juno's blasts,
Sol's buff, Mira's shield), colony health and maximum 200 so every wave runs to its end even when the boss gets
through. bosses.test.ts compares waves 10 to 40 of these too; wave 50 differs by float rounding (see there).

Usage (about 15 s): python3 -B tools/sim/boss_baseline.py
"""
import sim
import tune

NOVA_ONLY = ("pip", "juno", "orion", "mira", "sol")
# The mixed board of support.test.ts (FULL): every class, every targeting mode. (pad, class, level, mode or None)
MIXED = [("P02", "orion", 3, "STRONG"), ("P04", "pip", 3, None), ("P05", "nova", 2, "FAST"), ("P09", "juno", 2, "CROWD"),
         ("P12", "sol", 2, None), ("P16", "mira", 3, None)]


def boards():
    """{boss wave: (margin, {pad: level})} for the Nova-only competent board before each boss wave."""
    d = sim.load_data()
    _, rows, _ = tune.measure(d, adapt=False, learn_p=0.0, quiet=True, banned=NOVA_ONLY, invulnerable=True)
    out = {}
    for r in rows:
        if d["waves"][r["wave"] - 1]["boss"]:
            pads = {}
            for part in r["st"].towers.split():
                pad, rest = part.split(":")
                assert rest.startswith("No"), part
                pads[pad] = int(rest[2:])
            out[r["wave"]] = (r["margin"], pads)
    return out


def play(wave, board, c63_release_times, health=20):
    """One boss wave at 60 Hz with this board fixed: [(pad, class, level, mode or None)]. Colony health and maximum
    `health`. Returns the numbers bosses.test.ts compares."""
    d = sim.load_data()
    g = sim.Game(d, tick_hz=60, health=health)
    g.all_pads_open = True
    g.wave = 50  # every class unlocked
    for pad, cls, level, mode in board:
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
    if c63_release_times:
        def queue(spec, prog):
            k = 0
            for r in spec:
                for _ in range(r["count"]):
                    g.releases.append([g.t + g.dt + k * g.caps["descendantReleaseGap"], g._rel_seq, r["type"], prog])
                    g._rel_seq += 1
                    k += 1
        g._queue_release = queue
    g.credits = 0
    g.stats = sim.WaveStats(wave)
    st = g.run_wave(g.wave_def(wave), None)
    return {
        "ticks": g.tick,
        "bossDefeated": bool(st.boss_killed),
        "defeated": st.kills,
        "leaked": leaked,
        "bounty": st.bounty,
        "bountyAvailable": st.bounty_available,
        "shots": st.shots,
        "damage": g.dmg_total,
        "health": g.health,
        "shield": g.shield,
        "spawned": st.spawned,
    }


def main():
    d = sim.load_data()
    for wave, (margin, pads) in sorted(boards().items()):
        boss = d["bosses"][d["waves"][wave - 1]["boss"]]
        board = " ".join("%s:%d" % (p.lower(), lv) for p, lv in sorted(pads.items()))
        print("wave %d %s (%s): margin %.2f, Nova board %s" % (wave, boss["name"], d["waves"][wave - 1]["boss"], margin, board))
        nova = [(p, "nova", lv, None) for p, lv in sorted(pads.items())]
        for c63 in (False, True):
            r = play(wave, nova, c63)
            print("  %-26s %s" % ("C6.3 release times:" if c63 else "simulator unchanged:", r))
    print("mixed board, colony 200:", " ".join("%s:%s%d%s" % (p.lower(), c, lv, ":" + m if m else "") for p, c, lv, m in MIXED))
    for wave in (10, 20, 30, 40, 50):
        for c63 in (False, True):
            r = play(wave, MIXED, c63, health=200)
            print("  wave %d %-22s %s" % (wave, "C6.3 release times:" if c63 else "simulator unchanged:", r))


if __name__ == "__main__":
    main()
