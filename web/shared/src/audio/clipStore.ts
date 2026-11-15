// Where clip bytes are kept in the browser (E.9; ADR-0015): the `audio` store of the per-account IndexedDB database
// `scd-<sub>` (spine S7.3), one record per `clipKey`. When IndexedDB is missing or refused (a private window, blocked
// site data), a memory store is used instead: Play still works for this page load, and the clip is fetched again
// after a reload.
import type { StoredClip } from "./types";

/** Version 1 of `scd-<sub>`: the stores this phase needs. The local op log (Phase 57) raises the version. */
export const LOCAL_DB_VERSION = 1;
export const AUDIO_STORE = "audio";
export const META_STORE = "meta";

export interface ClipStore {
  /** Bytes for this key, or null when not held (also null when the read fails). */
  get(clipKey: string): Promise<StoredClip | null>;
  /** Keep a verified clip. Rejects when the browser refuses (quota); the caller still has the bytes in hand. */
  put(clip: StoredClip): Promise<void>;
  /** False for the memory fallback: nothing survives a reload. */
  readonly persistent: boolean;
}

/** The account's database name. One database per account, so one child's data is never read for another. */
export function localDbName(sub: string): string {
  return `scd-${sub}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

/**
 * Opens (and on first use creates) `scd-<sub>`. Resolves null instead of failing when IndexedDB is unavailable or the
 * open is refused or blocked, so callers fall back to memory.
 */
export function openLocalDb(sub: string, factory: IDBFactory | undefined = globalThis.indexedDB): Promise<IDBDatabase | null> {
  if (factory === undefined) return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(localDbName(sub), LOCAL_DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) db.createObjectStore(AUDIO_STORE, { keyPath: "clipKey" });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function isStoredClip(value: unknown): value is StoredClip {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.clipKey === "string" &&
    typeof v.sha256 === "string" &&
    typeof v.contentType === "string" &&
    typeof v.byteLength === "number" &&
    v.bytes instanceof ArrayBuffer &&
    v.bytes.byteLength === v.byteLength
  );
}

/** The IndexedDB store. Only verified clips are ever put (the player checks `sha256` first). */
export function idbClipStore(db: IDBDatabase): ClipStore {
  return {
    persistent: true,
    async get(clipKey) {
      try {
        const value: unknown = await requestResult(db.transaction(AUDIO_STORE, "readonly").objectStore(AUDIO_STORE).get(clipKey));
        return isStoredClip(value) ? value : null;
      } catch {
        return null;
      }
    },
    async put(clip) {
      const tx = db.transaction(AUDIO_STORE, "readwrite");
      tx.objectStore(AUDIO_STORE).put({ ...clip });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB write aborted"));
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
      });
    },
  };
}

/** The fallback when IndexedDB is unavailable: this page load only. */
export function memoryClipStore(): ClipStore {
  const clips = new Map<string, StoredClip>();
  return {
    persistent: false,
    get: async (clipKey) => clips.get(clipKey) ?? null,
    put: async (clip) => {
      clips.set(clip.clipKey, clip);
    },
  };
}

/** A value in the `meta` store (e.g. the browser's play-session ID, spine S3.4), or null. */
export async function readMeta(db: IDBDatabase, key: string): Promise<unknown> {
  try {
    const record: unknown = await requestResult(db.transaction(META_STORE, "readonly").objectStore(META_STORE).get(key));
    return typeof record === "object" && record !== null ? (record as { value?: unknown }).value ?? null : null;
  } catch {
    return null;
  }
}

export async function writeMeta(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  const tx = db.transaction(META_STORE, "readwrite");
  tx.objectStore(META_STORE).put({ key, value });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB write aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
  });
}
