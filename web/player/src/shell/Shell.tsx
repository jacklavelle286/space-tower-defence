import { createApiClient, tokenSub, type ApiClient, type Me, type ProfileInput } from "@scd/shared";
import { ClipPlayer, htmlAudioOutput, idbClipStore, localDbName, memoryClipStore, openLocalDb } from "@scd/shared/audio";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { createPlayerApi, type PlayerApi, type ResetType } from "../api/playerApi";
import { startIdentityGuard, type IdentityGuard, type LostReason } from "../auth/identityGuard";
import { COPY } from "../copy/en-GB";
import { loadCurrent, loadGameDataVersions } from "../game/gameData";
import { AckTracker } from "../run/ackTracker";
import { browserSessionId, deviceLabel, PlayLease } from "../run/lease";
import { createRun } from "../run/newGame";
import type { RunServices } from "../run/RunScreen";
import { PROTOCOL_VERSION } from "../sync/protocol";
import { SyncQueue } from "../sync/queue";
import { MyProgress } from "../progress/MyProgress";
import { Settings } from "../settings/Settings";
import { SavedGames } from "./SavedGames";
import { Home, type GameChoice } from "./Home";
import { Landing } from "./Landing";
import { ProfileSetup } from "./ProfileSetup";
import type { Services } from "./services";

// The Phase 14 local slice (Phaser) loads only when its route is opened, and only exists in development builds and the
// Phase 34 measurement build (mode "perf", never released): production ships only the real run screen.
const LocalSlice = import.meta.env.DEV || import.meta.env.MODE === "perf"
  ? lazy(() => import("../battlefield/LocalSlice").then((m) => ({ default: m.LocalSlice })))
  : null;

// The run screen brings Phaser with it: it loads when a game is opened, never on the landing page or Home.
const RunScreen = lazy(() => import("../run/RunScreen").then((m) => ({ default: m.RunScreen })));

/** Everything bound to the one account this page load belongs to (E.7.4 point 1). Built once, never rebound. */
interface PlayerSession {
  ownerSub: string;
  client: ApiClient;
  api: PlayerApi;
  queue: SyncQueue;
  guard: IdentityGuard;
  /** Sees each op's answer, for the learning panel's "Checking…" (durability, spine S4). */
  tracker: AckTracker;
  lease: PlayLease;
  /** One audio element and one clip store per page load (E.9). */
  clips: ClipPlayer;
}

type ShellState =
  | { kind: "starting" }
  | { kind: "signed-out" }
  | { kind: "failed" }
  | { kind: "auth-required" }
  | { kind: "lost"; reason: LostReason }
  | { kind: "ready"; session: PlayerSession; me: Me | null };

/** After this long on the "different player" screen the page reloads by itself (when online). */
const RELOAD_DELAY_MS = 1500;

export function Shell({ services }: { services: Services }) {
  const [state, setState] = useState<ShellState>({ kind: "starting" });
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const session = useRef<PlayerSession | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  /** Stop everything for this page: nothing more is sent, then reload (offline: wait on a blocking screen). */
  const lose = useCallback(
    (reason: LostReason) => {
      const s = session.current;
      s?.lease.stop();
      s?.clips.dispose();
      s?.queue.stop();
      s?.client.stop();
      s?.guard.dispose();
      setState({ kind: "lost", reason });
      if (navigator.onLine) setTimeout(services.reload, RELOAD_DELAY_MS);
    },
    [services.reload],
  );

  // Start-up: bind the page to the signed-in account, or show the landing page. Runs once per page load (the
  // dependencies never change). On /auth/callback the auth library first swaps the code for tokens; reading the token
  // waits for that.
  useEffect(() => {
    let cancelled = false;
    async function start() {
      let token: string | null;
      try {
        token = await services.auth.accessToken({ forceRefresh: false });
      } catch {
        if (!cancelled) setState({ kind: "failed" });
        return;
      }
      if (cancelled) return;
      const ownerSub = token === null ? null : tokenSub(token);
      if (ownerSub === null) {
        setState({ kind: "signed-out" });
        return;
      }
      const client = createApiClient({
        apiBase: services.config.apiBase,
        ownerSub,
        tokens: services.auth,
        onIdentityChanged: () => lose("other-player"),
        ...(services.fetchImpl ? { fetchImpl: services.fetchImpl } : {}),
      });
      const api = createPlayerApi(client);
      const tracker = new AckTracker();
      const queue = new SyncQueue({
        transport: tracker.wrap(api),
        protocolVersion: PROTOCOL_VERSION,
        onIdentityChanged: () => lose("other-player"),
      });
      const guard = startIdentityGuard({ ownerSub, auth: services.auth, onLost: lose });
      // The account's own browser database (spine S7.3): clip bytes and this browser's play-session ID. Without
      // IndexedDB (a private window) both live in memory or sessionStorage for this page load.
      const db = await openLocalDb(ownerSub);
      if (cancelled) return;
      const lease = new PlayLease({ api, queue, sessionId: await browserSessionId(db), deviceLabel: deviceLabel(navigator.userAgent) });
      const clips = new ClipPlayer({
        requestSpeech: api.postSpeech,
        store: db === null ? memoryClipStore() : idbClipStore(db),
        output: htmlAudioOutput(),
        // Identifiers and keys only, never the URL (G §15).
        log: (event) => console.warn("speech", event),
      });
      const bound: PlayerSession = { ownerSub, client, api, queue, guard, tracker, lease, clips };
      session.current = bound;
      const result = await api.getMe();
      if (cancelled) return;
      if (result.kind === "ok") setState({ kind: "ready", session: bound, me: result.body });
      else if (result.kind === "error" && result.code === "PROFILE_NOT_FOUND") setState({ kind: "ready", session: bound, me: null });
      else if (result.kind === "auth-required") setState({ kind: "auth-required" });
      else if (result.kind !== "identity-changed") setState({ kind: "failed" });
    }
    void start();
    return () => {
      cancelled = true;
      session.current?.guard.dispose();
      session.current?.lease.stop();
      session.current?.clips.dispose();
      session.current?.queue.stop();
      session.current = null;
    };
  }, [services, lose]);

  const signIn = useCallback(
    (mode: "sign-in" | "sign-up") => {
      // F §7: let a request still out settle (its answer is kept by the queue) before the page leaves.
      const queue = session.current?.queue;
      if (queue === undefined) void services.auth.signIn(mode);
      else void queue.settled().then(() => services.auth.signIn(mode));
    },
    [services.auth],
  );

  const doSignOut = useCallback(async () => {
    const s = session.current;
    // E.7.4 point 3: release the play session (after the queue), send nothing more, tell other tabs, then Cognito
    // /logout and a fresh page load at "/".
    await s?.lease.release();
    s?.clips.dispose();
    s?.queue.stop();
    s?.client.stop();
    s?.guard.announceSignOut();
    s?.guard.dispose();
    await services.auth.signOut();
  }, [services.auth]);

  const requestSignOut = useCallback(() => {
    if ((session.current?.queue.getSnapshot().pending ?? 0) > 0) setConfirmSignOut(true);
    else void doSignOut();
  }, [doSignOut]);

  const saveProfile = useCallback(
    async (input: ProfileInput) => {
      const s = session.current;
      if (s === null) return false;
      const result = await s.api.putProfile(input);
      if (result.kind === "ok") {
        setState({ kind: "ready", session: s, me: result.body });
        navigate("/home", { replace: true });
        return true;
      }
      if (result.kind === "auth-required") setState({ kind: "auth-required" });
      return false;
    },
    [navigate],
  );

  /** After a reset (Phase 55): read the profile again, or, after WHOLE_PROFILE, drop the device's database and restart. */
  const afterReset = useCallback(async (type: ResetType) => {
    const s = session.current;
    if (s === null) return;
    if (type === "WHOLE_PROFILE") {
      try {
        globalThis.indexedDB?.deleteDatabase(localDbName(s.ownerSub)); // completes once this page's connection closes
      } catch {
        // No IndexedDB here: nothing to delete.
      }
      window.location.assign("/");
      return;
    }
    const result = await s.api.getMe();
    if (result.kind === "ok") setState({ kind: "ready", session: s, me: result.body });
  }, []);

  /** Back to Home from a run, with the run list read again (the Continue card). */
  const leaveRun = useCallback(async () => {
    const s = session.current;
    if (s !== null) {
      const result = await s.api.getMe();
      if (result.kind === "ok") setState({ kind: "ready", session: s, me: result.body });
    }
    navigate("/home");
  }, [navigate]);

  const newGame = useCallback(
    async (choice: GameChoice, options: { runId?: string; takeover?: boolean }) => {
      const s = session.current;
      if (s === null) return { kind: "failed" as const };
      const outcome = await createRun({ api: s.api, queue: s.queue, lease: s.lease, loadCurrent }, choice, options);
      if (outcome.kind === "ok") navigate(`/play/${outcome.runId}`);
      return outcome;
    },
    [navigate],
  );

  const practice = services.localPractice && LocalSlice ? (
    <Route
      path="/play/local"
      element={
        <Suspense fallback={<p className="screen-message">{COPY.loading}</p>}>
          <LocalSlice />
        </Suspense>
      }
    />
  ) : null;

  switch (state.kind) {
    case "starting":
      if (location.pathname === "/play/local" && services.localPractice) break;
      return <Message text={location.pathname === "/auth/callback" ? COPY.callback.working : COPY.loading} />;
    case "failed":
      return <Message text={COPY.startFailed} action={{ label: COPY.tryAgain, onClick: services.reload }} />;
    case "auth-required":
      return (
        <Message
          text={COPY.signInAgain.heading}
          action={{ label: COPY.signInAgain.button, onClick: () => signIn("sign-in") }}
        />
      );
    case "lost":
      return (
        <Message
          text={state.reason === "other-player" ? COPY.otherPlayer.heading : COPY.otherPlayer.signedOut}
          detail={COPY.otherPlayer.reloading}
          action={{ label: COPY.otherPlayer.reload, onClick: services.reload }}
        />
      );
    case "signed-out":
      return (
        <Routes>
          {practice}
          <Route path="/" element={<Landing onSignIn={signIn} practice={services.localPractice} />} />
          <Route path="/auth/callback" element={<Landing onSignIn={signIn} failed practice={services.localPractice} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      );
    case "ready":
      break;
  }

  const s = state.kind === "ready" ? state.session : null;
  const me = state.kind === "ready" ? state.me : null;
  const start = me ? "/home" : "/setup";
  return (
    <>
      <Routes>
        {practice}
        {s !== null ? (
          <>
            <Route path="/" element={<Navigate to={start} replace />} />
            <Route path="/auth/callback" element={<Navigate to={start} replace />} />
            <Route path="/setup" element={me ? <Navigate to="/home" replace /> : <ProfileSetup save={saveProfile} />} />
            <Route
              path="/home"
              element={
                me ? (
                  <Home
                    me={me}
                    api={s.api}
                    queue={s.queue}
                    onSignOut={requestSignOut}
                    onSignInAgain={() => signIn("sign-in")}
                    onContinue={(runId) => navigate(`/play/${runId}`)}
                    onSavedGames={() => navigate("/games")}
                    onMyProgress={() => navigate("/progress")}
                    onSettings={() => navigate("/settings")}
                    onNewGame={newGame}
                    practice={services.localPractice}
                  />
                ) : (
                  <Navigate to="/setup" replace />
                )
              }
            />
            <Route
              path="/settings"
              element={
                me ? (
                  <Settings
                    api={s.api}
                    queue={s.queue}
                    onBack={() => navigate("/home")}
                    onReset={(type) => void afterReset(type)}
                    testerCode={s.ownerSub}
                  />
                ) : (
                  <Navigate to="/setup" replace />
                )
              }
            />
            <Route
              path="/progress"
              element={me ? <MyProgress api={s.api} onBack={() => navigate("/home")} /> : <Navigate to="/setup" replace />}
            />
            <Route
              path="/games"
              element={
                me ? (
                  <SavedGames
                    api={s.api}
                    onContinue={(runId) => navigate(`/play/${runId}`)}
                    onEnd={(runId) => navigate(`/play/${runId}?end=1`)}
                    onBack={() => navigate("/home")}
                  />
                ) : (
                  <Navigate to="/setup" replace />
                )
              }
            />
            <Route
              path="/play/:runId"
              element={me ? <RunRoute session={s} onLeave={leaveRun} onSignIn={signIn} /> : <Navigate to="/setup" replace />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : null}
      </Routes>
      {confirmSignOut ? (
        <div className="dialog-backdrop">
          <div className="panel dialog" role="alertdialog" aria-modal="true" aria-labelledby="signout-warning">
            <p id="signout-warning">{COPY.signOut.pendingWarning}</p>
            <div className="dialog-buttons">
              {/* Focus starts on the safe choice (D1 rule 12). */}
              <button type="button" className="btn btn-big btn-go" autoFocus onClick={() => setConfirmSignOut(false)}>
                {COPY.signOut.stay}
              </button>
              <button type="button" className="btn btn-small" onClick={() => void doSignOut()}>
                {COPY.signOut.anyway}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** The run screen, bound to this page's account (its queue, lease and audio). */
function RunRoute({
  session,
  onLeave,
  onSignIn,
}: {
  session: PlayerSession;
  onLeave: () => Promise<void>;
  onSignIn: (mode: "sign-in" | "sign-up") => void;
}) {
  const services = useMemo<RunServices>(
    () => ({
      api: session.api,
      queue: session.queue,
      tracker: session.tracker,
      lease: session.lease,
      clips: session.clips,
      loadData: loadGameDataVersions,
      onLeave: () => void onLeave(),
      onSignIn: () => onSignIn("sign-in"),
    }),
    [session, onLeave, onSignIn],
  );
  return (
    <Suspense fallback={<p className="screen-message">{COPY.run.loading}</p>}>
      <RunScreen services={services} />
    </Suspense>
  );
}

function Message({ text, detail, action }: { text: string; detail?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <main className="screen screen-message">
      <div className="panel">
        <p className="message-line">{text}</p>
        {detail ? <p className="reason">{detail}</p> : null}
        {action ? (
          <button type="button" className="btn btn-big" onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </div>
    </main>
  );
}
