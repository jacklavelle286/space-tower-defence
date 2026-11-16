// How wide a word is in Andika 400 (the reading font, ADR-0013), in em. The choice tiles size their text from the
// widest word in the group (panel.css), so it must be the real width, not a letter count: "mummy" (0.71 em a letter)
// is far wider than "careless" (0.47 em a letter), and a count-based guess let "swimming" break as "swimmin|g".
//
// Advance widths in thousandths of an em, measured in Chrome with canvas measureText on the self-hosted
// @fontsource/andika latin-400 font (2026-11-16). Kerning is ignored; it only ever narrows a word, so the sum is safe.
const ADVANCE: Readonly<Record<string, number>> = {
  a: 562, b: 564, c: 498, d: 581, e: 535, f: 366, g: 549, h: 574, i: 276, j: 291, k: 505, l: 276, m: 823,
  n: 579, o: 557, p: 571, q: 552, r: 435, s: 471, t: 408, u: 579, v: 522, w: 757, x: 530, y: 518, z: 508,
  A: 681, B: 627, C: 662, D: 701, E: 566, F: 562, G: 693, H: 720, I: 476, J: 471, K: 640, L: 527, M: 876,
  N: 732, O: 713, P: 583, Q: 720, R: 637, S: 574, T: 618, U: 703, V: 667, W: 1016, X: 647, Y: 645, Z: 601,
  "0": 586, "1": 586, "2": 586, "3": 586, "4": 586, "5": 586, "6": 586, "7": 586, "8": 586, "9": 586,
  "'": 295, "’": 295, "-": 420, ".": 313, ",": 317, "?": 513, "!": 373,
};

/** A character not in the table (an accent, a symbol) counts as wide as W, so the guess errs towards smaller text. */
const UNKNOWN = 1016;

/** The width of one word in em. */
export function wordEm(word: string): number {
  let total = 0;
  for (const ch of word) total += ADVANCE[ch] ?? UNKNOWN;
  return total / 1000;
}

/** The widest word of a text in em: a phrase may wrap between words, a word should not. */
export function widestWordEm(text: string): number {
  return Math.max(0, ...text.split(/\s+/u).map(wordEm));
}
