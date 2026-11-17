// Opening the battle preview (Gate M, LD12): a new tab on this site, /preview/battle-preview.html?session=<id>, then
// the draft over a same-origin BroadcastChannel when that tab says it is ready (@scd/shared/preview). The editor's
// state goes as it is (saved or not); nothing is sent to the server.
import { mergeLevel } from "@scd/game-core";
import { PREVIEW_CHANNEL, PREVIEW_PATH, previewMessage, type PreviewDraft, type PreviewMode, type PreviewSpeed } from "@scd/shared/preview";
import type { LevelFile } from "../../api";
import { currentRulesetRaw, liveBase } from "../levelFile";

/** How long the editor waits for the preview tab to say it is ready. */
const WAIT_MS = 60_000;

export interface PreviewPorts {
  readonly open: (url: string) => void;
  readonly channel: () => Pick<BroadcastChannel, "postMessage" | "close" | "onmessage">;
  readonly newSession: () => string;
}

const browserPorts: PreviewPorts = {
  open: (url) => void window.open(url, "_blank", "noopener"),
  channel: () => new BroadcastChannel(PREVIEW_CHANNEL),
  newSession: () => crypto.randomUUID(),
};

/** The draft the preview plays: the level merged into its live planet, with the live ruleset. */
export function previewDraft(level: LevelFile, waveSetId: string, wave: number, mode: PreviewMode, speed: PreviewSpeed): PreviewDraft {
  return { ruleset: currentRulesetRaw(), planet: mergeLevel(liveBase().raw, level, "preview"), waveSetId, wave, mode, speed, title: level.name };
}

/** Opens the preview and answers its ready with the draft. Returns the session ID. */
export function openPreview(draft: PreviewDraft, ports: PreviewPorts = browserPorts): string {
  const session = ports.newSession();
  const channel = ports.channel();
  const stop = window.setTimeout(() => channel.close(), WAIT_MS);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const message = previewMessage(event.data);
    if (message?.type !== "ready" || message.session !== session) return;
    channel.postMessage({ type: "draft", session, draft });
    window.clearTimeout(stop);
    channel.close();
  };
  ports.open(`${PREVIEW_PATH}?session=${encodeURIComponent(session)}`);
  return session;
}
