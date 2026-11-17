// Plausibility bounds (spine S6, F section 6.1; Phase 30, M2-07): step (h) of the server's per-op order, checked
// against the stored snapshot with only the numbers in the run's bounds file. Anti-nonsense, not anti-cheat (E.10):
// the bounds limit what a checkpoint can gain, they do not try to prove the wave was played.
//
//   value(s) = s.credits + invested(s.placements)        invested: each placement's cumulative cost for its level
//   SAVE_PREP, START_WAVE    value(payload) <= value(stored)            (no income in preparation; learning rewards
//                                                                         are already in the stored snapshot)
//   COMPLETE_WAVE(w)         value(payload) <= value(stored) + maxBounty[w]; 0 < colony.health <= maxHealth;
//                            0 <= colony.shield <= shieldCap (a Colony Shield above it is trimmed when the wave is
//                            cleared, C10); every power count <= the stored count (charges only enter through the
//                            server's meteor grant)
//   placements (all three)   pads unique and open; class unlocked; per-class deploy cap; targeting open at the level
//
// Pads: a CHALLENGE fixes its open pads (padsOpenAsForWave); a CAMPAIGN pad is open once its opensAfterWave is at most
// the highest completed wave (C3.3), or when the wave set opens it from the start. Classes: a CAMPAIGN class is
// unlocked once its unlockAfterWave is at most the highest completed wave (C5.9); a CHALLENGE lists its classes.
// Unknown pads, classes, levels and modes are not checked here: the payload step refused them already (G section 5.2).
//
// An endless COMPLETE_WAVE (a wave past the authored set) has no maxBounty yet, so it is refused until endless
// content brings its bound (Phase 54) [ASSUMPTION: fail closed].
//
// A problem is {field, rule}, values never copied (G section 1.2), in a fixed order: each placement in order (unique,
// padClosed, classLocked, targetingLevel), deploy caps by class ID, then value (or maxBounty), health, shield, and
// powers by ID. api/shared/plausibility.py is the Python mirror; contracts/fixtures/plausibility/vectors.json checks
// that both agree.
import type { Bounds } from "../data/game-data";
import type { Op, Placements, Powers, Snapshot } from "./contracts.generated";

export interface PlausibilityProblem {
  readonly field: string;
  readonly rule: "unique" | "padClosed" | "classLocked" | "targetingLevel" | "deployCap" | "value" | "maxBounty" | "health" | "shield" | "power";
}

/** What the checks read from the stored run. */
export interface PlausibilityRun {
  readonly waveSetId: string;
  readonly highestCompletedWave: number;
  readonly snapshot: Snapshot;
}

/** credits + everything paid for the placements' levels (spine S6). */
export function snapshotValue(bounds: Bounds, credits: number, placements: Placements): number {
  let value = credits;
  for (const p of placements) value += bounds.classes[p.classId]?.cumulativeCosts[p.level - 1] ?? 0;
  return value;
}

function sortedKeys(record: Readonly<Record<string, unknown>>): string[] {
  // UTF-16 code unit order, as Array.prototype.sort; the Python mirror sorts the same way.
  return Object.keys(record).sort();
}

function placementProblems(bounds: Bounds, run: PlausibilityRun, placements: Placements): PlausibilityProblem[] {
  const out: PlausibilityProblem[] = [];
  const set = bounds.waveSets[run.waveSetId];
  if (set === undefined) return out;
  const campaign = set.mode === "CAMPAIGN";
  const openThrough = campaign ? Math.max(set.padsOpenAsForWave - 1, run.highestCompletedWave) : set.padsOpenAsForWave - 1;
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  placements.forEach((p, i) => {
    const at = `op.payload.placements[${i}]`;
    if (seen.has(p.padId)) out.push({ field: `${at}.padId`, rule: "unique" });
    seen.add(p.padId);
    const pad = bounds.pads[p.padId];
    if (pad !== undefined && pad.opensAfterWave > openThrough) out.push({ field: `${at}.padId`, rule: "padClosed" });
    const cls = bounds.classes[p.classId];
    if (cls === undefined) return;
    counts[p.classId] = (counts[p.classId] ?? 0) + 1;
    if (campaign && cls.unlockAfterWave > run.highestCompletedWave) out.push({ field: `${at}.classId`, rule: "classLocked" });
    if (p.level < (cls.targetingFromLevel?.[p.targeting] ?? 1)) out.push({ field: `${at}.targeting`, rule: "targetingLevel" });
  });
  for (const classId of sortedKeys(counts)) {
    const cap = bounds.classes[classId]?.deployCap ?? null;
    if (cap !== null && (counts[classId] ?? 0) > cap) out.push({ field: "op.payload.placements", rule: "deployCap" });
  }
  return out;
}

function powerProblems(stored: Powers, sent: Powers): PlausibilityProblem[] {
  return sortedKeys(sent)
    .filter((id) => (sent[id] ?? 0) > (stored[id] ?? 0))
    .map((id) => ({ field: `op.payload.powers.${id}`, rule: "power" as const }));
}

/** Every bounds problem with `op` against the stored run; empty when it is plausible or not a checkpoint op. */
export function plausibilityProblems(bounds: Bounds, run: PlausibilityRun, op: Op): PlausibilityProblem[] {
  if (op.type !== "SAVE_PREP" && op.type !== "START_WAVE" && op.type !== "COMPLETE_WAVE") return [];
  const { credits, placements } = op.payload;
  const out = placementProblems(bounds, run, placements);
  const before = snapshotValue(bounds, run.snapshot.credits, run.snapshot.placements);
  const after = snapshotValue(bounds, credits, placements);
  if (op.type !== "COMPLETE_WAVE") {
    if (after > before) out.push({ field: "op.payload.credits", rule: "value" });
    return out;
  }
  const bounty = bounds.waveSets[run.waveSetId]?.maxBounty[op.payload.wave - 1];
  if (bounty === undefined) out.push({ field: "op.payload.wave", rule: "maxBounty" });
  else if (after > before + bounty) out.push({ field: "op.payload.credits", rule: "value" });
  const { health, shield } = op.payload.colony;
  if (health <= 0 || health > bounds.colony.maxHealth) out.push({ field: "op.payload.colony.health", rule: "health" });
  if (shield < 0 || shield > bounds.colony.shieldCap) out.push({ field: "op.payload.colony.shield", rule: "shield" });
  out.push(...powerProblems(run.snapshot.powers, op.payload.powers));
  return out;
}
