// The battlefield's keyboard map (Phase 31, D5.1-D5.2) as a pure function: which action a key press asks for, given
// what is on screen. useBattlefieldKeys runs it on document keydown and carries the action out. Keeping the decision
// pure keeps the rules testable: a key is ignored while typing, composing, with Ctrl/Alt/Meta, or while any dialog or
// the learning panel is open, so shortcuts never interfere with an answer (prompt.md:273).
export type KeyAction =
  | { readonly kind: "arm"; readonly classId: string }
  | { readonly kind: "escape" }
  | { readonly kind: "upgrade" }
  | { readonly kind: "sendHome" }
  | { readonly kind: "cycleAim" }
  | { readonly kind: "power"; readonly key: string }
  | { readonly kind: "moveAim"; readonly steps: number }
  | { readonly kind: "dropAim" }
  | { readonly kind: "pause" }
  | { readonly kind: "speed" }
  | { readonly kind: "ready" }
  | { readonly kind: "keys" };

export interface KeyPress {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly isComposing: boolean;
}

export interface KeyContext {
  /** The focused element's tag (upper case) and whether it is editable. */
  readonly focusTag: string | null;
  readonly focusEditable: boolean;
  /** A modal dialog or the learning panel is open. */
  readonly modalOpen: boolean;
  /** Class ID by its name's initial, lower case (n -> nova), for the wave set's classes. */
  readonly initials: Readonly<Record<string, string>>;
  /** A Comet Burst is being aimed. */
  readonly aiming: boolean;
  /** The battle's state: preparing a wave, fighting, or neither. */
  readonly battle: "PREP" | "IN_WAVE" | "OTHER";
}

export function keyAction(press: KeyPress, ctx: KeyContext): KeyAction | null {
  if (press.isComposing || press.ctrlKey || press.altKey || press.metaKey || ctx.modalOpen) return null;
  if (ctx.focusEditable || ctx.focusTag === "INPUT" || ctx.focusTag === "TEXTAREA" || ctx.focusTag === "SELECT") return null;
  if (ctx.battle === "OTHER") return null;
  const key = press.key;
  if (ctx.aiming) {
    // While aiming only the ring keys count (and Esc to put it away).
    if (key === "ArrowLeft") return { kind: "moveAim", steps: -1 };
    if (key === "ArrowRight") return { kind: "moveAim", steps: 1 };
    if (key === "Enter") return { kind: "dropAim" };
    if (key === "Escape") return { kind: "escape" };
    return null;
  }
  if (key === "Escape") return { kind: "escape" };
  if (key === "?") return { kind: "keys" };
  if (key === "1" || key === "2" || key === "3") return ctx.battle === "IN_WAVE" ? { kind: "power", key } : null;
  // Space pauses only when no button has focus: a focused button keeps Space for pressing itself (D5.2).
  if (key === " ") return ctx.battle === "IN_WAVE" && ctx.focusTag !== "BUTTON" ? { kind: "pause" } : null;
  const lower = key.length === 1 ? key.toLowerCase() : "";
  if (lower === "u") return { kind: "upgrade" };
  if (lower === "x") return { kind: "sendHome" };
  if (lower === "t") return { kind: "cycleAim" };
  if (lower === "f") return ctx.battle === "IN_WAVE" ? { kind: "speed" } : null;
  if (lower === "r") return ctx.battle === "PREP" ? { kind: "ready" } : null;
  const classId = ctx.initials[lower];
  return classId !== undefined ? { kind: "arm", classId } : null;
}
