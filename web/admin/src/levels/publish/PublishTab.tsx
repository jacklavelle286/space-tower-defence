// The Publish tab (Gate M, LD7; scope-level-designer.md §3.1 steps 11-12): what publishing this level changes
// against live, the checklist (automatic ticks from the editor, the Test tab and the server's Validate; hand ticks
// for what only a person can judge), then Send to testers (a preview version, never in current.json) or Publish
// (live for new games). A publish runs in the publisher for about a minute: R49 queues it and this tab follows the
// level's publish item (R42) until it is done or refused. Every check is repeated by the server; the ticks here only
// say why a button is off.
// Maps (LD22, ADR-0043): a map not on Home yet (its planet unreleased) is put there by Publish: the publish makes its
// first version (a preview, as for any unreleased planet), then the tab releases the planet (R56). "Put it on Home"
// does the release alone, for a map whose version is already made.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
      return "A map's first version needs its 50 waves: Make it all again on the Map tab makes them.";
    case "NOT_RELEASED":
      return "This map is not on Home yet: Publish puts it there.";
    case "NOT_READY":
      return "The map's newest version does not have its full 50 waves yet.";
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

/** Get it ready (LD16): the editor saves and runs the checks, then says which draft revision to validate. */
export type GetReady = (onStep: (text: string) => void) => Promise<{ readonly ok: true; readonly draftRevision: number } | { readonly ok: false; readonly message: string }>;

type Props = {
  readonly api: Pick<AdminApi, "validateLevel" | "publishLevel" | "getLevel" | "releasePlanet">;
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
  /** Whether the map is on Home (its planet released, LD10): until then its versions are previews, and Publish
   *  releases it after its publish (LD22). */
  readonly released?: boolean;
  /** The map's planet (released by Publish when it is not on Home yet). */
  readonly planetId?: string;
  /** The map is on Home now (the planet was released). */
  readonly onReleased?: () => void;
  readonly publish: LevelPublish | null;
  readonly versions: readonly LevelVersion[];
  /** A fresh level view (after a poll); `wentLive` when a publish just moved the live version. */
  readonly onView: (view: LevelView, wentLive: boolean) => void;
  readonly onGetReady?: GetReady;
};

export function PublishTab({ api, levelId, level, draftRevision, review, dirty, blocked, baseVersion, released = true, planetId, publish, versions, onView, onGetReady, onReleased }: Props) {
  const [validation, setValidation] = useState<{ revision: number; result: LevelValidation } | null>(null);
  const [ticks, setTicks] = useState<Record<HandTick, boolean>>(() => Object.fromEntries(HAND_TICKS.map(([k]) => [k, false])) as Record<HandTick, boolean>);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmLive, setConfirmLive] = useState(false);
  // Publish on a map not on Home yet: the draft revision whose publish is followed by its planet's release (LD22).
  const releaseAfter = useRef<number | null>(null);
  const [homeText, setHomeText] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [readyText, setReadyText] = useState<string | null>(null);
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
    setReadyText(null);
    try {
      setValidation({ revision: draftRevision, result: await api.validateLevel(levelId, draftRevision) });
    } catch (error) {
      const refusal = refusalOf(error);
      setMessage(refusal !== null ? refusalText(refusal) : describeError(error));
    } finally {
      setBusy(false);
    }
  }

  /** Save, run the checks (the editor does both), then Validate: stops at the first step that fails, with why. */
  async function getReady() {
    if (onGetReady === undefined) return;
    setBusy(true);
    setMessage(null);
    setReadyText(null);
    try {
      const prepared = await onGetReady(setStep);
      if (!prepared.ok) {
        setMessage(prepared.message);
        return;
      }
      setStep("Validating on the server…");
      const result = await api.validateLevel(levelId, prepared.draftRevision);
      setValidation({ revision: prepared.draftRevision, result });
      const passed = result.problems.every((p) => p.severity === "warn") && result.pictures.length === 0;
      if (passed) setReadyText("Ready: saved, checked and validated. Look at the map yourself and tick the boxes below, then publish.");
      else setMessage("Validate found problems: they are listed under the checklist.");
    } catch (error) {
      const refusal = refusalOf(error);
      setMessage(refusal !== null ? refusalText(refusal) : describeError(error));
    } finally {
      setStep(null);
      setBusy(false);
    }
  }

  /** Puts the map on Home: releases its planet (R56). */
  const putOnHome = useCallback(async () => {
    if (planetId === undefined) return;
    setConfirmLive(false);
    setBusy(true);
    setMessage(null);
    setHomeText("Putting it on Home…");
    try {
      await api.releasePlanet(planetId);
      setHomeText(`${level.name} is on Home for every child, for new games in about a minute.`);
      onReleased?.();
    } catch (error) {
      setHomeText(null);
      const refusal = refusalOf(error);
      const why = refusal !== null ? refusalText(refusal) : describeError(error);
      setMessage(`It was published, but could not be put on Home: ${why} Try Put it on Home again.`);
    } finally {
      setBusy(false);
    }
  }, [api, planetId, level.name, onReleased]);

  // The publish that Publish started on a map not on Home yet is done: put the map on Home.
  useEffect(() => {
    if (releaseAfter.current === null || publish === null || publish.draftRevision !== releaseAfter.current) return;
    if (publish.state === "QUEUED" || publish.state === "RUNNING") return;
    releaseAfter.current = null;
    if (publish.state === "DONE") queueMicrotask(() => void putOnHome()); // after this render, not inside the effect
  }, [publish, putOnHome]);

  async function send(live: boolean) {
    if (baseVersion === null) return;
    setConfirmLive(false);
    setBusy(true);
    setMessage(null);
    setHomeText(null);
    releaseAfter.current = live && !released ? draftRevision : null;
    try {
      await api.publishLevel(levelId, { draftRevision, sourceVersion: baseVersion, live, ticks });
      onView(await api.getLevel(levelId), false);
    } catch (error) {
      releaseAfter.current = null;
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
            <>This map has nothing published yet: its first version starts from it, with its 50 waves.</>
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
        <p className="muted">This map cannot be merged into its live version yet (see the problems).</p>
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
      <p className="row">
        {onGetReady !== undefined && (
          <button type="button" className="primary" onClick={() => void getReady()} disabled={busy || running || baseVersion === null}>
            Get it ready
          </button>
        )}
        <button type="button" onClick={() => void validate()} disabled={busy || dirty}>
          Validate on the server
        </button>
      </p>
      {onGetReady !== undefined && <p className="muted">Get it ready saves the draft, runs the checks against the live version, then Validate.</p>}
      {step !== null && <p role="status">{step}</p>}
      {readyText !== null && <p role="status">{readyText}</p>}
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
        <button type="button" className="primary" onClick={() => setConfirmLive(true)} disabled={!ready || busy || running || (!released && planetId === undefined)}>
          Publish
        </button>
        {!released && planetId !== undefined && versions.length > 0 && (
          <button type="button" onClick={() => void putOnHome()} disabled={busy || running}>
            Put it on Home
          </button>
        )}
        <span className="muted">
          {released
            ? "Send to testers makes a preview version only tester accounts see on Home."
            : "This map is not on Home yet. Send to testers makes a preview only tester accounts see; Publish puts it on Home for every child."}
        </span>
      </div>
      {homeText !== null && <p role="status">{homeText}</p>}
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
              {released ? (
                <p>New games use the new version about a minute after the publisher finishes. Games already started keep theirs.</p>
              ) : (
                <p>
                  It goes on Home for every child about a minute after the publisher finishes, and stays there: later you can publish changes or retire its
                  wave sets in Versions, but not take the map off Home.
                </p>
              )}
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
            : publish.liveRefused === "NOT_RELEASED"
              ? `${publish.campaignVersion ?? "The new version"} is made: a preview for tester accounts until the map is on Home (${revision}).`
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
