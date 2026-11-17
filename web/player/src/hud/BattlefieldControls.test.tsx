// @vitest-environment jsdom
// The battlefield controls in the DOM (Phase 31): keys reach the bridge, dialogs stop the keys and pause the wave,
// and React commits only on the bridge's throttled events, never once per frame (the exit criterion's profiler
// check, as a test with React's Profiler).
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { useHud } from "../battlefield/useBridge";
import type { GameBridge } from "../game/GameBridge";
import { BattlefieldControls } from "./BattlefieldControls";
import { bridgeWith } from "./testing";

beforeAll(() => {
  // jsdom has no ResizeObserver; the pad layer only uses it to follow the canvas size.
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    disconnect(): void {}
    unobserve(): void {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

function Controls({ bridge }: { bridge: GameBridge }) {
  const hud = useHud(bridge);
  // The pad layer sits over the stage's canvas, as on the real page.
  return (
    <div className="bf-stage">
      <canvas />
      <BattlefieldControls bridge={bridge} hud={hud} active />
    </div>
  );
}

function tick(bridge: GameBridge, frames: number): void {
  act(() => {
    for (let i = 0; i < frames; i += 1) bridge.frame(1000 / 60);
  });
}

describe("BattlefieldControls", () => {
  it("J chooses Juno and focus jumps to the first open pad; Enter places it there", () => {
    const bridge = bridgeWith(500);
    render(<Controls bridge={bridge} />);
    act(() => void fireEvent.keyDown(document, { key: "j" }));
    expect(bridge.armed).toBe("juno");
    const focused = document.activeElement as HTMLElement;
    expect(focused.className).toBe("bf-pad-btn");
    expect(focused.getAttribute("aria-label")).toMatch(/^Pad \d+, empty$/);
    act(() => focused.click());
    expect(bridge.battle?.towers.map((t) => t.classId)).toEqual(["juno"]);
  });

  it("the shop shows role, price and why a card is dimmed; a card click arms it", () => {
    const bridge = bridgeWith(100);
    render(<Controls bridge={bridge} />);
    expect(screen.getByRole("button", { name: /Orion/ })).toHaveProperty("disabled", true);
    expect(screen.getByText("Need 70 more")).toBeTruthy(); // Orion costs 170
    expect(screen.getAllByText("Laser Scout").length).toBeGreaterThan(0);
    act(() => screen.getByRole("button", { name: /^Nova/ }).click());
    expect(bridge.armed).toBe("nova");
  });

  it("U upgrades, T changes aim, X asks first: Keep is focused and Esc keeps", () => {
    const bridge = bridgeWith(1000);
    bridge.place("p04", "nova");
    bridge.selectPad("p04");
    render(<Controls bridge={bridge} />);
    tick(bridge, 10);
    act(() => void fireEvent.keyDown(document, { key: "u" }));
    expect(bridge.battle?.towers[0]?.level).toBe(2);
    act(() => void fireEvent.keyDown(document, { key: "t" }));
    expect(bridge.battle?.towers[0]?.targeting).toBe("FAST");
    act(() => void fireEvent.keyDown(document, { key: "x" }));
    const dialog = screen.getByRole("dialog", { name: "Send home" });
    expect(document.activeElement?.textContent).toBe("Keep Nova");
    act(() => void fireEvent.keyDown(document, { key: "u" })); // shortcuts stand down while a dialog is open
    expect(bridge.battle?.towers[0]?.level).toBe(2);
    act(() => void fireEvent.keyDown(dialog, { key: "Escape" }));
    expect(screen.queryByRole("dialog", { name: "Send home" })).toBeNull();
    expect(bridge.battle?.towers).toHaveLength(1);
  });

  it("? opens the Keys card and pauses a wave; R starts the wave from preparation", () => {
    const bridge = bridgeWith(500);
    bridge.place("p04", "nova");
    render(<Controls bridge={bridge} />);
    act(() => void fireEvent.keyDown(document, { key: "r" }));
    expect(bridge.battle?.status).toBe("IN_WAVE");
    act(() => void fireEvent.keyDown(document, { key: "?" }));
    expect(screen.getByRole("dialog", { name: "Keys" })).toBeTruthy();
    expect(bridge.paused).toBe(true);
  });

  it("commits at most once per 100 ms of frames, however many frames run (no per-frame React work)", () => {
    const bridge = bridgeWith(500);
    bridge.place("p04", "nova");
    bridge.place("p05", "juno");
    let commits = 0;
    render(
      <Profiler id="controls" onRender={() => (commits += 1)}>
        <Controls bridge={bridge} />
      </Profiler>,
    );
    act(() => bridge.startWave());
    commits = 0;
    tick(bridge, 600); // ten seconds of frames at 60 Hz
    expect(commits).toBeGreaterThan(0);
    expect(commits).toBeLessThanOrEqual(100); // 10 per second at most, against 600 frames
  });
});
