// One message carried across a page change, such as "Activity ph-0102 deleted." after a delete sends the operator back
// to the list. In memory only: the app is one page (hash routes). The next page reads it while rendering (peekFlash,
// which has no side effect, so React may call it twice in StrictMode) and clears it once mounted (clearFlash). A
// refresh loses it, which is fine: the list itself shows the activity is no longer there.

let pending: string | null = null;

export function setFlash(message: string): void {
  pending = message;
}

/** The waiting message, or null. Reading it does not clear it. */
export function peekFlash(): string | null {
  return pending;
}

export function clearFlash(): void {
  pending = null;
}
