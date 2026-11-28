import { LIMITS, type ProfileInput } from "@scd/shared";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { COPY } from "../copy/en-GB";
import { SchoolYearPicker } from "./SchoolYearPicker";
import { useOnline } from "./useOnline";

const NICKNAME = new RegExp(LIMITS.nickname.pattern);

/** The nickname as the server will store it: trimmed, 1-20 letters, digits, spaces or hyphens (G R3). */
export function validNickname(raw: string): string | null {
  const name = raw.trim();
  if (name.length < LIMITS.nickname.minLength || name.length > LIMITS.nickname.maxLength) return null;
  return NICKNAME.test(name) ? name : null;
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
 * P3 Profile setup (D4): name, one of the twelve avatars, and the school year (YG1, owner 2026-11-28: the school year
 * picks the questions; no date of birth is asked for). Needs a connection (spine S7.4).
 */
export function ProfileSetup({ save }: { save: (input: ProfileInput) => Promise<boolean> }) {
  const online = useOnline();
  const ids = useId();
  const [nickname, setNickname] = useState("");
  const [avatarId, setAvatarId] = useState<string>(LIMITS.avatarIds[0]);
  const [schoolYear, setSchoolYear] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const yearGroup = useRef<HTMLFieldSetElement>(null);

  const name = validNickname(nickname);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    // Move to the first field with a problem, so the child (or grown-up) sees what to fix.
    if (name === null) nameInput.current?.focus();
    else if (schoolYear === null) yearGroup.current?.querySelector("input")?.focus();
    if (name === null || schoolYear === null || !online || saving) return;
    setSaving(true);
    setFailed(false);
    const ok = await save({ nickname: name, avatarId, schoolYear });
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
          <fieldset className="field" ref={yearGroup}>
            <legend className="field-label">{COPY.setup.schoolYearLabel}</legend>
            <SchoolYearPicker
              name={`${ids}-year`}
              value={schoolYear}
              invalid={touched && schoolYear === null}
              describedBy={`${ids}-year-hint`}
              onChange={setSchoolYear}
            />
            <Hint
              id={`${ids}-year-hint`}
              problem={touched && schoolYear === null ? COPY.setup.schoolYearInvalid : null}
              hint={COPY.setup.schoolYearHint}
            />
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
