// The new-alien card (Phase 66; owner ask, 2026-11-17): the first time an alien type comes onto the route in a run,
// the battle waits (GameBridge `announcing`) and this card shows its picture, its name and what it does, in a line or
// two a 5-year-old follows (C6.1's traits, COPY.newAlien). "Got it!" (Enter or Space: it has the focus) goes on.
// Bosses too. Reading it aloud needs an approved speech clip that is not tied to an activity slot: a follow-up
// [PROPOSAL; docs/validation/phase-66-new-alien-card.md].
import { trapTab } from "@scd/shared";
import type { AlienStats } from "@scd/game-core";
import type { ArtBinding } from "@scd/shared/manifest";
import { frameUrl } from "@scd/shared/map";
import { COPY } from "../copy/en-GB";
import type { GameBridge } from "../game/GameBridge";
import { alienArt, bossArt } from "../game/assets";
import { useHud } from "./useBridge";

/** What the alien does, in short lines: its traits, or its speed when it has none. */
export function alienLines(alien: AlienStats): string[] {
  const t = COPY.newAlien;
  if (alien.boss !== null) return [t.bossLine];
  const lines: string[] = [];
  if (alien.flying) lines.push(t.flying);
  if (alien.armour > 0) lines.push(t.armour);
  if (alien.bubbles > 0) lines.push(t.bubbles);
  if (alien.healer !== null) lines.push(t.healer);
  if (alien.children.length > 0) lines.push(t.children);
  if (alien.cluster) lines.push(t.cluster);
  if (lines.length === 0) lines.push(alien.speed >= 1.5 ? t.fast : alien.speed <= 0.8 ? t.slow : t.plain);
  return lines;
}

/** The first frame of the alien's own movement (or a boss's first phase), as the run's art draws it. */
function pictureOf(art: ArtBinding, type: string): string {
  const boss = bossArt(type);
  return frameUrl(art.asset(boss?.phases[0]?.move ?? alienArt(type).move), 1);
}

/** Shows the card while the bridge is announcing a type (mounted by Battlefield, so every battle screen has it). */
export function NewAlienAnnouncements({ bridge, art }: { bridge: GameBridge; art: ArtBinding }) {
  const hud = useHud(bridge);
  return hud.announcing === null || hud.runStatus !== "IN_PROGRESS" ? null : <NewAlienCard bridge={bridge} art={art} type={hud.announcing} />;
}

export function NewAlienCard({ bridge, art, type }: { bridge: GameBridge; art: ArtBinding; type: string }) {
  const alien = bridge.config.aliens[type];
  if (alien === undefined) return null;
  const boss = alien.boss !== null;
  return (
    <div className="bf-overlay">
      <div className="bf-card bf-new-alien" role="dialog" aria-modal="true" aria-labelledby="new-alien-name" onKeyDown={trapTab}>
        <p className="bf-new-alien-kicker">{boss ? COPY.newAlien.boss : COPY.newAlien.heading}</p>
        <img src={pictureOf(art, type)} alt="" width={160} height={160} />
        <h2 id="new-alien-name">{alien.name}</h2>
        {alienLines(alien).map((line) => (
          <p key={line}>{line}</p>
        ))}
        <button type="button" className="bf-big" onClick={() => bridge.dismissAnnouncement()} autoFocus>
          {COPY.newAlien.continue}
        </button>
      </div>
    </div>
  );
}
