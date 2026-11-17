import { describe, expect, it } from "vitest";
import { aimChoices, nearestProgress, padInDirection, padLabel, padOrder } from "./padNav";
import { bridgeWith, everyClassConfig } from "./testing";

const config = everyClassConfig();

describe("pads for the keyboard (Phase 31, D5.2)", () => {
  it("finds the route point nearest a point: the route's own points map to themselves", () => {
    const length = config.route.length;
    for (const progress of [0, Math.floor(length / 3), length]) {
      const s = config.route.segments.find((seg) => progress >= seg.start && progress <= seg.end);
      if (s === undefined) throw new Error("no segment");
      const along = progress - s.start;
      expect(nearestProgress(config.route, s.x0 + along * s.dx, s.y0 + along * s.dy)).toBe(progress);
    }
  });

  it("orders every pad by route progress, once each", () => {
    const order = padOrder(config);
    expect(new Set(order).size).toBe(config.pads.length);
    const at = (id: string) => {
      const p = config.pads.find((pad) => pad.id === id);
      return p === undefined ? 0 : nearestProgress(config.route, p.cx, p.cy);
    };
    for (let i = 1; i < order.length; i += 1) expect(at(order[i] ?? "")).toBeGreaterThanOrEqual(at(order[i - 1] ?? ""));
  });

  it("arrows go to the nearest pad in a 90-degree cone, and nowhere past the edge", () => {
    for (const pad of config.pads) {
      for (const direction of ["left", "right", "up", "down"] as const) {
        const next = padInDirection(config, pad.id, direction);
        if (next === null) continue;
        const to = config.pads.find((p) => p.id === next);
        if (to === undefined) throw new Error("unknown pad");
        const dx = to.x - pad.x;
        const dy = to.y - pad.y;
        const forward = { left: -dx, right: dx, up: -dy, down: dy }[direction];
        const sideways = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
        expect(forward, `${pad.id} ${direction} -> ${next}`).toBeGreaterThan(0);
        expect(forward).toBeGreaterThanOrEqual(sideways);
      }
    }
    const leftmost = [...config.pads].sort((a, b) => a.x - b.x)[0];
    if (leftmost === undefined) throw new Error("no pads");
    const further = config.pads.filter((p) => p.x < leftmost.x);
    expect(further).toEqual([]);
    expect(padInDirection(config, leftmost.id, "left")).toBeNull();
  });

  it("names a pad as D5.2 says: what is on it, its level and its aim", () => {
    const bridge = bridgeWith(1000);
    bridge.place("p04", "nova");
    bridge.place("p05", "mira");
    expect(padLabel(bridge.config, bridge.battle, "p04")).toBe("Pad 4, Nova level 1, aiming at the front");
    expect(padLabel(bridge.config, bridge.battle, "p05")).toBe("Pad 5, Mira level 1"); // Mira does not aim
    expect(padLabel(bridge.config, bridge.battle, "p02")).toBe("Pad 2, empty");
  });

  it("offers only the modes open at the level (C5.3: Orion's STRONG from level 3)", () => {
    expect(aimChoices(config, "orion", 1)).toEqual(["FRONT"]);
    expect(aimChoices(config, "orion", 3)).toEqual(["FRONT", "STRONG"]);
    expect(aimChoices(config, "mira", 3)).toEqual([]);
  });
});
