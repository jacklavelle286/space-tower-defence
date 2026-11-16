// The run as the client reducer sees it, rebuilt from what the server saved (spine S3.7: resume from the cloud save,
// never from memory). R9 gives the run, every slot's status and the current slot's recorded answers; R10 gives each
// unresolved slot's accepted answers and reward; the pinned ruleset gives the power cap.
import type { Ruleset, RunPhase, RunState, Slot, Targeting } from "@scd/game-core";
import { toPanelActivity, type PanelActivity } from "@scd/shared/learning";
import { activityAssetUrl } from "./activityAssets";
import type { Pack, PackSlot, RunDetail } from "./types";

/**
 * Attempts the server returns carry no opId (G §4.1), and the reducer only counts and compares them. A fixed,
 * clearly fake UUID per position fills the field; it is never sent anywhere.
 */
function savedAttemptId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export function buildRunState(detail: RunDetail, pack: Pack, ruleset: Ruleset): RunState {
  const packed = new Map(pack.slots.map((s) => [s.slotId, s]));
  const current = detail.currentSlot;
  const slots: Slot[] = detail.slots.map((entry) => {
    const p = packed.get(entry.slotId);
    const attempts =
      current !== null && current.slotId === entry.slotId
        ? current.attempts.map((a) => ({ n: a.n, attemptId: savedAttemptId(a.n), answer: a.answer, correct: a.correct }))
        : [];
    return {
      slotId: entry.slotId,
      kind: entry.kind,
      status: entry.status as Slot["status"],
      attempts,
      accepted: [...(p?.answerSpecification?.accepted ?? [])],
      withdrawn: p?.withdrawn ?? (current?.slotId === entry.slotId ? current.withdrawn : false),
      reward: p?.reward.powerId !== undefined ? { credits: p.reward.credits, powerId: p.reward.powerId } : { credits: p?.reward.credits ?? 0 },
    };
  });
  const base = {
    mode: detail.mode,
    status: detail.status as RunState["status"],
    stage: detail.stage as RunState["stage"],
    wave: detail.wave,
    finalWave: detail.finalWave,
    highestCompletedWave: detail.highestCompletedWave,
    campaignCompleted: detail.campaignCompletedAt !== undefined && detail.campaignCompletedAt !== null,
    plannedThrough: detail.plannedThrough,
    revision: detail.revision,
    powerChargeCap: ruleset.powerRules.inventoryCapPerPower,
    slots,
  };
  if (detail.status !== "IN_PROGRESS" || detail.snapshot === undefined || detail.phase === undefined) return base;
  const s = detail.snapshot;
  return {
    ...base,
    phase: detail.phase as RunPhase,
    snapshot: {
      credits: s.credits,
      placements: s.placements.map((p) => ({ padId: p.padId, classId: p.classId, level: p.level, targeting: p.targeting as Targeting })),
      colony: { health: s.colony.health, shield: s.colony.shield },
      powers: { ...s.powers },
    },
  };
}

/**
 * A power's name for the child, from its ID: "frost-pulse" -> "Frost Pulse" (plan C10 names the powers Frost Pulse,
 * Comet Burst and Colony Shield; the server's IDs are those names in lower case with hyphens).
 */
export function powerName(powerId: string): string {
  return powerId
    .split("-")
    .filter((word) => word !== "")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

/**
 * What the learning panel shows for one pack entry, or null when it cannot be shown: withdrawn (the definition is
 * omitted), or a type or payload this client cannot show (toPanelActivity in web/shared decides, by interactionType:
 * all six types, and two-step activities).
 */
export function panelActivity(slot: PackSlot): PanelActivity | null {
  if (slot.withdrawn) return null;
  return toPanelActivity(
    {
      slotId: slot.slotId,
      ...(slot.interactionType !== undefined ? { interactionType: slot.interactionType } : {}),
      ...(slot.prompt !== undefined ? { prompt: slot.prompt } : {}),
      activityPayload: slot.activityPayload,
      ...(slot.answerSpecification !== undefined ? { answerSpecification: slot.answerSpecification } : {}),
      ...(slot.additionalSteps !== undefined ? { additionalSteps: slot.additionalSteps } : {}),
      ...(slot.presentation !== undefined ? { presentation: slot.presentation } : {}),
      // The pack carries no audioRequirement (G R10 allow-list). A slot with a prompt clip is treated as needing its
      // sound: true for every Milestone 1 activity (phonics, B3.2). [ASSUMPTION] until the pack carries the flag.
      audioRequired: slot.clips["prompt"] !== undefined,
      // A meteor slot pays a power charge and no credits: the panel says "Frost Pulse is ready!", never "+0 space credits".
      reward: slot.reward.powerId !== undefined ? { credits: slot.reward.credits, powerName: powerName(slot.reward.powerId) } : { credits: slot.reward.credits },
    },
    activityAssetUrl,
  );
}
