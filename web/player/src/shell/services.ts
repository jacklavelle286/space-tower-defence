import type { AuthPort } from "../auth/types";
import type { PlayerConfig } from "../config";

/** What the app needs from outside React; main.tsx builds the real set, local development a fake one. */
export interface Services {
  config: PlayerConfig;
  auth: AuthPort;
  /** Only the development backend replaces fetch; production uses the browser's. */
  fetchImpl?: typeof fetch;
  reload: () => void;
  /** Development builds also route /play/local to the Phase 14 local battlefield slice. */
  localPractice: boolean;
}
