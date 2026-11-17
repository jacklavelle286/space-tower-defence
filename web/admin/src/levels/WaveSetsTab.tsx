import { LIMITS } from "@scd/shared";
import { TILE_PX } from "@scd/shared/map";
import { useState } from "react";
import type { LevelFile, LevelWaveSet } from "../api";
import { CURRENT_RULESET, LIVE_PLANET, problemText, type LevelProblem } from "./levelFile";

// The Wave sets tab (Gate M, LD4; scope-level-designer.md §3.1 step 9). The campaign card (a campaign level) has a
// fixed shape (50 waves, meteors after 9, 19, 29, 39, 49): only its credits and colony health are yours to set.
// Challenges: a name, 2-8 waves (campaign wave numbers or this level's challenge waves), credits, colony health,
// classes, how many pads are open, and astronauts already at their posts (presets, shown on a mini map). Every input
// keeps to the friendly ranges in contracts/limits.json. Badges: none in v1 (scope §5).

type Props = {
  readonly level: LevelFile;
  readonly problems: readonly LevelProblem[];
  readonly onEdit: (level: LevelFile) => void;
};

const R = LIMITS.levelDesigner;
const CLASSES = Object.entries(CURRENT_RULESET.classes).map(([id, c]) => ({ id, name: c.name, defaultTargeting: c.defaultTargeting }));
const OPEN_AS_FOR = [1, 6, 11, 16, 21, 26];

const clamp = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : lo);

function MiniMap({ level, set }: { level: LevelFile; set: LevelWaveSet }) {
  const presets = new Map(set.presetPlacements.map((p) => [p.padId, p]));
  const open = (opens: number) => opens < set.padsOpenAsForWave;
  return (
    <svg className="mini-map" viewBox={`0 0 ${20 * TILE_PX} ${11 * TILE_PX}`} role="img" aria-label={`Mini map: ${set.presetPlacements.length} preset astronauts`}>
      <rect width={20 * TILE_PX} height={11 * TILE_PX} className="mini-ground" />
      <polyline className="level-route-line" points={level.map.route.map(([x, y]) => `${x * TILE_PX + 48},${y * TILE_PX + 48}`).join(" ")} />
      {level.map.pads.map((p) => {
        const preset = presets.get(p.id);
        return (
          <g key={p.id}>
            <circle cx={p.x * TILE_PX + 48} cy={p.y * TILE_PX + 48} r={36} className={preset !== undefined ? "mini-preset" : open(p.opensAfterWave) ? "mini-open" : "mini-closed"} />
            {preset !== undefined && (
              <text x={p.x * TILE_PX + 48} y={p.y * TILE_PX + 60} className="mini-label">
                {CURRENT_RULESET.classes[preset.classId]?.name.slice(0, 2)}
                {preset.level}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ChallengeCard({ id, set, level, problems, onChange, onRemove }: { id: string; set: LevelWaveSet; level: LevelFile; problems: readonly LevelProblem[]; onChange: (set: LevelWaveSet) => void; onRemove: () => void }) {
  const [adding, setAdding] = useState("1");
  const [preset, setPreset] = useState({ padId: "", classId: set.classes[0] ?? "nova", level: 1 });
  const refs = [...LIVE_PLANET.waves.map((w) => String(w.wave)), ...Object.keys(level.challengeWaves)];
  const openPads = level.map.pads.filter((p) => p.opensAfterWave < set.padsOpenAsForWave && !set.presetPlacements.some((x) => x.padId === p.id));
  const move = (i: number, by: number) => {
    const waves = [...set.waves];
    const [w] = waves.splice(i, 1);
    if (w !== undefined) waves.splice(Math.max(0, Math.min(waves.length, i + by)), 0, w);
    onChange({ ...set, waves });
  };
  const padNumber = (padId: string) => String(Number.parseInt(padId.slice(padId.lastIndexOf("-p") + 2), 10));
  return (
    <fieldset className="wave-set">
      <legend>
        Challenge {set.name} <span className="muted">({id})</span>
      </legend>
      <label>
        Name <input value={set.name} maxLength={60} onChange={(e) => onChange({ ...set, name: e.target.value })} />
      </label>
      <div role="group" aria-label={`${set.name}: waves, in play order`}>
        <p>Waves ({set.waves.length}; a challenge has {R.challengeWaves.min} to {R.challengeWaves.max}):</p>
        <ol>
          {set.waves.map((w, i) => (
            <li key={`${w}-${i}`}>
              {typeof w === "number" ? `Campaign wave ${w}` : `Challenge wave ${w}`}{" "}
              <button type="button" aria-label={`Move ${w} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" aria-label={`Move ${w} later`} disabled={i === set.waves.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button type="button" aria-label={`Remove ${w}`} onClick={() => onChange({ ...set, waves: set.waves.filter((_, k) => k !== i) })}>
                Remove
              </button>
            </li>
          ))}
        </ol>
        <label>
          Add{" "}
          <select value={adding} onChange={(e) => setAdding(e.target.value)}>
            {refs.map((r) => (
              <option key={r} value={r}>
                {/^\d+$/u.test(r) ? `campaign wave ${r}` : r}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={set.waves.length >= R.challengeWaves.max} onClick={() => onChange({ ...set, waves: [...set.waves, /^\d+$/u.test(adding) ? Number(adding) : adding] })}>
          Add wave
        </button>
      </div>
      <label>
        Starting credits{" "}
        <input type="number" min={R.startCredits.min} max={R.startCredits.max} step={10} value={set.startCredits} onChange={(e) => onChange({ ...set, startCredits: clamp(Number(e.target.value), R.startCredits.min, R.startCredits.max) })} />
      </label>
      <label>
        Colony health{" "}
        <input type="number" min={R.colonyHealth.min} max={R.colonyHealth.max} value={set.colonyHealth} onChange={(e) => onChange({ ...set, colonyHealth: clamp(Number(e.target.value), R.colonyHealth.min, R.colonyHealth.max) })} />
      </label>
      <fieldset>
        <legend>Astronauts offered</legend>
        {CLASSES.map((c) => (
          <label key={c.id} className="inline">
            <input
              type="checkbox"
              checked={set.classes.includes(c.id)}
              onChange={(e) => onChange({ ...set, classes: e.target.checked ? CLASSES.map((x) => x.id).filter((x) => x === c.id || set.classes.includes(x)) : set.classes.filter((x) => x !== c.id) })}
            />{" "}
            {c.name}
          </label>
        ))}
      </fieldset>
      <label>
        Pads open as for wave{" "}
        <select value={set.padsOpenAsForWave} onChange={(e) => onChange({ ...set, padsOpenAsForWave: Number(e.target.value), presetPlacements: [] })}>
          {OPEN_AS_FOR.map((w) => (
            <option key={w} value={w}>
              {w} ({level.map.pads.filter((p) => p.opensAfterWave < w).length} pads)
            </option>
          ))}
        </select>
      </label>
      <MiniMap level={level} set={set} />
      <div role="group" aria-label={`${set.name}: preset astronauts`}>
        <ul>
          {set.presetPlacements.map((p) => (
            <li key={p.padId}>
              Pad {padNumber(p.padId)}: {CURRENT_RULESET.classes[p.classId]?.name} level {p.level}{" "}
              <button type="button" aria-label={`Remove the preset on pad ${padNumber(p.padId)}`} onClick={() => onChange({ ...set, presetPlacements: set.presetPlacements.filter((x) => x !== p) })}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <label>
          Pad{" "}
          <select aria-label="Preset pad" value={preset.padId} onChange={(e) => setPreset({ ...preset, padId: e.target.value })}>
            <option value="">…</option>
            {openPads.map((p) => (
              <option key={p.id} value={p.id}>
                {padNumber(p.id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Astronaut{" "}
          <select value={preset.classId} onChange={(e) => setPreset({ ...preset, classId: e.target.value })}>
            {CLASSES.filter((c) => set.classes.includes(c.id)).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Level{" "}
          <select value={preset.level} onChange={(e) => setPreset({ ...preset, level: Number(e.target.value) })}>
            {[1, 2, 3].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={preset.padId === ""}
          onClick={() => {
            const cls = CLASSES.find((c) => c.id === preset.classId);
            onChange({ ...set, presetPlacements: [...set.presetPlacements, { padId: preset.padId, classId: preset.classId, level: preset.level, targeting: cls?.defaultTargeting ?? "FRONT" }] });
            setPreset({ ...preset, padId: "" });
          }}
        >
          Add preset
        </button>
      </div>
      <p className="muted">Badge: none (v1).</p>
      {problems.map((p, i) => (
        <p key={i} className={p.severity === "warn" ? "warning" : "error"}>
          {problemText(p)}
        </p>
      ))}
      <button type="button" onClick={onRemove}>
        Remove challenge
      </button>
    </fieldset>
  );
}

export function WaveSetsTab({ level, problems, onEdit }: Props) {
  const [name, setName] = useState("");
  const at = (id: string) => problems.filter((p) => p.field === `planet.waveSets.${id}` || p.field.startsWith(`planet.waveSets.${id}.`));
  const setSet = (id: string, set: LevelWaveSet) => onEdit({ ...level, waveSets: { ...level.waveSets, [id]: set } });
  const campaign = level.waveSets["campaign"];
  return (
    <div className="wave-sets-tab">
      {campaign !== undefined && (
        <fieldset className="wave-set">
          <legend>The campaign</legend>
          <p>
            50 waves in order; meteor challenges after waves {campaign.meteorAfter.join(", ")}; every astronaut, unlocking as waves are cleared. That shape is
            the game's, not the level's.
          </p>
          <label>
            Starting credits{" "}
            <input type="number" min={R.startCredits.min} max={R.startCredits.max} step={10} value={campaign.startCredits} onChange={(e) => setSet("campaign", { ...campaign, startCredits: clamp(Number(e.target.value), R.startCredits.min, R.startCredits.max) })} />
          </label>
          {at("campaign").map((p, i) => (
            <p key={i} className={p.severity === "warn" ? "warning" : "error"}>
              {problemText(p)}
            </p>
          ))}
        </fieldset>
      )}
      {Object.entries(level.waveSets)
        .filter(([id]) => id !== "campaign")
        .map(([id, set]) => (
          <ChallengeCard
            key={id}
            id={id}
            set={set}
            level={level}
            problems={at(id)}
            onChange={(next) => setSet(id, next)}
            onRemove={() => {
              const { [id]: _gone, ...rest } = level.waveSets;
              onEdit({ ...level, waveSets: rest });
            }}
          />
        ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
          const id = slug === "" ? level.levelId : `${level.levelId}-${slug}`;
          if (name.trim() === "" || id.length > 40 || Object.hasOwn(level.waveSets, id)) return;
          const set: LevelWaveSet = {
            mode: "CHALLENGE",
            name: name.trim(),
            mapId: level.levelId,
            waves: [1, 2],
            meteorAfter: [],
            startCredits: 200,
            colonyHealth: 20,
            classes: ["nova"],
            padsOpenAsForWave: 1,
            presetPlacements: [],
          };
          onEdit({ ...level, waveSets: { ...level.waveSets, [id]: set } });
          setName("");
        }}
      >
        <label>
          New challenge <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="New challenge name" />
        </label>
        <button type="submit">Add challenge</button>
      </form>
    </div>
  );
}
