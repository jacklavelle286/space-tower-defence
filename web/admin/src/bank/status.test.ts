// The bank-status wording (Phase 42): every number comes from R30; these functions only put it in plain words.
import { describe, expect, it } from "vitest";
import {
  BANK,
  BLOCKED_AGE_7 as seven,
  READY_AGE_6 as six,
  STARTER_AGE_5 as five,
} from "../testing/bank";
import {
  campaignNote,
  emptyTopics,
  modeSentence,
  needSentence,
  plural,
  topicNames,
} from "./status";

describe("bank status words", () => {
  it("says what a new game does for each mode", () => {
    expect(modeSentence(five)).toMatch(
      /^Not ready yet, but new games still start/u,
    );
    expect(modeSentence(six)).toBe(
      "Ready. New games use the full selection rules.",
    );
    expect(modeSentence(seven)).toBe(
      "Blocked: nothing is published for age 7, so new games cannot start.",
    );
    expect(modeSentence({ ...five, mode: "BLOCKED" })).toMatch(
      /below its thresholds/u,
    );
    const meteorless = {
      ...five,
      mode: "BLOCKED" as const,
      waveSets: [{ waveSetId: "long-night", fillable: false }],
    };
    expect(modeSentence(meteorless)).toMatch(
      /^Blocked: there are not enough activities for every slot of long-night \(a meteor slot/u,
    );
  });

  it("words every kind of need, with Both counting for either slot", () => {
    const sentences = five.needs.map((need) => needSentence(need, 2));
    expect(sentences[0]).toBe(
      "22 more maths activities for normal slots (Normal or Both): 12 of 34.",
    );
    expect(sentences[2]).toBe(
      "1 more phonics activity for meteor slots (Meteor or Both): 3 of 4.",
    );
    expect(sentences[4]).toBe(
      "Maths: 4 more topics with at least 2 activities each (1 of 5 now).",
    );
    expect(sentences[5]).toMatch(
      /^Maths templates offering 500 more questions for normal slots/u,
    );
    expect(needSentence({ what: "CAMPAIGN" }, 2)).toMatch(
      /cannot be filled yet/u,
    );
  });

  it("notes the full campaign only when it cannot be filled", () => {
    expect(campaignNote(five, BANK.rules.campaignSlots)).toBe(
      "A full campaign needs 54 different activities (49 normal and 5 meteor slots); this age has 26.",
    );
    expect(campaignNote(six, BANK.rules.campaignSlots)).toBeNull();
  });

  it("suggests registry topics for the age that have nothing yet", () => {
    const empty = emptyTopics(five, "maths");
    expect(empty.length).toBeGreaterThan(0);
    expect(
      empty.every((t) => t.subject === "maths" && t.ages.includes(5)),
    ).toBe(true);
    expect(empty.map((t) => t.topicId)).not.toContain("maths-bonds-to10"); // already covered
    expect(topicNames(empty, 2)).toMatch(
      new RegExp(`and ${empty.length - 2} more$`, "u"),
    );
    expect(plural(1, "topic")).toBe("1 topic");
  });
});
