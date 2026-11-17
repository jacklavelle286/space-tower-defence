// The wave design tools (Gate M, LD4).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_DATA_DIR } from "../../scripts/build-bounds";
import { parsePlanet, parseRuleset, type AuthoredWave } from "../data/game-data";
import { copyWave, fillIn, introduceAlien, scaleCounts, toughness, typesBy, vary, waveStats } from ".";

const r4 = parseRuleset(JSON.parse(readFileSync(join(GAME_DATA_DIR, "ruleset", "r4.json"), "utf8")));
const live = parsePlanet(JSON.parse(readFileSync(join(GAME_DATA_DIR, "campaign", "luna-1-c2.json"), "utf8")), r4);
const wave = (n: number): AuthoredWave => {
  const w = live.waves.find((x) => x.wave === n);
  if (w === undefined) throw new Error(`no wave ${n}`);
  return w;
};

describe("waveStats", () => {
  it("wave 1: six Moon Blobs", () => {
    // 6 x 24 health; the last leaves at 5 x 2.5 s and walks 40 tiles at 1 tile/s.
    expect(waveStats(r4, wave(1), 40)).toEqual({ aliens: 6, health: 144, seconds: 52.5, peakLive: 6 });
  });

  it("counts descendants and a boss's releases, and the boss's own health", () => {
    const craft = waveStats(r4, { groups: [{ type: "craft", count: 1, at: 0, gap: 0 }], hpMult: 1, speedMult: 1 }, 40);
    expect(craft.aliens).toBeGreaterThan(1);
    const boss = waveStats(r4, { groups: [{ type: "boss1", count: 1, at: 0, gap: 0 }], hpMult: 3, speedMult: 1 }, 40);
    expect(boss.health).toBeGreaterThanOrEqual(r4.bosses["boss1"]?.hp ?? 0); // not multiplied by hpMult
  });
});

describe("fillIn", () => {
  // The owner's example (scope 3.1a): wave 1 = 20 x blob; wave 50 = 40 x blob + 20 x mite.
  const ramp = (): AuthoredWave[] =>
    Array.from({ length: 50 }, (_, i) => ({ wave: i + 1, groups: [{ type: "blob", count: 1, at: 0, gap: 1 }], hpMult: 1, speedMult: 1 })).map((w) =>
      w.wave === 1
        ? { ...w, groups: [{ type: "blob", count: 20, at: 0, gap: 1 }] }
        : w.wave === 50
          ? { ...w, groups: [{ type: "blob", count: 40, at: 0, gap: 1 }, { type: "mite", count: 20, at: 10, gap: 0.5 }], hpMult: 3 }
          : w,
    );

  it("interpolates counts, mix and multipliers between keyframes; keyframes stay", () => {
    const out = fillIn(r4, ramp(), [1, 50]);
    expect(out[0]).toEqual(ramp()[0]);
    expect(out[49]).toEqual(ramp()[49]);
    const mid = out.find((w) => w.wave === 25);
    // t = 24/49: blob 20 -> 40 is 29.8 (30), mite 0 -> 20 is 9.8 (10), hpMult 1 -> 3 is 1.98.
    expect(mid?.groups.map((g) => [g.type, g.count])).toEqual([
      ["blob", 30],
      ["mite", 10],
    ]);
    expect(mid?.hpMult).toBe(1.98);
    // Counts never fall between keyframes on a rising ramp.
    const blobs = out.map((w) => w.groups.find((g) => g.type === "blob")?.count ?? 0);
    expect(blobs.every((c, i) => i === 0 || c >= (blobs[i - 1] ?? 0))).toBe(true);
  });

  it("keeps hand overrides, and a boss on its tenth wave", () => {
    const waves = ramp().map((w) => (w.wave === 30 ? { ...w, groups: [{ type: "boss3", count: 1, at: 8, gap: 0 }] } : w));
    const out = fillIn(r4, waves, [1, 50], { overrides: [20] });
    expect(out[19]).toEqual(waves[19]);
    expect(out[29]?.groups.some((g) => g.type === "boss3")).toBe(true);
    expect(out[29]?.groups.some((g) => g.type === "blob")).toBe(true);
  });

  it("an ease-in curve starts slower than linear", () => {
    const linear = fillIn(r4, ramp(), [1, 50])[10]?.groups[0]?.count ?? 0;
    const easeIn = fillIn(r4, ramp(), [1, 50], { curve: "ease-in" })[10]?.groups[0]?.count ?? 0;
    expect(easeIn).toBeLessThan(linear);
  });
});

describe("vary", () => {
  const pool = typesBy(r4, live.waves, 30);

  it("the same seed gives the same wave; another seed another", () => {
    const a = vary(r4, wave(29), 7, { pool });
    expect(vary(r4, wave(29), 7, { pool })).toEqual(a);
    expect(vary(r4, wave(29), 8, { pool })).not.toEqual(a);
  });

  it("stays within the toughness budget and never touches a boss or the multipliers", () => {
    for (const n of [5, 12, 29, 40, 49]) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const v = vary(r4, wave(n), seed, { pool, budgetPct: 10 });
        const t = toughness(r4, wave(n));
        expect(Math.abs(toughness(r4, v) - t), `wave ${n} seed ${seed}`).toBeLessThanOrEqual(t * 0.1 + 1e-9);
        expect(v.hpMult).toBe(wave(n).hpMult);
        expect(v.groups.filter((g) => g.type.startsWith("boss"))).toEqual(wave(n).groups.filter((g) => g.type.startsWith("boss")));
      }
    }
  });
});

describe("helpers", () => {
  it("scale, copy and introduce", () => {
    const scaled = scaleCounts(r4, live.waves, 1, 2, 50);
    expect(scaled[0]?.groups[0]?.count).toBe(9);
    expect(scaled[2]).toEqual(live.waves[2]);
    const copied = copyWave(r4, live.waves, 10, 11); // the boss is not copied off a tenth wave
    expect(copied[10]?.groups.some((g) => g.type === "boss1")).toBe(false);
    expect(copied[10]?.wave).toBe(11);
    expect(introduceAlien("shell")).toEqual([{ type: "shell", count: 4, at: 0, gap: 2.5 }]);
  });
});
