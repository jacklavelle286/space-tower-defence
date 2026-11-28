// @vitest-environment jsdom
// Draft questions with AI (YG3) against a fake AdminApi: R63 with a client job ID, R64 polled until the drafts are
// ready, each draft shown with its answer, "Save as a draft" through R23 and R25 with the subject's next free ID,
// Discard, rejected drafts with their problems, and a failed job in plain words.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Definition } from "../api";
import { FakeAdminApi } from "../testing/fakeApi";
import { DraftPage, topicsFor } from "./DraftPage";

const JOB = "00000000-0000-4000-8000-000000000001";

function draft(n: number): Definition {
  return {
    schemaVersion: 1,
    activityId: `draft-${n}`,
    title: `8 × ${n + 5}`,
    subject: "maths",
    topicId: "maths-times-tables-3-4-8",
    minAge: 8,
    maxAge: 8,
    rewardCategory: "BOTH",
    interactionType: "MULTIPLE_CHOICE",
    authoringMode: "FIXED",
    audioRequirement: "NONE",
    prompt: { text: `What is 8 × ${n + 5}?` },
    visualAssetReferences: [],
    activityPayload: { optionStyle: "NUMERAL", options: [{ id: "a", text: "48" }, { id: "b", text: "56" }, { id: "c", text: "63" }, { id: "d", text: "54" }] },
    answerSpecification: { accepted: ["b"] },
    speechDefinitionReferences: {},
  };
}

let fake: FakeAdminApi;
beforeEach(() => {
  fake = new FakeAdminApi();
});
afterEach(cleanup);

async function openAndStart() {
  render(<DraftPage api={fake.api} newJobId={() => JOB} pollMs={1} />);
  await waitFor(() => expect(fake.callsNamed("listActivities").length).toBe(1));
  fireEvent.change(screen.getByLabelText("School year"), { target: { value: "8" } });
  fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "maths-times-tables-3-4-8" } });
  fireEvent.change(screen.getByLabelText("How many"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText(/Notes for the AI/), { target: { value: "space theme" } });
  fireEvent.click(screen.getByRole("button", { name: "Draft 2 questions" }));
}

describe("Draft questions with AI (YG3)", () => {
  it("offers only the years and topics the registry has, by subject", () => {
    expect(topicsFor(8).every((t) => t.ages.includes(8))).toBe(true);
    expect(new Set(topicsFor(8).map((t) => t.subject))).toEqual(new Set(["maths", "grammar", "spelling"]));
    render(<DraftPage api={fake.api} />);
    const years = within(screen.getByLabelText("School year")).getAllByRole("option").map((o) => o.textContent);
    expect(years).toEqual(["Reception", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6"]);
    expect((screen.getByRole("button", { name: /^Draft 3 questions/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("starts a job, follows it, and saves a draft as the subject's next activity", async () => {
    fake.nextDraftScripts.push([{ state: "DRAFTING", elapsedSeconds: 12 }, { state: "READY", drafts: [draft(1), draft(2)], rejected: [{ index: 2, title: "bad", problems: ["prompt.text:length"] }] }]);
    await openAndStart();
    expect(fake.callsNamed("startDraftJob").map((c) => c.args[0])).toEqual([
      { jobId: JOB, topicId: "maths-times-tables-3-4-8", band: 8, interactionType: "MULTIPLE_CHOICE", count: 2, notes: "space theme" },
    ]);
    expect(await screen.findByText("What is 8 × 6?")).toBeTruthy();
    expect(screen.getAllByText(/✓ correct/u)).toHaveLength(2);
    expect(screen.getByText(/1 draft did not pass the checks/u)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Save as a draft" })[0]!);
    expect(await screen.findByText(/Saved as/u)).toBeTruthy();
    const [created] = fake.callsNamed("createActivity").map((c) => c.args[0] as { activityId: string; minAge: number });
    expect(created?.activityId).toMatch(/^ma-\d{4}$/u);
    expect(created?.minAge).toBe(8);
    const [save] = fake.callsNamed("saveActivity");
    if (save === undefined) throw new Error("saveActivity was not called");
    expect(save.args[0]).toBe(created?.activityId);
    expect((save.args[1] as { definition: Definition }).definition.activityId).toBe(created?.activityId);
    await waitFor(() => expect(screen.getByRole("link", { name: created?.activityId ?? "" })).toBeTruthy());
    // The second gets the next number after the first.
    fireEvent.click(screen.getByRole("button", { name: "Save as a draft" }));
    await waitFor(() => expect(fake.callsNamed("createActivity")).toHaveLength(2));
    const ids = fake.callsNamed("createActivity").map((c) => (c.args[0] as { activityId: string }).activityId);
    expect(Number(ids[1]!.slice(3))).toBe(Number(ids[0]!.slice(3)) + 1);
  });

  it("Discard takes a draft off the page without saving it", async () => {
    fake.nextDraftScripts.push([{ state: "READY", drafts: [draft(1)], rejected: [] }]);
    await openAndStart();
    await screen.findByText("What is 8 × 6?");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByText("What is 8 × 6?")).toBeNull();
    expect(fake.callsNamed("createActivity")).toHaveLength(0);
  });

  it("a failed job says so in plain words", async () => {
    fake.nextDraftScripts.push([{ state: "FAILED", error: "not_set_up", message: "The OpenAI key is not set up." }]);
    await openAndStart();
    expect((await screen.findByRole("alert")).textContent).toContain("not_set_up");
  });
});
