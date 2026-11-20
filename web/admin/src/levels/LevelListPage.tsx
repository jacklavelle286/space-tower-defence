import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, describeError, type AdminApi, type LevelFile, type LevelSummary, type PlanetSummary } from "../api";
import { ConfirmDialog, useFocusReturn } from "../ConfirmDialog";
import { clearFlash, peekFlash, setFlash } from "../flash";
import { hrefOf } from "../routes";
import { LEVEL_ID, NAME_MAX, newLevel, readLevelFile, TEMPLATES } from "./levelFile";
import { loadLiveBase } from "./liveBase";
import { LevelMaker } from "./maker/LevelMaker";
import { MapList } from "./MapList";
import { createMap, emptyPlanet, MAP_ID, MAP_ID_MAX } from "./maps";

// Admin → Maps (Gate M, LD3; maps instead of planets, LD22 and ADR-0043): the maps (each its own adventure on Home)
// and the older levels made on the Moon (MapList.tsx), New map made whole (LD18, maker/) or from a template, Upload
// level file (a file downloaded from the editor, or kept in the repo), and Delete. A map that was ever published
// cannot be deleted (saved games may be on its versions): its wave sets are retired in Versions instead (LD7).

type Props = {
  readonly api: AdminApi;
  readonly navigate?: (hash: string) => void;
  readonly maker?: Pick<Parameters<typeof LevelMaker>[0], "firstSeed" | "workers">;
};

/** "Start from" for Make it all for me (LD18): the map, waves and challenges made rather than copied. */
const MAKE = "make";

/** "Blob Rush!" -> "blob-rush": a suggested map ID (lower case, digits and dashes, a letter first, at most 34). */
export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^[^a-z]+|-+$/gu, "")
    .slice(0, MAP_ID_MAX)
    .replace(/-+$/u, "");
}

function createError(error: unknown): string {
  if (error instanceof ApiError && error.details.some((p) => (p.field === "level.levelId" || p.field === "planetId") && p.rule === "exists")) {
    return "A map with that ID already exists. Choose another ID.";
  }
  return describeError(error);
}

export function LevelListPage({ api, navigate = (hash) => window.location.assign(hash), maker }: Props) {
  const [items, setItems] = useState<LevelSummary[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [flash] = useState(peekFlash);
  useEffect(clearFlash, []);
  const [name, setName] = useState("");
  const [levelId, setLevelId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [template, setTemplate] = useState(MAKE);
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
  // The planets underneath the maps (ADR-0043): which maps are on Home, and the IDs a new map cannot take.
  const [planets, setPlanets] = useState<PlanetSummary[]>([]);
  const reloadPlanets = useCallback(() => {
    api.listPlanets().then(
      (answer) => setPlanets(answer.planets),
      () => setPlanets([]),
    );
  }, [api]);
  useEffect(reloadPlanets, [reloadPlanets]);
  // A map without its own waves gets the Moon's (withAdventure): load the Moon's live version (LD7). On failure this
  // build's copy is used; the editor says so and keeps publishing off.
  useEffect(() => {
    loadLiveBase(api).catch(() => undefined);
  }, [api]);

  const levelIds = new Set((items ?? []).map((i) => i.levelId));
  const planetIds = new Set(planets.map((p) => p.planetId));
  const id = idTouched ? levelId : slugOf(name);
  const reusable = (mapId: string): boolean =>
    emptyPlanet(
      planets.find((p) => p.planetId === mapId),
      levelIds,
    );
  const taken = levelIds.has(id) || (planetIds.has(id) && !reusable(id));
  const idOk = LEVEL_ID.test(id) && MAP_ID.test(id) && !taken;
  const nameOk = name.trim() !== "" && name.length <= NAME_MAX;

  const create = async (level: LevelFile, carry?: string): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      await createMap(api, level, reusable(level.levelId));
      if (carry !== undefined) setFlash(carry); // what was made, for the editor's first message (LD18)
      navigate(hrefOf({ page: "level", id: level.levelId }));
    } catch (error) {
      setMessage(createError(error));
      reloadPlanets();
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
    const fileId = read.level.levelId;
    if (!MAP_ID.test(fileId) || levelIds.has(fileId) || (planetIds.has(fileId) && !reusable(fileId))) {
      setMessage(`That file's map ID (${read.level.levelId}) is taken or too long for a map (a letter first, at most ${MAP_ID_MAX} characters).`);
      return;
    }
    await create(read.level);
  };

  const remove = async (target: string): Promise<void> => {
    setBusy(true);
    try {
      await api.deleteLevel(target);
      setFlash(`${target} deleted.`);
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
      <h2>Maps</h2>
      <p>
        <a href={hrefOf({ page: "versions" })}>Versions</a>: what is live, rollback, retire, testers. <a href={hrefOf({ page: "aliens" })}>Aliens</a>: make an
        alien for your waves.
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
          if (idOk && nameOk && !busy && template !== MAKE) void create(newLevel(id, name.trim(), template));
        }}
      >
        <h3 id="level-new-heading">New map</h3>
        <p className="muted">A map is its own adventure on Home: 50 waves and its challenges. Publishing it puts it on Home for every child.</p>
        <label>
          Name <input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          ID{" "}
          <input
            value={id}
            maxLength={MAP_ID_MAX}
            onChange={(e) => {
              setIdTouched(true);
              setLevelId(e.target.value);
            }}
            aria-describedby="level-id-hint"
            aria-invalid={id !== "" && !idOk}
          />
        </label>
        <p id="level-id-hint" className="muted">
          {taken ? "That ID is taken. " : ""}Lower case letters, digits and dashes, a letter first. It names the map and its pads, and cannot change later.
        </p>
        <label>
          Start from{" "}
          <select value={template} onChange={(e) => setTemplate(e.target.value)}>
            <option value={MAKE}>Make it all for me: map, waves and challenges</option>
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {template === MAKE ? (
          <LevelMaker levelId={id} name={name.trim()} ready={idOk && nameOk && !busy} onMade={(level, notes) => create(level, notes.join(" "))} {...maker} />
        ) : (
          <>
            <p className="muted">A map that starts without waves of its own gets the Moon&apos;s 50 (Make it all again on its Map tab makes new ones).</p>
            <button type="submit" disabled={!idOk || !nameOk || busy}>
              Create
            </button>
          </>
        )}
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
      ) : (
        <MapList
          api={api}
          items={items}
          planets={planets}
          levelIds={levelIds}
          planetIds={planetIds}
          busy={busy}
          onBusy={setBusy}
          onDelete={(target, button) => {
            deleteTrigger.current = button;
            setDeleting(target);
          }}
          onMadeMap={(target, text) => {
            setFlash(text);
            navigate(hrefOf({ page: "level", id: target }));
          }}
        />
      )}

      {deleting !== null && (
        <ConfirmDialog labelledBy="level-delete-heading" onCancel={() => !busy && setDeleting(null)}>
          {(cancelRef) => (
            <>
              <h3 id="level-delete-heading">Delete {deleting}?</h3>
              <p>This removes the draft for good. It has never been published, so no game uses it.</p>
              <p className="muted">Download the level file first if you might want it back.</p>
              <div className="actions">
                <button type="button" ref={cancelRef} disabled={busy} onClick={() => setDeleting(null)}>
                  Cancel
                </button>
                <button type="button" className="danger" disabled={busy} onClick={() => void remove(deleting)}>
                  Delete
                </button>
              </div>
            </>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
