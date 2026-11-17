// The game-data check (Gate M, LD6; ADR-0037): everything the publisher needs that is JavaScript, so each rule exists
// once. Given the live ruleset, the source planet document and a level file, it merges the level's sections onto the
// planet as `version`, parses the result (the same parser the player uses), runs the design rules, re-runs the two
// blocking balance checks, and returns the exact bytes of the planet document and its bounds file.
//
// Pure: no AWS, no clock, no randomness (the bots are seeded). The Python publisher (api/functions/game_data_publish)
// reads the inputs, writes the files and moves the pointers; this only judges and builds. Bounds come from here, never
// from a browser, because player-api trusts them (spine S6, ADR-0005).
import {
  boundsJson,
  boundsVersion,
  buildBounds,
  GameDataError,
  judgeChecks,
  levelOwnsField,
  mergeLevel,
  ownsCampaign,
  parsePlanet,
  parseRuleset,
  planChecks,
  planetProblems,
  problemMessage,
  runJob,
  type CheckFinding,
  type LevelSections,
  type PlanetDocument,
  type Ruleset,
} from "@scd/game-core";

/** The player-api reader refuses a game-data file over 1 MiB (api/shared/game_data.py MAX_FILE_BYTES). */
export const MAX_FILE_BYTES = 1024 * 1024;

export interface CheckInput {
  /** The live ruleset file (its `version` names the bounds file). */
  readonly ruleset: unknown;
  /** The source planet document (the live campaign version the draft was checked against). */
  readonly planet: unknown;
  readonly level: unknown;
  /** The campaign version to write (luna-1-a<n>); a validate run passes any valid placeholder. */
  readonly version: string;
  /** False for a quick validate: rules only, no balance checks. */
  readonly runBots: boolean;
}

export interface CheckProblem {
  readonly field: string;
  readonly rule: string;
  readonly severity: "hard" | "block" | "warn";
  readonly message: string;
}

export interface CheckOutput {
  /** True when nothing blocks: no hard or block problem, no blocking balance finding. */
  readonly ok: boolean;
  readonly problems: readonly CheckProblem[];
  readonly findings: readonly CheckFinding[];
  /** The exact bytes to publish, when the document parsed (null otherwise). */
  readonly planetJson: string | null;
  readonly boundsJson: string | null;
  readonly boundsVersion: string | null;
  /** Library pictures the level's map uses, for the publisher's approved-and-right-kind check. */
  readonly pictures: { readonly backdrops: readonly string[]; readonly decorations: readonly string[] };
  readonly waveSets: readonly string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function asLevel(raw: unknown): LevelSections {
  if (!isObj(raw) || raw["kind"] !== "level" || typeof raw["levelId"] !== "string" || !isObj(raw["map"])) {
    throw new GameDataError("level: not a level file");
  }
  if (!isObj(raw["challengeWaves"]) || !isObj(raw["waveSets"])) throw new GameDataError("level: no challengeWaves or waveSets");
  return raw as unknown as LevelSections;
}

/** The library pictures the level's own map names (repo decorations need no check). */
function levelPictures(level: LevelSections): CheckOutput["pictures"] {
  const art = isObj(level.map["art"]) ? level.map["art"] : {};
  const backdrop = art["backdrop"];
  const decorations = Array.isArray(art["decorations"]) ? art["decorations"] : [];
  const lib = (id: unknown): id is string => typeof id === "string" && id.startsWith("lib-");
  return {
    backdrops: lib(backdrop) ? [backdrop] : [],
    decorations: [...new Set(decorations.map((d) => (isObj(d) ? d["art"] : null)).filter(lib))].sort(),
  };
}

/** UTF-8 length without TextEncoder (not in the ES2023 lib this package type-checks against). */
export function utf8Bytes(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

const fail = (field: string, message: string): CheckProblem => ({ field, rule: "parse", severity: "hard", message });

export function check(input: CheckInput): CheckOutput {
  const empty = { backdrops: [], decorations: [] };
  let level: LevelSections;
  let ruleset: Ruleset;
  try {
    level = asLevel(input.level);
    ruleset = parseRuleset(input.ruleset);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, problems: [fail("level", message)], findings: [], planetJson: null, boundsJson: null, boundsVersion: null, pictures: empty, waveSets: [] };
  }
  const pictures = levelPictures(level);
  const waveSets = Object.keys(level.waveSets).sort();
  const refuse = (problems: CheckProblem[]): CheckOutput => ({ ok: false, problems, findings: [], planetJson: null, boundsJson: null, boundsVersion: null, pictures, waveSets });

  let merged: Record<string, unknown>;
  let planet: PlanetDocument;
  try {
    merged = mergeLevel(input.planet, level, input.version);
    planet = parsePlanet(merged, ruleset);
  } catch (error) {
    return refuse([fail("planet", error instanceof Error ? error.message : String(error))]);
  }

  // Only the level's own sections: a problem elsewhere in the live document is not this draft's to fix (and the live
  // document passed these rules when it was published).
  const problems: CheckProblem[] = planetProblems(planet, ruleset, { strictPadOrder: true })
    .filter((p) => levelOwnsField(level, p.field))
    .map((p) => ({ field: p.field, rule: p.rule, severity: p.severity, message: problemMessage(p) }));

  const planetJson = `${JSON.stringify(merged, null, 2)}\n`;
  const bounds = boundsJson(buildBounds(ruleset, planet));
  for (const [what, text] of [["planet", planetJson], ["bounds", bounds]] as const) {
    if (utf8Bytes(text) > MAX_FILE_BYTES) {
      problems.push({ field: what, rule: "fileTooLarge", severity: "block", message: `The ${what} file would be over 1 MiB.` });
    }
  }

  // The blocking balance checks (ADR-0032): the minimal player clears waves 1-5 of the campaign, the competent player
  // with no learning success clears every owned wave set. The warnings come from the editor's Test tab run (LD5).
  let findings: CheckFinding[] = [];
  const blockingProblem = problems.some((p) => p.severity !== "warn");
  if (input.runBots && !blockingProblem) {
    const owned = waveSets.filter((id) => id !== "campaign" || ownsCampaign(level));
    const jobs = planChecks(planet, owned).filter((j) => (j.policy === "competent" && j.learn === 0) || j.policy === "minimal");
    findings = judgeChecks(planet, ruleset, jobs.map((j) => runJob(ruleset, planet, j))).flatMap((r) => r.findings);
  }
  const ok = !blockingProblem && !findings.some((f) => f.severity === "block");
  return { ok, problems, findings, planetJson, boundsJson: bounds, boundsVersion: boundsVersion(ruleset.version, input.version), pictures, waveSets };
}

/**
 * A published planet document's bounds under another ruleset (Gate M, AM1; ADR-0041): when the publisher writes a new
 * ruleset (a made alien), every playable planet version needs a bounds file for it, or new runs on that version are
 * refused. The document is parsed as published (no merge, no version stamp); nothing is judged but the parse.
 */
export interface RebuildInput {
  readonly mode: "rebuild";
  readonly ruleset: unknown;
  readonly planet: unknown;
}

export interface RebuildOutput {
  readonly ok: boolean;
  readonly problems: readonly CheckProblem[];
  readonly boundsJson: string | null;
  readonly boundsVersion: string | null;
}

export function rebuild(input: RebuildInput): RebuildOutput {
  let ruleset: Ruleset;
  let planet: PlanetDocument;
  try {
    ruleset = parseRuleset(input.ruleset);
  } catch (error) {
    return { ok: false, problems: [fail("ruleset", error instanceof Error ? error.message : String(error))], boundsJson: null, boundsVersion: null };
  }
  try {
    planet = parsePlanet(input.planet, ruleset);
  } catch (error) {
    return { ok: false, problems: [fail("planet", error instanceof Error ? error.message : String(error))], boundsJson: null, boundsVersion: null };
  }
  const bounds = boundsJson(buildBounds(ruleset, planet));
  if (utf8Bytes(bounds) > MAX_FILE_BYTES) {
    return { ok: false, problems: [{ field: "bounds", rule: "fileTooLarge", severity: "block", message: "The bounds file would be over 1 MiB." }], boundsJson: null, boundsVersion: null };
  }
  return { ok: true, problems: [], boundsJson: bounds, boundsVersion: boundsVersion(ruleset.version, planet.version) };
}
