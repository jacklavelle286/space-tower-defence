// Preview and solve (D §D8.4, C22.3): the SAVED draft, shown in the child's own learning panel (the same
// LearningPanel component the player's run screen uses, from @scd/shared/learning), answered as a child would. Check
// is judged here against the draft's accepted answers, as the run screen judges after the server has saved a try;
// nothing is sent to the server. A right answer on this draft revision is what Publish needs
// (`review.previewSolvedDraftRevision`, which admin-api checks again).
//
// Play: the prompt clip and the "Read it to me" instruction clip are rendered through the admin speech preview route
// (G R20), from the speech definition's saved text, so the operator hears the clip while solving. [ASSUMPTION] The
// preview route renders the definition's current saved draft, which equals its approved version unless someone has
// edited the speech since approving it; the publish checklist line "I listened to every clip" stays the operator's own
// declaration.
import { LearningPanel, toPanelActivity, type PanelActivity, type PanelAttempt, type PanelAudio, type PanelStatus } from "@scd/shared/learning";
import { LIMITS } from "@scd/shared";
import { useMemo, useRef, useState } from "react";
import type { AdminApi, Definition } from "../api";
import { previewBody } from "../review";
import { pictureUrl } from "./assets";

/** Plays a URL; the default uses an audio element. Tests pass their own. */
export type PlayUrl = (url: string) => Promise<void>;

const playWithAudioElement: PlayUrl = async (url) => {
  const audio = new Audio(url);
  await audio.play();
  await new Promise<void>((resolve, reject) => {
    audio.addEventListener("ended", () => resolve(), { once: true });
    audio.addEventListener("error", () => reject(new Error("audio")), { once: true });
  });
};

/** The panel's view of a draft, or null when the panel cannot show it (validation then says why). */
export function previewActivity(definition: Definition): PanelActivity | null {
  const refs = definition.speechDefinitionReferences ?? {};
  return toPanelActivity(
    {
      ...definition,
      slotId: "preview",
      audioRequired: definition.audioRequirement === "REQUIRED" && refs["prompt"] !== undefined,
      reward: { credits: 0 },
    },
    pictureUrl,
  );
}

function usePreviewClip(api: AdminApi, speechId: string | null, play: PlayUrl): PanelAudio | null {
  const [state, setState] = useState<PanelAudio["state"]>("idle");
  const busy = useRef(false);
  if (speechId === null) return null;
  const press = () => {
    if (busy.current) return;
    busy.current = true;
    setState("loading");
    void (async () => {
      try {
        const view = await api.getSpeech(speechId);
        const clip = await api.preview({ kind: view.draft.kind, speechId, ...previewBody(view.draft) });
        setState("playing");
        await play(clip.url);
        setState("played");
      } catch {
        setState("failed");
      } finally {
        busy.current = false;
      }
    })();
  };
  return { state, availability: "ready", press, retry: press };
}

type Props = {
  readonly api: AdminApi;
  readonly definition: Definition;
  readonly draftRevision: number;
  /** Called once when the operator answers right on this revision. */
  readonly onSolved: (draftRevision: number) => void;
  readonly solved: boolean;
  readonly play?: PlayUrl;
};

export function PreviewSolve({ api, definition, draftRevision, onSolved, solved, play = playWithAudioElement }: Props) {
  const activity = useMemo(() => previewActivity(definition), [definition]);
  const [attempts, setAttempts] = useState<PanelAttempt[]>([]);
  const [round, setRound] = useState(0);
  const refs = definition.speechDefinitionReferences ?? {};
  const audio = usePreviewClip(api, refs["prompt"]?.speechId ?? null, play);
  const readToMe = usePreviewClip(api, refs["instruction"]?.speechId ?? null, play);

  if (activity === null) {
    return <p className="error">The child's panel cannot show this draft yet. Validate it to see what is missing.</p>;
  }
  const status: PanelStatus = attempts.some((a) => a.correct)
    ? "SUCCEEDED"
    : attempts.length >= LIMITS.attemptsPerSlot
      ? "FAILED"
      : "UNRESOLVED";
  const again = () => {
    setAttempts([]);
    setRound((r) => r + 1);
  };
  return (
    <div className="preview">
      <p className="muted">
        Answer it as a child would. {solved ? `Solved on revision ${draftRevision}.` : "Publishing needs a right answer on this revision."}{" "}
        <button type="button" onClick={again}>
          Start the preview again
        </button>
      </p>
      <div className="preview-stage">
        <LearningPanel
          key={`${draftRevision}-${round}`}
          activity={activity}
          attempts={attempts}
          status={status}
          audio={audio}
          readToMe={readToMe}
          onCheck={async (answer) => {
            const correct = activity.accepted.includes(answer);
            setAttempts((list) => [...list, { answer, correct }]);
            if (correct) onSolved(draftRevision);
            return { kind: "recorded" };
          }}
          onContinue={again}
        />
      </div>
    </div>
  );
}
