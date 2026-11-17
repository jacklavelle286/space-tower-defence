// The balance checks (Gate M, LD5): the same draft gives the same report twice, and each known-bad level raises its
// rule: unwinnable, plays itself, too long. Challenge wave sets keep these fast; the campaign's full check is the LD0
// spike's (75 s on one thread).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_DATA_DIR } from "../../scripts/build-bounds";
import { parsePlanet, parseRuleset, type PlanetDocument } from "../data/game-data";
import { judgeChecks, planChecks, runJob, type CheckRule } from ".";

const r4 = parseRuleset(JSON.parse(readFileSync(join(GAME_DATA_DIR, "ruleset", "r4.json"), "utf8")));
type Json = Record<string, any>; // oxlint-disable-line typescript/no-explicit-any
const RAW = JSON.parse(readFileSync(join(import.meta.dirname, "..", "data", "fixtures", "schema2-planet.json"), "utf8")) as Json;

function planet(change: (d: Json) => void = () => {}): PlanetDocument {
  const d = structuredClone(RAW);
  change(d);
  return parsePlanet(d, r4);
}

function check(doc: PlanetDocument, id: string) {
  const results = planChecks(doc, [id]).map((job) => runJob(r4, doc, job));
  const [report] = judgeChecks(doc, r4, results);
  if (report === undefined) throw new Error("no report");
  return report;
}

const rules = (r: { findings: readonly { rule: CheckRule }[] }): CheckRule[] => r.findings.map((f) => f.rule);

describe("balance checks", () => {
  it("plan: competent at three learning rates, no astronauts, the naive child; minimal only in the campaign", () => {
    const doc = planet();
    const jobs = planChecks(doc, ["blob-rush", "campaign"]);
    expect(jobs.filter((j) => j.waveSetId === "blob-rush").map((j) => j.policy)).toEqual([
      "competent", "competent", "competent", "none", ...Array.from({ length: 15 }, () => "naive"),
    ]);
    expect(jobs.filter((j) => j.waveSetId === "campaign" && j.policy === "minimal")).toHaveLength(1);
    expect(jobs.filter((j) => j.waveSetId === "campaign" && j.policy === "naive")).toHaveLength(60);
  });

  it("a fair challenge: nothing blocks, and the same draft gives the same report twice", () => {
    const a = check(planet(), "blob-rush");
    expect(a.findings.filter((f) => f.severity === "block")).toEqual([]);
    expect(a.verdict).toMatch(/Competent at 0% learning clears all\..*Nothing blocks publishing\./);
    expect(check(planet(), "blob-rush")).toEqual(a);
    expect(a.columns.map((c) => c.label)).toEqual(["Competent 0%", "Competent 60%", "Competent 100%", "No astronauts"]);
    expect(a.columns[0]?.cells).toHaveLength(2);
  });

  it("unwinnable: the competent player cannot clear it, which blocks", () => {
    // Forty very tough blobs: even leaking one health each they are more than the colony's 20.
    const doc = planet((d) => {
      d.challengeWaves["blob-burst"].hpMult = 60;
      d.challengeWaves["blob-burst"].groups = [{ type: "blob", count: 40, at: 0, gap: 0.8 }];
    });
    const report = check(doc, "blob-rush");
    expect(report.findings).toContainEqual({ waveSetId: "blob-rush", rule: "competentClears", severity: "block", wave: 2 });
  });

  it("plays itself: the presets alone win", () => {
    const doc = planet((d) => {
      d.waveSets["blob-rush"].presetPlacements = [3, 4, 6, 7, 9, 10].map((n) => ({ padId: `z${String(n).padStart(2, "0")}`, classId: "nova", level: 3, targeting: "FRONT" }));
      d.challengeWaves["blob-burst"].groups = [{ type: "blob", count: 3, at: 0, gap: 3 }];
    });
    expect(rules(check(doc, "blob-rush"))).toContain("playsItself");
  });

  it("too long: a wave of slow, spread-out aliens lasts more than 90 seconds", () => {
    const doc = planet((d) => (d.challengeWaves["blob-burst"].groups = [{ type: "shell", count: 8, at: 0, gap: 14 }]));
    const report = check(doc, "blob-rush");
    expect(report.findings).toContainEqual({ waveSetId: "blob-rush", rule: "waveLong", severity: "warn", wave: 2 });
  });
});
