// @vitest-environment jsdom
// Phase 40 (M3-05): Approve waits for the previewed clip to play to its end and for the one tick, and names the
// previewed clip key; "New speech" makes the ID from the kind and what was typed; the list filters by kind and state.
//
// Try another take ([PROPOSAL] 2026-11-15, ADR-0025): the button saves the same text with the next take as a new draft
// revision, previews that take, and Approve stays off until the saved take of the saved revision has been previewed.
// A fake AdminApi stands in for admin-api and tts; its clip key depends on the body and the take, as the real one does.
import { LIMITS } from "@scd/shared";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ApiError,
  type AdminApi,
  type NewSpeech,
  type Preview,
  type SpeechDraft,
  type SpeechKind,
  type SpeechSummary,
  type SpeechView,
} from "../api";
import { LISTENING_CHECKLIST } from "../review";
import { SpeechPage } from "./SpeechPage";

afterEach(cleanup);

const SSML =
  '<prosody rate="70%"><phoneme alphabet="ipa" ph="ʃ">sh</phoneme></prosody>.';
const clipKeyOf = (body: string, take: number) => `clip-${body.length}-${take}`;

type SaveBody = {
  draftRevision: number;
  text?: string;
  ssml?: string;
  take?: number;
};
type PreviewBody = {
  kind: string;
  speechId: string;
  text?: string;
  ssml?: string;
  take?: number;
};

class FakeAdmin {
  view: SpeechView;
  saves: SaveBody[] = [];
  previews: PreviewBody[] = [];
  approvals: { draftRevision: number; clipKey: string }[] = [];
  creates: NewSpeech[] = [];
  others: SpeechSummary[] = [];
  /** Stored draft text by speechId, for speech in `others` (default: its title). */
  texts = new Map<string, string>();
  failPreview = false;
  /** Holds the speech list back until release() is called. */
  listGate: Promise<void> = Promise.resolve();

  constructor(take = 1) {
    this.view = {
      header: {
        speechId: "phoneme-sh",
        title: "Sound sh",
        kind: "PHONEME",
        state: "DRAFT",
        approvedVersion: null,
        updatedAt: "2026-11-15T10:00:00Z",
      },
      draft: {
        kind: "PHONEME",
        provider: "polly",
        engine: "generative",
        voiceId: "Amy",
        draftRevision: 1,
        take,
        updatedAt: "2026-11-15T10:00:00Z",
        clipKey: clipKeyOf(SSML, take),
        ssml: SSML,
      },
      versions: [],
    };
  }

  api(): AdminApi {
    const unused = () =>
      Promise.reject(new Error("not used by the speech page"));
    const api = {
      listSpeech: () =>
        this.listGate.then(() => ({
          items: [this.view.header, ...this.others],
        })),
      createSpeech: (body: NewSpeech) => {
        this.creates.push(body);
        if (body.speechId === "phoneme-ng") {
          return Promise.reject(
            new ApiError(400, "VALIDATION_FAILED", [
              { field: "speechId", rule: "phoneme_word_only" },
            ]),
          );
        }
        // R18 is idempotent: a speechId that exists is answered with the stored item, and the body sent is dropped.
        const { ssml: _ssml, ...plain } = this.view.draft;
        const textDraft = (kind: SpeechKind, text: string): SpeechDraft => ({
          ...plain,
          kind,
          text,
        });
        const stored = this.others.find(
          (other) => other.speechId === body.speechId,
        );
        if (stored !== undefined) {
          const view: SpeechView = {
            header: stored,
            draft: textDraft(
              stored.kind,
              this.texts.get(stored.speechId) ?? stored.title,
            ),
            versions: [],
          };
          return Promise.resolve(view);
        }
        const header = {
          ...this.view.header,
          speechId: body.speechId,
          title: body.title,
          kind: body.kind,
        };
        this.others.push(header);
        const draft =
          body.text === undefined
            ? { ...this.view.draft, kind: body.kind }
            : textDraft(body.kind, body.text);
        const view: SpeechView = { header, draft, versions: [] };
        return Promise.resolve(view);
      },
      getSpeech: () => Promise.resolve(structuredClone(this.view)),
      saveSpeech: (_id: string, body: SaveBody) => {
        this.saves.push(body);
        if (body.draftRevision !== this.view.draft.draftRevision)
          return Promise.reject(new ApiError(409, "DRAFT_CONFLICT"));
        const take = body.take ?? this.view.draft.take;
        const value = body.ssml ?? body.text ?? "";
        this.view.draft = {
          ...this.view.draft,
          draftRevision: body.draftRevision + 1,
          take,
          clipKey: clipKeyOf(value, take),
        };
        return Promise.resolve(structuredClone(this.view));
      },
      preview: (body: PreviewBody): Promise<Preview> => {
        this.previews.push(body);
        if (this.failPreview)
          return Promise.reject(new ApiError(502, "SPEECH_SYNTHESIS_FAILED"));
        const key = clipKeyOf(body.ssml ?? body.text ?? "", body.take ?? 1);
        return Promise.resolve({
          clipKey: key,
          url: `https://audio.test/${key}.mp3`,
          expiresInSeconds: 300,
        });
      },
      approve: (
        _id: string,
        body: { draftRevision: number; clipKey: string },
      ) => {
        this.approvals.push(body);
        return Promise.resolve({
          versionId: "v1",
          clipKey: this.view.draft.clipKey ?? "",
          sha256: "0".repeat(64),
          renderedAt: "2026-11-16T09:00:00Z",
          take: this.view.draft.take,
        });
      },
      listActivities: unused,
      getActivity: unused,
      saveActivity: unused,
      validate: unused,
      publish: unused,
      deleteActivity: unused,
    };
    return api as unknown as AdminApi;
  }
}

const button = (name: string) =>
  screen.getByRole("button", { name }) as HTMLButtonElement;

async function open(fake: FakeAdmin) {
  render(<SpeechPage api={fake.api()} initial="phoneme-sh" />);
  await screen.findByText(/draft revision/);
}

/** The preview clip plays to its end (jsdom has no audio, so the element's ended event stands in). */
function playToEnd() {
  const clip = screen.getByLabelText("Preview clip");
  fireEvent.ended(clip);
}

/** One tick confirms every listening check (the checks are listed above it as text). */
function tickAll() {
  for (const item of LISTENING_CHECKLIST)
    expect(screen.getByText(item.label)).toBeTruthy();
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "I have listened and the clip passes every check above",
    }),
  );
}

describe("Try another take", () => {
  it("saves the same SSML as the next take, previews that take and shows Take N", async () => {
    const fake = new FakeAdmin();
    await open(fake);

    fireEvent.click(button("Preview"));
    await screen.findByText("Take 1");
    expect(fake.previews).toEqual([
      { kind: "PHONEME", speechId: "phoneme-sh", ssml: SSML, take: 1 },
    ]);

    fireEvent.click(button("Try another take"));
    await screen.findByText("Take 2");
    expect(fake.saves).toEqual([{ draftRevision: 1, ssml: SSML, take: 2 }]);
    expect(fake.previews[1]).toEqual({
      kind: "PHONEME",
      speechId: "phoneme-sh",
      ssml: SSML,
      take: 2,
    });
    expect(screen.getByText(`clip ${clipKeyOf(SSML, 2)}`)).toBeTruthy();
    expect(screen.getByText(/draft revision\s*2 · take 2/)).toBeTruthy();
  });

  it("enables Approve only once the new take was previewed and checked, and approves that revision", async () => {
    const fake = new FakeAdmin();
    await open(fake);
    fireEvent.click(button("Preview"));
    await screen.findByText("Take 1");
    playToEnd();
    tickAll();
    expect(button("Approve").disabled).toBe(false);

    fireEvent.click(button("Try another take"));
    await screen.findByText("Take 2");
    expect(button("Approve").disabled).toBe(true); // the checks were for take 1
    playToEnd();
    tickAll();
    expect(button("Approve").disabled).toBe(false);

    fireEvent.click(button("Approve"));
    await waitFor(() =>
      expect(fake.approvals).toEqual([
        { draftRevision: 2, clipKey: clipKeyOf(SSML, 2) },
      ]),
    );
  });

  it("keeps Approve off when the new take was saved but its preview failed", async () => {
    const fake = new FakeAdmin();
    await open(fake);
    fake.failPreview = true;

    fireEvent.click(button("Try another take"));
    await screen.findByText(
      "The voice service could not make this clip. Try again.",
    );
    expect(fake.view.draft.take).toBe(2);
    expect(screen.queryByText(/^Take \d+$/)).toBeNull();
    expect(button("Approve").disabled).toBe(true);
    expect(
      screen.getByText(/Preview and listen to this version of the draft first/),
    ).toBeTruthy();
  });

  it("is off at the last take allowed by the limits", async () => {
    const fake = new FakeAdmin(LIMITS.speechTake.max);
    await open(fake);
    expect(button("Try another take").disabled).toBe(true);
    expect(screen.getByText(/No takes left/)).toBeTruthy();
    expect(button("Preview").disabled).toBe(false);
  });

  it("is off while the draft has unsaved changes", async () => {
    const fake = new FakeAdmin();
    await open(fake);
    const draft = document.querySelector("textarea");
    if (draft === null) throw new Error("no draft textarea");
    fireEvent.change(draft, { target: { value: "sh." } });
    expect(button("Try another take").disabled).toBe(true);
    expect(fake.saves).toEqual([]);
  });
});

describe("Approve after listening (Phase 40)", () => {
  it("stays off until the previewed clip has played to its end, then sends that clip key", async () => {
    const fake = new FakeAdmin();
    await open(fake);
    fireEvent.click(button("Preview"));
    await screen.findByText("Take 1");
    expect(
      screen
        .getByRole("checkbox", {
          name: "I have listened and the clip passes every check above",
        })
        .matches(":disabled"),
    ).toBe(true);
    expect(button("Approve").disabled).toBe(true);
    expect(screen.getByText(/Play the clip to the end first/)).toBeTruthy();

    playToEnd();
    expect(screen.getByText(/· played/)).toBeTruthy();
    tickAll();
    fireEvent.click(button("Approve"));
    await waitFor(() =>
      expect(fake.approvals).toEqual([
        { draftRevision: 1, clipKey: clipKeyOf(SSML, 1) },
      ]),
    );
    await screen.findByText(
      "Approved as version v1 (rendered 2026-11-16T09:00:00Z).",
    );
  });
});

describe("New speech (Phase 40)", () => {
  const field = (label: string) =>
    screen.getByLabelText(label) as HTMLInputElement;

  it("makes the ID from the kind and the word, and sends no body for a word the ID spells", async () => {
    const fake = new FakeAdmin();
    await open(fake);
    fireEvent.change(field("Word"), { target: { value: "Ship" } });
    expect(screen.getByText("word-ship")).toBeTruthy();
    fireEvent.change(field("Word"), { target: { value: "ship" } });
    fireEvent.click(button("Create"));
    await waitFor(() =>
      expect(fake.creates).toEqual([
        { speechId: "word-ship", title: "Word ship", kind: "WORD" },
      ]),
    );
  });

  it("opens a sound that exists already instead of making a copy", async () => {
    const fake = new FakeAdmin();
    await open(fake);
    fireEvent.change(
      screen.getByLabelText("Kind", { selector: "form.new select" }),
      { target: { value: "PHONEME" } },
    );
    fireEvent.change(field("Sound (its letters)"), { target: { value: "SH" } });
    expect(screen.getByText(/exists already/)).toBeTruthy();
    fireEvent.click(button("Open"));
    await screen.findByText("phoneme-sh exists already, so it is opened here.");
    expect(fake.creates).toEqual([]);
  });

  it("numbers a sentence whose first words are taken, and sends the sentence", async () => {
    const fake = new FakeAdmin();
    fake.others = [
      {
        ...fake.view.header,
        speechId: "instruction-tap-the-star",
        kind: "INSTRUCTION",
        title: "Tap the star.",
      },
    ];
    await open(fake);
    fireEvent.change(
      screen.getByLabelText("Kind", { selector: "form.new select" }),
      { target: { value: "INSTRUCTION" } },
    );
    await screen.findByText("instruction-tap-the-star");
    fireEvent.change(field("Sentence"), {
      target: { value: "Tap the star again." },
    });
    fireEvent.click(button("Create"));
    await waitFor(() =>
      expect(fake.creates).toEqual([
        {
          speechId: "instruction-tap-the-star-again",
          title: "Tap the star again.",
          kind: "INSTRUCTION",
          text: "Tap the star again.",
        },
      ]),
    );
  });

  it("opens a sentence that exists already instead of making a numbered copy", async () => {
    const fake = new FakeAdmin();
    const said = "Listen. Which word is this?";
    fake.others = [
      {
        ...fake.view.header,
        speechId: "instruction-listen-which-word-is-this",
        kind: "INSTRUCTION",
        title: said,
      },
    ];
    await open(fake);
    await screen.findByText("Showing 2 of 2.");
    fireEvent.change(
      screen.getByLabelText("Kind", { selector: "form.new select" }),
      { target: { value: "INSTRUCTION" } },
    );
    fireEvent.change(field("Sentence"), { target: { value: said } });
    fireEvent.click(button("Open"));
    await screen.findByText(
      "instruction-listen-which-word-is-this exists already, so it is opened here.",
    );
    expect(fake.creates).toEqual([]);
  });

  it("keeps Create off until the speech list has loaded", async () => {
    const fake = new FakeAdmin();
    let release = () => {};
    fake.listGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    render(<SpeechPage api={fake.api()} initial={null} />);
    fireEvent.change(field("Word"), { target: { value: "ship" } });
    expect(button("Create").disabled).toBe(true);
    expect(
      screen.getByText("Create waits for the speech list to load."),
    ).toBeTruthy();
    release();
    await waitFor(() => expect(button("Create").disabled).toBe(false));
  });

  it("never says Created when the ID was taken by another sentence", async () => {
    const fake = new FakeAdmin();
    // The list missed it (another tab made it after the list loaded): the server answers with the stored sentence.
    const late: SpeechSummary = {
      ...fake.view.header,
      speechId: "instruction-tap-the-star-to-start",
      kind: "INSTRUCTION",
      title: "Tap the star to start again.",
    };
    await open(fake);
    await screen.findByText("Showing 1 of 1.");
    fake.others = [late];
    fireEvent.change(
      screen.getByLabelText("Kind", { selector: "form.new select" }),
      { target: { value: "INSTRUCTION" } },
    );
    fireEvent.change(field("Sentence"), {
      target: { value: "Tap the star to start the game." },
    });
    fireEvent.click(button("Create"));
    await screen.findByText(
      "instruction-tap-the-star-to-start exists already, so it is opened here.",
    );
    expect(screen.queryByText(/^Created/)).toBeNull();
  });

  it("says why a word-only sound is refused", async () => {
    const fake = new FakeAdmin();
    await open(fake);
    fireEvent.change(
      screen.getByLabelText("Kind", { selector: "form.new select" }),
      { target: { value: "PHONEME" } },
    );
    fireEvent.change(field("Sound (its letters)"), { target: { value: "ng" } });
    fireEvent.click(button("Create"));
    await screen.findByText(/taught only inside words/);
  });
});

describe("Speech list (Phase 40)", () => {
  it("filters by kind, state and search", async () => {
    const fake = new FakeAdmin();
    fake.others = [
      {
        ...fake.view.header,
        speechId: "word-ship",
        kind: "WORD",
        title: "Word ship",
        state: "APPROVED",
        approvedVersion: "v1",
      },
      {
        ...fake.view.header,
        speechId: "word-shop",
        kind: "WORD",
        title: "Word shop",
      },
    ];
    await open(fake);
    await screen.findByText("Showing 3 of 3.");
    fireEvent.change(
      screen.getByLabelText("Kind", { selector: "form.filters select" }),
      { target: { value: "WORD" } },
    );
    expect(screen.getByText("Showing 2 of 3.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("State"), {
      target: { value: "APPROVED" },
    });
    expect(screen.getByText("Showing 1 of 3.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("State"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "shop" },
    });
    expect(screen.getByText("Showing 1 of 3.")).toBeTruthy();
  });
});
