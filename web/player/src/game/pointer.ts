// Phaser listens for presses on window as well as on its canvas, and hit-tests a press that landed on a DOM element
// drawn over the canvas (the learning panel, the end screen, a dialog) as if it were on the battlefield. A pad press
// counts only when the browser aimed the event at the canvas itself.

/** True when the DOM event behind a Phaser pointer was aimed at the game canvas, not at a DOM element over it. */
export function pressedOnCanvas(pointer: { event?: { target: EventTarget | null } | null }, canvas: HTMLCanvasElement): boolean {
  const target = pointer.event?.target ?? null;
  return target === null || target === canvas;
}
