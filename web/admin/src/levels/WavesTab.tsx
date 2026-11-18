import { CURVES, fillIn, introduceAlien, isBoss, scaleCounts, typesBy, vary, waveStats, type AuthoredWave, type Curve, type WaveBody } from "@scd/game-core";
import { LIMITS } from "@scd/shared";
import { useState } from "react";
import type { AdminApi, LevelFile, LevelGroup, LevelWave, LevelWaveBody } from "../api";
import { CopyWaves } from "./CopyWaves";
import { CurvePanel } from "./curves/CurvePanel";
import { currentRuleset, liveBase, problemText, routeTiles as routeTilesOf, type LevelProblem } from "./levelFile";
import { WaveMaker } from "./WaveMaker";

// The Waves tab (Gate M, LD4; scope-level-designer.md §3.1 step 8 and §3.1a). A campaign level edits the 50 campaign
// waves: mark a few as keyframes, Fill in rebuilds the waves between them along a curve, a wave set by hand is kept;
// Vary re-rolls one wave inside its toughness budget from a seed you can see, shown before you keep it. Every level can
// have challenge-only waves ("<levelId>-..."). Inputs keep to the friendly ranges in contracts/limits.json; a problem
// from the rules or the parser is shown on the row it is about. Everything here is design time: what is published is
// a fixed list of waves.

type Props = {
  readonly level: LevelFile;
  readonly problems: readonly LevelProblem[];
  readonly onEdit: (level: LevelFile) => void;
  /** For Copy from another level (LD17); without it the panel is not shown. */
  readonly api?: Pick<AdminApi, "listLevels" | "getLevel">;
};

const R = LIMITS.levelDesigner;
// Read on each render: the live ruleset (AM1: with the made aliens) arrives after the page loads.
const aliens = () =>
  Object.entries(currentRuleset().aliens)
    .filter(([, a]) => !a.descendantOnly)
    .map(([id, a]) => ({ id, name: a.name }));
const bosses = () => Object.entries(currentRuleset().bosses).map(([id, b]) => ({ id, name: b.name }));

function num(value: string, lo: number, hi: number, fallback: number): number {
  const v = Number(value);
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
}

/** One wave's groups and multipliers, with its derived numbers. */
function WaveEditor({
  label,
  body,
  bossAllowed,
  routeTiles,
  problems,
  onChange,
  extra,
}: {
  label: string;
  body: LevelWaveBody;
  bossAllowed: boolean;
  routeTiles: number;
  problems: readonly LevelProblem[];
  onChange: (body: LevelWaveBody) => void;
  extra?: React.ReactNode;
}) {
  const stats = waveStats(currentRuleset(), body as WaveBody, routeTiles);
  const setGroup = (j: number, patch: Partial<LevelGroup>) => onChange({ ...body, groups: body.groups.map((g, k) => (k === j ? { ...g, ...patch } : g)) });
  const types = bossAllowed ? [...aliens(), ...bosses()] : aliens();
  return (
    <fieldset className="wave-row">
      <legend>{label}</legend>
      <table>
        <thead>
          <tr>
            <th scope="col">Alien</th>
            <th scope="col">Count</th>
            <th scope="col">Starts (s)</th>
            <th scope="col">Gap (s)</th>
            <th scope="col">
              <span className="visually-hidden">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {body.groups.map((g, j) => (
            <tr key={j}>
              <td>
                <select aria-label={`${label}, group ${j + 1}, alien`} value={g.type} onChange={(e) => setGroup(j, { type: e.target.value })}>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  type="number"
                  aria-label={`${label}, group ${j + 1}, count`}
                  min={R.groupCount.min}
                  max={isBoss(currentRuleset(), g.type) ? 1 : R.groupCount.max}
                  value={g.count}
                  onChange={(e) => setGroup(j, { count: Math.round(num(e.target.value, R.groupCount.min, R.groupCount.max, g.count)) })}
                />
              </td>
              <td>
                <input type="number" step={0.5} aria-label={`${label}, group ${j + 1}, starts`} min={R.groupSeconds.min} max={R.groupSeconds.max} value={g.at} onChange={(e) => setGroup(j, { at: num(e.target.value, R.groupSeconds.min, R.groupSeconds.max, g.at) })} />
              </td>
              <td>
                <input type="number" step={0.1} aria-label={`${label}, group ${j + 1}, gap`} min={R.groupSeconds.min} max={R.groupSeconds.max} value={g.gap} onChange={(e) => setGroup(j, { gap: num(e.target.value, R.groupSeconds.min, R.groupSeconds.max, g.gap) })} />
              </td>
              <td>
                <button type="button" aria-label={`${label}, remove group ${j + 1}`} disabled={body.groups.length === 1} onClick={() => onChange({ ...body, groups: body.groups.filter((_, k) => k !== j) })}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="wave-controls">
        <button type="button" disabled={body.groups.length >= R.groupsPerWave.max} onClick={() => onChange({ ...body, groups: [...body.groups, { type: "blob", count: 4, at: (body.groups.at(-1)?.at ?? 0) + 5, gap: 2 }] })}>
          Add group
        </button>
        <label>
          Health ×{" "}
          <input type="number" step={0.05} min={R.hpMult.min} max={R.hpMult.max} value={body.hpMult} onChange={(e) => onChange({ ...body, hpMult: num(e.target.value, R.hpMult.min, R.hpMult.max, body.hpMult) })} />
        </label>
        <label>
          Speed ×{" "}
          <input type="number" step={0.05} min={R.speedMult.min} max={R.speedMult.max} value={body.speedMult} onChange={(e) => onChange({ ...body, speedMult: num(e.target.value, R.speedMult.min, R.speedMult.max, body.speedMult) })} />
        </label>
        {extra}
      </p>
      <p className="muted">
        {stats.aliens} aliens, {stats.health} health, up to {stats.seconds} s, at most {stats.peakLive} on the route at once
      </p>
      {problems.map((p, i) => (
        <p key={i} className={p.severity === "warn" ? "warning" : "error"}>
          {problemText(p)}
        </p>
      ))}
    </fieldset>
  );
}

export function WavesTab({ level, problems, onEdit, api }: Props) {
  const [curve, setCurve] = useState<Curve>("linear");
  const [range, setRange] = useState({ from: 1, to: 50, pct: 10 });
  const [rolls, setRolls] = useState<Record<number, { seed: number; body: LevelWaveBody }>>({});
  const [newWave, setNewWave] = useState("");
  const tiles = routeTilesOf(level);
  const waves = level.waves ?? [];
  const keyframes = level.design?.keyframes ?? [];
  const overrides = level.design?.overrides ?? [];
  const at = (prefix: string) => problems.filter((p) => p.field === prefix || p.field.startsWith(`${prefix}.`) || p.field.startsWith(`${prefix}[`));
  const setWaves = (next: readonly AuthoredWave[] | readonly LevelWave[], design = level.design) =>
    onEdit({ ...level, waves: next as LevelWave[], ...(design === undefined ? {} : { design }) });
  const toggle = (key: "keyframes" | "overrides", n: number) => {
    const list = level.design?.[key] ?? [];
    const next = list.includes(n) ? list.filter((x) => x !== n) : [...list, n].sort((a, b) => a - b);
    onEdit({ ...level, design: { ...level.design, [key]: next } });
  };

  return (
    <div className="waves-tab">
      <WaveMaker level={level} onEdit={onEdit} />
      {api !== undefined && <CopyWaves api={api} level={level} onEdit={onEdit} />}
      {waves.length === 0 ? (
        <p>
          This level does not own the campaign: its challenges can use the live campaign's waves by number (1 to {liveBase().planet.waves.length}) and their own
          challenge waves below.
        </p>
      ) : (
        <section aria-labelledby="campaign-waves">
          <h3 id="campaign-waves">Campaign waves</h3>
          <div className="wave-tools" role="group" aria-label="Ramp tools">
            <label>
              Curve{" "}
              <select value={curve} onChange={(e) => setCurve(e.target.value as Curve)}>
                {CURVES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <button type="button" disabled={keyframes.length < 2} onClick={() => setWaves(fillIn(currentRuleset(), waves as AuthoredWave[], keyframes, { curve, overrides }))}>
              Fill in between keyframes
            </button>
            <span className="muted">
              Keyframes: {keyframes.join(", ") || "none"}. Set by hand: {overrides.join(", ") || "none"}.
            </span>
            <label>
              Scale counts in waves <input type="number" aria-label="From wave" min={1} max={50} value={range.from} onChange={(e) => setRange({ ...range, from: num(e.target.value, 1, 50, 1) })} /> to{" "}
              <input type="number" aria-label="To wave" min={1} max={50} value={range.to} onChange={(e) => setRange({ ...range, to: num(e.target.value, 1, 50, 50) })} /> by{" "}
              <input type="number" aria-label="Percent" min={-50} max={100} value={range.pct} onChange={(e) => setRange({ ...range, pct: num(e.target.value, -50, 100, 10) })} /> %
            </label>
            <button type="button" onClick={() => setWaves(scaleCounts(currentRuleset(), waves as AuthoredWave[], range.from, range.to, range.pct))}>
              Scale
            </button>
          </div>
          <CurvePanel level={level} onSetWaves={(next) => setWaves(next)} />
          {waves.map((w, i) => {
            const roll = rolls[w.wave];
            const replace = (body: LevelWaveBody) => setWaves(waves.map((x, k) => (k === i ? { ...body, wave: w.wave } : x)));
            return (
              <div key={w.wave}>
                <WaveEditor
                  label={`Wave ${w.wave}${w.wave % 10 === 0 ? " (boss)" : ""}`}
                  body={w}
                  bossAllowed={w.wave % 10 === 0}
                  routeTiles={tiles}
                  problems={at(`planet.waves[${i}]`)}
                  onChange={replace}
                  extra={
                    <>
                      <label>
                        <input type="checkbox" checked={keyframes.includes(w.wave)} onChange={() => toggle("keyframes", w.wave)} /> Keyframe
                      </label>
                      <label>
                        <input type="checkbox" checked={overrides.includes(w.wave)} onChange={() => toggle("overrides", w.wave)} /> Set by hand
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const seed = (roll?.seed ?? w.wave * 1000) + 1;
                          setRolls({ ...rolls, [w.wave]: { seed, body: vary(currentRuleset(), w as WaveBody, seed, { pool: typesBy(currentRuleset(), waves as AuthoredWave[], w.wave) }) as LevelWaveBody } });
                        }}
                      >
                        Vary
                      </button>
                      <label>
                        Introduce{" "}
                        <select aria-label={`Wave ${w.wave}, introduce an alien on its own`} value="" onChange={(e) => e.target.value !== "" && replace({ ...w, groups: introduceAlien(e.target.value) })}>
                          <option value="">…</option>
                          {aliens().map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  }
                />
                {roll !== undefined && (
                  <div className="vary-preview" role="group" aria-label={`Wave ${w.wave}, varied (seed ${roll.seed})`}>
                    <p>
                      Varied with seed {roll.seed}: {roll.body.groups.map((g) => `${g.count} × ${currentRuleset().aliens[g.type]?.name ?? currentRuleset().bosses[g.type]?.name ?? g.type}`).join(", ")}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        replace(roll.body);
                        const { [w.wave]: _kept, ...rest } = rolls;
                        setRolls(rest);
                      }}
                    >
                      Keep
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const { [w.wave]: _thrown, ...rest } = rolls;
                        setRolls(rest);
                      }}
                    >
                      Throw away
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      <section aria-labelledby="challenge-waves">
        <h3 id="challenge-waves">Challenge waves</h3>
        {Object.entries(level.challengeWaves).map(([id, body]) => (
          <WaveEditor
            key={id}
            label={id}
            body={body}
            bossAllowed={false}
            routeTiles={tiles}
            problems={at(`planet.challengeWaves.${id}`)}
            onChange={(next) => onEdit({ ...level, challengeWaves: { ...level.challengeWaves, [id]: next } })}
            extra={
              <button
                type="button"
                onClick={() => {
                  const { [id]: _gone, ...rest } = level.challengeWaves;
                  onEdit({ ...level, challengeWaves: rest });
                }}
              >
                Remove wave
              </button>
            }
          />
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const id = `${level.levelId}-${newWave.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "")}`;
            if (newWave.trim() === "" || id.length > 40 || Object.hasOwn(level.challengeWaves, id)) return;
            onEdit({ ...level, challengeWaves: { ...level.challengeWaves, [id]: { groups: [{ type: "blob", count: 8, at: 0, gap: 1.5 }], hpMult: 1, speedMult: 1 } } });
            setNewWave("");
          }}
        >
          <label>
            New challenge wave {level.levelId}-<input value={newWave} onChange={(e) => setNewWave(e.target.value)} aria-label="New challenge wave name" />
          </label>
          <button type="submit">Add</button>
        </form>
      </section>
    </div>
  );
}
