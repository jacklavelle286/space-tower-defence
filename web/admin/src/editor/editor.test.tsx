// @vitest-environment jsdom
// Phase 39 exit criterion, one test per editor kind: New activity -> fill the type's fields -> Save -> Validate ->
// preview-solve in the child's own panel -> tick the review -> Publish, against a fake API. The saved draft must equal
// the shared draft for that kind (contracts/fixtures/activities/editor-drafts.json), which admin-api's own validation
// accepts (api/tests/unit/test_activity_fixtures.py): so what this editor writes is what the server checks.
import { PANEL_COPY } from "@scd/shared/learning";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Definition } from "../api";
import { PUBLISH_CHECKLIST } from "../review";
import { draftOf, DRAFTS } from "../testing/drafts";
import { FakeAdminApi } from "../testing/fakeApi";
import { ActivityEditor } from "./ActivityEditor";
import { NewActivityPage } from "./NewActivity";
import { kindOf } from "./model";

let fake: FakeAdminApi;
const played: string[] = [];
const play = async (url: string) => {
  played.push(url);
};

beforeEach(() => {
  fake = new FakeAdminApi();
  played.length = 0;
  window.sessionStorage.clear();
});
afterEach(cleanup);

// --- Helpers -------------------------------------------------------------------------------------------------------

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement | HTMLSelectElement;
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const tick = (name: string | RegExp) => fireEvent.click(screen.getByRole("checkbox", { name }));
const choose = (name: string | RegExp) => fireEvent.click(screen.getByRole("radio", { name }));

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function createFor(definition: Definition) {
  const navigate = vi.fn();
  render(<NewActivityPage api={fake.api} navigate={navigate} />);
  type("Subject", definition.subject);
  type("Activity ID", definition.activityId);
  type("Title (for the admin list)", definition.title);
  type("Topic", definition.topicId);
  const kind = kindOf(definition.interactionType, definition.activityPayload) ?? "MULTIPLE_CHOICE";
  type("Interaction type", kind);
  type("Reward", definition.rewardCategory);
  type("Youngest age", String(definition.minAge));
  type("Oldest age", String(definition.maxAge));
  await act(async () => click("Create draft"));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith(`#activities/${definition.activityId}`));
  cleanup();
}

async function openEditor(activityId: string) {
  render(<ActivityEditor api={fake.api} activityId={activityId} play={play} />);
  await screen.findByRole("button", { name: "Save draft" });
  await settle();
}

/** The fields every activity has, from the shared draft. */
function fillCommon(definition: Definition) {
  type("Curriculum codes (1 to 4)", (definition.curriculumReference as string[]).join(", "));
  type("Audio", definition.audioRequirement ?? "NONE");
  type("Question", definition.prompt?.text ?? "");
  Object.entries(definition.speechDefinitionReferences ?? {}).forEach(([variant, ref], i) => {
    click("Add a clip");
    type(`Clip ${i + 1} plays as`, variant);
    type(`Clip ${i + 1} speech`, ref.speechId);
  });
}

/** Each kind's own fields, filled as an operator would, to give exactly the shared draft. */
const FILL: Record<string, () => void> = {
  MULTIPLE_CHOICE: () => {
    type("Option style", "GRAPHEME");
    ["s", "sh", "ch", "th"].forEach((text, i) => type(`Option ${"abcd"[i]} text`, text));
    choose("Option b is right");
  },
  PICTURE_SELECT: () => {
    const cards = [
      ["pic-night-sky", "a night sky"],
      ["pic-knight", "a knight"],
      ["pic-kite", "a kite"],
      ["pic-knot", "a knot"],
    ];
    cards.forEach(([assetId, alt], i) => {
      type(`Option ${"abcd"[i]} picture`, assetId ?? "");
      type(`Option ${"abcd"[i]} alt text`, alt ?? "");
    });
    choose("Option b is right");
  },
  NUMBER_SELECT: () => {
    type("Right number", "5");
    tick("Show a picture with the question");
    type("Question picture", "dice-5");
    type("Question picture alt text", "a dice with five dots");
  },
  DISTRIBUTE: () => {
    type("Zone 1 label", "Nova");
    type("Zone 2 label", "Pip");
    type("Zone 1 right count", "3");
    type("Zone 2 right count", "3");
  },
  SORT: () => {
    type("Group 1 label", "like tree");
    type("Group 2 label", "like bed");
    ["sea", "head", "dream", "bread"].forEach((word, i) => {
      type(`Object ${i + 1} word`, word);
      type(`Object ${i + 1} right group`, i % 2 === 0 ? "b1" : "b2");
    });
  },
  LETTERS: () => {
    click("Add a tile");
    click("Add a tile");
    ["t", "a", "c", "o", "n"].forEach((value, i) => type(`Tile ${i + 1} value`, value));
    tick(/^Show a cue/);
    type("Cue picture", "pic-cat");
    type("Cue picture alt text", "a cat");
    type("Right word 1", "cat");
  },
  SEQUENCE: () => {
    click("Add a tile");
    ["38", "83", "30", "80"].forEach((value, i) => type(`Tile ${i + 1} value`, value));
    type("Order label", "smallest first");
    ["t3", "t1", "t4", "t2"].forEach((id, i) => type(`Position ${i + 1}`, id));
  },
  NUMERIC: () => {
    type("Right number", "7");
  },
  WORD: () => {
    tick(/^Show a cue/);
    type("Cue text", "hop + ing");
    type("Right word 1", "hopping");
  },
  TWO_STEP: () => {
    type("Option style", "NUMERAL");
    ["12", "18", "25", "32"].forEach((text, i) => type(`Option ${"abcd"[i]} text`, text));
    choose("Option c is right");
    click("Add a second part");
    type("First part's question", "Which number is in the 5 times table?");
    type("Part 2 question", "5 × 6 = ?");
    type("Part 2 Right number", "30");
  },
};

const stage = () => within(document.querySelector(".preview-stage") as HTMLElement);
const panelButton = (name: string | RegExp) => fireEvent.click(stage().getByRole("button", { name }));

/** Each kind solved in the child's panel, mouse only (the shared panel's own tests cover the keyboard). */
const SOLVE: Record<string, () => void> = {
  MULTIPLE_CHOICE: () => {
    panelButton(PANEL_COPY.play);
    fireEvent.click(stage().getByRole("radio", { name: /^2: sh/ }));
  },
  PICTURE_SELECT: () => fireEvent.click(stage().getByRole("radio", { name: /^2: a knight/ })),
  NUMBER_SELECT: () => fireEvent.click(stage().getByRole("radio", { name: /^5$/ })),
  DISTRIBUTE: () => {
    for (let i = 0; i < 3; i += 1) panelButton(/^Nova/);
    for (let i = 0; i < 3; i += 1) panelButton(/^Pip/);
  },
  SORT: () => {
    for (const [word, bin] of [
      ["sea", "like tree"],
      ["head", "like bed"],
      ["dream", "like tree"],
      ["bread", "like bed"],
    ] as const) {
      panelButton(new RegExp(`^${word}, `));
      panelButton(PANEL_COPY.binDrop(bin));
    }
  },
  LETTERS: () => ["c", "a", "t"].forEach((t) => fireEvent.click(within(stage().getByRole("group", { name: PANEL_COPY.tilesLabel })).getByRole("button", { name: t }))),
  SEQUENCE: () => ["30", "38", "80", "83"].forEach((t) => fireEvent.click(within(stage().getByRole("group", { name: PANEL_COPY.tilesLabel })).getByRole("button", { name: t }))),
  NUMERIC: () => fireEvent.change(stage().getByRole("textbox"), { target: { value: "7" } }),
  WORD: () => fireEvent.change(stage().getByRole("textbox"), { target: { value: "hopping" } }),
  TWO_STEP: () => {
    fireEvent.click(stage().getByRole("radio", { name: /^3: 25/ }));
    fireEvent.change(stage().getByRole("textbox", { name: "5 × 6 = ?" }), { target: { value: "30" } });
  },
};

async function checkInPanel() {
  await act(async () => panelButton(PANEL_COPY.check));
  await settle();
}

// --- One activity of each type, end to end --------------------------------------------------------------------------

describe("create -> validate -> preview-solve -> publish, for each type", () => {
  for (const draft of DRAFTS) {
    it(draft.kind, async () => {
      const definition = draft.definition;
      await createFor(definition);
      await openEditor(definition.activityId);

      fillCommon(definition);
      FILL[draft.kind]?.();
      expect(screen.getByText("Unsaved changes.")).toBeTruthy();
      await act(async () => click("Save draft"));
      await screen.findByText(/^Saved as revision 2/u);

      // What the editor saved is exactly the shared draft admin-api accepts.
      const saved = fake.callsNamed("saveActivity").at(-1)?.args[1] as { definition: Definition };
      expect(saved.definition).toEqual(definition);

      // Publish waits for validate and preview-solve on this revision, then the checklist.
      const publish = screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement;
      expect(publish.disabled).toBe(true);
      expect(screen.getByText("Validate this revision without problems first.")).toBeTruthy();
      await act(async () => click("Validate"));
      await screen.findByText("Valid (revision 2).");
      expect(screen.getByText("Solve the preview of this revision first.")).toBeTruthy();

      SOLVE[draft.kind]?.();
      await checkInPanel();
      expect(stage().getByText(PANEL_COPY.correct)).toBeTruthy();
      expect(screen.getByText("Tick every review line.")).toBeTruthy();
      for (const item of PUBLISH_CHECKLIST) tick(item.label);
      expect(publish.disabled).toBe(false);
      await act(async () => click("Publish"));
      await screen.findByText(/^Published as v1/u);

      const body = fake.callsNamed("publish").at(-1)?.args[1] as { draftRevision: number; review: { previewSolvedDraftRevision: number; checklist: Record<string, boolean> } };
      expect(body.draftRevision).toBe(2);
      expect(body.review.previewSolvedDraftRevision).toBe(2);
      expect(Object.values(body.review.checklist).filter(Boolean)).toHaveLength(PUBLISH_CHECKLIST.length);
      if (draft.kind === "MULTIPLE_CHOICE") expect(played).toEqual(["https://clips.example/phoneme-sh.mp3"]);
    });
  }
});

// --- The editor's rules -----------------------------------------------------------------------------------------------

describe("the editor", () => {
  it("a wrong answer in the preview does not unlock Publish, and an edit clears the solve", async () => {
    fake.seed(draftOf("NUMERIC").definition, 4);
    await openEditor("ma-9108");
    await act(async () => click("Validate"));
    await screen.findByText("Valid (revision 4).");
    fireEvent.change(stage().getByRole("textbox"), { target: { value: "8" } });
    await checkInPanel();
    expect(stage().getByText(PANEL_COPY.notQuite)).toBeTruthy();
    expect(screen.getByText("Solve the preview of this revision first.")).toBeTruthy();
    fireEvent.change(stage().getByRole("textbox"), { target: { value: "7" } });
    await checkInPanel();
    expect(screen.getByText("Tick every review line.")).toBeTruthy();

    type("Question", "What is one more than 5?");
    type("Right number", "6");
    expect(screen.getByText("Save the draft to preview it.")).toBeTruthy();
    await act(async () => click("Save draft"));
    await screen.findByText(/^Saved as revision 5/u);
    expect(screen.getByText("Validate this revision without problems first.")).toBeTruthy();
    expect(screen.getByText(/Preview solved: not yet/u)).toBeTruthy();
  });

  it("shows validation problems in words, and each moves the cursor to its field", async () => {
    fake.seed(draftOf("MULTIPLE_CHOICE").definition, 1);
    fake.problems = [
      { field: "activityPayload.options.2.text", rule: "length" },
      { field: "speechDefinitionReferences.prompt", rule: "speech_not_approved" },
    ];
    await openEditor("ph-9101");
    await act(async () => click("Validate"));
    await screen.findByText("2 problem(s) on revision 1:");
    click("Option c text is empty or too long.");
    expect(document.activeElement).toBe(field("Option c text"));
    click('Clip "prompt" points at a speech clip that is not approved yet.');
    expect(document.activeElement).toBe(field("Clip 1 speech"));
  });

  it("keeps a choice activity at four to six options", async () => {
    fake.seed(draftOf("MULTIPLE_CHOICE").definition, 1);
    await openEditor("ph-9101");
    expect(screen.queryByRole("button", { name: /^Remove [a-f]$/u })).toBeNull();
    click("Add an option");
    click("Add an option");
    expect(screen.queryByRole("button", { name: "Add an option" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Remove [a-f]$/u })).toHaveLength(6);
  });

  it("offers only approved speech, by name", async () => {
    fake.seed(draftOf("SORT").definition, 1);
    await openEditor("ph-9105");
    const options = within(field("Clip 1 speech")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Choose a clip…", "sh sound · phoneme", "Sort by sound · instruction"]);
    expect(within(field("Clip 1 plays as")).getAllByRole("option").map((o) => o.textContent)).toContain("bin-b2");
  });

  it("locks the identity fields after the first publish", async () => {
    fake.seed(draftOf("WORD").definition, 3, "20261115T100000Z");
    await openEditor("sp-9109");
    expect((field("Subject") as HTMLSelectElement).disabled).toBe(true);
    expect((field("Topic") as HTMLInputElement).disabled).toBe(true);
    expect((field("Reward") as HTMLSelectElement).disabled).toBe(true);
    expect(within(field("Interaction type")).getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual(["NUMERIC", "WORD"]);
  });

  it("keeps unsaved changes when the operator leaves and comes back", async () => {
    fake.seed(draftOf("SEQUENCE").definition, 2);
    await openEditor("ma-9107");
    type("Order label", "biggest first");
    expect(screen.getByText("Unsaved changes.")).toBeTruthy();
    cleanup(); // navigated away (another page, Back, a refresh)
    await openEditor("ma-9107");
    expect((field("Order label") as HTMLInputElement).value).toBe("biggest first");
    expect(screen.getByText(/Your unsaved changes from earlier are back/u)).toBeTruthy();
    click("Discard them");
    expect((field("Order label") as HTMLInputElement).value).toBe("smallest first");
    cleanup();
    await openEditor("ma-9107");
    expect(screen.queryByText(/Your unsaved changes from earlier are back/u)).toBeNull();
  });

  it("does not restore edits made on an older revision", async () => {
    fake.seed(draftOf("SEQUENCE").definition, 2);
    await openEditor("ma-9107");
    type("Order label", "biggest first");
    cleanup();
    const stored = fake.activities.get("ma-9107");
    if (stored !== undefined) stored.draftRevision = 3; // someone else saved in between
    await openEditor("ma-9107");
    expect((field("Order label") as HTMLInputElement).value).toBe("smallest first");
  });

  it("a stale save is refused by the server, and says so", async () => {
    fake.seed(draftOf("NUMERIC").definition, 1);
    await openEditor("ma-9108");
    const stored = fake.activities.get("ma-9108");
    if (stored !== undefined) stored.draftRevision = 2;
    type("Right number", "8");
    await act(async () => click("Save draft"));
    await screen.findByText(/Someone saved this draft after you opened it/u);
  });

  it("New activity does not overwrite an existing ID", async () => {
    fake.seed(draftOf("NUMERIC").definition, 1);
    const navigate = vi.fn();
    render(<NewActivityPage api={fake.api} navigate={navigate} />);
    type("Activity ID", "ma-9108");
    type("Title (for the admin list)", "Something else");
    type("Topic", "maths-number-one-more-less-to10");
    await act(async () => click("Create draft"));
    await screen.findByText(/ma-9108 already exists/u);
    expect(navigate).not.toHaveBeenCalled();
    expect(fake.callsNamed("saveActivity")).toHaveLength(0);
  });
});
