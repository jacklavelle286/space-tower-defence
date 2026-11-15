// DEVELOPMENT ONLY: the learning panel for each interaction type on one page, with no sign-in, run or server
// (Phase 37 "local preview" [ASSUMPTION]). Served by `npm run dev -w player` at /panel-preview.html; that page is not
// a build input, so this never reaches dist/. Check records the try at once and judges it against the accepted
// answers, as the run screen would after the save. `?type=picture|track|grid|choice|share|sort|letters|graphemes|order|
// number|word|two-step` opens one directly (Phase 38 added the last eight).
import { LearningPanel, toPanelActivity, type PanelActivity, type PanelAttempt, type PanelStatus } from "@scd/shared/learning";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../global.css";
import { activityAssetUrl } from "../run/activityAssets";
import { DEV_ACTIVITIES, PHASE38_ACTIVITIES } from "./fakeRunServer";

const NAMES = ["picture", "track", "grid", "choice", "share", "sort", "letters", "graphemes", "order", "number", "word", "two-step"] as const;

const ACTIVITIES: PanelActivity[] = [...DEV_ACTIVITIES, ...PHASE38_ACTIVITIES].flatMap(({ activity }, i) => {
  const shown = toPanelActivity(
    { ...activity, slotId: `N-0${i + 10}`, audioRequired: false, reward: { credits: 30 } },
    activityAssetUrl,
  );
  return shown === null ? [] : [shown];
});

function Preview() {
  const asked = new URL(window.location.href).searchParams.get("type");
  const [index, setIndex] = useState(Math.max(0, NAMES.indexOf(asked as (typeof NAMES)[number])));
  const [attempts, setAttempts] = useState<PanelAttempt[]>([]);
  const [round, setRound] = useState(0);
  const activity = ACTIVITIES[index];
  if (activity === undefined) return <p style={{ color: "white" }}>No preview activities.</p>;
  const status: PanelStatus = attempts.some((a) => a.correct) ? "SUCCEEDED" : attempts.length >= 3 ? "FAILED" : "UNRESOLVED";
  const open = (i: number) => {
    setIndex(i);
    setAttempts([]);
    setRound((r) => r + 1);
  };
  return (
    <>
      <nav style={{ display: "flex", gap: 8, padding: 8 }}>
        {ACTIVITIES.map((a, i) => (
          <button key={a.slotId} type="button" aria-pressed={i === index} onClick={() => open(i)}>
            {NAMES[i] ?? a.interactionType}
          </button>
        ))}
      </nav>
      <div style={{ position: "relative", height: "calc(100vh - 48px)" }}>
        <LearningPanel
          key={`${activity.slotId}-${round}`}
          activity={activity}
          attempts={attempts}
          status={status}
          onCheck={async (answer) => {
            setAttempts((list) => [...list, { answer, correct: activity.accepted.includes(answer) }]);
            return { kind: "recorded" };
          }}
          onContinue={() => open(index)}
        />
      </div>
    </>
  );
}

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <Preview />
    </StrictMode>,
  );
