// The one shared audio element per page (E.9): a new clip ends the old one (prompt.md:619), bytes are played from a
// Blob object URL, and every object URL is revoked on end, error, stop and replacement.

export interface AudioOutput {
  /**
   * Called synchronously in the click or key handler, before anything is awaited, so the browser still counts the
   * later play() as part of the child's gesture (Safari, E.9).
   */
  prime(): void;
  /** Start playing these bytes, ending anything already playing. Rejects (e.g. `NotAllowedError`) if refused. */
  start(bytes: ArrayBuffer, contentType: string): Promise<void>;
  stop(): void;
  /** Called when a started clip finishes by itself or fails while playing. */
  onEnded(listener: () => void): () => void;
  dispose(): void;
}

export function htmlAudioOutput(doc: Document = document): AudioOutput {
  const element = doc.createElement("audio");
  element.preload = "auto";
  let url: string | null = null;
  let primed = false;
  const listeners = new Set<() => void>();

  const release = () => {
    if (url !== null) URL.revokeObjectURL(url);
    url = null;
  };
  const ended = () => {
    release();
    for (const listener of listeners) listener();
  };
  element.addEventListener("ended", ended);
  element.addEventListener("error", () => {
    if (url !== null) ended();
  });

  return {
    prime() {
      if (primed) return;
      primed = true;
      // An empty, muted play inside the gesture marks the element as allowed to play later (E.9; [UNVERIFIED] on
      // Safari, see ADR-0015). A refusal here is expected and harmless.
      element.muted = true;
      const attempt = element.play();
      if (attempt !== undefined) attempt.catch(() => undefined);
      element.pause();
      element.muted = false;
    },
    async start(bytes, contentType) {
      element.pause();
      release();
      url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
      element.src = url;
      element.currentTime = 0;
      await element.play();
    },
    stop() {
      element.pause();
      release();
      element.removeAttribute("src");
    },
    onEnded(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      element.pause();
      release();
      listeners.clear();
    },
  };
}
