// The learning panel (D6), imported as "@scd/shared/learning" so its CSS and the Andika font are bundled only by an
// app that shows it. The canonicaliser stays in the main "@scd/shared" entry too (no CSS there).
export { PANEL_COPY } from "./copy";
export {
  LearningPanel,
  type CheckResult,
  type LearningPanelProps,
  type PanelActivity,
  type PanelAttempt,
  type PanelAudio,
  type PanelOption,
  type PanelStatus,
} from "./LearningPanel";
