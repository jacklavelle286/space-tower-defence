// Levels → Planets (Gate M, LD10; scope-level-designer.md §3.2 "Admin UX"): every planet, released ones first in the
// order children unlock them. Add planet takes a name, an ID, an approved Planet picture (its icon on Home), the art
// set its maps are drawn with (only "moon" until more route tiles are drawn) and an approved Background as the default
// backdrop for its new levels. Build its maps and its 50-wave campaign as levels (New level → planet), send versions to
// testers, then Release: it joins the end of the unlock order for good (children open it by reaching wave 20 on the
// planet before). Release stays off until the newest version has the full campaign; the server checks again.
import { useCallback, useEffect, useState } from "react";
import { libraryPictureUrl } from "@scd/shared";
import { ApiError, describeError, type AdminApi, type NewPlanet, type PictureSummary, type PlanetSummary } from "../../api";
import { ConfirmDialog } from "../../ConfirmDialog";
import { hrefOf } from "../../routes";
import { refusalText } from "../publish/PublishTab";
import "../levels.css";

const PLANET_ID = /^[a-z][a-z0-9-]{0,32}[a-z0-9]$/u;

function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 30);
}

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.code === "PUBLISH_REFUSED") {
    const code = error.info["code"];
    const message = error.info["message"];
    return refusalText({ code: typeof code === "string" ? code : "UNKNOWN", message: typeof message === "string" ? message : "" });
  }
  return describeError(error);
}

type Api = Pick<AdminApi, "listPlanets" | "createPlanet" | "updatePlanet" | "releasePlanet" | "listPictures">;

export function PlanetsPage({ api }: { api: Api }) {
  const [planets, setPlanets] = useState<PlanetSummary[] | null>(null);
  const [artSets, setArtSets] = useState<string[]>(["moon"]);
  const [icons, setIcons] = useState<PictureSummary[]>([]);
  const [backgrounds, setBackgrounds] = useState<PictureSummary[]>([]);
  const [form, setForm] = useState<NewPlanet>({ planetId: "", name: "", icon: null, artSet: "moon", backdrop: null });
  const [idTouched, setIdTouched] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [releasing, setReleasing] = useState<PlanetSummary | null>(null);

  const load = useCallback(() => {
    api.listPlanets().then(
      (answer) => {
        setPlanets(answer.planets);
        setArtSets(answer.artSets);
      },
      (error: unknown) => setMessage(describeError(error)),
    );
  }, [api]);
  useEffect(load, [load]);
  useEffect(() => {
    void Promise.all([api.listPictures("APPROVED", "planet"), api.listPictures("APPROVED", "background")]).then(
      ([p, b]) => {
        setIcons(p.pictures);
        setBackgrounds(b.pictures);
      },
      () => undefined, // a planet can be added without pictures
    );
  }, [api]);

  const planetId = idTouched ? form.planetId : slugOf(form.name);
  const ok = PLANET_ID.test(planetId) && form.name.trim() !== "" && form.name.length <= 40;
  const lastReleased = planets?.filter((p) => p.status === "RELEASED").at(-1);

  async function act(run: () => Promise<unknown>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      await run();
      setMessage(done);
      load();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="planets-page" aria-labelledby="planets-heading">
      <p>
        <a href={hrefOf({ page: "levels" })}>Levels</a>
      </p>
      <h2 id="planets-heading">Planets</h2>
      <p className="muted">
        Released planets are in the order children open them: each opens when a child reaches wave 20 on the one before.
        A released planet is never moved or removed.
      </p>
      {message !== null && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {planets === null ? (
        <p>Loading…</p>
      ) : (
        <table className="versions-table">
          <thead>
            <tr>
              <th scope="col">Planet</th>
              <th scope="col">State</th>
              <th scope="col">Version</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {planets.map((p) => (
              <tr key={p.planetId}>
                <th scope="row">
                  {p.icon ? <img src={libraryPictureUrl(p.icon) ?? ""} alt="" width={40} height={40} /> : null} {p.name}{" "}
                  <span className="muted">({p.planetId})</span>
                </th>
                <td>{p.status === "RELEASED" ? `Released, number ${(p.order ?? 0) + 1}` : "Not released"}</td>
                <td>
                  {p.status === "RELEASED"
                    ? `${p.liveVersion ?? ""} live`
                    : p.latestVersion !== undefined
                      ? `${p.latestVersion} (campaign: ${p.campaignWaves ?? 0} of 50 waves)`
                      : "Nothing published yet"}
                </td>
                <td>
                  {p.status === "DRAFT" && (
                    <button type="button" disabled={busy || p.readyToRelease !== true} onClick={() => setReleasing(p)}>
                      Release
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form
        className="level-new"
        aria-labelledby="planet-new-heading"
        onSubmit={(event) => {
          event.preventDefault();
          if (ok && !busy) void act(() => api.createPlanet({ ...form, planetId, name: form.name.trim() }), `Planet ${form.name.trim()} added. Make its levels next.`);
        }}
      >
        <h3 id="planet-new-heading">Add planet</h3>
        <label>
          Name <input value={form.name} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label>
          ID{" "}
          <input
            value={planetId}
            maxLength={34}
            onChange={(e) => {
              setIdTouched(true);
              setForm({ ...form, planetId: e.target.value });
            }}
            aria-invalid={planetId !== "" && !PLANET_ID.test(planetId)}
          />
        </label>
        <label>
          Icon{" "}
          <select value={form.icon ?? ""} onChange={(e) => setForm({ ...form, icon: e.target.value === "" ? null : e.target.value })}>
            <option value="">None yet</option>
            {icons.map((pic) => (
              <option key={pic.id} value={pic.id}>
                {pic.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Look{" "}
          <select value={form.artSet} onChange={(e) => setForm({ ...form, artSet: e.target.value })}>
            {artSets.map((set) => (
              <option key={set} value={set}>
                {set === "moon" ? "Moon (route, pads, colony)" : set}
              </option>
            ))}
          </select>
        </label>
        <label>
          Default backdrop{" "}
          <select value={form.backdrop ?? ""} onChange={(e) => setForm({ ...form, backdrop: e.target.value === "" ? null : e.target.value })}>
            <option value="">Moon ground</option>
            {backgrounds.map((pic) => (
              <option key={pic.id} value={pic.id}>
                {pic.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={!ok || busy}>
          Add planet
        </button>
        <p className="muted">
          Then on Levels, make a New level for this planet from "Copy Moonbeam map and campaign": a new planet's first version comes from its
          50-wave campaign.
        </p>
      </form>

      {releasing !== null && (
        <ConfirmDialog labelledBy="planet-release" onCancel={() => setReleasing(null)}>
          {(cancelRef) => (
            <>
              <h3 id="planet-release">Release {releasing.name}?</h3>
              <p>
                It becomes planet number {(planets?.filter((p) => p.status === "RELEASED").length ?? 0) + 1}, after
                {lastReleased !== undefined ? ` ${lastReleased.name}` : " the last planet"}. Children open it by reaching wave 20 there. This
                cannot be undone, and its place in the order never changes.
              </p>
              <div className="dialog-buttons">
                <button type="button" ref={cancelRef} onClick={() => setReleasing(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    const target = releasing;
                    setReleasing(null);
                    void act(() => api.releasePlanet(target.planetId), `${target.name} is released.`);
                  }}
                >
                  Release
                </button>
              </div>
            </>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
