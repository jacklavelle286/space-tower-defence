// @vitest-environment jsdom
// Listening queue (owner's request, 2026-11-16): walks the drafts shown in the list, previews and plays each clip,
// and approves only a clip that played to its end, naming that clip key (the editor's rule, R21). A fake AdminApi
// stands in for admin-api and tts (its clip key depends on the body and the take, as the real one does), and a fake
// play() stands in for audio; the element's ended event stands in for a clip that played to its end.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type AdminApi, type Preview, type SpeechKind, type SpeechView } from "../api";
import { SpeechPage } from "../pages/SpeechPage";

const clipKeyOf = (body: string, take: number) => `clip-${body}-${take}`;

type Body = { draftRevision: number; text?: string; ssml?: string; take?: number };

function speech(speechId: string, kind: SpeechKind, text: string, state: "DRAFT" | "APPROVED" = "DRAFT"): SpeechView {
  return {
    header: { speechId, title: text, kind, state, approvedVersion: state === "APPROVED" ? "v1" : null, updatedAt: "2026-11-16T09:00:00Z" },
    draft: {
      kind,
      provider: "polly",
      engine: "generative",
      voiceId: "Amy",
      draftRevision: 1,
      take: 1,
      updatedAt: "2026-11-16T09:00:00Z",
      clipKey: clipKeyOf(text, 1),
      text,
    },
    versions: [],
  };
}

class FakeAdmin {
  views = new Map<string, SpeechView>();
  saves: { speechId: string; body: Body }[] = [];
  previews: { speechId: string; text?: string; take?: number }[] = [];
  approvals: { speechId: string; body: { draftRevision: number; clipKey: string } }[] = [];
  failPreview = new Set<string>();
  failApprove = new Set<string>();

  constructor(...views: SpeechView[]) {
    for (const view of views) this.views.set(view.header.speechId, view);
  }

  api(): AdminApi {
    const unused = () => Promise.reject(new Error("not used by the speech page"));
    const get = (speechId: string) => {
      const view = this.views.get(speechId);
      return view === undefined ? Promise.reject(new ApiError(404, "NOT_FOUND")) : Promise.resolve(structuredClone(view));
    };
    return {
      listSpeech: () => Promise.resolve({ items: [...this.views.values()].map((v) => structuredClone(v.header)) }),
      createSpeech: unused,
      getSpeech: get,
      saveSpeech: (speechId: string, body: Body) => {
        this.saves.push({ speechId, body });
        const view = this.views.get(speechId);
        if (view === undefined) return Promise.reject(new ApiError(404, "NOT_FOUND"));
        const take = body.take ?? view.draft.take;
        const text = body.text ?? "";
        view.draft = { ...view.draft, draftRevision: body.draftRevision + 1, take, text, clipKey: clipKeyOf(text, take) };
        return get(speechId);
      },
      preview: (body: { speechId: string; text?: string; take?: number }): Promise<Preview> => {
        this.previews.push({ speechId: body.speechId, ...(body.text === undefined ? {} : { text: body.text }), ...(body.take === undefined ? {} : { take: body.take }) });
        if (this.failPreview.has(body.speechId)) return Promise.reject(new ApiError(502, "SPEECH_SYNTHESIS_FAILED"));
        const key = clipKeyOf(body.text ?? "", body.take ?? 1);
        return Promise.resolve({ clipKey: key, url: `https://audio.test/${key}.mp3`, expiresInSeconds: 300 });
      },
      approve: (speechId: string, body: { draftRevision: number; clipKey: string }) => {
        this.approvals.push({ speechId, body });
        if (this.failApprove.has(speechId)) {
          return Promise.reject(new ApiError(400, "VALIDATION_FAILED", [{ field: "clipKey", rule: "clip_mismatch" }]));
        }
        const view = this.views.get(speechId);
        if (view !== undefined) view.header = { ...view.header, state: "APPROVED", approvedVersion: "v1" };
        return Promise.resolve({ versionId: "v1", clipKey: body.clipKey, sha256: "0".repeat(64), renderedAt: null, take: 1 });
      },
      listActivities: unused,
      getActivity: unused,
      saveActivity: unused,
      validate: unused,
      publish: unused,
      deleteActivity: unused,
    } as unknown as AdminApi;
  }
}

let play: ReturnType<typeof vi.fn>;
beforeEach(() => {
  play = vi.fn(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play as unknown as () => Promise<void>);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const button = (name: string | RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;
const key = (k: string) => fireEvent.keyDown(window, { key: k });

function three() {
  return new FakeAdmin(
    speech("word-cat", "WORD", "cat"),
    speech("word-pig", "WORD", "pig"),
    speech("word-ship", "WORD", "ship", "APPROVED"),
    speech("word-van", "WORD", "van"),
  );
}

async function startQueue(fake: FakeAdmin, drafts: number) {
  render(<SpeechPage api={fake.api()} initial={null} />);
  const open = await screen.findByRole("button", { name: `Listening queue (${drafts} drafts)` });
  fireEvent.click(open);
  expect(button("Start the queue").disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: "I'll check every clip against these" }));
  fireEvent.click(button("Start the queue"));
}

/** The current clip plays to its end. */
const playToEnd = () => fireEvent.ended(screen.getByLabelText("Queue clip"));

async function onItem(n: number, of: number, said: string) {
  await screen.findByText(`${n} of ${of}`);
  await screen.findByLabelText("Queue clip");
  expect(screen.getByLabelText("Text").textContent).toBe(said);
}

describe("Listening queue", () => {
  it("walks only the drafts, previews and plays each clip, and approves the played clip key", async () => {
    const fake = three();
    await startQueue(fake, 3);

    await onItem(1, 3, "cat");
    expect(fake.previews).toEqual([{ speechId: "word-cat", text: "cat", take: 1 }]);
    expect(fake.saves).toEqual([]);
    expect(play).toHaveBeenCalledTimes(1);
    expect(button("Approve").disabled).toBe(true);
    expect(screen.getByText(/Play the clip to the end first/)).toBeTruthy();

    playToEnd();
    expect(button("Approve").disabled).toBe(false);
    fireEvent.click(button("Approve"));

    await onItem(2, 3, "pig");
    expect(fake.approvals).toEqual([{ speechId: "word-cat", body: { draftRevision: 1, clipKey: clipKeyOf("cat", 1) } }]);
    fireEvent.click(button("Skip"));

    await onItem(3, 3, "van");
    playToEnd();
    fireEvent.click(button("Approve"));

    await screen.findByText("Approved 2 · skipped 1 · failed 0 (of 3).");
    expect(fake.approvals.map((a) => a.speechId)).toEqual(["word-cat", "word-van"]);
    expect(fake.previews.map((p) => p.speechId)).toEqual(["word-cat", "word-pig", "word-van"]);
    fireEvent.click(button("Close"));
    await screen.findByRole("button", { name: "Listening queue (1 draft)" });
  });

  it("follows the keys: A only after a full play, S skips, Escape stops", async () => {
    const fake = three();
    await startQueue(fake, 3);
    await onItem(1, 3, "cat");

    key("a");
    expect(fake.approvals).toEqual([]);
    playToEnd();
    key("a");
    await onItem(2, 3, "pig");
    expect(fake.approvals).toHaveLength(1);

    key("s");
    await onItem(3, 3, "van");
    key("p");
    expect(play).toHaveBeenCalledTimes(4); // three autoplays and one replay
    key("Escape");

    await screen.findByText("Approved 1 · skipped 1 · failed 0 · not reached 1 (of 3).");
    expect(within(screen.getByRole("region", { name: "Listening queue" })).getByText("word-pig")).toBeTruthy();
  });

  it("Try another take saves the next take, plays it, and approves only that take after it played", async () => {
    const fake = three();
    await startQueue(fake, 3);
    await onItem(1, 3, "cat");
    playToEnd(); // take 1 was heard, but the take that will be approved is take 2

    key("r");
    await screen.findByText("Take 2");
    expect(fake.saves).toEqual([{ speechId: "word-cat", body: { draftRevision: 1, text: "cat", take: 2 } }]);
    expect(fake.previews[1]).toEqual({ speechId: "word-cat", text: "cat", take: 2 });
    expect(button("Approve").disabled).toBe(true);
    key("a");
    expect(fake.approvals).toEqual([]);

    playToEnd();
    fireEvent.click(button("Approve"));
    await screen.findByText("2 of 3");
    expect(fake.approvals).toEqual([{ speechId: "word-cat", body: { draftRevision: 2, clipKey: clipKeyOf("cat", 2) } }]);
  });

  it("shows errors plainly, records them and carries on", async () => {
    const fake = three();
    fake.failPreview.add("word-cat");
    fake.failApprove.add("word-pig");
    await startQueue(fake, 3);

    await onItem(2, 3, "pig");
    expect(screen.getByRole("alert").textContent).toBe("word-cat: The voice service could not make this clip. Try again.");
    playToEnd();
    fireEvent.click(button("Approve"));

    await onItem(3, 3, "van");
    expect(screen.getByRole("alert").textContent).toMatch(/^word-pig: The clip you played is not the clip of the saved draft/);
    key("s");

    await screen.findByText("Approved 0 · skipped 1 · failed 2 (of 3).");
    expect(screen.getByText(/could not make this clip/)).toBeTruthy();
    expect(screen.getByText(/not the clip of the saved draft/)).toBeTruthy();
  });

  it("offers Play when the browser blocks autoplay", async () => {
    play.mockImplementationOnce(() => Promise.reject(new DOMException("blocked", "NotAllowedError")));
    const fake = three();
    await startQueue(fake, 3);
    await onItem(1, 3, "cat");
    await screen.findByText(/Press Play to listen/);
    fireEvent.click(button(/^Play/));
    await waitFor(() => expect(screen.queryByText(/Press Play to listen/)).toBeNull());
    expect(play).toHaveBeenCalledTimes(2);
    expect(button("Approve").disabled).toBe(true);
  });

  it("walks only the drafts the list shows", async () => {
    const fake = three();
    render(<SpeechPage api={fake.api()} initial={null} />);
    await screen.findByRole("button", { name: "Listening queue (3 drafts)" });
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "pig" } });
    fireEvent.click(button("Listening queue (1 draft)"));
    expect(screen.getByText(/^1 draft from the list/)).toBeTruthy();
    key("Escape");
    await screen.findByText("Choose a speech definition, or make a new one.");
  });
});
