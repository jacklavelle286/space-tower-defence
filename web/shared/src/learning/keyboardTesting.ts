// Test helper (never imported by app code): keyboard-only operation in jsdom, which has no Tab key behaviour of its
// own. `tab()` moves focus through the tabbable elements in document order, as a browser does; `press()` sends a key
// to the focused element and, for Enter or Space on a button, clicks it, as a browser does. So a test written with
// only these two can show that a control is reachable and operable without a mouse (D5, D6.3).
import { fireEvent } from "@testing-library/react";

const FOCUSABLE = "button, a[href], input, select, textarea, [tabindex]";

/** The elements Tab visits, in order: focusable, not disabled, tabIndex 0 or more. */
export function tabbables(root: ParentNode = document.body): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.tabIndex < 0) return false;
    if ((el as HTMLButtonElement).disabled) return false;
    return el.closest("[hidden], [inert]") === null;
  });
}

/** Tab (or Shift+Tab): focus the next (or previous) tabbable element, wrapping round. Returns it. */
export function tab(shift = false): HTMLElement {
  const list = tabbables();
  if (list.length === 0) throw new Error("nothing on the page can be reached with Tab");
  const at = list.indexOf(document.activeElement as HTMLElement);
  const next = at === -1 ? (shift ? list.length - 1 : 0) : (at + (shift ? -1 : 1) + list.length) % list.length;
  const element = list[next] as HTMLElement;
  element.focus();
  return element;
}

/** A key press on the focused element. Enter and Space activate a focused button, unless the key was handled. */
export function press(key: string): void {
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
  const notHandled = fireEvent.keyDown(target, { key });
  if (notHandled && (key === "Enter" || key === " ") && target instanceof HTMLButtonElement) fireEvent.click(target);
  fireEvent.keyUp(target, { key });
}
