import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { adminApi, ApiError, makeRequest, type Request } from "./api";
import { completeSignIn, currentSession, forgetSession, isCallback, signOut, startSignIn, type Session } from "./auth/session";
import { loadConfig, type AdminConfig } from "./config";
import { accessDetail, checkAccess, NOT_AUTHORISED } from "./guard";
import { ActivityListPage } from "./pages/ActivityListPage";
import { ActivityPage } from "./pages/ActivityPage";
import { NewActivityPage } from "./editor/NewActivity";
import { BankStatusPage } from "./pages/BankStatusPage";
import { PicturesPage } from "./pages/PicturesPage";
import { SpeechPage } from "./pages/SpeechPage";
import { parseRoute, SECTIONS, sectionOf, type Route } from "./routes";

// The level designer (Gate M) loads on demand: game-core, the design rules and the map art stay out of the rest of the
// admin's first load (LD0 measured game-core and the test players at +17 KiB gzip).
const LevelListPage = lazy(() => import("./levels/LevelListPage").then((m) => ({ default: m.LevelListPage })));
const LevelEditor = lazy(() => import("./levels/LevelEditor").then((m) => ({ default: m.LevelEditor })));
const VersionsPage = lazy(() => import("./levels/publish/VersionsPage").then((m) => ({ default: m.VersionsPage })));

// The admin app shell (Phase 35, M3-01; D §D8): sign-in, the route guard, navigation and the pages. The order matters:
// config, then the session, then the guard on the token's claims, and only then the API client. A token that is not an
// operator-pool admin token never gets a client, so no admin request is sent for it. The server checks everything
// again (gateway 401 for a player token, admin-api 403 for an operator outside `admin`); when it refuses, the shell
// shows the same "not authorised" screen or asks for a new sign-in.

type Boot =
  | { readonly step: "loading" }
  | { readonly step: "broken"; readonly message: string }
  | { readonly step: "signed-out"; readonly config: AdminConfig; readonly message?: string }
  | { readonly step: "signed-in"; readonly config: AdminConfig; readonly session: Session };

async function boot(): Promise<Boot> {
  let config: AdminConfig;
  try {
    config = await loadConfig();
  } catch {
    return { step: "broken", message: "The admin settings (config.json) could not be loaded." };
  }
  if (isCallback()) {
    try {
      return { step: "signed-in", config, session: await completeSignIn(config) };
    } catch (error) {
      return { step: "signed-out", config, message: error instanceof Error ? error.message : "Sign-in did not complete." };
    }
  }
  const session = currentSession();
  return session === null ? { step: "signed-out", config } : { step: "signed-in", config, session };
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const follow = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);
  return route;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function App() {
  const [state, setState] = useState<Boot>({ step: "loading" });
  const [refused, setRefused] = useState(false);
  const route = useRoute();
  const online = useOnline();

  useEffect(() => {
    let live = true;
    void boot().then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, []);

  const access = state.step === "signed-in" ? checkAccess(state.session.claims, state.config) : null;

  /** The server is the authority: a 403 shows "not authorised", a gateway 401 asks for a new sign-in. */
  const watch = useCallback(
    (request: Request, config: AdminConfig): Request =>
      async (...args) => {
        try {
          return await request(...args);
        } catch (error) {
          if (error instanceof ApiError && error.status === 403 && error.code === "FORBIDDEN") setRefused(true);
          if (error instanceof ApiError && error.status === 401) {
            forgetSession();
            setState({ step: "signed-out", config, message: "Your sign-in has expired. Sign in again." });
          }
          throw error;
        }
      },
    [],
  );

  const api = useMemo(
    () =>
      state.step === "signed-in" && access?.allowed === true
        ? adminApi(watch(makeRequest(state.config.apiBase, state.session.accessToken), state.config))
        : null,
    [state, access?.allowed, watch],
  );

  const banner = online ? null : (
    <p className="offline" role="status">
      You're offline. The admin needs the internet; nothing is saved until you're back online.
    </p>
  );

  if (state.step === "loading") return <main className="centre">Loading…</main>;
  if (state.step === "broken") return <main className="centre">{state.message}</main>;
  if (state.step === "signed-out") {
    const config = state.config;
    return (
      <main className="centre">
        {banner}
        <h1>Space Colony Defence admin</h1>
        <p>Content admin for grown-ups. Sign in with your operator account and authenticator code.</p>
        {state.message !== undefined && <p className="error">{state.message}</p>}
        <button type="button" className="primary" onClick={() => void startSignIn(config)}>
          Sign in
        </button>
      </main>
    );
  }

  const { config, session } = state;
  if (api === null || refused) {
    const reason = refused ? "server" : access?.allowed === false ? access.reason : "not-admin";
    return (
      <main className="centre">
        <h1>Not authorised</h1>
        <p className="error">{NOT_AUTHORISED}</p>
        <p className="muted">{accessDetail(reason)}</p>
        <button type="button" onClick={() => signOut(config)}>
          Sign out
        </button>
      </main>
    );
  }

  const section = sectionOf(route);
  // Layout (owner's choice, 2026-11-16, "Mission control"): the header is the night-blue sidebar (a top bar on narrow
  // screens); the offline banner and the page sit beside it.
  return (
    <div className="shell">
      <header className="top">
        <strong className="logo">
          Colony Admin
          <small>Space Colony Defence</small>
        </strong>
        <nav aria-label="Admin pages">
          <ul>
            {SECTIONS.map((item) => (
              <li key={item.section}>
                <a href={item.href} aria-current={item.section === section ? "page" : undefined}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <span className="who">
          {session.claims.username}
          <button type="button" onClick={() => signOut(config)}>
            Sign out
          </button>
        </span>
      </header>
      <div className="content">
        {banner}
        <main className="page">
          {route.page === "activities" && <ActivityListPage api={api} />}
          {route.page === "activity" && <ActivityPage key={route.id} api={api} activityId={route.id} />}
          {route.page === "new" && <NewActivityPage api={api} />}
          {route.page === "speech" && <SpeechPage key={route.id ?? ""} api={api} initial={route.id} />}
          {route.page === "pictures" && <PicturesPage api={api} tab={route.tab} />}
          {route.page === "bank" && <BankStatusPage api={api} />}
          {(route.page === "levels" || route.page === "level" || route.page === "versions") && (
            <Suspense fallback={<p>Loading…</p>}>
              {route.page === "levels" && <LevelListPage api={api} />}
              {route.page === "level" && <LevelEditor key={route.id} api={api} levelId={route.id} />}
              {route.page === "versions" && <VersionsPage api={api} />}
            </Suspense>
          )}
        </main>
      </div>
    </div>
  );
}
