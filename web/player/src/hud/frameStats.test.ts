import { describe, expect, it } from "vitest";
import { frameStats } from "./frameStats";

describe("frameStats (Phase 34, AC-42)", () => {
  it("a steady 60 Hz run: 60 fps every way", () => {
    expect(frameStats(Array(600).fill(1000 / 60))).toEqual({
      frames: 600,
      seconds: 10,
      averageFps: 60,
      minimumFps: 60,
      onePercentLowFps: 60,
      slowestFrameMs: 16.7,
    });
  });

  it("the minimum is the slowest frame; the 1%-low averages the slowest 1%", () => {
    const deltas = [...Array(198).fill(1000 / 60), 50, 100]; // 200 frames: the slowest 1% is two frames
    const stats = frameStats(deltas);
    expect(stats?.minimumFps).toBe(10); // 100 ms
    expect(stats?.onePercentLowFps).toBe(13.3); // mean of 100 and 50 ms = 75 ms
    expect(stats?.slowestFrameMs).toBe(100);
  });

  it("nothing recorded, nothing to say; nonsense deltas are ignored", () => {
    expect(frameStats([])).toBeNull();
    expect(frameStats([0, -5, Number.NaN])).toBeNull();
  });
});
