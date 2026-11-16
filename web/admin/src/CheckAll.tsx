// One tick for a whole checklist (owner's request, 2026-11-16): the checks are listed as plain text, and one box
// confirms them all. Ticking it sets every key, because the server's contract still names each check (admin-api's
// publish CHECKLIST; the speech approval checks of D §D9.4), and review.ts canPublish and canApprove read every key.
import { useId } from "react";
import { allTicked, tickAll, type ChecklistItem } from "./review";

type Props = {
  readonly items: readonly ChecklistItem[];
  readonly ticks: Readonly<Record<string, boolean>>;
  readonly onChange: (ticks: Record<string, boolean>) => void;
  readonly label: string;
  readonly disabled?: boolean;
};

export function CheckAll({ items, ticks, onChange, label, disabled = false }: Props) {
  const listId = useId();
  return (
    <div className="check-all-group">
      <ul className="checklist" id={listId}>
        {items.map((item) => (
          <li key={item.key}>{item.label}</li>
        ))}
      </ul>
      <label className="check-all">
        <input
          type="checkbox"
          checked={allTicked(items, ticks)}
          disabled={disabled}
          aria-describedby={listId}
          onChange={(e) => onChange(tickAll(items, e.target.checked))}
        />
        {label}
      </label>
    </div>
  );
}
