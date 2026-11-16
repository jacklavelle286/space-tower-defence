// An R30 body for the admin tests, in the shape api/shared/selection/eligibility.py `bank_status` writes. The numbers
// are close to the starter pack on 2026-11-16 (age 5: 12 maths, 4 phonics, 10 spelling, mostly Both); age 6 is shown
// ready and age 7 blocked so each mode is covered. Example topic IDs from the registry only.
import type { BankBand, BankGroup, BankStatus } from "../api";

const THRESHOLDS = {
  maths: [34, 4],
  phonics: [32, 4],
  spelling: [32, 2],
} as const;
const MINIMUMS = {
  maths: [17, 2],
  phonics: [16, 2],
  spelling: [16, 1],
} as const;

function groups(
  counts: Record<keyof typeof THRESHOLDS, [number, number]>,
  topics: Record<string, string[]>,
): BankGroup[] {
  return (Object.keys(THRESHOLDS) as (keyof typeof THRESHOLDS)[]).flatMap(
    (subject) =>
      (["NORMAL", "METEOR"] as const).map((kind) => {
        const i = kind === "NORMAL" ? 0 : 1;
        const count = counts[subject][i];
        const threshold = THRESHOLDS[subject][i];
        return {
          subject,
          rewardCategory: kind,
          count,
          threshold,
          hardMinimum: MINIMUMS[subject][i],
          ok: count >= threshold,
          topics:
            count === 0
              ? []
              : (topics[subject] ?? []).map((topicId) => ({
                  topicId,
                  count: 1,
                })),
        };
      }),
  );
}

export const STARTER_AGE_5: BankBand = {
  ageBand: 5,
  eligible: false,
  mode: "STARTER",
  activities: 26,
  campaignFillable: false,
  starterCampaignFillable: false,
  waveSets: [{ waveSetId: "first-contact", fillable: true }],
  groups: groups(
    { maths: [12, 12], phonics: [4, 3], spelling: [10, 10] },
    {
      maths: ["maths-bonds-to10", "maths-count-objects-to10"],
      phonics: ["phonics-initial-sounds"],
      spelling: ["spelling-cvc-build"],
    },
  ),
  subjects: [
    {
      subject: "maths",
      topics: 11,
      topicsWithEnough: 1,
      topicsNeeded: 5,
      ok: false,
    },
    {
      subject: "phonics",
      topics: 3,
      topicsWithEnough: 1,
      topicsNeeded: 5,
      ok: false,
    },
    {
      subject: "spelling",
      topics: 6,
      topicsWithEnough: 3,
      topicsNeeded: 5,
      ok: false,
    },
  ],
  templates: [
    {
      subject: "maths",
      rewardCategory: "NORMAL",
      instances: 0,
      needed: 500,
      ok: false,
    },
    {
      subject: "maths",
      rewardCategory: "METEOR",
      instances: 0,
      needed: 50,
      ok: false,
    },
  ],
  needs: [
    {
      what: "UNITS",
      subject: "maths",
      rewardCategory: "NORMAL",
      have: 12,
      need: 34,
      more: 22,
    },
    {
      what: "UNITS",
      subject: "phonics",
      rewardCategory: "NORMAL",
      have: 4,
      need: 32,
      more: 28,
    },
    {
      what: "UNITS",
      subject: "phonics",
      rewardCategory: "METEOR",
      have: 3,
      need: 4,
      more: 1,
    },
    {
      what: "UNITS",
      subject: "spelling",
      rewardCategory: "NORMAL",
      have: 10,
      need: 32,
      more: 22,
    },
    { what: "TOPICS", subject: "maths", have: 1, need: 5, more: 4 },
    {
      what: "TEMPLATE_INSTANCES",
      subject: "maths",
      rewardCategory: "NORMAL",
      have: 0,
      need: 500,
      more: 500,
    },
  ],
};

export const READY_AGE_6: BankBand = {
  ageBand: 6,
  eligible: true,
  mode: "READY",
  activities: 110,
  campaignFillable: true,
  starterCampaignFillable: true,
  waveSets: [{ waveSetId: "first-contact", fillable: true }],
  groups: groups({ maths: [34, 4], phonics: [32, 4], spelling: [32, 2] }, {}),
  subjects: ["maths", "phonics", "spelling"].map((subject) => ({
    subject,
    topics: 8,
    topicsWithEnough: 6,
    topicsNeeded: 5,
    ok: true,
  })),
  templates: [
    {
      subject: "maths",
      rewardCategory: "NORMAL",
      instances: 600,
      needed: 500,
      ok: true,
    },
    {
      subject: "maths",
      rewardCategory: "METEOR",
      instances: 600,
      needed: 50,
      ok: true,
    },
  ],
  needs: [],
};

export const BLOCKED_AGE_7: BankBand = {
  ...STARTER_AGE_5,
  ageBand: 7,
  mode: "BLOCKED",
  activities: 0,
  waveSets: [{ waveSetId: "first-contact", fillable: false }],
  groups: groups({ maths: [0, 0], phonics: [0, 0], spelling: [0, 0] }, {}),
};

export const BANK: BankStatus = {
  releasedWaveSets: ["first-contact"],
  rules: {
    starterUntilEligible: true,
    subjectFallback: false,
    topicsPerSubject: 5,
    unitsPerTopic: 2,
    campaignSlots: { NORMAL: 49, METEOR: 5 },
  },
  ageBands: [STARTER_AGE_5, READY_AGE_6, BLOCKED_AGE_7],
};
