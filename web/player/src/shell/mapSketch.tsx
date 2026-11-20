// A map's picture on Home (Gate M, LD23; owner 2026-11-20: "just have a list of maps - really simple", "a small
// drawing of the map itself"): the map's ground with its route and pads, drawn from the map's published planet
// document (/game-data/campaign/<version>.json, immutable), so every map has a picture with nothing to draw or approve.
// The document is only read for its campaign map's route, pads and backdrop; anything unexpected gives the plain ground.
import { libraryPictureUrl, LIMITS } from "@scd/shared";
import { frameUrl, MAP_ART, TILE_PX } from "@scd/shared/map";
import { useEffect, useState } from "react";

const COLS = 20;
const ROWS = 11;
const GROUND = frameUrl(MAP_ART.backdrop, 0);

export interface MapSketch {
  /** Route waypoints, in tiles. */
  readonly route: readonly (readonly [number, number])[];
  /** Pad cells, in tiles. */
  readonly pads: readonly (readonly [number, number])[];
  /** The ground: the map's library backdrop, or the Moon ground. */
  readonly ground: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCell = (x: unknown, y: unknown): boolean => Number.isInteger(x) && Number.isInteger(y) && (x as number) >= 0 && (x as number) < COLS && (y as number) >= 0 && (y as number) < ROWS;

/** The campaign map of a planet document, or null when it is not there or not as expected. */
export function sketchOf(doc: unknown): MapSketch | null {
  if (!isObj(doc) || !isObj(doc["waveSets"]) || !isObj(doc["maps"])) return null;
  const campaign = doc["waveSets"]["campaign"];
  const mapId = isObj(campaign) ? campaign["mapId"] : undefined;
  const map = typeof mapId === "string" ? doc["maps"][mapId] : undefined;
  if (!isObj(map) || !Array.isArray(map["route"]) || !Array.isArray(map["pads"])) return null;
  const route: [number, number][] = [];
  for (const p of map["route"]) {
    if (!Array.isArray(p) || !isCell(p[0], p[1])) return null;
    route.push([p[0] as number, p[1] as number]);
  }
  const pads: [number, number][] = [];
  for (const p of map["pads"]) if (isObj(p) && isCell(p["x"], p["y"])) pads.push([p["x"] as number, p["y"] as number]);
  const art = map["art"];
  const backdrop = isObj(art) && typeof art["backdrop"] === "string" ? libraryPictureUrl(art["backdrop"]) : null;
  return { route, pads, ground: backdrop ?? GROUND };
}

const sketches = new Map<string, Promise<MapSketch | null>>();

/** The sketch of a published version, fetched once per page. */
export function loadSketch(version: string): Promise<MapSketch | null> {
  if (!new RegExp(LIMITS.gameData.versionPattern).test(version)) return Promise.resolve(null);
  let found = sketches.get(version);
  if (found === undefined) {
    found = fetch(`/game-data/campaign/${version}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
      .then(sketchOf)
      .catch(() => null);
    sketches.set(version, found);
  }
  return found;
}

const centre = (n: number): number => n * TILE_PX + TILE_PX / 2;

/** The drawing: decorative (the card's heading names the map). */
export function MapPicture({ version, sketch: given }: { version?: string; sketch?: MapSketch | null }) {
  const [sketch, setSketch] = useState<MapSketch | null>(given ?? null);
  useEffect(() => {
    if (given !== undefined || version === undefined) return;
    let live = true;
    void loadSketch(version).then((s) => {
      if (live) setSketch(s);
    });
    return () => {
      live = false;
    };
  }, [version, given]);
  return (
    <svg className="map-picture" viewBox={`0 0 ${COLS * TILE_PX} ${ROWS * TILE_PX}`} aria-hidden="true" focusable="false">
      <image href={sketch?.ground ?? GROUND} width={COLS * TILE_PX} height={ROWS * TILE_PX} preserveAspectRatio="xMidYMid slice" />
      {sketch !== null && (
        <>
          <polyline
            points={sketch.route.map(([x, y]) => `${centre(x)},${centre(y)}`).join(" ")}
            fill="none"
            stroke="#f2deb0"
            strokeWidth={TILE_PX * 0.8}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {sketch.pads.map(([x, y]) => (
            <rect key={`${x},${y}`} x={x * TILE_PX + 16} y={y * TILE_PX + 16} width={TILE_PX - 32} height={TILE_PX - 32} rx={14} fill="#62d0ff" stroke="#123047" strokeWidth={8} />
          ))}
        </>
      )}
    </svg>
  );
}
