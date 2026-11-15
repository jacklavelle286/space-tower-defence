// The birthday on P3 (D4), as three large pickers instead of three native selects (backlog B-5: on Chrome for Linux a
// native list opened with 28 px text closed again as soon as the text was clicked). Each part is a big button that
// shows what is chosen; pressing it opens a grid of big buttons in the page itself (no pop-up the browser places), and
// choosing one closes it. Made for tablets and ages 5-7 as well as grown-ups (D1 rule 8: 64 px targets).
//
// Keyboard: Tab to a part, Enter or Space opens it with focus on the chosen (or first) value; arrows move (Up/Down a
// row), Home/End; Enter or Space chooses; Esc closes without choosing. Focus then goes back to the part's button.
// Only one part is open at a time.
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import { COPY } from "../copy/en-GB";

export type BirthdayPart = "day" | "month" | "year";

export interface BirthdayValue {
  readonly day: number | null;
  readonly month: number | null;
  readonly year: number | null;
}

export interface BirthdayPickerHandle {
  /** Focus a part's button (the setup form moves focus to the first part that needs fixing). */
  focus(part: BirthdayPart): void;
}

interface Props {
  readonly value: BirthdayValue;
  readonly years: readonly number[];
  readonly invalid: boolean;
  readonly describedBy: string;
  onChange(value: BirthdayValue): void;
}

interface PartSpec {
  readonly part: BirthdayPart;
  readonly label: string;
  readonly columns: number;
  readonly options: readonly { readonly value: number; readonly text: string }[];
}

export const BirthdayPicker = forwardRef<BirthdayPickerHandle, Props>(function BirthdayPicker({ value, years, invalid, describedBy, onChange }, ref) {
  const ids = useId();
  const [open, setOpen] = useState<BirthdayPart | null>(null);
  const triggers = useRef(new Map<BirthdayPart, HTMLButtonElement>());
  const cells = useRef(new Map<number, HTMLButtonElement>());
  const grid = useRef<HTMLDivElement | null>(null);
  const [focusValue, setFocusValue] = useState<number | null>(null);

  useImperativeHandle(ref, () => ({ focus: (part) => triggers.current.get(part)?.focus() }), []);

  const parts: PartSpec[] = [
    { part: "day", label: COPY.setup.day, columns: 7, options: Array.from({ length: 31 }, (_, i) => ({ value: i + 1, text: `${i + 1}` })) },
    { part: "month", label: COPY.setup.month, columns: 3, options: COPY.months.map((m, i) => ({ value: i + 1, text: m })) },
    { part: "year", label: COPY.setup.year, columns: 4, options: years.map((y) => ({ value: y, text: `${y}` })) },
  ];
  const openSpec = parts.find((p) => p.part === open) ?? null;

  // When a grid opens (or the focused value moves), focus follows.
  useEffect(() => {
    if (open !== null && focusValue !== null) cells.current.get(focusValue)?.focus();
  }, [open, focusValue]);

  // An open grid can reach below the fold (the setup screen at 1024x768): scroll so all of it shows, without a jump
  // when it already fits. Focusing a cell alone only scrolls to that cell.
  useEffect(() => {
    if (open !== null) grid.current?.scrollIntoView?.({ block: "nearest" });
  }, [open]);

  function toggle(spec: PartSpec) {
    if (open === spec.part) {
      setOpen(null);
      return;
    }
    setOpen(spec.part);
    setFocusValue(value[spec.part] ?? spec.options[0]?.value ?? null);
  }

  function close(part: BirthdayPart) {
    setOpen(null);
    setFocusValue(null);
    triggers.current.get(part)?.focus();
  }

  function choose(spec: PartSpec, chosen: number) {
    onChange({ ...value, [spec.part]: chosen });
    close(spec.part);
  }

  function onGridKey(event: KeyboardEvent<HTMLDivElement>, spec: PartSpec) {
    const values = spec.options.map((o) => o.value);
    const at = focusValue === null ? 0 : Math.max(0, values.indexOf(focusValue));
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -spec.columns, ArrowDown: spec.columns };
    let next: number | null = null;
    if (event.key in steps) next = at + (steps[event.key] ?? 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = values.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      close(spec.part);
      return;
    } else return;
    event.preventDefault();
    const target = values[Math.min(values.length - 1, Math.max(0, next))];
    if (target !== undefined) setFocusValue(target);
  }

  return (
    <div className="dob">
      <div className="dob-parts">
        {parts.map((spec) => {
          const chosen = value[spec.part];
          const text = spec.options.find((o) => o.value === chosen)?.text ?? null;
          return (
            <button
              key={spec.part}
              type="button"
              className={text === null ? "dob-part is-empty" : "dob-part"}
              aria-label={COPY.setup.partValue(spec.label, text)}
              aria-expanded={open === spec.part}
              aria-controls={`${ids}-${spec.part}`}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              ref={(el) => {
                if (el) triggers.current.set(spec.part, el);
                else triggers.current.delete(spec.part);
              }}
              onClick={() => toggle(spec)}
            >
              <span>{text ?? spec.label}</span>
              <span aria-hidden="true" className="dob-arrow">
                {open === spec.part ? "▲" : "▼"}
              </span>
            </button>
          );
        })}
      </div>
      {openSpec !== null ? (
        <div
          id={`${ids}-${openSpec.part}`}
          ref={grid}
          className={`dob-grid dob-grid-${openSpec.part}`}
          role="group"
          aria-label={COPY.setup.choosePart(openSpec.label)}
          onKeyDown={(e) => onGridKey(e, openSpec)}
        >
          {openSpec.options.map((option) => {
            const selected = value[openSpec.part] === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={selected ? "dob-cell selected" : "dob-cell"}
                aria-pressed={selected}
                tabIndex={option.value === focusValue ? 0 : -1}
                ref={(el) => {
                  if (el) cells.current.set(option.value, el);
                  else cells.current.delete(option.value);
                }}
                onClick={() => choose(openSpec, option.value)}
              >
                {option.text}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});
