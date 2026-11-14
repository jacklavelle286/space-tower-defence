#!/usr/bin/env python3
"""Worked early-run example (waves 1-6) with exact credit arithmetic, run through the simulator.

Prints a Markdown table for the all-correct run and for the variant in which two activities fail.
The combat and the rewards are identical for every age; only the activity content differs.
"""
import sim

SUBJECTS = ["maths", "phonics", "spelling"]

SCRIPT_ALL = {
    1: [("place", "nova", "P05"), ("place", "nova", "P09"), ("place", "nova", "P12")],
    2: [("place", "nova", "P04")],
    3: [("upgrade", "P05")],
    4: [("place", "nova", "P16")],
    5: [("upgrade", "P09")],
    6: [("place", "pip", "P13")],
}
SCRIPT_TWO_FAILS = {
    1: [("place", "nova", "P05"), ("place", "nova", "P09"), ("place", "nova", "P12")],
    2: [("place", "nova", "P04")],
    3: [],
    4: [("place", "nova", "P16")],
    5: [("upgrade", "P05")],
    6: [("place", "pip", "P13")],
}


def describe(g, act):
    if act[0] == "place":
        c = g.classes[act[1]]
        return "Place %s (%s) on %s: -%d" % (c["name"], c["role"], act[2], g.lv(act[1], 1)["cost"])
    if act[0] == "upgrade":
        tw = g.towers[act[1]]
        return "Upgrade %s on %s to level %d: -%d" % (g.classes[tw.cls]["name"], act[1], tw.level + 1, g.lv(tw.cls, tw.level + 1)["cost"])
    return str(act)


def run(script, fails, data=None, waves=6):
    data = data or sim.load_data()
    g = sim.Game(data)
    lines = []
    credits_log = []
    for w in range(1, waves + 1):
        g.wave = w
        st = sim.WaveStats(w)
        g.stats = st
        start = g.credits
        reward_txt = "-"
        if w > 1:
            subj = SUBJECTS[(w - 2) % 3]
            r = sim.learning_reward(data, w - 1)
            if (w - 1) in fails:
                reward_txt = "Activity after wave %d (subject: %s), slot N-%03d: three wrong answers, +0" % (w - 1, subj, w - 1)
            else:
                g.credits += r
                reward_txt = "Activity after wave %d (subject: %s), slot N-%03d: correct, +%d" % (w - 1, subj, w - 1, r)
        after_learn = g.credits
        buys = []
        for act in script.get(w, []):
            txt = describe(g, act)
            ok = g.place(act[1], act[2]) if act[0] == "place" else g.upgrade(act[1])
            assert ok, (w, act, g.credits)
            buys.append(txt)
        after_buy = g.credits
        wd = g.wave_def(w)
        st.towers = sim.describe_towers(g)
        g.run_wave(wd, None)
        comp = ", ".join("%d %s" % (x["count"], data["aliens"][x["type"]]["name"]) for x in wd["groups"])
        lines.append({"wave": w, "start": start, "reward": reward_txt, "afterLearn": after_learn, "buys": buys or ["(nothing bought)"],
                      "afterBuy": after_buy, "aliens": comp, "bounty": st.bounty, "end": g.credits, "leaks": st.leaks,
                      "health": g.health, "duration": st.duration, "board": st.towers, "pen": st.penetration})
    return lines


def markdown(lines):
    out = ["| Wave | Credits at start of interval | Learning activity (identical reward for every age) | Purchases before Ready | Credits at Ready | Aliens | Bounty earned | Credits after wave | Leaks | Colony health |",
           "|---|---|---|---|---|---|---|---|---|---|"]
    for l in lines:
        out.append("| %d | %d | %s | %s | %d | %s | +%d | %d | %d | %d |" % (
            l["wave"], l["start"], l["reward"], "; ".join(l["buys"]), l["afterBuy"], l["aliens"], l["bounty"], l["end"], l["leaks"], l["health"]))
    return "\n".join(out)


if __name__ == "__main__":
    a = run(SCRIPT_ALL, set())
    print("All six activities correct\n")
    print(markdown(a))
    b = run(SCRIPT_TWO_FAILS, {2, 4})
    print("\nActivities after waves 2 and 4 failed\n")
    print(markdown(b))
    for l in a:
        print(l["wave"], l["board"], round(l["duration"], 1), round(l["pen"], 2))
