// The battle preview entry (Gate M, LD12): web/player's second build (vite.preview.config.ts), published on the admin
// site under /preview/. See BattlePreview.tsx.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../global.css";
import "../run/run.css";
import { BattlePreview } from "./BattlePreview";

const root = document.getElementById("root");
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <BattlePreview />
    </StrictMode>,
  );
}
