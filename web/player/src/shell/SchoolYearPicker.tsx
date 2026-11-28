import { LIMITS } from "@scd/shared";

/**
 * YG1 (owner 2026-11-28): the school year as a row of big buttons, Reception to Year 5. Radio buttons underneath, so a
 * keyboard moves with the arrow keys and a screen reader hears "Year 2, 3 of 6" (D1 rule 8: 64 px targets).
 */
export function SchoolYearPicker({
  name,
  value,
  onChange,
  invalid = false,
  describedBy,
}: {
  name: string;
  value: number | null;
  onChange: (year: number) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div className="year-grid" role="radiogroup" aria-invalid={invalid} aria-describedby={describedBy}>
      {LIMITS.schoolYears.names.map((label, year) => (
        <label key={label} className={`year-option${year === value ? " selected" : ""}`}>
          <input type="radio" name={name} value={year} checked={year === value} onChange={() => onChange(year)} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}
