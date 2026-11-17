// @vitest-environment jsdom
// Opening the battle preview (Gate M, LD12): the editor opens the preview tab with a session, answers that session's
// ready with the draft (the level merged into the live planet, the live ruleset), and ignores everyone else.
import { describe, expect, it, vi } from "vitest";
import { newLevel } from "../levelFile";
import { openPreview, previewDraft, type PreviewPorts } from "./openPreview";

const SESSION = "0f0f0f0f-1111-4222-8333-444444444444";

function ports() {
  const posted: unknown[] = [];
  const channel = { postMessage: (m: unknown) => posted.push(m), close: vi.fn(), onmessage: null as ((e: MessageEvent<unknown>) => void) | null };
  const opened: string[] = [];
  const p: PreviewPorts = { open: (url) => opened.push(url), channel: () => channel, newSession: () => SESSION };
  return { p, posted, channel, opened };
}

describe("openPreview", () => {
  it("opens the preview with its session and sends the draft only to that session's ready", () => {
    const level = newLevel("zigzag", "Zigzag", "moonbeam-campaign");
    const draft = previewDraft(level, "campaign", 12, "watch", 4);
    expect(draft).toMatchObject({ waveSetId: "campaign", wave: 12, mode: "watch", speed: 4, title: "Zigzag" });
    expect((draft.planet as { maps: Record<string, unknown> }).maps["zigzag"]).toBeDefined();
    expect((draft.ruleset as { aliens: unknown }).aliens).toBeDefined();
    const { p, posted, channel, opened } = ports();
    openPreview(draft, p);
    expect(opened).toEqual([`/preview/battle-preview.html?session=${SESSION}`]);
    channel.onmessage?.({ data: { type: "ready", session: "0f0f0f0f-1111-4222-8333-555555555555" } } as MessageEvent);
    channel.onmessage?.({ data: "noise" } as MessageEvent);
    expect(posted).toEqual([]);
    channel.onmessage?.({ data: { type: "ready", session: SESSION } } as MessageEvent);
    expect(posted).toEqual([{ type: "draft", session: SESSION, draft }]);
    expect(channel.close).toHaveBeenCalled();
  });
});
