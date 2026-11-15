// React side of GameBridge: subscribe to its throttled events. React state changes only when the bridge sends an
// event (hud and selectionChanged at most 10 per second), never per frame.
import { useEffect, useState } from "react";
import type { GameBridge, HudState, Selection } from "../game/GameBridge";

export function useHud(bridge: GameBridge): HudState {
  const [hud, setHud] = useState<HudState>(() => bridge.hud());
  useEffect(() => bridge.on("hud", setHud), [bridge]);
  return hud;
}

export function useSelection(bridge: GameBridge): Selection | null {
  const [selection, setSelection] = useState<Selection | null>(() => bridge.selection());
  useEffect(() => bridge.on("selectionChanged", setSelection), [bridge]);
  return selection;
}
