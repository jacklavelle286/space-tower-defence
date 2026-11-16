// A picture from the library, chosen by looking at it (D §D8.4 "pictures are picked from the asset manifest"). The
// field is a button that shows the chosen picture and its name; it opens a small panel with a search box and a grid of
// thumbnails, grouped by family. Click or Enter chooses; Escape closes and puts the cursor back on the button.
//
// The button's element ID is the field path (problems.ts fieldId) and the visible label names it, so a validation
// problem can move the cursor here and tests and screen readers find it by its label.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { pictureFamilies, pictureLabel, pictureName, pictureUrl } from "./assets";
import { fieldId } from "./problems";

type Props = {
  readonly path: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (assetId: string) => void;
  /** Offer "no picture" as a choice. */
  readonly optional?: boolean;
};

export function PicturePicker({ path, label, value, onChange, optional = false }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = fieldId(path);
  const dialogId = `${useId()}-pictures`;
  const url = value === "" ? null : pictureUrl(value);

  const close = (refocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (refocus) trigger.current?.focus();
  };
  const choose = (assetId: string) => {
    onChange(assetId);
    close(true);
  };

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (event: MouseEvent) => {
      if (root.current !== null && !root.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  const families = pictureFamilies(query);
  const first = families[0]?.ids[0];

  /** Escape closes; arrows, Home and End move between the thumbnails (Tab works too). */
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    const choices = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button.picture-choice")];
    const at = choices.indexOf(document.activeElement as HTMLButtonElement);
    const step: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let next: number | null = null;
    if (event.key in step) next = at === -1 ? (event.key === "ArrowDown" ? 0 : null) : at + (step[event.key] ?? 0);
    if (event.key === "Home" && at !== -1) next = 0;
    if (event.key === "End" && at !== -1) next = choices.length - 1;
    if (next === null) return;
    event.preventDefault();
    choices[Math.max(0, Math.min(choices.length - 1, next))]?.focus();
  };

  const current = value === "" ? (optional ? "No picture" : "Choose a picture…") : url === null ? `${value} (not in the library)` : pictureName(value);

  return (
    <span
      className="picture-picker"
      ref={root}
      onBlur={(e) => {
        // Tab out of the panel closes it (a click elsewhere is the mousedown listener's job).
        if (open && e.relatedTarget !== null && !e.currentTarget.contains(e.relatedTarget)) close(false);
      }}
    >
      <span className="field">
        <label htmlFor={id}>{label}</label>
        <button
          id={id}
          ref={trigger}
          type="button"
          className="picture-button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? dialogId : undefined}
          aria-describedby={`${id}-current`}
          onClick={() => (open ? close(false) : setOpen(true))}
        >
          {url !== null ? <img className="thumb" src={url} alt="" width={40} height={40} /> : <span className="thumb empty" aria-hidden="true" />}
          <span id={`${id}-current`} className={url === null && value !== "" ? "error" : undefined}>
            {current}
          </span>
        </button>
      </span>
      {open && (
        <div id={dialogId} className="picture-dialog" role="dialog" aria-label={`Choose: ${label}`} onKeyDown={keys}>
          <input
            ref={search}
            type="search"
            aria-label="Search pictures"
            placeholder="Search pictures"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && first !== undefined && query.trim() !== "") {
                e.preventDefault();
                choose(first);
              }
            }}
          />
          <div className="picture-scroll">
            {optional && (
              <button type="button" className="picture-choice picture-none" aria-pressed={value === ""} onClick={() => choose("")}>
                <span className="thumb empty" aria-hidden="true" />
                <span>No picture</span>
              </button>
            )}
            {families.map((family) => (
              <section key={family.label} aria-label={family.label}>
                <h4>{family.label}</h4>
                <div className="picture-grid">
                  {family.ids.map((assetId) => (
                    <button
                      key={assetId}
                      type="button"
                      className="picture-choice"
                      aria-pressed={assetId === value}
                      aria-label={pictureLabel(assetId)}
                      title={assetId}
                      onClick={() => choose(assetId)}
                    >
                      <img src={pictureUrl(assetId) ?? ""} alt="" width={64} height={64} loading="lazy" />
                      <span>{pictureName(assetId)}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {families.length === 0 && <p className="muted">No picture matches “{query.trim()}”.</p>}
          </div>
        </div>
      )}
    </span>
  );
}
