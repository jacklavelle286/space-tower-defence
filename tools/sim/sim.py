#!/usr/bin/env python3
"""Headless fixed-timestep simulator for Space Colony Defence (planning model).

Reads game_data.json (same directory) and models: movement along the route, range
checks from pad coordinates, targeting, damage, armour, bubble layers, slows with
the cap, splash, colony shield and repair, Sol buffs, Patchling heals, splitters,
carriers, boss phases, leaks, bounties, purchases during and between waves, sell
refunds, meteor powers, caps on active aliens / descendants, and the endless
generator.

THIS IS A COARSE MODEL WITH HEURISTIC PLAYERS. It is evidence for choosing initial
playtest settings. It is NOT validation with real children.

Python 3 standard library only.
"""
import json
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
EPS = 1e-9


def load_data(path=None):
    with open(path or os.path.join(HERE, "game_data.json")) as f:
        return json.load(f)


# ----------------------------------------------------------------------------
# Geometry
# ----------------------------------------------------------------------------
class Route:
    def __init__(self, wps):
        self.wps = [(float(x), float(y)) for x, y in wps]
        self.seg = []
        cum = 0.0
        for i in range(len(self.wps) - 1):
            (x0, y0), (x1, y1) = self.wps[i], self.wps[i + 1]
            ln = math.hypot(x1 - x0, y1 - y0)
            self.seg.append((cum, cum + ln, x0, y0, (x1 - x0) / ln, (y1 - y0) / ln))
            cum += ln
        self.length = cum

    def pos(self, p):
        for (c0, c1, x0, y0, ux, uy) in self.seg:
            if p <= c1:
                t = p - c0
                if t < 0:
                    t = 0.0
                return (x0 + ux * t, y0 + uy * t)
        return self.wps[-1]

    def intervals(self, px, py, r):
        """Route-progress intervals whose points lie within r of (px, py)."""
        out = []
        for (c0, c1, x0, y0, ux, uy) in self.seg:
            dx, dy = px - x0, py - y0
            b = ux * dx + uy * dy
            cc = dx * dx + dy * dy - r * r
            disc = b * b - cc
            if disc < 0:
                continue
            sq = math.sqrt(disc)
            t0, t1 = max(0.0, b - sq), min(c1 - c0, b + sq)
            if t1 > t0 + EPS:
                out.append([c0 + t0, c0 + t1])
        out.sort()
        merged = []
        for iv in out:
            if merged and iv[0] <= merged[-1][1] + 1e-7:
                merged[-1][1] = max(merged[-1][1], iv[1])
            else:
                merged.append(iv)
        return [(a, b) for a, b in merged]


# ----------------------------------------------------------------------------
# Entities
# ----------------------------------------------------------------------------
class Alien:
    __slots__ = ("id", "type", "hp", "maxhp", "armour", "bubbles", "speed", "base_speed", "prog",
                 "slow", "slowrem", "leak", "bounty", "flying", "boss", "desc", "phase", "phases",
                 "children", "alive", "x", "y", "ptick", "healer", "bossdef")


class Tower:
    __slots__ = ("pad", "cls", "level", "mode", "ready", "invested", "ivs", "lo", "hi", "buff",
                 "next_pulse", "x", "y", "lv", "dmg_done", "shots")


class WaveStats:
    def __init__(self, wave):
        self.wave = wave
        self.duration = 0.0
        self.spawned = 0
        self.kills = 0
        self.leaks = 0
        self.leak_damage = 0
        self.health_lost = 0
        self.shield_absorbed = 0
        self.bounty = 0
        self.bounty_available = 0
        self.peak_active = 0
        self.peak_desc = 0
        self.penetration = 0.0
        self.shots = 0
        self.deferred = 0
        self.max_defer = 0.0
        self.boss_killed = None
        self.boss_leaked = False
        self.spent_wave = 0
        self.spent_prep = 0
        self.refund = 0
        self.learn = 0
        self.credits_start = 0
        self.credits_end = 0
        self.health_end = 0
        self.shield_end = 0
        self.defeated = False
        self.powers_used = []
        self.towers = ""
        self.invested = 0
        self.max_shots_per_s = 0
        self.timeout = False


# ----------------------------------------------------------------------------
# Game
# ----------------------------------------------------------------------------
class Game:
    def __init__(self, data, tick_hz=30, banned=(), start_credits=None, classes=None, health=None):
        self.d = data
        self.route = Route(data["map"]["route"])
        self.L = self.route.length
        self.pads = {p["id"]: (float(p["x"]), float(p["y"])) for p in data["map"]["pads"]}
        self.pad_ids = sorted(self.pads)
        self.pad_open = {p["id"]: p.get("opensAfterWave", 0) for p in data["map"]["pads"]}
        self.all_pads_open = False
        self.pad_wave_override = None  # challenges: pads count as open as if this campaign wave were being prepared
        self.tick_hz = tick_hz
        self.dt = 1.0 / tick_hz
        self.classes = data["classes"]
        self.aliens = data["aliens"]
        self.bosses = data["bosses"]
        self.caps = data["caps"]
        self.col = data["colony"]
        self.rules = data["combatRules"]
        self.credits = data["economy"]["startingCredits"] if start_credits is None else start_credits
        self.max_health = self.col["maxHealth"] if health is None else health
        self.health = self.max_health
        self.shield = 0
        self.towers = {}
        self.powers = {}
        self.banned = set(banned)
        self.fixed_classes = classes
        self.wave = 1
        self._iv = {}
        self._next_id = 1
        self.active = []
        self.t = 0.0
        self.in_wave = False
        self.stats = None
        self.power_used_this_wave = set()
        self.power_lock_until = 0.0
        self.slow_cap = self.rules["slow"]["capPct"] / 100.0
        self.sell_pct = self.rules["sell"]["refundPct"]
        self.sell_round = self.rules["sell"]["roundDownTo"]
        self.dmg_total = 0
        self.class_dmg = {}

    # ---- helpers -----------------------------------------------------------
    def intervals(self, pad, rng):
        key = (pad, rng)
        v = self._iv.get(key)
        if v is None:
            x, y = self.pads[pad]
            v = self.route.intervals(x, y, rng)
            self._iv[key] = v
        return v

    def coverage(self, pad, rng):
        return sum(b - a for a, b in self.intervals(pad, rng))

    def unlocked(self, wave=None):
        w = self.wave if wave is None else wave
        if self.fixed_classes is not None:
            return [c for c in self.fixed_classes if c not in self.banned]
        return [c for c, d in self.classes.items() if d["unlockAfterWave"] <= w - 1 and c not in self.banned]

    def lv(self, cls, level):
        return self.classes[cls]["levels"][level - 1]

    def count(self, cls):
        return sum(1 for t in self.towers.values() if t.cls == cls)

    def pad_is_open(self, pad, wave=None):
        w = self.wave if wave is None else wave
        if self.pad_wave_override is not None:
            w = self.pad_wave_override
        return self.all_pads_open or self.pad_open[pad] <= w - 1

    def free_pads(self):
        return [p for p in self.pad_ids if p not in self.towers and self.pad_is_open(p)]

    # ---- economy commands (validated like the real game would) -------------
    def can_place(self, cls, pad):
        if pad in self.towers or pad not in self.pads or not self.pad_is_open(pad):
            return False
        if cls not in self.unlocked():
            return False
        cap = self.classes[cls]["deployCap"]
        if cap is not None and self.count(cls) >= cap:
            return False
        return self.credits >= self.lv(cls, 1)["cost"]

    def place(self, cls, pad):
        if not self.can_place(cls, pad):
            return False
        cost = self.lv(cls, 1)["cost"]
        self.credits -= cost
        tw = Tower()
        tw.pad, tw.cls, tw.level = pad, cls, 1
        tw.mode = (self.classes[cls]["targeting"] or ["FRONT"])[0]
        tw.invested = cost
        tw.x, tw.y = self.pads[pad]
        tw.ready = self.t
        tw.buff = 0
        tw.dmg_done = 0
        tw.shots = 0
        self.towers[pad] = tw
        self._refresh(tw)
        self._recompute_buffs()
        self._spent(cost)
        return True

    def can_upgrade(self, pad):
        tw = self.towers.get(pad)
        if not tw or tw.level >= 3:
            return False
        return self.credits >= self.lv(tw.cls, tw.level + 1)["cost"]

    def upgrade(self, pad):
        if not self.can_upgrade(pad):
            return False
        tw = self.towers[pad]
        cost = self.lv(tw.cls, tw.level + 1)["cost"]
        self.credits -= cost
        tw.level += 1
        tw.invested += cost
        self._refresh(tw, keep_timer=True)
        self._recompute_buffs()
        self._spent(cost)
        return True

    def refund_value(self, tw):
        return (tw.invested * self.sell_pct // 100) // self.sell_round * self.sell_round

    def sell(self, pad):
        tw = self.towers.get(pad)
        if not tw:
            return False
        r = self.refund_value(tw)
        self.credits += r
        del self.towers[pad]
        self._recompute_buffs()
        if self.stats is not None:
            self.stats.refund += r
        return True

    def set_mode(self, pad, mode):
        tw = self.towers.get(pad)
        if not tw:
            return False
        c = self.classes[tw.cls]
        if mode not in c["targeting"]:
            return False
        if tw.level < c["targetingFromLevel"].get(mode, 1):
            return False
        tw.mode = mode
        return True

    # ---- helpers for look-ahead trials (policy use only) -----------------------
    def trial_clone(self, tick_hz=None):
        t = Game.__new__(Game)
        t.__dict__.update(self.__dict__)
        t.towers = {}
        for p, tw in self.towers.items():
            c = Tower()
            for k in Tower.__slots__:
                if hasattr(tw, k):
                    setattr(c, k, getattr(tw, k))
            c.dmg_done = 0
            c.shots = 0
            t.towers[p] = c
        t.powers = {}
        t.credits = 10 ** 9
        t.max_health = 10 ** 9
        t.health = 10 ** 9
        t.shield = 0
        t.stats = None
        t.active = []
        t.in_wave = False
        t.t = 0.0
        t.dmg_total = 0
        t.class_dmg = {}
        if tick_hz:
            t.tick_hz = tick_hz
            t.dt = 1.0 / tick_hz
        return t

    def force_place(self, cls, pad):
        self.credits = 10 ** 9
        return self.place(cls, pad)

    def force_upgrade(self, pad):
        self.credits = 10 ** 9
        return self.upgrade(pad)

    def _spent(self, cost):
        if self.stats is not None:
            if self.in_wave:
                self.stats.spent_wave += cost
            else:
                self.stats.spent_prep += cost

    def _refresh(self, tw, keep_timer=False):
        lv = self.lv(tw.cls, tw.level)
        tw.lv = lv
        if "range" in lv:
            tw.ivs = self.intervals(tw.pad, lv["range"])
            tw.lo = tw.ivs[0][0] if tw.ivs else 1e9
            tw.hi = tw.ivs[-1][1] if tw.ivs else -1e9
        else:
            tw.ivs, tw.lo, tw.hi = [], 1e9, -1e9
        if tw.cls == "mira" and not keep_timer:
            tw.next_pulse = self.t + lv["period"]
        elif tw.cls == "mira":
            tw.next_pulse = min(tw.next_pulse, self.t + lv["period"])
        # a level-3 Orion keeps whatever mode the player chose; default stays FRONT

    def _recompute_buffs(self):
        sols = [t for t in self.towers.values() if t.cls == "sol"]
        for t in self.towers.values():
            t.buff = 0
            if t.cls in ("sol", "mira"):
                continue
            for s in sols:
                if math.hypot(t.x - s.x, t.y - s.y) <= s.lv["radius"] + EPS:
                    if s.lv["buffPct"] > t.buff:
                        t.buff = s.lv["buffPct"]

    def invested_total(self):
        return sum(t.invested for t in self.towers.values())

    # ---- wave definition (campaign or endless) -------------------------------
    def wave_def(self, n):
        waves = self.d["waves"]
        if n <= len(waves):
            return waves[n - 1]
        e = self.d["endless"]
        k = n - 50
        hp = min(e["hpMult"]["cap"], e["hpMult"]["base"] + e["hpMult"]["perWave"] * k)
        sp = min(e["speedMult"]["cap"], e["speedMult"]["base"] + e["speedMult"]["perWave"] * k)
        cyc = (n - 51) // 10
        cm = min(e["countMult"]["cap"], e["countMult"]["base"] + e["countMult"]["perCycle"] * cyc)
        off = (n - 51) % 10 + 1
        boss = None
        bosshp = None
        if off == 10:
            kb = (n - 50) // 10
            boss = e["bossCycle"][(kb - 1) % len(e["bossCycle"])]
            tpl = waves[e["bossEscortTemplates"][boss] - 1]
            bosshp = min(e["bossHp"]["cap"], e["bossHp"]["base"] + e["bossHp"]["perBoss"] * kb)
        else:
            tpl = waves[e["templateForOffset"][str(off)] - 1]
        groups = []
        total = 0
        for g in tpl["groups"]:
            g2 = dict(g)
            if not g["type"].startswith("boss"):
                g2["count"] = int(math.ceil(g["count"] * cm - 1e-9))
            total += g2["count"]
            groups.append(g2)
        # hard bound on scheduled spawns per endless wave
        mx = e["maxScheduledSpawnsPerWave"]
        if total > mx:
            scale = mx / float(total)
            for g2 in groups:
                if not g2["type"].startswith("boss"):
                    g2["count"] = max(1, int(g2["count"] * scale))
        return {"wave": n, "groups": groups, "hpMult": round(hp, 3), "speedMult": round(sp, 3),
                "boss": boss, "bossHp": bosshp, "bossBounty": e["bossBounty"] if boss else None,
                "newThisWave": "", "note": "endless"}

    def wave_bounty_available(self, wd):
        tot = 0
        for g in wd["groups"]:
            tot += g["count"] * self._type_bounty(g["type"], g.get("cargo"), wd)
        return tot

    def _type_bounty(self, typ, cargo, wd):
        if typ in self.bosses:
            b = self.bosses[typ]
            tot = wd.get("bossBounty") or b["bounty"]
            for ph in b["phases"]:
                for r in ph.get("onEnter", {}).get("release", []):
                    tot += r["count"] * self._type_bounty(r["type"], None, wd)
            for r in b.get("onDefeatRelease", []):
                tot += r["count"] * self._type_bounty(r["type"], None, wd)
            return tot
        a = self.aliens[typ]
        tot = a["bounty"]
        ch = cargo if cargo else a["traits"].get("children")
        if ch:
            for r in ch:
                tot += r["count"] * self.aliens[r["type"]]["bounty"]
        return tot

    # ---- alien creation -------------------------------------------------------
    def _spawn(self, typ, prog, wd, cargo=None, desc=False):
        a = Alien()
        a.id = self._next_id
        self._next_id += 1
        a.type = typ
        a.prog = prog
        a.slow = 0.0
        a.slowrem = 0.0
        a.alive = True
        a.ptick = -1
        a.desc = desc
        a.phase = 0
        a.phases = None
        a.bossdef = None
        a.healer = None
        if typ in self.bosses:
            b = self.bosses[typ]
            a.boss = True
            a.bossdef = b
            a.maxhp = int(wd.get("bossHp") or b["hp"])
            a.hp = a.maxhp
            a.base_speed = b["speed"]
            a.speed = b["speed"] * b["phases"][0]["speedFactor"]
            a.leak = b["leak"]
            a.bounty = wd.get("bossBounty") or b["bounty"]
            a.armour = b["phases"][0]["armour"]
            a.bubbles = b["phases"][0].get("onEnter", {}).get("selfBubbles", b.get("bubbles", 0))
            a.flying = False
            a.children = b.get("onDefeatRelease")
            a.phases = b["phases"]
        else:
            d = self.aliens[typ]
            tr = d["traits"]
            a.boss = False
            a.maxhp = max(1, int(math.floor(d["hp"] * wd["hpMult"] + 0.5)))
            a.hp = a.maxhp
            a.base_speed = d["speed"] * wd["speedMult"]
            a.speed = a.base_speed
            a.leak = d["leak"]
            a.bounty = d["bounty"]
            a.armour = tr.get("armour", 0)
            a.bubbles = tr.get("bubbles", 0)
            a.flying = bool(tr.get("flying"))
            a.children = cargo if cargo else tr.get("children")
            if "healer" in tr:
                a.healer = tr["healer"]
        self.active.append(a)
        st = self.stats
        st.spawned += 1
        if desc:
            self.live_desc += 1
            if self.live_desc > st.peak_desc:
                st.peak_desc = self.live_desc
        n = len(self.active)
        if n > st.peak_active:
            st.peak_active = n
        return a

    def _pos(self, a):
        if a.ptick != self.tick:
            a.x, a.y = self.route.pos(a.prog)
            a.ptick = self.tick
        return a.x, a.y

    # ---- damage / effects ------------------------------------------------------
    def _hit(self, a, dmg, blast=False, tw=None):
        """Apply one hit. Returns damage actually removed from health."""
        if not a.alive:
            return 0
        if blast and a.flying:
            dmg = (dmg + 1) // 2
        if a.bubbles > 0:
            a.bubbles -= 1
            return 0
        if a.armour:
            dmg = dmg - a.armour
            if dmg < 1:
                dmg = 1
        return self._lose(a, dmg, tw)

    def _lose(self, a, dmg, tw=None):
        if dmg > a.hp:
            dmg = a.hp
        a.hp -= dmg
        if tw is not None:
            tw.dmg_done += dmg
            self.dmg_total += dmg
            cd = self.class_dmg
            cd[tw.cls] = cd.get(tw.cls, 0) + dmg
        if a.boss:
            self._boss_phase(a)  # every crossed threshold runs its on-enter actions, in order, before the defeat check
        if a.hp <= 0:
            self._defeat(a)
        return dmg

    def _boss_phase(self, a):
        ph = a.phases
        while a.phase + 1 < len(ph) and a.hp * 100 <= ph[a.phase + 1]["fromPct"] * a.maxhp:
            a.phase += 1
            p = ph[a.phase]
            a.armour = p["armour"]
            a.speed = a.base_speed * p["speedFactor"]
            oe = p.get("onEnter", {})
            if "selfBubbles" in oe:
                a.bubbles = oe["selfBubbles"]
            if "giveBubbles" in oe:
                gb = oe["giveBubbles"]
                ax, ay = self._pos(a)
                for o in self.active:
                    if o.alive and o is not a and not o.boss:
                        ox, oy = self._pos(o)
                        if math.hypot(ox - ax, oy - ay) <= gb["radius"] + EPS and o.bubbles < gb["layers"]:
                            o.bubbles = gb["layers"]
            if "release" in oe:
                self._queue_release(oe["release"], a.prog)

    def _queue_release(self, spec, prog):
        gap = self.caps["descendantReleaseGap"]
        k = 0
        for r in spec:
            for _ in range(r["count"]):
                self.releases.append([self.t + k * gap, self._rel_seq, r["type"], prog])
                self._rel_seq += 1
                k += 1

    def _defeat(self, a):
        a.alive = False
        st = self.stats
        st.kills += 1
        st.bounty += a.bounty
        self.credits += a.bounty
        frac = a.prog / self.L
        if frac > st.penetration:
            st.penetration = frac
        if a.desc:
            self.live_desc -= 1
        if a.boss:
            st.boss_killed = True
        if a.children:
            self._queue_release(a.children, a.prog)

    def _apply_slow(self, a, pct, dur):
        if a.boss:
            pct = pct * a.bossdef.get("bossSlowFactor", 0.5)
        if pct > self.slow_cap:
            pct = self.slow_cap
        if a.slowrem <= 0 or pct > a.slow + EPS:
            a.slow = pct
            a.slowrem = dur
        elif abs(pct - a.slow) <= EPS:
            if dur > a.slowrem:
                a.slowrem = dur
        # weaker slow: ignored

    def _leak(self, a):
        a.alive = False
        st = self.stats
        st.leaks += 1
        st.leak_damage += a.leak
        st.penetration = 1.0
        if a.desc:
            self.live_desc -= 1
        if a.boss:
            st.boss_leaked = True
            st.boss_killed = False
        dmg = a.leak
        ab = min(self.shield, dmg)
        self.shield -= ab
        st.shield_absorbed += ab
        self.health -= (dmg - ab)
        st.health_lost += (dmg - ab)

    # ---- powers ----------------------------------------------------------------
    def can_use_power(self, pid):
        return (self.in_wave and self.powers.get(pid, 0) > 0 and pid not in self.power_used_this_wave
                and self.t >= self.power_lock_until)

    def use_power(self, pid, target_prog=None):
        if not self.can_use_power(pid):
            return False
        p = self.d["powers"][pid]
        if pid == "frost_pulse":
            for a in self.active:
                if a.alive:
                    self._apply_slow(a, p["slowPct"] / 100.0, p["duration"])
        elif pid == "comet_burst":
            if target_prog is None:
                return False
            tx, ty = self.route.pos(max(0.0, min(self.L, target_prog)))
            for a in list(self.active):
                if a.alive:
                    ax, ay = self._pos(a)
                    if math.hypot(ax - tx, ay - ty) <= p["radius"] + EPS:
                        pct = p["bossPctMaxHp"] if a.boss else p["pctMaxHp"]
                        self._lose(a, int(math.ceil(a.maxhp * pct / 100.0)))
        elif pid == "colony_shield":
            self.shield = min(self.col["shieldAbsoluteCap"], self.shield + p["shieldPoints"])
        self.powers[pid] -= 1
        self.power_used_this_wave.add(pid)
        self.power_lock_until = self.t + self.d["powerRules"]["sharedLockoutSeconds"]
        self.stats.powers_used.append((pid, round(self.t, 1)))
        return True

    # ---- targeting --------------------------------------------------------------
    def _in_range(self, tw, prog):
        if prog < tw.lo or prog > tw.hi:
            return False
        for a, b in tw.ivs:
            if a <= prog <= b:
                return True
        return False

    def _candidates(self, tw):
        lo, hi, ivs = tw.lo, tw.hi, tw.ivs
        out = []
        for a in self.active:
            if not a.alive:
                continue
            p = a.prog
            if p < lo or p > hi:
                continue
            for x, y in ivs:
                if x <= p <= y:
                    out.append(a)
                    break
        return out

    def _pick(self, tw):
        mode = tw.mode
        if mode == "FRONT" and tw.cls != "pip":
            best = None
            bp = -1.0
            lo, hi, ivs = tw.lo, tw.hi, tw.ivs
            for a in self.active:
                p = a.prog
                if p <= bp or p < lo or p > hi or not a.alive:
                    continue
                for x, y in ivs:
                    if x <= p <= y:
                        best, bp = a, p
                        break
            return best
        c = self._candidates(tw)
        if not c:
            return None
        if tw.cls == "pip":
            fresh = [a for a in c if a.slowrem <= 0.15 or a.slow + EPS < self._eff_slow(a, tw)]
            if fresh:
                c = fresh
        if mode == "FRONT":
            return max(c, key=lambda a: a.prog)
        if mode == "FAST":
            return max(c, key=lambda a: (a.speed * (1.0 - (a.slow if a.slowrem > 0 else 0.0)), a.prog))
        if mode == "STRONG":
            return max(c, key=lambda a: (a.hp, a.prog))
        if mode == "CROWD":
            r = tw.lv["splashRadius"]
            best, bk = None, None
            for a in c:
                ax, ay = self._pos(a)
                n = 0
                for o in self.active:
                    if o.alive:
                        ox, oy = self._pos(o)
                        if abs(ox - ax) <= r and abs(oy - ay) <= r and math.hypot(ox - ax, oy - ay) <= r + EPS:
                            n += 1
                k = (n, a.prog)
                if bk is None or k > bk:
                    best, bk = a, k
            return best
        return max(c, key=lambda a: a.prog)

    def _eff_slow(self, a, tw):
        pct = tw.lv["slowPct"] / 100.0
        if a.boss:
            pct *= a.bossdef.get("bossSlowFactor", 0.5)
        return min(pct, self.slow_cap)

    def _fire(self, tw, target):
        lv = tw.lv
        dmg = (lv["damage"] * (100 + tw.buff) + 50) // 100
        tw.shots += 1
        self.stats.shots += 1
        self._shots_window += 1
        cls = tw.cls
        if cls == "juno":
            r = lv["splashRadius"]
            tx, ty = self._pos(target)
            for a in list(self.active):
                if a.alive:
                    ax, ay = self._pos(a)
                    if abs(ax - tx) <= r and abs(ay - ty) <= r and math.hypot(ax - tx, ay - ty) <= r + EPS:
                        self._hit(a, dmg, True, tw)
        elif cls == "pip":
            r = lv["slowRadius"]
            if r > 0:
                tx, ty = self._pos(target)
                for a in self.active:
                    if a.alive:
                        ax, ay = self._pos(a)
                        if math.hypot(ax - tx, ay - ty) <= r + EPS:
                            self._apply_slow(a, lv["slowPct"] / 100.0, lv["slowDuration"])
            else:
                self._apply_slow(target, lv["slowPct"] / 100.0, lv["slowDuration"])
            self._hit(target, dmg, False, tw)
        else:
            self._hit(target, dmg, False, tw)

    # ---- one wave ------------------------------------------------------------------
    def run_wave(self, wd, policy=None, max_time=600.0):
        st = self.stats if (self.stats is not None and self.stats.wave == wd["wave"]) else WaveStats(wd["wave"])
        self.stats = st
        st.bounty_available = self.wave_bounty_available(wd)
        dt = self.dt
        self.t = 0.0
        self.tick = 0
        self.in_wave = True
        self.active = []
        self.releases = []
        self._rel_seq = 0
        self.live_desc = 0
        self.power_used_this_wave = set()
        self.power_lock_until = 0.0
        self._shots_window = 0
        sched = []
        seq = 0
        for g in wd["groups"]:
            for k in range(g["count"]):
                sched.append((g["at"] + k * g["gap"], seq, g["type"], g.get("cargo")))
                seq += 1
        sched.sort()
        si = 0
        nsched = len(sched)
        last_def_spawn = -1e9
        soft = self.caps["scheduledSpawnSoftCap"]
        hard = self.caps["maxActiveAliens"]
        maxdesc = self.caps["maxLiveDescendants"]
        defgap = self.caps["deferredSpawnGap"]
        attackers = []
        miras = []

        def rebuild():
            attackers[:] = [self.towers[p] for p in self.pad_ids if p in self.towers and self.towers[p].cls in ("nova", "pip", "juno", "orion")]
            miras[:] = [self.towers[p] for p in self.pad_ids if p in self.towers and self.towers[p].cls == "mira"]

        for tw in self.towers.values():
            tw.ready = 0.0
            if tw.cls == "mira":
                tw.next_pulse = tw.lv["period"]
        rebuild()
        ntow = len(self.towers)
        healers_period = None
        next_heal = None
        next_policy = 0.0
        next_sec = 1.0
        L = self.L
        active = self.active
        while True:
            t = self.t
            # 1 player commands
            if policy is not None and t + EPS >= next_policy:
                policy.tick(self, t)
                next_policy += policy.tick_interval
                if len(self.towers) != ntow or True:
                    rebuild()
                    ntow = len(self.towers)
            # 2 spawns
            while si < nsched and sched[si][0] <= t + EPS:
                due = sched[si][0]
                late = t - due > dt + EPS
                if len(active) >= soft or (late and t - last_def_spawn < defgap - EPS):
                    break
                _, _, typ, cargo = sched[si]
                self._spawn(typ, 0.0, wd, cargo)
                if late:
                    st.deferred += 1
                    if t - due > st.max_defer:
                        st.max_defer = t - due
                    last_def_spawn = t
                si += 1
            if self.releases:
                rel = self.releases
                keep = []
                for r in rel:
                    if r[0] <= t + EPS and len(active) < hard and self.live_desc < maxdesc:
                        self._spawn(r[2], r[3], wd, None, True)
                        if t - r[0] > dt + EPS:
                            st.deferred += 1
                            if t - r[0] > st.max_defer:
                                st.max_defer = t - r[0]
                    else:
                        keep.append(r)
                self.releases = keep
            # 3 support timers
            for m in miras:
                if t + EPS >= m.next_pulse:
                    m.next_pulse += m.lv["period"]
                    if self.shield < self.col["shieldCap"]:
                        self.shield = min(self.col["shieldCap"], self.shield + m.lv["shieldPoints"])
            if next_heal is None:
                for a in active:
                    if a.healer:
                        healers_period = a.healer["period"]
                        next_heal = (math.floor(t / healers_period) + 1) * healers_period
                        break
            if next_heal is not None and t + EPS >= next_heal:
                next_heal += healers_period
                hs = [a for a in active if a.alive and a.healer]
                if hs:
                    for a in active:
                        if not a.alive or a.hp >= a.maxhp:
                            continue
                        ax, ay = self._pos(a)
                        for h in hs:
                            if h is a:
                                continue
                            hx, hy = self._pos(h)
                            if math.hypot(hx - ax, hy - ay) <= h.healer["radius"] + EPS:
                                amt = int(math.floor(h.healer["amount"] * wd["hpMult"] + 0.5))
                                a.hp = min(a.maxhp, a.hp + amt)
                                break
            # 4 attacks
            if active:
                dead = False
                for tw in attackers:
                    if tw.ready <= t + EPS:
                        tgt = self._pick(tw)
                        if tgt is not None:
                            self._fire(tw, tgt)
                            base = tw.ready if tw.ready > t - dt else t
                            tw.ready = base + tw.lv["period"]
                            dead = True
                if dead:
                    active[:] = [a for a in active if a.alive]
            # 5 movement
            if active:
                leaked = False
                for a in active:
                    if not a.alive:
                        leaked = True  # defeated this tick by a power: drop it from the list below
                        continue
                    if a.slowrem > 0:
                        a.prog += a.speed * (1.0 - a.slow) * dt
                        a.slowrem -= dt
                        if a.slowrem <= 0:
                            a.slow = 0.0
                    else:
                        a.prog += a.speed * dt
                    if a.prog >= L:
                        self._leak(a)
                        leaked = True
                if leaked:
                    active[:] = [a for a in active if a.alive]
            # 6 end checks
            self.tick += 1
            self.t = t + dt
            if self.t + EPS >= next_sec:
                if self._shots_window > st.max_shots_per_s:
                    st.max_shots_per_s = self._shots_window
                self._shots_window = 0
                next_sec += 1.0
            if self.health <= 0:
                st.defeated = True
                break
            if si >= nsched and not active and not self.releases:
                break
            if self.t > max_time:
                st.defeated = True
                st.timeout = True
                break
        self.in_wave = False
        st.duration = self.t
        if not st.defeated:
            rep = sum(m.lv.get("repairOnWaveClear", 0) for m in self.towers.values() if m.cls == "mira")
            rep = min(rep, self.col.get("miraRepairCapPerWave", 1))
            if wd.get("boss"):
                rep += self.col.get("repairOnBossClear", 0)
            self.health = min(self.max_health, self.health + rep)
            self.shield = min(self.shield, self.col["shieldCap"])
        st.credits_end = self.credits
        st.health_end = self.health
        st.shield_end = self.shield
        return st


# ----------------------------------------------------------------------------
# Player policies (heuristics used only by this simulator - not part of the game)
# ----------------------------------------------------------------------------
ATTACK = ("nova", "pip", "juno", "orion")


def stress_def(wd, s, bosses=None):
    """A tougher copy of a wave: every health value (boss included) multiplied by s."""
    w2 = dict(wd)
    w2["hpMult"] = wd["hpMult"] * s
    if wd.get("boss") and bosses is not None:
        w2["bossHp"] = int(round((wd.get("bossHp") or bosses[wd["boss"]]["hp"]) * s))
    return w2


def clears(game, wd, s, tick_hz=None):
    """True when a copy of the present board stops a wave made s times tougher with no leak (no purchases)."""
    t = game.trial_clone(tick_hz)
    t.stats = WaveStats(wd["wave"])
    t.run_wave(stress_def(wd, s, game.bosses), None, max_time=500.0)
    return t.stats.leaks == 0 and not t.stats.timeout


def break_scale(game, wd, tick_hz=None, lo=0.05, hi=40.0, iters=11):
    """Largest health multiplier (relative to the wave as authored) the present board still clears with no leak."""
    if not clears(game, wd, lo, tick_hz):
        return lo
    if clears(game, wd, hi, tick_hz):
        return hi
    for _ in range(iters):
        mid = math.sqrt(lo * hi)
        if clears(game, wd, mid, tick_hz):
            lo = mid
        else:
            hi = mid
    return lo


class Competent:
    """Sensible greedy player with a plan.

    The plan is a blueprint of which class suits which pad (area damage on the PRIME pads inside the bends,
    long range on the inner pads, slows at the mouths of the bends, Sol on the beacon mound, Mira on the
    balcony, Nova everywhere else). A pad whose planned class is not unlocked yet holds a cheap Nova and is
    swapped later (sell, then place). The ORDER of purchases is greedy: before each purchase the player
    'imagines' the next two waves made tougher (a stress test on a copy of the board) and buys the affordable
    step that adds the most damage per credit; it saves when a clearly better step is nearly affordable.
    Mira is bought by rule when the colony has been leaking.
    """
    name = "competent"
    tick_interval = 1.0
    BLUEPRINT = {
        "P01": "nova", "P02": "nova", "P03": "pip", "P04": "orion", "P05": "juno", "P06": "nova",
        "P07": "nova", "P08": "juno", "P09": "orion", "P10": "sol", "P11": "pip", "P12": "orion",
        "P13": "juno", "P14": "juno", "P15": "mira", "P16": "nova",
    }
    MIRA_PADS = ("P15", "P01")

    def __init__(self, game, use_powers=True, smart_targeting=False, allow_sell=True, in_wave_buying=True,
                 trial_hz=15, look=2, blueprint=None):
        self.g = game
        self.use_powers = use_powers
        self.smart = smart_targeting
        self.allow_sell = allow_sell
        self.in_wave_buying = in_wave_buying
        self.trial_hz = trial_hz
        self.look = look
        self.plan = dict(blueprint or self.BLUEPRINT)
        for pad, cls in list(self.plan.items()):
            if cls in game.banned or (game.fixed_classes is not None and cls not in game.fixed_classes):
                self.plan[pad] = "nova"  # a class that can never be bought is replaced by Nova in the plan
        self.wait_until = 0
        self.recent_leak = [0, 0, 0]
        self.last_pen = 0.0
        self.evals = 0

    # -- stress evaluation -------------------------------------------------------
    def _trial(self, mutate=None):
        t = self.g.trial_clone(self.trial_hz)
        if mutate is not None:
            mutate(t)
        return t

    def _damage(self, trial, wd, s):
        st = WaveStats(wd["wave"])
        trial.stats = st
        trial.dmg_total = 0
        trial.run_wave(stress_def(wd, s, self.g.bosses), None, max_time=400.0)
        self.evals += 1
        return trial.dmg_total, st.leaks

    def _setup(self, wave):
        """Pick, for each look-ahead wave, a stress factor at which the present board clearly fails."""
        g = self.g
        plan = []
        for off in range(self.look):
            wd = g.wave_def(wave + off)
            s = 1.3
            base = None
            for _ in range(12):
                tr = self._trial()
                dmg, leaks = self._damage(tr, wd, s)
                base = dmg
                if leaks >= max(1, 0.3 * tr.stats.spawned) or tr.stats.boss_leaked:
                    break
                s *= 1.4
            plan.append((wd, s, max(1.0, float(base)), 1.0 if off == 0 else 0.5))
        return plan

    def _score(self, plan, mutate):
        tot = 0.0
        for wd, s, base, wgt in plan:
            dmg, _ = self._damage(self._trial(mutate), wd, s)
            tot += wgt * (dmg - base) / base
        return tot

    def _smart(self, tw):
        if self.smart:
            if tw.cls == "orion" and tw.level == 3:
                tw.mode = "STRONG"

    def _allowed(self, cls, wave):
        g = self.g
        if cls not in g.unlocked(wave):
            return False
        cap = g.classes[cls]["deployCap"]
        return cap is None or g.count(cls) < cap

    def candidates(self, wave):
        g = self.g
        plan = self._setup(wave)
        out = []
        for pad in g.pad_ids:
            if not g.pad_is_open(pad, wave):
                continue
            want = self.plan.get(pad, "nova")
            if want == "mira":
                want = "nova"  # Mira is bought by rule; until then the pad may hold a Nova
            tw = g.towers.get(pad)
            if tw is None:
                cls = want if self._allowed(want, wave) else ("nova" if self._allowed("nova", wave) else None)
                if cls is None:
                    continue
                if cls == "sol":
                    lv = g.lv("sol", 1)
                    x, y = g.pads[pad]
                    if not any(t.cls in ATTACK and math.hypot(t.x - x, t.y - y) <= lv["radius"] + EPS for t in g.towers.values()):
                        continue
                cost = g.lv(cls, 1)["cost"]

                def mut(t, cls=cls, pad=pad):
                    t.force_place(cls, pad)
                dv = self._score(plan, mut)
                out.append((dv / cost, dv, cost, "place", cls, pad))
                continue
            if tw.cls == "mira":
                continue
            filler = (tw.cls != want)
            if filler and self.allow_sell and self._allowed(want, wave):
                cost = max(0, g.lv(want, 1)["cost"] - g.refund_value(tw))

                def mut(t, cls=want, pad=pad):
                    del t.towers[pad]
                    t._recompute_buffs()
                    t.force_place(cls, pad)
                dv = self._score(plan, mut)
                out.append((dv / max(cost, 20), dv, cost, "swap", want, pad))
            if tw.level < 3 and not (filler and tw.level >= 2 and self.allow_sell):
                cost = g.lv(tw.cls, tw.level + 1)["cost"]

                def mut(t, pad=pad):
                    t.force_upgrade(pad)
                    self._smart(t.towers[pad])
                dv = self._score(plan, mut)
                out.append((dv / cost, dv, cost, "upgrade", tw.cls, pad))
        return out

    # -- decisions ----------------------------------------------------------------
    def _mira(self, wave):
        g = self.g
        if "mira" not in g.unlocked(wave):
            return False
        danger = sum(self.recent_leak) > 0 or g.health < 0.75 * g.max_health or self.last_pen > 0.93
        n = g.count("mira")
        if n == 0 and (danger or wave >= 36):
            return self._place_mira(wave)
        if n >= 1 and (sum(self.recent_leak) > 2 or g.health < 0.6 * g.max_health or wave >= 44):
            for pad, tw in g.towers.items():
                if tw.cls == "mira" and tw.level < 3 and g.can_upgrade(pad):
                    return g.upgrade(pad)
        if n == 1 and g.health < 0.5 * g.max_health and wave >= 30:
            return self._place_mira(wave)
        return False

    def _place_mira(self, wave):
        g = self.g
        cost = g.lv("mira", 1)["cost"]
        for pad in self.MIRA_PADS:
            if not g.pad_is_open(pad, wave):
                continue
            tw = g.towers.get(pad)
            if tw is None:
                return g.place("mira", pad) if g.credits >= cost else False
            if tw.cls != "mira" and self.allow_sell:
                if g.credits + g.refund_value(tw) >= cost:
                    g.sell(pad)
                    return g.place("mira", pad)
                return False
        free = g.free_pads()
        if free and g.credits >= cost:
            return g.place("mira", min(free, key=lambda p: g.coverage(p, 2.5)))
        return False

    def spend(self, wave, in_wave):
        g = self.g
        if g.credits < self.wait_until:
            return
        guard = 0
        while guard < 30:
            guard += 1
            if self._mira(wave):
                continue
            cheapest = self._cheapest(wave)
            if cheapest is None or g.credits < cheapest:
                self.wait_until = cheapest if cheapest is not None else g.credits + 10 ** 9
                return
            cands = [c for c in self.candidates(wave) if c[1] > 1e-6]
            if not cands:
                self.wait_until = g.credits + 60
                return
            cands.sort(reverse=True)
            best = cands[0]
            if best[2] <= g.credits:
                self._do(best)
                continue
            relaxed = not (self.last_pen < 0.9 and sum(self.recent_leak) == 0)
            thresh = 0.0 if relaxed else 0.65
            aff = [c for c in cands if c[2] <= g.credits and c[0] >= thresh * best[0]]
            if aff:
                self._do(aff[0])
                continue
            costs = [c[2] for c in cands if c[0] >= thresh * best[0]]
            self.wait_until = min(costs) if costs else best[2]
            return

    def _cheapest(self, wave):
        g = self.g
        costs = []
        for pad in g.pad_ids:
            if not g.pad_is_open(pad, wave):
                continue
            want = self.plan.get(pad, "nova")
            if want == "mira":
                want = "nova"
            tw = g.towers.get(pad)
            if tw is None:
                cls = want if self._allowed(want, wave) else "nova"
                costs.append(g.lv(cls, 1)["cost"])
            elif tw.cls != "mira":
                if tw.cls != want and self.allow_sell and self._allowed(want, wave):
                    costs.append(max(0, g.lv(want, 1)["cost"] - g.refund_value(tw)))
                if tw.level < 3:
                    costs.append(g.lv(tw.cls, tw.level + 1)["cost"])
        return min(costs) if costs else None

    def _do(self, c):
        g = self.g
        _, _, _, kind, cls, pad = c
        if kind == "place":
            g.place(cls, pad)
        elif kind == "upgrade":
            g.upgrade(pad)
        else:
            g.sell(pad)
            g.place(cls, pad)
        tw = g.towers.get(pad)
        if tw is not None:
            self._smart(tw)

    def prep(self, wave):
        self.wait_until = 0
        self.spend(wave, False)

    def tick(self, g, t):
        if self.in_wave_buying:
            self.spend(g.wave, True)
        if self.use_powers and g.powers:
            self._powers(g, t)

    def after_wave(self, st):
        self.recent_leak = self.recent_leak[1:] + [st.leak_damage]
        self.last_pen = st.penetration

    def _powers(self, g, t):
        boss = None
        front = None
        for a in g.active:
            if a.alive:
                if a.boss:
                    boss = a
                if front is None or a.prog > front.prog:
                    front = a
        if boss is None:
            # outside boss waves powers are kept, except to stop a likely defeat
            if front is not None and front.prog > 0.93 * g.L and g.health <= 4:
                if g.can_use_power("colony_shield"):
                    g.use_power("colony_shield")
                elif g.can_use_power("frost_pulse"):
                    g.use_power("frost_pulse")
            return
        frac = boss.prog / g.L
        if frac >= 0.30 and g.can_use_power("frost_pulse"):
            g.use_power("frost_pulse")
            return
        if frac >= 0.45 and g.can_use_power("comet_burst"):
            g.use_power("comet_burst", boss.prog)
            return
        if frac >= 0.90 and g.can_use_power("colony_shield"):
            g.use_power("colony_shield")


class Naive:
    """A young first-time player: random valid pads, likes the newest or cheapest thing,
    rarely upgrades, sometimes leaves credits unspent, never sells or changes targeting."""
    name = "naive"
    tick_interval = 2.0

    def __init__(self, game, seed, use_powers=True, p_skip=0.25, p_upgrade=0.15, p_upgrade_full=0.3, p_newest=0.5, p_cheapest=0.3):
        self.g = game
        self.rng = random.Random(seed)
        self.use_powers = use_powers
        self.p_skip = p_skip
        self.p_upgrade = p_upgrade
        self.p_upgrade_full = p_upgrade_full
        self.p_newest = p_newest
        self.p_cheapest = p_cheapest
        self.power_time = {}
        self.midwave_time = None

    def _buy_once(self, wave):
        g, rng = self.g, self.rng
        free = g.free_pads()
        do_up = rng.random() < (self.p_upgrade if free else self.p_upgrade_full)
        if do_up:
            ups = [p for p in g.towers if g.can_upgrade(p)]
            if ups:
                return g.upgrade(rng.choice(ups))
        if not free:
            return False  # every pad is full and this time the child does not upgrade: credits stay unspent
        unlocked = [c for c in g.unlocked(wave)
                    if g.classes[c]["deployCap"] is None or g.count(c) < g.classes[c]["deployCap"]]
        if not unlocked:
            return False
        r = rng.random()
        order = sorted(unlocked, key=lambda c: g.classes[c]["unlockAfterWave"])
        if r < self.p_newest:
            want = order[-1]
        elif r < self.p_newest + self.p_cheapest:
            want = min(unlocked, key=lambda c: g.lv(c, 1)["cost"])
        else:
            want = rng.choice(unlocked)
        if g.credits < g.lv(want, 1)["cost"]:
            if rng.random() < 0.5:
                return False  # saves up for the one they want
            aff = [c for c in unlocked if g.credits >= g.lv(c, 1)["cost"]]
            if not aff:
                return False
            want = rng.choice(aff)
        return g.place(want, rng.choice(free))

    def prep(self, wave):
        g, rng = self.g, self.rng
        self.midwave_time = rng.uniform(8, 30) if rng.random() < 0.2 else None
        self.power_time = {}
        if self.use_powers:
            wd = g.wave_def(wave)
            for pid, n in g.powers.items():
                if n > 0:
                    p_use = 0.7 if wd.get("boss") else 0.1
                    if rng.random() < p_use:
                        self.power_time[pid] = rng.uniform(6, 45)
        if not g.towers:
            # even the youngest player places something before the first wave
            pass
        elif rng.random() < self.p_skip:
            return
        n = rng.choice((1, 1, 2, 3)) if g.free_pads() else 1
        for _ in range(n):
            if not self._buy_once(wave):
                break
        if not g.towers:
            self._buy_once(wave)
            if not g.towers:
                g.place("nova", rng.choice(g.free_pads()))

    def tick(self, g, t):
        if self.midwave_time is not None and t >= self.midwave_time:
            self.midwave_time = None
            self._buy_once(g.wave)
        if self.power_time:
            for pid, when in list(self.power_time.items()):
                if t >= when and g.can_use_power(pid):
                    tp = None
                    if pid == "comet_burst":
                        fr = [a.prog for a in g.active if a.alive]
                        if not fr:
                            continue
                        tp = max(fr)
                    if g.use_power(pid, tp):
                        del self.power_time[pid]

    def after_wave(self, st):
        pass


class Scripted:
    """Follows an explicit list of actions per wave (used for the worked example)."""
    name = "scripted"
    tick_interval = 1.0

    def __init__(self, game, script):
        self.g = game
        self.script = script
        self.log = []

    def prep(self, wave):
        for act in self.script.get(wave, []):
            ok = False
            if act[0] == "place":
                ok = self.g.place(act[1], act[2])
            elif act[0] == "upgrade":
                ok = self.g.upgrade(act[1])
            elif act[0] == "sell":
                ok = self.g.sell(act[1])
            self.log.append((wave, act, ok, self.g.credits))

    def tick(self, g, t):
        pass

    def after_wave(self, st):
        pass


# ----------------------------------------------------------------------------
# Campaign runner
# ----------------------------------------------------------------------------
def learning_reward(data, after_wave):
    if after_wave >= 50:
        return data["economy"]["endlessLearningReward"]
    for b in data["economy"]["learningRewardByBlock"]:
        if b["afterWaveFrom"] <= after_wave <= b["afterWaveTo"]:
            return b["credits"]
    return 0


def learn_success(p, after_wave, rng, mode):
    if p >= 1.0:
        return True
    if p <= 0.0:
        return False
    if mode == "pattern":
        # deterministic, evenly spread: exactly round(5p) successes in every 5 intervals
        k = int(round(p * 5))
        return ((after_wave * 3) % 5) < k
    return rng.random() < p


def meteor_for(data, after_wave):
    for m in data["powerRules"]["meteorSchedule"]:
        if m["afterWave"] == after_wave:
            return m["power"], m["charges"]
    if after_wave > 50 and (after_wave + 1) % 10 == 0:
        rot = ["frost_pulse", "comet_burst", "colony_shield"]
        idx = (after_wave + 1) // 10 - 1  # wave 9 -> 0, 19 -> 1 ...
        return rot[idx % 3], 1
    return None


def describe_towers(g):
    parts = []
    for p in g.pad_ids:
        if p in g.towers:
            tw = g.towers[p]
            parts.append("%s:%s%d" % (p, tw.cls[:2].title(), tw.level))
    return " ".join(parts)


def run_campaign(data, policy="competent", learn_p=0.6, meteor=True, seed=1, max_wave=50, tick_hz=30,
                 banned=(), learn_mode="pattern", policy_opts=None, fail_waves=(), script=None, quiet=True):
    g = Game(data, tick_hz=tick_hz, banned=banned)
    rng = random.Random(seed * 7919 + 13)
    opts = dict(policy_opts or {})
    if policy == "competent":
        pol = Competent(g, use_powers=meteor, **opts)
    elif policy == "naive":
        pol = Naive(g, seed, use_powers=meteor, **opts)
    else:
        pol = Scripted(g, script or {})
    rows = []
    cleared = 0
    defeated_at = None
    for w in range(1, max_wave + 1):
        g.wave = w
        st = WaveStats(w)
        g.stats = st
        st.credits_start = g.credits
        if w > 1:
            ok = learn_success(learn_p, w - 1, rng, learn_mode) and (w - 1) not in fail_waves
            if ok:
                r = learning_reward(data, w - 1)
                g.credits += r
                st.learn = r
            if meteor:
                m = meteor_for(data, w - 1)
                if m and learn_success(learn_p, w - 1 + 1000, rng, "bernoulli" if learn_mode != "pattern" else "pattern"):
                    cap = data["powerRules"]["inventoryCapPerPower"]
                    g.powers[m[0]] = min(cap, g.powers.get(m[0], 0) + m[1])
        pol.prep(w)
        wd = g.wave_def(w)
        st.towers = describe_towers(g)
        g.run_wave(wd, pol)
        st.invested = g.invested_total()
        pol.after_wave(st)
        rows.append(st)
        if st.defeated:
            defeated_at = w
            break
        cleared = w
    return {"policy": policy, "learn_p": learn_p, "meteor": meteor, "seed": seed, "cleared": cleared,
            "defeated_at": defeated_at, "health": g.health, "shield": g.shield, "rows": rows, "game": g, "pol": pol}


def run_challenge(data, ch, policy="competent", learn_p=0.6, seed=1, tick_hz=30):
    g = Game(data, tick_hz=tick_hz, start_credits=ch["startingCredits"], classes=ch["classes"], health=ch["colonyHealth"])
    g.pad_wave_override = ch.get("padsOpenAsForWave")
    keep = g.credits
    for pp in ch.get("presetPlacements", []):
        # the challenge's starting snapshot: astronauts already at their posts (no charge)
        g.credits = 10 ** 6
        g.place(pp["class"], pp["pad"])
        for _ in range(pp["level"] - 1):
            g.upgrade(pp["pad"])
    g.credits = keep
    rng = random.Random(seed * 31 + 7)
    pol = Competent(g, use_powers=True) if policy == "competent" else Naive(g, seed, use_powers=True)
    rows = []
    cleared = 0
    for i, wn in enumerate(ch["waves"]):
        g.wave = wn  # used only for look-ahead profiles; class availability is fixed by the challenge
        st = WaveStats(wn)
        g.stats = st
        st.credits_start = g.credits
        if i > 0:
            if learn_success(learn_p, i, rng, "pattern"):
                g.credits += ch["learningReward"]
                st.learn = ch["learningReward"]
            if ch.get("meteor") and ch.get("meteorAfterIndex") == i and learn_success(learn_p, i + 1000, rng, "pattern"):
                g.powers[ch["meteorPower"]] = 1
        pol.prep(wn)
        st.towers = describe_towers(g)
        g.run_wave(g.wave_def(wn), pol)
        pol.after_wave(st)
        rows.append(st)
        if st.defeated:
            break
        cleared = i + 1
    return {"id": ch["id"], "policy": policy, "cleared": cleared, "of": len(ch["waves"]), "health": g.health, "rows": rows}


if __name__ == "__main__":
    import sys
    import time
    data = load_data()
    pol = sys.argv[1] if len(sys.argv) > 1 else "competent"
    p = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
    met = (sys.argv[3] == "1") if len(sys.argv) > 3 else False
    seed = int(sys.argv[4]) if len(sys.argv) > 4 else 1
    t0 = time.time()
    r = run_campaign(data, pol, p, met, seed)
    print("policy=%s learn=%.0f%% meteor=%s seed=%d -> cleared %d, defeated_at=%s, health=%d shield=%d  (%.1fs)" % (
        pol, p * 100, met, seed, r["cleared"], r["defeated_at"], r["health"], r["shield"], time.time() - t0))
    print("wave  dur  peak  pen  leaks dmg  hp sh  bounty/avail learn spentP spentW credits  towers")
    for st in r["rows"]:
        print("%3d %5.1f %4d %5.2f %4d %3d %3d %2d %5d/%-5d %4d %5d %5d %6d  %s" % (
            st.wave, st.duration, st.peak_active, st.penetration, st.leaks, st.leak_damage, st.health_end,
            st.shield_end, st.bounty, st.bounty_available, st.learn, st.spent_prep, st.spent_wave, st.credits_end, st.towers))
