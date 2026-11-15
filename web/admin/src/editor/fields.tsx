// Small labelled inputs for the editor. Each input's element ID is its field path (problems.ts fieldId), so a
// validation problem can move the cursor to it, and each has a visible label, so tests and screen readers find it
// by name.
import type { ReactNode } from "react";
import { PICTURE_IDS, pictureLabel, pictureUrl } from "./assets";
import { fieldId } from "./problems";

type TextProps = {
  readonly path: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly maxLength?: number;
  readonly wide?: boolean;
  readonly hint?: string;
  readonly disabled?: boolean;
};

export function TextField({ path, label, value, onChange, maxLength, wide = false, hint, disabled = false }: TextProps) {
  return (
    <span className="field">
      <label htmlFor={fieldId(path)}>{label}</label>
      <input
        id={fieldId(path)}
        className={wide ? "wide" : undefined}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        aria-describedby={hint === undefined ? undefined : `${fieldId(path)}-hint`}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint !== undefined && (
        <small className="muted" id={`${fieldId(path)}-hint`}>
          {hint}
        </small>
      )}
    </span>
  );
}

type NumberProps = {
  readonly path: string;
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min: number;
  readonly max: number;
};

export function NumberField({ path, label, value, onChange, min, max }: NumberProps) {
  return (
    <span className="field">
      <label htmlFor={fieldId(path)}>{label}</label>
      <input
        id={fieldId(path)}
        type="number"
        className="short"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number.parseInt(e.target.value, 10))}
      />
    </span>
  );
}

type SelectProps = {
  readonly path: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly (string | { readonly value: string; readonly label: string })[];
  readonly disabled?: boolean;
  readonly hint?: string;
};

export function SelectField({ path, label, value, onChange, options, disabled = false, hint }: SelectProps) {
  return (
    <span className="field">
      <label htmlFor={fieldId(path)}>{label}</label>
      <select
        id={fieldId(path)}
        value={value}
        disabled={disabled}
        aria-describedby={hint === undefined ? undefined : `${fieldId(path)}-hint`}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => {
          const item = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          );
        })}
      </select>
      {hint !== undefined && (
        <small className="muted" id={`${fieldId(path)}-hint`}>
          {hint}
        </small>
      )}
    </span>
  );
}

type PictureProps = {
  readonly path: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (assetId: string) => void;
  /** Offer "no picture" as a choice. */
  readonly optional?: boolean;
};

/** A picture from the library: a list of picture names and a thumbnail of the one chosen. */
export function PicturePicker({ path, label, value, onChange, optional = false }: PictureProps) {
  const url = value === "" ? null : pictureUrl(value);
  return (
    <span className="picture-picker">
      <span className="field">
        <label htmlFor={fieldId(path)}>{label}</label>
        <select id={fieldId(path)} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{optional ? "No picture" : "Choose a picture…"}</option>
          {value !== "" && url === null && <option value={value}>{value} (not in the library)</option>}
          {PICTURE_IDS.map((id) => (
            <option key={id} value={id}>
              {pictureLabel(id)}
            </option>
          ))}
        </select>
      </span>
      {url !== null && <img className="thumb" src={url} alt="" width={56} height={56} />}
    </span>
  );
}

/** A row of fields that belong together (one option, one zone, one tile). */
export function Row({ children, label }: { readonly children: ReactNode; readonly label: string }) {
  return (
    <div className="row" role="group" aria-label={label}>
      {children}
    </div>
  );
}
