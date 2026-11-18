// Map tab → Make a map for me (Gate M, LD14; owner 2026-11-18). game-core's generateMap makes a route, pads and
// decorations that meet the design rules; the result goes in as one edit, so Ctrl+Z puts back the map there was.
// The map number is the generator's seed: the same number and choices always make the same map.
import { ANY_DIRECTION_ROUTES, generateMap, TWISTS, type GeneratedMap, type MapEdge, type Twist } from "@scd/game-core";
import { DECORATIONS } from "@scd/shared/map";
import { useId, useState } from "react";
import type { LevelFile, PictureSummary } from "../api";

type Props = {
  readonly level: LevelFile;
  /** Approved library decorations ("My decorations"). */
  readonly libraryDecorations: readonly PictureSummary[];
  readonly onMake: (map: Pick<GeneratedMap, "route" | "pads" | "decorations">) => void;
  /** The first map number (tests); otherwise a random one. */
  readonly firstSeed?: number;
};

const EDGES: readonly { readonly id: MapEdge | "any"; readonly label: string }[] = [
  { id: "any", label: "Any edge" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "top", label: "Top" },
  { id: "bottom", label: "Bottom" },
];
type DecorationSource = "repo" | "library" | "both";
const SEED_MAX = 999_999;

export function MapMaker({ level, libraryDecorations, onMake, firstSeed }: Props) {
  const id = useId();
  const [seed, setSeed] = useState(() => firstSeed ?? 1 + Math.floor(Math.random() * SEED_MAX));
  const [from, setFrom] = useState<MapEdge | "any">("any");
  const [to, setTo] = useState<MapEdge | "any">("any");
  const [twist, setTwist] = useState<Twist>("medium");
  const [pads, setPads] = useState(14);
  const [decorationCount, setDecorationCount] = useState(8);
  const [source, setSource] = useState<DecorationSource>("repo");
  const [keepRoute, setKeepRoute] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hasRoute = level.map.route.length >= 2;

  const make = (n: number) => {
    setSeed(n);
    const repo = Object.keys(DECORATIONS);
    const library = libraryDecorations.map((p) => p.id);
    const pool = source === "repo" ? repo : source === "library" ? library : [...repo, ...library];
    const result = generateMap({
      seed: n,
      twist,
      from,
      to,
      pads,
      decorations: pool,
      decorationCount,
      ...(keepRoute && hasRoute ? { route: level.map.route } : {}),
    });
    if ("reason" in result) {
      setMessage(result.reason);
      return;
    }
    onMake(result.map);
    const warnings = result.map.problems.length;
    setMessage(
      `Map ${n} is in. ${warnings === 0 ? "It meets every design rule." : `It has ${warnings} warning${warnings === 1 ? "" : "s"}: see Problems.`} Ctrl+Z puts back the map you had.`,
    );
  };

  return (
    <details className="map-maker">
      <summary>Make a map for me</summary>
      <p className="hint">A route, pads and decorations that meet the design rules. Change anything afterwards by hand.</p>
      {ANY_DIRECTION_ROUTES && (
        <>
          <label htmlFor={`${id}-from`}>Portal on</label>
          <select id={`${id}-from`} value={from} disabled={keepRoute} onChange={(e) => setFrom(e.target.value as MapEdge | "any")}>
            {EDGES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-to`}>Colony on</label>
          <select id={`${id}-to`} value={to} disabled={keepRoute} onChange={(e) => setTo(e.target.value as MapEdge | "any")}>
            {EDGES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </>
      )}
      <label htmlFor={`${id}-twist`}>Turns</label>
      <select id={`${id}-twist`} value={twist} disabled={keepRoute} onChange={(e) => setTwist(e.target.value as Twist)}>
        {(Object.keys(TWISTS) as Twist[]).map((t) => (
          <option key={t} value={t}>
            {TWISTS[t].label}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-pads`}>Pads</label>
      <input id={`${id}-pads`} type="number" min={12} max={16} value={pads} onChange={(e) => setPads(Math.max(12, Math.min(16, Number(e.target.value) || 14)))} />
      <label htmlFor={`${id}-decorations`}>Decorations</label>
      <input
        id={`${id}-decorations`}
        type="number"
        min={0}
        max={24}
        value={decorationCount}
        onChange={(e) => setDecorationCount(Math.max(0, Math.min(24, Number(e.target.value) || 0)))}
      />
      <label htmlFor={`${id}-source`}>Decorations from</label>
      <select id={`${id}-source`} value={source} onChange={(e) => setSource(e.target.value as DecorationSource)}>
        <option value="repo">Moon decorations</option>
        <option value="library" disabled={libraryDecorations.length === 0}>
          My decorations
        </option>
        <option value="both" disabled={libraryDecorations.length === 0}>
          Both
        </option>
      </select>
      <label className="check">
        <input type="checkbox" checked={keepRoute && hasRoute} disabled={!hasRoute} onChange={(e) => setKeepRoute(e.target.checked)} /> Keep my route (make
        only pads and decorations)
      </label>
      <label htmlFor={`${id}-seed`}>Map number</label>
      <input id={`${id}-seed`} type="number" min={1} max={SEED_MAX} value={seed} onChange={(e) => setSeed(Math.max(1, Math.min(SEED_MAX, Math.round(Number(e.target.value)) || 1)))} />
      <p className="row">
        <button type="button" onClick={() => make(seed)}>
          Make a map
        </button>
        <button type="button" onClick={() => make(seed >= SEED_MAX ? 1 : seed + 1)}>
          Another one
        </button>
      </p>
      {message !== null && <p role="status">{message}</p>}
    </details>
  );
}
