import { describe, expect, it } from "vitest";
import { keyAction, type KeyContext, type KeyPress } from "./battlefieldKeys";

const press = (key: string, extra: Partial<KeyPress> = {}): KeyPress => ({
  key,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  isComposing: false,
  ...extra,
});
const ctx = (extra: Partial<KeyContext> = {}): KeyContext => ({
  focusTag: "BODY",
  focusEditable: false,
  modalOpen: false,
  initials: { n: "nova", p: "pip", j: "juno", o: "orion", m: "mira", s: "sol" },
  aiming: false,
  battle: "PREP",
  ...extra,
});

describe("the battlefield key map (Phase 31, D5.1-D5.2)", () => {
  it("letters choose astronauts by initial, in either case", () => {
    expect(keyAction(press("j"), ctx())).toEqual({ kind: "arm", classId: "juno" });
    expect(keyAction(press("S"), ctx())).toEqual({ kind: "arm", classId: "sol" });
    expect(keyAction(press("q"), ctx())).toBeNull();
  });

  it("the D5.2 actions, each only when it makes sense", () => {
    expect(keyAction(press("u"), ctx())).toEqual({ kind: "upgrade" });
    expect(keyAction(press("x"), ctx())).toEqual({ kind: "sendHome" });
    expect(keyAction(press("t"), ctx())).toEqual({ kind: "cycleAim" });
    expect(keyAction(press("r"), ctx())).toEqual({ kind: "ready" });
    expect(keyAction(press("r"), ctx({ battle: "IN_WAVE" }))).toBeNull();
    expect(keyAction(press("f"), ctx({ battle: "IN_WAVE" }))).toEqual({ kind: "speed" });
    expect(keyAction(press("f"), ctx())).toBeNull();
    expect(keyAction(press("2"), ctx({ battle: "IN_WAVE" }))).toEqual({ kind: "power", key: "2" });
    expect(keyAction(press("2"), ctx())).toBeNull();
    expect(keyAction(press("?"), ctx())).toEqual({ kind: "keys" });
    expect(keyAction(press("Escape"), ctx())).toEqual({ kind: "escape" });
  });

  it("Space pauses only in a wave and only when no button has focus", () => {
    expect(keyAction(press(" "), ctx({ battle: "IN_WAVE" }))).toEqual({ kind: "pause" });
    expect(keyAction(press(" "), ctx({ battle: "IN_WAVE", focusTag: "BUTTON" }))).toBeNull();
    expect(keyAction(press(" "), ctx())).toBeNull();
  });

  it("while aiming, only the ring keys and Esc count", () => {
    const aiming = ctx({ battle: "IN_WAVE", aiming: true });
    expect(keyAction(press("ArrowLeft"), aiming)).toEqual({ kind: "moveAim", steps: -1 });
    expect(keyAction(press("ArrowRight"), aiming)).toEqual({ kind: "moveAim", steps: 1 });
    expect(keyAction(press("Enter"), aiming)).toEqual({ kind: "dropAim" });
    expect(keyAction(press("Escape"), aiming)).toEqual({ kind: "escape" });
    expect(keyAction(press("j"), aiming)).toBeNull();
  });

  it("never acts while typing, composing, with a modifier, in a dialog, or off the battlefield", () => {
    expect(keyAction(press("j"), ctx({ focusTag: "INPUT" }))).toBeNull();
    expect(keyAction(press("j"), ctx({ focusTag: "TEXTAREA" }))).toBeNull();
    expect(keyAction(press("j"), ctx({ focusEditable: true }))).toBeNull();
    expect(keyAction(press("j", { isComposing: true }), ctx())).toBeNull();
    expect(keyAction(press("r", { ctrlKey: true }), ctx())).toBeNull(); // Ctrl+R is the browser's reload
    expect(keyAction(press("f", { metaKey: true }), ctx({ battle: "IN_WAVE" }))).toBeNull();
    expect(keyAction(press("j"), ctx({ modalOpen: true }))).toBeNull();
    expect(keyAction(press("j"), ctx({ battle: "OTHER" }))).toBeNull();
  });
});
