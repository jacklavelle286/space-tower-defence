// The Play rule (O-2, CONFIRMED by owner 2026-11-14; D6.5, E.4.2, E.9, G R15), with a fake audio element and a fake
// speech service writing to one ordered event log.
import { describe, expect, it, vi } from "vitest";
import { ClipPlayer, type ClipLogEvent } from "./clipPlayer";
import { memoryClipStore, type ClipStore } from "./clipStore";
import { clipBytes, FakeAudio, FakeSpeech, keyFor, settle, type AudioEvent } from "./testing";
import { sha256Hex, type ClipRef, type StoredClip } from "./types";

const SH = { clipKey: keyFor("sh"), bytes: clipBytes(1, 2, 3, 4, 5) };
const SH_NEW = { clipKey: keyFor("sh-v2"), bytes: clipBytes(9, 8, 7) };
const REF: ClipRef = { runId: "11111111-1111-4111-8111-111111111111", slotId: "N-001", variant: "prompt", clipKey: SH.clipKey };

async function stored(clip: { clipKey: string; bytes: Uint8Array }): Promise<StoredClip> {
  const bytes = clip.bytes.slice().buffer;
  return { clipKey: clip.clipKey, sha256: await sha256Hex(bytes), contentType: "audio/mpeg", byteLength: bytes.byteLength, bytes };
}

function setUp(options: { store?: ClipStore; online?: boolean } = {}) {
  const events: AudioEvent[] = [];
  const logs: ClipLogEvent[] = [];
  const audio = new FakeAudio(events);
  const speech = new FakeSpeech(events);
  speech.serve("prompt", SH);
  const store = options.store ?? memoryClipStore();
  const net = { online: options.online ?? true };
  const player = new ClipPlayer({
    requestSpeech: speech.requestSpeech,
    store,
    output: audio,
    download: speech.download,
    online: () => net.online,
    log: (e) => logs.push(e),
  });
  const kinds = () => events.map((e) => e.kind);
  return { events, logs, audio, speech, store, player, net, kinds };
}

describe("Play, clip not stored yet", () => {
  it("waits for the response, downloads, checks sha256, stores, then plays", async () => {
    const t = setUp();
    t.speech.hold();
    t.player.press(REF);
    await settle();
    expect(t.player.state(REF)).toBe("loading");
    expect(t.kinds()).toEqual(["prime", "request"]); // nothing plays before the clip is here
    await t.speech.release();
    await settle(5);
    expect(t.kinds()).toEqual(["prime", "request", "download", "start"]);
    expect(t.player.state(REF)).toBe("playing");
    expect(t.audio.playing).toEqual([1, 2, 3, 4, 5]);
    expect(await t.store.get(SH.clipKey)).not.toBeNull();
  });

  it("ignores re-presses while loading (the debounce): one request", async () => {
    const t = setUp();
    t.speech.hold();
    t.player.press(REF);
    await settle();
    t.player.press(REF);
    t.player.press(REF);
    await settle();
    expect(t.speech.requests).toHaveLength(1);
    await t.speech.release();
    await settle(5);
    expect(t.player.state(REF)).toBe("playing");
  });

  it("a sha256 mismatch is logged, never stored and never played; the button offers Try again", async () => {
    const t = setUp();
    t.speech.corruptNextDownload = true;
    t.player.press(REF);
    await settle(5);
    expect(t.player.state(REF)).toBe("failed");
    expect(t.kinds()).not.toContain("start");
    expect(await t.store.get(SH.clipKey)).toBeNull();
    expect(t.logs.map((l) => l.event)).toEqual(["sha256-mismatch"]);
    // Try again: a fresh request and download, which this time verifies.
    t.player.press(REF);
    await settle(5);
    expect(t.player.state(REF)).toBe("playing");
    expect(t.speech.requests).toHaveLength(2);
  });

  it("a speech failure (503 SPEECH_UNAVAILABLE) shows Try again and stores nothing", async () => {
    const t = setUp();
    t.speech.failNextRequest = { kind: "error", status: 503, code: "SPEECH_UNAVAILABLE", body: null };
    t.player.press(REF);
    await settle(5);
    expect(t.player.state(REF)).toBe("failed");
    expect(t.logs[0]).toMatchObject({ event: "speech-failed", detail: "HTTP 503 SPEECH_UNAVAILABLE" });
  });

  it("an S3 403 gets one fresh URL", async () => {
    const t = setUp();
    t.speech.forbidNextDownload = true;
    t.player.press(REF);
    // Two round trips: wait for the start rather than a fixed delay, which a busy machine can outrun.
    await vi.waitFor(() => expect(t.player.state(REF)).toBe("playing"));
    expect(t.kinds()).toEqual(["prime", "request", "download", "request", "download", "start"]);
    expect(t.player.state(REF)).toBe("playing");
  });

  it("offline with nothing stored: no request, and the failure says so", async () => {
    const t = setUp({ online: false });
    t.player.press(REF);
    await settle(5);
    expect(t.speech.requests).toHaveLength(0);
    expect(t.player.state(REF)).toBe("failed");
  });
});

describe("Play, clip already stored", () => {
  it("starts the sound first, then sends POST /api/speech concurrently (AC-19)", async () => {
    const store = memoryClipStore();
    await store.put(await stored(SH));
    const t = setUp({ store });
    t.speech.hold(); // a throttled network: the response does not come
    t.player.press(REF);
    await settle(5);
    expect(t.kinds()).toEqual(["prime", "start", "request"]); // sound, then the request, in that order
    expect(t.player.state(REF)).toBe("playing");
    expect(t.speech.pending).toHaveLength(1); // still waiting, and the child is already listening
    await t.speech.release();
    await settle(5);
    expect(t.kinds()).toEqual(["prime", "start", "request"]); // same key: nothing downloaded
  });

  it("exit criterion: a second Play starts before its POST /api/speech answer, and the request is still sent", async () => {
    const t = setUp();
    t.player.press(REF); // first Play: downloads and stores
    await settle(5);
    t.audio.finish();
    expect(t.player.state(REF)).toBe("played");
    t.speech.hold();
    const before = t.events.length;
    t.player.press(REF); // second Play, network throttled
    await settle(5);
    expect(t.events.slice(before).map((e) => e.kind)).toEqual(["prime", "start", "request"]);
    expect(t.player.state(REF)).toBe("playing");
    expect(t.speech.pending).toHaveLength(1);
    expect(t.speech.requests).toHaveLength(2);
  });

  it("replays while a request is in flight do not multiply requests", async () => {
    const store = memoryClipStore();
    await store.put(await stored(SH));
    const t = setUp({ store });
    t.speech.hold();
    t.player.press(REF);
    await settle(5);
    t.player.press(REF); // Stop
    t.player.press(REF); // Play again
    await settle(5);
    expect(t.kinds().filter((k) => k === "start")).toHaveLength(2);
    expect(t.speech.requests).toHaveLength(1);
  });

  it("a failed concurrent request never stops the sound; it is only logged", async () => {
    const store = memoryClipStore();
    await store.put(await stored(SH));
    const t = setUp({ store });
    t.speech.failNextRequest = { kind: "network", reason: "timeout" };
    t.player.press(REF);
    await settle(5);
    expect(t.player.state(REF)).toBe("playing");
    expect(t.kinds()).not.toContain("stop");
    expect(t.logs.map((l) => l.event)).toEqual(["speech-failed"]);
  });

  it("a different clipKey is logged, stored, and used from the next Play without interrupting this one", async () => {
    const store = memoryClipStore();
    await store.put(await stored(SH));
    const t = setUp({ store });
    t.speech.serve("prompt", SH_NEW); // the server now pins a newer clip
    t.player.press(REF);
    await settle(10);
    expect(t.audio.playing).toEqual([1, 2, 3, 4, 5]); // the old clip keeps playing
    expect(t.kinds()).not.toContain("stop");
    expect(t.logs).toEqual([
      { event: "clip-key-mismatch", slotId: "N-001", variant: "prompt", clipKey: SH.clipKey, serverClipKey: SH_NEW.clipKey },
    ]);
    expect(await store.get(SH_NEW.clipKey)).not.toBeNull();
    t.audio.finish();
    t.player.press(REF); // next Play: the server's clip, at once
    await settle(5);
    expect(t.audio.playing).toEqual([9, 8, 7]);
  });

  it("offline: plays the stored bytes and sends nothing", async () => {
    const store = memoryClipStore();
    await store.put(await stored(SH));
    const t = setUp({ store, online: false });
    t.player.press(REF);
    await settle(5);
    expect(t.kinds()).toEqual(["prime", "start"]);
    expect(t.player.state(REF)).toBe("playing");
  });

  it("NotAllowedError: back to Play, and the next press plays at once", async () => {
    const store = memoryClipStore();
    await store.put(await stored(SH));
    const t = setUp({ store });
    t.audio.refuseNext = "NotAllowedError";
    t.player.press(REF);
    await settle(5);
    expect(t.player.state(REF)).toBe("idle");
    t.player.press(REF);
    await settle(5);
    expect(t.player.state(REF)).toBe("playing");
  });
});

describe("storage and logging", () => {
  it("a store that refuses the write (quota) still plays, and logs store-failed", async () => {
    const refusing: ClipStore = {
      persistent: true,
      get: async () => null,
      put: async () => {
        const error = new Error("full");
        error.name = "QuotaExceededError";
        throw error;
      },
    };
    const t = setUp({ store: refusing });
    t.player.press(REF);
    await settle(5);
    expect(t.player.state(REF)).toBe("playing");
    expect(t.logs).toEqual([{ event: "store-failed", slotId: "N-001", variant: "prompt", clipKey: SH.clipKey, detail: "QuotaExceededError" }]);
  });

  it("prefetch stores the clip without playing; a later Play is immediate", async () => {
    const t = setUp();
    expect(await t.player.prefetch(REF)).toBe(true);
    expect(t.kinds()).toEqual(["request", "download"]);
    expect(await t.player.prefetch(REF)).toBe(true); // already held: no second request
    expect(t.speech.requests).toHaveLength(1);
  });

  it("never logs a URL", async () => {
    const t = setUp();
    t.speech.corruptNextDownload = true;
    t.player.press(REF);
    await settle(5);
    t.speech.failNextRequest = { kind: "error", status: 500, code: "INTERNAL", body: null };
    t.player.press(REF);
    await settle(5);
    expect(JSON.stringify(t.logs)).not.toMatch(/https?:|sig=/);
  });

  it("stop ends the sound; dispose cancels everything", async () => {
    const store = memoryClipStore();
    await store.put(await stored(SH));
    const t = setUp({ store });
    t.player.press(REF);
    await settle(5);
    t.player.press(REF); // Stop
    expect(t.player.state(REF)).toBe("played");
    t.player.dispose();
    t.player.press(REF);
    await settle(5);
    expect(t.kinds().filter((k) => k === "start")).toHaveLength(1);
  });
});
