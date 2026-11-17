// Object pooling for the battlefield (Phase 26; C14 performance budget).
//
// Creating a Phaser sprite allocates a game object, registers it with the scene and its display list, and destroying
// it later leaves garbage for the browser to collect. With up to 60 aliens coming and going and a star burst for every
// defeat, doing that per alien and per effect makes frame times uneven. A pool creates an object the first time one is
// needed and afterwards hands back one that was released: the number of objects ever created stays at the most that
// were in use at once.
//
// Pool knows nothing about Phaser, so it is tested with plain objects (pool.test.ts). The scene supplies `create`
// (make a hidden sprite) and `reset` (hide it and stop its animation).

export class Pool<T> {
  readonly #create: () => T;
  readonly #reset: (item: T) => void;
  readonly #limit: number;
  /** Released objects, ready to hand out again. */
  readonly #free: T[] = [];
  /** Objects in use, oldest first. */
  readonly #live: T[] = [];
  #created = 0;

  /**
   * `limit`: the most objects in use at once. When it is reached, acquire() takes back the oldest one in use (C14:
   * "when a pool is empty the oldest effect is recycled"), so an effect pool never grows past its budget. Leave it
   * out for a pool whose owner releases every object itself (aliens: the simulation keeps them at or below 60).
   */
  constructor(create: () => T, reset: (item: T) => void, limit = Number.POSITIVE_INFINITY) {
    this.#create = create;
    this.#reset = reset;
    this.#limit = limit;
  }

  /** An object to use: a released one if there is one, else the oldest in use if the limit is reached, else a new one. */
  acquire(): T {
    let item = this.#free.pop();
    if (item === undefined && this.#live.length >= this.#limit) {
      item = this.#live.shift();
      if (item !== undefined) this.#reset(item);
    }
    if (item === undefined) {
      item = this.#create();
      this.#created += 1;
    }
    this.#live.push(item);
    return item;
  }

  /** Give an object back. Releasing one that is not in use (already released, or recycled) does nothing. */
  release(item: T): void {
    const at = this.#live.indexOf(item);
    if (at === -1) return;
    this.#live.splice(at, 1);
    this.#reset(item);
    this.#free.push(item);
  }

  /** Give every object in use back. */
  releaseAll(): void {
    for (const item of [...this.#live]) this.release(item);
  }

  /** How many objects this pool has ever created. */
  get created(): number {
    return this.#created;
  }

  get inUse(): number {
    return this.#live.length;
  }
}
