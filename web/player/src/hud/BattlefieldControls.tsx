// Everything the child uses on the battlefield (Phase 31, M2-09; D4, D5): the shop, the keyboard pads, the panel for
// a selected pad, the powers tray, the Send home and Keys dialogs, and the keyboard map (battlefieldKeys.ts) on
// document. The HUD bar (battlefield/Hud.tsx) stays separate. Both the real run screen and the local slice use this.
//
// React re-renders only on the bridge's throttled events (hud, selectionChanged: at most 10 a second, spine S10); the
// key handler reads the latest values through refs, so it never re-subscribes per event.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GameBridge, HudState } from "../game/GameBridge";
import { PadPanel } from "../battlefield/PadPanel";
import { keyAction } from "./battlefieldKeys";
import { KeysDialog, SendHomeDialog } from "./Dialogs";
import { FOCUS_FIRST_PAD, PadButtons } from "./PadButtons";
import { aimChoices } from "./padNav";
import { firePower, PowersTray, trayPowers } from "./PowersTray";
import { Shop } from "./Shop";

interface SendHome {
  readonly padId: string;
  readonly name: string;
  readonly refund: number;
}

/** A dialog or the learning panel is open: battlefield shortcuts stand down (D5.1). */
function modalOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

export function BattlefieldControls({
  bridge,
  hud,
  active,
}: {
  bridge: GameBridge;
  hud: HudState;
  /** The board is in play (not behind the learning panel or an end screen). */
  active: boolean;
}) {
  const [sendHome, setSendHome] = useState<SendHome | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const latest = useRef({ hud, active });

  const pauseForDialog = () => {
    if (bridge.battle?.status === "IN_WAVE") bridge.pause(); // C2.1: an open dialog pauses the wave
  };
  const openSendHome = () => {
    const selection = bridge.selection();
    if (selection?.tower == null || selection.sellRefund === null) return;
    pauseForDialog();
    setSendHome({ padId: selection.padId, name: selection.tower.name, refund: selection.sellRefund });
  };
  const openKeys = () => {
    pauseForDialog();
    setKeysOpen(true);
  };
  const actions = useRef({ openSendHome, openKeys });
  // The key handler below is registered once; these refs give it the latest values after every render.
  useLayoutEffect(() => {
    latest.current = { hud, active };
    actions.current = { openSendHome, openKeys };
  });

  useEffect(() => {
    const initials: Record<string, string> = {};
    for (const id of bridge.config.waveSet.classes) {
      const name = bridge.config.classes[id]?.name;
      if (name !== undefined) initials[name.charAt(0).toLowerCase()] = id;
    }
    const onKey = (e: KeyboardEvent) => {
      const { hud: now, active: playing } = latest.current;
      const focus = document.activeElement as HTMLElement | null;
      const action = keyAction(e, {
        focusTag: focus?.tagName ?? null,
        focusEditable: focus?.isContentEditable === true,
        modalOpen: modalOpen(),
        initials,
        aiming: now.aiming !== null,
        battle: !playing ? "OTHER" : now.battle === "IN_WAVE" ? "IN_WAVE" : now.battle === "PREP" ? "PREP" : "OTHER",
      });
      if (action === null) return;
      e.preventDefault();
      const selection = bridge.selection();
      switch (action.kind) {
        case "arm": {
          const card = now.shop.find((c) => c.classId === action.classId);
          if (card === undefined || card.state !== "ok") return;
          const choose = bridge.armed !== action.classId;
          bridge.arm(choose ? action.classId : null);
          if (choose) window.dispatchEvent(new Event(FOCUS_FIRST_PAD));
          return;
        }
        case "escape":
          if (bridge.aim !== null) bridge.cancelAim();
          else if (bridge.armed !== null) bridge.arm(null);
          else if (bridge.selectedPad !== null) bridge.selectPad(null);
          return;
        case "upgrade":
          if (selection?.tower != null && selection.upgradeCost !== null) bridge.upgrade(selection.padId);
          return;
        case "sendHome":
          actions.current.openSendHome();
          return;
        case "cycleAim": {
          if (selection?.tower == null) return;
          const choices = aimChoices(bridge.config, selection.tower.classId, selection.tower.level);
          if (choices.length < 2) return;
          const next = choices[(choices.indexOf(selection.tower.targeting) + 1) % choices.length];
          if (next !== undefined) bridge.setTargeting(selection.padId, next);
          return;
        }
        case "power": {
          const power = trayPowers(bridge).find((p) => p.key === action.key);
          if (power !== undefined) firePower(bridge, power);
          return;
        }
        case "moveAim":
          bridge.moveAim(action.steps);
          return;
        case "dropAim":
          bridge.dropAim();
          return;
        case "pause":
          if (now.paused) bridge.resume();
          else bridge.pause();
          return;
        case "speed":
          bridge.setSpeed(now.speed === 2 ? 1 : 2);
          return;
        case "ready":
          if (now.runPhase === "BUILD") bridge.startWave();
          return;
        case "keys":
          actions.current.openKeys();
          return;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [bridge]);

  return (
    <>
      {active && <Shop bridge={bridge} hud={hud} onKeys={openKeys} />}
      {active && <PadButtons bridge={bridge} hud={hud} />}
      {active && <PadPanel bridge={bridge} credits={hud.credits} onSendHome={openSendHome} />}
      {active && <PowersTray bridge={bridge} hud={hud} />}

      {sendHome !== null && (
        <SendHomeDialog
          name={sendHome.name}
          refund={sendHome.refund}
          onKeep={() => setSendHome(null)}
          onSend={() => {
            bridge.sell(sendHome.padId);
            bridge.selectPad(null);
            setSendHome(null);
          }}
        />
      )}
      {keysOpen && <KeysDialog onClose={() => setKeysOpen(false)} />}
    </>
  );
}
