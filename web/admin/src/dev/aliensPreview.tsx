// DEVELOPMENT ONLY: Levels → Aliens with no sign-in and no server (Gate M, AM1), to see the walk maker in a real
// browser. Served by `npm run dev -w admin` at /aliens-preview.html; not a build input, so never published. The fake
// API answers every drawing with a repository alien's frame 01 (`?alien=shell`, default blob), so Draw it shows the
// walk the animator makes from it.
import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import "../global.css";
import { AliensPage } from "../levels/aliens/AliensPage";
import { FakeAdminApi } from "../testing/fakeApi";

const DRAWINGS = import.meta.glob<string>("../../../../art/svg/aliens/alien-*-01.svg", { query: "?raw", import: "default", eager: true });

function Preview() {
  const fake = useMemo(() => {
    const api = new FakeAdminApi();
    const wanted = new URL(window.location.href).searchParams.get("alien") ?? "blob";
    const svg = Object.entries(DRAWINGS).find(([path]) => path.includes(`alien-${wanted}-`))?.[1] ?? "";
    for (let i = 0; i < 20; i += 1) api.nextJobScripts.push([{ state: "DRAWING", phase: "drawing" }, { state: "READY", svg }]);
    return api;
  }, []);
  return (
    <main className="page">
      <AliensPage api={fake.api} delay={() => 500} />
    </main>
  );
}

const root = document.getElementById("root");
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <Preview />
    </StrictMode>,
  );
}
