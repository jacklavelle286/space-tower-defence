import { useEffect, useMemo, useState } from "react";
import { adminApi, makeRequest } from "./api";
import { isAdmin } from "./auth/pkce";
import { completeSignIn, currentSession, forgetSession, isCallback, signOut, startSignIn, type Session } from "./auth/session";
import { loadConfig, type AdminConfig } from "./config";
import { ActivityPage } from "./pages/ActivityPage";
import { SpeechPage } from "./pages/SpeechPage";

type Boot =
  | { readonly step: "loading" }
  | { readonly step: "broken"; readonly message: string }
  | { readonly step: "signed-out"; readonly config: AdminConfig; readonly message?: string }
  | { readonly step: "signed-in"; readonly config: AdminConfig; readonly session: Session };

type Page = "speech" | "activities";

/** `#speech/<id>` or `#activities/<id>`: a link straight to one item (handy for review notes). */
function fromHash(hash: string): { page: Page; id: string | null } {
  const [page, id] = hash.replace(/^#/u, "").split("/");
  return { page: page === "activities" ? "activities" : "speech", id: id !== undefined && /^[a-z0-9-]{1,40}$/u.test(id) ? id : null };
}

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

export function App() {
  const [state, setState] = useState<Boot>({ step: "loading" });
  const [start] = useState(() => fromHash(window.location.hash));
  const [page, setPage] = useState<Page>(start.page);

  useEffect(() => {
    let live = true;
    void boot().then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, []);

  const api = useMemo(
    () => (state.step === "signed-in" ? adminApi(makeRequest(state.config.apiBase, state.session.accessToken)) : null),
    [state],
  );

  if (state.step === "loading") return <main className="centre">Loading…</main>;
  if (state.step === "broken") return <main className="centre">{state.message}</main>;
  if (state.step === "signed-out") {
    const config = state.config;
    return (
      <main className="centre">
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
  const header = (
    <header className="top">
      <strong>Space Colony Defence admin</strong>
      <nav>
        <button type="button" aria-pressed={page === "speech"} onClick={() => setPage("speech")}>
          Speech
        </button>
        <button type="button" aria-pressed={page === "activities"} onClick={() => setPage("activities")}>
          Activities
        </button>
      </nav>
      <span className="who">
        {session.claims.username}
        <button type="button" onClick={() => signOut(config)}>
          Sign out
        </button>
      </span>
    </header>
  );

  if (!isAdmin(session.claims) || api === null) {
    return (
      <main className="centre">
        <p className="error">This account can't use the content admin.</p>
        <button
          type="button"
          onClick={() => {
            forgetSession();
            signOut(config);
          }}
        >
          Sign out
        </button>
      </main>
    );
  }

  return (
    <>
      {header}
      <main className="page">{page === "speech" ? (
          <SpeechPage api={api} initial={start.page === "speech" ? start.id : null} />
        ) : (
          <ActivityPage api={api} initial={start.page === "activities" ? start.id : null} />
        )}</main>
    </>
  );
}
