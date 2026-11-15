import { COPY } from "../copy/en-GB";
import { useOnline } from "./useOnline";

/** P1 Landing (D4): logo, one line, two big buttons and the grown-up note. Both buttons go to managed login. */
export function Landing({
  onSignIn,
  failed = false,
  practice = false,
}: {
  onSignIn: (mode: "sign-in" | "sign-up") => void;
  failed?: boolean;
  practice?: boolean;
}) {
  const online = useOnline();
  return (
    <main className="screen landing">
      <div className="landing-card">
        <img className="landing-logo" src="/assets/ui/logo-on-dark.svg" alt="" width={160} height={160} />
        <h1 className="landing-title">{COPY.title}</h1>
        <p className="landing-tagline">{COPY.landing.tagline}</p>
        {failed ? (
          <p className="notice" role="alert">
            {COPY.callback.failed}
          </p>
        ) : null}
        <div className="landing-buttons">
          <button type="button" className="btn btn-big btn-go" disabled={!online} onClick={() => onSignIn("sign-up")}>
            {COPY.landing.imNew}
          </button>
          <button type="button" className="btn btn-big" disabled={!online} onClick={() => onSignIn("sign-in")}>
            {COPY.landing.signIn}
          </button>
        </div>
        {online ? null : <p className="reason">{COPY.offline}</p>}
        <p className="landing-grown-up">{COPY.landing.grownUp}</p>
        {practice ? (
          <a className="dev-link" href="/play/local">
            {COPY.home.practice}
          </a>
        ) : null}
      </div>
    </main>
  );
}
