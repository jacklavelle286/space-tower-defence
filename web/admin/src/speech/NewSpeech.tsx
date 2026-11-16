import { useState } from "react";
import { SPEECH_KINDS, type AdminApi, type SpeechKind } from "../api";
import { KIND_INFO, planNewSpeech, type TakenSpeech } from "./ids";
import { speechError } from "./messages";

// "New speech" (Phase 40): pick the kind, type the word, sound, letter or sentence, press Create. The ID and title are
// made from what was typed (ids.ts) and shown before Create; admin-api fills the first draft for a sound, letter or
// word from what the owner already heard, so most new speech goes straight to Preview.
//
// Create waits for the speech list (`taken`): without it a taken ID cannot be seen, and admin-api's create is
// idempotent, so it would answer with the speech that exists. As a second guard, when a body was sent and the draft
// that comes back holds other words, the ID was taken: the page opens it as existing speech, never as "Created".

type Props = {
  readonly api: AdminApi;
  /** Speech that exists, speechId to title; null until the speech list has loaded. */
  readonly taken: TakenSpeech | null;
  /** Called with the speechId to open, and whether it was made now (false: it existed already). */
  readonly onOpen: (speechId: string, created: boolean) => void;
};

export function NewSpeech({ api, taken, onOpen }: Props) {
  const [kind, setKind] = useState<SpeechKind>("WORD");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const info = KIND_INFO[kind];
  const ready = taken !== null;
  const plan = planNewSpeech(kind, typed, taken ?? new Map<string, string>());
  const sentence = kind === "INSTRUCTION" || kind === "DICTATION";

  const submit = async () => {
    if (!plan.ok || !ready) return;
    if (plan.exists) {
      onOpen(plan.speechId, false);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const view = await api.createSpeech({
        speechId: plan.speechId,
        title: plan.title,
        kind,
        ...(plan.text === undefined ? {} : { text: plan.text }),
      });
      setTyped("");
      const sent = plan.text;
      const made = sent === undefined || (view.draft.text ?? "").normalize("NFC") === sent.normalize("NFC");
      onOpen(view.header.speechId, made);
    } catch (error) {
      setMessage(speechError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="new"
      aria-labelledby="new-speech-heading"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h3 id="new-speech-heading">New speech</h3>
      <label>
        Kind{" "}
        <select value={kind} onChange={(e) => setKind(e.target.value as SpeechKind)}>
          {SPEECH_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_INFO[k].label}
            </option>
          ))}
        </select>
      </label>
      <label>
        {info.ask}{" "}
        {sentence ? (
          <textarea value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={info.placeholder} rows={2} />
        ) : (
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={info.placeholder} autoComplete="off" />
        )}
      </label>
      <p className="muted" aria-live="polite">
        {!ready ? (
          "Create waits for the speech list to load."
        ) : typed.trim() === "" ? null : plan.ok ? (
            plan.exists ? (
              <>
                <span className="mono">{plan.speechId}</span> exists already: Open shows it.
              </>
            ) : (
              <>
                Saved as <span className="mono">{plan.speechId}</span>
              </>
            )
        ) : (
          plan.reason
        )}
      </p>
      <button type="submit" disabled={busy || !ready || !plan.ok}>
        {plan.ok && plan.exists ? "Open" : "Create"}
      </button>
      {message !== null && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
