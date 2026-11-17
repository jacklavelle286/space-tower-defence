// Keyboard pads (Phase 31, D5.1-D5.2): one invisible button over each pad on the canvas, in route order, so Tab and
// the arrow keys reach every pad and a screen reader hears what is on it ("Pad 4, Nova level 2, aiming at the front").
// The buttons take no pointer events: the mouse keeps talking to the Phaser scene, which draws the pads. Focus is
// drawn as a thick ring, and the focused pad tells the bridge (focusPad) so the scene previews a chosen card's range.
// Choosing a card by its letter sends `bf-focus-first-pad`, and focus jumps to the first open empty pad (D5.2).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GameBridge, HudState } from "../game/GameBridge";
import { CANVAS_HEIGHT, CANVAS_WIDTH, TILE_PX, tileToPx } from "../game/layout";
import { padInDirection, padLabel, padOrder, type Direction } from "./padNav";

export const FOCUS_FIRST_PAD = "bf-focus-first-pad";

const ARROWS: Record<string, Direction> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function PadButtons({ bridge, hud }: { bridge: GameBridge; hud: HudState }) {
  const layer = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [box, setBox] = useState<Box | null>(null);
  const order = useMemo(() => padOrder(bridge.config), [bridge]);

  // Sit exactly over the canvas Phaser scaled into the stage (Scale.FIT), and follow it when the window resizes.
  useLayoutEffect(() => {
    const stage = layer.current?.parentElement;
    if (!stage) return;
    const measure = () => {
      const canvas = stage.querySelector("canvas");
      if (canvas === null) return;
      const s = stage.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      setBox({ left: c.left - s.left, top: c.top - s.top, width: c.width, height: c.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    const canvas = stage.querySelector("canvas");
    if (canvas !== null) observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const focusFirst = () => {
      const battle = bridge.battle;
      const first = order.find((id) => {
        return bridge.isPadOpen(id) && !(battle?.towers.some((t) => t.padId === id) ?? false);
      });
      if (first !== undefined) buttons.current.get(first)?.focus();
    };
    window.addEventListener(FOCUS_FIRST_PAD, focusFirst);
    return () => window.removeEventListener(FOCUS_FIRST_PAD, focusFirst);
  }, [bridge, order]);

  return (
    <div
      ref={layer}
      className="bf-pads"
      style={box === null ? { display: "none" } : { left: box.left, top: box.top, width: box.width, height: box.height }}
    >
      {order.map((id) => {
        const pad = bridge.config.pads.find((p) => p.id === id);
        if (pad === undefined) return null;
        const selected = bridge.selectedPad === id;
        return (
          <button
            key={id}
            ref={(el) => {
              if (el === null) buttons.current.delete(id);
              else buttons.current.set(id, el);
            }}
            type="button"
            className="bf-pad-btn"
            aria-label={padLabel(bridge.config, bridge.battle, id, bridge.isPadOpen(id))}
            aria-pressed={selected}
            data-armed={hud.armed !== null || undefined}
            style={{
              left: `${(tileToPx(pad.x) / CANVAS_WIDTH) * 100}%`,
              top: `${(tileToPx(pad.y) / CANVAS_HEIGHT) * 100}%`,
              width: `${(TILE_PX / CANVAS_WIDTH) * 100}%`,
              height: `${(TILE_PX / CANVAS_HEIGHT) * 100}%`,
            }}
            onFocus={() => bridge.focusPad(id)}
            onBlur={() => bridge.focusPad(null)}
            onClick={() => bridge.selectPad(selected && bridge.armed === null ? null : id)}
            onKeyDown={(e) => {
              const direction = ARROWS[e.key];
              if (direction === undefined) return;
              e.preventDefault();
              const next = padInDirection(bridge.config, id, direction);
              if (next !== null) buttons.current.get(next)?.focus();
            }}
          />
        );
      })}
    </div>
  );
}
