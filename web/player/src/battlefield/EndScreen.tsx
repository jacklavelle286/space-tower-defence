// Completion (P10 for a challenge) and defeat (P11) overlays, with the screen art (D3 J6, J7).
import { COPY } from "../copy/en-GB";

export function EndScreen({
  hud,
  onAction,
  actionLabel,
}: {
  hud: { readonly runStatus: string; readonly highestCompletedWave: number };
  onAction: () => void;
  actionLabel: string;
}) {
  const won = hud.runStatus === "COMPLETED";
  const title = won ? COPY.run.complete : hud.runStatus === "DEFEATED" ? COPY.run.defeat : COPY.run.ended;
  return (
    <div className="bf-overlay">
      <div className="bf-card bf-end" role="dialog" aria-label={title}>
        <img src={won ? "/assets/ui/complete-illustration.png" : "/assets/ui/defeat-illustration.png"} alt="" width={256} height={256} />
        <h2>{title}</h2>
        <p>{COPY.run.wavesCleared(hud.highestCompletedWave)}</p>
        <button type="button" className="bf-big" onClick={onAction} autoFocus>
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
