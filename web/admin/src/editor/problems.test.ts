// Validation problems in words, and the field each one points at.
import { describe, expect, it } from "vitest";
import { describeProblem, fieldId, fieldLabel, focusTarget } from "./problems";

describe("problems", () => {
  it("names the field the way the editor labels it", () => {
    expect(fieldLabel("activityPayload.options.2.text")).toBe("Option c text");
    expect(fieldLabel("activityPayload.zones.0.label")).toBe("Zone 1 label");
    expect(fieldLabel("activityPayload.stimulus.alt")).toBe("Question picture alt text");
    expect(fieldLabel("additionalSteps.0.activityPayload.maxLength")).toBe("Part 2: Longest answer");
    expect(fieldLabel("answerSpecification.accepted.0")).toBe("Right answer 1");
    expect(fieldLabel("additionalSteps.0.answerSpecification.accepted.1")).toBe("Part 2: Right answer 2");
    expect(fieldLabel("speechDefinitionReferences.option-b")).toBe('Clip "option-b"');
    expect(fieldLabel("prompt.text")).toBe("Question");
  });

  it("says what the rule means, never a value", () => {
    expect(describeProblem({ field: "topicId", rule: "topic_subject" })).toBe("Topic must start with the subject, for example maths-.");
    expect(describeProblem({ field: "activityPayload.tiles", rule: "count" })).toBe("Tiles has the wrong number of entries.");
    expect(describeProblem({ field: "title", rule: "some_new_rule" })).toBe('Title breaks the rule "some_new_rule".');
  });

  it("focuses the field, or the nearest enclosing one on the page", () => {
    const ids = new Set([fieldId("activityPayload.options"), fieldId("title")]);
    expect(focusTarget("activityPayload.options.3.text", (id) => ids.has(id))).toBe("f-activityPayload-options");
    expect(focusTarget("title", (id) => ids.has(id))).toBe("f-title");
    expect(focusTarget("nowhere.at.all", (id) => ids.has(id))).toBeNull();
  });
});
