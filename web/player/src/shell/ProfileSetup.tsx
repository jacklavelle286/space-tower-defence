import { LIMITS, type ProfileInput } from "@scd/shared";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { COPY } from "../copy/en-GB";
import { BirthdayPicker, type BirthdayPickerHandle, type BirthdayValue } from "./BirthdayPicker";
import { useOnline } from "./useOnline";

const NICKNAME = new RegExp(LIMITS.nickname.pattern);

/** The nickname as the server will store it: trimmed, 1-20 letters, digits, spaces or hyphens (G R3). */
export function validNickname(raw: string): string | null {
  const name = raw.trim();
  if (name.length < LIMITS.nickname.minLength || name.length > LIMITS.nickname.maxLength) return null;
  return NICKNAME.test(name) ? name : null;
}

/** `YYYY-MM-DD` for a real calendar date not after `today`, else null (G R3: real date, not in the future). */
export function dobString(year: number, month: number, day: number, today: Date): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (date.getTime() > todayUtc) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** A field's hint, or its problem: the problem gets the warning icon, the error style and an alert (D1 rule 7: never
 * colour alone). */
function Hint({ id, problem, hint }: { id?: string; problem: string | null; hint: ReactNode }) {
  if (problem === null) {
    return (
      <span id={id} className="field-hint">
        {hint}
      </span>
    );
  }
  return (
    <span id={id} className="field-hint field-error" role="alert">
      <img src="/assets/ui/icon-sync-warning.svg" alt="" width={24} height={24} />
      {problem}
    </span>
  );
}

/**
 * P3 Profile setup (D4): name, one of the twelve avatars, and the birthday as three big pickers (day, month name, year
 * from the last ten years; BirthdayPicker, backlog B-5). The birthday goes to the server once and is never shown again or kept in the browser (spine S2:
 * write-only). Needs a connection (spine S7.4).
 */
export function ProfileSetup({ save, today: fixedToday }: { save: (input: ProfileInput) => Promise<boolean>; today?: Date }) {
  const [now] = useState(() => new Date());
  const today = fixedToday ?? now;
  const online = useOnline();
  const ids = useId();
  const [nickname, setNickname] = useState("");
  const [avatarId, setAvatarId] = useState<string>(LIMITS.avatarIds[0]);
  const [birthday, setBirthday] = useState<BirthdayValue>({ day: null, month: null, year: null });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const picker = useRef<BirthdayPickerHandle>(null);

  const name = validNickname(nickname);
  const { day, month, year } = birthday;
  const dob = day !== null && month !== null && year !== null ? dobString(year, month, day, today) : null;
  const years = Array.from({ length: 11 }, (_, i) => today.getFullYear() - i);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    // Move to the first field with a problem, so the child (or grown-up) sees what to fix.
    if (name === null) nameInput.current?.focus();
    else if (dob === null) picker.current?.focus(month === null && day !== null ? "month" : year === null && day !== null && month !== null ? "year" : "day");
    if (name === null || dob === null || !online || saving) return;
    setSaving(true);
    setFailed(false);
    const ok = await save({ nickname: name, avatarId, dob });
    // On success the shell moves to Home and this form unmounts.
    if (!ok) {
      setSaving(false);
      setFailed(true);
    }
  }

  return (
    <main className="screen setup">
      <form className="panel setup-panel" onSubmit={submit} noValidate>
        <h1>{COPY.setup.heading}</h1>

        <label className="field" htmlFor={`${ids}-name`}>
          <span className="field-label">{COPY.setup.nameLabel}</span>
          <input
            id={`${ids}-name`}
            ref={nameInput}
            className="text-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={LIMITS.nickname.maxLength}
            value={nickname}
            aria-describedby={`${ids}-name-hint`}
            aria-invalid={touched && name === null}
            onChange={(e) => setNickname(e.target.value)}
          />
          <Hint id={`${ids}-name-hint`} problem={touched && name === null ? COPY.setup.nameInvalid : null} hint={COPY.setup.nameHint} />
        </label>

        <fieldset className="field">
          <legend className="field-label">{COPY.setup.pictureLabel}</legend>
          <div className="avatar-grid">
            {LIMITS.avatarIds.map((id) => (
              <label key={id} className={`avatar-option${id === avatarId ? " selected" : ""}`}>
                <input
                  type="radio"
                  name={`${ids}-avatar`}
                  value={id}
                  checked={id === avatarId}
                  onChange={() => setAvatarId(id)}
                />
                <img src={`/assets/ui/${id}.png`} alt={COPY.avatars[id] ?? id} width={80} height={80} />
                {id === avatarId ? <img className="avatar-tick" src="/assets/ui/icon-tick.svg" alt="" /> : null}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="setup-bottom">
          <fieldset className="field">
            <legend className="field-label">{COPY.setup.birthdayLabel}</legend>
            <BirthdayPicker
              ref={picker}
              value={birthday}
              years={years}
              invalid={touched && dob === null}
              describedBy={`${ids}-dob-hint`}
              onChange={setBirthday}
            />
            <Hint id={`${ids}-dob-hint`} problem={touched && dob === null ? COPY.setup.birthdayInvalid : null} hint={COPY.setup.birthdayHint} />
          </fieldset>
          <button type="submit" className="btn btn-big btn-go" disabled={!online || saving}>
            {saving ? COPY.setup.saving : COPY.setup.done}
          </button>
        </div>

        {failed ? (
          <p className="notice" role="alert">
            {COPY.setup.failed}
          </p>
        ) : null}
        {online ? null : <p className="reason">{COPY.offline}</p>}
      </form>
    </main>
  );
}
