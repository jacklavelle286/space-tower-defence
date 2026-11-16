// Shared by the player and admin apps (plan E.5.1). Import rule: no Phaser here (enforced by web/.oxlintrc.json),
// so the admin build stays small.
export { LIMITS, type Limits } from "./limits";
export { TOPICS, TOPICS_VERSION, topicById, type Topic } from "./topics";
export {
  canonicalise,
  canonicaliseSteps,
  decimal,
  isCanonicalAnswerShape,
  splitSteps,
  type AnswerSpec,
  type ArrangeSpec,
  type CanonicalResult,
  type DistributeSpec,
  type InteractionType,
  type MultipleChoiceSpec,
  type NumberSelectSpec,
  type PictureSelectSpec,
  type RawAnswer,
  type RefusalReason,
  type SortSpec,
  type TypedSpec,
} from "./learning/canonical";
export * from "./api";
export { isLibraryPictureId, LIBRARY_PICTURE_ID, libraryPictureUrl } from "./pictures";
