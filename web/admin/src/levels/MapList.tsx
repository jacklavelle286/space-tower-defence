// The maps and the older Moon levels (Gate M, LD22; ADR-0043): each map with whether it is on Home, and each level
// made on the Moon before maps with "Make it its own map" (maps.ts). Replaces the levels grouped by planet (LD19).
import { useRef, useState } from "react";
import { describeError, type AdminApi, type LevelSummary, type PlanetSummary } from "../api";
import { ConfirmDialog, useFocusReturn } from "../ConfirmDialog";
import { hrefOf } from "../routes";
import { freeId, makeOwnMap, MAP_ID, onTheMoon, planetOf } from "./maps";

type Props = {
  readonly api: Pick<AdminApi, "createPlanet" | "createLevel" | "moveLevel" | "getLevel" | "saveLevel">;
  readonly items: readonly LevelSummary[];
  readonly planets: readonly PlanetSummary[];
  readonly levelIds: ReadonlySet<string>;
  readonly planetIds: ReadonlySet<string>;
  readonly busy: boolean;
  readonly onBusy: (busy: boolean) => void;
  readonly onDelete: (levelId: string, trigger: HTMLButtonElement) => void;
  /** A Moon level became a map: open it, with what to say. */
  readonly onMadeMap: (levelId: string, text: string) => void;
};

/** Where a map is for children: on Home, a preview for testers, or not yet. */
export function homeText(planet: PlanetSummary | undefined): string {
  if (planet?.status === "RELEASED") return "On Home";
  if (planet?.latestVersion !== undefined) return "Testers only";
  return "Not yet";
}

export function MapList({ api, items, planets, levelIds, planetIds, busy, onBusy, onDelete, onMadeMap }: Props) {
  const [making, setMaking] = useState<LevelSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useFocusReturn(making !== null, trigger);
  const maps = items.filter((i) => !onTheMoon(i));
  const moon = items.filter(onTheMoon);
  const planetFor = (item: LevelSummary): PlanetSummary | undefined => planets.find((p) => p.planetId === planetOf(item));

  const make = async (item: LevelSummary): Promise<void> => {
    onBusy(true);
    setError(null);
    try {
      const moves = item.status === "DRAFT" && MAP_ID.test(item.levelId) && !planetIds.has(item.levelId);
      const id = await makeOwnMap(api, item, moves ? item.levelId : freeId(item.name, new Set([...levelIds, ...planetIds])));
      setMaking(null);
      onMadeMap(
        id,
        moves
          ? `${item.name} is its own map now. Get it ready and publish it to put it on Home.`
          : `${item.name} was copied into a map of its own, ${id}. Get it ready and publish it to put it on Home. The original stays on the Moon.`,
      );
    } catch (e) {
      setError(describeError(e));
    } finally {
      onBusy(false);
    }
  };

  const rows = (list: readonly LevelSummary[], moonRows: boolean) => (
    <table>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">{moonRows ? "Status" : "For children"}</th>
          <th scope="col">Updated</th>
          <th scope="col">Drawings this month</th>
          <th scope="col">
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {list.map((item) => (
          <tr key={item.levelId}>
            <td>
              <a href={hrefOf({ page: "level", id: item.levelId })}>{item.name}</a> <span className="muted">{item.levelId}</span>
            </td>
            <td>{moonRows ? (item.status === "DRAFT" ? "Draft" : "Published on the Moon") : homeText(planetFor(item))}</td>
            <td>{item.updatedAt.slice(0, 16).replace("T", " ")}</td>
            <td>{item.drawingsThisMonth ?? 0}</td>
            <td className="row">
              {moonRows && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={(e) => {
                    trigger.current = e.currentTarget;
                    setError(null);
                    setMaking(item);
                  }}
                >
                  Make it its own map…
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
  );

  return (
    <>
      <section className="map-list" aria-labelledby="maps-heading">
        <h3 id="maps-heading">Maps</h3>
        <p className="muted">The Moon is the game&apos;s first map. Every map is its own adventure on Home, open to every child from the start.</p>
        {maps.length === 0 ? <p>No maps of your own yet.</p> : rows(maps, false)}
      </section>
      {moon.length > 0 && (
        <section className="map-list" aria-labelledby="moon-levels-heading">
          <h3 id="moon-levels-heading">Older levels on the Moon</h3>
          <p className="muted">Made before maps: they share the Moon&apos;s adventure. Make one its own map to give it its own place on Home.</p>
          {rows(moon, true)}
        </section>
      )}

      {making !== null && (
        <ConfirmDialog labelledBy="own-map-heading" onCancel={() => !busy && setMaking(null)}>
          {(cancelRef) => (
            <>
              <h3 id="own-map-heading">Make {making.name} its own map?</h3>
              {making.status === "DRAFT" ? (
                <p>
                  It moves off the Moon onto its own map. If it has no 50 waves of its own, it gets the Moon&apos;s (Make it all again on its Map tab makes new
                  ones).
                </p>
              ) : (
                <p>
                  It has been published on the Moon, so it stays there (games may be using it), and a copy becomes the new map. What it added to the Moon stays
                  on the Moon until you retire it in Versions.
                </p>
              )}
              {error !== null && <p role="alert">{error}</p>}
              <div className="actions">
                <button type="button" ref={cancelRef} disabled={busy} onClick={() => setMaking(null)}>
                  Cancel
                </button>
                <button type="button" className="primary" disabled={busy} onClick={() => void make(making)}>
                  Make it its own map
                </button>
              </div>
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
