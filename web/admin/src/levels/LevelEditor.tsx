import {
  GRID_COLS,
  GRID_ROWS,
  MAX_WAYPOINTS,
  mapGeometry,
  padReach,
  routeCells,
} from "@scd/game-core";
import {
  DECORATIONS,
  MAP_ART,
  routeTiles,
  TILE_PX,
  tileToPx,
  type RouteTile,
} from "@scd/shared/map";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  ApiError,
  describeError,
  type AdminApi,
  type LevelFile,
  type LevelPublish,
  type LevelReview,
  type LevelVersion,
  type LevelView,
  type PictureSummary,
} from "../api";
import { hrefOf } from "../routes";
import { artUrl, pictureUrl } from "./artUrls";
import {
  editorReducer,
  initialEditor,
  routeCellSet,
  TOOLS,
  type Action,
  type EditorState,
} from "./editorModel";
import {
  levelFileDownload,
  levelProblems,
  liveBase,
  liveBaseLoaded,
  OPENS_AFTER,
  problemText,
  type LevelProblem,
} from "./levelFile";
import { loadLiveBase } from "./liveBase";
import { PublishTab } from "./publish/PublishTab";
import "./levels.css";
import type { CheckWorker } from "./checkRun";
import { TestTab } from "./TestTab";
import { WaveSetsTab } from "./WaveSetsTab";
import { WavesTab } from "./WavesTab";

// The map editor (Gate M, LD3; scope-level-designer.md §3.1 steps 3-7). The canvas is the 20 x 11 battlefield drawn
// with the game's own tiles (@scd/shared/map); every edit goes through editorReducer (editorModel.ts), so mouse and
// keyboard do the same thing and one undo history covers the level. Keyboard (no dragging anywhere): arrows move the
// cursor, Enter or Space places, Backspace removes, 1-3 choose the tool, Ctrl+Z / Ctrl+Shift+Z undo and redo, Ctrl+S
// saves. Problems come from game-core's design rules and update on every edit; a problem with a cell jumps there.
// Unsaved edits survive a reload in this tab (sessionStorage, as the activity editor); a second tab on the same level
// is warned (BroadcastChannel); a save someone else beat is a conflict screen, not a silent overwrite.

type Props = {
  readonly api: AdminApi;
  readonly levelId: string;
  /** Tests run the balance checks on the main thread instead of in Web Workers. */
  readonly makeWorker?: () => CheckWorker;
};

const MOONBEAM_LENGTH = 40;
const UNSAVED = "scd-admin-level-unsaved:";

function keepUnsaved(
  levelId: string,
  draftRevision: number,
  level: LevelFile,
): void {
  try {
    window.sessionStorage.setItem(
      `${UNSAVED}${levelId}`,
      JSON.stringify({ draftRevision, level }),
    );
  } catch {
    // storage blocked or full: the beforeunload prompt still protects a reload
  }
}

function unsavedFor(levelId: string, draftRevision: number): LevelFile | null {
  try {
    const raw = window.sessionStorage.getItem(`${UNSAVED}${levelId}`);
    const stored =
      raw === null
        ? null
        : (JSON.parse(raw) as { draftRevision?: number; level?: LevelFile });
    return stored?.draftRevision === draftRevision && stored.level !== undefined
      ? stored.level
      : null;
  } catch {
    return null;
  }
}

function forgetUnsaved(levelId: string): void {
  try {
    window.sessionStorage.removeItem(`${UNSAVED}${levelId}`);
  } catch {
    // nothing to forget
  }
}

/** "Route 38 tiles (Moonbeam 40), 7 turns, 9 of 16 waypoints, 0 problems". */
export function statusLine(
  level: LevelFile,
  problems: readonly LevelProblem[],
): string {
  const cells = routeCells(level.map.route);
  const length = Math.max(0, cells.length - 1);
  let turns = 0;
  for (let i = 1; i < cells.length - 1; i += 1)
    if (cells[i]?.heading !== cells[i - 1]?.heading) turns += 1;
  const blocking = problems.filter((p) => p.severity !== "warn").length;
  const warnings = problems.length - blocking;
  return (
    `Route ${length} tiles (Moonbeam ${MOONBEAM_LENGTH}), ${turns} turns, ${level.map.route.length} of ${MAX_WAYPOINTS} waypoints, ` +
    `${level.map.pads.length} pads, ${blocking} problem${blocking === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`
  );
}

function safeTiles(level: LevelFile): RouteTile[] | null {
  try {
    return routeTiles(level.map.route);
  } catch {
    return null; // a turn with no art (the rules list it); drawn as a line instead
  }
}

/** How much route a pad on each free cell would reach within 2.5 tiles (the Coverage overlay, scope §3.1 step 4). */
function coverage(level: LevelFile): Map<string, number> {
  const out = new Map<string, number>();
  if (level.map.route.length < 2) return out;
  const taken = routeCellSet(level.map.route);
  const cells: { id: string; x: number; y: number }[] = [];
  for (let x = 0; x < GRID_COLS; x += 1)
    for (let y = 0; y < GRID_ROWS; y += 1)
      if (!taken.has(`${x},${y}`)) cells.push({ id: `${x},${y}`, x, y });
  try {
    for (const [id, reach] of padReach(
      mapGeometry({ route: level.map.route, pads: cells }),
      2.5,
    ))
      out.set(id, reach.tiles);
  } catch {
    // a route that cannot be built yet
  }
  return out;
}

/** The editor's reducer before and after the level has loaded: "replace" starts it. */
function loadedReducer(
  state: EditorState | null,
  action: Action,
): EditorState | null {
  if (state === null)
    return action.type === "replace" ? initialEditor(action.level) : null;
  return editorReducer(state, action);
}

function useSecondTabWarning(levelId: string): boolean {
  const [other, setOther] = useState(false);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(`scd-admin-level-${levelId}`);
    channel.onmessage = (event: MessageEvent) => {
      if (event.data === "hello") channel.postMessage("here");
      if (event.data === "hello" || event.data === "here") setOther(true);
    };
    channel.postMessage("hello");
    return () => channel.close();
  }, [levelId]);
  return other;
}

type Loaded = {
  level: LevelFile;
  draftRevision: number;
  review?: LevelReview;
  publish: LevelPublish | null;
  versions: LevelVersion[];
};

/** The saved draft and its publishing, from R42's view. */
function fromView(view: LevelView): Loaded {
  return {
    level: view.draft.level,
    draftRevision: view.draft.draftRevision,
    ...(view.draft.review === undefined ? {} : { review: view.draft.review }),
    publish: view.publish ?? null,
    versions: view.versions ?? [],
  };
}

export function LevelEditor({ api, levelId, makeWorker }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // The live version levels are merged into (R46, LD7); null until loaded. A failure leaves this build's copy in use
  // for the rules, and publishing off.
  const [baseVersion, setBaseVersion] = useState<string | null>(liveBaseLoaded() ? liveBase().version : null);
  const [baseError, setBaseError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [tab, setTab] = useState<"map" | "waves" | "sets" | "test" | "publish">("map");
  const [pictures, setPictures] = useState<{
    backgrounds: PictureSummary[];
    decorations: PictureSummary[];
  }>({ backgrounds: [], decorations: [] });
  const [state, dispatch] = useReducer(loadedReducer, null);
  const otherTab = useSecondTabWarning(levelId);
  const canvas = useRef<SVGSVGElement>(null);

  const load = useCallback(() => {
    api.getLevel(levelId).then(
      (view) => {
        const kept = unsavedFor(levelId, view.draft.draftRevision);
        setLoaded(fromView(view));
        setConflict(false);
        dispatch({ type: "replace", level: kept ?? view.draft.level });
        setMessage(kept === null ? null : "Your unsaved changes were kept.");
      },
      (error: unknown) => setMessage(describeError(error)),
    );
  }, [api, levelId]);
  useEffect(load, [load]);

  const loadBase = useCallback(() => {
    loadLiveBase(api).then(
      ({ base }) => {
        setBaseVersion(base.version);
        setBaseError(null);
      },
      (error: unknown) => setBaseError(describeError(error)),
    );
  }, [api]);
  useEffect(loadBase, [loadBase]);

  useEffect(() => {
    void Promise.all([
      api.listPictures("APPROVED", "background"),
      api.listPictures("APPROVED", "decoration"),
    ]).then(
      ([backgrounds, decorations]) =>
        setPictures({
          backgrounds: backgrounds.pictures,
          decorations: decorations.pictures,
        }),
      () => setPictures({ backgrounds: [], decorations: [] }), // the editor still works with the repo art
    );
  }, [api]);

  const level = state?.level ?? null;
  const dirty =
    level !== null &&
    loaded !== null &&
    JSON.stringify(level) !== JSON.stringify(loaded.level);
  useEffect(() => {
    if (level === null || loaded === null) return;
    if (dirty) keepUnsaved(levelId, loaded.draftRevision, level);
    else forgetUnsaved(levelId);
  }, [dirty, level, loaded, levelId]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // The rules read the live planet: a newly loaded one (baseVersion changes, so this renders again) gives new problems.
  const liveRaw = liveBase().raw;
  const problems = useMemo(
    () => (level === null ? [] : levelProblems(level, liveRaw)),
    [level, liveRaw],
  );
  const cover = useMemo(
    () =>
      level !== null && showCoverage
        ? coverage(level)
        : new Map<string, number>(),
    [level, showCoverage],
  );

  const save = useCallback(
    async (revision?: number) => {
      if (level === null || loaded === null || busy) return;
      setBusy(true);
      setMessage(null);
      try {
        const view = await api.saveLevel(levelId, {
          draftRevision: revision ?? loaded.draftRevision,
          level,
        });
        forgetUnsaved(levelId);
        setLoaded(fromView(view));
        setConflict(false);
        setMessage("Saved.");
      } catch (error) {
        if (error instanceof ApiError && error.code === "DRAFT_CONFLICT")
          setConflict(true);
        else setMessage(describeError(error));
      } finally {
        setBusy(false);
      }
    },
    [api, busy, level, levelId, loaded],
  );

  const onPublishView = useCallback(
    (view: LevelView, wentLive: boolean) => {
      setLoaded(fromView(view));
      if (wentLive) loadBase(); // this level's version is now the live planet
    },
    [loadBase],
  );

  const keepMine = async () => {
    const latest = await api.getLevel(levelId);
    await save(latest.draft.draftRevision);
  };

  const download = () => {
    if (level === null) return;
    const file = levelFileDownload(level);
    const url = URL.createObjectURL(
      new Blob([file.text], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const ctrl = event.ctrlKey || event.metaKey;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const move = moves[event.key];
    let action: Action | null = null;
    if (move !== undefined) action = { type: "move", dx: move[0], dy: move[1] };
    else if (event.key === "Enter" || event.key === " ")
      action = { type: "place" };
    else if (event.key === "Backspace" || event.key === "Delete")
      action = { type: "back" };
    else if (ctrl && event.key.toLowerCase() === "z")
      action = { type: event.shiftKey ? "redo" : "undo" };
    else if (ctrl && event.key.toLowerCase() === "y") action = { type: "redo" };
    else if (!ctrl) {
      const tool = TOOLS.find((t) => t.key === event.key);
      if (tool !== undefined) action = { type: "tool", tool: tool.id };
    }
    if (action !== null) {
      event.preventDefault();
      dispatch(action);
    }
  };

  useEffect(() => {
    const onSave = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onSave);
    return () => window.removeEventListener("keydown", onSave);
  }, [save]);

  if (state === null || level === null) {
    return (
      <section>
        <p>
          <a href={hrefOf({ page: "levels" })}>Levels</a>
        </p>
        <div role="status">
          {message === null ? (
            <p>Loading…</p>
          ) : (
            <p className="error">{message}</p>
          )}
        </div>
      </section>
    );
  }

  const [cx, cy] = state.cursor;
  const padHere = level.map.pads.find((p) => p.x === cx && p.y === cy);
  const tiles = safeTiles(level);
  const backdropUrl =
    level.map.art.backdrop === null
      ? artUrl(MAP_ART.backdrop)
      : (pictureUrl(level.map.art.backdrop) ?? artUrl(MAP_ART.backdrop));
  const decoUrl = (art: string): string | null => {
    const repo = DECORATIONS[art];
    return repo !== undefined ? artUrl(repo) : pictureUrl(art);
  };
  const padNumber = (id: string): string =>
    String(Number.parseInt(id.slice(id.lastIndexOf("-p") + 2), 10));
  const cellLabel = `Cell ${cx},${cy}${padHere !== undefined ? `, pad ${padNumber(padHere.id)}` : ""}${routeCellSet(level.map.route).has(`${cx},${cy}`) ? ", route" : ""}`;

  return (
    <section className="level-editor">
      <p>
        <a href={hrefOf({ page: "levels" })}>Levels</a> / {level.name}
        <span className="muted">
          {" "}
          · checked against {baseVersion ?? liveBase().version}
          {baseVersion === null && baseError === null ? " (loading the live version…)" : ""}
        </span>
      </p>
      {baseError !== null && (
        <p className="warning" role="alert">
          The live game data could not be loaded ({baseError}), so the rules use this build's copy (
          {liveBase().version}) and publishing is off.{" "}
          <button type="button" onClick={loadBase}>
            Try again
          </button>
        </p>
      )}
      {otherTab && (
        <p className="warning" role="alert">
          This level is open in another tab too. Saving in both makes one of
          them a conflict.
        </p>
      )}
      <div className="level-toolbar" role="toolbar" aria-label="Level">
        <label>
          Name{" "}
          <input
            value={level.name}
            maxLength={60}
            onChange={(e) => dispatch({ type: "rename", name: e.target.value })}
          />
        </label>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || busy}
          aria-keyshortcuts="Control+S"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "undo" })}
          disabled={state.past.length === 0}
          aria-keyshortcuts="Control+Z"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "redo" })}
          disabled={state.future.length === 0}
          aria-keyshortcuts="Control+Shift+Z"
        >
          Redo
        </button>
        <button type="button" onClick={download}>
          Download level file
        </button>
      </div>
      <div role="status" aria-live="polite">
        {message !== null && <p>{message}</p>}
        {state.refusal !== null && <p className="warning">{state.refusal}</p>}
      </div>
      {conflict && (
        <div
          className="conflict"
          role="alertdialog"
          aria-labelledby="conflict-heading"
        >
          <h3 id="conflict-heading">
            Someone saved this level since you opened it
          </h3>
          <p>
            Your changes are not saved yet. Load the saved version (your changes
            are lost), or keep yours and save over it.
          </p>
          <button
            type="button"
            onClick={() => {
              forgetUnsaved(levelId);
              load();
            }}
            disabled={busy}
          >
            Load the saved version
          </button>
          <button type="button" onClick={() => void keepMine()} disabled={busy}>
            Keep mine and save
          </button>
        </div>
      )}

      <div className="level-tabs" role="tablist" aria-label="Level parts">
        {(
          [
            ["map", "Map"],
            ["waves", "Waves"],
            ["sets", "Wave sets"],
            ["test", "Test"],
            ["publish", "Publish"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`level-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="level-panel"
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <span className="muted">{statusLine(level, problems)}</span>
      </div>

      {tab !== "map" && (
        <div
          id="level-panel"
          role="tabpanel"
          aria-labelledby={`level-tab-${tab}`}
        >
          {tab === "waves" && (
            <WavesTab
              level={level}
              problems={problems}
              onEdit={(next) => dispatch({ type: "edit", level: next })}
            />
          )}
          {tab === "sets" && (
            <WaveSetsTab
              level={level}
              problems={problems}
              onEdit={(next) => dispatch({ type: "edit", level: next })}
            />
          )}
          {tab === "test" && loaded !== null && (
            <TestTab
              level={loaded.level}
              dirty={dirty}
              blocked={problems.some((p) => p.severity !== "warn")}
              draftRevision={loaded.draftRevision}
              review={loaded.review}
              {...(makeWorker === undefined ? {} : { makeWorker })}
              onRecord={async (counts) => {
                const view = await api.recordTestplay(levelId, {
                  draftRevision: loaded.draftRevision,
                  sourceVersion: liveBase().version,
                  ...counts,
                });
                setLoaded(fromView(view));
              }}
            />
          )}
          {tab === "publish" && loaded !== null && (
            <PublishTab
              api={api}
              levelId={levelId}
              level={loaded.level}
              draftRevision={loaded.draftRevision}
              review={loaded.review}
              dirty={dirty}
              blocked={problems.some((p) => p.severity !== "warn")}
              baseVersion={baseError === null ? baseVersion : null}
              publish={loaded.publish}
              versions={loaded.versions}
              onView={onPublishView}
            />
          )}
        </div>
      )}

      {tab === "map" && (
        <div
          className="level-work"
          id="level-panel"
          role="tabpanel"
          aria-labelledby="level-tab-map"
        >
          <div className="level-tools" role="group" aria-label="Tool">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={state.tool === t.id}
                aria-keyshortcuts={t.key}
                onClick={() => dispatch({ type: "tool", tool: t.id })}
              >
                {t.key} {t.label}
              </button>
            ))}
            <label>
              <input
                type="checkbox"
                checked={showCoverage}
                onChange={(e) => setShowCoverage(e.target.checked)}
              />{" "}
              Coverage
            </label>
            <button
              type="button"
              onClick={() => dispatch({ type: "clearRoute" })}
              disabled={level.map.route.length === 0}
            >
              Clear route
            </button>
          </div>

          <svg
            ref={canvas}
            className="level-canvas"
            viewBox={`0 0 ${GRID_COLS * TILE_PX} ${GRID_ROWS * TILE_PX}`}
            tabIndex={0}
            role="application"
            aria-label="Map, 20 by 11 tiles. Arrow keys move the cursor, Enter places, Backspace removes, 1 to 3 choose the tool."
            aria-describedby="level-cell"
            onKeyDown={onKey}
          >
            <image
              href={backdropUrl}
              x={0}
              y={0}
              width={GRID_COLS * TILE_PX}
              height={GRID_ROWS * TILE_PX}
              preserveAspectRatio="none"
            />
            {Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => {
              const x = i % GRID_COLS;
              const y = Math.floor(i / GRID_COLS);
              const reach = cover.get(`${x},${y}`);
              return (
                <rect
                  key={`${x},${y}`}
                  className="level-cell"
                  x={x * TILE_PX}
                  y={y * TILE_PX}
                  width={TILE_PX}
                  height={TILE_PX}
                  fillOpacity={
                    reach === undefined ? 0 : Math.min(0.6, reach / 12)
                  }
                  onClick={() => {
                    dispatch({ type: "cursor", cell: [x, y] });
                    dispatch({ type: "place" });
                    canvas.current?.focus();
                  }}
                />
              );
            })}
            {tiles === null ? (
              <polyline
                className="level-route-line"
                points={level.map.route
                  .map(([x, y]) => `${tileToPx(x)},${tileToPx(y)}`)
                  .join(" ")}
              />
            ) : (
              tiles.map((t, i) => (
                <image
                  key={`r${i}`}
                  href={artUrl(t.art)}
                  x={t.x * TILE_PX}
                  y={t.y * TILE_PX}
                  width={TILE_PX}
                  height={TILE_PX}
                  pointerEvents="none"
                />
              ))
            )}
            {level.map.art.decorations.map((d) => {
              const url = decoUrl(d.art);
              return url === null ? null : (
                <image
                  key={`d${d.x},${d.y}`}
                  href={url}
                  x={d.x * TILE_PX}
                  y={d.y * TILE_PX}
                  width={TILE_PX}
                  height={TILE_PX}
                  pointerEvents="none"
                />
              );
            })}
            {level.map.pads.map((p) => (
              <g key={p.id} pointerEvents="none">
                <image
                  href={artUrl(
                    p.opensAfterWave === 0
                      ? MAP_ART.padEmpty
                      : MAP_ART.padClosed,
                  )}
                  x={p.x * TILE_PX - 16}
                  y={p.y * TILE_PX - 16}
                  width={128}
                  height={128}
                />
                <text
                  className="level-pad-number"
                  x={tileToPx(p.x)}
                  y={tileToPx(p.y) + 12}
                >
                  {padNumber(p.id)}
                </text>
              </g>
            ))}
            {problems
              .filter((p) => p.at !== undefined)
              .map((p, i) => (
                <circle
                  key={`p${i}`}
                  className={`level-problem level-problem-${p.severity}`}
                  cx={tileToPx(p.at?.[0] ?? 0)}
                  cy={tileToPx(p.at?.[1] ?? 0)}
                  r={40}
                  pointerEvents="none"
                />
              ))}
            <rect
              className="level-cursor"
              x={cx * TILE_PX + 3}
              y={cy * TILE_PX + 3}
              width={TILE_PX - 6}
              height={TILE_PX - 6}
              pointerEvents="none"
            />
          </svg>

          <aside className="level-side">
            <p id="level-cell" aria-live="polite">
              {cellLabel}
            </p>
            {padHere !== undefined && (
              <label>
                Pad {padNumber(padHere.id)} opens after wave{" "}
                <select
                  value={padHere.opensAfterWave}
                  onChange={(e) =>
                    dispatch({
                      type: "opens",
                      padId: padHere.id,
                      wave: Number(e.target.value),
                    })
                  }
                >
                  {OPENS_AFTER.map((w) => (
                    <option key={w} value={w}>
                      {w === 0 ? "0 (open from the start)" : w}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Backdrop{" "}
              <select
                value={level.map.art.backdrop ?? ""}
                onChange={(e) =>
                  dispatch({
                    type: "backdrop",
                    backdrop: e.target.value === "" ? null : e.target.value,
                  })
                }
              >
                <option value="">Moonbeam ground</option>
                {pictures.backgrounds.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Decoration{" "}
              <select
                value={state.decoration}
                onChange={(e) =>
                  dispatch({ type: "decoration", art: e.target.value })
                }
              >
                {Object.keys(DECORATIONS).map((id) => (
                  <option key={id} value={id}>
                    {id.replace(/^deco-/u, "").replace(/-/gu, " ")}
                  </option>
                ))}
                {pictures.decorations.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <h3>Problems</h3>
            {problems.length === 0 ? (
              <p>None.</p>
            ) : (
              <ul className="level-problems">
                {problems.map((p, i) => (
                  <li key={i} className={`severity-${p.severity}`}>
                    <span className="visually-hidden">
                      {p.severity === "warn" ? "Warning" : "Problem"}:{" "}
                    </span>
                    {problemText(p)}{" "}
                    {p.at !== undefined && (
                      <button
                        type="button"
                        className="link"
                        onClick={() => {
                          dispatch({ type: "cursor", cell: p.at ?? [0, 0] });
                          canvas.current?.focus();
                        }}
                      >
                        Go to cell {p.at[0]},{p.at[1]}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
