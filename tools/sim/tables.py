#!/usr/bin/env python3
"""Prints every design table as Markdown, generated from game_data.json (and results.json for simulator output).

Usage:
  python3 tables.py                # writes tables.json (name -> Markdown) and prints a list of table names
  python3 tables.py --results      # also writes results.md
The report is assembled from these tables by build_report.py, so the report and the data file cannot disagree.
"""
import json
import math
import os
import statistics
import sys

import example
import sim

HERE = os.path.dirname(os.path.abspath(__file__))


def tbl(headers, rows):
    out = ["| " + " | ".join(str(h) for h in headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    for r in rows:
        out.append("| " + " | ".join(str(c).replace("|", "/") for c in r) + " |")
    return "\n".join(out)


def num(x):
    if isinstance(x, float):
        s = ("%.3f" % x).rstrip("0").rstrip(".")
        return s
    return str(x)


def tiles(x):
    return "%s tile%s" % (num(x), "" if abs(x - 1.0) < 1e-9 else "s")


class T:
    def __init__(self):
        self.d = sim.load_data()
        self.g = sim.Game(self.d)
        self.route = self.g.route
        rp = os.path.join(HERE, "results.json")
        self.res = json.load(open(rp))["results"] if os.path.exists(rp) else []
        self.t = {}

    # ---------------- helpers over results ----------------
    def pick(self, **kw):
        out = []
        for r in self.res:
            sp = r["spec"]
            if all(sp.get(k) == v for k, v in kw.items()):
                out.append(r)
        return out

    def one(self, **kw):
        x = self.pick(**kw)
        return x[0] if x else None

    def alien_name(self, t):
        if t in self.d["bosses"]:
            return self.d["bosses"][t]["name"]
        return self.d["aliens"][t]["name"]

    # ---------------- map ----------------
    def map_tables(self):
        d = self.d
        r = self.route
        rows = []
        for i, (c0, c1, x0, y0, ux, uy) in enumerate(r.seg):
            x1, y1 = x0 + ux * (c1 - c0), y0 + uy * (c1 - c0)
            direction = "right" if ux > 0 else "left" if ux < 0 else "down" if uy > 0 else "up"
            rows.append([i + 1, "(%g, %g)" % (x0, y0), "(%g, %g)" % (x1, y1), direction, num(c1 - c0), num(c1)])
        self.t["route"] = tbl(["Segment", "From waypoint", "To waypoint", "Direction", "Length (tiles)", "Route progress at end"], rows)
        prow = []
        for p in d["map"]["pads"]:
            x, y = p["x"], p["y"]
            cov = [sum(b - a for a, b in r.intervals(x, y, rg)) for rg in (2.5, 3.0, 4.5, 6.0)]
            n45 = sum(1 for q in d["map"]["pads"] if q["id"] != p["id"] and math.hypot(q["x"] - x, q["y"] - y) <= 4.5 + 1e-9)
            n60 = sum(1 for q in d["map"]["pads"] if q["id"] != p["id"] and math.hypot(q["x"] - x, q["y"] - y) <= 6.0 + 1e-9)
            opens = "start" if p["opensAfterWave"] == 0 else "after wave %d" % p["opensAfterWave"]
            prow.append([p["id"], "(%d, %d)" % (x, y), opens, "%.1f" % cov[0], "%.1f" % cov[1], "%.1f" % cov[2], "%.1f" % cov[3], n45, n60, p["note"]])
        self.t["pads"] = tbl(["Pad", "Tile (x, y)", "Opens", "Route in range 2.5", "range 3.0", "range 4.5", "range 6.0",
                              "Pads within 4.5", "Pads within 6.0", "Tactical note"], prow)
        stages = {}
        for p in d["map"]["pads"]:
            stages.setdefault(p["opensAfterWave"], []).append(p["id"])
        unlock = {c["unlockAfterWave"]: c["name"] for c in d["classes"].values()}
        srow = []
        tot = 0
        for w in sorted(stages):
            tot += len(stages[w])
            srow.append(["start of run" if w == 0 else "after wave %d (preparing wave %d)" % (w, w + 1), ", ".join(stages[w]), tot, unlock.get(w, "-")])
        self.t["pad_stages"] = tbl(["When", "Pads that open", "Pads open in total", "Class unlocked at the same moment"], srow)

    # ---------------- roster ----------------
    def roster(self):
        d = self.d
        rows = []
        for cid, c in d["classes"].items():
            cum = 0
            for lv in c["levels"]:
                cum += lv["cost"]
                refund = (cum * d["combatRules"]["sell"]["refundPct"] // 100) // d["combatRules"]["sell"]["roundDownTo"] * d["combatRules"]["sell"]["roundDownTo"]
                rng = num(lv["range"]) if "range" in lv else "-"
                per = num(lv["period"]) if "period" in lv else "-"
                dmg = lv.get("damage", "-")
                dps = "%.1f" % (lv["damage"] / lv["period"]) if "damage" in lv else "-"
                if cid == "pip":
                    sp = "slow %d%% for %ss%s" % (lv["slowPct"], num(lv["slowDuration"]), (" to every alien within %s of the target" % tiles(lv["slowRadius"])) if lv["slowRadius"] else " (single target)")
                elif cid == "juno":
                    sp = "blast radius %s, full damage to every alien inside" % tiles(lv["splashRadius"])
                elif cid == "mira":
                    sp = "+%d shield point%s every %ss (colony shield cap %d)%s" % (lv["shieldPoints"], "" if lv["shieldPoints"] == 1 else "s", num(lv["period"]), d["colony"]["shieldCap"],
                                                                               ("; +%d colony health when a wave is cleared" % lv["repairOnWaveClear"]) if lv["repairOnWaveClear"] else "")
                    per = "-"
                elif cid == "sol":
                    sp = "+%d%% damage to attacking astronauts on pads within %s tiles" % (lv["buffPct"], num(lv["radius"]))
                elif cid == "orion" and lv["level"] == 3:
                    sp = "unlocks the STRONG targeting option"
                else:
                    sp = "-"
                rows.append(["%s - %s" % (c["name"], c["role"]) if lv["level"] == 1 else "", lv["level"], lv["cost"], cum, refund, rng, per, dmg, dps, sp])
        self.t["roster"] = tbl(["Class", "Level", "Cost of this level", "Cumulative cost", "Sell refund at this level", "Range (tiles)", "Attack period (s)", "Damage per hit", "Damage per second", "Special values"], rows)
        rows = []
        for cid, c in d["classes"].items():
            modes = c["targeting"]
            if modes:
                parts = []
                for m in modes:
                    lvl = c["targetingFromLevel"].get(m, 1)
                    parts.append(m + (" (default)" if m == modes[0] else "") + ((" from level %d" % lvl) if lvl > 1 else ""))
                mt = ", ".join(parts)
            else:
                mt = "none (does not attack)"
            rows.append([c["name"], c["role"], "start" if c["unlockAfterWave"] == 0 else "after wave %d" % c["unlockAfterWave"],
                         c["deployCap"] if c["deployCap"] is not None else "no cap", mt, sum(l["cost"] for l in c["levels"])])
        self.t["classes"] = tbl(["Name", "Role", "Unlocks", "Deployment cap", "Targeting options", "Total cost to level 3"], rows)
        self.t["targeting"] = tbl(["Mode", "Exact rule"], [[k, v] for k, v in d["combatRules"]["targetingModes"].items()])

    # ---------------- aliens / bosses ----------------
    def aliens(self):
        d = self.d
        rows = []
        for aid, a in d["aliens"].items():
            ch = a["traits"].get("children")
            desc = "-"
            if ch:
                desc = ", ".join("%d %s (bounty %d each)" % (c["count"], d["aliens"][c["type"]]["name"], d["aliens"][c["type"]]["bounty"]) for c in ch)
            fw = ("wave %d" % a["firstWave"]) + (" (as a descendant)" if a.get("descendantOnly") else "")
            rows.append([a["name"], a["hp"], num(a["speed"]), a["leak"], a["bounty"], a["traitRule"], fw, desc, a["cue"]])
        self.t["aliens"] = tbl(["Alien", "Base health", "Base speed (tiles/s)", "Leak damage", "Bounty", "Trait (exact rule)", "First appears", "Descendants and their bounties", "Silhouette / motion cue"], rows)
        c = d["caps"]
        self.t["caps"] = tbl(["Limit", "Value"], [
            ["Maximum active aliens (hard cap, descendants included)", c["maxActiveAliens"]],
            ["Scheduled spawns wait while this many aliens are active (soft cap)", c["scheduledSpawnSoftCap"]],
            ["Maximum live descendants", c["maxLiveDescendants"]],
            ["Gap between descendants released by one parent", "%ss" % num(c["descendantReleaseGap"])],
            ["Minimum gap between deferred scheduled spawns", "%ss" % num(c["deferredSpawnGap"])],
            ["Maximum descendant depth", c["maxDescendantDepth"]],
        ])
        rows = []
        prow = []
        for bid, b in d["bosses"].items():
            wd = d["waves"][b["wave"] - 1]
            esc = "; ".join("%d %s" % (g["count"], self.alien_name(g["type"])) for g in wd["groups"] if g["type"] != bid)
            rows.append([b["name"], b["wave"], b["based"], b["hp"], num(b["speed"]), b["leak"], b["bounty"], esc])
            for i, ph in enumerate(b["phases"]):
                oe = ph.get("onEnter", {})
                acts = []
                if "selfBubbles" in oe:
                    acts.append("gains %d bubble layers" % oe["selfBubbles"])
                if "giveBubbles" in oe:
                    acts.append("gives %d bubble layer to every alien within %s tiles" % (oe["giveBubbles"]["layers"], num(oe["giveBubbles"]["radius"])))
                if "release" in oe:
                    acts.append("releases " + ", ".join("%d %s" % (r["count"], self.alien_name(r["type"])) for r in oe["release"]))
                prow.append([b["name"] if i == 0 else "", i + 1, ph["name"], "from %d%% health" % ph["fromPct"], ph["armour"], "x%s" % num(ph["speedFactor"]),
                             "; ".join(acts) or "-", ph["cue"]])
            if b.get("onDefeatRelease"):
                prow.append(["", "end", "Defeated", "0% health", "-", "-", "releases " + ", ".join("%d %s" % (r["count"], self.alien_name(r["type"])) for r in b["onDefeatRelease"]), "Pops into a large star burst."])
        self.t["bosses"] = tbl(["Boss (proposal name)", "Wave", "Appearance", "Health", "Speed (tiles/s)", "Leak damage", "Bounty", "Escorts in the wave"], rows)
        self.t["boss_phases"] = tbl(["Boss", "Phase", "Name", "Starts", "Armour", "Speed", "On entering the phase", "Visual cue"], prow)

    # ---------------- waves ----------------
    def group_text(self, g):
        nm = self.alien_name(g["type"])
        if g["type"] in self.d["bosses"]:
            return "BOSS %s @%ss" % (nm, num(g["at"]))
        s = "%d %s @%ss" % (g["count"], nm, num(g["at"]))
        if g["count"] > 1:
            s += " every %ss" % num(g["gap"])
        if g.get("cargo"):
            s += " (cargo: " + ", ".join("%d %s" % (c["count"], self.alien_name(c["type"])) for c in g["cargo"]) + ")"
        return s

    def total_aliens(self, wd):
        n = 0
        for g in wd["groups"]:
            n += g["count"] * self._count_with_desc(g["type"], g.get("cargo"))
        return n

    def _count_with_desc(self, typ, cargo):
        d = self.d
        if typ in d["bosses"]:
            b = d["bosses"][typ]
            n = 1
            for ph in b["phases"]:
                for r in ph.get("onEnter", {}).get("release", []):
                    n += r["count"] * self._count_with_desc(r["type"], None)
            for r in b.get("onDefeatRelease", []):
                n += r["count"] * self._count_with_desc(r["type"], None)
            return n
        a = d["aliens"][typ]
        n = 1
        ch = cargo if cargo else a["traits"].get("children")
        if ch:
            for r in ch:
                n += r["count"] * self._count_with_desc(r["type"], None)
        return n

    def waves(self):
        d = self.d
        a0 = self.one(group="A", learn=0.0, meteor=False)
        a60 = self.one(group="A", learn=0.6, meteor=False)
        marg = self.one(kind="margins", group="M", learn=0.0)
        mmap = {m["wave"]: m["margin"] for m in marg["margins"]} if marg else {}
        worst = {}
        for r in self.res:
            sp = r["spec"]
            if sp["kind"] == "campaign" and sp.get("maxWave", 50) == 50 and not sp.get("allPadsOpen"):
                for row in r["rows"]:
                    w = row["wave"]
                    worst[w] = max(worst.get(w, 0), row["peak"])
        rows = []
        self.wave_meta = {}
        for wd in d["waves"]:
            w = wd["wave"]
            scheduled = sum(g["count"] for g in wd["groups"])
            total = self.total_aliens(wd)
            span = max(g["at"] + g["gap"] * (g["count"] - 1) for g in wd["groups"])
            bounty = self.g.wave_bounty_available(wd)
            r0 = a0["rows"][w - 1] if a0 and len(a0["rows"]) >= w else None
            r6 = a60["rows"][w - 1] if a60 and len(a60["rows"]) >= w else None
            mods = "health x%s" % num(wd["hpMult"])
            if wd["speedMult"] != 1.0:
                mods += ", speed x%s" % num(wd["speedMult"])
            note = wd["newThisWave"]
            if wd["note"]:
                note = (note + "; " if note else "") + wd["note"]
            ucls = [c["name"] for c in d["classes"].values() if c["unlockAfterWave"] == w - 1 and w > 1]
            rows.append([w, "; ".join(self.group_text(g) for g in wd["groups"]), mods, note or "-",
                         "%d (%d)" % (scheduled, total) if total != scheduled else scheduled, bounty, "%.0f" % span,
                         ("%.0f / %.0f" % (r0["duration"], r6["duration"])) if r0 and r6 else "-",
                         ("%d / %d" % (r0["peak"], worst.get(w, 0))) if r0 else "-", mmap.get(w, "-")])
            self.wave_meta[w] = {"scheduled": scheduled, "total": total, "bounty": bounty, "span": span}
        self.t["waves"] = tbl(["Wave", "Spawn groups: count, type, start time, spacing", "Modifiers", "New this wave / note", "Aliens scheduled (with descendants)",
                               "Total bounty available", "Last scheduled spawn (s)", "Duration at 1x (s): competent 0% / 60%", "Peak concurrent aliens: competent 0% / worst seen in any campaign scenario",
                               "Margin (competent, 0% learning)"], rows)

    # ---------------- economy ----------------
    def economy(self):
        d = self.d
        e = d["economy"]
        rows = []
        tot = 0
        for b in e["learningRewardByBlock"]:
            n = b["afterWaveTo"] - b["afterWaveFrom"] + 1
            tot += n * b["credits"]
            ws = [w for w in range(b["afterWaveFrom"] + 1, b["afterWaveTo"] + 2)]
            mean_b = statistics.mean(self.wave_meta[w]["bounty"] for w in ws)
            rows.append(["after waves %d-%d" % (b["afterWaveFrom"], b["afterWaveTo"]), b["credits"], n, n * b["credits"], "%.0f" % mean_b, "%d%%" % round(100.0 * b["credits"] / mean_b)])
        rows.append(["Total", "", 49, tot, "", ""])
        self.t["learning_rewards"] = tbl(["Interval", "Credits for a successful normal activity (same for every age)", "Intervals", "Credits in block at 100%", "Mean bounty of the following waves", "Reward as a share of that bounty"], rows)
        self.learn_total = tot
        # income curves (expected, assuming no leaks)
        rows = []
        cum_b = 0
        cum_l = 0
        for w in range(1, 51):
            cum_b += self.wave_meta[w]["bounty"]
            if w <= 49:
                cum_l += sim.learning_reward(d, w)
            if w % 5 == 0:
                s = e["startingCredits"]
                rows.append([w, cum_b, cum_l if w < 50 else cum_l, s + cum_b, "%.0f" % (s + cum_b + 0.6 * cum_l), s + cum_b + cum_l])
        self.t["income"] = tbl(["After wave (and the activity that follows it)", "Cumulative bounty (no leaks)", "Cumulative learning rewards at 100%", "Total credits ever held at 0% learning (start + bounty)", "at 60% (expected value)", "at 100%"], rows)
        self.bounty_total = cum_b
        # blueprint field cost
        cls = d["classes"]
        full = {c: sum(l["cost"] for l in v["levels"]) for c, v in cls.items()}
        bp = sim.Competent.BLUEPRINT
        cnt = {}
        for pad, c in bp.items():
            cnt[c] = cnt.get(c, 0) + 1
        rows = [[cls[c]["name"], cnt[c], full[c], cnt[c] * full[c]] for c in cls if c in cnt]
        self.field_cost = sum(cnt[c] * full[c] for c in cnt)
        rows.append(["Total", sum(cnt.values()), "", self.field_cost])
        self.t["field_cost"] = tbl(["Class", "Astronauts in the reference board", "Cost each at level 3", "Cost"], rows)
        # purchasing power
        rows = []
        for b in e["learningRewardByBlock"]:
            r = b["credits"]
            avail = [c for c in cls.values() if c["unlockAfterWave"] <= b["afterWaveFrom"]]
            newest = max(avail, key=lambda c: c["unlockAfterWave"])
            rows.append(["after waves %d-%d" % (b["afterWaveFrom"], b["afterWaveTo"]), r,
                         "%d%%" % round(100.0 * r / cls["nova"]["levels"][0]["cost"]),
                         "%s: %d%%" % (newest["name"], round(100.0 * r / newest["levels"][0]["cost"])),
                         "%d%%" % round(100.0 * r / cls["nova"]["levels"][1]["cost"]),
                         "%d%%" % round(100.0 * r / cls["nova"]["levels"][2]["cost"])])
        self.t["purchasing_power"] = tbl(["Interval", "Reward", "Share of a new Nova (50)", "Share of the newest class at level 1", "Share of a Nova level-2 upgrade (60)", "Share of a Nova level-3 upgrade (150)"], rows)

    # ---------------- powers / endless / badges / challenges / performance ----------------
    def powers(self):
        d = self.d
        rows = [[p["name"], p["effect"], p["targeting"], p["mouse"], p["keyboard"]] for p in d["powers"].values()]
        self.t["powers"] = tbl(["Power", "Exact effect", "Target", "Mouse", "Keyboard"], rows)
        pr = d["powerRules"]
        self.t["meteor_schedule"] = tbl(["Meteor challenge", "Slot", "Power awarded on success", "Charges"],
                                        [["after wave %d (before the wave-%d boss)" % (m["afterWave"], m["afterWave"] + 1), m["slotId"], d["powers"][m["power"]]["name"], m["charges"]] for m in pr["meteorSchedule"]])
        self.t["power_rules"] = tbl(["Rule", "Value"], [
            ["Inventory cap", "%d charges of each power" % pr["inventoryCapPerPower"]],
            ["Use limit", "each power at most %d time per wave" % pr["perWaveUseLimitPerPower"]],
            ["Shared lockout", "%ss after any power before another can be used" % num(pr["sharedLockoutSeconds"])],
            ["Persistence", pr["persistence"]],
            ["Usable in", pr["usableIn"]],
            ["Award mapping", pr["awardMapping"]],
            ["Aiming", "choosing a Comet Burst target pauses the simulation, so aiming is untimed"],
        ])

    def endless(self):
        d = self.d
        e = d["endless"]
        hp, sp, cm, bh = e["hpMult"], e["speedMult"], e["countMult"], e["bossHp"]
        hp_cap_wave = 50 + int(math.ceil((hp["cap"] - hp["base"]) / hp["perWave"] - 1e-9))
        sp_cap_wave = 50 + int(math.ceil((sp["cap"] - sp["base"]) / sp["perWave"] - 1e-9))
        cyc = int(math.ceil((cm["cap"] - cm["base"]) / cm["perCycle"] - 1e-9))
        cm_cap_wave = 51 + 10 * cyc
        k = int(math.ceil((bh["cap"] - bh["base"]) / float(bh["perBoss"]) - 1e-9))
        bh_cap_wave = 50 + 10 * k
        self.endless_caps = {"hp": hp_cap_wave, "speed": sp_cap_wave, "count": cm_cap_wave, "boss": bh_cap_wave}
        self.t["endless_formulas"] = tbl(["Quantity", "Formula (n = wave number, n >= 51)", "Cap", "Wave at which the cap is reached"], [
            ["Health multiplier", hp["formula"] + " with base %s, perWave %s" % (num(hp["base"]), num(hp["perWave"])), "x%s" % num(hp["cap"]), hp_cap_wave],
            ["Speed multiplier", sp["formula"] + " with base %s, perWave %s" % (num(sp["base"]), num(sp["perWave"])), "x%s" % num(sp["cap"]), sp_cap_wave],
            ["Count multiplier", cm["formula"], "x%s" % num(cm["cap"]), cm_cap_wave],
            ["Scheduled spawns in one wave", "after the count multiplier, if the total exceeds the bound every group is scaled down proportionally", e["maxScheduledSpawnsPerWave"], "bound, always in force"],
            ["Boss health", "min(cap, base + perBoss * k) with base %d, perBoss %d, for the k-th endless boss (k = 1 at wave 60); the boss keeps its own phases, speed and leak damage" % (bh["base"], bh["perBoss"]), bh["cap"], bh_cap_wave],
            ["Concurrent aliens", e["concurrencyCaps"], "60 / 48 / 24", "always in force"],
        ])
        rows = []
        for n in (51, 55, 59, 60, 65, 70, 80, 90, 100, 101, 110, 120, 130, 200):
            wd = self.g.wave_def(n)
            off = (n - 51) % 10 + 1
            tpl = "boss wave: %s with the escorts of wave %d" % (d["bosses"][wd["boss"]]["name"], e["bossEscortTemplates"][wd["boss"]]) if wd.get("boss") else "groups of wave %d" % e["templateForOffset"][str(off)]
            cmv = min(cm["cap"], cm["base"] + cm["perCycle"] * ((n - 51) // 10))
            rows.append([n, tpl, "x%s" % num(wd["hpMult"]), "x%s" % num(wd["speedMult"]), "x%s" % num(cmv), sum(g["count"] for g in wd["groups"]),
                         wd["bossHp"] if wd.get("boss") else "-", self.g.wave_bounty_available(wd)])
        self.t["endless_samples"] = tbl(["Wave", "Template", "Health", "Speed", "Count", "Scheduled spawns", "Boss health", "Bounty available"], rows)

    def misc(self):
        d = self.d
        self.t["badges"] = tbl(["Badge id", "Name (proposal)", "Exact award rule (idempotent: set-add of the badge id)", "Permanent progression"],
                               [[b["id"], b["name"], b["rule"], "yes" if b["permanent"] else "no"] for b in d["badges"]])
        rows = []
        for c in d["challenges"]:
            pre = ", ".join("%s L%d on %s" % (d["classes"][p["class"]]["name"], p["level"], p["pad"]) for p in c["presetPlacements"]) or "none"
            met = ("yes: before the last wave, awards %s" % d["powers"][c["meteorPower"]]["name"]) if c.get("meteor") else "no"
            rows.append([c["id"], c["name"], ", ".join(str(w) for w in c["waves"]), ", ".join(d["classes"][x]["name"] for x in c["classes"]), c["startingCredits"], pre,
                         "pads open as when preparing wave %d" % c["padsOpenAsForWave"], c["learningReward"], met, c["about"]])
        self.t["challenges"] = tbl(["Id", "Name", "Campaign waves reused (in order)", "Classes available", "Starting credits", "Astronauts already placed", "Pads", "Learning reward per interval", "Meteor challenge", "About"], rows)
        p = d["performance"]
        self.t["performance_budget"] = tbl(["Budget item", "Proposed maximum"], [
            ["Active aliens (simulation entities)", p["maxActiveAliens"]],
            ["Astronauts", p["maxAstronauts"]],
            ["Beam / comet-streak effects alive at once (pooled)", p["maxBeamEffects"]],
            ["Blast-ring / frost-ring effects alive at once (pooled)", p["maxBlastEffects"]],
            ["Particles alive at once (pooled; %d per star burst)" % p["starBurstParticles"], p["maxParticles"]],
            ["Floating reward texts alive at once (pooled)", p["maxFloatingTexts"]],
        ])

    # ---------------- simulator results ----------------
    def results(self):
        d = self.d
        if not self.res:
            return
        rows = []
        for r in self.pick(group="A") + self.pick(group="B"):
            sp = r["spec"]
            rs = r["rows"]
            boss = "".join("K" if x["bossKilled"] else ("L" if x["bossLeaked"] else "-") for x in rs if x["wave"] % 10 == 0)
            rows.append(["competent", "%d%%" % (sp["learn"] * 100), "pattern" if sp.get("learnMode", "pattern") == "pattern" else "random, seed %d" % sp["seed"],
                         "used" if sp["meteor"] else "unused", r["cleared"], r["health"], sum(x["leakDamage"] for x in rs), boss, r["invested"], r["credits"],
                         sum(x["bounty"] for x in rs), sum(x["learn"] for x in rs), "%.0f" % (sum(x["duration"] for x in rs) / 60.0)])
        self.t["res_competent"] = tbl(["Policy", "Learning success", "Outcome pattern", "Meteor powers", "Waves cleared", "Colony health at end", "Total leak damage", "Bosses 10-50 (K = defeated, L = leaked)",
                                       "Credits invested at end", "Credits unspent", "Bounty earned", "Learning credits earned", "Combat time at 1x (min)"], rows)
        rows = []

        def dist(rs, label, lp, met):
            xs = sorted(r["cleared"] for r in rs)
            if not xs:
                return
            n = len(xs)
            unspent = statistics.mean(r["credits"] for r in rs)
            rows.append([label, "%d%%" % (lp * 100), met, n, xs[0], xs[n // 4], statistics.median(xs), xs[(3 * n) // 4], xs[-1],
                         "%d/%d" % (sum(x >= 20 for x in xs), n), "%d/%d" % (sum(x >= 30 for x in xs), n), "%d/%d" % (sum(x >= 50 for x in xs), n), "%.0f" % unspent])
        for lp in (0.0, 0.6, 1.0):
            for met in (False, True):
                dist(self.pick(group="C", learn=lp, meteor=met), "naive child (rarely upgrades)", lp, "used" if met else "unused")
        for lp in (0.0, 0.6):
            dist(self.pick(group="C2", learn=lp), "same child, but always upgrades once every pad is full", lp, "unused")
        dist(self.pick(group="D-pads-naive"), "naive child, variant: all 16 pads open from wave 1", 0.6, "unused")
        self.t["res_naive"] = tbl(["Policy", "Learning success", "Meteor powers", "Seeds", "Min waves cleared", "Lower quartile", "Median", "Upper quartile", "Max", "Cleared >= 20", "Cleared >= 30", "Cleared 50", "Mean credits unspent at end"], rows)
        # boss outcomes for naive
        rows = []
        for lp in (0.6,):
            for met in (False, True):
                rs = self.pick(group="C", learn=lp, meteor=met)
                for bw in (10, 20, 30, 40, 50):
                    reached = [r for r in rs if len(r["rows"]) >= bw]
                    killed = sum(1 for r in reached if r["rows"][bw - 1]["bossKilled"])
                    leaked = sum(1 for r in reached if r["rows"][bw - 1]["bossLeaked"])
                    surv = sum(1 for r in reached if not r["rows"][bw - 1]["defeated"])
                    rows.append(["60%", "used" if met else "unused", bw, len(reached), killed, leaked, surv])
        self.t["res_naive_bosses"] = tbl(["Learning success", "Meteor powers", "Boss wave", "Runs that reached it (of 20)", "Boss defeated", "Boss reached the colony", "Run survived the wave"], rows)
        rows = []
        for r in self.pick(group="D-ban") + self.pick(group="D-opt") + self.pick(group="D-pads"):
            sp = r["spec"]
            rs = r["rows"]
            boss = "".join("K" if x["bossKilled"] else ("L" if x["bossLeaked"] else "-") for x in rs if x["wave"] % 10 == 0)
            if sp.get("banned"):
                name = "without " + ", ".join(d["classes"][b]["name"] for b in sp["banned"]) if len(sp["banned"]) < 5 else "Nova only (all five other classes removed)"
            else:
                name = sp.get("name")
            rows.append([name, "%d%%" % (sp["learn"] * 100), r["cleared"], r["health"], sum(x["leakDamage"] for x in rs), boss, r["invested"],
                         ", ".join("%s %s%%" % (d["classes"][k]["name"], v) for k, v in sorted(r["classDamagePct"].items(), key=lambda kv: -kv[1]))])
        self.t["res_ablation"] = tbl(["Variant (competent policy, no meteor powers)", "Learning success", "Waves cleared", "Colony health at end", "Total leak damage", "Bosses 10-50 (K = defeated, L = leaked)", "Credits invested", "Share of damage by class"], rows)
        # per-wave economy, competent three learning levels (powers unused, then used)
        for met, key in ((True, "res_credits_competent_m"), (False, "res_credits_competent")):
            a = {lp: self.one(group="A", learn=lp, meteor=met) for lp in (0.0, 0.6, 1.0)}
            rows = []
            for w in range(1, 51):
                row = [w, self.wave_meta[w]["bounty"]]
                for lp in (0.0, 0.6, 1.0):
                    x = a[lp]["rows"][w - 1]
                    row += [x["learn"], x["bounty"], x["spentPrep"] + x["spentWave"], x["refund"], x["creditsEnd"]]
                rows.append(row)
            tot = ["Total", sum(self.wave_meta[w]["bounty"] for w in range(1, 51))]
            for lp in (0.0, 0.6, 1.0):
                xs = a[lp]["rows"]
                tot += [sum(x["learn"] for x in xs), sum(x["bounty"] for x in xs), sum(x["spentPrep"] + x["spentWave"] for x in xs), sum(x["refund"] for x in xs), ""]
            rows.append(tot)
            self.t[key] = tbl(["Wave", "Bounty available", "0%: learning reward before wave", "0%: bounty earned", "0%: spent", "0%: sell refunds", "0%: credits after wave",
                                               "60%: learning reward", "60%: bounty", "60%: spent", "60%: refunds", "60%: credits after",
                               "100%: learning reward", "100%: bounty", "100%: spent", "100%: refunds", "100%: credits after"], rows)
        # per-wave detail for competent 0%
        rows = []
        for x in a[0.0]["rows"]:
            rows.append([x["wave"], x["duration"], x["peak"], x["peakDesc"], x["spawned"], x["leaks"], x["healthEnd"], x["shieldEnd"], x["penetration"], x["invested"], x["towers"]])
        self.t["res_detail_c0"] = tbl(["Wave", "Duration at 1x (s)", "Peak aliens", "Peak live descendants", "Aliens spawned", "Leaks", "Health after", "Shield after", "Deepest advance (share of route)", "Credits invested", "Board at Ready (pad:class level)"], rows)
        # naive per-wave averages for every learning level, powers unused and used
        for label, key, grp in (("naive60", {"group": "C", "learn": 0.6, "meteor": False}, None),
                                ("naive0", {"group": "C", "learn": 0.0, "meteor": False}, None),
                                ("naive100", {"group": "C", "learn": 1.0, "meteor": False}, None),
                                ("naive60m", {"group": "C", "learn": 0.6, "meteor": True}, None),
                                ("naive100m", {"group": "C", "learn": 1.0, "meteor": True}, None)):
            rs = self.pick(**key)
            rows = []
            for w in range(1, 51):
                alive = [r["rows"][w - 1] for r in rs if len(r["rows"]) >= w]
                if not alive:
                    break
                rows.append([w, len(alive), "%.0f" % statistics.mean(x["bounty"] for x in alive), "%.0f" % statistics.mean(x["learn"] for x in alive),
                             "%.0f" % statistics.mean(x["spentPrep"] + x["spentWave"] for x in alive), "%.0f" % statistics.mean(x["creditsEnd"] for x in alive),
                             "%.1f" % statistics.mean(x["leakDamage"] for x in alive), "%.1f" % statistics.mean(x["healthEnd"] for x in alive),
                             "%.0f" % statistics.mean(x["duration"] for x in alive), max(x["peak"] for x in alive), sum(1 for x in alive if x["defeated"])])
            self.t["res_credits_" + label] = tbl(["Wave", "Runs playing this wave (of %d)" % len(rs), "Mean bounty earned", "Mean learning reward before wave", "Mean credits spent", "Mean credits unspent after wave",
                                                  "Mean leak damage", "Mean colony health after", "Mean duration (s)", "Max peak aliens", "Runs defeated in this wave"], rows)
        # durations summary
        durs = [x["duration"] for x in a[0.0]["rows"]]
        nonboss = [x["duration"] for x in a[0.0]["rows"] if x["wave"] % 10]
        boss = [x["duration"] for x in a[0.0]["rows"] if x["wave"] % 10 == 0]
        d6 = [x["duration"] for x in a[0.6]["rows"]]
        d10 = [x["duration"] for x in a[1.0]["rows"]]
        self.t["res_durations"] = tbl(["Measure (competent policy, 1x speed)", "0% learning", "60%", "100%"], [
            ["Shortest ordinary wave (s)", "%.0f" % min(nonboss), "%.0f" % min(x["duration"] for x in a[0.6]["rows"] if x["wave"] % 10), "%.0f" % min(x["duration"] for x in a[1.0]["rows"] if x["wave"] % 10)],
            ["Longest ordinary wave (s)", "%.0f" % max(nonboss), "%.0f" % max(x["duration"] for x in a[0.6]["rows"] if x["wave"] % 10), "%.0f" % max(x["duration"] for x in a[1.0]["rows"] if x["wave"] % 10)],
            ["Ordinary waves shorter than 25 s", sum(1 for x in nonboss if x < 25), sum(1 for x in a[0.6]["rows"] if x["wave"] % 10 and x["duration"] < 25), sum(1 for x in a[1.0]["rows"] if x["wave"] % 10 and x["duration"] < 25)],
            ["Boss waves 10/20/30/40/50 (s)", " / ".join("%.0f" % x for x in boss), " / ".join("%.0f" % x["duration"] for x in a[0.6]["rows"] if x["wave"] % 10 == 0), " / ".join("%.0f" % x["duration"] for x in a[1.0]["rows"] if x["wave"] % 10 == 0)],
            ["Total campaign combat time (min)", "%.1f" % (sum(durs) / 60), "%.1f" % (sum(d6) / 60), "%.1f" % (sum(d10) / 60)],
        ])
        # busiest waves
        worst = {}
        worst_desc = {}
        worst_shots = {}
        for r in self.res:
            sp = r["spec"]
            if sp["kind"] == "campaign" and sp.get("maxWave", 50) == 50:
                for row in r["rows"]:
                    w = row["wave"]
                    worst[w] = max(worst.get(w, 0), row["peak"])
                    worst_desc[w] = max(worst_desc.get(w, 0), row["peakDesc"])
                    worst_shots[w] = max(worst_shots.get(w, 0), row["maxShotsPerS"])
        top = sorted(worst, key=lambda w: -worst[w])[:6]
        rows = [[w, self.wave_meta[w]["scheduled"], self.wave_meta[w]["total"], a[0.0]["rows"][w - 1]["peak"], worst[w], worst_desc[w], worst_shots[w]] for w in top]
        self.t["res_busiest"] = tbl(["Wave", "Aliens scheduled", "With descendants", "Peak concurrent aliens (competent, 0%)", "Worst peak in any campaign scenario", "Worst peak of live descendants", "Most astronaut shots in one second"], rows)
        self.busiest = top[0]
        self.max_shots = max(worst_shots.values())
        self.max_desc = max(worst_desc.values())
        # minimal player
        m = self.one(kind="minimal")
        if m:
            self.t["res_minimal"] = tbl(["Wave", "Leaks", "Colony health after", "Duration (s)"], [[x["wave"], x["leaks"], x["healthEnd"], x["duration"]] for x in m["rows"]])
            self.minimal = m
        # challenges
        rows = []
        for c in d["challenges"]:
            for pol, lp in (("competent", 0.0), ("competent", 0.6)):
                r = self.one(kind="challenge", id=c["id"], policy=pol, learn=lp)
                if r:
                    rows.append([c["name"], pol, "%d%%" % (lp * 100), 1, "%d of %d" % (r["cleared"], r["of"]), r["health"], "%.0f" % sum(x["duration"] for x in r["rows"])])
            rs = self.pick(kind="challenge", id=c["id"], policy="naive")
            if rs:
                rows.append([c["name"], "naive child", "60%", len(rs), "%d of %d runs cleared every wave" % (sum(1 for r in rs if r["cleared"] == r["of"]), len(rs)),
                             "%.1f (min %d)" % (statistics.mean(max(0, r["health"]) for r in rs), min(r["health"] for r in rs)),
                             "%.0f" % statistics.mean(sum(x["duration"] for x in r["rows"]) for r in rs)])
        self.t["res_challenges"] = tbl(["Challenge", "Policy", "Learning success", "Runs", "Result", "Colony health at end", "Combat time (s)"], rows)
        # endless
        rows = []
        for r in self.pick(group="G"):
            sp = r["spec"]
            rs = r["rows"]
            rows.append(["competent", "%d%%" % (sp["learn"] * 100), r["cleared"], r["defeatedAt"], max(x["peak"] for x in rs), sum(x["deferred"] for x in rs),
                         next((x["wave"] for x in rs if x["invested"] >= self.field_cost), "-"), r["credits"]])
        self.t["res_endless"] = tbl(["Policy", "Learning success", "Highest wave cleared", "Defeated in wave", "Peak concurrent aliens", "Spawns deferred by the caps (whole run)", "Wave at which the reference board was complete", "Credits unspent at the end"], rows)
        # margins
        m0 = self.one(kind="margins", group="M", learn=0.0)
        m6 = self.one(kind="margins", group="M", learn=0.6)
        if m0 and m6:
            rows = []
            for a_, b_ in zip(m0["margins"], m6["margins"]):
                rows.append([a_["wave"], a_["target"], a_["margin"], b_["margin"]])
            self.t["res_margins"] = tbl(["Wave", "Target margin used for tuning", "Margin, competent 0% learning", "Margin, competent 60% learning"], rows)
        # boss margins by board variant
        rows = []
        variants = [("all six classes (reference)", self.one(kind="margins", group="M", learn=0.0), "0%"),
                    ("all six classes (reference)", self.one(kind="margins", group="M", learn=0.6), "60%")]
        for r in self.pick(kind="margins", group="BM"):
            sp = r["spec"]
            name = "without " + ", ".join(d["classes"][b]["name"] for b in sp["banned"]) if len(sp["banned"]) < 5 else "Nova only"
            variants.append((name, r, "%d%%" % (sp["learn"] * 100)))
        for name, r, lp in variants:
            if not r:
                continue
            mm = {m["wave"]: m["margin"] for m in r["margins"]}
            rows.append([name, lp] + [mm.get(w, "-") for w in (10, 20, 30, 40, 50)])
        self.t["res_boss_margins"] = tbl(["Board built by the competent policy (no meteor powers)", "Learning success", "Wave 10 King Wobble", "Wave 20 Captain Clank", "Wave 30 Queen Bubbla", "Wave 40 The Mothership", "Wave 50 The Great Glorp"], rows)
        # tick-rate check
        t30 = self.one(group="A", learn=0.0, meteor=False)
        t60 = [r for r in self.pick(group="D-opt") if r["spec"].get("tickHz") == 60 and r["spec"]["learn"] == 0.0]
        if t60:
            t60 = t60[0]
            self.t["res_tick"] = tbl(["Simulation tick", "Waves cleared", "Health at end", "Total leak damage", "Credits invested", "Combat time (min)"], [
                ["30 per second (used for the matrix)", t30["cleared"], t30["health"], sum(x["leakDamage"] for x in t30["rows"]), t30["invested"], "%.1f" % (sum(x["duration"] for x in t30["rows"]) / 60)],
                ["60 per second (the proposed game tick)", t60["cleared"], t60["health"], sum(x["leakDamage"] for x in t60["rows"]), t60["invested"], "%.1f" % (sum(x["duration"] for x in t60["rows"]) / 60)],
            ])

    def worked_example(self):
        a = example.run(example.SCRIPT_ALL, set(), self.d)
        b = example.run(example.SCRIPT_TWO_FAILS, {2, 4}, self.d)
        self.t["example_all"] = example.markdown(a)
        self.t["example_two_fails"] = example.markdown(b)
        self.example_rows = (a, b)

    def build(self):
        self.map_tables()
        self.roster()
        self.aliens()
        self.waves()
        self.economy()
        self.powers()
        self.endless()
        self.misc()
        self.results()
        self.worked_example()
        return self.t


def facts(T_):
    """Scalar facts used in the report text, so that prose numbers also come from the data."""
    d = T_.d
    f = {
        "routeLength": num(T_.route.length),
        "pads": len(d["map"]["pads"]),
        "startCredits": d["economy"]["startingCredits"],
        "bountyTotal": T_.bounty_total,
        "learnTotal": T_.learn_total,
        "fieldCost": T_.field_cost,
        "maxHealth": d["colony"]["maxHealth"],
        "shieldCap": d["colony"]["shieldCap"],
        "shieldAbs": d["colony"]["shieldAbsoluteCap"],
        "bossRepair": d["colony"]["repairOnBossClear"],
        "endlessCaps": T_.endless_caps,
        "busiest": getattr(T_, "busiest", None),
        "maxShots": getattr(T_, "max_shots", None),
        "maxDesc": getattr(T_, "max_desc", None),
        "aliensTotal": sum(m["total"] for m in T_.wave_meta.values()),
        "aliensScheduled": sum(m["scheduled"] for m in T_.wave_meta.values()),
        "bossHpList": " / ".join(str(b["hp"]) for b in d["bosses"].values()),
        "bossLeakList": " / ".join(str(b["leak"]) for b in d["bosses"].values()),
        "learnRewardList": " / ".join(str(b["credits"]) for b in d["economy"]["learningRewardByBlock"]),
    }
    if not T_.res:
        return f

    def cl(**kw):
        return sorted(r["cleared"] for r in T_.pick(**kw))

    def summ(xs):
        n = len(xs)
        return {"min": xs[0], "median": num(float(statistics.median(xs))), "max": xs[-1], "n": n, "ge20": sum(x >= 20 for x in xs),
                "ge30": sum(x >= 30 for x in xs), "all50": sum(x >= 50 for x in xs)}
    for key, kw in (("naive0", {"group": "C", "learn": 0.0, "meteor": False}), ("naive60", {"group": "C", "learn": 0.6, "meteor": False}),
                    ("naive60m", {"group": "C", "learn": 0.6, "meteor": True}), ("naive100", {"group": "C", "learn": 1.0, "meteor": False}),
                    ("eager0", {"group": "C2", "learn": 0.0}), ("eager60", {"group": "C2", "learn": 0.6}), ("naivePads", {"group": "D-pads-naive"})):
        xs = cl(**kw)
        if xs:
            f[key] = summ(xs)
            f[key]["unspent"] = "%.0f" % statistics.mean(r["credits"] for r in T_.pick(**kw))
    for lp, key in ((0.0, "c0"), (0.6, "c60"), (1.0, "c100")):
        r = T_.one(group="A", learn=lp, meteor=False)
        rs = r["rows"]
        f[key] = {"cleared": r["cleared"], "health": r["health"], "invested": r["invested"], "unspent": r["credits"],
                  "leak": sum(x["leakDamage"] for x in rs), "minutes": "%.1f" % (sum(x["duration"] for x in rs) / 60.0),
                  "minDur": "%.0f" % min(x["duration"] for x in rs if x["wave"] % 10), "maxDur": "%.0f" % max(x["duration"] for x in rs if x["wave"] % 10),
                  "bossDur": " / ".join("%.0f" % x["duration"] for x in rs if x["wave"] % 10 == 0),
                  "short": sum(1 for x in rs if x["wave"] % 10 and x["duration"] < 25),
                  "boardDoneWave": next((x["wave"] for x in rs if x["invested"] >= T_.field_cost), None)}
    m0 = T_.one(kind="margins", group="M", learn=0.0)
    if m0:
        mm = {m["wave"]: m["margin"] for m in m0["margins"]}
        f["marginMin"] = min(mm.values())
        f["marginMinWave"] = min(mm, key=lambda w: mm[w])
        f["margin50"] = mm[50]
        f["marginLate"] = "%s and %s" % (num(min(mm[w] for w in range(41, 50))), num(max(mm[w] for w in range(41, 50))))
        f["marginEarly"] = "%s and %s" % (num(min(mm[w] for w in range(1, 10))), num(max(mm[w] for w in range(1, 10))))
        f["bossMargins0"] = " / ".join(num(mm[w]) for w in (10, 20, 30, 40, 50))
    bm = [r for r in T_.pick(kind="margins", group="BM") if r["spec"]["learn"] == 0.0]
    if bm:
        worst = None
        for r in bm:
            for m in r["margins"]:
                if m["wave"] % 10 == 0 and (worst is None or m["margin"] < worst[0]):
                    worst = (m["margin"], m["wave"], r["spec"]["banned"])
        f["bossMarginWorst"] = {"margin": worst[0], "wave": worst[1], "banned": " and ".join(d["classes"][c]["name"] for c in worst[2]) if len(worst[2]) < 5 else "every class except Nova"}
    g_ = T_.pick(group="G")
    if g_:
        for r in g_:
            f["endless%d" % int(round(r["spec"]["learn"] * 100))] = r["cleared"]
        f["endlessCleared"] = sorted(set(r["cleared"] for r in g_))
        f["endlessPeak"] = max(max(x["peak"] for x in r["rows"]) for r in g_)
        f["endlessDeferred"] = max(sum(x["deferred"] for x in r["rows"]) for r in g_)
    if getattr(T_, "minimal", None):
        f["minimalCleared"] = T_.minimal["cleared"]
        f["minimalPads"] = ", ".join(T_.minimal["pads"])
    worst = {}
    for r in T_.res:
        sp = r["spec"]
        if sp["kind"] == "campaign" and sp.get("maxWave", 50) == 50:
            for row in r["rows"]:
                worst[row["wave"]] = max(worst.get(row["wave"], 0), row["peak"])
    f["worstPeak"] = max(worst.values())
    f["worstPeakWave"] = max(worst, key=lambda w: worst[w])
    a0 = T_.one(group="A", learn=0.0, meteor=False)
    f["c0PeakMax"] = max(x["peak"] for x in a0["rows"])
    f["c0PeakWave"] = max(a0["rows"], key=lambda x: x["peak"])["wave"]
    same = True
    for lp in (0.0, 0.6, 1.0):
        u = T_.one(group="A", learn=lp, meteor=False)
        m = T_.one(group="A", learn=lp, meteor=True)
        if [(x["bounty"], x["learn"], x["spentPrep"] + x["spentWave"], x["refund"], x["creditsEnd"]) for x in u["rows"]] != \
           [(x["bounty"], x["learn"], x["spentPrep"] + x["spentWave"], x["refund"], x["creditsEnd"]) for x in m["rows"]]:
            same = False
    f["competentMeteorSameCredits"] = "identical" if same else "not identical"
    ex_a, ex_b = T_.example_rows
    f["exampleEnd"] = ex_a[-1]["end"]
    f["exampleEndFails"] = ex_b[-1]["end"]
    f["scenarios"] = len(T_.res)
    nova = [r for r in T_.pick(group="D-ban") if len(r["spec"].get("banned", [])) == 5]
    if nova:
        f["novaOnlyCleared"] = sorted(set(r["cleared"] for r in nova))
        f["novaOnlyHealth"] = sorted(set(r["health"] for r in nova))
        f["novaOnlyBossLeaks"] = sum(1 for r in nova for x in r["rows"] if x["bossLeaked"])
    single = [r for r in T_.pick(group="D-ban") if len(r["spec"].get("banned", [])) == 1]
    if single:
        d = T_.d

        def leaks(lp):
            out = []
            for r in single:
                if r["spec"]["learn"] != lp:
                    continue
                for x in r["rows"]:
                    if x["bossLeaked"]:
                        out.append("%s (wave %d) without %s" % (d["bosses"][d["waves"][x["wave"] - 1]["boss"]]["name"], x["wave"], d["classes"][r["spec"]["banned"][0]]["name"]))
            return "; ".join(out) if out else "none"
        f["banBossLeaks0"] = leaks(0.0)
        f["banBossLeaks60"] = leaks(0.6)
        f["banMinCleared0"] = min(r["cleared"] for r in single if r["spec"]["learn"] == 0.0)
        f["banMinCleared60"] = min(r["cleared"] for r in single if r["spec"]["learn"] == 0.6)
        f["banMinHealth0"] = min(r["health"] for r in single if r["spec"]["learn"] == 0.0)
        f["banMinHealth60"] = min(r["health"] for r in single if r["spec"]["learn"] == 0.6)
    nb = {}
    for met in (False, True):
        rs = T_.pick(group="C", learn=0.6, meteor=met)
        for bw in (10, 20, 30, 40, 50):
            reached = [r for r in rs if len(r["rows"]) >= bw]
            nb["%s%d" % ("m" if met else "u", bw)] = "%d of %d" % (sum(1 for r in reached if r["rows"][bw - 1]["bossKilled"]), len(reached))
    f["naiveBoss"] = nb
    return f


RESULTS_ORDER = [
    ("Competent player: main matrix", "res_competent"),
    ("Naive child: distribution over seeds", "res_naive"),
    ("Naive child at 60%: what happened at each boss", "res_naive_bosses"),
    ("Ablations: class bans, policy options, tick rate, pad staging", "res_ablation"),
    ("Boss waves: margin of differently restricted boards (1.00 or more = the boss wave is stopped with no leak, no purchases during the wave, no powers)", "res_boss_margins"),
    ("Margin before each wave", "res_margins"),
    ("Wave durations and total combat time", "res_durations"),
    ("Busiest authored waves", "res_busiest"),
    ("Tick-rate check", "res_tick"),
    ("Credits earned and spent per wave: competent player at 0%, 60% and 100% learning (no meteor powers)", "res_credits_competent"),
    ("Credits earned and spent per wave: competent player at 0%, 60% and 100% learning (meteor powers used; at 0% no power is ever earned, so those columns equal the unused run)", "res_credits_competent_m"),
    ("Per-wave detail: competent player, 0% learning, no meteor powers", "res_detail_c0"),
    ("Credits earned and spent per wave: naive child, 60% learning, no meteor powers (means over 20 seeds)", "res_credits_naive60"),
    ("Credits earned and spent per wave: naive child, 0% learning (means over 20 seeds; powers used and unused are the same run because no power is ever earned)", "res_credits_naive0"),
    ("Credits earned and spent per wave: naive child, 100% learning, no meteor powers (means over 20 seeds)", "res_credits_naive100"),
    ("Credits earned and spent per wave: naive child, 60% learning, meteor powers used (means over 20 seeds)", "res_credits_naive60m"),
    ("Credits earned and spent per wave: naive child, 100% learning, meteor powers used (means over 20 seeds)", "res_credits_naive100m"),
    ("Minimal player: three Novas on the three weakest starting pads, nothing bought afterwards", "res_minimal"),
    ("Standalone challenges", "res_challenges"),
    ("Endless continuation", "res_endless"),
]


def write_results_md(T_):
    t = T_.t
    out = []
    out.append("# Space Colony Defence - simulator results\n")
    out.append("**Read this first.** These tables come from a coarse headless model played by two heuristic 'players'. They are evidence for choosing INITIAL PLAYTEST SETTINGS. "
               "They are NOT validation with real children, and they say nothing about fun, readability, reading load or motor skills.\n")
    out.append("## How to re-run\n")
    out.append("```\ncd %s\npython3 make_data.py     # writes game_data.json from the authored tables\npython3 selftest.py      # invariants: caps, bounty accounting, sell/rebuy, determinism\n"
               "python3 run_matrix.py    # about two and a half minutes on 8 cores; writes results.json\npython3 tables.py --results   # writes tables.json and this file\npython3 build_report.py  # rebuilds the design report from the template and the tables\n"
               "python3 sim.py competent 0.6 1 1   # one campaign printed wave by wave: policy, learning success, meteor used (1/0), seed\n"
               "python3 tune.py          # margin before every wave for the competent policy (add --adapt to re-tune; writes tuned.json)\n```\n" % "tools/sim")
    out.append("## The two heuristic players\n")
    out.append("- **Competent**: follows a blueprint of which class suits which pad, holds a cheap Nova on a pad until the planned class unlocks, and orders its purchases greedily: before each purchase it test-plays the next two waves made tougher on a copy of the board and buys the affordable step with the most extra damage per credit. It buys during waves, buys Mira when the colony has leaked, and keeps meteor powers for bosses. It uses default targeting.\n"
               "- **Naive child**: random open pad, 50% newest class / 30% cheapest / 20% random (if it cannot afford its choice it waits half the time, otherwise buys something it can afford), one to three purchases per preparation phase while pads are free, skips buying in 25% of preparation phases, upgrades with probability 0.15 (0.30 once every pad is full), makes one extra purchase attempt during 20% of waves, never sells, never changes targeting, uses a meteor power at a random moment of a boss wave 70% of the time (10% in other waves). Twenty seeds.\n"
               "- **Learning success** 0%, 60%, 100%: each normal activity pays its reward with that probability (competent runs use an evenly spread pattern so they are repeatable; naive runs use seeded random outcomes). When powers are 'used', a meteor challenge succeeds with the same probability in the random-outcome runs, and always succeeds at 60% and 100% in the fixed-pattern competent runs; at 0% no power is ever earned, so the two 0% rows are identical by construction.\n"
               "- **Margin**: the largest multiplier on every health value in a wave that the present board still stops with no leak and no further purchases. Margin 1.10 means the wave could be 10% tougher before the first leak.\n")
    for title, key in RESULTS_ORDER:
        if key in t:
            out.append("## %s\n" % title)
            out.append(t[key] + "\n")
    with open(os.path.join(HERE, "results.md"), "w") as f:
        f.write("\n".join(out))


def main():
    T_ = T()
    t = T_.build()
    f = facts(T_)
    T_.facts_cache = f
    with open(os.path.join(HERE, "tables.json"), "w") as fh:
        json.dump({"tables": t, "facts": f}, fh, indent=1)
    print("tables:", ", ".join(sorted(t)))
    print("facts:", f)
    if "--results" in sys.argv:
        write_results_md(T_)
        print("wrote results.md")


if __name__ == "__main__":
    main()
