// The picture kind menu (Gate P2, ADR-0031 as amended): what a picture is for. The kinds, their order and their labels
// come from contracts/limits.json (`picture.kinds`) through @scd/shared, so the menu, admin-api and picture-gen agree.
// Two groups: "Use in activities" (the kinds the activity picture picker offers) and "For later (not used in the game
// yet)" (kept for the avatar library and the makers). Draw with Claude has no default (the operator must choose);
// Upload and the library filter pass a first option of their own.
import { ACTIVITY_PICTURE_KINDS, isPictureKind, LATER_PICTURE_KINDS, type PictureKindId } from "@scd/shared";

export const ACTIVITY_GROUP_LABEL = "Use in activities";
export const LATER_GROUP_LABEL = "For later (not used in the game yet)";

type Props = {
  readonly id: string;
  /** "" while nothing is chosen (or for the `first` option). */
  readonly value: PictureKindId | "";
  readonly onChange: (kind: PictureKindId | "") => void;
  /** An option before the groups, with the value "": "Choose a kind…", "Every kind". Left out, a kind must be chosen. */
  readonly first?: string;
  readonly disabled?: boolean;
  readonly describedBy?: string;
};

export function KindSelect({ id, value, onChange, first, disabled = false, describedBy }: Props) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      aria-describedby={describedBy}
      onChange={(e) => onChange(isPictureKind(e.target.value) ? e.target.value : "")}
    >
      {first !== undefined && <option value="">{first}</option>}
      <optgroup label={ACTIVITY_GROUP_LABEL}>
        {ACTIVITY_PICTURE_KINDS.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label}
          </option>
        ))}
      </optgroup>
      <optgroup label={LATER_GROUP_LABEL}>
        {LATER_PICTURE_KINDS.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
