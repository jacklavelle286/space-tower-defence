// The combat sounds (Phase 66; D10.10): the 25 recipes, and when the board plays one.
import { describe, expect, it } from "vitest";
import { loadSettings, SoundBoard, type AudioLike } from "./board";
import { classSound, lengthOf, RECIPES, SOUND_IDS } from "./recipes";

/** Records what would sound; time moves only when the test says. */
function fakeContext() {
  const started: string[] = [];
  const param = () => ({ setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined });
  const node = (type: string) => ({ type, frequency: param(), gain: param(), connect: () => undefined, start: () => started.push(type), stop: () => undefined, buffer: null });
  const ctx = {
    currentTime: 0,
    destination: {},
    sampleRate: 8000,
    state: "running",
    resume: async () => undefined,
    createOscillator: () => node("osc"),
    createGain: () => node("gain"),
    createBiquadFilter: () => node("filter"),
    createBufferSource: () => node("noise"),
    createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
  };
  return { ctx: ctx as unknown as AudioLike & { currentTime: number }, started };
}

describe("recipes", () => {
  it("has the 25 sounds of D10.10, each under a second", () => {
    expect(SOUND_IDS).toHaveLength(25);
    for (const id of SOUND_IDS) {
      expect(RECIPES[id].length, id).toBeGreaterThan(0);
      expect(lengthOf(id), id).toBeLessThan(1);
      for (const v of RECIPES[id]) expect(v.gain, id).toBeLessThanOrEqual(0.4);
    }
  });

  it("each class's attack has its sound", () => {
    for (const c of ["nova", "pip", "juno", "orion", "mira", "sol"]) expect(classSound(c)).toBe(`sfx-${c}`);
    expect(classSound("boss1")).toBeNull();
  });
});

describe("SoundBoard", () => {
  it("is silent until a key or tap unlocks it, and when muted", () => {
    const { ctx, started } = fakeContext();
    const board = new SoundBoard(() => ctx, { volume: 0.5, muted: false });
    expect(board.play("sfx-place")).toBe(false);
    board.unlock();
    expect(board.play("sfx-place")).toBe(true);
    expect(started.length).toBeGreaterThan(0);
    board.set({ volume: 0.5, muted: true });
    ctx.currentTime = 5;
    expect(board.play("sfx-place")).toBe(false);
  });

  it("drops a sound played again within its own length (16 astronauts never make a din)", () => {
    const { ctx } = fakeContext();
    const board = new SoundBoard(() => ctx, { volume: 1, muted: false });
    board.unlock();
    expect(board.play("sfx-nova")).toBe(true);
    expect(board.play("sfx-nova")).toBe(false);
    expect(board.play("sfx-pip")).toBe(true); // another sound is not held back
    ctx.currentTime = lengthOf("sfx-nova");
    expect(board.play("sfx-nova")).toBe(true);
  });

  it("keeps its settings on this computer, and ignores a broken stored value", () => {
    expect(loadSettings({ getItem: () => JSON.stringify({ volume: 0.3, muted: true }) })).toEqual({ volume: 0.3, muted: true });
    expect(loadSettings({ getItem: () => "{nope" })).toEqual({ volume: 0.6, muted: false });
    expect(loadSettings({ getItem: () => JSON.stringify({ volume: 7 }) }).volume).toBe(0.6);
  });
});
