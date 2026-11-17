// DEVELOPMENT ONLY (Gate M, LD11): the real battlefield for Moonbeam and the four any-direction fixture maps (one per
// entry edge; game-core/src/map/fixtures-any-direction.json), with no sign-in, run or server, to see the new route art,
// the portal, the colony and the leak puff before the parser accepts such maps. Served by `npm run dev -w player` at
// /routes-preview.html?map=from-left|from-top|from-right|from-bottom|moonbeam; not a build input, so never published.
// Each fixture map is Moonbeam's document with its route swapped and pads put beside the new route.
import { compileBattleConfig, initialRunState, parsePlanet, parseRuleset, routeCells, routeEnds } from "@scd/game-core";
import { REPO_ART } from "@scd/shared/manifest";
import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import moonbeam from "../../../../game-data/campaign/luna-1-c2.json";
import rulesetJson from "../../../../game-data/ruleset/r4.json";
import fixtures from "../../../game-core/src/map/fixtures-any-direction.json";
import { Battlefield } from "../battlefield/Battlefield";
import { LocalRun } from "../game/localRun";
import "../global.css";

const ROUTES = fixtures.routes as unknown as Record<string, [number, number][]>;

/** Pads one tile to the side of every fourth route cell, two apart, off the route and the portal and colony. */
function padsFor(route: [number, number][]): { id: string; x: number; y: number; opensAfterWave: number }[] {
  const cells = routeCells(route);
  const taken = new Set(cells.map((c) => `${c.x},${c.y}`));
  const ends = routeEnds(route);
  for (const [x, y] of [...(ends?.portalCells ?? []), ...(ends?.colonyCells ?? [])]) taken.add(`${x},${y}`);
  const pads: { x: number; y: number }[] = [];
  cells.forEach((c, i) => {
    if (i % 4 !== 2 || pads.length >= 14) return;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      const [x, y] = [c.x + dx, c.y + dy];
      const ok = x >= 0 && y >= 0 && x < 20 && y < 11 && !taken.has(`${x},${y}`) && pads.every((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) >= 2);
      if (ok) {
        pads.push({ x, y });
        return;
      }
    }
  });
  return pads.map((p, i) => ({ id: `p${String(i + 1).padStart(2, "0")}`, ...p, opensAfterWave: i < 6 ? 0 : 5 }));
}

function Preview() {
  const name = new URL(window.location.href).searchParams.get("map") ?? "from-left";
  const data = useMemo(() => {
    const ruleset = parseRuleset(rulesetJson);
    const route = ROUTES[name];
    // Only the campaign: Moonbeam's challenges place astronauts on Moonbeam's own pads.
    const raw = route === undefined ? moonbeam : { ...moonbeam, map: { ...moonbeam.map, route, pads: padsFor(route) }, waveSets: { campaign: moonbeam.waveSets.campaign } };
    const planet = parsePlanet(raw, ruleset, { anyDirection: true });
    const config = compileBattleConfig(ruleset, planet, "campaign");
    return { game: { ruleset, planet, art: REPO_ART }, run: new LocalRun(initialRunState(ruleset, config, ["continue"])) };
  }, [name]);
  return (
    <div style={{ width: 1920, height: 1056 }}>
      <Battlefield data={data.game} waveSetId="campaign" run={data.run} seed="routes-preview" speed={1}>
        <></>
      </Battlefield>
    </div>
  );
}

const root = document.getElementById("root");
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <Preview />
    </StrictMode>,
  );
}
