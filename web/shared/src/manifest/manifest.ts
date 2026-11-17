// The asset manifest (Gate M, LD8; scope-asset-kinds-and-makers.md §3.0, scope-level-designer.md §3.2): which file draws
// each piece of art. Code names an asset by its catalogue ID ("alien-blob-walk", "route-straight-h"); the manifest says
// which frames, anchor and display size it has. Published at /game-data/asset-manifest/<version>.json, create-only, and
// pinned per run (`pins.assetManifestVersion`; a run saved before manifests existed has null, which reads as m1).
//
//   {"kind": "asset-manifest", "schema": 1, "version": "m1",
//    "assets": {"<catalogue id or lib- id>": {"frames": ["/assets/...png", ...], "anchor": [x, y], "size": [w, h]}},
//    "artSets": {"moon": {"<map role>": "<asset id>", ...}}}
//
// `m1` is generated from the repository's art tables (web/player/src/game/manifestSeed.test.ts), so it draws exactly
// what the code drew before. Art sets bind the map's roles (backdrop, the route tiles, portal, pads, colony; the keys of
// MAP_ART) to assets, so a planet can have its own look (LD9, LD10). URLs are same-origin only: /assets/ (the repo art)
// or /pictures/v1/lib-<32 hex>.png (approved library pictures), so the CSP stays img-src 'self'.
//
// Binding (`bindManifest`): every asset the code names resolves through the manifest; one the manifest does not list,
// or lists in a shape the code cannot draw (a still where the code animates, or the reverse), stays the repo asset. The
// scene loads the manifest's URL and, if that file fails, the repo file for the same texture key, so a missing picture
// never stops a battle. No manifest at all (it failed to load) is the repo art throughout.
import { frameUrl, MAP_ART, type ArtAsset } from "../map/art";

export const MANIFEST_SCHEMA = 1;
/** The manifest a run with no pinned version uses: the repo art as it was before manifests (LD8). */
export const DEFAULT_MANIFEST_VERSION = "m1";
/** The art set a map uses until planets choose one (LD10). */
export const DEFAULT_ART_SET = "moon";
/** The roles an art set must fill: the map's pieces, as MAP_ART names them. */
export const ART_SET_ROLES = Object.keys(MAP_ART) as readonly (keyof typeof MAP_ART)[];
export type ArtSetRole = (typeof ART_SET_ROLES)[number];

const ASSET_ID = /^[a-z0-9-]{1,40}$/u;
const VERSION = /^[a-z0-9.-]{1,40}$/u;
const URL_PATTERN = /^(?:\/assets\/[a-z0-9][a-z0-9/_.-]{0,150}\.(?:png|webp)|\/pictures\/v1\/lib-[0-9a-f]{32}\.png)$/u;
export const MAX_ASSETS = 400;
export const MAX_FRAMES = 16;
export const MAX_ART_SETS = 20;

export interface ManifestEntry {
  readonly frames: readonly string[];
  readonly anchor: readonly [number, number];
  readonly size: readonly [number, number];
}

export interface AssetManifest {
  readonly version: string;
  readonly assets: Readonly<Record<string, ManifestEntry>>;
  readonly artSets: Readonly<Record<string, Readonly<Record<ArtSetRole, string>>>>;
}

export class ManifestError extends Error {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function fail(path: string, why: string): never {
  throw new ManifestError(`${path}: ${why}`);
}

function exactKeys(o: Obj, path: string, keys: readonly string[]): void {
  for (const k of keys) if (!Object.hasOwn(o, k)) fail(path, `"${k}" is missing`);
  for (const k of Object.keys(o)) if (!keys.includes(k)) fail(path, `unknown key "${k}"`);
}

function pair(value: unknown, path: string, ok: (n: number) => boolean): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((n) => typeof n === "number" && Number.isFinite(n) && ok(n))) {
    fail(path, "must be two numbers in range");
  }
  return [value[0] as number, value[1] as number];
}

/** A manifest file, checked strictly (unknown keys refused). `version`, when given, must match the file's own. */
export function parseManifest(raw: unknown, version?: string): AssetManifest {
  if (!isObj(raw)) fail("manifest", "must be an object");
  exactKeys(raw, "manifest", ["kind", "schema", "version", "assets", "artSets"]);
  if (raw["kind"] !== "asset-manifest") fail("manifest.kind", 'must be "asset-manifest"');
  if (raw["schema"] !== MANIFEST_SCHEMA) fail("manifest.schema", `must be ${MANIFEST_SCHEMA}`);
  const v = raw["version"];
  if (typeof v !== "string" || !VERSION.test(v)) fail("manifest.version", "is malformed");
  if (version !== undefined && v !== version) fail("manifest.version", `is ${v}, expected ${version}`);
  const assetsRaw = raw["assets"];
  if (!isObj(assetsRaw) || Object.keys(assetsRaw).length > MAX_ASSETS) fail("manifest.assets", `must be an object of at most ${MAX_ASSETS}`);
  const assets: Record<string, ManifestEntry> = {};
  for (const [id, e] of Object.entries(assetsRaw)) {
    const at = `manifest.assets.${id}`;
    if (!ASSET_ID.test(id)) fail(at, "bad asset ID");
    if (!isObj(e)) fail(at, "must be an object");
    exactKeys(e, at, ["frames", "anchor", "size"]);
    const frames = e["frames"];
    if (!Array.isArray(frames) || frames.length < 1 || frames.length > MAX_FRAMES) fail(`${at}.frames`, `must list 1 to ${MAX_FRAMES} URLs`);
    for (const url of frames) if (typeof url !== "string" || !URL_PATTERN.test(url) || url.includes("..")) fail(`${at}.frames`, `bad URL ${JSON.stringify(url)}`);
    assets[id] = {
      frames: frames as string[],
      anchor: pair(e["anchor"], `${at}.anchor`, (n) => n >= 0 && n <= 1),
      size: pair(e["size"], `${at}.size`, (n) => Number.isInteger(n) && n >= 1 && n <= 4096),
    };
  }
  const setsRaw = raw["artSets"];
  if (!isObj(setsRaw) || Object.keys(setsRaw).length > MAX_ART_SETS) fail("manifest.artSets", `must be an object of at most ${MAX_ART_SETS}`);
  if (!Object.hasOwn(setsRaw, DEFAULT_ART_SET)) fail("manifest.artSets", `must have the "${DEFAULT_ART_SET}" set`);
  const artSets: Record<string, Record<ArtSetRole, string>> = {};
  for (const [setId, set] of Object.entries(setsRaw)) {
    const at = `manifest.artSets.${setId}`;
    if (!ASSET_ID.test(setId) || !isObj(set)) fail(at, "bad set");
    exactKeys(set, at, ART_SET_ROLES);
    for (const role of ART_SET_ROLES) {
      const id = set[role];
      if (typeof id !== "string" || !Object.hasOwn(assets, id)) fail(`${at}.${role}`, "must name an asset in this manifest");
    }
    artSets[setId] = set as Record<ArtSetRole, string>;
  }
  return { version: v, assets, artSets };
}

/** The manifest JSON for a list of repo assets and art sets (the m1 seed; LD10's publisher builds later ones). */
export function manifestFromArt(version: string, art: readonly ArtAsset[], artSets: Readonly<Record<string, Readonly<Record<ArtSetRole, string>>>>): Obj {
  const assets: Obj = {};
  for (const a of [...art].sort((x, y) => x.id.localeCompare(y.id))) {
    if (Object.hasOwn(assets, a.id)) continue;
    assets[a.id] = {
      frames: Array.from({ length: a.frames }, (_, i) => frameUrl(a, i + 1)),
      anchor: [...a.anchor],
      size: [...a.displaySize],
    };
  }
  return { kind: "asset-manifest", schema: MANIFEST_SCHEMA, version, assets, artSets };
}

/** The moon art set: each map role drawn by the repo asset MAP_ART names. */
export const MOON_ART_SET: Readonly<Record<ArtSetRole, string>> = Object.fromEntries(ART_SET_ROLES.map((role) => [role, MAP_ART[role].id])) as Record<
  ArtSetRole,
  string
>;

/** How the scene draws art for one run: through its manifest, falling back to the repo. */
export interface ArtBinding {
  /** The manifest's version, or null when there is none (repo art throughout). */
  readonly version: string | null;
  /** The asset as the manifest draws it (frames, URLs, anchor, size), or the repo asset itself. */
  asset(repo: ArtAsset): ArtAsset;
  /** A map piece through the art set: the asset the set names for `repo`'s role (MAP_ART), bound. */
  map(repo: ArtAsset, artSet?: string): ArtAsset;
  /** The repo URL to load instead when the manifest's file for `textureKey` fails, or null. */
  fallback(textureKey: string): string | null;
  /** Every bound asset to preload for these repo assets and the art set's pieces: [textureKey, url] per frame. */
  frames(repo: readonly ArtAsset[], artSet?: string): [string, string][];
}

const frameKeyOf = (a: ArtAsset, n: number): string => (a.frames === 1 ? a.id : `${a.id}-${String(n).padStart(2, "0")}`);
const ROLE_BY_ID = new Map<string, ArtSetRole>(ART_SET_ROLES.map((role) => [MAP_ART[role].id, role]));

/** The binding for a parsed manifest, or the repo binding for null. */
export function bindManifest(manifest: AssetManifest | null): ArtBinding {
  const fallbacks = new Map<string, string>();

  function entryAsset(id: string, shapeOf: ArtAsset): ArtAsset | null {
    const entry = manifest?.assets[id];
    if (entry === undefined) return null;
    // The code plays an animation by frame keys "<id>-01".., a still by "<id>": a manifest that turns one into the
    // other cannot be drawn by this code, so it is ignored (the repo asset stays).
    if ((shapeOf.frames === 1) !== (entry.frames.length === 1)) return null;
    return { id, path: shapeOf.path, frames: entry.frames.length, urls: entry.frames, anchor: entry.anchor, displaySize: entry.size };
  }

  function bound(repo: ArtAsset, id = repo.id): ArtAsset {
    const own = entryAsset(id, repo);
    if (own === null) return repo;
    for (let n = 1; n <= own.frames; n += 1) {
      const repoUrl = frameUrl(repo, Math.min(n, repo.frames));
      const url = frameUrl(own, n);
      const key = frameKeyOf(own, n);
      if (url !== repoUrl) fallbacks.set(key, repoUrl);
    }
    return own;
  }

  function map(repo: ArtAsset, artSet = DEFAULT_ART_SET): ArtAsset {
    const role = ROLE_BY_ID.get(repo.id);
    const id = role === undefined ? undefined : (manifest?.artSets[artSet] ?? manifest?.artSets[DEFAULT_ART_SET])?.[role];
    // Another asset may draw this role (a planet's own route tiles); its frames fall back to the repo piece's files.
    return bound(repo, id ?? repo.id);
  }

  return {
    version: manifest?.version ?? null,
    asset: (repo) => bound(repo),
    map,
    fallback: (key) => fallbacks.get(key) ?? null,
    frames(repo, artSet = DEFAULT_ART_SET) {
      const out = new Map<string, string>();
      for (const r of repo) {
        const a = ROLE_BY_ID.has(r.id) ? map(r, artSet) : bound(r);
        for (let n = 1; n <= a.frames; n += 1) out.set(frameKeyOf(a, n), frameUrl(a, n));
      }
      return [...out.entries()];
    },
  };
}

/** The repo art, as before manifests (no manifest, or one that failed to load). */
export const REPO_ART: ArtBinding = bindManifest(null);
