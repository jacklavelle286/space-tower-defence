// GameBridge's Phase 31 commands: a shop card then a pad places; aiming pauses the battle; the shop cards follow
// game-core's placement rules.
import { describe, expect, it } from "vitest";
import { AIM_STEP } from "../game/GameBridge";
import { bridgeWith } from "./testing";

const frame = 1000 / 60;

describe("GameBridge shop and aiming (Phase 31)", () => {
  it("a card then an open empty pad places it once; the card is put down", () => {
    const bridge = bridgeWith(500);
    bridge.arm("juno");
    expect(bridge.hud().armed).toBe("juno");
    bridge.selectPad("p04");
    expect(bridge.battle?.towers.map((t) => [t.padId, t.classId])).toEqual([["p04", "juno"]]);
    expect(bridge.armed).toBeNull();
    expect(bridge.selectedPad).toBeNull();
    bridge.arm("nova");
    bridge.selectPad("p04"); // occupied: selects it instead, and the card is put down
    expect(bridge.selectedPad).toBe("p04");
    expect(bridge.battle?.towers).toHaveLength(1);
  });

  it("shop cards say why a class cannot be placed: credits, cap", () => {
    const bridge = bridgeWith(430);
    bridge.place("p02", "mira");
    bridge.place("p04", "mira"); // 110 left; Mira's cap is 2
    const state = Object.fromEntries(bridge.hud().shop.map((c) => [c.classId, c.state]));
    expect(state).toEqual({ nova: "ok", pip: "ok", juno: "ok", orion: "credits", mira: "cap", sol: "credits" });
  });

  it("aiming a Comet Burst pauses the battle; the ring moves along the route and drops on the next tick", () => {
    const bridge = bridgeWith(500, { "comet-burst": 1 });
    bridge.place("p04", "nova");
    bridge.startWave();
    for (let i = 0; i < 300; i += 1) bridge.frame(frame); // let aliens come out
    bridge.startAim("comet-burst");
    expect(bridge.hud().aiming).toBe("comet-burst");
    const tick = bridge.battle?.tick;
    const start = bridge.aim?.target ?? 0;
    for (let i = 0; i < 60; i += 1) bridge.frame(frame);
    expect(bridge.battle?.tick).toBe(tick); // no ticks while aiming (C2.1)
    bridge.moveAim(2);
    expect(bridge.aim?.target).toBe(Math.min(bridge.config.route.length, start + 2 * AIM_STEP));
    bridge.moveAim(-1_000_000);
    expect(bridge.aim?.target).toBe(0); // kept on the route
    bridge.aimAt(start);
    bridge.dropAim();
    expect(bridge.aim).toBeNull();
    bridge.frame(frame);
    expect(bridge.hud().powers["comet-burst"]).toBe(0);
    expect(bridge.takeSceneEvents().some((e) => e.kind === "power")).toBe(true);
  });

  it("aiming outside a wave is refused, and cancelling spends nothing", () => {
    const bridge = bridgeWith(500, { "comet-burst": 1 });
    const reasons: string[] = [];
    bridge.on("commandRejected", (e) => reasons.push(e.reason));
    bridge.startAim("comet-burst");
    expect(bridge.aim).toBeNull();
    expect(reasons).toEqual(["NOT_NOW"]);
    bridge.place("p04", "nova");
    bridge.startWave();
    bridge.startAim("comet-burst");
    bridge.cancelAim();
    bridge.frame(frame);
    expect(bridge.hud().powers["comet-burst"]).toBe(1);
  });
});
