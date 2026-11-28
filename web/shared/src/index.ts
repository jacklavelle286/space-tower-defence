// Shared by the player and admin apps (plan E.5.1). Import rule: no Phaser here (enforced by web/.oxlintrc.json),
// so the admin build stays small.
export { LIMITS, type Limits } from "./limits";
export { bandName, bandRangeName, yearName } from "./schoolYears";
export { tabbable, trapTab } from "./focusTrap";
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
export {
  ACTIVITY_PICTURE_KINDS,
  DEFAULT_PICTURE_KIND,
  isActivityPictureKind,
  isLibraryPictureId,
  isPictureKind,
  LATER_PICTURE_KINDS,
  LIBRARY_PICTURE_ID,
  libraryPictureUrl,
  PICTURE_KINDS,
  pictureKindLabel,
  pictureKindOf,
  pictureKindSpec,
  type PictureKind,
  type PictureKindConsumer,
  type PictureKindId,
  type PictureKindSpec,
} from "./pictures";
