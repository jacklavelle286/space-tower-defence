// Bank status in plain words (A10, D §D8.5; Phase 42). R30 sends the counts, thresholds and what is missing; these
// functions only word them, so the numbers on the page are always the server's (the same counting function selection
// uses, api/shared/selection/eligibility.py). Topic names come from the registry (plan C19).
import { bandName, TOPICS, type Topic } from "@scd/shared";
import type { BankBand, BankNeed } from "../api";

type Slot = "NORMAL" | "METEOR";

export const SLOT_WORD: Record<Slot, string> = {
  NORMAL: "normal",
  METEOR: "meteor",
};
/** Which reward categories fill a slot kind: its own, or Both. */
export const FILLED_BY: Record<Slot, string> = {
  NORMAL: "Normal or Both",
  METEOR: "Meteor or Both",
};

export const MODE_LABEL: Record<BankBand["mode"], string> = {
  READY: "Ready",
  STARTER: "Starter rules",
  BLOCKED: "Blocked",
};

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** One sentence under the age's heading: what happens when a child of this age starts a new game. The mode comes
 * from the server, which ran the released wave sets through the selector (`waveSets`). */
export function modeSentence(band: BankBand): string {
  const stuck = band.waveSets
    .filter((ws) => !ws.fillable)
    .map((ws) => ws.waveSetId);
  switch (band.mode) {
    case "READY":
      return "Ready. New games use the full selection rules.";
    case "STARTER":
      return "Not ready yet, but new games still start: until this year is ready, any subject can fill a slot while activities last.";
    case "BLOCKED":
      if (band.activities === 0)
        return `Blocked: nothing is published for ${bandName(band.ageBand)}, so new games cannot start.`;
      if (stuck.length > 0) {
        return `Blocked: there are not enough activities for every slot of ${stuck.join(", ")} (a meteor slot needs one marked Meteor or Both), so new games are refused until you publish more.`;
      }
      return `Blocked: ${bandName(band.ageBand)} is below its thresholds, so new games are refused until you publish more.`;
  }
}

/** A short note on the full 50-wave campaign (49 normal and 5 meteor slots), when it could not be filled today. */
export function campaignNote(
  band: BankBand,
  slots: { NORMAL: number; METEOR: number },
): string | null {
  if (band.campaignFillable || band.starterCampaignFillable) return null;
  const needed = slots.NORMAL + slots.METEOR;
  return `A full campaign needs ${needed} different activities (${slots.NORMAL} normal and ${slots.METEOR} meteor slots); this year has ${band.activities}.`;
}

/** One line of "What to add". */
export function needSentence(need: BankNeed, unitsPerTopic: number): string {
  switch (need.what) {
    case "UNITS":
      return `${plural(need.more, `more ${need.subject} activity`, `more ${need.subject} activities`)} for ${SLOT_WORD[need.rewardCategory]} slots (${FILLED_BY[need.rewardCategory]}): ${need.have} of ${need.need}.`;
    case "TOPICS":
      return `${capital(need.subject)}: ${plural(need.more, "more topic")} with at least ${unitsPerTopic} activities each (${need.have} of ${need.need} now).`;
    case "TEMPLATE_INSTANCES":
      return `${capital(need.subject)} templates offering ${need.more} more questions for ${SLOT_WORD[need.rewardCategory]} slots (${need.have} of ${need.need}; a template counts every question it can make).`;
    case "CAMPAIGN":
      return "Every count is met, but a full campaign cannot be filled yet: add a few more activities marked Normal or Meteor (not Both).";
  }
}

/** Registry topics for this age and subject that have no published activity yet: where new activities widen the
 * spread most. */
export function emptyTopics(band: BankBand, subject: string): Topic[] {
  const covered = new Set(
    band.groups
      .filter((g) => g.subject === subject)
      .flatMap((g) => g.topics.map((t) => t.topicId)),
  );
  return TOPICS.filter(
    (t) =>
      t.subject === subject &&
      t.ages.includes(band.ageBand) &&
      !covered.has(t.topicId),
  );
}

/** "Count objects to 10, Add within 10 and 3 more": at most `shown` names. */
export function topicNames(topics: readonly Topic[], shown = 4): string {
  const names = topics.slice(0, shown).map((t) => t.title);
  const rest = topics.length - names.length;
  return rest > 0 ? `${names.join(", ")} and ${rest} more` : names.join(", ");
}
