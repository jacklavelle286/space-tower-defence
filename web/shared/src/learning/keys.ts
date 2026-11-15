// Arrow-key movement for the choice answer areas (D6.3), as one pure function so every layout is tested the same way.
// Arrows move and select (the radio pattern); options already tried are skipped (D6.2, D-8).
//
// - "ring" (multiple choice, picture select): any arrow moves to the next or previous option, wrapping round.
// - "line" (number track): Left/Up one back, Right/Down one on; stops at the ends, so End is never "one more".
// - "grid" (hundred square, rows of `columns`): Left/Right one step, Up/Down one row; stops at the edges.
// Home and End go to the first and last option that can still be chosen, in every layout.

export type ChoiceLayout = { readonly kind: "ring" } | { readonly kind: "line" } | { readonly kind: "grid"; readonly columns: number };

const BACK = new Set(["ArrowLeft", "ArrowUp"]);
const FORWARD = new Set(["ArrowRight", "ArrowDown"]);

/** Whether the key is one this module handles (so the caller can stop the page scrolling). */
export function isMoveKey(key: string): boolean {
  return BACK.has(key) || FORWARD.has(key) || key === "Home" || key === "End";
}

/**
 * The value to select after `key`, or null to stay where it is.
 * `values` are in screen order; `current` is the selected value (or null when nothing is selected yet).
 */
export function moveChoice(key: string, values: readonly string[], blocked: ReadonlySet<string>, current: string | null, layout: ChoiceLayout): string | null {
  const free = (i: number) => {
    const v = values[i];
    return v !== undefined && !blocked.has(v);
  };
  const first = values.findIndex((_, i) => free(i));
  if (first === -1) return null;
  let last = values.length - 1;
  while (!free(last)) last -= 1;

  if (key === "Home") return values[first] ?? null;
  if (key === "End") return values[last] ?? null;
  const back = BACK.has(key);
  if (!back && !FORWARD.has(key)) return null;

  const at = current === null ? -1 : values.indexOf(current);
  if (at === -1) return values[back ? last : first] ?? null;

  if (layout.kind === "ring") {
    for (let step = 1; step <= values.length; step += 1) {
      const i = (at + (back ? -step : step) + values.length * 2) % values.length;
      if (free(i)) return values[i] ?? null;
    }
    return null;
  }

  const vertical = key === "ArrowUp" || key === "ArrowDown";
  const stride = layout.kind === "grid" && vertical ? layout.columns : 1;
  for (let i = at + (back ? -stride : stride); i >= 0 && i < values.length; i += back ? -stride : stride) {
    if (free(i)) return values[i] ?? null;
  }
  return null;
}
