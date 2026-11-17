// The run screen at /play/:runId: the slice joined (Phase 22, M1-22). Entering a run online follows spine S3.7 /
// G §7.1: claim the lease (unless New game just did), let the queue flush, read the cloud save, act on its phase.
// Then the battlefield plays the run, the learning panel opens for the activity, and every op goes through the queue.
import { trapTab } from "@scd/shared";
import { currentSlotId } from "@scd/game-core";
import type { ClipPlayer } from "@scd/shared/audio";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useParams, useSearchParams } from "react-router";
import type { PlayerApi } from "../api/playerApi";
import { Battlefield } from "../battlefield/Battlefield";
import { useGameBridge } from "../battlefield/bridgeContext";
import { EndScreen } from "../battlefield/EndScreen";
import { Hud } from "../battlefield/Hud";
import { PausedCard } from "../battlefield/PausedCard";
import { useHud } from "../battlefield/useBridge";
import { COPY } from "../copy/en-GB";
import type { GameBridge } from "../game/GameBridge";
import type { GameData } from "../game/gameData";
import { BattlefieldControls } from "../hud/BattlefieldControls";
import type { SyncQueue } from "../sync/queue";
import { SyncChip } from "../sync/SyncChip";
import type { AckTracker } from "./ackTracker";
import { ActivityPanel } from "./ActivityPanel";
import { powerName } from "./buildRunState";
import { CompletionOffer } from "./CompletionOffer";
import { MeteorOffer } from "./MeteorOffer";
import type { PlayLease } from "./lease";
import { loadRun, type LoadedRun } from "./loadRun";
import { SyncedRun } from "./syncedRun";
import type { RunDetail } from "./types";
import "./run.css";

export interface RunServices {
  api: PlayerApi;
  queue: SyncQueue;
  tracker: AckTracker;
  lease: PlayLease;
  clips: ClipPlayer;
  /** The pinned versions' game data; `manifestVersion` null is m1 (a run saved before asset manifests, LD8). */
  loadData: (rulesetVersion: string, campaignVersion: string, manifestVersion: string | null) => Promise<GameData>;
  /** Back to Home (after the lease is released). */
  onLeave: () => void;
  onSignIn: () => void;
}

export type Screen =
  | { kind: "loading" }
  | { kind: "takeover"; deviceLabel: string }
  | { kind: "elsewhere"; deviceLabel: string; minutes: number }
  | { kind: "ended"; detail: RunDetail | null }
  | { kind: "message"; text: string }
  | { kind: "stale" }
  | { kind: "ready"; loaded: LoadedRun; run: SyncedRun };

export function RunScreen({ services }: { services: RunServices }) {
  const { runId = "" } = useParams();
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  // Each full load of the run gets a new key, so a reload (after CHOOSE_ENDLESS) rebuilds the screen from scratch.
  const [loads, setLoads] = useState(0);
  const { api, queue, lease, clips, tracker, loadData } = services;

  const prefetchAll = useCallback(
    async (loaded: LoadedRun) => {
      // Fetch every clip of the prepared slots now, so Play is immediate (S3.6 preparation, E.8; best effort).
      for (const slot of loaded.pack.slots) {
        for (const [variant, clipKey] of Object.entries(slot.clips)) {
          await clips.prefetch({ runId: loaded.detail.runId, slotId: slot.slotId, variant, clipKey });
        }
      }
    },
    [clips],
  );

  const open = useCallback(
    (takeover: boolean, live: () => boolean = () => true) => {
      void enterRun({ api, queue, lease, loadData }, runId, takeover).then((next) => {
        if (!live()) return;
        if (next.kind === "sign-in") {
          services.onSignIn();
          return;
        }
        setScreen(next);
        setLoads((n) => n + 1);
        if (next.kind === "ready") void prefetchAll(next.loaded);
      });
    },
    [api, queue, lease, loadData, runId, services, prefetchAll],
  );

  useEffect(() => {
    let live = true;
    open(false, () => live);
    return () => {
      live = false;
    };
  }, [open]);

  useEffect(() => lease.onStale(() => setScreen({ kind: "stale" })), [lease]);

  // A full reload of the run (after CHOOSE_ENDLESS, or when the server has planned another endless block).
  const reload = useCallback(async () => open(false), [open]);

  // Renewing needs recent input (spine S3.4).
  useEffect(() => {
    const note = () => lease.noteInput();
    document.addEventListener("pointerdown", note);
    document.addEventListener("keydown", note);
    return () => {
      document.removeEventListener("pointerdown", note);
      document.removeEventListener("keydown", note);
    };
  }, [lease]);

  const retry = (takeover: boolean) => {
    setScreen({ kind: "loading" });
    open(takeover);
  };

  const leave = useCallback(async () => {
    await lease.release(); // after every op queued before it (one serial queue)
    services.onLeave();
  }, [lease, services]);

  switch (screen.kind) {
    case "loading":
      return <Card text={COPY.run.loading} />;
    case "takeover":
      return (
        <div className="dialog-backdrop">
          <div className="panel dialog" role="alertdialog" aria-modal="true" aria-labelledby="run-takeover" onKeyDown={trapTab}>
            <p id="run-takeover">{COPY.run.takeover(screen.deviceLabel || "another computer")}</p>
            <p className="reason">{COPY.run.takeoverGrownUp}</p>
            <div className="dialog-buttons">
              <button type="button" className="btn btn-big" autoFocus onClick={services.onLeave}>
                {COPY.run.notNow}
              </button>
              <button type="button" className="btn btn-small" onClick={() => retry(true)}>
                {COPY.run.playHere}
              </button>
            </div>
          </div>
        </div>
      );
    case "elsewhere":
      return (
        <Card
          text={COPY.run.elsewhere(screen.deviceLabel || "another computer", screen.minutes)}
          actions={[
            { label: COPY.tryAgain, onClick: () => retry(false) },
            { label: COPY.run.home, onClick: services.onLeave },
          ]}
        />
      );
    case "ended":
      return (
        <main className="screen run-screen">
          <div className="bf-stage run-ended">
            <EndScreen
              hud={{ runStatus: screen.detail?.status ?? "", highestCompletedWave: screen.detail?.highestCompletedWave ?? 0 }}
              onAction={services.onLeave}
              actionLabel={COPY.run.home}
            />
          </div>
        </main>
      );
    case "stale":
      return <Card text={COPY.run.stale} actions={[{ label: COPY.run.home, onClick: services.onLeave }]} />;
    case "message":
      return (
        <Card
          text={screen.text}
          actions={[
            { label: COPY.tryAgain, onClick: () => retry(false) },
            { label: COPY.run.home, onClick: services.onLeave },
          ]}
        />
      );
    case "ready":
      return (
        <ReadyRun
          key={`${screen.run.runId}:${loads}`}
          loaded={screen.loaded}
          run={screen.run}
          services={services}
          onLeave={leave}
          onReload={reload}
          tracker={tracker}
        />
      );
  }
}

/**
 * Entering a run online (spine S3.7, G §7.1): claim the lease unless New game just did, then read the cloud save
 * after anything still queued, and turn it into the screen to show.
 */
export async function enterRun(
  deps: Pick<RunServices, "api" | "queue" | "lease" | "loadData">,
  runId: string,
  takeover: boolean,
): Promise<Screen | { kind: "sign-in" }> {
  const { api, queue, lease, loadData } = deps;
  if (lease.held?.runId !== runId) {
    const claim = await lease.claim(runId, takeover);
    if (claim.kind === "takeover-confirm") return { kind: "takeover", deviceLabel: claim.deviceLabel };
    if (claim.kind === "elsewhere") {
      return { kind: "elsewhere", deviceLabel: claim.deviceLabel, minutes: Math.max(1, Math.ceil(claim.retryAfterSeconds / 60)) };
    }
    if (claim.kind === "terminal") {
      // [CONFIRMED by owner, 2026-11-15]: an ended run shows its final screen, not an error (D7.3 RUN_TERMINAL).
      const ended = await loadRun(api, runId, loadData);
      return { kind: "ended", detail: ended.kind === "ended" ? ended.detail : null };
    }
    if (claim.kind === "not-found") return { kind: "message", text: COPY.run.notFound };
    if (claim.kind === "auth-required") return { kind: "sign-in" };
    if (claim.kind !== "ok") return { kind: "message", text: COPY.run.failed };
  }
  // Reads go through the queue too, so they come after any ops still being sent ("flush, then adopt the view").
  const loaded = await queue.control(async () => ({ kind: "ok" as const, status: 200, body: await loadRun(api, runId, loadData) }));
  const outcome = loaded.kind === "ok" ? loaded.body : null;
  if (outcome === null || outcome.kind === "failed") return { kind: "message", text: COPY.run.failed };
  if (outcome.kind === "auth-required") return { kind: "sign-in" };
  if (outcome.kind === "not-found") return { kind: "message", text: COPY.run.notFound };
  if (outcome.kind === "ended") return { kind: "ended", detail: outcome.detail };
  const run = new SyncedRun({
    runId,
    initial: outcome.run.state,
    enqueue: (op) => queue.enqueue(op),
    onLocalRefusal: (type, code) => console.warn("op refused by the local reducer", { type, code }),
  });
  return { kind: "ready", loaded: outcome.run, run };
}

function ReadyRun({
  loaded,
  run,
  services,
  tracker,
  onLeave,
  onReload,
}: {
  loaded: LoadedRun;
  run: SyncedRun;
  services: RunServices;
  tracker: AckTracker;
  onLeave: () => Promise<void>;
  /** Load the whole run again: state, slots and content pack (after CHOOSE_ENDLESS or a new endless block). */
  onReload: () => Promise<void>;
}) {
  const bridgeRef = useRef<GameBridge | null>(null);
  const onBridge = useCallback((bridge: GameBridge | null) => {
    bridgeRef.current = bridge;
  }, []);
  const [leaving, setLeaving] = useState(false);
  // Saved games' Give up / Finish opens the game with its confirmation already showing (/play/:runId?end=1).
  const [searchParams] = useSearchParams();
  const [confirmEnd, setConfirmEnd] = useState(() => searchParams.get("end") === "1");
  // Whether the game was already paused when the dialog opened, so Keep it leaves it as it was.
  const pausedBefore = useRef(false);
  // While the learning panel (which has its own Save and exit, D6.1) or the end screen is up, the top bar's Save and
  // exit is hidden, so there is one obvious action.
  const [overlayOpen, setOverlayOpen] = useState(false);
  const detail = loaded.detail;
  const restartNotice = detail.phase === "IN_WAVE" ? COPY.run.waveRestart(detail.wave) : null;

  // Optimistic UI with an authoritative server: when the server's run view stops matching ours (and nothing of ours
  // is still waiting to be sent), rebuild from the cloud save.
  const resync = useCallback(async () => {
    const again = await loadRun(services.api, run.runId, services.loadData);
    if (again.kind === "ready") run.replace(again.run.state);
  }, [services, run]);

  useEffect(
    () =>
      tracker.onRunView((view) => {
        if (view.runId !== run.runId) return;
        setTimeout(() => {
          if (services.queue.getSnapshot().pending > 0) return;
          if (view.revision !== run.state.revision || view["phase"] !== run.state.phase) void resync();
          // The server planned another endless block (Phase 54): its slots and their content come with a full reload.
          else if (typeof view["plannedThrough"] === "number" && view["plannedThrough"] > run.state.plannedThrough) void onReload();
        }, 0);
      }),
    [tracker, run, services.queue, resync, onReload],
  );

  const saveAndExit = useCallback(async () => {
    if (leaving) return;
    setLeaving(true);
    const bridge = bridgeRef.current;
    bridge?.pause();
    const prep = bridge?.prepSnapshot() ?? null;
    if (prep !== null) run.savePrep(prep.credits, prep.placements); // mid-wave writes nothing (spine S3.2)
    await onLeave();
  }, [leaving, onLeave, run]);

  // Give up (ABANDON) or, once the campaign is complete, Finish (FINISH_RUN): confirmed first (D4 P6), then Home.
  const endGame = useCallback(async () => {
    if (leaving) return;
    setLeaving(true);
    setConfirmEnd(false);
    bridgeRef.current?.pause();
    run.endGame();
    await onLeave();
  }, [leaving, onLeave, run]);
  const finishing = run.state.campaignCompleted;

  // D7.1: signing in leaves the page, and a wave is never saved mid-way (spine S3.2), so in a wave the Sign in
  // button first says that the wave will start again.
  const signInWarning = useCallback(() => {
    const hud = bridgeRef.current?.hud();
    return hud !== undefined && hud.battle === "IN_WAVE" ? COPY.run.waveRestart(hud.wave) : null;
  }, []);

  const seed = typeof detail.seed === "string" && detail.seed !== "" ? detail.seed : run.runId;

  return (
    <main className="run-screen">
      <header className="run-top">
        <SyncChip queue={services.queue} onSignIn={services.onSignIn} signInWarning={signInWarning} />
        {overlayOpen ? null : (
          <span className="run-top-actions">
            <button
              type="button"
              className="btn btn-small"
              disabled={leaving}
              onClick={() => {
                pausedBefore.current = bridgeRef.current?.paused ?? false;
                bridgeRef.current?.pause();
                setConfirmEnd(true);
              }}
            >
              {finishing ? COPY.run.finish : COPY.run.giveUp}
            </button>
            <button type="button" className="btn btn-small" disabled={leaving} onClick={() => void saveAndExit()}>
              {leaving ? COPY.run.saving : COPY.run.saveAndExit}
            </button>
          </span>
        )}
      </header>
      {confirmEnd ? (
        <EndGameDialog
          finishing={finishing}
          onKeep={() => {
            setConfirmEnd(false);
            if (!pausedBefore.current) bridgeRef.current?.resume();
          }}
          onConfirm={() => void endGame()}
        />
      ) : null}
      {restartNotice !== null ? (
        <p className="notice run-notice" role="status">
          {restartNotice}
        </p>
      ) : null}
      <Battlefield data={loaded.data} waveSetId={detail.waveSetId} run={run} seed={seed} speed={1} onBridge={onBridge}>
        <RunOverlays
          run={run}
          loaded={loaded}
          services={services}
          onResync={resync}
          onReload={onReload}
          onSaveAndExit={saveAndExit}
          onLeave={onLeave}
          onOverlay={setOverlayOpen}
        />
      </Battlefield>
    </main>
  );
}

/** "Give up this game?" / "Finish this game?" with Keep it first and focused, so Enter never ends a game by accident. */
function EndGameDialog({ finishing, onKeep, onConfirm }: { finishing: boolean; onKeep: () => void; onConfirm: () => void }) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => keep.current?.focus(), []);
  return (
    <div className="run-confirm-backdrop">
      <div
        className="run-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="run-confirm-q"
        onKeyDown={(e) => {
          if (e.key === "Escape") onKeep();
          else trapTab(e); // Phase 68: Tab stays inside the dialog
        }}
      >
        <p id="run-confirm-q">{finishing ? COPY.run.finishQuestion : COPY.run.giveUpQuestion}</p>
        <div className="run-confirm-buttons">
          <button ref={keep} type="button" className="btn btn-big btn-go" onClick={onKeep}>
            {COPY.run.keepIt}
          </button>
          <button type="button" className="btn btn-small" onClick={onConfirm}>
            {finishing ? COPY.run.finishConfirm : COPY.run.giveUpConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}

function RunOverlays({
  run,
  loaded,
  services,
  onResync,
  onReload,
  onSaveAndExit,
  onLeave,
  onOverlay,
}: {
  run: SyncedRun;
  loaded: LoadedRun;
  services: RunServices;
  onResync: () => Promise<void>;
  onReload: () => Promise<void>;
  onSaveAndExit: () => Promise<void>;
  onLeave: () => Promise<void>;
  /** Told whether the learning panel or the end screen is showing. */
  onOverlay: (open: boolean) => void;
}) {
  const bridge = useGameBridge();
  const hud = useHud(bridge);
  const state = useSyncExternalStore(
    (listener) => run.subscribe(() => listener()),
    () => run.state,
  );
  // The panel opens when the run reaches an activity (on entry, or after a cleared wave) and stays open after the
  // activity resolves, until the child presses Continue.
  const [panelSlot, setPanelSlot] = useState<string | null>(() => currentSlotId(run.state));
  useEffect(
    () =>
      run.subscribe((next) => {
        const slotId = currentSlotId(next);
        if (slotId !== null) setPanelSlot(slotId);
      }),
    [run],
  );
  const content = useMemo(() => (panelSlot === null ? null : loaded.content.get(panelSlot)), [loaded, panelSlot]);
  // Phase 51: a meteor slot with no attempt yet opens with the offer; "Have a go" opens the activity itself.
  const [goingFor, setGoingFor] = useState<string | null>(null);
  const slot = panelSlot === null ? undefined : state.slots.find((s) => s.slotId === panelSlot);
  const meteorPower = slot?.kind === "METEOR" ? slot.reward.powerId : undefined;
  const held = meteorPower === undefined ? 0 : (state.snapshot?.powers[meteorPower] ?? 0);
  const offering =
    slot !== undefined && meteorPower !== undefined && slot.status === "UNRESOLVED" && slot.attempts.length === 0 && goingFor !== slot.slotId;
  // P8: a meteor whose power is already full still counts, but the panel says no charge is added.
  const activity =
    content?.activity != null && meteorPower !== undefined && held >= state.powerChargeCap
      ? { ...content.activity, reward: { ...content.activity.reward, powerFullAt: state.powerChargeCap } }
      : (content?.activity ?? null);
  const ended = state.status !== "IN_PROGRESS";
  const offer = !ended && state.phase === "COMPLETION_OFFER";
  const panelOpen = panelSlot !== null && !ended;
  useEffect(() => onOverlay(panelOpen || ended || offer), [onOverlay, panelOpen, ended, offer]);
  // C24.6 / D-6: an endless interval the bank could not fill has no slot; say so instead of silently skipping.
  const allDone =
    !ended &&
    state.stage === "ENDLESS" &&
    state.phase === "BUILD" &&
    state.wave - 1 >= state.finalWave &&
    !state.slots.some((s) => s.slotId === `N-${String(state.wave - 1).padStart(3, "0")}`);

  return (
    <>
      <Hud bridge={bridge} hud={hud} />
      <BattlefieldControls bridge={bridge} hud={hud} active={!ended && !offer && panelSlot === null && hud.runPhase !== "ACTIVITY"} />
      {allDone ? (
        <p className="notice run-all-done" role="status">
          {COPY.complete.allDone}
        </p>
      ) : null}
      {offer ? (
        <CompletionOffer
          run={run}
          services={services}
          wavesCleared={state.highestCompletedWave}
          planetId={loaded.detail.planetId}
          onEndless={onReload}
          onFinish={() => {
            run.endGame();
          }}
        />
      ) : null}
      {panelSlot !== null && !ended && offering && meteorPower !== undefined ? (
        <MeteorOffer
          run={run}
          powerId={meteorPower}
          powerName={powerName(meteorPower)}
          held={held}
          cap={state.powerChargeCap}
          tracker={services.tracker}
          onHaveAGo={() => setGoingFor(panelSlot)}
          onDone={() => setPanelSlot(null)}
          onResync={() => void onResync()}
        />
      ) : panelSlot !== null && !ended ? (
        <ActivityPanel
          run={run}
          slotId={panelSlot}
          activity={activity}
          clips={content?.clips ?? {}}
          player={services.clips}
          tracker={services.tracker}
          onContinue={() => setPanelSlot(null)}
          onSaveAndExit={() => void onSaveAndExit()}
          onResync={() => void onResync()}
        />
      ) : null}
      {hud.paused && !ended && hud.battle === "IN_WAVE" && <PausedCard bridge={bridge} />}
      {ended && (
        <EndScreen hud={{ runStatus: state.status, highestCompletedWave: state.highestCompletedWave }} onAction={() => void onLeave()} actionLabel={COPY.run.home} />
      )}
    </>
  );
}

function Card({ text, actions = [] }: { text: string; actions?: { label: string; onClick: () => void }[] }) {
  return (
    <main className="screen screen-message">
      <div className="panel">
        <p className="message-line">{text}</p>
        {actions.map((action) => (
          <button key={action.label} type="button" className="btn btn-big" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
    </main>
  );
}
