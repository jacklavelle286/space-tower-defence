// The class summary shown over a shop card on hover and keyboard focus (Phase 28 review; classSummary.ts): title,
// one line, star ratings, level-1 facts, what each upgrade adds, the character line. The card's button points at it
// with aria-describedby, so a screen reader reads it as the button's description.
import { MAX_STARS, type ClassSummary } from "../battlefield/classSummary";

/** `align` keeps the summary on screen: "start" opens rightwards from the card, "end" leftwards (shop edges). */
export function ClassTip({ id, summary, align }: { id: string; summary: ClassSummary; align?: "start" | "end" }) {
  return (
    <div className={`bf-tip${align === undefined ? "" : ` bf-tip-${align}`}`} id={id} role="tooltip">
      <strong>{summary.title}</strong>
      <p>{summary.line}</p>
      <dl className="bf-tip-stars">
        {summary.ratings.map((r) => (
          <div key={r.label}>
            <dt>{r.label}</dt>
            <dd aria-label={`${r.stars} of ${MAX_STARS} stars`}>
              <span aria-hidden="true">
                <span className="bf-star-on">{"★".repeat(r.stars)}</span>
                <span className="bf-star-off">{"★".repeat(MAX_STARS - r.stars)}</span>
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <ul>
        {summary.facts.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <ul className="bf-tip-upgrades">
        {summary.upgrades.map((u) => (
          <li key={u}>{u}</li>
        ))}
      </ul>
      {summary.quote !== null && <p className="bf-tip-quote">"{summary.quote}"</p>}
    </div>
  );
}
