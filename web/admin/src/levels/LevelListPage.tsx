import { useEffect, useRef, useState } from "react";
import { ApiError, describeError, type AdminApi, type LevelFile, type LevelSummary, type PlanetSummary } from "../api";
import { ConfirmDialog, useFocusReturn } from "../ConfirmDialog";
import { clearFlash, peekFlash, setFlash } from "../flash";
import { hrefOf } from "../routes";
import { LEVEL_ID, NAME_MAX, newLevel, readLevelFile, TEMPLATES } from "./levelFile";
import { loadLiveBase } from "./liveBase";

// Admin → Levels (Gate M, LD3; scope-level-designer.md §3.1 steps 1-2): the level drafts, New level from a template,
// Upload level file (a file downloaded from the editor, or kept in the repo), and Delete. A level that was ever published
// cannot be deleted (saved games may be on its versions): its wave sets are retired in Versions instead (LD7).

type Props = { readonly api: AdminApi; readonly navigate?: (hash: string) => void };

/** "Blob Rush!" -> "blob-rush": a suggested level ID (lower case, digits and dashes, at most 36). */
export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 36)
    .replace(/-+$/u, "");
}

function createError(error: unknown): string {
  if (error instanceof ApiError && error.details.some((p) => p.field === "level.levelId" && p.rule === "exists")) {
    return "A level with that ID already exists. Choose another ID.";
  }
  return describeError(error);
}

export function LevelListPage({ api, navigate = (hash) => window.location.assign(hash) }: Props) {
  const [items, setItems] = useState<LevelSummary[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [flash] = useState(peekFlash);
  useEffect(clearFlash, []);
  const [name, setName] = useState("");
  const [levelId, setLevelId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [template, setTemplate] = useState(TEMPLATES[0]?.id ?? "blank");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);
  useFocusReturn(deleting !== null, deleteTrigger);

  const load = (): void => {
    api.listLevels().then(
      (page) => setItems(page.items),
      (error: unknown) => setMessage(describeError(error)),
    );
  };
  useEffect(load, [api]);
  // "Copy Moonbeam map and campaign" copies the live campaign: load the live version (LD7). On failure the template
  // uses this build's copy; the editor says so and keeps publishing off.
  // LD10: the planets a new level can belong to (any but a released one other than the first is fine); the chosen
  // planet's base is what "Copy Moonbeam map and campaign" copies from when it has a campaign.
  const [planets, setPlanets] = useState<PlanetSummary[]>([]);
  const [planet, setPlanet] = useState("luna-1");
  useEffect(() => {
    api.listPlanets().then(
      (answer) => setPlanets(answer.planets),
      () => setPlanets([]),
    );
  }, [api]);
  useEffect(() => {
    loadLiveBase(api, planet === "luna-1" ? undefined : planet).catch(() => undefined);
  }, [api, planet]);

  const id = idTouched ? levelId : slugOf(name);
  const idOk = LEVEL_ID.test(id);
  const nameOk = name.trim() !== "" && name.length <= NAME_MAX;

  const create = async (level: LevelFile): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      // LD10: a level of another planet starts with that planet's default backdrop (still changeable on the map).
      const chosen = planets.find((p) => p.planetId === planet);
      const start = chosen?.backdrop && level.map.art.backdrop === null ? { ...level, map: { ...level.map, art: { ...level.map.art, backdrop: chosen.backdrop } } } : level;
      await api.createLevel(start, planet === "luna-1" ? undefined : planet);
      navigate(hrefOf({ page: "level", id: level.levelId }));
    } catch (error) {
      setMessage(createError(error));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File): Promise<void> => {
    const read = readLevelFile(await file.text());
    if (!read.ok) {
      setMessage(`That file cannot be used: ${read.reason}`);
      return;
    }
    await create(read.level);
  };

  const remove = async (target: string): Promise<void> => {
    setBusy(true);
    try {
      await api.deleteLevel(target);
      setFlash(`Level ${target} deleted.`);
      setDeleting(null);
      setMessage(null);
      load();
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="levels">
      <h2>Levels</h2>
      <p>
        <a href={hrefOf({ page: "versions" })}>Versions</a>: what is live, rollback, retire, testers.{" "}
        <a href={hrefOf({ page: "planets" })}>Planets</a>: add a planet and release it.{" "}
        <a href={hrefOf({ page: "aliens" })}>Aliens</a>: make an alien for your waves.
      </p>
      <div role="status">
        {flash !== null && <p className="flash">{flash}</p>}
        {message !== null && <p className="error">{message}</p>}
      </div>

      <form
        className="level-new"
        aria-labelledby="level-new-heading"
        onSubmit={(event) => {
          event.preventDefault();
          if (idOk && nameOk && !busy) void create(newLevel(id, name.trim(), template));
        }}
      >
        <h3 id="level-new-heading">New level</h3>
        <label>
          Name <input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          ID{" "}
          <input
            value={id}
            maxLength={36}
            onChange={(e) => {
              setIdTouched(true);
              setLevelId(e.target.value);
            }}
            aria-describedby="level-id-hint"
            aria-invalid={id !== "" && !idOk}
          />
        </label>
        <p id="level-id-hint" className="muted">
          Lower case letters, digits and dashes. It names the map and its pads, and cannot change later.
        </p>
        {planets.length > 1 && (
          <label>
            Planet{" "}
            <select value={planet} onChange={(e) => setPlanet(e.target.value)}>
              {planets.map((p) => (
                <option key={p.planetId} value={p.planetId}>
                  {p.name}
                  {p.status === "RELEASED" ? "" : " (not released)"}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Start from{" "}
          <select value={template} onChange={(e) => setTemplate(e.target.value)}>
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={!idOk || !nameOk || busy}>
          Create
        </button>
      </form>

      <p>
        <label className="button-like">
          Upload level file{" "}
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file !== undefined) void upload(file);
            }}
          />
        </label>
      </p>

      {items === null ? (
        message === null && <p>Loading…</p>
      ) : items.length === 0 ? (
        <p>No levels yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">ID</th>
              <th scope="col">Planet</th>
              <th scope="col">Status</th>
              <th scope="col">Updated</th>
              <th scope="col">Drawings this month</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.levelId}>
                <td>
                  <a href={hrefOf({ page: "level", id: item.levelId })}>{item.name}</a>
                </td>
                <td>{item.levelId}</td>
                <td>{planets.find((p) => p.planetId === (item.planetId ?? "luna-1"))?.name ?? item.planetId ?? "luna-1"}</td>
                <td>{item.status === "DRAFT" ? "Draft" : "Published"}</td>
                <td>{item.updatedAt.slice(0, 16).replace("T", " ")}</td>
                <td>{item.drawingsThisMonth ?? 0}</td>
                <td>
                  {item.status === "DRAFT" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        deleteTrigger.current = e.currentTarget;
                        setDeleting(item.levelId);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {deleting !== null && (
        <ConfirmDialog labelledBy="level-delete-heading" onCancel={() => !busy && setDeleting(null)}>
          {(cancelRef) => (
            <>
              <h3 id="level-delete-heading">Delete level {deleting}?</h3>
              <p>This removes the draft for good. It has never been published, so no game uses it.</p>
              <p className="muted">Download the level file first if you might want it back.</p>
              <div className="actions">
                <button type="button" ref={cancelRef} disabled={busy} onClick={() => setDeleting(null)}>
                  Cancel
                </button>
                <button type="button" className="danger" disabled={busy} onClick={() => void remove(deleting)}>
                  Delete level
                </button>
              </div>
            </>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
