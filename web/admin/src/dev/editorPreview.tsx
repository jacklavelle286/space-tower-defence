// DEVELOPMENT ONLY: the activity editor with no sign-in and no server (Phase 39), for trying every type locally.
// Served by `npm run dev -w admin` at /editor-preview.html; that page is not a build input, so this never reaches
// dist/. The fake API (src/testing/fakeApi.ts) holds the shared editor drafts (contracts/fixtures/activities/), one per
// type; saving, validating and publishing work against it in memory, and Play logs instead of playing. `?kind=SORT`
// (any kind in the fixture, or `new`) opens one directly.
import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import drafts from "../../../../contracts/fixtures/activities/editor-drafts.json";
import type { Definition } from "../api";
import { ActivityEditor } from "../editor/ActivityEditor";
import { NewActivityPage } from "../editor/NewActivity";
import "../global.css";
import { FakeAdminApi } from "../testing/fakeApi";

const DRAFTS = (drafts as { drafts: { kind: string; definition: Definition }[] }).drafts;

function Preview() {
  const fake = useMemo(() => {
    const api = new FakeAdminApi();
    for (const draft of DRAFTS) api.seed(draft.definition, 1);
    return api;
  }, []);
  const asked = new URL(window.location.href).searchParams.get("kind") ?? DRAFTS[0]?.kind ?? "";
  const [kind, setKind] = useState(asked);
  const [created, setCreated] = useState<string | null>(null);
  const draft = DRAFTS.find((d) => d.kind === kind);
  return (
    <div className="shell">
      <header className="top">
        <strong className="logo">Editor preview</strong>
        <nav aria-label="Preview kinds">
        <ul>
          {[...DRAFTS.map((d) => d.kind), "new"].map((k) => (
            <li key={k}>
              <button type="button" aria-pressed={k === kind} onClick={() => setKind(k)}>
                {k}
              </button>
            </li>
          ))}
        </ul>
        </nav>
      </header>
      <main className="page content">
        {kind === "new" && created === null && <NewActivityPage api={fake.api} navigate={(hash) => setCreated(hash.replace("#activities/", ""))} />}
        {kind === "new" && created !== null && <ActivityEditor key={created} api={fake.api} activityId={created} play={async () => undefined} />}
        {draft !== undefined && <ActivityEditor key={kind} api={fake.api} activityId={draft.definition.activityId} play={async () => undefined} />}
      </main>
    </div>
  );
}

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <Preview />
    </StrictMode>,
  );
