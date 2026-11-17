// DEVELOPMENT ONLY: the level editor with no sign-in and no server (Gate M), on a copy of Moonbeam that owns the
// campaign, to try the Waves tab's difficulty curve (LD13) and the other tabs in a real browser. Served by
// `npm run dev -w admin` at /level-preview.html; not a build input, so never published.
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../global.css";
import { LevelEditor } from "../levels/LevelEditor";
import { newLevel } from "../levels/levelFile";
import { FakeAdminApi } from "../testing/fakeApi";

function Preview() {
  const fake = useMemo(() => new FakeAdminApi(), []);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Strict mode runs this twice: the second create finds the level there already, which is fine.
    void fake.api.createLevel(newLevel("moon-copy", "Moon copy", "moonbeam-campaign")).then(
      () => setReady(true),
      () => setReady(true),
    );
  }, [fake]);
  return <main className="page">{ready ? <LevelEditor api={fake.api} levelId="moon-copy" /> : <p>Loading…</p>}</main>;
}

const root = document.getElementById("root");
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <Preview />
    </StrictMode>,
  );
}
