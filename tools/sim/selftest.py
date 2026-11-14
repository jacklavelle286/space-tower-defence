#!/usr/bin/env python3
"""Self-checks for the simulator and the data tables (run: python3 selftest.py)."""
import random

import sim


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)


def main():
    d = sim.load_data()
    # 1. data sanity
    waves = d["waves"]
    check(len(waves) == 50, "50 waves")
    check([w["wave"] for w in waves if w["boss"]] == [10, 20, 30, 40, 50], "bosses on 10/20/30/40/50")
    pads = d["map"]["pads"]
    check(12 <= len(pads) <= 16, "12-16 pads")
    r = sim.Route(d["map"]["route"])
    for p in pads:
        ivs0 = r.intervals(p["x"], p["y"], 0.99)
        check(not ivs0, "pad %s must be at least one tile from the route" % p["id"])
    seen = set()
    for w in waves:
        for g in w["groups"]:
            t = g["type"]
            if t in d["aliens"]:
                check(d["aliens"][t]["firstWave"] <= w["wave"], "%s appears in wave %d before its firstWave" % (t, w["wave"]))
                if t not in seen:
                    check(d["aliens"][t]["firstWave"] == w["wave"], "firstWave of %s should be %d" % (t, w["wave"]))
                    seen.add(t)
    # 2. no class is needed before it is unlocked: every wave uses only catalogue aliens; classes are advantages (see ablations)
    # 3. sell / rebuy can never mint credits: W = credits + invested never increases through shop actions
    rng = random.Random(7)
    g = sim.Game(d)
    g.wave = 50
    g.credits = 3000
    w0 = g.credits + g.invested_total()
    for _ in range(20000):
        a = rng.random()
        before = g.credits + g.invested_total()
        if a < 0.4:
            free = g.free_pads()
            if free:
                g.place(rng.choice(list(d["classes"])), rng.choice(free))
        elif a < 0.7:
            if g.towers:
                g.upgrade(rng.choice(list(g.towers)))
        else:
            if g.towers:
                g.sell(rng.choice(list(g.towers)))
        after = g.credits + g.invested_total()
        check(after <= before, "shop action increased credits + invested")
        check(g.credits >= 0, "negative credits")
        for c, cd in d["classes"].items():
            if cd["deployCap"] is not None:
                check(g.count(c) <= cd["deployCap"], "deploy cap exceeded for " + c)
    check(g.credits + g.invested_total() <= w0, "wealth grew")
    # 4. refunds: strictly less than invested, multiple of 5, covers purchase + upgrades
    for c, cd in d["classes"].items():
        inv = 0
        for lv in cd["levels"]:
            inv += lv["cost"]
            ref = (inv * 70 // 100) // 5 * 5
            check(0 < ref < inv and ref % 5 == 0, "refund rule")
    # 5. bounty accounting and descendant resolution on a full competent run
    res = sim.run_campaign(d, "competent", 0.6, True, 1)
    check(res["cleared"] == 50, "competent 60% should clear the campaign")
    for st in res["rows"]:
        if st.leaks == 0:
            check(st.bounty == st.bounty_available, "wave %d: bounty %d != available %d" % (st.wave, st.bounty, st.bounty_available))
        check(st.kills + st.leaks == st.spawned, "wave %d: every spawned alien is resolved exactly once" % st.wave)
        check(st.peak_active <= d["caps"]["maxActiveAliens"], "active cap")
        check(st.peak_desc <= d["caps"]["maxLiveDescendants"], "descendant cap")
    # 6. determinism: same inputs -> identical outcome
    a = sim.run_campaign(d, "naive", 0.6, True, 5, learn_mode="bernoulli")
    b = sim.run_campaign(d, "naive", 0.6, True, 5, learn_mode="bernoulli")
    check([(s.wave, s.bounty, s.leaks, round(s.duration, 3)) for s in a["rows"]] == [(s.wave, s.bounty, s.leaks, round(s.duration, 3)) for s in b["rows"]], "determinism")
    # 7. targeting modes and slow cap run without error; slow never exceeds the cap
    g = sim.Game(d)
    g.wave = 49
    g.credits = 10 ** 6
    g.all_pads_open = True
    for pad, cls in (("P05", "nova"), ("P08", "pip"), ("P13", "juno"), ("P09", "orion"), ("P04", "pip"), ("P10", "sol"), ("P15", "mira")):
        g.place(cls, pad)
        g.upgrade(pad)
        g.upgrade(pad)
    check(g.set_mode("P05", "FAST") and g.set_mode("P08", "FAST") and g.set_mode("P13", "FRONT") and g.set_mode("P09", "STRONG"), "set_mode")
    check(not g.set_mode("P05", "STRONG"), "Nova has no STRONG mode")
    g.powers = {"frost_pulse": 1, "comet_burst": 1, "colony_shield": 1}
    g.max_health = g.health = 10 ** 6  # this small test board leaks; keep the colony alive so the wave fully resolves

    class P:
        tick_interval = 1.0

        def tick(self, game, t):
            for a in game.active:
                check(a.slow <= 0.5 + 1e-9, "slow above cap")
            if t >= 10 and game.can_use_power("frost_pulse"):
                game.use_power("frost_pulse")
            if t >= 20 and game.can_use_power("comet_burst"):
                fr = [a.prog for a in game.active if a.alive]
                if fr:
                    game.use_power("comet_burst", max(fr))
            if t >= 30 and game.can_use_power("colony_shield"):
                game.use_power("colony_shield")
    g.stats = sim.WaveStats(49)
    st = g.run_wave(g.wave_def(49), P())
    check(len(st.powers_used) == 3, "three powers used")
    check(g.shield <= d["colony"]["shieldCap"], "shield trimmed to cap at wave end")
    check(st.kills + st.leaks == st.spawned, "wave 49 resolution")
    # 8. endless generator is deterministic and capped
    e = d["endless"]
    for n in (51, 60, 99, 120, 150, 500):
        wd = g.wave_def(n)
        check(wd == g.wave_def(n), "endless determinism")
        check(wd["hpMult"] <= e["hpMult"]["cap"] and wd["speedMult"] <= e["speedMult"]["cap"], "endless caps")
        check(sum(x["count"] for x in wd["groups"]) <= e["maxScheduledSpawnsPerWave"], "endless spawn bound")
    check(g.wave_def(500)["groups"] == g.wave_def(1000)["groups"], "plateau: identical waves after caps")
    # 9. worked example: recompute the credit arithmetic straight from the data tables, without the simulator
    import example
    cost = {c: [lv["cost"] for lv in v["levels"]] for c, v in d["classes"].items()}

    def wave_bounty(w):
        return sum(x["count"] * d["aliens"][x["type"]]["bounty"] for x in d["waves"][w - 1]["groups"])
    for script, fails in ((example.SCRIPT_ALL, set()), (example.SCRIPT_TWO_FAILS, {2, 4})):
        credits = d["economy"]["startingCredits"]
        levels = {}
        expect = []
        for w in range(1, 7):
            if w > 1 and (w - 1) not in fails:
                credits += [b["credits"] for b in d["economy"]["learningRewardByBlock"] if b["afterWaveFrom"] <= w - 1 <= b["afterWaveTo"]][0]
            for act in script.get(w, []):
                if act[0] == "place":
                    credits -= cost[act[1]][0]
                    levels[act[2]] = (act[1], 1)
                else:
                    c, lv = levels[act[1]]
                    credits -= cost[c][lv]
                    levels[act[1]] = (c, lv + 1)
                check(credits >= 0, "worked example goes negative")
            credits += wave_bounty(w)
            expect.append(credits)
        got = [row["end"] for row in example.run(script, fails, d)]
        check(got == expect, "worked example arithmetic: simulator %s vs data %s" % (got, expect))
        check(all(row["leaks"] == 0 for row in example.run(script, fails, d)), "worked example leaks")
    print("selftest: all checks passed")


if __name__ == "__main__":
    main()
