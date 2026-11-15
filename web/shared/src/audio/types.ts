// Shapes of the speech route (G R15) and of a clip held in the browser (E.9).

/** `POST /api/speech` request: identifiers only, never text, SSML, voice or engine (AC-20). */
export interface SpeechRequest {
  readonly runId: string;
  readonly slotId: string;
  /** A key of the slot's pinned clips map, e.g. "prompt" or "instruction". */
  readonly variant: string;
}

/** One clip a panel can play: the request identifiers plus the `clipKey` the slot pinned (from the pack). */
export interface ClipRef extends SpeechRequest {
  readonly clipKey: string;
}

/** `POST /api/speech` 200 body. The URL is used once, at once, and never stored, logged or put in React state. */
export interface SpeechResponse {
  readonly clipKey: string;
  readonly sha256: string;
  readonly url: string;
  readonly expiresInSeconds: number;
  readonly contentType: string;
  readonly bytes: number;
}

/** A clip as stored once per `clipKey` (E.9), however many activities use it. */
export interface StoredClip {
  readonly clipKey: string;
  readonly sha256: string;
  readonly contentType: string;
  readonly byteLength: number;
  readonly bytes: ArrayBuffer;
}

const HEX64 = /^[0-9a-f]{64}$/;

/** True when `body` is a well-formed R15 answer. Anything else is treated as a failed request. */
export function isSpeechResponse(body: unknown): body is SpeechResponse {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.clipKey === "string" &&
    HEX64.test(b.clipKey) &&
    typeof b.sha256 === "string" &&
    HEX64.test(b.sha256) &&
    typeof b.url === "string" &&
    /^(https:|blob:)/.test(b.url) &&
    typeof b.contentType === "string" &&
    typeof b.bytes === "number" &&
    Number.isInteger(b.bytes) &&
    b.bytes > 0 &&
    typeof b.expiresInSeconds === "number"
  );
}

/** Hex SHA-256 of some bytes (Web Crypto; the same value tts returns and admin-api records at approval). */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
