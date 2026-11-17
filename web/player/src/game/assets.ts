// The art the battlefield uses, loaded by path from /assets/ until the asset manifest exists (Phase 64). The map's
// entries and the ArtAsset type live in @scd/shared/map (Gate M, LD1).
//
// Each entry copies its catalogue entry in docs/art/asset-catalogue.json: the app path, the frame count and file
// pattern ({nn} = 01..frames), the anchor (normalised origin) and the display size on the 1920 x 1056 logical
// canvas. The PNGs are drawn at 2x (authorSize), so sprites are always shown scaled down to displaySize.
// assets.test.ts checks every entry against the catalogue, so a renamed or resized asset fails the tests.

import { anim, CENTRE, COMMON_DIR, FEET, frameKey, frameUrl, MAP_ART, still, type ArtAsset } from "@scd/shared/map";

export { frameKey, frameUrl, type ArtAsset } from "@scd/shared/map";

const C = COMMON_DIR;

export const ART = {
  // The map (route, portal, pads, colony) comes from @scd/shared/map, which the level editor draws from too (LD1).
  ...MAP_ART,
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
  // Bosses (Phase 27): a movement loop per phase, the one-shot that plays as each phase begins, and the effects.
  wobbleWalk: anim("boss-wobble-walk", C, 6, FEET, [384, 384]),
  wobbleDash: anim("boss-wobble-dash", C, 6, FEET, [384, 384]),
  wobblePhase: anim("boss-wobble-phase", C, 6, FEET, [384, 384]),
  clankFull: anim("boss-clank-full-walk", C, 6, FEET, [384, 384]),
  clankCracked: anim("boss-clank-cracked-walk", C, 6, FEET, [384, 384]),
  clankOff: anim("boss-clank-off-walk", C, 6, FEET, [384, 384]),
  clankPlatesFall: anim("boss-clank-platesfall", C, 6, FEET, [384, 384]),
  bubblaWalk: anim("boss-bubbla-walk", C, 6, FEET, [384, 384]),
  bubblaWand: anim("boss-bubbla-wand", C, 6, FEET, [384, 384]),
  bossBubbleFull: still("boss-bubbla-bubble-full", C, CENTRE, [384, 384]),
  bossBubbleThin: still("boss-bubbla-bubble-thin", C, CENTRE, [384, 384]),
  mothershipShut: anim("boss-mothership-shut-hover", C, 6, FEET, [384, 384]),
  mothershipDoor1Open: anim("boss-mothership-door1open-hover", C, 6, FEET, [384, 384]),
  mothershipDoor12Open: anim("boss-mothership-door12open-hover", C, 6, FEET, [384, 384]),
  mothershipBare: anim("boss-mothership-bare-hover", C, 6, FEET, [384, 384]),
  mothershipDoor1: anim("boss-mothership-door1", C, 6, FEET, [384, 384]),
  mothershipDoor2: anim("boss-mothership-door2", C, 6, FEET, [384, 384]),
  mothershipDoor3: anim("boss-mothership-door3", C, 6, FEET, [384, 384]),
  mothershipRelease: anim("boss-mothership-release", C, 6, FEET, [384, 384]),
  glorpArmoured: anim("boss-glorp-armoured-walk", C, 6, FEET, [384, 384]),
  glorpBubbled: anim("boss-glorp-bubbled-walk", C, 6, FEET, [384, 384]),
  glorpCargo: anim("boss-glorp-cargo-walk", C, 6, FEET, [384, 384]),
  glorpDash: anim("boss-glorp-dash-walk", C, 6, FEET, [384, 384]),
  glorpPhase: anim("boss-glorp-phase", C, 6, CENTRE, [384, 384]),
  glorpHatch: anim("boss-glorp-hatch", C, 6, FEET, [384, 384]),
  bossArrive: anim("fx-boss-arrive", C, 8, CENTRE, [384, 384]),
  bossPhaseFlash: anim("fx-boss-phase", C, 6, CENTRE, [384, 384]),
  armourClonk: anim("fx-armour-clonk", C, 3, CENTRE, [64, 64]),
  healed: anim("fx-healed", C, 4, CENTRE, [64, 64]),
  popStars: anim("fx-pop-stars", C, 8, CENTRE, [128, 128]),
  leak: anim("fx-leak", C, 6, CENTRE, [128, 128]),
  place: anim("fx-place", C, 6, [0.5, 0.62], [128, 128]),
} as const satisfies Record<string, ArtAsset>;

export type ArtKey = keyof typeof ART;

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

/**
 * A made alien's walk (Gate M, AM1; ADR-0041): the manifest's `alien-<type>-walk`, the six frames the portal made from
 * one drawing. Shaped like the Moon Blob's walk (anchor, size, frame count) and drawn from the Moon Blob's files when
 * the run's manifest has no such entry or a frame fails to load (bindManifest's fallback).
 */
export function madeAlienArt(type: string): ArtAsset {
  return { ...ART.blobWalk, id: `alien-${type}-walk` };
}

/** The art for an alien type: its own, or a made alien's walk from the manifest (a Moon Blob until that loads). */
export function alienArt(type: string): AlienArt {
  return ALIENS[type] ?? { move: madeAlienArt(type), defeat: null };
}

/** True when `type` has its own art (assets.test.ts checks every alien in every ruleset). */
export function hasAlienArt(type: string): boolean {
  return Object.hasOwn(ALIENS, type);
}

/**
 * How each boss of C7 is drawn, by the ruleset's boss ID. `phases[i]` is phase i's art: the loop it moves with, the
 * one-shot that plays on the boss itself as the phase begins (`enter`), and a burst drawn over it (`burst`, the Great
 * Glorp's phase change). Both are null for the first phase, which the boss arrives in. The art is the phase cue C7
 * asks for ("readable from shape and motion, not from a number"): Clank's plates fall, the Mothership's doors open one
 * by one, Wobble and the Glorp turn pink and steam for their dash.
 */
export interface BossPhaseArt {
  readonly move: ArtAsset;
  readonly enter: ArtAsset | null;
  readonly burst: ArtAsset | null;
}

export interface BossArt {
  readonly phases: readonly BossPhaseArt[];
  /** Played instead of the boss's walk when it is defeated, under the star burst (the Mothership's last door). */
  readonly defeat: ArtAsset | null;
}

const phase = (move: ArtAsset, enter: ArtAsset | null = null, burst: ArtAsset | null = null): BossPhaseArt => ({ move, enter, burst });

const BOSSES: Readonly<Record<string, BossArt>> = {
  boss1: { phases: [phase(ART.wobbleWalk), phase(ART.wobbleDash, ART.wobblePhase)], defeat: null },
  boss2: {
    phases: [phase(ART.clankFull), phase(ART.clankCracked, ART.clankPlatesFall), phase(ART.clankOff, ART.clankPlatesFall)],
    defeat: null,
  },
  // Her layers are drawn by the bubble overlay (bossBubbleArt); the wand wave is the gift.
  boss3: { phases: [phase(ART.bubblaWalk), phase(ART.bubblaWalk, ART.bubblaWand), phase(ART.bubblaWalk, ART.bubblaWand)], defeat: null },
  boss4: {
    phases: [
      phase(ART.mothershipShut),
      phase(ART.mothershipDoor1Open, ART.mothershipDoor1),
      phase(ART.mothershipDoor12Open, ART.mothershipDoor2),
      phase(ART.mothershipBare, ART.mothershipDoor3),
    ],
    defeat: ART.mothershipRelease,
  },
  // The Bubbled phase's ten layers are drawn by the bubble overlay too.
  boss5: {
    phases: [
      phase(ART.glorpArmoured),
      phase(ART.glorpBubbled, null, ART.glorpPhase),
      phase(ART.glorpCargo, ART.glorpHatch),
      phase(ART.glorpDash, null, ART.glorpPhase),
    ],
    defeat: null,
  },
};

/** Every boss phase's movement loop, and the one-shots, for the scene to register. */
export const BOSS_LOOPED: readonly ArtAsset[] = [...new Set(Object.values(BOSSES).flatMap((b) => b.phases.map((p) => p.move)))];
export const BOSS_ONE_SHOT: readonly ArtAsset[] = [
  ...new Set(
    Object.values(BOSSES).flatMap((b) => [...b.phases.flatMap((p) => [p.enter, p.burst]), b.defeat].filter((a): a is ArtAsset => a !== null)),
  ),
];

/** The art for a boss, or null when `type` is not a boss with art (an ordinary alien). */
export function bossArt(type: string): BossArt | null {
  return BOSSES[type] ?? null;
}

/** A boss's bubble (C7 Queen Bubbla, the Great Glorp's Bubbled phase): full while it has 5 or more layers, thin from 4
 *  down to 1, none at 0. */
export function bossBubbleArt(layers: number): ArtAsset | null {
  return layers <= 0 ? null : layers >= 5 ? ART.bossBubbleFull : ART.bossBubbleThin;
}

/** The bubble overlay for a Bubble Guard with `layers` layers left (1 to 4), or null for none. */
export function bubbleLayersArt(layers: number): ArtAsset | null {
  const all = [ART.guardLayers1, ART.guardLayers2, ART.guardLayers3, ART.guardLayers4];
  return layers <= 0 ? null : (all[Math.min(layers, all.length) - 1] ?? null);
}

/**
 * The meteor powers' effects (Phase 28, C10), kept apart from ART: the scene loads them only when the ruleset has
 * powers (powerFrames), so a game on a ruleset without them (the live r1) downloads nothing more. Keyed by the
 * power's effect, as the simulation's `power` event names it.
 *   slow    Frost Pulse: a frosty full-canvas overlay (the slowed aliens' frost tint comes from the battle state)
 *   burst   Comet Burst: an impact ring, 1.5 tiles across the route point it landed on
 *   shield  Colony Shield: the dome flaring over the colony
 */
export const POWER_ART = {
  slow: anim("fx-frost-pulse", C, 8, CENTRE, [1920, 1056]),
  burst: anim("fx-comet-impact", C, 8, CENTRE, [256, 256]),
  shield: anim("fx-colony-shield-boost", C, 6, FEET, [384, 384]),
} as const satisfies Record<"slow" | "burst" | "shield", ArtAsset>;

/** The [textureKey, url] pairs of the power effects, for a ruleset with powers. */
export function powerFrames(): [string, string][] {
  return Object.values(POWER_ART).flatMap((asset) => Array.from({ length: asset.frames }, (_, i): [string, string] => [frameKey(asset, i + 1), frameUrl(asset, i + 1)]));
}

/** Nova's beam, drawn from her gadget to the alien she hit. Other classes' shot effects are not drawn yet. */
export function beamArt(level: number): ArtAsset {
  return level === 3 ? ART.novaBeam3 : level === 2 ? ART.novaBeam2 : ART.novaBeam1;
}
