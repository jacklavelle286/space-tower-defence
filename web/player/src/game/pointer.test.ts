import { describe, expect, it } from "vitest";
import { pressedOnCanvas } from "./pointer";

describe("pressedOnCanvas", () => {
  const canvas = { tagName: "CANVAS" } as unknown as HTMLCanvasElement;
  const button = { tagName: "BUTTON" } as unknown as EventTarget;

  it("accepts a press aimed at the canvas", () => {
    expect(pressedOnCanvas({ event: { target: canvas } }, canvas)).toBe(true);
  });

  it("ignores a press on a DOM overlay (e.g. the learning panel's Continue) that Phaser saw through window", () => {
    expect(pressedOnCanvas({ event: { target: button } }, canvas)).toBe(false);
  });
});
