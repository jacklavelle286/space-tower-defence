// The audio module (E.9, ADR-0015), imported as "@scd/shared/audio" so an app that does not play speech never bundles it.
export { ClipPlayer, type ClipLogEvent, type ClipPlayerOptions, type PlayState } from "./clipPlayer";
export {
  AUDIO_STORE,
  idbClipStore,
  LOCAL_DB_VERSION,
  localDbName,
  memoryClipStore,
  META_STORE,
  openLocalDb,
  readMeta,
  writeMeta,
  type ClipStore,
} from "./clipStore";
export { htmlAudioOutput, type AudioOutput } from "./output";
export { isSpeechResponse, sha256Hex, type ClipRef, type SpeechRequest, type SpeechResponse, type StoredClip } from "./types";
export { useClip, type ClipAvailability, type ClipControl } from "./useClip";
