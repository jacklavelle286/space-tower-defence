// Placeholder for the learning activity between waves (Phase 14). The real panel, with its six interaction types,
// greyed tries and Play button, is Phase 22 (M1-22). Continue answers the slot correctly through the reducer, so
// the run moves on exactly as it will after a correct answer: the reward is added and the next wave is prepared.
import { useEffect, useRef } from "react";
import type { LocalRun } from "../game/localRun";

/** The one accepted answer of every placeholder slot (allowed by the answer pattern, contracts common.schema.json). */
export const PLACEHOLDER_ANSWER = "continue";

export function ActivityPlaceholder({ run, afterWave }: { run: LocalRun; afterWave: number }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  const slot = run.state.slots.find((s) => s.slotId === `N-${String(afterWave).padStart(3, "0")}`);
  return (
    <div className="bf-overlay">
      <div className="bf-card" role="dialog" aria-label="Learning activity">
        <img src="/assets/ui/nova-card.png" alt="" width={120} />
        <h2>Wave {afterWave} cleared!</h2>
        <p>Learning time. The real activity comes here soon.</p>
        {slot !== undefined && <p>A right answer earns {slot.reward.credits} credits.</p>}
        <button type="button" ref={button} className="bf-big" onClick={() => run.submitAttempt(PLACEHOLDER_ANSWER)}>
          Continue
        </button>
      </div>
    </div>
  );
}
