import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./global.css";
import { App } from "./App";
import { sounds } from "./sound/board";
import { loadConfig } from "./config";
import { COPY } from "./copy/en-GB";
import type { Services } from "./shell/services";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");
const reactRoot = createRoot(root);
// The combat sounds may start only after a key or a tap (browser autoplay rules; Phase 66).
for (const type of ["pointerdown", "keydown"] as const) window.addEventListener(type, () => sounds.unlock(), { capture: true, passive: true });

async function services(): Promise<Services> {
  // `npm run dev` has no config.json and its origin is not a registered callback URL, so development uses a fake
  // sign-in and an in-memory API (src/dev/). So does the Phase 34 measurement build (`npm run build:perf`, mode
  // "perf"): minified like production, with the local battlefield. The release build (mode "production") drops this
  // branch and never contains that code.
  if (import.meta.env.DEV || import.meta.env.MODE === "perf") {
    const { createDevServices } = await import("./dev/devServices");
    return createDevServices();
  }
  const config = await loadConfig();
  const { createAmplifyAuth } = await import("./auth/amplifyAuth");
  return { config, auth: createAmplifyAuth(config), reload: () => window.location.reload(), localPractice: false };
}

services().then(
  (s) =>
    reactRoot.render(
      <StrictMode>
        <App services={s} />
      </StrictMode>,
    ),
  () =>
    reactRoot.render(
      <main className="screen screen-message">
        <div className="panel">
          <p className="message-line">{COPY.startFailed}</p>
          <button type="button" className="btn btn-big" onClick={() => window.location.reload()}>
            {COPY.tryAgain}
          </button>
        </div>
      </main>,
    ),
);
