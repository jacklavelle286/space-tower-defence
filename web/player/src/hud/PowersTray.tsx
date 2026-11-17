// The powers tray (Phase 31, D4 "Powers"; C10): one button per meteor power with its charges, keys 1, 2 and 3 by
// effect (1 Frost Pulse, 2 Comet Burst, 3 Colony Shield; useBattlefieldKeys). Frost Pulse and Colony Shield fire at
// once; Comet Burst starts aiming: the battle pauses (C2.1), the ring sits on the front-most alien, Left/Right move it,
// Enter or "Drop it here" (or a press on the route) drops it, Esc or "Cancel" puts it away. game-core decides every
// use; a refusal (no charge, already used this wave, the 3 s lockout) comes back and is said in words.
// Shown only when the ruleset has powers, so the live r1 game shows nothing new.
import { useEffect, useState } from "react";
import type { RejectReason } from "@scd/game-core";
import type { GameBridge, HudState } from "../game/GameBridge";

export const POWER_KEYS: readonly { readonly key: string; readonly effect: "slow" | "burst" | "shield" }[] = [
  { key: "1", effect: "slow" },
  { key: "2", effect: "burst" },
  { key: "3", effect: "shield" },
];

const REFUSALS: Partial<Record<RejectReason, string>> = {
  NO_CHARGE: "No charges left.",
  POWER_USED_THIS_WAVE: "Already used this wave.",
  POWER_LOCKED: "Wait a moment before the next power.",
  NOT_NOW: "Powers work during a wave.",
  BAD_TARGET: "Aim it at the path.",
};

export interface TrayPower {
  readonly key: string;
  readonly id: string;
  readonly name: string;
  readonly aims: boolean;
}

/** The ruleset's powers in key order (by effect, so the tray reads the ruleset rather than power IDs). */
export function trayPowers(bridge: GameBridge): TrayPower[] {
  return POWER_KEYS.flatMap(({ key, effect }) => {
    const power = Object.values(bridge.config.powers).find((p) => p.effect.kind === effect);
    return power === undefined ? [] : [{ key, id: power.id, name: power.name, aims: effect === "burst" }];
  });
}

/** Fire a power, or start aiming it when it needs a point on the route. */
export function firePower(bridge: GameBridge, power: TrayPower): void {
  if (power.aims) bridge.startAim(power.id);
  // GameBridge.usePower is the spine's command name (S10), not a React hook; the linter goes by the "use" prefix.
  // oxlint-disable-next-line react/rules-of-hooks
  else bridge.usePower(power.id);
}

export function PowersTray({ bridge, hud }: { bridge: GameBridge; hud: HudState }) {
  const [refusal, setRefusal] = useState<string | null>(null);
  const powers = trayPowers(bridge);
  useEffect(
    () =>
      bridge.on("commandRejected", ({ command, reason }) => {
        if (command.kind === "usePower") setRefusal(REFUSALS[reason] ?? "Not now.");
      }),
    [bridge],
  );
  if (powers.length === 0) return null;
  const fighting = hud.battle === "IN_WAVE";
  return (
    <div className="bf-powers" role="group" aria-label="Meteor powers">
      {hud.aiming !== null ? (
        <>
          <span className="bf-power-note">Move the ring with ← →, then drop it.</span>
          <button type="button" className="bf-big" onClick={() => bridge.dropAim()} autoFocus>
            Drop it here
          </button>
          <button type="button" className="bf-small" onClick={() => bridge.cancelAim()}>
            Cancel
          </button>
        </>
      ) : (
        powers.map((p) => (
          <button
            key={p.id}
            type="button"
            className="bf-power"
            title={`${p.name} (key ${p.key})`}
            // The name holds the button's visible "1 · 0" (WCAG 2.5.3, axe label-content-name-mismatch: Phase 68).
            aria-label={`${p.name}, key ${p.key} · ${hud.powers[p.id] ?? 0} left`}
            disabled={!fighting || (hud.powers[p.id] ?? 0) < 1}
            onClick={() => {
              setRefusal(null);
              firePower(bridge, p);
            }}
          >
            <img src={`/assets/common/power-${p.id}-icon.png`} alt="" />
            <span>
              {p.key} · {hud.powers[p.id] ?? 0}
            </span>
          </button>
        ))
      )}
      {refusal !== null && hud.aiming === null && (
        <span className="bf-power-note" role="status">
          {refusal}
        </span>
      )}
    </div>
  );
}
