#!/usr/bin/env python3
"""Runs the scenario matrix for Space Colony Defence and writes results.json.

Usage: python3 run_matrix.py [--quick]      (then: python3 tables.py to print the Markdown)
Python 3 standard library only. Uses all CPU cores.

THIS IS A COARSE MODEL WITH HEURISTIC PLAYERS. It is NOT validation with real children.
"""
import json
import multiprocessing as mp
import os
import sys
import time

import sim

HERE = os.path.dirname(os.path.abspath(__file__))
NAIVE_SEEDS = list(range(1, 21))
BERNOULLI_SEEDS = list(range(1, 6))


def row_dict(st):
    return {
        "wave": st.wave, "duration": round(st.duration, 1), "peak": st.peak_active, "peakDesc": st.peak_desc,
        "spawned": st.spawned, "kills": st.kills, "leaks": st.leaks, "leakDamage": st.leak_damage,
        "healthLost": st.health_lost, "shieldAbsorbed": st.shield_absorbed, "bounty": st.bounty,
        "bountyAvailable": st.bounty_available, "learn": st.learn, "spentPrep": st.spent_prep,
        "spentWave": st.spent_wave, "refund": st.refund, "creditsStart": st.credits_start,
        "creditsEnd": st.credits_end, "healthEnd": st.health_end, "shieldEnd": st.shield_end,
        "penetration": round(st.penetration, 2), "invested": st.invested, "towers": st.towers,
        "powers": st.powers_used, "deferred": st.deferred, "shots": st.shots, "maxShotsPerS": st.max_shots_per_s,
        "bossKilled": st.boss_killed, "bossLeaked": st.boss_leaked, "defeated": st.defeated,
    }


def job(spec):
    data = sim.load_data()
    kind = spec["kind"]
    t0 = time.time()
    if kind == "campaign":
        if spec.get("allPadsOpen"):
            for p in data["map"]["pads"]:
                p["opensAfterWave"] = 0
        r = sim.run_campaign(data, spec["policy"], spec["learn"], spec["meteor"], spec.get("seed", 1),
                             max_wave=spec.get("maxWave", 50), tick_hz=spec.get("tickHz", 30),
                             banned=spec.get("banned", ()), learn_mode=spec.get("learnMode", "pattern"),
                             policy_opts=spec.get("policyOpts"))
        g = r["game"]
        mix = {}
        for tw in g.towers.values():
            k = "%s%d" % (tw.cls, tw.level)
            mix[k] = mix.get(k, 0) + 1
        tot = float(max(1, sum(g.class_dmg.values())))
        out = {"spec": spec, "cleared": r["cleared"], "defeatedAt": r["defeated_at"], "health": r["health"],
               "shield": r["shield"], "credits": g.credits, "invested": g.invested_total(), "board": mix,
               "classDamagePct": {k: round(100.0 * v / tot, 1) for k, v in g.class_dmg.items()},
               "rows": [row_dict(st) for st in r["rows"]], "seconds": round(time.time() - t0, 1)}
        return out
    if kind == "margins":
        import tune
        _, rows, _ = tune.measure(data, adapt=False, learn_p=spec["learn"], quiet=True, banned=spec.get("banned", ()),
                                  invulnerable=bool(spec.get("banned")))
        return {"spec": spec, "margins": [{"wave": r["wave"], "margin": round(r["margin"], 2), "target": round(r["target"], 2),
                                           "leaks": r["st"].leaks} for r in rows]}
    if kind == "minimal":
        # three Novas on the three weakest starting pads, then never buys anything again
        g = sim.Game(data, tick_hz=30)
        start = sorted(g.free_pads(), key=lambda p: g.coverage(p, 2.5))[:3]
        script = {1: [("place", "nova", p) for p in start]}
        r = sim.run_campaign(data, "scripted", 0.0, False, 1, max_wave=spec.get("maxWave", 20), script=script)
        return {"spec": spec, "cleared": r["cleared"], "health": r["health"], "pads": start,
                "rows": [row_dict(st) for st in r["rows"]]}
    if kind == "challenge":
        ch = [c for c in data["challenges"] if c["id"] == spec["id"]][0]
        r = sim.run_challenge(data, ch, spec["policy"], spec["learn"], spec.get("seed", 1))
        return {"spec": spec, "cleared": r["cleared"], "of": r["of"], "health": r["health"],
                "rows": [row_dict(st) for st in r["rows"]]}
    raise ValueError(kind)


def build_specs(quick=False):
    specs = []
    # A. competent main matrix (deterministic learning pattern)
    for lp in (0.0, 0.6, 1.0):
        for met in (False, True):
            specs.append({"kind": "campaign", "group": "A", "policy": "competent", "learn": lp, "meteor": met, "seed": 1})
    # B. competent 60% with random (Bernoulli) learning outcomes
    for s in BERNOULLI_SEEDS:
        specs.append({"kind": "campaign", "group": "B", "policy": "competent", "learn": 0.6, "meteor": False, "seed": s,
                      "learnMode": "bernoulli"})
    # C. naive child
    seeds = NAIVE_SEEDS[:6] if quick else NAIVE_SEEDS
    for lp in (0.0, 0.6, 1.0):
        for met in (False, True):
            for s in seeds:
                specs.append({"kind": "campaign", "group": "C", "policy": "naive", "learn": lp, "meteor": met, "seed": s,
                              "learnMode": "bernoulli"})
    # C2. sensitivity: the same young player, but one who always upgrades when every pad is full
    for lp in (0.0, 0.6):
        for s in seeds:
            specs.append({"kind": "campaign", "group": "C2", "name": "eager upgrader", "policy": "naive", "learn": lp, "meteor": False,
                          "seed": s, "learnMode": "bernoulli", "policyOpts": {"p_upgrade_full": 1.0}})
    # D. ablations (competent, 60% pattern, no meteor) and class bans at 0%
    for ban in (["pip"], ["juno"], ["orion"], ["mira"], ["sol"], ["pip", "juno", "orion", "mira", "sol"]):
        for lp in (0.0, 0.6):
            specs.append({"kind": "campaign", "group": "D-ban", "policy": "competent", "learn": lp, "meteor": False,
                          "seed": 1, "banned": ban})
    specs.append({"kind": "campaign", "group": "D-opt", "name": "no in-wave buying", "policy": "competent", "learn": 0.0,
                  "meteor": False, "seed": 1, "policyOpts": {"in_wave_buying": False}})
    specs.append({"kind": "campaign", "group": "D-opt", "name": "Orion L3 set to STRONG", "policy": "competent", "learn": 0.0,
                  "meteor": False, "seed": 1, "policyOpts": {"smart_targeting": True}})
    specs.append({"kind": "campaign", "group": "D-opt", "name": "no selling (no swaps)", "policy": "competent", "learn": 0.0,
                  "meteor": False, "seed": 1, "policyOpts": {"allow_sell": False}})
    specs.append({"kind": "campaign", "group": "D-opt", "name": "60 Hz simulation tick", "policy": "competent", "learn": 0.0,
                  "meteor": False, "seed": 1, "tickHz": 60})
    specs.append({"kind": "campaign", "group": "D-opt", "name": "60 Hz simulation tick, 60%", "policy": "competent", "learn": 0.6,
                  "meteor": False, "seed": 1, "tickHz": 60})
    specs.append({"kind": "campaign", "group": "D-pads", "name": "all 16 pads open from wave 1", "policy": "competent",
                  "learn": 0.0, "meteor": False, "seed": 1, "allPadsOpen": True})
    for s in seeds:
        specs.append({"kind": "campaign", "group": "D-pads-naive", "name": "all 16 pads open from wave 1", "policy": "naive",
                      "learn": 0.6, "meteor": False, "seed": s, "learnMode": "bernoulli", "allPadsOpen": True})
    # M. margin of the competent board before each wave (largest health multiplier still stopped with no leak)
    specs.append({"kind": "margins", "group": "M", "learn": 0.0})
    specs.append({"kind": "margins", "group": "M", "learn": 0.6})
    for ban in (["pip"], ["juno"], ["orion"], ["mira"], ["sol"], ["pip", "juno", "orion", "mira", "sol"]):
        specs.append({"kind": "margins", "group": "BM", "learn": 0.0, "banned": ban})
        specs.append({"kind": "margins", "group": "BM", "learn": 0.6, "banned": ban})
    # E. minimal player
    specs.append({"kind": "minimal", "group": "E", "maxWave": 20})
    # F. challenges
    data = sim.load_data()
    for ch in data["challenges"]:
        specs.append({"kind": "challenge", "group": "F", "id": ch["id"], "policy": "competent", "learn": 0.6})
        specs.append({"kind": "challenge", "group": "F", "id": ch["id"], "policy": "competent", "learn": 0.0})
        for s in seeds[:10]:
            specs.append({"kind": "challenge", "group": "F", "id": ch["id"], "policy": "naive", "learn": 0.6, "seed": s})
    # G. endless continuation
    for lp in (0.0, 0.6, 1.0):
        specs.append({"kind": "campaign", "group": "G", "policy": "competent", "learn": lp, "meteor": True, "seed": 1,
                      "maxWave": 150})
    return specs


def main():
    quick = "--quick" in sys.argv
    specs = build_specs(quick)
    t0 = time.time()
    with mp.Pool(min(8, os.cpu_count() or 2)) as pool:
        results = pool.map(job, specs, chunksize=1)
    out = {"generatedSeconds": round(time.time() - t0, 1), "quick": quick, "results": results}
    with open(os.path.join(HERE, "results.json"), "w") as f:
        json.dump(out, f)
    print("ran %d scenarios in %.0fs -> results.json" % (len(specs), time.time() - t0))
    # short console summary
    for r in results:
        sp = r["spec"]
        if sp["kind"] == "campaign" and sp["group"] in ("A", "B", "D-ban", "D-opt", "D-pads", "G"):
            print("%-7s %-9s learn %3d%% meteor %-5s seed %2d %-34s -> cleared %3d health %3d invested %5d  %s" % (
                sp["group"], sp["policy"], sp["learn"] * 100, sp["meteor"], sp.get("seed", 1),
                sp.get("name") or (("ban " + "+".join(sp["banned"])) if sp.get("banned") else ""),
                r["cleared"], r["health"], r["invested"], r["classDamagePct"]))
    for lp in (0.0, 0.6, 1.0):
        for met in (False, True):
            xs = sorted(r["cleared"] for r in results if r["spec"]["group"] == "C" and r["spec"]["learn"] == lp and r["spec"]["meteor"] == met)
            if xs:
                print("C naive learn %3d%% meteor %-5s cleared: min %d median %d max %d  >=20: %d/%d  >=30: %d/%d  =50: %d/%d  %s" % (
                    lp * 100, met, xs[0], xs[len(xs) // 2], xs[-1], sum(x >= 20 for x in xs), len(xs),
                    sum(x >= 30 for x in xs), len(xs), sum(x >= 50 for x in xs), len(xs), xs))
    for lp in (0.0, 0.6):
        xs = sorted(r["cleared"] for r in results if r["spec"]["group"] == "C2" and r["spec"]["learn"] == lp)
        print("C2 eager upgrader learn %3d%%: %s" % (lp * 100, xs))
    xs = sorted(r["cleared"] for r in results if r["spec"]["group"] == "D-pads-naive")
    print("naive 60% all pads open:", xs)
    for r in results:
        if r["spec"]["kind"] == "minimal":
            print("minimal player: cleared", r["cleared"], "health", r["health"], r["pads"])
    for r in results:
        if r["spec"]["kind"] == "challenge" and r["spec"]["policy"] == "competent":
            print("challenge", r["spec"]["id"], "competent learn", r["spec"]["learn"], "cleared", r["cleared"], "/", r["of"], "health", r["health"])
    for cid in sorted(set(r["spec"]["id"] for r in results if r["spec"]["kind"] == "challenge")):
        xs = [(r["cleared"], r["health"]) for r in results if r["spec"]["kind"] == "challenge" and r["spec"]["id"] == cid and r["spec"]["policy"] == "naive"]
        print("challenge", cid, "naive:", xs)


if __name__ == "__main__":
    main()
