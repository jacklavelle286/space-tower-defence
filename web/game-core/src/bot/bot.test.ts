// The test players (Gate M, LD0). The long comparison with the Python simulator is scripts/ld0-bots.spike.ts
// (docs/validation/ld0-spikes.md); these are the fast checks that keep the port honest in every test run.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_DATA_DIR } from "../../scripts/build-bounds";
import { parsePlanet, parseRuleset } from "../data/game-data";
import { compileBattleConfig } from "../sim/config";
import { competentPolicy, deriveBlueprint, learnSucceeds, MOONBEAM_BLUEPRINT, minimalPolicy, naivePolicy, nonePolicy, playWaveSet, presetsOnlyPolicy } from ".";

const rs = parseRuleset(JSON.parse(readFileSync(join(GAME_DATA_DIR, "ruleset", "r4.json"), "utf8")));
const planet = parsePlanet(JSON.parse(readFileSync(join(GAME_DATA_DIR, "campaign", "luna-1-c2.json"), "utf8")), rs);
const campaign = compileBattleConfig(rs, planet, "campaign");

describe("learning success pattern (tools/sim learn_success, pattern mode)", () => {
  it("gives exactly round(5p) successes in every 5 intervals", () => {
    for (const p of [0, 0.2, 0.6, 1]) {
      for (let start = 1; start <= 46; start += 5) {
        const hits = [0, 1, 2, 3, 4].filter((k) => learnSucceeds(p, start + k)).length;
        expect(hits).toBe(Math.round(p * 5));
      }
    }
  });
});

describe("minimal player", () => {
  it("reproduces C17.2: clears 1-9 with no leak, leaks in 10 and 11, health 8 after 12, defeated in 13", () => {
    const r = playWaveSet(rs, campaign, minimalPolicy(campaign), { learn: 0, meteors: false, maxWave: 20 });
    expect(r.cleared).toBe(12);
    expect(r.defeatedAt).toBe(13);
    expect(r.rows.slice(0, 9).every((row) => row.leaked === 0)).toBe(true);
    expect(r.rows[9]?.leaked).toBeGreaterThan(0);
    expect(r.rows[10]?.leaked).toBeGreaterThan(0);
    expect(r.rows[11]?.healthEnd).toBe(8);
  });
});

describe("boards that never buy", () => {
  it("the None board loses the campaign early", () => {
    const r = playWaveSet(rs, campaign, nonePolicy(), { learn: 0 });
    expect(r.defeatedAt).not.toBeNull();
    expect(r.cleared).toBeLessThan(5);
  });

  it("presets-only keeps a challenge's presets and loses when they are not enough", () => {
    const config = compileBattleConfig(rs, planet, "wobble-rematch");
    const kept = playWaveSet(rs, config, presetsOnlyPolicy(), { learn: 0 });
    const none = playWaveSet(rs, config, nonePolicy(), { learn: 0 });
    expect(kept.cleared).toBeGreaterThanOrEqual(none.cleared);
  });
});

describe("naive player", () => {
  it("is a pure function of its seed", () => {
    const a = playWaveSet(rs, campaign, naivePolicy(campaign, 7), { learn: 0.6, maxWave: 15 });
    const b = playWaveSet(rs, campaign, naivePolicy(campaign, 7), { learn: 0.6, maxWave: 15 });
    expect(b.rows).toEqual(a.rows);
  });

  it("different seeds play differently", () => {
    const a = playWaveSet(rs, campaign, naivePolicy(campaign, 1), { learn: 0.6, maxWave: 15 });
    const b = playWaveSet(rs, campaign, naivePolicy(campaign, 2), { learn: 0.6, maxWave: 15 });
    expect(b.rows.map((r) => r.credits)).not.toEqual(a.rows.map((r) => r.credits));
  });
});

describe("competent player", () => {
  it("clears the opening waves without a leak (C17.2, waves 1-5 very hard to lose)", () => {
    const r = playWaveSet(rs, campaign, competentPolicy(campaign), { learn: 0, maxWave: 6 });
    expect(r.cleared).toBe(6);
    expect(r.rows.every((row) => row.leaked === 0)).toBe(true);
  });

  it("only buys classes the wave set offers", () => {
    const config = compileBattleConfig(rs, planet, "blob-parade");
    const r = playWaveSet(rs, config, competentPolicy(config, { blueprint: deriveBlueprint(config) }), { learn: 0.6 });
    expect(r.cleared).toBe(config.waves.length);
  });
});

describe("derived pad plan", () => {
  it("is a pure function of the map and respects the deploy caps", () => {
    const plan = deriveBlueprint(campaign);
    expect(deriveBlueprint(campaign)).toEqual(plan);
    expect(Object.keys(plan).sort()).toEqual(campaign.pads.map((p) => p.id).sort());
    for (const [id, cls] of Object.entries(campaign.classes)) {
      const n = Object.values(plan).filter((c) => c === id).length;
      if (cls.deployCap !== null) expect(n, id).toBeLessThanOrEqual(cls.deployCap);
    }
  });

  it("the simulator's Moonbeam plan names every Moonbeam pad", () => {
    expect(Object.keys(MOONBEAM_BLUEPRINT).sort()).toEqual(campaign.pads.map((p) => p.id).sort());
  });
});
