// Test doubles for the audio module, shared by the shared and player tests (excluded from the app build by the
// player's tsconfig; never imported by app code). A fake audio element and a speech service the test answers by hand,
// both writing to one ordered event log, so a test can check that sound started before the request was sent.
import type { ApiResult } from "../api/types";
import type { AudioOutput } from "./output";
import { sha256Hex, type SpeechRequest, type SpeechResponse } from "./types";

export type AudioEvent =
  | { kind: "prime" }
  | { kind: "start"; bytes: number[] }
  | { kind: "stop" }
  | { kind: "request"; request: SpeechRequest }
  | { kind: "download"; url: string };

export class FakeAudio implements AudioOutput {
  /** Set to make the next start() reject with this error name (e.g. "NotAllowedError"). */
  refuseNext: string | null = null;
  playing: number[] | null = null;
  readonly #listeners = new Set<() => void>();

  constructor(readonly events: AudioEvent[]) {}

  prime(): void {
    this.events.push({ kind: "prime" });
  }

  start(bytes: ArrayBuffer): Promise<void> {
    const copy = Array.from(new Uint8Array(bytes));
    this.events.push({ kind: "start", bytes: copy });
    if (this.refuseNext !== null) {
      const error = new Error("refused");
      error.name = this.refuseNext;
      this.refuseNext = null;
      return Promise.reject(error);
    }
    this.playing = copy;
    return Promise.resolve();
  }

  stop(): void {
    this.events.push({ kind: "stop" });
    this.playing = null;
  }

  /** The clip reached its end. */
  finish(): void {
    this.playing = null;
    for (const listener of this.#listeners) listener();
  }

  onEnded(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  dispose(): void {
    this.#listeners.clear();
  }
}

export interface FakeClip {
  clipKey: string;
  bytes: Uint8Array;
}

/** A clip key (64 hex characters) made from a short name, for readable tests. */
export function keyFor(name: string): string {
  return Array.from(name, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("").padEnd(64, "0").slice(0, 64);
}

export function clipBytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

interface PendingRequest {
  request: SpeechRequest;
  resolve(result: ApiResult<SpeechResponse>): void;
}

/**
 * The speech route and the S3 download. By default each request is answered at once with the clip registered for its
 * variant; `hold()` makes requests wait until the test calls `release()` (a throttled network).
 */
export class FakeSpeech {
  readonly pending: PendingRequest[] = [];
  readonly #clips = new Map<string, FakeClip>();
  readonly #urls = new Map<string, FakeClip>();
  #held = false;
  #counter = 0;
  /** Corrupt the next download's bytes (sha256 mismatch), or answer the next request with an error. */
  corruptNextDownload = false;
  failNextRequest: ApiResult<SpeechResponse> | null = null;
  forbidNextDownload = false;

  constructor(readonly events: AudioEvent[]) {}

  serve(variant: string, clip: FakeClip): void {
    this.#clips.set(variant, clip);
  }

  hold(): void {
    this.#held = true;
  }

  /** Answer every waiting request (in order) and stop holding. */
  async release(): Promise<void> {
    this.#held = false;
    for (const p of this.pending.splice(0)) p.resolve(await this.#answer(p.request));
  }

  get requests(): SpeechRequest[] {
    return this.events.flatMap((e) => (e.kind === "request" ? [e.request] : []));
  }

  requestSpeech = (request: SpeechRequest): Promise<ApiResult<SpeechResponse>> => {
    this.events.push({ kind: "request", request: { ...request } });
    if (this.failNextRequest !== null) {
      const failure = this.failNextRequest;
      this.failNextRequest = null;
      return Promise.resolve(failure);
    }
    if (this.#held) return new Promise((resolve) => this.pending.push({ request, resolve }));
    return this.#answer(request);
  };

  async #answer(request: SpeechRequest): Promise<ApiResult<SpeechResponse>> {
    const clip = this.#clips.get(request.variant);
    if (clip === undefined) return { kind: "error", status: 404, code: "NOT_FOUND", body: null };
    const url = `https://audio.example.test/tts/v1/${clip.clipKey}.mp3?sig=${(this.#counter += 1)}`;
    this.#urls.set(url, clip);
    const body: SpeechResponse = {
      clipKey: clip.clipKey,
      sha256: await sha256Hex(clip.bytes.slice().buffer),
      url,
      expiresInSeconds: 300,
      contentType: "audio/mpeg",
      bytes: clip.bytes.byteLength,
    };
    return { kind: "ok", status: 200, body };
  }

  download = async (url: string): Promise<Response> => {
    this.events.push({ kind: "download", url });
    if (this.forbidNextDownload) {
      this.forbidNextDownload = false;
      return new Response("", { status: 403 });
    }
    const clip = this.#urls.get(url);
    if (clip === undefined) return new Response("", { status: 404 });
    const bytes = clip.bytes.slice();
    if (this.corruptNextDownload) {
      this.corruptNextDownload = false;
      bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    }
    return new Response(bytes, { status: 200, headers: { "content-type": "audio/mpeg" } });
  };
}

/** Let promise callbacks (and fake IndexedDB's timers) run. */
export const settle = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));
