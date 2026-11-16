// The tick every approval needs (D10: activity pictures have no text). admin-api refuses an approval without it
// (`not_text_free`), so the buttons that approve stay off until it is ticked.
import { useId } from "react";

export const TEXT_FREE_LABEL = "No letters, numbers or words in this picture";

export function TextFreeTick({ checked, onChange }: { readonly checked: boolean; readonly onChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <p className="row">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{TEXT_FREE_LABEL}</label>
    </p>
  );
}
