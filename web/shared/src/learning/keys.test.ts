// Arrow-key movement for the choice answer areas (D6.3): ring (text and picture choices), line (number track) and
// grid (hundred square), always skipping choices already tried.
import { describe, expect, it } from "vitest";
import { isMoveKey, moveChoice, type ChoiceLayout } from "./keys";

const RING: ChoiceLayout = { kind: "ring" };
const LINE: ChoiceLayout = { kind: "line" };
const GRID: ChoiceLayout = { kind: "grid", columns: 3 };
const ABCD = ["a", "b", "c", "d"];
const NONE = new Set<string>();
const NINE = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]; // 3 x 3

describe("moveChoice", () => {
  it("ring: every arrow moves one on or back and wraps round", () => {
    expect(moveChoice("ArrowRight", ABCD, NONE, "d", RING)).toBe("a");
    expect(moveChoice("ArrowDown", ABCD, NONE, "a", RING)).toBe("b");
    expect(moveChoice("ArrowLeft", ABCD, NONE, "a", RING)).toBe("d");
    expect(moveChoice("ArrowUp", ABCD, NONE, "c", RING)).toBe("b");
  });

  it("nothing selected: forward keys start at the first free choice, back keys at the last", () => {
    expect(moveChoice("ArrowRight", ABCD, new Set(["a"]), null, RING)).toBe("b");
    expect(moveChoice("ArrowLeft", ABCD, new Set(["d"]), null, LINE)).toBe("c");
  });

  it("skips tried choices; with everything tried there is nowhere to go", () => {
    expect(moveChoice("ArrowRight", ABCD, new Set(["b", "c"]), "a", RING)).toBe("d");
    expect(moveChoice("ArrowRight", ABCD, new Set(ABCD), null, RING)).toBeNull();
    expect(moveChoice("Home", ABCD, new Set(ABCD), null, RING)).toBeNull();
  });

  it("line: stops at the ends instead of wrapping", () => {
    expect(moveChoice("ArrowRight", ABCD, NONE, "d", LINE)).toBeNull();
    expect(moveChoice("ArrowLeft", ABCD, NONE, "a", LINE)).toBeNull();
    expect(moveChoice("ArrowUp", ABCD, NONE, "c", LINE)).toBe("b");
    expect(moveChoice("ArrowRight", ABCD, new Set(["d"]), "c", LINE)).toBeNull();
  });

  it("grid: Up/Down one row, Left/Right one step across rows, stopping at the edges", () => {
    expect(moveChoice("ArrowDown", NINE, NONE, "2", GRID)).toBe("5");
    expect(moveChoice("ArrowUp", NINE, NONE, "5", GRID)).toBe("2");
    expect(moveChoice("ArrowUp", NINE, NONE, "2", GRID)).toBeNull();
    expect(moveChoice("ArrowDown", NINE, NONE, "8", GRID)).toBeNull();
    expect(moveChoice("ArrowRight", NINE, NONE, "3", GRID)).toBe("4");
    expect(moveChoice("ArrowDown", NINE, new Set(["5"]), "2", GRID)).toBe("8");
    expect(moveChoice("ArrowDown", NINE, new Set(["5", "8"]), "2", GRID)).toBeNull();
  });

  it("Home and End: the first and last free choice in every layout", () => {
    for (const layout of [RING, LINE, GRID]) {
      expect(moveChoice("Home", NINE, new Set(["1"]), "5", layout)).toBe("2");
      expect(moveChoice("End", NINE, new Set(["9", "8"]), "5", layout)).toBe("7");
    }
  });

  it("other keys are not moves", () => {
    expect(moveChoice("Enter", ABCD, NONE, "a", RING)).toBeNull();
    expect(isMoveKey("Tab")).toBe(false);
    expect(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].every(isMoveKey)).toBe(true);
  });
});
