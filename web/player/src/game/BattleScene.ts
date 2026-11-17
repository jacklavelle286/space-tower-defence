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
import { GameObjects, Scene, type Input } from "phaser";
import {
  ALIEN_LOOPED,
  ALIEN_ONE_SHOT,
  alienArt,
  allFrames,
  ART,
  ASTRONAUT_LOOPED,
  POWER_ART,
  powerFrames,
  ASTRONAUT_ONE_SHOT,
  astronautArt,
  beamArt,
  BOSS_LOOPED,
  BOSS_ONE_SHOT,
  bossArt,
  bossBubbleArt,
  bubbleLayersArt,
  frameKey,
  type ArtAsset,
} from "./assets";
import type { GameBridge } from "./GameBridge";
import { nearestProgress } from "../hud/padNav";
import { pressedOnCanvas } from "./pointer";
import { Pool } from "./pool";
import { CANVAS_HEIGHT, CANVAS_WIDTH, colonyArt, routeTiles, TILE_PX, tileToPx, unitsToPx } from "./layout";
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
/** Colony feet relative to the gate tile centre: pulled left so it fits on the canvas and sits over the route end. */
const COLONY_DX = -72;
const COLONY_DY = 74;
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

const LOOPED: readonly ArtAsset[] = [ART.portal, ...ALIEN_LOOPED, ...BOSS_LOOPED, ...ASTRONAUT_LOOPED, ART.novaBeam1, ART.novaBeam2, ART.novaBeam3];
const ONE_SHOT: readonly ArtAsset[] = [
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
  #range: GameObjects.Graphics | null = null;
  /** The Comet Burst aiming ring (Phase 31). */
  #aimRing: GameObjects.Graphics | null = null;
  /** Glows under the astronauts a Sol is boosting, so a Sol's work shows on the field (Sol never shoots). */
  #boost: GameObjects.Graphics | null = null;
  /** The pluses above boosted astronauts (drawn over the sprites). */
  #boostFx: GameObjects.Graphics | null = null;
  /** Pads that already had an astronaut when this wave's battle was made (no "placed" sparkle for those). */
  #restored = new Set<string>();

  constructor(bridge: GameBridge) {
    super("battle");
    this.#bridge = bridge;
  }

  /** True when the ruleset has meteor powers (C10; mechanics 3): only then are their effects loaded and played. */
  get #hasPowers(): boolean {
    return Object.keys(this.#bridge.config.powers).length > 0;
  }

  preload(): void {
    for (const [key, url] of allFrames()) this.load.image(key, url);
    if (this.#hasPowers) for (const [key, url] of powerFrames()) this.load.image(key, url);
    // The map's own backdrop and decorations (Gate M, LD2). One that fails to load is skipped in create().
    for (const { key, url } of mapPicturesToLoad(this.#bridge.config)) if (!this.textures.exists(key)) this.load.image(key, url);
  }

  create(): void {
    for (const asset of [...LOOPED, ...ONE_SHOT, ...(this.#hasPowers ? Object.values(POWER_ART) : [])]) {
      const frames = Array.from({ length: asset.frames }, (_, i) => ({ key: frameKey(asset, i + 1) }));
      this.anims.create({ key: asset.id, frames, frameRate: ANIM_FPS, repeat: LOOPED.includes(asset) ? -1 : 0 });
    }
    const config = this.#bridge.config;

    // The map's own backdrop when it has one and it loaded; otherwise the repo Moonbeam ground (Gate M, LD2).
    const backdrop = this.add.image(0, 0, backdropKey(config, (key) => this.textures.exists(key)));
    place(backdrop, ART.backdrop);
    backdrop.setDepth(0);
    for (const d of placedDecorations(config)) {
      if (!this.textures.exists(d.key)) continue; // failed to load: skipped, never a broken battle
      this.add.image(d.x, d.y, d.key).setOrigin(d.anchor[0], d.anchor[1]).setDisplaySize(d.size[0], d.size[1]).setDepth(d.depth);
    }

    for (const tile of routeTiles(config.route.waypoints)) {
      const image = this.add.image(tileToPx(tile.x), tileToPx(tile.y), frameKey(tile.art, 1));
      place(image, tile.art);
      image.setDepth(1);
    }

    const [startX, startY] = config.route.waypoints[0] ?? [0, 0];
    const portal = this.add.sprite(tileToPx(startX) - TILE_PX / 2, tileToPx(startY), frameKey(ART.portal, 1));
    place(portal, ART.portal);
    portal.setDepth(2).play(ART.portal.id);

    const [gateX, gateY] = config.route.waypoints[config.route.waypoints.length - 1] ?? [0, 0];
    this.#colony = this.add.image(tileToPx(gateX) + COLONY_DX, tileToPx(gateY) + COLONY_DY, frameKey(ART.colonyHealthy, 1));
    place(this.#colony, ART.colonyHealthy);
    this.#colony.setDisplaySize(COLONY_PX, COLONY_PX).setDepth(3);

    for (const pad of config.pads) {
      const image = this.add.image(tileToPx(pad.x), tileToPx(pad.y), frameKey(pad.open ? ART.padEmpty : ART.padClosed, 1));
      place(image, ART.padEmpty);
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
        body: this.add.sprite(0, 0, frameKey(ART.blobWalk, 1)).setVisible(false),
        shadow: this.add.image(0, 0, frameKey(ART.flutterShadow, 1)).setVisible(false),
        layers: this.add.image(0, 0, frameKey(ART.guardLayers4, 1)).setVisible(false),
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
      () => this.add.sprite(0, 0, frameKey(ART.popStars, 1)).setVisible(false),
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
    for (const event of this.#bridge.takeSceneEvents()) this.#effect(event);
  }

  /** A new wave's battle: tower sprites go, alien views return to the pool; the next sync rebuilds from the new state. */
  #newBattle(battle: Readonly<Battle> | null): void {
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
      image.setTexture(frameKey(art, 1)).setDisplaySize(art.displaySize[0], art.displaySize[1]);
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
        const sprite = this.add.sprite(x, y, frameKey(art.idle, 1));
        place(sprite, art.idle);
        sprite.setDepth(10 + y / 1000).play(art.idle.id);
        const beam = this.add.sprite(x, y, frameKey(beamArt(tower.level), 1)).setVisible(false).setDepth(9);
        view = { classId: tower.classId, sprite, beam, level: tower.level, lastShotSeen: tower.lastShotTick };
        this.#towers.set(tower.padId, view);
        if (!this.#restored.has(tower.padId)) this.#playOnce(ART.place, x, y - 8, 9);
      }
      if (view.level !== tower.level) {
        view.level = tower.level;
        view.sprite.play(art.idle.id);
      }
      const shot = tower.lastShotAt;
      if (tower.lastShotTick !== view.lastShotSeen) {
        view.lastShotSeen = tower.lastShotTick;
        if (shot !== null) view.sprite.setFlipX(unitsToPx(shot.x) < x);
        view.sprite.play(art.attack.id).chain(art.idle.id);
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
        const beamAsset = beamArt(tower.level);
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
      view.body.setTexture(frameKey(move, 1));
      place(view.body, move);
      view.body.setDisplaySize(BOSS_PX, BOSS_PX).setVisible(true).play(move.id);
      view.phase = alien.phase;
      const { x, y } = this.#feet(alien);
      this.#playOnce(ART.bossArrive, x, y, 8, BOSS_RING);
      return;
    }
    const art = alienArt(alien.type).move;
    view.body.setTexture(frameKey(art, 1));
    place(view.body, art);
    // The seeded look picks the starting frame, so a group does not bob in step (cosmetic).
    view.body.setVisible(true).play({ key: art.id, startFrame: alien.look % art.frames });
    place(view.shadow, ART.flutterShadow);
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
          if (art.enter === null) view.body.play(art.move.id);
          else view.body.play(art.enter.id).chain(art.move.id);
        }
      }
      // The layers it has left: the overlay shrinks a ring at each pop and goes when the last one pops. A boss's
      // layers are one big bubble around it, and an alien Queen Bubbla gave a layer gets the Bubble Guard's ring.
      const layers = boss === null ? bubbleLayersArt(alien.bubbles) : bossBubbleArt(alien.bubbles);
      view.layers.setVisible(layers !== null);
      if (layers !== null) {
        view.layers
          .setTexture(frameKey(layers, 1))
          .setPosition(x, y + (boss === null ? LAYERS_DY : BOSS_BUBBLE_DY))
          .setDepth(depth + 0.0005);
        place(view.layers, layers);
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
    this.#colony?.setTexture(frameKey(art, 1)).setDisplaySize(COLONY_PX, COLONY_PX);
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
          break;
        }
        // A Split Slime splits and a Craft opens its doors as its descendants are queued (C6.3), then the stars.
        const defeat = alienArt(event.type).defeat;
        if (defeat !== null) this.#playOnce(defeat, x, y, 19);
        this.#playOnce(ART.popStars, x, y - 40, 20);
        break;
      }
      case "bossPhase": {
        // A flash as the phase begins (C7), and the phase's burst if it has one (the Great Glorp's); the phase's cue
        // on the boss itself plays from #drawAliens.
        const x = unitsToPx(event.at.x);
        const y = unitsToPx(event.at.y) + ALIEN_FEET_DY - BOSS_PX / 2;
        this.#playOnce(ART.bossPhaseFlash, x, y, 21, [BOSS_PX, BOSS_PX]);
        const burst = bossArt(event.type)?.phases[event.phase]?.burst ?? null;
        if (burst !== null) this.#playOnce(burst, x, y, 21, [BOSS_PX, BOSS_PX]);
        break;
      }
      case "power": {
        if (!this.#hasPowers) break;
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
        const [gx, gy] = this.#bridge.config.route.waypoints[this.#bridge.config.route.waypoints.length - 1] ?? [0, 0];
        this.#playOnce(ART.leak, tileToPx(gx) - 24, tileToPx(gy), 20);
        break;
      }
      case "shot": {
        // C6.1 Shellback: "hits make a 'clonk' spark". Read from the trait, so any armoured alien clonks; a boss
        // clonks while its phase has armour (Captain Clank's plates, C7).
        const alien = living(event.alienId);
        const stats = alien === undefined ? undefined : this.#bridge.config.aliens[alien.type];
        const armour = stats?.boss?.phases[alien?.phase ?? 0]?.armour ?? stats?.armour ?? 0;
        if (alien === undefined || armour === 0) break;
        const { x, y } = this.#feet(alien);
        this.#playOnce(ART.armourClonk, x, y + ON_ALIEN_DY, 20);
        break;
      }
      case "popped": {
        const alien = living(event.alienId);
        if (alien === undefined) break;
        const { x, y } = this.#feet(alien);
        this.#playOnce(ART.guardPop, x, y + LAYERS_DY, 20);
        break;
      }
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
    sprite.setTexture(frameKey(asset, 1)).setPosition(x, y).setVisible(true);
    place(sprite, asset);
    if (size !== undefined) sprite.setDisplaySize(size[0], size[1]);
    sprite.setDepth(depth).play(asset.id);
    sprite.once("animationcomplete", () => pool.release(sprite));
  }
}
