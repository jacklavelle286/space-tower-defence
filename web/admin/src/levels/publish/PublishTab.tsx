// The Publish tab (Gate M, LD7; scope-level-designer.md §3.1 steps 11-12): what publishing this level changes
// against live, the checklist (automatic ticks from the editor, the Test tab and the server's Validate; hand ticks
// for what only a person can judge), then Send to testers (a preview version, never in current.json) or Publish
// (live for new games). A publish runs in the publisher for about a minute: R49 queues it and this tab follows the
// level's publish item (R42) until it is done or refused. Every check is repeated by the server; the ticks here only
// say why a button is off.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  describeError,
  HAND_TICKS,
  type AdminApi,
  type HandTick,
  type LevelFile,
  type LevelPublish,
  type LevelReview,
  type LevelValidation,
  type LevelVersion,
  type LevelView,
  type PublishRefusal,
} from "../../api";
import { ConfirmDialog } from "../../ConfirmDialog";
import { hrefOf } from "../../routes";
import { liveBase } from "../levelFile";
import { diffText, levelDiff } from "./diff";

const POLL_MS = 3000;
const POLL_LIMIT = 300; // 15 minutes: past the publisher's timeout

/** What a publisher refusal means for the operator (codes from api/shared/gd_publish.py and gamedata_admin.py). */
export function refusalText(refusal: PublishRefusal): string {
  switch (refusal.code) {
    case "STALE_SOURCE":
      return "The live game changed after these checks ran. Run the checks again, then publish.";
    case "NOT_TEST_PLAYED":
      return "Run the checks on this saved draft (Test tab) with no red results first.";
    case "CHECKS_FAILED":
      return "The publisher's checks found a problem: a design rule or a blocking balance check. See the Test tab.";
    case "PICTURES":
      return "A picture is not approved, is the wrong kind, or the backdrop is too big.";
    case "BANK_NOT_READY":
      return "There are not enough activities for a new wave set at some age. See Bank status.";
    case "FROZEN":
      return "Publishing is switched off (the game data is frozen).";
    case "DRAFT_CONFLICT":
      return "The draft changed since. Reload and try again.";
    case "LIVE_MOVED":
      return "The live version changed meanwhile. Look at Versions and try again.";
    case "BUSY":
      return "The publisher was busy. Try again.";
    case "NEEDS_CAMPAIGN":
      return "A new planet's first version must come from a level that holds its 50-wave campaign.";
    case "NOT_RELEASED":
      return "This planet is not released yet. Release it on the Planets page.";
    case "NOT_READY":
      return "The planet's newest version does not have its full 50-wave campaign yet.";
    default:
      return `The publisher refused (${refusal.code}): ${refusal.message}`;
  }
}

function refusalOf(error: unknown): PublishRefusal | null {
  if (!(error instanceof ApiError) || error.code !== "PUBLISH_REFUSED") return null;
  const code = error.info["code"];
  const message = error.info["message"];
  return { code: typeof code === "string" ? code : "UNKNOWN", message: typeof message === "string" ? message : "" };
}

type Props = {
  readonly api: Pick<AdminApi, "validateLevel" | "publishLevel" | "getLevel">;
  readonly levelId: string;
  /** The saved draft (Publish never uses unsaved edits). */
  readonly level: LevelFile;
  readonly draftRevision: number;
  readonly review: LevelReview | undefined;
  readonly dirty: boolean;
  /** Hard design problems in the editor. */
  readonly blocked: boolean;
  /** The live version the editor checks against, or null when it could not be loaded. */
  readonly baseVersion: string | null;
  /** Whether the level's planet is released (LD10): an unreleased planet's versions are previews until its release. */
  readonly released?: boolean;
  readonly publish: LevelPublish | null;
  readonly versions: readonly LevelVersion[];
  /** A fresh level view (after a poll); `wentLive` when a publish just moved the live version. */
  readonly onView: (view: LevelView, wentLive: boolean) => void;
};

export function PublishTab({ api, levelId, level, draftRevision, review, dirty, blocked, baseVersion, released = true, publish, versions, onView }: Props) {
  const [validation, setValidation] = useState<{ revision: number; result: LevelValidation } | null>(null);
  const [ticks, setTicks] = useState<Record<HandTick, boolean>>(() => Object.fromEntries(HAND_TICKS.map(([k]) => [k, false])) as Record<HandTick, boolean>);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmLive, setConfirmLive] = useState(false);
  const polls = useRef(0);

  const liveRaw = liveBase().raw; // the same object until a new live version is loaded
  const diff = useMemo(() => {
    try {
      return levelDiff(liveRaw, level);
    } catch {
      return null;
    }
  }, [level, liveRaw]);

  const tested =
    review?.testPlayedDraftRevision === draftRevision && review.sourceVersion === baseVersion && review.blocking === 0;
  const validated =
    validation !== null &&
    validation.revision === draftRevision &&
    validation.result.problems.every((p) => p.severity === "warn") &&
    validation.result.pictures.length === 0;
  const automatic: readonly (readonly [string, boolean])[] = [
    ["The draft is saved.", !dirty],
    ["The editor shows no problems that stop publishing.", !blocked],
    [`The checks ran on this draft against the live version${baseVersion === null ? "" : ` (${baseVersion})`}, with no red results.`, tested],
    ["The server's Validate passes (rules and pictures).", validated],
  ];
  const ready = baseVersion !== null && automatic.every(([, ok]) => ok) && HAND_TICKS.every(([k]) => ticks[k]);
  const running = publish !== null && (publish.state === "QUEUED" || publish.state === "RUNNING");

  // Follow a running publish until it is done or refused (the effect ends when `running` turns false).
  useEffect(() => {
    polls.current = 0;
    if (!running) return;
    const timer = window.setInterval(() => {
      polls.current += 1;
      if (polls.current > POLL_LIMIT) {
        window.clearInterval(timer);
        return;
      }
      api.getLevel(levelId).then(
        (view) => onView(view, view.publish?.state === "DONE" && view.publish.live === true),
        () => undefined, // the next poll tries again
      );
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [api, levelId, onView, running]);

  async function validate() {
    setBusy(true);
    setMessage(null);
    try {
      setValidation({ revision: draftRevision, result: await api.validateLevel(levelId, draftRevision) });
    } catch (error) {
      const refusal = refusalOf(error);
      setMessage(refusal !== null ? refusalText(refusal) : describeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function send(live: boolean) {
    if (baseVersion === null) return;
    setConfirmLive(false);
    setBusy(true);
    setMessage(null);
    try {
      await api.publishLevel(levelId, { draftRevision, sourceVersion: baseVersion, live, ticks });
      onView(await api.getLevel(levelId), false);
    } catch (error) {
      const refusal = refusalOf(error);
      setMessage(refusal !== null ? refusalText(refusal) : describeError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="publish-tab" aria-labelledby="publish-heading">
      <h3 id="publish-heading">Publish</h3>
      {baseVersion === null ? (
        <p className="notice">The live game data could not be loaded, so publishing is off. Reload the page to try again.</p>
      ) : (
        <p className="muted">
          {baseVersion.endsWith("-new") ? (
            <>This planet has nothing published yet: its first version starts from this level, which must hold the 50-wave campaign.</>
          ) : (
            <>
              {released ? "Live version" : "Newest version"}: <strong>{baseVersion}</strong>. Publishing makes a new version from it with
              this level's map, waves and wave sets; nothing else changes.
            </>
          )}
        </p>
      )}

      <h4>Against live</h4>
      {diff === null ? (
        <p className="muted">This level cannot be merged into the live planet yet (see the problems).</p>
      ) : diff.length === 0 ? (
        <p className="muted">Nothing changes against live.</p>
      ) : (
        <ul className="publish-diff">
          {diff.map((line) => (
            <li key={`${line.change}-${line.section}-${line.id}`}>{diffText(line)}</li>
          ))}
        </ul>
      )}

      <h4>Checklist</h4>
      <ul className="publish-checklist">
        {automatic.map(([text, ok]) => (
          <li key={text} className={ok ? "ok" : "todo"}>
            <span aria-hidden="true">{ok ? "✓" : "○"}</span> {text}
            <span className="visually-hidden">{ok ? " Done." : " Not yet."}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => void validate()} disabled={busy || dirty}>
        Validate on the server
      </button>
      {validation !== null && validation.revision === draftRevision && !validated && (
        <ul className="problems">
          {validation.result.problems
            .filter((p) => p.severity !== "warn")
            .map((p) => (
              <li key={`${p.field}-${p.rule}`}>
                {p.field}: {p.rule}
              </li>
            ))}
          {validation.result.pictures.map((p) => (
            <li key={`${p.pictureId}-${p.rule}`}>
              Picture {p.pictureId}: {p.rule}
            </li>
          ))}
        </ul>
      )}
      <fieldset className="publish-ticks">
        <legend>Look at the map yourself</legend>
        {HAND_TICKS.map(([key, text]) => (
          <label key={key}>
            <input type="checkbox" checked={ticks[key]} onChange={(e) => setTicks({ ...ticks, [key]: e.target.checked })} /> {text}
          </label>
        ))}
      </fieldset>

      <div className="publish-actions">
        <button type="button" onClick={() => void send(false)} disabled={!ready || busy || running}>
          Send to testers
        </button>
        {released ? (
          <button type="button" className="primary" onClick={() => setConfirmLive(true)} disabled={!ready || busy || running}>
            Publish
          </button>
        ) : null}
        <span className="muted">
          {released
            ? "Send to testers makes a preview version only tester accounts see on Home."
            : "This planet is not released yet: its versions are previews for tester accounts until you release it on the Planets page."}
        </span>
      </div>
      {message !== null && (
        <p role="alert" className="notice">
          {message}
        </p>
      )}
      {publish !== null && <PublishStatus publish={publish} />}

      {versions.length > 0 && (
        <>
          <h4>Versions from this level</h4>
          <ul>
            {versions.map((v) => (
              <li key={v.campaignVersion}>
                {v.campaignVersion}, draft revision {v.draftRevision}, from {v.sourceVersion}, {v.publishedAt}
              </li>
            ))}
          </ul>
          <p>
            <a href={hrefOf({ page: "versions" })}>Make live, retire or mark invalid in Versions</a>
          </p>
        </>
      )}

      {confirmLive && (
        <ConfirmDialog labelledBy="publish-confirm" onCancel={() => setConfirmLive(false)}>
          {(cancelRef) => (
            <>
              <h3 id="publish-confirm">Publish {level.name} for everyone?</h3>
              <p>New games use the new version about a minute after the publisher finishes. Games already started keep theirs.</p>
              <div className="dialog-buttons">
                <button type="button" ref={cancelRef} onClick={() => setConfirmLive(false)}>
                  Cancel
                </button>
                <button type="button" className="primary" onClick={() => void send(true)}>
                  Publish
                </button>
              </div>
            </>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}

/** The latest publish, as the publisher left it. */
export function PublishStatus({ publish }: { publish: LevelPublish }) {
  const revision = `draft revision ${publish.draftRevision}`;
  switch (publish.state) {
    case "QUEUED":
    case "RUNNING":
      return (
        <p role="status" className="publish-status">
          Publishing {revision}: the publisher is checking it (about a minute)…
        </p>
      );
    case "DONE":
      return (
        <p role="status" className="publish-status">
          {publish.live === true
            ? `${publish.campaignVersion ?? "The new version"} is live for new games in about a minute (${revision}).`
            : publish.liveRefused !== undefined
              ? `${publish.campaignVersion ?? "The new version"} was made, but the live version changed meanwhile: it is a preview. Make it live in Versions.`
              : `${publish.campaignVersion ?? "The new version"} is a preview for tester accounts (${revision}).`}
        </p>
      );
    case "REFUSED":
      return (
        <p role="alert" className="notice publish-status">
          Not published ({revision}): {publish.refusal !== undefined ? refusalText(publish.refusal) : "the publisher refused."}
        </p>
      );
  }
}
