// What changes between two planet documents (Gate M, LD7; scope-level-designer.md §3.1 step 12, §3.1a): the Publish
// tab's "against live" ("new map Zigzag; new wave set Blob Rush") and the Versions panel's comparison of any two
// versions. Both documents are read as schema 2 (game-core's asSchema2), so a schema 1 version compares with a newer
// one section by section. Pure: no network, no React.
import { asSchema2, mergeLevel } from "@scd/game-core";
import type { LevelFile } from "../../api";

export type DiffLine = {
  readonly change: "added" | "removed" | "changed";
  readonly section: "map" | "campaign waves" | "challenge wave" | "wave set" | "planet";
  readonly id: string;
  readonly name: string;
  /** For a change: which parts moved, for example ["route", "pads"] or ["waves 3, 7"]. */
  readonly parts: readonly string[];
};

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
/** JSON with object keys sorted, so key order (an editor's, or the publisher's) never reads as a change. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObj(value)) return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);
const nameOf = (entry: unknown, id: string): string => (isObj(entry) && typeof entry["name"] === "string" ? entry["name"] : id);

/** Which top-level keys of two objects differ, in a fixed order (keys of `after` first, then removed ones). */
function changedKeys(before: Json, after: Json, labels: Readonly<Record<string, string>> = {}): string[] {
  const keys = [...new Set([...Object.keys(after), ...Object.keys(before)])];
  return keys.filter((k) => !same(before[k], after[k])).map((k) => labels[k] ?? k);
}

function compareSection(section: DiffLine["section"], before: unknown, after: unknown, parts: (b: Json, a: Json) => string[]): DiffLine[] {
  const b = isObj(before) ? before : {};
  const a = isObj(after) ? after : {};
  const out: DiffLine[] = [];
  for (const id of Object.keys(a).sort()) {
    if (!Object.hasOwn(b, id)) out.push({ change: "added", section, id, name: nameOf(a[id], id), parts: [] });
    else if (!same(b[id], a[id])) out.push({ change: "changed", section, id, name: nameOf(a[id], id), parts: parts(isObj(b[id]) ? (b[id] as Json) : {}, isObj(a[id]) ? (a[id] as Json) : {}) });
  }
  for (const id of Object.keys(b).sort()) {
    if (!Object.hasOwn(a, id)) out.push({ change: "removed", section, id, name: nameOf(b[id], id), parts: [] });
  }
  return out;
}

const MAP_LABELS = { route: "route", pads: "pads", art: "backdrop or decorations", name: "name", grid: "grid" };

function mapParts(before: Json, after: Json): string[] {
  const parts = changedKeys(before, after, MAP_LABELS).filter((p) => p !== "backdrop or decorations");
  const art = (m: Json): Json => (isObj(m["art"]) ? m["art"] : {});
  if (!same(art(before)["backdrop"], art(after)["backdrop"])) parts.push("backdrop");
  if (!same(art(before)["decorations"], art(after)["decorations"])) parts.push("decorations");
  return parts;
}

/** Campaign waves (1-50) by number: which were added, removed or changed. */
function waveLines(before: unknown, after: unknown): DiffLine[] {
  const byNumber = (list: unknown): Map<number, unknown> =>
    new Map((Array.isArray(list) ? list : []).filter(isObj).map((w) => [Number(w["wave"]), w] as const));
  const b = byNumber(before);
  const a = byNumber(after);
  const changed = [...a.keys()].filter((n) => b.has(n) && !same(b.get(n), a.get(n))).sort((x, y) => x - y);
  const added = [...a.keys()].filter((n) => !b.has(n)).sort((x, y) => x - y);
  const removed = [...b.keys()].filter((n) => !a.has(n)).sort((x, y) => x - y);
  const list = (ns: number[]): string => (ns.length <= 12 ? ns.join(", ") : `${ns.slice(0, 12).join(", ")} and ${ns.length - 12} more`);
  const out: DiffLine[] = [];
  if (added.length > 0) out.push({ change: "added", section: "campaign waves", id: "waves", name: `waves ${list(added)}`, parts: [] });
  if (changed.length > 0) out.push({ change: "changed", section: "campaign waves", id: "waves", name: `waves ${list(changed)}`, parts: [] });
  if (removed.length > 0) out.push({ change: "removed", section: "campaign waves", id: "waves", name: `waves ${list(removed)}`, parts: [] });
  return out;
}

/** Every difference between two planet documents, section by section. */
export function diffPlanets(beforeRaw: unknown, afterRaw: unknown): DiffLine[] {
  const before = asSchema2(beforeRaw);
  const after = asSchema2(afterRaw);
  const out: DiffLine[] = [];
  if (!same(before["name"], after["name"])) out.push({ change: "changed", section: "planet", id: "name", name: nameOf(after, "planet"), parts: ["name"] });
  out.push(...compareSection("map", before["maps"], after["maps"], mapParts));
  out.push(...waveLines(before["waves"], after["waves"]));
  out.push(...compareSection("challenge wave", before["challengeWaves"], after["challengeWaves"], (b, a) => changedKeys(b, a)));
  out.push(...compareSection("wave set", before["waveSets"], after["waveSets"], (b, a) => changedKeys(b, a)));
  return out;
}

/** What publishing `level` onto the live document changes: the merged planet against live. */
export function levelDiff(liveRaw: unknown, level: LevelFile): DiffLine[] {
  return diffPlanets(liveRaw, mergeLevel(liveRaw, level, "draft"));
}

const VERB = { added: "New", removed: "Removed", changed: "Changed" } as const;

/** One line as the portal reads it: "New map Zigzag", "Changed wave set Blob Rush: waves, startCredits". */
export function diffText(line: DiffLine): string {
  if (line.section === "campaign waves") return `${VERB[line.change]} campaign ${line.name}`;
  const what = `${VERB[line.change]} ${line.section} ${line.name}`;
  return line.parts.length > 0 ? `${what}: ${line.parts.join(", ")}` : what;
}
