// React side of ClipPlayer: one Play button's state, and whether its clip is held here yet (D6.5: when the
// activity's audio is required, the answer area waits behind "Getting the sound ready…" until it is).
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ClipPlayer, PlayState } from "./clipPlayer";
import type { ClipRef } from "./types";

export type ClipAvailability = "checking" | "ready" | "failed";

export interface ClipControl {
  readonly state: PlayState;
  readonly availability: ClipAvailability;
  /** The Play / Stop / Play again button. Call it from the event handler itself (it primes audio synchronously). */
  press(): void;
  /** "Try again" after a failure: fetch the clip again. Never an attempt. */
  retry(): void;
}

/** The control for `ref`, or null when there is no clip (the button is then not shown). */
export function useClip(player: ClipPlayer, ref: ClipRef | null): ClipControl | null {
  const runId = ref?.runId ?? "";
  const slotId = ref?.slotId ?? "";
  const variant = ref?.variant ?? "";
  const clipKey = ref?.clipKey ?? "";
  const present = ref !== null;
  const state = useSyncExternalStore(player.subscribe, () => player.state({ runId, slotId, variant }));
  const [round, setRound] = useState(0);
  const fetchKey = present ? `${runId}/${slotId}/${variant}/${clipKey}#${round}` : "";
  const [fetched, setFetched] = useState<{ key: string; ok: boolean } | null>(null);

  // Fetch the clip ahead of the first Play (pack preparation, E.8), only when it is not already held. `fetchKey`
  // changes with the clip and with each Try again.
  useEffect(() => {
    if (fetchKey === "") return;
    let live = true;
    void player.prefetch({ runId, slotId, variant, clipKey }).then((ok) => {
      if (live) setFetched({ key: fetchKey, ok });
    });
    return () => {
      live = false;
    };
  }, [player, fetchKey, runId, slotId, variant, clipKey]);

  // A Play that had to download the clip itself also makes it available.
  const availability: ClipAvailability =
    state === "playing" || state === "played" ? "ready" : fetched?.key === fetchKey ? (fetched.ok ? "ready" : "failed") : "checking";

  const press = useCallback(() => player.press({ runId, slotId, variant, clipKey }), [player, runId, slotId, variant, clipKey]);
  const retry = useCallback(() => setRound((r) => r + 1), []);
  return present ? { state, availability, press, retry } : null;
}
