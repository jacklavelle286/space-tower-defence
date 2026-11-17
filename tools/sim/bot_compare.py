#!/usr/bin/env python3
"""The Python side of the Gate M LD0 spike: waves reached per policy, learning rate and seed, as JSON on stdout.

Usage: python3 tools/sim/bot_compare.py > results.json      (web/game-core/scripts/ld0-bots.spike.ts reads it)
Uses all CPU cores. Same settings as the C17.2 and C17.3 tables: fixed-pattern learning, meteor powers used.
"""
import json
import multiprocessing as mp

import sim

LEARN = (0.0, 0.6, 1.0)
NAIVE_SEEDS = range(1, 21)


def job(spec):
    data = sim.load_data()
    if spec["kind"] == "campaign":
        r = sim.run_campaign(data, spec["policy"], spec["learn"], True, spec["seed"])
        return {**spec, "cleared": r["cleared"], "health": r["health"]}
    ch = [c for c in data["challenges"] if c["id"] == spec["id"]][0]
    r = sim.run_challenge(data, ch, spec["policy"], spec["learn"], spec["seed"])
    return {**spec, "cleared": r["cleared"], "of": r["of"], "health": r["health"]}


def main():
    specs = [{"kind": "campaign", "policy": "competent", "learn": p, "seed": 1} for p in LEARN]
    specs += [{"kind": "campaign", "policy": "naive", "learn": p, "seed": s} for p in LEARN for s in NAIVE_SEEDS]
    for cid in ("blob-parade", "wobble-rematch", "bubble-trouble"):
        specs += [{"kind": "challenge", "id": cid, "policy": "competent", "learn": p, "seed": 1} for p in LEARN]
    with mp.Pool() as pool:
        out = pool.map(job, specs)
    print(json.dumps(out))


if __name__ == "__main__":
    main()
