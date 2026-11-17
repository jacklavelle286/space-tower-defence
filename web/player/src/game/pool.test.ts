// The battlefield's object pool (Phase 26): objects are created once and reused; an effect pool with a limit recycles
// its oldest object instead of growing.
import { describe, expect, it } from "vitest";
import { Pool } from "./pool";

interface Fake {
  readonly n: number;
  visible: boolean;
}

function fakePool(limit?: number) {
  let made = 0;
  const resets: number[] = [];
  const pool = new Pool<Fake>(
    () => ({ n: (made += 1), visible: true }),
    (f) => {
      f.visible = false;
      resets.push(f.n);
    },
    limit,
  );
  return { pool, resets };
}

describe("Pool", () => {
  it("reuses released objects: a wave of 500 aliens, at most 60 alive at once, creates 60", () => {
    const { pool } = fakePool();
    const alive: Fake[] = [];
    for (let i = 0; i < 500; i += 1) {
      if (alive.length === 60) {
        const gone = alive.shift();
        if (gone !== undefined) pool.release(gone);
      }
      alive.push(pool.acquire());
    }
    expect(pool.created).toBe(60);
    expect(pool.inUse).toBe(60);
  });

  it("resets an object when it is released, and hands the same object out again", () => {
    const { pool, resets } = fakePool();
    const a = pool.acquire();
    pool.release(a);
    expect([a.visible, resets]).toEqual([false, [1]]);
    expect(pool.acquire()).toBe(a);
    expect(pool.created).toBe(1);
  });

  it("with a limit, takes back the oldest object in use instead of creating another (C14)", () => {
    const { pool, resets } = fakePool(3);
    const [a, b, c] = [pool.acquire(), pool.acquire(), pool.acquire()];
    const d = pool.acquire();
    expect(d).toBe(a);
    expect(resets).toEqual([1]);
    expect(pool.created).toBe(3);
    // The recycled object's first owner releasing it late changes nothing for its new owner.
    pool.release(b);
    pool.release(b);
    expect(pool.inUse).toBe(2);
    expect([c.visible, d.visible]).toEqual([true, false]); // d was reset when recycled; its new owner sets it up
  });

  it("releaseAll gives everything back for the next wave", () => {
    const { pool } = fakePool();
    for (let i = 0; i < 5; i += 1) pool.acquire();
    pool.releaseAll();
    expect(pool.inUse).toBe(0);
    for (let i = 0; i < 5; i += 1) pool.acquire();
    expect(pool.created).toBe(5);
  });
});
