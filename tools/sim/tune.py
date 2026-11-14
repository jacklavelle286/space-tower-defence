#!/usr/bin/env python3
"""Tuning aid (not part of the game).

Plays the campaign with the competent policy (default: 0% learning, no meteor powers). Before each wave it
measures the board's MARGIN: the largest health multiplier (relative to the wave as authored) that the present
board still stops with no leak and no further purchases. With --adapt it also rescales each wave on the fly so
the margin follows a target curve:
  * ordinary waves: the group counts are scaled (arrival time span kept) - 'more aliens' is the main lever;
  * boss waves: only the boss's health is changed, escorts stay as authored;
  * gentle introduction waves are left exactly as authored.
The result is written to tuned.json, which make_data.py folds into game_data.json.

Usage: python3 tune.py [--adapt] [--learn 0.0]
"""
import copy
import json
import os
import random
import sys

import make_data as md
import sim

HERE = os.path.dirname(os.path.abspath(__file__))

ANCHORS = [(1, 4.0), (3, 3.5), (5, 3.0), (9, 2.6), (10, 2.0), (11, 2.4), (19, 2.0), (20, 1.6), (21, 1.85), (29, 1.55),
           (30, 1.35), (31, 1.45), (39, 1.28), (40, 1.18), (41, 1.22), (49, 1.10), (50, 1.06)]
INTRO = (1, 2, 3, 6, 8, 12, 14, 22, 24, 27)
C_GRID = [round(0.6 + 0.05 * i, 2) for i in range(18)]  # 0.60 .. 1.45


def target_margin(w, anchors=ANCHORS):
    pts = sorted(anchors)
    if w <= pts[0][0]:
        return pts[0][1]
    for (w0, m0), (w1, m1) in zip(pts, pts[1:]):
        if w0 <= w <= w1:
            return m0 + (m1 - m0) * (w - w0) / float(w1 - w0)
    return pts[-1][1]


def measure(data, adapt=False, learn_p=0.0, quiet=False, policy_opts=None, max_wave=50, anchors=ANCHORS, banned=(), invulnerable=False):
    data = copy.deepcopy(data)
    g = sim.Game(data, banned=banned)
    if invulnerable:
        g.max_health = g.health = 10 ** 6  # measure board strength on every wave even if the colony would have fallen
    pol = sim.Competent(g, use_powers=False, **(policy_opts or {}))
    rows = []
    rng = random.Random(1)
    tuned = {"countScale": {}, "bossHp": {}}
    for w in range(1, max_wave + 1):
        g.wave = w
        st = sim.WaveStats(w)
        g.stats = st
        st.credits_start = g.credits
        if w > 1 and sim.learn_success(learn_p, w - 1, rng, "pattern"):
            r = sim.learning_reward(data, w - 1)
            g.credits += r
            st.learn = r
        pol.prep(w)
        wd = data["waves"][w - 1]
        tgt = target_margin(w, anchors)
        s0 = sim.break_scale(g, wd, tick_hz=30)
        info = ""
        if adapt and w not in INTRO:
            if wd.get("boss"):
                b = data["bosses"][wd["boss"]]
                lo, hi = 100.0, 80000.0
                for _ in range(12):
                    mid = (lo * hi) ** 0.5
                    b["hp"] = int(round(mid / 50.0) * 50)
                    if sim.break_scale(g, wd, tick_hz=30) >= tgt:
                        lo = mid
                    else:
                        hi = mid
                b["hp"] = int(round(lo / 50.0) * 50)
                tuned["bossHp"][wd["boss"]] = b["hp"]
                info = "bossHp %d" % b["hp"]
            else:
                lo_i, hi_i = 0, len(C_GRID) - 1
                # largest c on the grid whose margin is still >= target
                if sim.break_scale(g, md.build_wave(w, C_GRID[hi_i]), tick_hz=30) >= tgt:
                    best = hi_i
                elif sim.break_scale(g, md.build_wave(w, C_GRID[lo_i]), tick_hz=30) < tgt:
                    best = lo_i
                else:
                    while hi_i - lo_i > 1:
                        mid = (lo_i + hi_i) // 2
                        if sim.break_scale(g, md.build_wave(w, C_GRID[mid]), tick_hz=30) >= tgt:
                            lo_i = mid
                        else:
                            hi_i = mid
                    best = lo_i
                c = C_GRID[best]
                tuned["countScale"][str(w)] = c
                wd = md.build_wave(w, c)
                data["waves"][w - 1] = wd
                info = "count x%.2f" % c
        s1 = sim.break_scale(g, wd, tick_hz=30)
        st.towers = sim.describe_towers(g)
        g.run_wave(wd, pol)
        st.invested = g.invested_total()
        pol.after_wave(st)
        n = sum(x["count"] for x in wd["groups"])
        rows.append({"wave": w, "margin0": s0, "target": tgt, "margin": s1, "info": info, "st": st, "n": n})
        if not quiet:
            cnt = {}
            for tw in g.towers.values():
                cnt[tw.cls] = cnt.get(tw.cls, 0) + 1
            mix = " ".join("%s%d" % (k[:2].title(), cnt[k]) for k in ("nova", "pip", "juno", "orion", "mira", "sol") if k in cnt)
            print("w%2d margin %5.2f target %4.2f -> %5.2f %-12s| hp x%4.2f n %3d | dur %5.1f peak %2d pen %.2f leaks %2d hp %2d sh %2d | bounty %3d cr %4d inv %5d | %s" % (
                w, s0, tgt, s1, info, wd["hpMult"], n, st.duration, st.peak_active, st.penetration, st.leaks, g.health, g.shield,
                st.bounty_available, g.credits, st.invested, mix))
            if w == max_wave or st.defeated:
                print("final board:", st.towers)
            sys.stdout.flush()
        if st.defeated:
            break
    data["_classDmg"] = dict(g.class_dmg)
    return data, rows, tuned


if __name__ == "__main__":
    adapt = "--adapt" in sys.argv
    lp = 0.0
    if "--learn" in sys.argv:
        lp = float(sys.argv[sys.argv.index("--learn") + 1])
    d = sim.load_data()
    d2, rows, tuned = measure(d, adapt=adapt, learn_p=lp)
    print("damage share by class:", {k: round(100.0 * v / max(1, sum(d2["_classDmg"].values()))) for k, v in d2["_classDmg"].items()})
    if adapt:
        with open(os.path.join(HERE, "tuned.json"), "w") as f:
            json.dump(tuned, f, indent=1, sort_keys=True)
        print("wrote tuned.json:", json.dumps(tuned, sort_keys=True))
        print("total bounty:", sum(r["st"].bounty_available for r in rows))
