// Keeping Tab inside an open dialog (Phase 68; D5.1): Tab from the last focusable control goes to the first, and
// Shift+Tab from the first (or from the dialog's own heading) to the last, so a keyboard never reaches the page behind
// an aria-modal dialog. Used as the dialog's onKeyDown.
import type { KeyboardEvent } from "react";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The controls Tab can reach inside `root`, in document order (hidden ones left out). */
export function tabbable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest("[hidden]") && el.getAttribute("aria-hidden") !== "true");
}

/** onKeyDown for a dialog: wraps Tab round its own controls. */
export function trapTab(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Tab") return;
  const root = event.currentTarget;
  const list = tabbable(root);
  const first = list[0];
  const last = list[list.length - 1];
  if (first === undefined || last === undefined) {
    event.preventDefault();
    return;
  }
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && root.contains(active) && list.includes(active);
  if (event.shiftKey && (!inside || active === first)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (!inside || active === last)) {
    event.preventDefault();
    first.focus();
  }
}
