// What a new activity's identity is filled in from: the next free ID, and the topic's subject, ages and title.
import { TOPICS, topicById, type Topic } from "@scd/shared";
import { describe, expect, it } from "vitest";
import { agesText, defaultAges, nextActivityId, oldestChoices, topicGroups, topicLabel, topicSuits } from "./identity";

const topic = (topicId: string): Topic => {
  const found = topicById(topicId);
  if (found === undefined) throw new Error(`no topic ${topicId}`);
  return found;
};

describe("the next activity ID", () => {
  it("is one more than the subject's highest four-digit number, from 0001, counting every state", () => {
    expect(nextActivityId("maths", [])).toBe("ma-0001");
    expect(nextActivityId("maths", ["ma-0001", "ma-0007", "ph-0040", "ma-0003"])).toBe("ma-0008");
    expect(nextActivityId("phonics", ["ma-0001", "ph-0040"])).toBe("ph-0041");
    expect(nextActivityId("spelling", ["sp-9109"])).toBe("sp-9110");
  });

  it("ignores IDs that do not follow the convention", () => {
    expect(nextActivityId("maths", ["ma-12", "ma-0002-old", "maths-0009", "ma-abcd"])).toBe("ma-0001");
  });
});

describe("topics", () => {
  it("label a topic with its ages", () => {
    expect(topicLabel(topic("maths-count-objects-to10"))).toBe("Count objects to 10 — Reception");
    expect(topicLabel(topic("phonics-gpc-consonant-digraphs"))).toBe("GPC consonant digraphs — Reception–Year 1");
    expect(agesText([6, 7])).toBe("Year 1–Year 2");
  });

  it("start at the topic's youngest age and span at most two ages", () => {
    expect(defaultAges(topic("maths-count-objects-to10"))).toEqual({ minAge: 5, maxAge: 5 });
    expect(defaultAges(topic("phonics-alt-pronunciation"))).toEqual({ minAge: 6, maxAge: 7 });
    const wide: Topic = { ...topic("maths-count-objects-to10"), ages: [5, 6, 7] };
    expect(defaultAges(wide)).toEqual({ minAge: 5, maxAge: 6 });
    expect(oldestChoices(wide, 6)).toEqual([6, 7]);
    expect(oldestChoices(wide, 5)).toEqual([5, 6]);
  });

  it("group by subject, with the topics that suit the type first, and filter by name", () => {
    const groups = topicGroups("LETTERS");
    expect(groups.map((g) => g.label)).toEqual(["Maths", "Phonics", "Spelling", "Grammar and punctuation"]);
    expect(groups.flatMap((g) => g.topics)).toHaveLength(TOPICS.length);
    for (const group of groups) {
      const suits = group.topics.map((t) => topicSuits(t, "LETTERS"));
      expect(suits).toEqual([...suits].sort((a, b) => Number(b) - Number(a)));
    }
    const found = topicGroups("MULTIPLE_CHOICE", "consonant digraphs");
    expect(found.flatMap((g) => g.topics.map((t) => t.topicId))).toEqual(["phonics-gpc-consonant-digraphs"]);
    expect(topicGroups("MULTIPLE_CHOICE", "no such topic at all", "maths-share-equal-groups").flatMap((g) => g.topics.map((t) => t.topicId))).toEqual([
      "maths-share-equal-groups",
    ]);
    expect(topicGroups("NUMERIC", "", "", ["spelling"]).map((g) => g.subject)).toEqual(["spelling"]);
  });
});
