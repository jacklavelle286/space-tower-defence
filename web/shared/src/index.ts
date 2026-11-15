// Shared by the player and admin apps (plan E.5.1). Import rule: no Phaser here (enforced by web/.oxlintrc.json),
// so the admin build stays small.
export { LIMITS, type Limits } from "./limits";
export {
  canonicalise,
  isCanonicalAnswerShape,
  type AnswerSpec,
  type CanonicalResult,
  type InteractionType,
  type MultipleChoiceSpec,
  type RefusalReason,
} from "./learning/canonical";
export * from "./api";
