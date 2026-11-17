// The battlefield scene (Phase 14, M1-21): it draws the battle and turns pointer presses into selectPad. It decides
// nothing (spine S10, E.5.2): every position, level, shot and outcome comes from the game-core Battle the bridge
// holds, and the only things computed here are pixels and which animation frame to show.
//
// Each frame: bridge.frame(delta) advances the simulation by whole ticks, then the scene syncs one sprite per
// tower and per alien with the battle, and plays cosmetic effects (stars, leak puffs) for the events since the
// last frame. Beams are drawn from the tower's last shot (tick and landing point), so they are state, not timers.
//
// Phase 26: every alien of C6.1 is drawn with its own art, and the traits show (a Flutter's shadow, a Bubble Guard's
// remaining layers, a Patchling's heal ring, a Shellback's clonk, a Craft's doors opening). Alien sprites and one-shot
// effects come from pools (pool.ts): created once, hidden when done, and reused for the next alien or effect.
//
// Phase 27: the five bosses of C7 are drawn with their own art from the same alien pool. Each boss phase has its own
// movement loop, and the one-shot that plays on the boss as the phase begins (plates falling, a door opening, a wand
// wave) comes first; the scene reads the phase from the boss's AlienState, so it is state, not a timer. A boss's
// bubble layers show as a big bubble; it arrives with a ground ring and each phase starts with a flash.
//
// Phase 28: a meteor power's `power` event plays its effect (a frost wash over the field, a comet ring where the burst
// landed, the dome flaring over the colony). The effects are loaded only when the ruleset has powers, so the live r1
// game loads nothing new. Slowed aliens keep the frost tint they already had (state, not a timer).
// Gate E review: Sol never fires, so each astronaut a Sol boosts gets a glow, a gold link line from that Sol (from
// game-core's buffSourceAt, the simulation's own rule) and rising pluses. Only their motion uses the scene clock.
// Phase 31: with a shop card chosen, every open empty pad glows and the hovered (or keyboard-focused) one previews
// that class's range; a Comet Burst being aimed shows its ring on the route, and a press on the canvas drops it on
// the route point nearest the press (C10; the bridge pauses the battle while aiming, C2.1).
// Gate M (LD2): a map's own backdrop and decorations (mapArt.ts), each skipped if its file fails to load.
import { UNITS_PER_TILE, buffSourceAt, routePoint, type AlienState, type Battle, type BattleEvent } from "@scd/game-core";
import { REPO_ART, type ArtBinding } from "@scd/shared/manifest";
import { GameObjects, Loader, Scene, type Input } from "phaser";
import {
  ALIEN_LOOPED,
  ALIEN_ONE_SHOT,
  alienArt,
  ART,
  ASTRONAUT_LOOPED,
  POWER_ART,
  ASTRONAUT_ONE_SHOT,
  astronautArt,
  beamArt,
  BOSS_LOOPED,
  BOSS_ONE_SHOT,
  bossArt,
  bossBubbleArt,
  bubbleLayersArt,
  frameKey,
  hasAlienArt,
  madeAlienArt,
  type ArtAsset,
} from "./assets";
import type { GameBridge } from "./GameBridge";
import { sounds } from "../sound/board";
import { classSound } from "../sound/recipes";
import { nearestProgress } from "../hud/padNav";
import { pressedOnCanvas } from "./pointer";
import { Pool } from "./pool";
import { CANVAS_HEIGHT, CANVAS_WIDTH, colonyArt, mapEnds, routeTiles, TILE_PX, tileToPx, unitsToPx } from "./layout";
import { backdropKey, mapPicturesToLoad, placedDecorations } from "./mapArt";

/** Animation speed for every looped and one-shot animation, frames per second (cosmetic). */
const ANIM_FPS = 8;
/** How long a beam stays visible after a shot, in ticks (cosmetic, about 0.13 s at 1x). */
const BEAM_TICKS = 8;
/** Feet offsets: where a sprite's anchor sits relative to its tile centre, in pixels (art fit, see layout notes). */
const ALIEN_FEET_DY = 30;
const ASTRONAUT_FEET_DY = 18;
/** Beam start: Nova's gadget, relative to her feet (only Nova's beam is drawn). */
const GADGET_DX = 34;
const GADGET_DY = -46;
const BEAM_THICKNESS = 40;
/** The colony is drawn smaller than its 384 px catalogue size: the map's last column leaves room for about 240. */
const COLONY_PX = 240;
/** A slowed alien is drawn with a frost tint while its slow lasts (C5.4; cosmetic, read from the battle state). */
const FROST_TINT = 0x9fd8ff;
/** Sol's buff ring in the pad preview (C5.6), a different colour from an attacker's range circle. */
const BUFF_RING = 0xffc857;
/** The glow under an astronaut while a Sol boosts it (C5.6), read from the battle each frame (state, not a timer). */
const BOOST_GLOW_RX = 40;
const BOOST_GLOW_RY = 14;
/** The link from a Sol to each astronaut it boosts: a gold line at chest height with dots flowing along it. */
const BOOST_CHEST_DY = -44;
const BOOST_FLOW_MS = 900;
const BOOST_FLOW_DOTS = 3;
/** Pluses rising off a boosted astronaut: three at a time, each rising BOOST_PLUS_RISE px over BOOST_PLUS_MS. */
const BOOST_PLUS_MS = 1200;
const BOOST_PLUS_RISE = 56;
const BOOST_PLUS_TOP_DY = -128;
const BOOST_PLUS_DX = [-30, 0, 30] as const;
const BOOST_PLUS_ARM = 11;
const INK = 0x2a1e3d;
/** Where a flying alien's shadow sits, and the centre of a Bubble Guard's layers, relative to its feet (art fit). */
const SHADOW_DY = -4;
const LAYERS_DY = -48;
/** Where small effects on an alien (clonk, heal sparkle, layer pop) play, relative to its feet. */
const ON_ALIEN_DY = -40;
/** One-shot effects alive at once (C14 budgets 240 particles and 32 + 16 effects; one sprite here is one effect). */
const EFFECT_LIMIT = 64;
/**
 * Bosses are drawn smaller than their 384 px catalogue size (as the colony is): 288 px, three tiles, so a boss on the
 * route does not hide the pads two tiles away. Cosmetic only.
 */
const BOSS_PX = 288;
/** The centre of a boss's bubble, relative to its feet (art fit). */
const BOSS_BUBBLE_DY = -130;
/** The arrival ring lies on the ground (its art note: "squash to 4:3"). */
const BOSS_RING: readonly [number, number] = [BOSS_PX, (BOSS_PX * 3) / 4];

const LOOPED: readonly ArtAsset[] = [ART.portal, ART.colonyShieldOn, ...ALIEN_LOOPED, ...BOSS_LOOPED, ...ASTRONAUT_LOOPED, ART.novaBeam1, ART.novaBeam2, ART.novaBeam3];
const ONE_SHOT: readonly ArtAsset[] = [
  ART.colonyShieldBreak,
  ...ASTRONAUT_ONE_SHOT,
  ...ALIEN_ONE_SHOT,
  ...BOSS_ONE_SHOT,
  ART.bossArrive,
  ART.bossPhaseFlash,
  ART.popStars,
  ART.leak,
  ART.place,
  ART.guardPop,
  ART.patchHeal,
  ART.armourClonk,
  ART.healed,
];

/** The sprites that draw one alien; reused from the pool for the next alien when this one is gone. */
interface AlienView {
  readonly body: GameObjects.Sprite;
  /** A flying alien's shadow on the path below it (C6.1 Orbit Flutter). */
  readonly shadow: GameObjects.Image;
  /** A Bubble Guard's remaining layers (C6.1), or a boss's bubble (C7). */
  readonly layers: GameObjects.Image;
  /** For a boss, the phase whose art is showing; -1 for an ordinary alien (and while the view is in the pool). */
  phase: number;
}

interface TowerView {
  readonly classId: string;
  readonly sprite: GameObjects.Sprite;
  readonly beam: GameObjects.Sprite;
  level: number;
  lastShotSeen: number;
}

function place(sprite: GameObjects.Image | GameObjects.Sprite, asset: ArtAsset): void {
  sprite.setOrigin(asset.anchor[0], asset.anchor[1]).setDisplaySize(asset.displaySize[0], asset.displaySize[1]);
}

export class BattleScene extends Scene {
  readonly #bridge: GameBridge;
  #battle: Readonly<Battle> | null = null;
  readonly #pads = new Map<string, GameObjects.Image>();
  #hoverPad: string | null = null;
  readonly #towers = new Map<string, TowerView>();
  /** The view drawing each alien on the route, by alien id. Views come from and go back to #alienPool. */
  readonly #aliens = new Map<number, AlienView>();
  #alienPool: Pool<AlienView> | null = null;
  #effectPool: Pool<GameObjects.Sprite> | null = null;
  #colony: GameObjects.Image | null = null;
  /** The shield dome over the colony (Phase 65), and the shield points it showed last frame. */
  #dome: GameObjects.Sprite | null = null;
  /** The battle status last frame, for the wave start and clear sounds. */
  #status: Battle["status"] | null = null;
  #domeShield = 0;
  #range: GameObjects.Graphics | null = null;
  /** The Comet Burst aiming ring (Phase 31). */
  #aimRing: GameObjects.Graphics | null = null;
  /** Glows under the astronauts a Sol is boosting, so a Sol's work shows on the field (Sol never shoots). */
  #boost: GameObjects.Graphics | null = null;
  /** The pluses above boosted astronauts (drawn over the sprites). */
  #boostFx: GameObjects.Graphics | null = null;
  /** Pads that already had an astronaut when this wave's battle was made (no "placed" sparkle for those). */
  #restored = new Set<string>();

  /** How this run's art is drawn: through its pinned asset manifest, with the repo files as fallbacks (Gate M, LD8). */
  readonly #art: ArtBinding;

  constructor(bridge: GameBridge, art: ArtBinding = REPO_ART) {
    super("battle");
    this.#bridge = bridge;
    this.#art = art;
  }

  /** The asset as this run draws it: a map piece through the art set, anything else through the manifest. */
  #b(asset: ArtAsset): ArtAsset {
    return this.#art.map(asset, this.#bridge.config.artSet); // the planet's art set (LD10); moon by default
  }

  /** The LD11 route pieces this map uses (left turns, other caps): only those are loaded, so Moonbeam loads as before. */
  get #routeArt(): ArtAsset[] {
    const repo = new Set(Object.values(ART).map((a) => a.id));
    return [...new Map(routeTiles(this.#bridge.config.route.waypoints).map((t) => [t.art.id, t.art])).values()].filter((a) => !repo.has(a.id));
  }

  /** The walks of the ruleset's made aliens (Gate M, AM1): every alien type with no art of its own. */
  get #madeAliens(): ArtAsset[] {
    return Object.keys(this.#bridge.config.aliens).filter((type) => !hasAlienArt(type)).map(madeAlienArt);
  }

  /** True when the ruleset has meteor powers (C10; mechanics 3): only then are their effects loaded and played. */
  get #hasPowers(): boolean {
    return Object.keys(this.#bridge.config.powers).length > 0;
  }

  preload(): void {
    // Every frame as the run's manifest names it. A file that fails is loaded again from the repo under the same
    // texture key, once (Gate M, LD8): a missing picture never stops a battle.
    const retried = new Set<string>();
    this.load.on(Loader.Events.FILE_LOAD_ERROR, (file: Loader.File) => {
      const repo = this.#art.fallback(file.key);
      if (repo === null || retried.has(file.key)) return;
      retried.add(file.key);
      this.load.image(file.key, repo);
    });
    const repo = [...Object.values(ART), ...this.#routeArt, ...this.#madeAliens, ...(this.#hasPowers ? Object.values(POWER_ART) : [])];
    for (const [key, url] of this.#art.frames(repo, this.#bridge.config.artSet)) this.load.image(key, url);
    // The map's own backdrop and decorations (Gate M, LD2). One that fails to load is skipped in create().
    for (const { key, url } of mapPicturesToLoad(this.#bridge.config, this.#art)) if (!this.textures.exists(key)) this.load.image(key, url);
  }

  create(): void {
    const looped = [...LOOPED, ...this.#madeAliens];
    for (const repo of [...looped, ...ONE_SHOT, ...(this.#hasPowers ? Object.values(POWER_ART) : [])]) {
      const asset = this.#b(repo);
      if (this.anims.exists(asset.id)) continue;
      const frames = Array.from({ length: asset.frames }, (_, i) => ({ key: frameKey(asset, i + 1) }));
      this.anims.create({ key: asset.id, frames, frameRate: ANIM_FPS, repeat: looped.includes(repo) ? -1 : 0 });
    }
    const config = this.#bridge.config;

    // The map's own backdrop when it has one and it loaded; otherwise the repo Moonbeam ground (Gate M, LD2).
    const backdrop = this.add.image(0, 0, backdropKey(config, (key) => this.textures.exists(key), this.#b(ART.backdrop).id));
    place(backdrop, this.#b(ART.backdrop));
    backdrop.setDepth(0);
    for (const d of placedDecorations(config, this.#art)) {
      if (!this.textures.exists(d.key)) continue; // failed to load: skipped, never a broken battle
      this.add.image(d.x, d.y, d.key).setOrigin(d.anchor[0], d.anchor[1]).setDisplaySize(d.size[0], d.size[1]).setDepth(d.depth);
    }

    for (const tile of routeTiles(config.route.waypoints)) {
      const image = this.add.image(tileToPx(tile.x), tileToPx(tile.y), frameKey(this.#b(tile.art), 1));
      place(image, this.#b(tile.art));
      image.setDepth(1);
    }

    // The portal on the edge the route starts from, the colony over its last stretch (game-core routeEnds, which the
    // footprint rule uses too; LD11: any edge). A route heading right draws exactly where it always has.
    const ends = mapEnds(config.route.waypoints);
    const portalAt = ends?.portal ?? { x: 0, y: tileToPx(0) };
    const portal = this.add.sprite(portalAt.x, portalAt.y, frameKey(this.#b(ART.portal), 1));
    place(portal, this.#b(ART.portal));
    portal.setDepth(2).play(this.#b(ART.portal).id);

    const colonyAt = ends?.colony ?? { x: CANVAS_WIDTH - COLONY_PX / 2, y: CANVAS_HEIGHT / 2 };
    this.#colony = this.add.image(colonyAt.x, colonyAt.y + COLONY_PX / 2, frameKey(this.#b(ART.colonyHealthy), 1));
    place(this.#colony, this.#b(ART.colonyHealthy));
    this.#colony.setDisplaySize(COLONY_PX, COLONY_PX).setDepth(3);
    this.#dome = this.add.sprite(colonyAt.x, colonyAt.y + COLONY_PX / 2, frameKey(this.#b(ART.colonyShieldOn), 1));
    place(this.#dome, this.#b(ART.colonyShieldOn));
    this.#dome.setDisplaySize(COLONY_PX, COLONY_PX).setDepth(3.5).setVisible(false);

    for (const pad of config.pads) {
      const image = this.add.image(tileToPx(pad.x), tileToPx(pad.y), frameKey(this.#b(pad.open ? ART.padEmpty : ART.padClosed), 1));
      place(image, this.#b(ART.padEmpty));
      image.setDepth(4).setInteractive({ useHandCursor: pad.open });
      image.on("pointerdown", (pointer: Input.Pointer) => {
        // Phaser also listens on window and hit-tests presses that land on DOM overlays above the canvas (the
        // learning panel, the end screen, dialogs). Only a press on the canvas itself is a press on a pad.
        if (!pressedOnCanvas(pointer, this.game.canvas)) return;
        if (this.#bridge.aim !== null) return; // aiming: the canvas press below drops the power instead
        this.#bridge.selectPad(this.#bridge.selectedPad === pad.id ? null : pad.id);
      });
      image.on("pointerover", () => (this.#hoverPad = pad.id));
      image.on("pointerout", () => (this.#hoverPad = this.#hoverPad === pad.id ? null : this.#hoverPad));
      this.#pads.set(pad.id, image);
    }

    this.#range = this.add.graphics().setDepth(5);
    this.#aimRing = this.add.graphics().setDepth(26);
    // While aiming a Comet Burst, a press anywhere on the canvas drops it on the nearest route point.
    this.input.on("pointerdown", (pointer: Input.Pointer) => {
      if (this.#bridge.aim === null || !pressedOnCanvas(pointer, this.game.canvas)) return;
      const toUnits = (px: number) => ((px - TILE_PX / 2) * UNITS_PER_TILE) / TILE_PX;
      this.#bridge.aimAt(nearestProgress(this.#bridge.config.route, toUnits(pointer.x), toUnits(pointer.y)));
      this.#bridge.dropAim();
    });
    this.#boost = this.add.graphics().setDepth(6);
    this.#boostFx = this.add.graphics().setDepth(30);

    this.#alienPool = new Pool<AlienView>(
      () => ({
        body: this.add.sprite(0, 0, frameKey(this.#b(ART.blobWalk), 1)).setVisible(false),
        shadow: this.add.image(0, 0, frameKey(this.#b(ART.flutterShadow), 1)).setVisible(false),
        layers: this.add.image(0, 0, frameKey(this.#b(ART.guardLayers4), 1)).setVisible(false),
        phase: -1,
      }),
      (view) => {
        view.body.stop().clearTint().setVisible(false);
        view.shadow.setVisible(false);
        view.layers.setVisible(false);
        view.phase = -1;
      },
    );
    this.#effectPool = new Pool<GameObjects.Sprite>(
      () => this.add.sprite(0, 0, frameKey(this.#b(ART.popStars), 1)).setVisible(false),
      (sprite) => {
        sprite.off("animationcomplete");
        sprite.stop().setVisible(false);
      },
      EFFECT_LIMIT,
    );
  }

  override update(_time: number, delta: number): void {
    this.#bridge.frame(delta);
    const battle = this.#bridge.battle;
    if (battle !== this.#battle) this.#newBattle(battle);
    if (this.#bridge.paused && battle?.status === "IN_WAVE") this.anims.pauseAll();
    else this.anims.resumeAll();
    this.#drawPads(battle);
    if (battle === null) return;
    this.#drawTowers(battle);
    this.#drawAliens(battle);
    this.#drawColony(battle);
    if (battle.status !== this.#status) {
      if (battle.status === "IN_WAVE" && this.#status === "PREP") sounds.play("sfx-wave-start");
      if (battle.status === "CLEARED" && this.#status === "IN_WAVE") sounds.play("sfx-wave-clear");
      this.#status = battle.status;
    }
    for (const event of this.#bridge.takeSceneEvents()) this.#effect(event);
  }

  /** A new wave's battle: tower sprites go, alien views return to the pool; the next sync rebuilds from the new state. */
  #newBattle(battle: Readonly<Battle> | null): void {
    this.#domeShield = battle?.shield ?? 0; // a wave starts from its own shield: no break or flash for the change
    this.#status = battle?.status ?? null;
    for (const view of this.#towers.values()) {
      view.sprite.destroy();
      view.beam.destroy();
    }
    this.#towers.clear();
    this.#alienPool?.releaseAll();
    this.#aliens.clear();
    this.#battle = battle;
    this.#restored = new Set(battle?.towers.map((t) => t.padId) ?? []);
  }

  #drawPads(battle: Readonly<Battle> | null): void {
    const selected = this.#bridge.selectedPad;
    for (const pad of this.#bridge.config.pads) {
      const image = this.#pads.get(pad.id);
      if (image === undefined) continue;
      // A chosen shop card makes every open empty pad glow: those are the pads that would take it (D4 "Placing").
      const open = this.#bridge.isPadOpen(pad.id);
      const takes = this.#bridge.armed !== null && open && !(battle?.towers.some((t) => t.padId === pad.id) ?? false);
      if (image.input) image.input.cursor = open ? "pointer" : "default"; // a campaign pad opens mid-run (C3.3)
      const art = !open
        ? ART.padClosed
        : pad.id === selected
          ? ART.padSelected
          : pad.id === this.#hoverPad || takes
            ? ART.padHover
            : ART.padEmpty;
      const bound = this.#b(art);
      image.setTexture(frameKey(bound, 1)).setDisplaySize(bound.displaySize[0], bound.displaySize[1]);
    }
    // The range preview uses the simulation's own range for the tower's level (C3.1: the preview is the truth).
    const range = this.#range;
    if (range === null) return;
    range.clear();
    this.#drawAim();
    // A chosen card previews its level-1 range on the pad under the pointer, or the pad with keyboard focus (D4).
    const armed = this.#bridge.armed;
    const previewAt = this.#hoverPad ?? this.#bridge.focusedPad;
    const preview = this.#bridge.config.pads.find((p) => p.id === previewAt);
    if (armed !== null && preview !== undefined && this.#bridge.isPadOpen(preview.id) && !(battle?.towers.some((t) => t.padId === preview.id) ?? false)) {
      const first = this.#bridge.config.classes[armed]?.levels[0];
      const r = first?.shot?.rangeTiles ?? first?.buff?.radiusTiles;
      if (r !== undefined) {
        const colour = first?.shot ? 0xfff4d6 : BUFF_RING;
        range.fillStyle(colour, 0.12).fillCircle(tileToPx(preview.x), tileToPx(preview.y), r * TILE_PX);
        range.lineStyle(4, colour, 0.7).strokeCircle(tileToPx(preview.x), tileToPx(preview.y), r * TILE_PX);
      }
      return;
    }
    const tower = battle?.towers.find((t) => t.padId === selected);
    const pad = this.#bridge.config.pads.find((p) => p.id === selected);
    if (tower === undefined || pad === undefined) return;
    // An attacker shows its range; Sol shows the ring its buff reaches (pad centres inside it, C5.6); Mira has none.
    const level = this.#bridge.config.classes[tower.classId]?.levels[tower.level - 1];
    const radius = level?.shot?.rangeTiles ?? level?.buff?.radiusTiles;
    if (radius === undefined) return;
    const colour = level?.shot ? 0xfff4d6 : BUFF_RING;
    range.fillStyle(colour, 0.12).fillCircle(tileToPx(pad.x), tileToPx(pad.y), radius * TILE_PX);
    range.lineStyle(4, colour, 0.7).strokeCircle(tileToPx(pad.x), tileToPx(pad.y), radius * TILE_PX);
  }

  #drawTowers(battle: Readonly<Battle>): void {
    const present = new Set<string>();
    // Sol never fires (C5.6): Sol raises the damage of attackers whose pad the ring reaches. buffPctAt is the
    // simulation's own answer, so a glow appears exactly where the bonus applies.
    // The link line and pluses move with the scene clock: cosmetic only, like the animation frames.
    const boost = this.#boost;
    const fx = this.#boostFx;
    boost?.clear();
    fx?.clear();
    const now = this.time.now;
    for (const tower of battle.towers) {
      present.add(tower.padId);
      const pad = this.#bridge.config.pads.find((p) => p.id === tower.padId);
      if (pad === undefined) continue;
      const x = tileToPx(pad.x);
      const y = tileToPx(pad.y) + ASTRONAUT_FEET_DY;
      const art = astronautArt(tower.classId, tower.level);
      const source = boost === null || fx === null ? null : buffSourceAt(battle, tower.padId);
      const solPad = source === null ? undefined : this.#bridge.config.pads.find((p) => p.id === source.solPadId);
      if (boost !== null && fx !== null && solPad !== undefined) {
        this.#drawBoost(boost, fx, now, { x: tileToPx(solPad.x), y: tileToPx(solPad.y) + ASTRONAUT_FEET_DY }, { x, y }, pad.x + pad.y);
      }
      let view = this.#towers.get(tower.padId);
      // A sale and a purchase on the same pad within one frame (or one tick) leave a different class there.
      if (view !== undefined && view.classId !== tower.classId) {
        view.sprite.destroy();
        view.beam.destroy();
        view = undefined;
      }
      if (view === undefined) {
        const sprite = this.add.sprite(x, y, frameKey(this.#b(art.idle), 1));
        place(sprite, this.#b(art.idle));
        sprite.setDepth(10 + y / 1000).play(this.#b(art.idle).id);
        const beam = this.add.sprite(x, y, frameKey(this.#b(beamArt(tower.level)), 1)).setVisible(false).setDepth(9);
        view = { classId: tower.classId, sprite, beam, level: tower.level, lastShotSeen: tower.lastShotTick };
        this.#towers.set(tower.padId, view);
        if (!this.#restored.has(tower.padId)) {
          this.#playOnce(ART.place, x, y - 8, 9);
          sounds.play("sfx-place");
        }
      }
      if (view.level !== tower.level) {
        if (view.level < tower.level) sounds.play("sfx-upgrade");
        view.level = tower.level;
        view.sprite.play(this.#b(art.idle).id);
      }
      const shot = tower.lastShotAt;
      if (tower.lastShotTick !== view.lastShotSeen) {
        view.lastShotSeen = tower.lastShotTick;
        if (shot !== null) view.sprite.setFlipX(unitsToPx(shot.x) < x);
        view.sprite.play(this.#b(art.attack).id).chain(this.#b(art.idle).id);
      }
      // Only Nova has a beam; the other classes' shot effects (frost, comet, orbit shot) are not drawn yet.
      const showBeam =
        tower.classId === "nova" &&
        battle.status === "IN_WAVE" &&
        shot !== null &&
        tower.lastShotTick >= 0 &&
        battle.tick - tower.lastShotTick < BEAM_TICKS;
      view.beam.setVisible(showBeam);
      if (showBeam) {
        const beamAsset = this.#b(beamArt(tower.level));
        const sx = x + (view.sprite.flipX ? -GADGET_DX : GADGET_DX);
        const sy = y + GADGET_DY;
        const tx = unitsToPx(shot.x);
        const ty = unitsToPx(shot.y) + ALIEN_FEET_DY - 50;
        const length = Math.hypot(tx - sx, ty - sy);
        if (view.beam.anims.currentAnim?.key !== beamAsset.id) view.beam.play(beamAsset.id);
        view.beam
          .setPosition(sx, sy)
          .setOrigin(beamAsset.anchor[0], beamAsset.anchor[1])
          .setDisplaySize(Math.max(length, 1), BEAM_THICKNESS)
          .setRotation(Math.atan2(ty - sy, tx - sx));
      }
    }
    for (const [padId, view] of this.#towers) {
      if (present.has(padId)) continue;
      view.sprite.destroy();
      view.beam.destroy();
      this.#towers.delete(padId);
      sounds.play("sfx-sell"); // sent home (a new wave clears the views in #newBattle, not here)
    }
  }

  /**
   * One Sol boost (C5.6), from the Sol's feet `from` to the boosted astronaut's feet `to`: a glow at the astronaut's
   * feet, a gold line between their chests with dots flowing from the Sol, and pluses rising off the astronaut.
   * `seed` staggers the pluses so neighbouring astronauts do not pulse in step.
   */
  #drawBoost(
    under: GameObjects.Graphics,
    over: GameObjects.Graphics,
    now: number,
    from: { x: number; y: number },
    to: { x: number; y: number },
    seed: number,
  ): void {
    under.fillStyle(BUFF_RING, 0.45).fillEllipse(to.x, to.y, BOOST_GLOW_RX * 2, BOOST_GLOW_RY * 2);
    under.lineStyle(3, BUFF_RING, 0.9).strokeEllipse(to.x, to.y, BOOST_GLOW_RX * 2, BOOST_GLOW_RY * 2);
    const ax = from.x;
    const ay = from.y + BOOST_CHEST_DY;
    const bx = to.x;
    const by = to.y + BOOST_CHEST_DY;
    under.lineStyle(16, BUFF_RING, 0.3).lineBetween(ax, ay, bx, by);
    under.lineStyle(6, BUFF_RING, 0.9).lineBetween(ax, ay, bx, by);
    for (let i = 0; i < BOOST_FLOW_DOTS; i++) {
      const q = (now / BOOST_FLOW_MS + i / BOOST_FLOW_DOTS) % 1;
      under.fillStyle(0xffffff, 0.9).fillCircle(ax + (bx - ax) * q, ay + (by - ay) * q, 7);
    }
    BOOST_PLUS_DX.forEach((dx, i) => {
      const p = (now / BOOST_PLUS_MS + i / BOOST_PLUS_DX.length + seed * 0.37) % 1;
      const cx = to.x + dx;
      const cy = to.y + BOOST_PLUS_TOP_DY - p * BOOST_PLUS_RISE;
      const alpha = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
      const a = BOOST_PLUS_ARM;
      over.fillStyle(INK, alpha).fillRect(cx - a - 3, cy - 6, (a + 3) * 2, 12).fillRect(cx - 6, cy - a - 3, 12, (a + 3) * 2);
      over.fillStyle(BUFF_RING, alpha).fillRect(cx - a, cy - 3, a * 2, 6).fillRect(cx - 3, cy - a, 6, a * 2);
    });
  }

  /** The Comet Burst ring while aiming: its true radius on the ground, squashed to 4:3 like the impact art. */
  #drawAim(): void {
    const ring = this.#aimRing;
    if (ring === null) return;
    ring.clear();
    const aim = this.#bridge.aim;
    if (aim === null) return;
    const effect = this.#bridge.config.powers[aim.powerId]?.effect;
    const radius = (effect?.kind === "burst" ? effect.radiusTiles : 1.5) * TILE_PX;
    const at = routePoint(this.#bridge.config.route, aim.target);
    const x = unitsToPx(at.x);
    const y = unitsToPx(at.y);
    ring.fillStyle(0xff9f43, 0.18).fillEllipse(x, y, radius * 2, radius * 1.5);
    ring.lineStyle(6, 0xff9f43, 0.95).strokeEllipse(x, y, radius * 2, radius * 1.5);
    ring.lineStyle(4, 0x2a1e3d, 0.9).lineBetween(x - 14, y, x + 14, y).lineBetween(x, y - 14, x, y + 14);
  }

  /** An alien's feet on the canvas, in pixels. */
  #feet(alien: Readonly<AlienState>): { x: number; y: number } {
    const p = routePoint(this.#bridge.config.route, alien.progress);
    return { x: unitsToPx(p.x), y: unitsToPx(p.y) + ALIEN_FEET_DY };
  }

  /** Set a pooled view up for a newly arrived alien: its own art, its walk started at its seeded frame. */
  #setUpAlien(view: AlienView, alien: Readonly<AlienState>): void {
    const boss = bossArt(alien.type);
    if (boss !== null) {
      // A boss arrives in its first phase (C7), with a ring on the ground where it appears.
      const move = boss.phases[alien.phase]?.move ?? ART.wobbleWalk;
      view.body.setTexture(frameKey(this.#b(move), 1));
      place(view.body, this.#b(move));
      view.body.setDisplaySize(BOSS_PX, BOSS_PX).setVisible(true).play(this.#b(move).id);
      view.phase = alien.phase;
      const { x, y } = this.#feet(alien);
      this.#playOnce(ART.bossArrive, x, y, 8, BOSS_RING);
      sounds.play("sfx-boss-arrive");
      return;
    }
    const art = this.#b(alienArt(alien.type).move);
    view.body.setTexture(frameKey(art, 1));
    place(view.body, art);
    // The seeded look picks the starting frame, so a group does not bob in step (cosmetic).
    view.body.setVisible(true).play({ key: art.id, startFrame: alien.look % art.frames });
    place(view.shadow, this.#b(ART.flutterShadow));
    view.shadow.setVisible(this.#bridge.config.aliens[alien.type]?.flying === true);
  }

  #drawAliens(battle: Readonly<Battle>): void {
    const pool = this.#alienPool;
    if (pool === null) return;
    const present = new Set<number>();
    for (const alien of battle.aliens) {
      present.add(alien.id);
      const { x, y } = this.#feet(alien);
      let view = this.#aliens.get(alien.id);
      if (view === undefined) {
        view = pool.acquire();
        this.#setUpAlien(view, alien);
        this.#aliens.set(alien.id, view);
      }
      const depth = 10 + y / 1000;
      view.body.setPosition(x, y).setDepth(depth);
      if (alien.slowTicksLeft > 0) view.body.setTint(FROST_TINT);
      else view.body.clearTint();
      if (view.shadow.visible) view.shadow.setPosition(x, y + SHADOW_DY).setDepth(depth - 0.0005);
      const boss = bossArt(alien.type);
      if (boss !== null && view.phase !== alien.phase) {
        // A new phase (C7): its cue plays on the boss, then its new movement loop. If one hit crossed two thresholds,
        // the deepest phase's cue is the one shown.
        view.phase = alien.phase;
        const art = boss.phases[alien.phase];
        if (art !== undefined) {
          if (art.enter === null) view.body.play(this.#b(art.move).id);
          else view.body.play(this.#b(art.enter).id).chain(this.#b(art.move).id);
        }
      }
      // The layers it has left: the overlay shrinks a ring at each pop and goes when the last one pops. A boss's
      // layers are one big bubble around it, and an alien Queen Bubbla gave a layer gets the Bubble Guard's ring.
      const layers = boss === null ? bubbleLayersArt(alien.bubbles) : bossBubbleArt(alien.bubbles);
      view.layers.setVisible(layers !== null);
      if (layers !== null) {
        view.layers
          .setTexture(frameKey(this.#b(layers), 1))
          .setPosition(x, y + (boss === null ? LAYERS_DY : BOSS_BUBBLE_DY))
          .setDepth(depth + 0.0005);
        place(view.layers, this.#b(layers));
        if (boss !== null) view.layers.setDisplaySize(BOSS_PX, BOSS_PX);
      }
    }
    for (const [id, view] of this.#aliens) {
      if (present.has(id)) continue;
      pool.release(view);
      this.#aliens.delete(id);
    }
  }

  #drawColony(battle: Readonly<Battle>): void {
    const art = colonyArt(battle.health, this.#bridge.config.colony.maxHealth);
    this.#colony?.setTexture(frameKey(this.#b(art), 1)).setDisplaySize(COLONY_PX, COLONY_PX);
    this.#drawShield(battle.shield);
  }

  /**
   * The dome over the colony while it holds shield points (Phase 65; C4, C5.5, C10): stronger the fuller the shield
   * (against shieldCap; a Colony Shield above it shows full), a flash when a leak takes points off, the break when the
   * last point goes. A new wave starts from its own shield without a break.
   */
  #drawShield(shield: number): void {
    const dome = this.#dome;
    if (dome === null) return;
    const before = this.#domeShield;
    this.#domeShield = shield;
    if (shield > 0) {
      const full = Math.max(1, this.#bridge.config.colony.shieldCap);
      dome.setAlpha(0.45 + 0.55 * Math.min(1, shield / full));
      if (!dome.visible) dome.setVisible(true).play(this.#b(ART.colonyShieldOn).id);
      if (shield < before) this.#shieldHit(dome.x, dome.y);
      return;
    }
    if (!dome.visible) return;
    dome.setVisible(false).stop();
    if (before > 0) this.#playOnce(ART.colonyShieldBreak, dome.x, dome.y, 3.6, [COLONY_PX, COLONY_PX]);
  }

  /** A short flash over the dome where a leak hit it. */
  #shieldHit(x: number, y: number): void {
    const flash = this.add.image(x, y, frameKey(this.#b(ART.colonyShieldHit), 1));
    place(flash, this.#b(ART.colonyShieldHit));
    flash.setDisplaySize(COLONY_PX, COLONY_PX).setDepth(3.6);
    this.tweens.add({ targets: flash, alpha: 0, duration: 350, onComplete: () => flash.destroy() });
  }

  #effect(event: BattleEvent): void {
    const battle = this.#bridge.battle;
    /** The alien an event is about, if it is still on the route (a hit may also have defeated it). */
    const living = (id: number) => battle?.aliens.find((a) => a.id === id);
    switch (event.kind) {
      case "defeated": {
        const x = unitsToPx(event.at.x);
        const y = unitsToPx(event.at.y) + ALIEN_FEET_DY;
        const boss = bossArt(event.type);
        if (boss !== null) {
          // A boss pops into a large star burst (C7); the Mothership's last door opens under it first.
          if (boss.defeat !== null) this.#playOnce(boss.defeat, x, y, 19, [BOSS_PX, BOSS_PX]);
          this.#playOnce(ART.popStars, x, y - BOSS_PX / 2, 20, [BOSS_PX, BOSS_PX]);
          sounds.play("sfx-pop-stars");
          break;
        }
        // A Split Slime splits and a Craft opens its doors as its descendants are queued (C6.3), then the stars.
        const defeat = alienArt(event.type).defeat;
        if (defeat !== null) this.#playOnce(defeat, x, y, 19);
        this.#playOnce(ART.popStars, x, y - 40, 20);
        sounds.play("sfx-pop-stars");
        break;
      }
      case "bossPhase": {
        // A flash as the phase begins (C7), and the phase's burst if it has one (the Great Glorp's); the phase's cue
        // on the boss itself plays from #drawAliens.
        const x = unitsToPx(event.at.x);
        const y = unitsToPx(event.at.y) + ALIEN_FEET_DY - BOSS_PX / 2;
        this.#playOnce(ART.bossPhaseFlash, x, y, 21, [BOSS_PX, BOSS_PX]);
        sounds.play("sfx-boss-phase");
        const burst = bossArt(event.type)?.phases[event.phase]?.burst ?? null;
        if (burst !== null) this.#playOnce(burst, x, y, 21, [BOSS_PX, BOSS_PX]);
        break;
      }
      case "power": {
        if (!this.#hasPowers) break;
        sounds.play(event.effect === "slow" ? "sfx-frost-pulse" : event.effect === "burst" ? "sfx-comet-burst" : "sfx-colony-shield");
        if (event.effect === "slow") {
          // The frost wash covers the whole canvas (its art is canvas-sized), above the aliens.
          this.#playOnce(POWER_ART.slow, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 22);
        } else if (event.effect === "burst" && event.at !== null) {
          // The impact ring lies on the ground, the burst's radius each way (1.5 tiles: 288 px across), squashed to 4:3.
          const effect = this.#bridge.config.powers[event.powerId]?.effect;
          const across = effect?.kind === "burst" ? effect.radiusTiles * 2 * TILE_PX : TILE_PX * 3;
          this.#playOnce(POWER_ART.burst, unitsToPx(event.at.x), unitsToPx(event.at.y) + ALIEN_FEET_DY - 8, 21, [across, (across * 3) / 4]);
        } else if (event.effect === "shield") {
          const colony = this.#colony;
          if (colony !== null) this.#playOnce(POWER_ART.shield, colony.x, colony.y, 21, [COLONY_PX, COLONY_PX]);
        }
        break;
      }
      case "leaked": {
        const leak = mapEnds(this.#bridge.config.route.waypoints)?.leak;
        if (leak !== undefined) this.#playOnce(ART.leak, leak.x, leak.y, 20);
        sounds.play("sfx-leak");
        break;
      }
      case "shot": {
        // C6.1 Shellback: "hits make a 'clonk' spark". Read from the trait, so any armoured alien clonks; a boss
        // clonks while its phase has armour (Captain Clank's plates, C7).
        const classId = battle?.towers.find((t) => t.padId === event.padId)?.classId;
        const attack = classId === undefined ? null : classSound(classId);
        if (attack !== null) sounds.play(attack);
        const alien = living(event.alienId);
        const stats = alien === undefined ? undefined : this.#bridge.config.aliens[alien.type];
        const armour = stats?.boss?.phases[alien?.phase ?? 0]?.armour ?? stats?.armour ?? 0;
        if (alien === undefined || armour === 0) break;
        sounds.play("sfx-hit-clonk");
        const { x, y } = this.#feet(alien);
        this.#playOnce(ART.armourClonk, x, y + ON_ALIEN_DY, 20);
        break;
      }
      case "popped": {
        const alien = living(event.alienId);
        if (alien === undefined) break;
        const { x, y } = this.#feet(alien);
        this.#playOnce(ART.guardPop, x, y + LAYERS_DY, 20);
        sounds.play("sfx-bubble-pop");
        break;
      }
      case "shielded":
        sounds.play("sfx-mira"); // Mira's pulse added shield points (C5.5)
        break;
      case "healPulse": {
        // The sparkle ring lies on the ground around the Patchling (its art is already squashed to 4:3).
        this.#playOnce(ART.patchHeal, unitsToPx(event.at.x), unitsToPx(event.at.y) + ALIEN_FEET_DY - 8, 8);
        break;
      }
      case "healed": {
        const alien = living(event.alienId);
        if (alien === undefined) break;
        const { x, y } = this.#feet(alien);
        this.#playOnce(ART.healed, x, y + ON_ALIEN_DY, 20);
        break;
      }
      default:
        break;
    }
  }

  /** Play a one-shot effect with a pooled sprite, which goes back to the pool when the animation ends. `size`
   *  overrides the catalogue display size (a boss's effects are drawn at the boss's size). */
  #playOnce(asset: ArtAsset, x: number, y: number, depth: number, size?: readonly [number, number]): void {
    const pool = this.#effectPool;
    if (pool === null) return;
    const sprite = pool.acquire();
    sprite.setTexture(frameKey(this.#b(asset), 1)).setPosition(x, y).setVisible(true);
    place(sprite, this.#b(asset));
    if (size !== undefined) sprite.setDisplaySize(size[0], size[1]);
    sprite.setDepth(depth).play(this.#b(asset).id);
    sprite.once("animationcomplete", () => pool.release(sprite));
  }
}
