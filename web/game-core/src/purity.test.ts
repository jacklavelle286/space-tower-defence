// game-core must stay pure (plan E.5.1): no Phaser, React or app imports, and no browser or timer globals.
// The lint rule catches the same thing in the editor; this test makes it fail in `npm test` and CI too.
// Phase 28 (M2-10) adds the determinism half: no wall clock and no randomness from the host (Date, performance,
// Math.random, crypto, process.hrtime and friends). Time comes only from the clock's frame deltas, randomness only
// from the seeded generator (sim/rng.ts), so the same inputs give the same game on every machine (prompt.md:303).
// Aliased access (globalThis.window, globalThis["document"]) is not matched here: tsc rejects it, because
// game-core's tsconfig has lib ES2023 with no DOM and no Node types.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = import.meta.dirname;

const FORBIDDEN_MODULES = /^(phaser|react|react-dom)(\/|$)|^@scd\/(player|admin|shared)(\/|$)/;
const FORBIDDEN_GLOBALS = [
  "window",
  "self",
  "document",
  "location",
  "fetch",
  "indexedDB",
  "localStorage",
  "sessionStorage",
  "navigator",
  "requestAnimationFrame",
  // Time comes from the injected clock (Phase 10), never from the host.
  "setTimeout",
  "setInterval",
  "setImmediate",
  "queueMicrotask",
  "requestIdleCallback",
  "performance",
  "process",
  // No wall clock and no host randomness (Phase 28): Date.now(), new Date(), crypto.getRandomValues(), randomUUID().
  "Date",
  "crypto",
  "Temporal",
];

/**
 * Member accesses that are randomness or time from the host even though their object (Math) is fine to use.
 * `keepsString`: the pattern needs the string inside the brackets, so it is matched with strings kept (comments
 * are still blanked).
 */
const FORBIDDEN_MEMBERS: readonly { readonly name: string; readonly pattern: RegExp; readonly keepsString: boolean }[] = [
  { name: "Math.random", pattern: /\bMath\s*\.\s*random\b/, keepsString: false },
  { name: 'Math["random"]', pattern: /\bMath\s*\[\s*["'`]random["'`]\s*\]/, keepsString: true },
  { name: "hrtime", pattern: /\bhrtime\b/, keepsString: false },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name) && !/\.test\.[cm]?ts$/.test(entry.name) ? [path] : [];
  });
}

/**
 * One left-to-right pass over the source, so a "//" or "/*" inside a string is not taken for a comment.
 * Returns `withStrings` (comments blanked, strings kept: for finding import specifiers) and `code`
 * (comments and string contents blanked: for finding globals). Code inside `${...}` stays code.
 * Line breaks are kept so positions stay roughly the same.
 */
function scan(text: string): { withStrings: string; code: string } {
  let withStrings = "";
  let code = "";
  const templateDepths: number[] = []; // brace depth inside each open `${`
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === "/" && next === "/") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
      withStrings += " ";
      code += " ";
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      const j = end === -1 ? text.length : end + 2;
      const blank = text.slice(i, j).replace(/[^\n]/g, " ");
      withStrings += blank;
      code += blank;
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
      j += 1;
      withStrings += text.slice(i, j);
      code += ch + ch;
      i = j;
      continue;
    }
    const closesSubstitution = ch === "}" && templateDepths.at(-1) === 0;
    if (ch === "`" || closesSubstitution) {
      if (closesSubstitution) templateDepths.pop();
      let j = i + 1;
      let tail = "";
      while (j < text.length) {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === "`") {
          j += 1;
          tail = "`";
          break;
        }
        if (text[j] === "$" && text[j + 1] === "{") {
          j += 2;
          tail = "${";
          templateDepths.push(0);
          break;
        }
        j += 1;
      }
      withStrings += text.slice(i, j);
      code += ch + tail;
      i = j;
      continue;
    }
    const depth = templateDepths.pop();
    if (depth !== undefined) templateDepths.push(ch === "{" ? depth + 1 : ch === "}" ? depth - 1 : depth);
    withStrings += ch;
    code += ch;
    i += 1;
  }
  return { withStrings, code };
}

/** Every module specifier in import/export-from statements, dynamic import() calls and require() calls. */
function importedModules(text: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\b(?:import|export)\b[^;'"`]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["'`]([^"'`$]+)["'`]\s*[,)]/g,
    /\brequire\s*\(\s*["'`]([^"'`$]+)["'`]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) specifiers.push(match[1] ?? "");
  }
  return specifiers;
}

/** A relative or absolute path that leaves game-core/src (for example into ../../player/src). */
function leavesSrc(file: string, specifier: string): boolean {
  if (isAbsolute(specifier)) return true;
  if (!specifier.startsWith(".")) return false;
  const rel = relative(SRC, resolve(dirname(file), specifier));
  return rel.startsWith("..") || isAbsolute(rel);
}

describe("game-core purity", () => {
  const files = sourceFiles(SRC);

  it("has source files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [relative(SRC, file), file]))("%s imports no Phaser, React or app code", (_name, file) => {
    const modules = importedModules(scan(readFileSync(file, "utf8")).withStrings);
    const bad = modules.filter((m) => FORBIDDEN_MODULES.test(m) || leavesSrc(file, m));
    expect(bad).toEqual([]);
  });

  it.each(files.map((file) => [relative(SRC, file), file]))("%s uses no browser or timer globals", (_name, file) => {
    expect(forbiddenGlobals(readFileSync(file, "utf8"))).toEqual([]);
  });

  it.each(files.map((file) => [relative(SRC, file), file]))("%s reads no wall clock and no host randomness", (_name, file) => {
    expect(forbiddenMembers(readFileSync(file, "utf8"))).toEqual([]);
  });

  it("covers every source file, the Phase 28 ones included", () => {
    const names = files.map((file) => relative(SRC, file));
    for (const name of ["clock.ts", "sim/battle.ts", "sim/config.ts", "sim/frame.ts", "sim/rng.ts", "rules/reducer.ts", "data/game-data.ts"]) {
      expect(names).toContain(name);
    }
  });

  it("the checks find what they look for, and ignore it in comments and strings", () => {
    expect(forbiddenGlobals("const t = Date.now();")).toEqual(["Date"]);
    expect(forbiddenGlobals("const d = new Date();")).toEqual(["Date"]);
    expect(forbiddenGlobals("const t = performance.now();")).toEqual(["performance"]);
    expect(forbiddenGlobals("const id = crypto.randomUUID();")).toEqual(["crypto"]);
    expect(forbiddenMembers("const r = Math.random();")).toEqual(["Math.random"]);
    expect(forbiddenMembers('const r = Math["random"]();')).toEqual(['Math["random"]']);
    expect(forbiddenMembers("const r = Math.floor(x);")).toEqual([]);
    // In a comment or a string it is only words (battle.ts says "no Math.random" in its header).
    expect(forbiddenGlobals('// Date.now()\nconst s = "new Date() and performance";')).toEqual([]);
    expect(forbiddenMembers("/* Math.random */ const s = 'Math.random()';")).toEqual([]);
    // A property that happens to share a name is not the global: battle.tick, config.date, x.performance.
    expect(forbiddenGlobals("const a = obj.Date; const b = obj.performance;")).toEqual([]);
  });
});

/** The forbidden global names a source uses as code (not in comments or strings, not as a property of something). */
function forbiddenGlobals(text: string): string[] {
  const { code } = scan(text);
  return FORBIDDEN_GLOBALS.filter((name) => new RegExp(`(?<![.\\w$])${name}\\b`).test(code));
}

/** The forbidden member accesses a source uses as code (not in comments; not in strings, except Math["random"]). */
function forbiddenMembers(text: string): string[] {
  const { withStrings, code } = scan(text);
  return FORBIDDEN_MEMBERS.filter((m) => m.pattern.test(m.keepsString ? withStrings : code)).map((m) => m.name);
}
