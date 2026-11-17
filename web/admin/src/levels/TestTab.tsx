import { CHECK_TEXT, type CellState, type WaveSetReport } from "@scd/game-core";
import { useEffect, useRef, useState } from "react";
import type { LevelFile, LevelReview } from "../api";
import { PreviewPanel } from "./preview/PreviewPanel";
import {
  ownedWaveSets,
  runChecks,
  type CheckRun,
  type CheckWorker,
} from "./checkRun";

// The Test tab (Gate M, LD5; scope-level-designer.md §3.1 step 10, §4 option A): Run checks plays the C17.1 test players
// on the saved draft in Web Workers and shows, for each wave set, a verdict, the findings and a table of how each player
// ended each wave. Two findings block publishing (the minimal player clears waves 1-5; the competent player with no
// learning success clears the set); the rest warn. The run is recorded on the draft revision (R45), which the publisher
// (LD6) asks for. Budget [PROPOSAL, LD0]: 120 s for a campaign, 15 s for a challenge; past it the tab says it is slow,
// it does not give up.

type Props = {
  readonly level: LevelFile;
  /** True while there are unsaved edits: the checks run on the saved draft only. */
  readonly dirty: boolean;
  /** Blocking design or parse problems: there is nothing sensible to play yet. */
  readonly blocked: boolean;
  readonly draftRevision: number;
  readonly review: LevelReview | undefined;
  readonly onRecord: (counts: {
    blocking: number;
    warnings: number;
  }) => Promise<void>;
  readonly makeWorker?: () => CheckWorker;
};

const CELL: Record<CellState, string> = {
  clear: "Clear",
  leaked: "Leaked",
  lost: "Lost",
  "not reached": "—",
};
const pct = (learn: number) => `${Math.round(learn * 100)}%`;

function Report({ report }: { report: WaveSetReport }) {
  return (
    <section
      className="check-report"
      aria-labelledby={`check-${report.waveSetId}`}
    >
      <h3 id={`check-${report.waveSetId}`}>{report.waveSetId}</h3>
      <p>{report.verdict}</p>
      {report.findings.length > 0 && (
        <ul>
          {report.findings.map((f, i) => (
            <li
              key={i}
              className={f.severity === "block" ? "error" : "warning"}
            >
              {f.severity === "block" ? "Blocks publishing: " : "Warning: "}
              {f.wave !== undefined ? `wave ${f.wave}: ` : ""}
              {CHECK_TEXT[f.rule]}
            </li>
          ))}
        </ul>
      )}
      {report.naive.length > 0 && (
        <p className="muted">
          Young first-time player, waves cleared (fewest / middle / most):{" "}
          {report.naive
            .map(
              (n) => `${pct(n.learn)} learning ${n.min}/${n.median}/${n.max}`,
            )
            .join("; ")}
          .
        </p>
      )}
      <table className="check-table">
        <caption className="visually-hidden">
          How each test player ended each wave of {report.waveSetId}
        </caption>
        <thead>
          <tr>
            <th scope="col">Wave</th>
            <th scope="col">Seconds</th>
            {report.columns.map((c) => (
              <th key={c.label} scope="col">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: report.finalWave }, (_, w) => (
            <tr key={w}>
              <th scope="row">{w + 1}</th>
              <td>{report.seconds[w] ?? "—"}</td>
              {report.columns.map((c) => {
                const state = c.cells[w] ?? "not reached";
                const health = c.health[w];
                return (
                  <td
                    key={c.label}
                    className={`cell-${state.replace(" ", "-")}`}
                  >
                    {CELL[state]}
                    {health !== null &&
                    health !== undefined &&
                    state !== "clear"
                      ? ` (${health})`
                      : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function TestTab({
  level,
  dirty,
  blocked,
  draftRevision,
  review,
  onRecord,
  makeWorker,
}: Props) {
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [reports, setReports] = useState<WaveSetReport[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const run = useRef<CheckRun | null>(null);
  useEffect(() => () => run.current?.cancel(), []);
  const sets = ownedWaveSets(level);

  const start = () => {
    setReports(null);
    setMessage(null);
    setSlow(false);
    const budget = (sets.includes("campaign") ? 120 : 15) * 1000;
    const timer = window.setTimeout(() => setSlow(true), budget);
    let current: CheckRun;
    try {
      current = runChecks(
        level,
        (done, total) => setProgress({ done, total }),
        makeWorker,
      );
    } catch (error) {
      window.clearTimeout(timer);
      setMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    run.current = current;
    setProgress({ done: 0, total: 1 });
    current.done.then(
      async (result) => {
        window.clearTimeout(timer);
        run.current = null;
        setProgress(null);
        setReports(result);
        const findings = result.flatMap((r) => r.findings);
        const blocking = findings.filter((f) => f.severity === "block").length;
        try {
          await onRecord({ blocking, warnings: findings.length - blocking });
        } catch {
          setMessage(
            "The checks ran, but the result could not be recorded (the draft may have been saved meanwhile). Run them again.",
          );
        }
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        run.current = null;
        setProgress(null);
        setMessage(
          `The checks stopped: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    );
  };

  const cancel = () => {
    run.current?.cancel();
    run.current = null;
    setProgress(null);
    setMessage("Checks cancelled.");
  };

  const tested = review?.testPlayedDraftRevision === draftRevision;
  return (
    <div className="test-tab">
      {sets.length === 0 ? (
        <p>
          This level has no wave sets yet: add a challenge (Wave sets tab) to
          test it.
        </p>
      ) : (
        <p>
          <button
            type="button"
            onClick={start}
            disabled={progress !== null || dirty || blocked}
          >
            Run checks
          </button>{" "}
          {progress !== null && (
            <>
              <progress
                max={progress.total}
                value={progress.done}
                aria-label="Checks run"
              />{" "}
              {progress.done} of {progress.total} runs{" "}
              <button type="button" onClick={cancel}>
                Cancel
              </button>
            </>
          )}
          {dirty && (
            <span className="muted">
              {" "}
              Save first: the checks play the saved draft.
            </span>
          )}
          {blocked && !dirty && (
            <span className="muted">
              {" "}
              Fix the problems that block publishing first.
            </span>
          )}
        </p>
      )}
      <div role="status" aria-live="polite">
        {slow && progress !== null && (
          <p className="warning">
            This is taking longer than usual. It is still running.
          </p>
        )}
        {message !== null && <p>{message}</p>}
        {review?.testPlayedDraftRevision !== undefined && (
          <p className="muted">
            Last checked: draft revision {review.testPlayedDraftRevision}
            {tested
              ? " (this one)"
              : " (an older one: run again before publishing)"}
            , {review.blocking ?? 0} blocking, {review.warnings ?? 0} warnings.
          </p>
        )}
      </div>
      {reports?.map((r) => (
        <Report key={r.waveSetId} report={r} />
      ))}
      <PreviewPanel level={level} blocked={blocked} />
    </div>
  );
}
