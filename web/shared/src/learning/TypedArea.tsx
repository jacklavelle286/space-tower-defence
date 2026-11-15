// The answer area of TYPED (D6.3): an input box plus an on-screen keypad, digits for NUMERIC, a-z and apostrophe for
// WORD. Keyboard: type, Backspace, and Enter = Check (D5.3). Mouse or touch: press the keypad keys, then Check.
//
// - Spellcheck, autocorrect, autocomplete and autocapitalise are off, or the browser would give the spelling away (C20.1,
//   D6.3).
// - The keypad shows lower-case letters in the reading font: early readers learn lower case first, which is why typed
//   words are not used at age 5 at all (D-7: letter tiles, ArrangeArea, instead).
// - The keypad keys are not tab stops (typing is their keyboard equivalent) and do not take focus from the box, so a
//   press of Enter after a keypad key is still Check.
// - inputMode "none": a tablet shows the keypad here rather than its own keyboard, whose keys are capitals. [ASSUMPTION]
// What may be typed is filtered as it is typed (digits only; letters, apostrophes, spaces and hyphens); the
// canonicaliser still does the real normalising at Check.
import { useRef, type ChangeEvent, type KeyboardEvent } from "react";
import type { TypedFields } from "./activity";
import type { RawAnswer } from "./canonical";
import { PANEL_COPY as COPY } from "./copy";

export interface TypedAreaProps {
  readonly step: TypedFields;
  readonly labelledBy: string;
  readonly value: RawAnswer;
  readonly disabled: boolean;
  onChange(value: RawAnswer): void;
  /** Enter in the box presses Check. */
  onSubmit(): void;
}

const DIGIT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const LETTER_KEYS = [..."abcdefghijklmnopqrstuvwxyz", "'"];
const DIGITS = "0123456789";
/** Letters (either case), apostrophes and dashes of every kind the canonicaliser maps, space and hyphen. */
const WORD_ALLOWED = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' -‘’ʼ‐‑‒–—";

function allowed(mode: TypedFields["mode"], text: string, maxLength: number): string {
  const set = mode === "NUMERIC" ? DIGITS : WORD_ALLOWED;
  let out = "";
  for (const character of text) {
    if (set.includes(character)) out += character;
  }
  return out.slice(0, maxLength);
}

export function TypedArea({ step, labelledBy, value, disabled, onChange, onSubmit }: TypedAreaProps) {
  const input = useRef<HTMLInputElement>(null);
  const text = typeof value === "string" ? value : "";
  const keys = step.mode === "NUMERIC" ? DIGIT_KEYS : LETTER_KEYS;

  function set(next: string) {
    if (disabled) return;
    onChange(allowed(step.mode, next, step.maxLength));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className={step.mode === "NUMERIC" ? "lp-typed lp-typed-numeric" : "lp-typed lp-typed-word"}>
      <input
        ref={input}
        className="lp-reading lp-typed-input"
        type="text"
        aria-labelledby={labelledBy}
        value={text}
        maxLength={step.maxLength}
        size={Math.max(2, step.maxLength)}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        inputMode="none"
        enterKeyHint="done"
        readOnly={disabled}
        aria-disabled={disabled ? true : undefined}
        onChange={(e: ChangeEvent<HTMLInputElement>) => set(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="lp-keypad" role="group" aria-label={COPY.keypadLabel}>
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            className="lp-key lp-reading"
            tabIndex={-1}
            aria-disabled={disabled ? true : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              set(text + key);
              input.current?.focus();
            }}
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          className="lp-key lp-key-delete"
          tabIndex={-1}
          aria-label={COPY.deleteKey}
          aria-disabled={disabled ? true : undefined}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            set(text.slice(0, -1));
            input.current?.focus();
          }}
        >
          <span aria-hidden="true">⌫</span>
        </button>
      </div>
    </div>
  );
}
