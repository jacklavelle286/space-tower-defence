// The art the battlefield uses, loaded by path from /assets/ until the asset manifest exists (Phase 64).
//
// Each entry copies its catalogue entry in docs/art/asset-catalogue.json: the app path, the frame count and file
// pattern ({nn} = 01..frames), the anchor (normalised origin) and the display size on the 1920 x 1056 logical
// canvas. The PNGs are drawn at 2x (authorSize), so sprites are always shown scaled down to displaySize.
// assets.test.ts checks every entry against the catalogue, so a renamed or resized asset fails the tests.

export interface ArtAsset {
  /** Catalogue id; also the Phaser texture key (frame n of an animation is `${id}-${nn}`). */
  readonly id: string;
  /** URL path, with {nn} for an animation's frame number. */
  readonly path: string;
  readonly frames: number;
  readonly anchor: readonly [number, number];
  readonly displaySize: readonly [number, number];
}

const C = "/assets/common";
const L = "/assets/luna-1";

const still = (id: string, dir: string, anchor: readonly [number, number], size: readonly [number, number], file = `${id}.png`): ArtAsset => ({
  id,
  path: `${dir}/${file}`,
  frames: 1,
  anchor,
  displaySize: size,
});
const anim = (id: string, dir: string, frames: number, anchor: readonly [number, number], size: readonly [number, number]): ArtAsset => ({
  id,
  path: `${dir}/${id}-{nn}.png`,
  frames,
  anchor,
  displaySize: size,
});

const CENTRE = [0.5, 0.5] as const;
const FEET = [0.5, 1.0] as const;
const TILE = [96, 96] as const;

export const ART = {
  backdrop: still("luna-backdrop", L, [0, 0], [1920, 1056], "luna-backdrop.webp"),
  routeH: still("route-straight-h", L, CENTRE, TILE),
  routeDown: still("route-straight-v", L, CENTRE, TILE),
  routeUp: still("route-straight-up", L, CENTRE, TILE),
  cornerRightDown: still("route-corner-right-down", L, CENTRE, TILE),
  cornerDownRight: still("route-corner-down-right", L, CENTRE, TILE),
  cornerRightUp: still("route-corner-right-up", L, CENTRE, TILE),
  cornerUpRight: still("route-corner-up-right", L, CENTRE, TILE),
  portalEnd: still("route-portal-end", L, CENTRE, TILE),
  colonyEnd: still("route-colony-end", L, CENTRE, TILE),
  portal: anim("portal-idle", L, 6, [0.5, 0.62], [256, 256]),
  padEmpty: still("pad-empty", L, CENTRE, [128, 128]),
  padHover: still("pad-hover", L, CENTRE, [128, 128]),
  padSelected: still("pad-selected", L, CENTRE, [128, 128]),
  padClosed: still("pad-closed", L, CENTRE, [128, 128]),
  colonyHealthy: still("colony-healthy", L, FEET, [384, 384]),
  colonyWorried: still("colony-worried", L, FEET, [384, 384]),
  colonyVeryWorried: still("colony-very-worried", L, FEET, [384, 384]),
  novaIdle1: anim("nova-l1-idle", C, 4, FEET, [128, 128]),
  novaAttack1: anim("nova-l1-attack", C, 4, FEET, [128, 128]),
  novaIdle2: anim("nova-l2-idle", C, 4, FEET, [128, 128]),
  novaAttack2: anim("nova-l2-attack", C, 4, FEET, [128, 128]),
  novaIdle3: anim("nova-l3-idle", C, 4, FEET, [128, 128]),
  novaAttack3: anim("nova-l3-attack", C, 4, FEET, [128, 128]),
  pipIdle1: anim("pip-l1-idle", C, 4, FEET, [128, 128]),
  pipAttack1: anim("pip-l1-attack", C, 4, FEET, [128, 128]),
  pipIdle2: anim("pip-l2-idle", C, 4, FEET, [128, 128]),
  pipAttack2: anim("pip-l2-attack", C, 4, FEET, [128, 128]),
  pipIdle3: anim("pip-l3-idle", C, 4, FEET, [128, 128]),
  pipAttack3: anim("pip-l3-attack", C, 4, FEET, [128, 128]),
  junoIdle1: anim("juno-l1-idle", C, 4, FEET, [128, 128]),
  junoAttack1: anim("juno-l1-attack", C, 6, FEET, [128, 128]),
  junoIdle2: anim("juno-l2-idle", C, 4, FEET, [128, 128]),
  junoAttack2: anim("juno-l2-attack", C, 6, FEET, [128, 128]),
  junoIdle3: anim("juno-l3-idle", C, 4, FEET, [128, 128]),
  junoAttack3: anim("juno-l3-attack", C, 6, FEET, [128, 128]),
  orionIdle1: anim("orion-l1-idle", C, 4, FEET, [128, 128]),
  orionAttack1: anim("orion-l1-attack", C, 6, FEET, [128, 128]),
  orionIdle2: anim("orion-l2-idle", C, 4, FEET, [128, 128]),
  orionAttack2: anim("orion-l2-attack", C, 6, FEET, [128, 128]),
  orionIdle3: anim("orion-l3-idle", C, 4, FEET, [128, 128]),
  orionAttack3: anim("orion-l3-attack", C, 6, FEET, [128, 128]),
  // Mira and Sol never fire; their second animation (emit, pulse) is what plays when their effect happens (Phase 25).
  miraIdle1: anim("mira-l1-idle", C, 4, FEET, [128, 128]),
  miraEmit1: anim("mira-l1-emit", C, 4, FEET, [128, 128]),
  miraIdle2: anim("mira-l2-idle", C, 4, FEET, [128, 128]),
  miraEmit2: anim("mira-l2-emit", C, 4, FEET, [128, 128]),
  miraIdle3: anim("mira-l3-idle", C, 4, FEET, [128, 128]),
  miraEmit3: anim("mira-l3-emit", C, 4, FEET, [128, 128]),
  solIdle1: anim("sol-l1-idle", C, 4, FEET, [128, 192]),
  solPulse1: anim("sol-l1-pulse", C, 4, FEET, [128, 192]),
  solIdle2: anim("sol-l2-idle", C, 4, FEET, [128, 192]),
  solPulse2: anim("sol-l2-pulse", C, 4, FEET, [128, 192]),
  solIdle3: anim("sol-l3-idle", C, 4, FEET, [128, 192]),
  solPulse3: anim("sol-l3-pulse", C, 4, FEET, [128, 192]),
  novaBeam1: anim("fx-nova-beam-l1", C, 3, [0, 0.5], [64, 64]),
  novaBeam2: anim("fx-nova-beam-l2", C, 3, [0, 0.5], [64, 64]),
  novaBeam3: anim("fx-nova-beam-l3", C, 3, [0, 0.5], [64, 64]),
  // Aliens (Phase 26): one walk (or hover, fly, hop, bob) loop each, plus the trait overlays and one-shot effects.
  blobWalk: anim("alien-blob-walk", C, 6, FEET, [128, 128]),
  miteWalk: anim("alien-mite-walk", C, 6, FEET, [64, 64]),
  shellWalk: anim("alien-shell-walk", C, 6, FEET, [128, 128]),
  swarmBob: anim("alien-swarm-bob", C, 4, FEET, [32, 32]),
  flutterFly: anim("alien-flutter-fly", C, 6, FEET, [128, 128]),
  flutterShadow: still("alien-flutter-shadow", C, CENTRE, [64, 48]),
  guardWalk: anim("alien-guard-walk", C, 6, FEET, [128, 128]),
  guardLayers1: still("alien-guard-layers-1", C, CENTRE, [128, 128]),
  guardLayers2: still("alien-guard-layers-2", C, CENTRE, [128, 128]),
  guardLayers3: still("alien-guard-layers-3", C, CENTRE, [128, 128]),
  guardLayers4: still("alien-guard-layers-4", C, CENTRE, [128, 128]),
  guardPop: anim("alien-guard-pop", C, 4, CENTRE, [128, 128]),
  patchWalk: anim("alien-patch-walk", C, 6, FEET, [128, 128]),
  patchHeal: anim("alien-patch-heal", C, 6, CENTRE, [288, 288]),
  slimeWalk: anim("alien-slime-walk", C, 6, FEET, [128, 128]),
  slimeSplit: anim("alien-slime-split", C, 6, FEET, [128, 128]),
  slimeletHop: anim("alien-slimelet-hop", C, 4, FEET, [64, 64]),
  craftHover: anim("alien-craft-hover", C, 6, FEET, [256, 256]),
  craftRelease: anim("alien-craft-release", C, 6, FEET, [256, 256]),
  armourClonk: anim("fx-armour-clonk", C, 3, CENTRE, [64, 64]),
  healed: anim("fx-healed", C, 4, CENTRE, [64, 64]),
  popStars: anim("fx-pop-stars", C, 8, CENTRE, [128, 128]),
  leak: anim("fx-leak", C, 6, CENTRE, [128, 128]),
  place: anim("fx-place", C, 6, [0.5, 0.62], [128, 128]),
} as const satisfies Record<string, ArtAsset>;

export type ArtKey = keyof typeof ART;

/** Texture key of frame `n` (1-based) of an asset: the id itself for a still. */
export function frameKey(asset: ArtAsset, n: number): string {
  return asset.frames === 1 ? asset.id : `${asset.id}-${String(n).padStart(2, "0")}`;
}

/** URL of frame `n` (1-based). */
export function frameUrl(asset: ArtAsset, n: number): string {
  return asset.path.replace("{nn}", String(n).padStart(2, "0"));
}

/** Every [textureKey, url] pair to preload. */
export function allFrames(): [string, string][] {
  const out: [string, string][] = [];
  for (const asset of Object.values(ART)) {
    for (let n = 1; n <= asset.frames; n += 1) out.push([frameKey(asset, n), frameUrl(asset, n)]);
  }
  return out;
}

/** Each class's idle and action animations by level (index 0 = level 1). For Mira the action is "emit", for Sol "pulse". */
const ASTRONAUTS: Readonly<Record<string, readonly { readonly idle: ArtAsset; readonly attack: ArtAsset }[]>> = {
  nova: [
    { idle: ART.novaIdle1, attack: ART.novaAttack1 },
    { idle: ART.novaIdle2, attack: ART.novaAttack2 },
    { idle: ART.novaIdle3, attack: ART.novaAttack3 },
  ],
  pip: [
    { idle: ART.pipIdle1, attack: ART.pipAttack1 },
    { idle: ART.pipIdle2, attack: ART.pipAttack2 },
    { idle: ART.pipIdle3, attack: ART.pipAttack3 },
  ],
  juno: [
    { idle: ART.junoIdle1, attack: ART.junoAttack1 },
    { idle: ART.junoIdle2, attack: ART.junoAttack2 },
    { idle: ART.junoIdle3, attack: ART.junoAttack3 },
  ],
  orion: [
    { idle: ART.orionIdle1, attack: ART.orionAttack1 },
    { idle: ART.orionIdle2, attack: ART.orionAttack2 },
    { idle: ART.orionIdle3, attack: ART.orionAttack3 },
  ],
  mira: [
    { idle: ART.miraIdle1, attack: ART.miraEmit1 },
    { idle: ART.miraIdle2, attack: ART.miraEmit2 },
    { idle: ART.miraIdle3, attack: ART.miraEmit3 },
  ],
  sol: [
    { idle: ART.solIdle1, attack: ART.solPulse1 },
    { idle: ART.solIdle2, attack: ART.solPulse2 },
    { idle: ART.solIdle3, attack: ART.solPulse3 },
  ],
};

/** The animations that loop (idle) and play once (attack, emit, pulse), for the scene to register. */
export const ASTRONAUT_LOOPED: readonly ArtAsset[] = Object.values(ASTRONAUTS).flatMap((levels) => levels.map((l) => l.idle));
export const ASTRONAUT_ONE_SHOT: readonly ArtAsset[] = Object.values(ASTRONAUTS).flatMap((levels) => levels.map((l) => l.attack));

/** The idle and attack animations for an astronaut level: all six classes of C5.1 have art. */
export function astronautArt(classId: string, level: number): { idle: ArtAsset; attack: ArtAsset } {
  const art = ASTRONAUTS[classId]?.[level - 1];
  if (art === undefined) throw new Error(`no art for class ${classId} level ${level}`);
  return art;
}

/**
 * How each alien of C6.1 is drawn: its looped movement animation, and the one-shot it plays instead of the star burst
 * when it is defeated (the Split Slime splits, the Craft opens its doors). Keyed by the ruleset's alien ID.
 */
export interface AlienArt {
  readonly move: ArtAsset;
  readonly defeat: ArtAsset | null;
}

const ALIENS: Readonly<Record<string, AlienArt>> = {
  blob: { move: ART.blobWalk, defeat: null },
  mite: { move: ART.miteWalk, defeat: null },
  shell: { move: ART.shellWalk, defeat: null },
  swarm: { move: ART.swarmBob, defeat: null },
  flutter: { move: ART.flutterFly, defeat: null },
  guard: { move: ART.guardWalk, defeat: null },
  patch: { move: ART.patchWalk, defeat: null },
  slime: { move: ART.slimeWalk, defeat: ART.slimeSplit },
  slimelet: { move: ART.slimeletHop, defeat: null },
  craft: { move: ART.craftHover, defeat: ART.craftRelease },
};

/** Every alien's movement loop, for the scene to register. */
export const ALIEN_LOOPED: readonly ArtAsset[] = Object.values(ALIENS).map((a) => a.move);
export const ALIEN_ONE_SHOT: readonly ArtAsset[] = Object.values(ALIENS).flatMap((a) => (a.defeat === null ? [] : [a.defeat]));

/** The art for an alien type. A type with no art yet (a later ruleset's new alien) is drawn as a Moon Blob. */
export function alienArt(type: string): AlienArt {
  return ALIENS[type] ?? { move: ART.blobWalk, defeat: null };
}

/** True when `type` has its own art (assets.test.ts checks every alien in every ruleset). */
export function hasAlienArt(type: string): boolean {
  return Object.hasOwn(ALIENS, type);
}

/** The bubble overlay for a Bubble Guard with `layers` layers left (1 to 4), or null for none. */
export function bubbleLayersArt(layers: number): ArtAsset | null {
  const all = [ART.guardLayers1, ART.guardLayers2, ART.guardLayers3, ART.guardLayers4];
  return layers <= 0 ? null : (all[Math.min(layers, all.length) - 1] ?? null);
}

/** Nova's beam, drawn from her gadget to the alien she hit. Other classes' shot effects are not drawn yet. */
export function beamArt(level: number): ArtAsset {
  return level === 3 ? ART.novaBeam3 : level === 2 ? ART.novaBeam2 : ART.novaBeam1;
}
