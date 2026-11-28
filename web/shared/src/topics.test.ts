// The topic registry as the apps see it: the same entries as contracts/topics.json (plan C19).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOPICS, TOPICS_VERSION, topicById } from "./index";

const FILE = join(import.meta.dirname, "..", "..", "..", "contracts", "topics.json");

describe("TOPICS", () => {
  it("equals contracts/topics.json", () => {
    const doc = JSON.parse(readFileSync(FILE, "utf8")) as { version: number; topics: unknown[] };
    expect(TOPICS_VERSION).toBe(doc.version);
    expect(TOPICS).toEqual(doc.topics);
    expect(TOPICS).toHaveLength(186); // 88 for Reception to Year 2, 98 for Years 3 to 5 (YG2)
  });

  it("has unique IDs that start with their subject", () => {
    expect(new Set(TOPICS.map((t) => t.topicId)).size).toBe(TOPICS.length);
    for (const topic of TOPICS) expect(topic.topicId.startsWith(`${topic.subject}-`)).toBe(true);
  });

  it("looks topics up by ID", () => {
    expect(topicById("maths-bonds-to10")).toMatchObject({ subject: "maths", title: "Bonds to 10", ages: [5, 6] });
    expect(topicById("maths-made-up")).toBeUndefined();
  });
});
