// The local battlefield's dev power strip (Phase 28, development builds only; /play/local?powers=...): one button per
// meteor power with its charges, and keys 1, 2 and 3 (C10: 1 Frost Pulse, 2 Comet Burst, 3 Colony Shield). It is a
// test control, not the Phase 51 meteor UI: there is no offer, no aiming ring and no pause while aiming. A Comet Burst
// lands on the front-most alien (where C10's keyboard ring starts), at once.
//
// Everything is decided by game-core: the strip only sends usePower through the bridge. A refusal (no charge, already
// used this wave, the 3 s lockout, not during a wave) comes back as commandRejected, and the strip shows its reason.
import { useEffect, useState } from "react";
import type { GameBridge, HudState } from "../game/GameBridge";

/** C10's keys, by the effect the power has (so the strip reads the ruleset, not power IDs). */
const KEYS: readonly { readonly key: string; readonly effect: "slow" | "burst" | "shield" }[] = [
  { key: "1", effect: "slow" },
  { key: "2", effect: "burst" },
  { key: "3", effect: "shield" },
];

/** Where a Comet Burst lands from this strip: the route progress of the alien furthest along, or none. */
function frontMost(bridge: GameBridge): number | undefined {
  const aliens = bridge.battle?.aliens ?? [];
  return aliens.length === 0 ? undefined : Math.max(...aliens.map((a) => a.progress));
}

export function DevPowers({ bridge, hud }: { bridge: GameBridge; hud: HudState }) {
  const [refusal, setRefusal] = useState<string | null>(null);
  const powers = KEYS.flatMap(({ key, effect }) => {
    const entry = Object.values(bridge.config.powers).find((p) => p.effect.kind === effect);
    return entry === undefined ? [] : [{ key, id: entry.id, name: entry.name, burst: effect === "burst" }];
  });

  const fire = (id: string, burst: boolean) => {
    setRefusal(null);
    // GameBridge.usePower is the spine's command name (S10), not a React hook; the linter goes by the "use" prefix.
    // oxlint-disable-next-line react/rules-of-hooks
    bridge.usePower(id, burst ? frontMost(bridge) : undefined);
  };

  useEffect(
    () =>
      bridge.on("commandRejected", ({ command, reason }) => {
        if (command.kind === "usePower") setRefusal(`${command.powerId}: ${reason}`);
      }),
    [bridge],
  );

  // Keys act only while no text box has focus (C10: never while a learning answer is being typed).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target !== null && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const power = powers.find((p) => p.key === e.key);
      if (power !== undefined) fire(power.id, power.burst);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (powers.length === 0) return null;
  return (
    <div className="bf-powers" aria-label="Meteor powers (dev)">
      {powers.map((p) => (
        <button
          key={p.id}
          type="button"
          className="bf-power"
          title={`${p.name} (key ${p.key})`}
          disabled={(hud.powers[p.id] ?? 0) < 1}
          onClick={() => fire(p.id, p.burst)}
        >
          <img src={`/assets/common/power-${p.id}-icon.png`} alt="" />
          <span>
            {p.key} · {hud.powers[p.id] ?? 0}
          </span>
        </button>
      ))}
      {refusal !== null && <span className="bf-power-note">{refusal}</span>}
    </div>
  );
}
