// The battlefield's GameBridge for the overlays drawn over the canvas (HUD, pad panel, activity, end screens).
// Battlefield provides it once the Phaser game exists; overlays are only rendered inside that provider.
import { createContext, useContext } from "react";
import type { GameBridge } from "../game/GameBridge";

export const BridgeContext = createContext<GameBridge | null>(null);

export function useGameBridge(): GameBridge {
  const bridge = useContext(BridgeContext);
  if (bridge === null) throw new Error("useGameBridge: only inside <Battlefield>");
  return bridge;
}
