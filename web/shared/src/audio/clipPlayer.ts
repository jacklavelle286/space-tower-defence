// The Play rule [CONFIRMED by owner, 2026-11-14] (O-2; spine S5.2, D6.5, E.4.2, E.9, G R15):
//
// - Online, the slot's pinned clip already stored here: playback starts at once from the stored bytes, THEN
//   `POST /api/speech` is sent concurrently (every online Play reaches the service, AC-19; the child never waits).
// - Online, not stored: the button shows Loading while the client waits for the response, downloads the clip,
//   checks length, type and `sha256`, stores it and plays.
// - The response names a different `clipKey`: the current play is not interrupted; the mismatch is logged, the
//   server's clip is downloaded, checked and stored, and it is used from the next Play.
// - Offline: stored bytes only.
// - A failure is never an attempt and never a reward (AC-22): this module knows nothing about attempts at all.
//
// The presigned URL is used once, immediately, and never stored, logged or handed to React.
import type { ApiResult } from "../api/types";
import type { AudioOutput } from "./output";
import type { ClipStore } from "./clipStore";
import { isSpeechResponse, sha256Hex, type ClipRef, type SpeechRequest, type SpeechResponse, type StoredClip } from "./types";

/** D6.5 button states. `played` shows "Play again"; `failed` shows "We couldn't get the sound." and Try again. */
export type PlayState = "idle" | "loading" | "playing" | "played" | "failed";

/** What is logged. Never a URL, never a token: identifiers and keys only (G §15). */
export interface ClipLogEvent {
  readonly event:
    | "speech-failed"
    | "clip-key-mismatch"
    | "sha256-mismatch"
    | "size-mismatch"
    | "type-mismatch"
    | "download-failed"
    | "store-failed"
    | "play-refused"
    | "offline-missing";
  readonly slotId: string;
  readonly variant: string;
  readonly clipKey: string;
  readonly serverClipKey?: string;
  readonly detail?: string;
}

export interface ClipPlayerOptions {
  requestSpeech(request: SpeechRequest): Promise<ApiResult<SpeechResponse>>;
  store: ClipStore;
  output: AudioOutput;
  /** Downloads the presigned URL. Default: `fetch(url, { cache: "no-store" })`, no custom headers (a simple CORS GET). */
  download?: (url: string, signal: AbortSignal) => Promise<Response>;
  online?: () => boolean;
  log?: (event: ClipLogEvent) => void;
}

type Listener = () => void;

const refKey = (ref: SpeechRequest): string => `${ref.runId}/${ref.slotId}/${ref.variant}`;

export class ClipPlayer {
  readonly #options: ClipPlayerOptions;
  readonly #download: (url: string, signal: AbortSignal) => Promise<Response>;
  readonly #online: () => boolean;
  readonly #log: (event: ClipLogEvent) => void;
  /** Verified clips already in hand this page load (also covers a store that refused the write). */
  readonly #memory = new Map<string, StoredClip>();
  /** Per slot and variant: the server's clipKey when it differed from the pinned one ("used from the next Play"). */
  readonly #latest = new Map<string, string>();
  readonly #states = new Map<string, PlayState>();
  /** Concurrent speech requests in flight, per slot and variant: the debounce for rapid replays. */
  readonly #inFlight = new Set<string>();
  readonly #listeners = new Set<Listener>();
  /** Which ref is (or is about to be) playing; a newer press makes older loads drop their result. */
  #token = 0;
  #current: string | null = null;
  #abort = new AbortController();
  #disposed = false;
  readonly #unsubscribeEnded: () => void;

  constructor(options: ClipPlayerOptions) {
    this.#options = options;
    this.#download = options.download ?? ((url, signal) => fetch(url, { cache: "no-store", signal }));
    this.#online = options.online ?? (() => globalThis.navigator?.onLine ?? true);
    this.#log = options.log ?? (() => undefined);
    this.#unsubscribeEnded = options.output.onEnded(() => {
      if (this.#current !== null) this.#set(this.#current, "played");
      this.#current = null;
    });
  }

  // ---- state for React (useSyncExternalStore) ------------------------------------------------------------------

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  state(ref: SpeechRequest): PlayState {
    return this.#states.get(refKey(ref)) ?? "idle";
  }

  #set(key: string, state: PlayState): void {
    if (this.#states.get(key) === state) return;
    this.#states.set(key, state);
    for (const listener of this.#listeners) listener();
  }

  // ---- commands ------------------------------------------------------------------------------------------------

  /**
   * The Play button's handler. Call it straight from the click or key event: it primes the audio element before the
   * first await. Loading ignores re-presses (the debounce, prompt.md:587); Playing turns the press into Stop.
   */
  press(ref: ClipRef): void {
    if (this.#disposed) return;
    const key = refKey(ref);
    const state = this.state(ref);
    if (state === "loading") return;
    if (state === "playing") {
      this.stop();
      return;
    }
    this.#options.output.prime();
    const token = ++this.#token;
    void this.#play(ref, key, token);
  }

  /** Stop whatever is playing (Stop, leaving the activity, page hidden). */
  stop(): void {
    this.#token += 1; // a load still in progress must not start playing afterwards
    this.#options.output.stop();
    if (this.#current !== null) this.#set(this.#current, "played");
    this.#current = null;
  }

  /**
   * Make sure the pinned clip is held here (run preparation, and the panel opening). Sends `POST /api/speech` only when
   * nothing is stored. True when the bytes are available.
   */
  async prefetch(ref: ClipRef): Promise<boolean> {
    if (this.#disposed) return false;
    const key = refKey(ref);
    if ((await this.#lookup(this.#latest.get(key) ?? ref.clipKey)) !== null) return true;
    if (!this.#online()) return false;
    const clip = await this.#fetchClip(ref);
    if (clip === null) return false;
    if (clip.clipKey !== ref.clipKey) this.#mismatch(ref, key, clip.clipKey);
    await this.#keep(clip, ref);
    return true;
  }

  /** Is the clip for this ref held locally (pinned key, or the server's newer key)? */
  async has(ref: ClipRef): Promise<boolean> {
    return (await this.#lookup(this.#latest.get(refKey(ref)) ?? ref.clipKey)) !== null;
  }

  /** Stop, cancel downloads and forget the bytes in memory (leaving the run screen, sign-out). */
  dispose(): void {
    this.#disposed = true;
    this.stop();
    this.#abort.abort();
    this.#abort = new AbortController();
    this.#unsubscribeEnded();
    this.#options.output.dispose();
    this.#memory.clear();
    this.#listeners.clear();
  }

  // ---- the rule ------------------------------------------------------------------------------------------------

  async #play(ref: ClipRef, key: string, token: number): Promise<void> {
    const pinned = this.#latest.get(key) ?? ref.clipKey;
    const local = await this.#lookup(pinned);
    if (token !== this.#token || this.#disposed) return;
    const online = this.#online();

    if (local !== null) {
      // 1. sound first, from the local bytes ...
      this.#start(ref, key, local, token);
      // 2. ... then the authenticated request, concurrently, which the child never waits for (AC-19).
      if (online) void this.#concurrentRequest(ref, key, pinned);
      return;
    }

    if (!online) {
      this.#log({ event: "offline-missing", slotId: ref.slotId, variant: ref.variant, clipKey: pinned });
      this.#set(key, "failed");
      return;
    }

    this.#set(key, "loading");
    const clip = await this.#fetchClip(ref);
    if (this.#disposed) return;
    if (clip === null) {
      this.#set(key, "failed");
      return;
    }
    if (clip.clipKey !== pinned) this.#mismatch(ref, key, clip.clipKey);
    await this.#keep(clip, ref);
    if (token !== this.#token || this.#disposed) {
      this.#set(key, "idle"); // another clip was pressed meanwhile; this one is ready for next time
      return;
    }
    this.#start(ref, key, clip, token);
  }

  #start(ref: ClipRef, key: string, clip: StoredClip, token: number): void {
    if (this.#current !== null && this.#current !== key) this.#set(this.#current, "played");
    this.#current = key;
    this.#set(key, "playing");
    this.#options.output.start(clip.bytes, clip.contentType).then(
      () => undefined,
      (error: unknown) => {
        if (token !== this.#token) return;
        this.#current = null;
        const name = error instanceof Error ? error.name : "Error";
        this.#log({ event: "play-refused", slotId: ref.slotId, variant: ref.variant, clipKey: clip.clipKey, detail: name });
        // NotAllowedError: the bytes are held, so the next press plays at once (E.9). Anything else: Try again.
        this.#set(key, name === "NotAllowedError" ? "idle" : "failed");
      },
    );
  }

  /** The background request of a Play that is already sounding. Its failure is logged only; nothing stops. */
  async #concurrentRequest(ref: ClipRef, key: string, playing: string): Promise<void> {
    if (this.#inFlight.has(key)) return; // debounced: one request at a time per slot and variant
    this.#inFlight.add(key);
    try {
      const result = await this.#options.requestSpeech({ runId: ref.runId, slotId: ref.slotId, variant: ref.variant });
      if (result.kind !== "ok" || !isSpeechResponse(result.body)) {
        this.#log({ event: "speech-failed", slotId: ref.slotId, variant: ref.variant, clipKey: playing, detail: describe(result) });
        return;
      }
      if (result.body.clipKey === playing) return;
      this.#mismatch(ref, key, result.body.clipKey);
      if ((await this.#lookup(result.body.clipKey)) !== null) return;
      const clip = await this.#downloadVerified(ref, result.body);
      if (clip !== null) await this.#keep(clip, ref);
    } finally {
      this.#inFlight.delete(key);
    }
  }

  #mismatch(ref: ClipRef, key: string, serverKey: string): void {
    this.#log({
      event: "clip-key-mismatch",
      slotId: ref.slotId,
      variant: ref.variant,
      clipKey: this.#latest.get(key) ?? ref.clipKey,
      serverClipKey: serverKey,
    });
    this.#latest.set(key, serverKey);
  }

  /** Request, download and verify. Null on any failure (already logged). */
  async #fetchClip(ref: ClipRef): Promise<StoredClip | null> {
    const request = { runId: ref.runId, slotId: ref.slotId, variant: ref.variant };
    const result = await this.#options.requestSpeech(request);
    if (result.kind !== "ok" || !isSpeechResponse(result.body)) {
      this.#log({ event: "speech-failed", slotId: ref.slotId, variant: ref.variant, clipKey: ref.clipKey, detail: describe(result) });
      return null;
    }
    return this.#downloadVerified(ref, result.body);
  }

  /**
   * Download the presigned URL and check it before anything keeps it: length, Content-Type and `sha256` must match
   * the response (E.9). An S3 403 (URL expired early with its signing credentials) gets one fresh URL.
   */
  async #downloadVerified(ref: ClipRef, first: SpeechResponse): Promise<StoredClip | null> {
    let response = first;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let download: Response;
      try {
        download = await this.#download(response.url, this.#abort.signal);
      } catch {
        this.#log({ event: "download-failed", slotId: ref.slotId, variant: ref.variant, clipKey: response.clipKey, detail: "network" });
        return null;
      }
      if (download.status === 403 && attempt === 0) {
        const again = await this.#options.requestSpeech({ runId: ref.runId, slotId: ref.slotId, variant: ref.variant });
        if (again.kind !== "ok" || !isSpeechResponse(again.body)) {
          this.#log({ event: "speech-failed", slotId: ref.slotId, variant: ref.variant, clipKey: response.clipKey, detail: describe(again) });
          return null;
        }
        response = again.body;
        continue;
      }
      if (!download.ok) {
        this.#log({ event: "download-failed", slotId: ref.slotId, variant: ref.variant, clipKey: response.clipKey, detail: `HTTP ${download.status}` });
        return null;
      }
      const bytes = await download.arrayBuffer();
      const base = { slotId: ref.slotId, variant: ref.variant, clipKey: response.clipKey };
      if (bytes.byteLength !== response.bytes) {
        this.#log({ ...base, event: "size-mismatch" });
        return null;
      }
      const type = download.headers.get("content-type");
      if (type !== null && type !== "" && !type.toLowerCase().startsWith(response.contentType.toLowerCase())) {
        this.#log({ ...base, event: "type-mismatch" });
        return null;
      }
      if ((await sha256Hex(bytes)) !== response.sha256) {
        this.#log({ ...base, event: "sha256-mismatch" }); // never stored, never played
        return null;
      }
      return { clipKey: response.clipKey, sha256: response.sha256, contentType: response.contentType, byteLength: bytes.byteLength, bytes };
    }
    return null;
  }

  async #lookup(clipKey: string): Promise<StoredClip | null> {
    const held = this.#memory.get(clipKey);
    if (held !== undefined) return held;
    let stored: StoredClip | null = null;
    try {
      stored = await this.#options.store.get(clipKey);
    } catch {
      stored = null;
    }
    if (stored !== null) this.#memory.set(clipKey, stored);
    return stored;
  }

  async #keep(clip: StoredClip, ref: ClipRef): Promise<void> {
    this.#memory.set(clip.clipKey, clip);
    try {
      await this.#options.store.put(clip);
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      this.#log({ event: "store-failed", slotId: ref.slotId, variant: ref.variant, clipKey: clip.clipKey, detail: name });
    }
  }
}

function describe(result: ApiResult<unknown>): string {
  switch (result.kind) {
    case "ok":
      return "malformed response";
    case "error":
      return `HTTP ${result.status}${result.code === null ? "" : ` ${result.code}`}`;
    case "network":
      return `network ${result.reason}`;
    default:
      return result.kind;
  }
}
