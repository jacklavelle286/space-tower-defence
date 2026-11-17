// The battlefield scene (Phase 14, M1-21): it draws the battle and turns pointer presses into selectPad. It decides
// nothing (spine S10, E.5.2): every position, level, shot and outcome comes from the game-core Battle the bridge
// holds, and the only things computed here are pixels and which animation frame to show.
//
// Each frame: bridge.frame(delta) advances the simulation by whole ticks, then the scene syncs one sprite per
// tower and per alien with the battle, and plays cosmetic effects (stars, leak puffs) for the events since the
// last frame. Beams are drawn from the tower's last shot (tick and landing point), so they are state, not timers.
import { routePoint, type Battle, type BattleEvent } from "@scd/game-core";
import { GameObjects, Scene, type Input } from "phaser";
import { allFrames, ART, ASTRONAUT_LOOPED, ASTRONAUT_ONE_SHOT, astronautArt, beamArt, frameKey, type ArtAsset } from "./assets";
import type { GameBridge } from "./GameBridge";
import { pressedOnCanvas } from "./pointer";
import { colonyArt, routeTiles, TILE_PX, tileToPx, unitsToPx } from "./layout";

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

const LOOPED: readonly ArtAsset[] = [ART.portal, ART.blobWalk, ...ASTRONAUT_LOOPED, ART.novaBeam1, ART.novaBeam2, ART.novaBeam3];
const ONE_SHOT: readonly ArtAsset[] = [...ASTRONAUT_ONE_SHOT, ART.popStars, ART.leak, ART.place];

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
  readonly #aliens = new Map<number, GameObjects.Sprite>();
  #colony: GameObjects.Image | null = null;
  #range: GameObjects.Graphics | null = null;
  /** Pads that already had an astronaut when this wave's battle was made (no "placed" sparkle for those). */
  #restored = new Set<string>();

  constructor(bridge: GameBridge) {
    super("battle");
    this.#bridge = bridge;
  }

  preload(): void {
    for (const [key, url] of allFrames()) this.load.image(key, url);
  }

  create(): void {
    for (const asset of [...LOOPED, ...ONE_SHOT]) {
      const frames = Array.from({ length: asset.frames }, (_, i) => ({ key: frameKey(asset, i + 1) }));
      this.anims.create({ key: asset.id, frames, frameRate: ANIM_FPS, repeat: LOOPED.includes(asset) ? -1 : 0 });
    }
    const config = this.#bridge.config;

    const backdrop = this.add.image(0, 0, frameKey(ART.backdrop, 1));
    place(backdrop, ART.backdrop);
    backdrop.setDepth(0);

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
        this.#bridge.selectPad(this.#bridge.selectedPad === pad.id ? null : pad.id);
      });
      image.on("pointerover", () => (this.#hoverPad = pad.id));
      image.on("pointerout", () => (this.#hoverPad = this.#hoverPad === pad.id ? null : this.#hoverPad));
      this.#pads.set(pad.id, image);
    }

    this.#range = this.add.graphics().setDepth(5);
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

  /** A new wave's battle: the old sprites go, the next sync rebuilds them from the new state. */
  #newBattle(battle: Readonly<Battle> | null): void {
    for (const view of this.#towers.values()) {
      view.sprite.destroy();
      view.beam.destroy();
    }
    this.#towers.clear();
    for (const sprite of this.#aliens.values()) sprite.destroy();
    this.#aliens.clear();
    this.#battle = battle;
    this.#restored = new Set(battle?.towers.map((t) => t.padId) ?? []);
  }

  #drawPads(battle: Readonly<Battle> | null): void {
    const selected = this.#bridge.selectedPad;
    for (const pad of this.#bridge.config.pads) {
      const image = this.#pads.get(pad.id);
      if (image === undefined) continue;
      const art = !pad.open ? ART.padClosed : pad.id === selected ? ART.padSelected : pad.id === this.#hoverPad ? ART.padHover : ART.padEmpty;
      image.setTexture(frameKey(art, 1)).setDisplaySize(art.displaySize[0], art.displaySize[1]);
    }
    // The range preview uses the simulation's own range for the tower's level (C3.1: the preview is the truth).
    const range = this.#range;
    if (range === null) return;
    range.clear();
    const tower = battle?.towers.find((t) => t.padId === selected);
    const pad = this.#bridge.config.pads.find((p) => p.id === selected);
    if (tower === undefined || pad === undefined) return;
    // An attacker shows its range; Sol shows the ring her buff reaches (pad centres inside it, C5.6); Mira has none.
    const level = this.#bridge.config.classes[tower.classId]?.levels[tower.level - 1];
    const radius = level?.shot?.rangeTiles ?? level?.buff?.radiusTiles;
    if (radius === undefined) return;
    const colour = level?.shot ? 0xfff4d6 : BUFF_RING;
    range.fillStyle(colour, 0.12).fillCircle(tileToPx(pad.x), tileToPx(pad.y), radius * TILE_PX);
    range.lineStyle(4, colour, 0.7).strokeCircle(tileToPx(pad.x), tileToPx(pad.y), radius * TILE_PX);
  }

  #drawTowers(battle: Readonly<Battle>): void {
    const present = new Set<string>();
    for (const tower of battle.towers) {
      present.add(tower.padId);
      const pad = this.#bridge.config.pads.find((p) => p.id === tower.padId);
      if (pad === undefined) continue;
      const x = tileToPx(pad.x);
      const y = tileToPx(pad.y) + ASTRONAUT_FEET_DY;
      const art = astronautArt(tower.classId, tower.level);
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

  #drawAliens(battle: Readonly<Battle>): void {
    const present = new Set<number>();
    const route = this.#bridge.config.route;
    for (const alien of battle.aliens) {
      present.add(alien.id);
      const p = routePoint(route, alien.progress);
      const x = unitsToPx(p.x);
      const y = unitsToPx(p.y) + ALIEN_FEET_DY;
      let sprite = this.#aliens.get(alien.id);
      if (sprite === undefined) {
        sprite = this.add.sprite(x, y, frameKey(ART.blobWalk, 1));
        place(sprite, ART.blobWalk);
        // The seeded look picks the starting frame, so a group does not bob in step (cosmetic).
        sprite.play({ key: ART.blobWalk.id, startFrame: alien.look % ART.blobWalk.frames });
        this.#aliens.set(alien.id, sprite);
      }
      sprite.setPosition(x, y).setDepth(10 + y / 1000);
      if (alien.slowTicksLeft > 0) sprite.setTint(FROST_TINT);
      else sprite.clearTint();
    }
    for (const [id, sprite] of this.#aliens) {
      if (present.has(id)) continue;
      sprite.destroy();
      this.#aliens.delete(id);
    }
  }

  #drawColony(battle: Readonly<Battle>): void {
    const art = colonyArt(battle.health, this.#bridge.config.colony.maxHealth);
    this.#colony?.setTexture(frameKey(art, 1)).setDisplaySize(COLONY_PX, COLONY_PX);
  }

  #effect(event: BattleEvent): void {
    if (event.kind === "defeated") {
      this.#playOnce(ART.popStars, unitsToPx(event.at.x), unitsToPx(event.at.y) + ALIEN_FEET_DY - 40, 20);
    } else if (event.kind === "leaked") {
      const [gx, gy] = this.#bridge.config.route.waypoints[this.#bridge.config.route.waypoints.length - 1] ?? [0, 0];
      this.#playOnce(ART.leak, tileToPx(gx) - 24, tileToPx(gy), 20);
    }
  }

  #playOnce(asset: ArtAsset, x: number, y: number, depth: number): void {
    const sprite = this.add.sprite(x, y, frameKey(asset, 1));
    place(sprite, asset);
    sprite.setDepth(depth).play(asset.id);
    sprite.once("animationcomplete", () => sprite.destroy());
  }
}
