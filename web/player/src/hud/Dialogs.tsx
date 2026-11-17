// The battlefield's dialogs (Phase 31, D5.4): focus trapped inside, the safe choice focused first, Esc is the safe
// choice, the destructive button never the default. aria-modal marks them, so useBattlefieldKeys stands down while one
// is open. Opening one during a wave pauses the battle (C2.1); it stays paused until Resume.
import { useEffect, useRef, type ReactNode } from "react";

function Modal({ label, onEscape, children }: { label: string; onEscape: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  return (
    <div className="bf-overlay bf-modal-backdrop">
      <div
        ref={box}
        className="bf-card bf-modal"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onEscape();
            return;
          }
          if (e.key !== "Tab") return;
          // Keep Tab inside the dialog.
          const focusable = [...(box.current?.querySelectorAll<HTMLElement>("button") ?? [])];
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (first === undefined || last === undefined) return;
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** "Send Nova home? You get 35 back." Keep it (focused, Esc) / Send home (D5.2 X, D4 panel). */
export function SendHomeDialog({ name, refund, onKeep, onSend }: { name: string; refund: number; onKeep: () => void; onSend: () => void }) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => keep.current?.focus(), []);
  return (
    <Modal label="Send home" onEscape={onKeep}>
      <p>
        Send {name} home? You get {refund} back.
      </p>
      <div className="bf-modal-buttons">
        <button ref={keep} type="button" className="bf-big" onClick={onKeep}>
          Keep {name}
        </button>
        <button type="button" className="bf-small" onClick={onSend}>
          Send home
        </button>
      </div>
    </Modal>
  );
}

const KEYS: readonly (readonly [string, string])[] = [
  ["N P J O M S", "Choose Nova, Pip, Juno, Orion, Mira or Sol"],
  ["Arrow keys", "Move between pads"],
  ["Enter or Space", "Place, or choose the astronaut on a pad"],
  ["U", "Upgrade the chosen astronaut"],
  ["X", "Send the chosen astronaut home"],
  ["T", "Change where it aims"],
  ["1 2 3", "Frost Pulse, Comet Burst, Colony Shield"],
  ["← → then Enter", "Move the Comet Burst ring, then drop it"],
  ["R", "Ready: start the wave"],
  ["Space", "Pause or resume (when no button is chosen)"],
  ["F", "Speed 1x or 2x"],
  ["Esc", "Put down a card, cancel aiming, or close"],
  ["?", "This list"],
];

/** The Keys reference card (D5.1 "Keys", key ?): every shortcut, not a tutorial. */
export function KeysDialog({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  return (
    <Modal label="Keys" onEscape={onClose}>
      <h2>Keys</h2>
      <table className="bf-keys">
        <tbody>
          {KEYS.map(([keys, what]) => (
            <tr key={keys}>
              <th scope="row">
                <kbd>{keys}</kbd>
              </th>
              <td>{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button ref={close} type="button" className="bf-big" onClick={onClose}>
        Close
      </button>
    </Modal>
  );
}
