// @vitest-environment jsdom
// Try another take ([PROPOSAL] 2026-11-15, ADR-0025): the button saves the same text with the next take as a new draft
// revision, previews that take, and Approve stays off until the saved take of the saved revision has been previewed.
// A fake AdminApi stands in for admin-api and tts; its clip key depends on the body and the take, as the real one does.
import { LIMITS } from "@scd/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApiError, type AdminApi, type Preview, type SpeechView } from "../api";
import { LISTENING_CHECKLIST } from "../review";
import { SpeechPage } from "./SpeechPage";

afterEach(cleanup);

const SSML = '<prosody rate="70%"><phoneme alphabet="ipa" ph="ʃ">sh</phoneme></prosody>.';
const clipKeyOf = (body: string, take: number) => `clip-${body.length}-${take}`;

type SaveBody = { draftRevision: number; text?: string; ssml?: string; take?: number };
type PreviewBody = { kind: string; speechId: string; text?: string; ssml?: string; take?: number };

class FakeAdmin {
  view: SpeechView;
  saves: SaveBody[] = [];
  previews: PreviewBody[] = [];
  approvals: { draftRevision: number }[] = [];
  failPreview = false;

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
    const unused = () => Promise.reject(new Error("not used by the speech page"));
    const api = {
      listSpeech: () => Promise.resolve({ items: [this.view.header] }),
      createSpeech: unused,
      getSpeech: () => Promise.resolve(structuredClone(this.view)),
      saveSpeech: (_id: string, body: SaveBody) => {
        this.saves.push(body);
        if (body.draftRevision !== this.view.draft.draftRevision) return Promise.reject(new ApiError(409, "DRAFT_CONFLICT"));
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
        if (this.failPreview) return Promise.reject(new ApiError(502, "SPEECH_SYNTHESIS_FAILED"));
        const key = clipKeyOf(body.ssml ?? body.text ?? "", body.take ?? 1);
        return Promise.resolve({ clipKey: key, url: `https://audio.test/${key}.mp3`, expiresInSeconds: 300 });
      },
      approve: (_id: string, body: { draftRevision: number }) => {
        this.approvals.push(body);
        return Promise.resolve({ versionId: "v1", clipKey: this.view.draft.clipKey ?? "", sha256: "0".repeat(64), take: this.view.draft.take });
      },
      listActivities: unused,
      getActivity: unused,
      saveActivity: unused,
      validate: unused,
      publish: unused,
    };
    return api as unknown as AdminApi;
  }
}

const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

async function open(fake: FakeAdmin) {
  render(<SpeechPage api={fake.api()} initial="phoneme-sh" />);
  await screen.findByText(/draft revision/);
}

function tickAll() {
  for (const item of LISTENING_CHECKLIST) fireEvent.click(screen.getByLabelText(item.label, { exact: false }));
}

describe("Try another take", () => {
  it("saves the same SSML as the next take, previews that take and shows Take N", async () => {
    const fake = new FakeAdmin();
    await open(fake);

    fireEvent.click(button("Preview"));
    await screen.findByText("Take 1");
    expect(fake.previews).toEqual([{ kind: "PHONEME", speechId: "phoneme-sh", ssml: SSML, take: 1 }]);

    fireEvent.click(button("Try another take"));
    await screen.findByText("Take 2");
    expect(fake.saves).toEqual([{ draftRevision: 1, ssml: SSML, take: 2 }]);
    expect(fake.previews[1]).toEqual({ kind: "PHONEME", speechId: "phoneme-sh", ssml: SSML, take: 2 });
    expect(screen.getByText(`clip ${clipKeyOf(SSML, 2)}`)).toBeTruthy();
    expect(screen.getByText(/draft revision\s*2 · take 2/)).toBeTruthy();
  });

  it("enables Approve only once the new take was previewed and checked, and approves that revision", async () => {
    const fake = new FakeAdmin();
    await open(fake);
    fireEvent.click(button("Preview"));
    await screen.findByText("Take 1");
    tickAll();
    expect(button("Approve").disabled).toBe(false);

    fireEvent.click(button("Try another take"));
    await screen.findByText("Take 2");
    expect(button("Approve").disabled).toBe(true); // the checks were for take 1
    tickAll();
    expect(button("Approve").disabled).toBe(false);

    fireEvent.click(button("Approve"));
    await waitFor(() => expect(fake.approvals).toEqual([{ draftRevision: 2 }]));
  });

  it("keeps Approve off when the new take was saved but its preview failed", async () => {
    const fake = new FakeAdmin();
    await open(fake);
    fake.failPreview = true;

    fireEvent.click(button("Try another take"));
    await screen.findByText("The voice service could not make this clip. Try again.");
    expect(fake.view.draft.take).toBe(2);
    expect(screen.queryByText(/^Take \d+$/)).toBeNull();
    expect(button("Approve").disabled).toBe(true);
    expect(screen.getByText(/Preview and listen to this version of the draft first/)).toBeTruthy();
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
