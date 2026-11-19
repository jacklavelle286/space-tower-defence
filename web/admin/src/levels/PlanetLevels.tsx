// Levels grouped by planet (Gate M, LD19; owner 2026-11-19): each planet with its levels under it, what each level has
// live on that planet (the campaign map, challenges), and Copy to planet / Move to planet. Move is for a level never
// published (R62 refuses the rest: saved games are pinned to its versions); Copy works for any level (copyLevel.ts).
import { useEffect, useRef, useState } from "react";
import { ApiError, describeError, type AdminApi, type LevelFile, type LevelSummary, type PlanetSummary } from "../api";
import { ConfirmDialog, useFocusReturn } from "../ConfirmDialog";
import { hrefOf } from "../routes";
import { copyLevel, ownsCampaign } from "./copyLevel";
import { LEVEL_ID, NAME_MAX } from "./levelFile";

type Props = {
  readonly api: Pick<AdminApi, "getGameData" | "getLevel" | "createLevel" | "moveLevel">;
  readonly items: readonly LevelSummary[];
  readonly planets: readonly PlanetSummary[];
  readonly busy: boolean;
  readonly onBusy: (busy: boolean) => void;
  readonly onDelete: (levelId: string, trigger: HTMLButtonElement) => void;
  /** A level was copied (open it) or moved (reload the list), with what to say. */
  readonly onCopied: (levelId: string, text: string) => void;
  readonly onMoved: (text: string) => void;
};

const planetOf = (item: LevelSummary): string => item.planetId ?? "luna-1";

/** A released planet has its campaign; an unreleased one once a version holds its 50 waves. */
export const hasCampaign = (p: PlanetSummary | undefined): boolean => p !== undefined && (p.status === "RELEASED" || (p.campaignWaves ?? 0) > 0);

/** What a level has live on its planet, from the planet's live document: "Campaign map", "2 challenges". */
export function liveRole(live: unknown, levelId: string): string {
  const sets = typeof live === "object" && live !== null ? (live as { waveSets?: Record<string, { mapId?: string; mode?: string }> }).waveSets : undefined;
  if (sets === undefined) return "";
  const parts: string[] = [];
  if (sets["campaign"]?.mapId === levelId) parts.push("Campaign map");
  const challenges = Object.entries(sets).filter(([k, s]) => k !== "campaign" && s.mapId === levelId).length;
  if (challenges > 0) parts.push(`${challenges} challenge${challenges === 1 ? "" : "s"}`);
  return parts.join(", ");
}

/** A free level ID from a name: "<slug>", then "<slug>-2", "-3"… */
export function freeId(name: string, taken: ReadonlySet<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 32).replace(/-+$/u, "") || "level";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export function PlanetLevels({ api, items, planets, busy, onBusy, onDelete, onCopied, onMoved }: Props) {
  // Each planet's live document, for "Live here"; a planet that fails to load just shows nothing there.
  const [live, setLive] = useState<Record<string, unknown>>({});
  useEffect(() => {
    let current = true;
    for (const p of planets) {
      if (p.status !== "RELEASED" && p.latestVersion === undefined) continue; // nothing published yet
      api.getGameData(p.planetId === "luna-1" ? undefined : p.planetId).then(
        (data) => current && setLive((was) => ({ ...was, [p.planetId]: data.live })),
        () => undefined,
      );
    }
    return () => {
      current = false;
    };
  }, [api, planets]);

  const [copying, setCopying] = useState<LevelSummary | null>(null);
  const [moving, setMoving] = useState<LevelSummary | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useFocusReturn(copying !== null || moving !== null, trigger);

  const known = new Set(planets.map((p) => p.planetId));
  const groups: { planetId: string; planet: PlanetSummary | undefined }[] = [
    ...planets.map((p) => ({ planetId: p.planetId, planet: p as PlanetSummary | undefined })),
    ...[...new Set(items.map(planetOf))].filter((id) => !known.has(id)).map((planetId) => ({ planetId, planet: undefined })),
  ];
  const nameOf = (planetId: string): string => planets.find((p) => p.planetId === planetId)?.name ?? planetId;

  return (
    <>
      {groups.map(({ planetId, planet }) => {
        const rows = items.filter((item) => planetOf(item) === planetId);
        return (
          <section key={planetId} className="planet-levels" aria-labelledby={`planet-${planetId}`}>
            <h3 id={`planet-${planetId}`}>
              {nameOf(planetId)}{" "}
              <span className="muted">
                {planet === undefined
                  ? `(${planetId})`
                  : planet.status === "RELEASED"
                    ? `(released, ${planet.liveVersion ?? ""} live)`
                    : `(not released${planet.latestVersion !== undefined ? `, ${planet.latestVersion} for testers` : ""}; campaign ${planet.campaignWaves ?? 0} of 50 waves)`}
              </span>
            </h3>
            {rows.length === 0 ? (
              <p className="muted">No levels on this planet yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">ID</th>
                    <th scope="col">Status</th>
                    <th scope="col">Live here</th>
                    <th scope="col">Updated</th>
                    <th scope="col">Drawings this month</th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.levelId}>
                      <td>
                        <a href={hrefOf({ page: "level", id: item.levelId })}>{item.name}</a>
                      </td>
                      <td>{item.levelId}</td>
                      <td>{item.status === "DRAFT" ? "Draft" : "Published"}</td>
                      <td>{liveRole(live[planetId], item.levelId)}</td>
                      <td>{item.updatedAt.slice(0, 16).replace("T", " ")}</td>
                      <td>{item.drawingsThisMonth ?? 0}</td>
                      <td className="row">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={(e) => {
                            trigger.current = e.currentTarget;
                            setCopying(item);
                          }}
                        >
                          Copy to planet…
                        </button>
                        {item.status === "DRAFT" && planets.length > 1 && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={(e) => {
                              trigger.current = e.currentTarget;
                              setMoving(item);
                            }}
                          >
                            Move to planet…
                          </button>
                        )}
                        {item.status === "DRAFT" && (
                          <button type="button" disabled={busy} onClick={(e) => onDelete(item.levelId, e.currentTarget)}>
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}

      {copying !== null && (
        <CopyDialog
          api={api}
          source={copying}
          planets={planets}
          taken={new Set(items.map((i) => i.levelId))}
          busy={busy}
          onBusy={onBusy}
          onCancel={() => setCopying(null)}
          onDone={(levelId, text) => {
            setCopying(null);
            onCopied(levelId, text);
          }}
        />
      )}
      {moving !== null && (
        <MoveDialog
          api={api}
          level={moving}
          planets={planets}
          busy={busy}
          onBusy={onBusy}
          onCancel={() => setMoving(null)}
          onDone={(text) => {
            setMoving(null);
            onMoved(text);
          }}
        />
      )}
    </>
  );
}

type CopyProps = {
  readonly api: Pick<AdminApi, "getLevel" | "createLevel">;
  readonly source: LevelSummary;
  readonly planets: readonly PlanetSummary[];
  readonly taken: ReadonlySet<string>;
  readonly busy: boolean;
  readonly onBusy: (busy: boolean) => void;
  readonly onCancel: () => void;
  readonly onDone: (levelId: string, text: string) => void;
};

function CopyDialog({ api, source, planets, taken, busy, onBusy, onCancel, onDone }: CopyProps) {
  const from = planetOf(source);
  const [planetId, setPlanetId] = useState(() => planets.find((p) => p.planetId !== from)?.planetId ?? from);
  const [name, setName] = useState(source.name);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LevelFile | null>(null);
  const [campaignChoice, setCampaign] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.getLevel(source.levelId).then(
      (view) => setDraft(view.draft.level),
      (e: unknown) => setError(describeError(e)),
    );
  }, [api, source.levelId]);

  const target = planets.find((p) => p.planetId === planetId);
  const sourceHasCampaign = draft !== null && ownsCampaign(draft);
  // Until ticked or unticked: bring the campaign when the planet has none yet.
  const campaign = sourceHasCampaign && (campaignChoice ?? !hasCampaign(target));
  const id = levelId ?? freeId(name, taken);
  const ok = draft !== null && LEVEL_ID.test(id) && !taken.has(id) && name.trim() !== "" && name.length <= NAME_MAX;
  const planetName = target?.name ?? planetId;

  const copy = async (): Promise<void> => {
    if (draft === null) return;
    onBusy(true);
    setError(null);
    try {
      const made = copyLevel(draft, { levelId: id, name: name.trim(), campaign });
      // A level of another planet starts with that planet's default backdrop when the source had none (as New level).
      const start = made.map.art.backdrop === null && target?.backdrop ? { ...made, map: { ...made.map, art: { ...made.map.art, backdrop: target.backdrop } } } : made;
      await api.createLevel(start, planetId === "luna-1" ? undefined : planetId);
      onDone(id, `Copied from ${source.name} onto ${planetName}${campaign ? ", with the 50 campaign waves" : ""}.`);
    } catch (e) {
      setError(e instanceof ApiError && e.details.some((p) => p.field === "level.levelId" && p.rule === "exists") ? "A level with that ID already exists. Choose another ID." : describeError(e));
    } finally {
      onBusy(false);
    }
  };

  return (
    <ConfirmDialog labelledBy="level-copy-heading" onCancel={() => !busy && onCancel()}>
      {(cancelRef) => (
        <>
          <h3 id="level-copy-heading">Copy {source.name} to a planet</h3>
          <p className="muted">A new level with the same map, waves and challenges. The original does not change.</p>
          <label>
            Planet{" "}
            <select value={planetId} disabled={busy} onChange={(e) => setPlanetId(e.target.value)}>
              {planets.map((p) => (
                <option key={p.planetId} value={p.planetId}>
                  {p.name}
                  {p.status === "RELEASED" ? "" : " (not released)"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name <input value={name} maxLength={NAME_MAX} disabled={busy} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            ID <input value={id} maxLength={36} disabled={busy} onChange={(e) => setLevelId(e.target.value)} aria-invalid={!LEVEL_ID.test(id) || taken.has(id)} />
          </label>
          {taken.has(id) && <p className="muted">That ID is taken.</p>}
          {sourceHasCampaign && (
            <label className="check">
              <input type="checkbox" checked={campaign} disabled={busy} onChange={(e) => setCampaign(e.target.checked)} /> Bring the 50 campaign waves
            </label>
          )}
          {campaign && hasCampaign(target) && <p className="notice">Publishing the copy replaces {planetName}&apos;s campaign map and waves for every new game.</p>}
          {sourceHasCampaign && !campaign && <p className="muted">Its challenges will use {planetName}&apos;s campaign waves.</p>}
          {draft === null && error === null && <p>Loading the level…</p>}
          {error !== null && <p role="alert">{error}</p>}
          <div className="actions">
            <button type="button" ref={cancelRef} disabled={busy} onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="primary" disabled={!ok || busy} onClick={() => void copy()}>
              Copy
            </button>
          </div>
        </>
      )}
    </ConfirmDialog>
  );
}

type MoveProps = {
  readonly api: Pick<AdminApi, "moveLevel">;
  readonly level: LevelSummary;
  readonly planets: readonly PlanetSummary[];
  readonly busy: boolean;
  readonly onBusy: (busy: boolean) => void;
  readonly onCancel: () => void;
  readonly onDone: (text: string) => void;
};

function MoveDialog({ api, level, planets, busy, onBusy, onCancel, onDone }: MoveProps) {
  const from = planetOf(level);
  const others = planets.filter((p) => p.planetId !== from);
  const [planetId, setPlanetId] = useState(others[0]?.planetId ?? from);
  const [error, setError] = useState<string | null>(null);
  const target = planets.find((p) => p.planetId === planetId);

  const move = async (): Promise<void> => {
    onBusy(true);
    setError(null);
    try {
      await api.moveLevel(level.levelId, planetId);
      onDone(`${level.name} moved to ${target?.name ?? planetId}. Run Get it ready again before publishing it.`);
    } catch (e) {
      setError(e instanceof ApiError && e.code === "LEVEL_PUBLISHED" ? "This level has been published, so it stays on its planet. Copy it instead." : describeError(e));
    } finally {
      onBusy(false);
    }
  };

  return (
    <ConfirmDialog labelledBy="level-move-heading" onCancel={() => !busy && onCancel()}>
      {(cancelRef) => (
        <>
          <h3 id="level-move-heading">Move {level.name} to another planet</h3>
          <label>
            Planet{" "}
            <select value={planetId} disabled={busy} onChange={(e) => setPlanetId(e.target.value)}>
              {others.map((p) => (
                <option key={p.planetId} value={p.planetId}>
                  {p.name}
                  {p.status === "RELEASED" ? "" : " (not released)"}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            Its map, waves and challenges go with it and are checked against {target?.name ?? planetId} from now on. If it holds the 50 campaign
            waves, publishing it there makes it {target?.name ?? planetId}&apos;s campaign map.
          </p>
          {error !== null && <p role="alert">{error}</p>}
          <div className="actions">
            <button type="button" ref={cancelRef} disabled={busy} onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="primary" disabled={busy || others.length === 0} onClick={() => void move()}>
              Move
            </button>
          </div>
        </>
      )}
    </ConfirmDialog>
  );
}
