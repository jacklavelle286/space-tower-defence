import { BrowserRouter } from "react-router";
import { Shell } from "./shell/Shell";
import type { Services } from "./shell/services";
import "./shell/shell.css";

/**
 * The player app (Phase 21): landing, managed-login sign-in, profile setup and Home, with the sync queue and chip.
 * Routes (D2 [ASSUMPTION]): `/`, `/auth/callback`, `/setup`, `/home`, and in development `/play/local`.
 */
export function App({ services }: { services: Services }) {
  return (
    <BrowserRouter>
      <Shell services={services} />
    </BrowserRouter>
  );
}
