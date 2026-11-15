// Seeded randomness (Phase 14, M1-21; spine S4 "wave randomness derives from (run seed, wave number)").
//
// Combat has no randomness at all (C2.2, C2.5): the same board and the same commands on the same ticks give the same
// result. This generator exists so that anything random-looking the battlefield ever needs comes from the run's
// seed and the wave number, never from Math.random. In mechanics 1 it only picks a cosmetic value per alien (which
// frame its walk animation starts on), so changing the generator can never change damage, credits or leaks.
//
// The state is one unsigned 32-bit integer and every function is pure: it takes a state and returns the value and
// the next state. That makes a battle's randomness part of its plain-data state, so a test can copy and compare it.

/** FNV-1a over the UTF-16 code units of `text`, as an unsigned 32-bit integer. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The generator's starting state for one wave of one run: a pure function of (run seed, wave). */
export function waveSeed(runSeed: string, wave: number): number {
  return fnv1a(`${runSeed}/${wave}`);
}

/** One step of mulberry32: returns an unsigned 32-bit value and the next state. */
export function nextRandom(state: number): { readonly value: number; readonly state: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: (t ^ (t >>> 14)) >>> 0, state: next };
}

/** An integer in [0, bound) and the next state. `bound` must be a positive integer below 2^32. */
export function nextInt(state: number, bound: number): { readonly value: number; readonly state: number } {
  if (!Number.isInteger(bound) || bound < 1 || bound > 0xffffffff) throw new RangeError(`nextInt: bad bound ${bound}`);
  const r = nextRandom(state);
  return { value: r.value % bound, state: r.state };
}
