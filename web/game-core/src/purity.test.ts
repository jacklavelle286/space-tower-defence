// game-core must stay pure (plan E.5.1): no Phaser, React or app imports, and no browser or timer globals.
// The lint rule catches the same thing in the editor; this test makes it fail in `npm test` and CI too.
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
  "performance",
  "process",
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
    const { code } = scan(readFileSync(file, "utf8"));
    const bad = FORBIDDEN_GLOBALS.filter((name) => new RegExp(`(?<![.\\w$])${name}\\b`).test(code));
    expect(bad).toEqual([]);
  });
});
