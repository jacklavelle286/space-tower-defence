// The clip store in IndexedDB (fake-indexeddb stands in for the browser's), and the memory fallback.
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { AUDIO_STORE, idbClipStore, localDbName, memoryClipStore, META_STORE, openLocalDb, readMeta, writeMeta } from "./clipStore";
import { sha256Hex, type StoredClip } from "./types";

async function clip(key: string, ...values: number[]): Promise<StoredClip> {
  const bytes = Uint8Array.from(values).buffer;
  return { clipKey: key, sha256: await sha256Hex(bytes), contentType: "audio/mpeg", byteLength: bytes.byteLength, bytes };
}

describe("openLocalDb", () => {
  it("creates scd-<sub> with the audio and meta stores", async () => {
    const factory = new IDBFactory();
    const db = await openLocalDb("sub-a", factory);
    expect(db).not.toBeNull();
    expect(db?.name).toBe(localDbName("sub-a"));
    expect([...(db?.objectStoreNames ?? [])].sort()).toEqual([AUDIO_STORE, META_STORE]);
    db?.close();
  });

  it("returns null without IndexedDB (private window, blocked site data): callers use memory", async () => {
    expect(await openLocalDb("sub-a", undefined)).toBeNull();
  });
});

describe("idbClipStore", () => {
  it("keeps one record per clipKey, and it is still there after the page reloads", async () => {
    const factory = new IDBFactory();
    const first = await openLocalDb("sub-a", factory);
    if (first === null) throw new Error("no db");
    const store = idbClipStore(first);
    await store.put(await clip("k1", 1, 2, 3));
    await store.put(await clip("k1", 1, 2, 3)); // the same clip twice: still one record
    first.close();

    const again = await openLocalDb("sub-a", factory); // a refresh opens the same database
    if (again === null) throw new Error("no db");
    const loaded = await idbClipStore(again).get("k1");
    expect(loaded?.byteLength).toBe(3);
    expect(Array.from(new Uint8Array(loaded?.bytes ?? new ArrayBuffer(0)))).toEqual([1, 2, 3]);
    expect(await idbClipStore(again).get("missing")).toBeNull();
    again.close();
  });

  it("another account's database does not see the clip", async () => {
    const factory = new IDBFactory();
    const a = await openLocalDb("sub-a", factory);
    const b = await openLocalDb("sub-b", factory);
    if (a === null || b === null) throw new Error("no db");
    await idbClipStore(a).put(await clip("k1", 7));
    expect(await idbClipStore(b).get("k1")).toBeNull();
  });

  it("meta values round-trip", async () => {
    const db = await openLocalDb("sub-a", new IDBFactory());
    if (db === null) throw new Error("no db");
    expect(await readMeta(db, "sessionId")).toBeNull();
    await writeMeta(db, "sessionId", "abc");
    expect(await readMeta(db, "sessionId")).toBe("abc");
  });
});

describe("memoryClipStore", () => {
  it("holds clips for this page load only", async () => {
    const store = memoryClipStore();
    expect(store.persistent).toBe(false);
    await store.put(await clip("k1", 5));
    expect((await store.get("k1"))?.byteLength).toBe(1);
    expect(await memoryClipStore().get("k1")).toBeNull();
  });
});
