// Levels → Aliens (Gate M, AM1; scope-asset-kinds-and-makers.md §3.2, ADR-0041): make a plain alien that waves can use.
//
// 1. Make an alien: a name, an ID and four stats on sliders kept inside LIMITS.alienMaker (the plain aliens' range),
//    next to the game's own aliens to compare with.
// 2. Draw it: one drawing of the Alien kind (R38/R39, counted like any drawing). The browser makes the six walk frames
//    from it with the shared animator (walk.ts) and plays them; the operator ticks the Alien checklist, and "Use this
//    walk" saves the frames as six approved Alien pictures (R34: frame 1 as the drawing, frames 2-6 as uploads) and
//    sets them as the alien's walk (R59).
// 3. Publish (three hand ticks, R61): the publisher writes a new ruleset and asset manifest and moves both pointers;
//    the page asks R57 again every few seconds until it is done. New games then have the alien; saved games keep
//    their ruleset. The wave table lists it from the next time a level is opened.
import { LIMITS, libraryPictureUrl } from "@scd/shared";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ApiError, describeError, type AdminApi, type AlienList, type AlienStats, type AlienTicks, type MadeAlien } from "../../api";
import { ConfirmDialog } from "../../ConfirmDialog";
import { jobFailureMessage, pollDelay, tidyText } from "../../pictures/messages";
import { blobToBase64 } from "../../pictures/normalise";
import { TextFreeTick } from "../../pictures/TextFreeTick";
import { hrefOf } from "../../routes";
import { refusalText } from "../publish/PublishTab";
import { browserWalkTools, makeWalk, partsText, WalkError, type Walk, type WalkTools } from "./walk";
import "../levels.css";

const A = LIMITS.alienMaker;
const ALIEN_ID = new RegExp(A.idPattern, "u");
const STAT_LABEL = { hp: "Health", speed: "Speed", leak: "Leak (colony damage)", bounty: "Bounty (credits)" } as const;
type Stat = keyof typeof STAT_LABEL;
const STATS = Object.keys(STAT_LABEL) as Stat[];
const FPS = 8; // the battle's animation rate (web/player/src/game/BattleScene.ts ANIM_FPS)
const PUBLISH_POLL_MS = 4000;
const NO_TICKS: AlienTicks = { friendly: false, walkLooksRight: false, statsFitTheName: false };
const TICK_LABEL: Record<keyof AlienTicks, string> = {
  friendly: "Silly and friendly, never scary, for ages 5 to 7",
  walkLooksRight: "The walk looks right and nothing is cut off at the edges",
  statsFitTheName: "The stats suit how it looks (a big one is slow, a small one quick)",
};

function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/gu, "").slice(0, 24);
}

const statStep = (stat: Stat): number => (stat === "speed" ? A.speedStep : 1);
const middle = (stat: Stat): number => {
  const mid = (A[stat].min + A[stat].max) / 2;
  const step = statStep(stat);
  return Math.round(Math.round(mid / step) * step * 10) / 10;
};

export function statusText(alien: MadeAlien): string {
  const state = alien.publish?.state;
  if (alien.status === "PUBLISHED") return `In the game (rules ${alien.rulesetVersion ?? ""})`;
  if (state === "QUEUED" || state === "RUNNING") return "Publishing…";
  if (state === "REFUSED") {
    const code = alien.publish?.details?.code ?? alien.publish?.code ?? "UNKNOWN";
    return `Not published: ${alienRefusalText(code, alien.publish?.details?.message ?? "")}`;
  }
  return alien.art.length === A.frames ? "Draft, ready to publish" : "Draft: needs its walk";
}

function alienRefusalText(code: string, message: string): string {
  switch (code) {
    case "INVALID_ALIEN":
      return "its name, stats or walk are not finished.";
    case "PICTURES":
      return "a walk frame is not an approved Alien picture.";
    case "ALIEN_EXISTS":
      return "the game already has an alien or boss with this ID.";
    case "LIVE_MOVED":
      return "the live game changed meanwhile. Publish again.";
    default:
      return refusalText({ code, message });
  }
}

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.code === "PUBLISH_REFUSED") {
    const code = error.info["code"];
    const message = error.info["message"];
    return alienRefusalText(typeof code === "string" ? code : "UNKNOWN", typeof message === "string" ? message : "");
  }
  return describeError(error);
}

/** Plays frame URLs as the battle does, with every frame shown in a row beneath for checking. */
export function WalkPreview({ urls, label }: { readonly urls: readonly string[]; readonly label: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || urls.length < 2) return;
    const timer = window.setInterval(() => setN((i) => (i + 1) % urls.length), 1000 / FPS);
    return () => window.clearInterval(timer);
  }, [urls]);
  return (
    <figure className="walk-preview">
      <img src={urls[n % urls.length]} alt={label} width={128} height={128} className="walk-big" />
      <figcaption>
        <span className="muted">Frames 1 to {urls.length}:</span>
        <span className="walk-strip">
          {urls.map((url, i) => (
            <img key={url} src={url} alt="" width={48} height={48} title={`Frame ${i + 1}`} />
          ))}
        </span>
      </figcaption>
    </figure>
  );
}

function StatSlider({ stat, value, onChange }: { readonly stat: Stat; readonly value: number; readonly onChange: (v: number) => void }) {
  const id = useId();
  const { min, max } = A[stat];
  return (
    <p className="row stat-slider">
      <label htmlFor={id}>{STAT_LABEL[stat]}</label>
      <input id={id} type="range" min={min} max={max} step={statStep(stat)} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <output htmlFor={id}>{stat === "speed" ? value.toFixed(1) : value}</output>
      <span className="muted">
        ({min} to {max})
      </span>
    </p>
  );
}

type Api = Pick<AdminApi, "listAliens" | "createAlien" | "updateAlien" | "deleteAlien" | "publishAlien" | "startPictureJob" | "getPictureJob" | "createPicture">;

type Props = {
  readonly api: Api;
  readonly walkTools?: WalkTools;
  /** How long to wait before asking about a drawing again (tests make it 0). */
  readonly delay?: (elapsedMs: number) => number;
  readonly newJobId?: () => string;
  /** blob: URLs for the made frames (tests pass a fake). */
  readonly preview?: (png: Blob) => string;
};

const randomJobId = (): string => crypto.randomUUID();
const blobUrl = (png: Blob): string => URL.createObjectURL(png);

export function AliensPage({ api, walkTools = browserWalkTools, delay = pollDelay, newJobId = randomJobId, preview = blobUrl }: Props) {
  const [list, setList] = useState<AlienList | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<AlienStats & { alienId: string }>(() => ({
    alienId: "",
    name: "",
    hp: middle("hp"),
    speed: middle("speed"),
    leak: A.leak.min,
    bounty: middle("bounty"),
  }));
  const [idTouched, setIdTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.listAliens().then(setList, (error: unknown) => setMessage(describeError(error)));
  }, [api]);
  useEffect(load, [load]);

  const publishing = list?.aliens.some((a) => a.publish?.state === "QUEUED" || a.publish?.state === "RUNNING") ?? false;
  useEffect(() => {
    if (!publishing) return;
    const timer = window.setInterval(load, PUBLISH_POLL_MS);
    return () => window.clearInterval(timer);
  }, [publishing, load]);

  const alienId = idTouched ? form.alienId : slugOf(form.name);
  const taken = list !== null && (list.game.some((a) => a.alienId === alienId) || list.aliens.some((a) => a.alienId === alienId) || list.bosses.includes(alienId));
  const nameOk = form.name.trim() !== "" && form.name.trim().length <= A.nameMaxLength;
  const ok = nameOk && ALIEN_ID.test(alienId) && !taken;
  const current = list?.aliens.find((a) => a.alienId === editing) ?? null;

  async function create() {
    setBusy(true);
    setMessage(null);
    try {
      const { alien } = await api.createAlien({ ...form, alienId, name: form.name.trim() });
      setMessage(`${alien.name} made. Draw it next.`);
      setEditing(alien.alienId);
      setForm({ ...form, alienId: "", name: "" });
      setIdTouched(false);
      load();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="aliens-page" aria-labelledby="aliens-heading">
      <p>
        <a href={hrefOf({ page: "levels" })}>Levels</a>
      </p>
      <h2 id="aliens-heading">Aliens</h2>
      <p className="muted">
        A made alien is a plain alien (no special powers): it walks, has health, a speed, the damage it does if it reaches the colony and the credits it
        gives. Once published, new games can meet it in any wave that names it; saved games keep the aliens they started with.
      </p>
      {message !== null && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {list === null ? (
        <p>Loading…</p>
      ) : (
        <>
          <table className="versions-table">
            <caption>In the game now (rules {list.rulesetVersion})</caption>
            <thead>
              <tr>
                <th scope="col">Alien</th>
                {STATS.map((s) => (
                  <th key={s} scope="col">
                    {STAT_LABEL[s]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.game.map((a) => (
                <tr key={a.alienId}>
                  <th scope="row">
                    {a.name} <span className="muted">({a.alienId}{a.made ? ", made here" : ""})</span>
                  </th>
                  {STATS.map((s) => (
                    <td key={s}>{a[s]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Made here</h3>
          {list.aliens.length === 0 ? (
            <p className="muted">None yet.</p>
          ) : (
            <ul className="made-aliens">
              {list.aliens.map((a) => (
                <li key={a.alienId}>
                  {a.art[0] !== undefined && <img src={libraryPictureUrl(a.art[0]) ?? ""} alt="" width={40} height={40} />} <strong>{a.name}</strong>{" "}
                  <span className="muted">({a.alienId})</span> {statusText(a)}{" "}
                  {a.alienId !== editing && (
                    <button type="button" onClick={() => setEditing(a.alienId)}>
                      {a.status === "PUBLISHED" ? "Look" : "Open"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {current !== null && (
            <AlienEditor
              key={`${current.alienId}:${current.updatedAt ?? ""}`}
              api={api}
              alien={current}
              walkTools={walkTools}
              delay={delay}
              newJobId={newJobId}
              preview={preview}
              onChanged={(text) => {
                if (text !== null) setMessage(text);
                load();
              }}
              onDeleted={() => {
                setEditing(null);
                setMessage("Draft deleted.");
                load();
              }}
              onClose={() => setEditing(null)}
            />
          )}
        </>
      )}

      <form
        className="level-new"
        aria-labelledby="alien-new-heading"
        onSubmit={(event) => {
          event.preventDefault();
          if (ok && !busy) void create();
        }}
      >
        <h3 id="alien-new-heading">Make an alien</h3>
        <p className="row">
          <label>
            Name <input value={form.name} maxLength={A.nameMaxLength} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            ID{" "}
            <input
              value={alienId}
              maxLength={24}
              onChange={(e) => {
                setIdTouched(true);
                setForm({ ...form, alienId: e.target.value });
              }}
              aria-invalid={alienId !== "" && (!ALIEN_ID.test(alienId) || taken)}
            />
          </label>
        </p>
        {taken && <p className="error">The game already has an alien or boss with this ID.</p>}
        {STATS.map((s) => (
          <StatSlider key={s} stat={s} value={form[s]} onChange={(v) => setForm({ ...form, [s]: v })} />
        ))}
        <button type="submit" disabled={!ok || busy}>
          Make alien
        </button>
      </form>
    </section>
  );
}

type MadeWalk = { readonly jobId: string; readonly walk: Walk; readonly urls: readonly string[] };

function AlienEditor({
  api,
  alien,
  walkTools,
  delay,
  newJobId,
  preview,
  onChanged,
  onDeleted,
  onClose,
}: {
  readonly api: Api;
  readonly alien: MadeAlien;
  readonly walkTools: WalkTools;
  readonly delay: (elapsedMs: number) => number;
  readonly newJobId: () => string;
  readonly preview: (png: Blob) => string;
  readonly onChanged: (message: string | null) => void;
  readonly onDeleted: () => void;
  readonly onClose: () => void;
}) {
  const fixed = alien.status === "PUBLISHED" || alien.publish?.state === "QUEUED" || alien.publish?.state === "RUNNING";
  const [stats, setStats] = useState<AlienStats>({ name: alien.name, hp: alien.hp, speed: alien.speed, leak: alien.leak, bounty: alien.bounty });
  const [description, setDescription] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [step, setStep] = useState("");
  const [made, setMade] = useState<MadeWalk | null>(null);
  const [checks, setChecks] = useState({ textFree: false, friendly: false, edges: false });
  const [ticks, setTicks] = useState<AlienTicks>(NO_TICKS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const changed = (Object.keys(stats) as (keyof AlienStats)[]).some((k) => stats[k] !== alien[k]);
  const nameOk = stats.name.trim() !== "" && stats.name.trim().length <= A.nameMaxLength;

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    try {
      const text = await action();
      onChanged(text);
    } catch (e) {
      if (alive.current) setError(e instanceof WalkError ? e.message : errorText(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  // Follow a drawing until it is ready, then make the walk from it.
  useEffect(() => {
    if (jobId === null) return;
    let stop = false;
    const started = Date.now();
    const finish = (text: string | null) => {
      if (text !== null) setError(text);
      setJobId(null);
    };
    void (async () => {
      for (;;) {
        await new Promise((resolve) => window.setTimeout(resolve, delay(Date.now() - started)));
        if (stop) return;
        try {
          const job = await api.getPictureJob(jobId);
          if (stop) return;
          if (job.state === "FAILED") return finish(jobFailureMessage(job.error));
          if (job.state !== "READY") {
            setStep(job.state === "QUEUED" ? "Waiting to start" : job.phase === "drawing" ? "Drawing…" : "Thinking…");
            continue;
          }
          setStep("Making the walk…");
          const walk = await makeWalk(job.svg, walkTools);
          if (stop) return;
          setMade({ jobId, walk, urls: walk.frames.map(preview) });
          return finish(null);
        } catch (e) {
          if (!stop) finish(e instanceof WalkError ? e.message : errorText(e));
          return;
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, [jobId, api, delay, walkTools, preview]);

  async function draw() {
    setError(null);
    setMade(null);
    setChecks({ textFree: false, friendly: false, edges: false });
    const id = newJobId();
    try {
      await api.startPictureJob({ jobId: id, description: tidyText(description), kind: "alien" });
      setStep("Waiting to start");
      setJobId(id);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function useWalk(walk: MadeWalk): Promise<string> {
    const ids: string[] = [];
    for (const [i, frame] of walk.walk.frames.entries()) {
      const name = `${stats.name.trim()} walk ${i + 1}`.slice(0, LIMITS.picture.nameMaxLength);
      const pngBase64 = await blobToBase64(frame);
      const body =
        i === 0
          ? { name, source: "GENERATED" as const, jobId: walk.jobId, pngBase64, approve: true, textFree: true }
          : { name, source: "UPLOAD" as const, kind: "alien" as const, pngBase64, approve: true, textFree: true };
      const saved = await withRetry(() => api.createPicture(body));
      ids.push(saved.picture.id);
    }
    await api.updateAlien(alien.alienId, { ...stats, name: stats.name.trim(), art: ids });
    setMade(null);
    return "The walk is saved. Publish when you are happy with it.";
  }

  const savedUrls = alien.art.map((id) => libraryPictureUrl(id) ?? "");
  const allChecks = checks.textFree && checks.friendly && checks.edges;
  const allTicks = ticks.friendly && ticks.walkLooksRight && ticks.statsFitTheName;

  return (
    <section className="alien-editor" aria-labelledby={`alien-${alien.alienId}`}>
      <h3 id={`alien-${alien.alienId}`}>
        {alien.name} <span className="muted">({alien.alienId})</span>
      </h3>
      <p role="status">{statusText(alien)}</p>
      {error !== null && <p className="error">{error}</p>}

      <fieldset disabled={fixed || busy}>
        <legend>Name and stats</legend>
        <p className="row">
          <label>
            Name <input value={stats.name} maxLength={A.nameMaxLength} onChange={(e) => setStats({ ...stats, name: e.target.value })} />
          </label>
        </p>
        {STATS.map((s) => (
          <StatSlider key={s} stat={s} value={stats[s]} onChange={(v) => setStats({ ...stats, [s]: v })} />
        ))}
        {!fixed && (
          <button type="button" disabled={!changed || !nameOk} onClick={() => void run(async () => (await api.updateAlien(alien.alienId, { ...stats, name: stats.name.trim(), art: alien.art }), "Saved."))}>
            Save
          </button>
        )}
      </fieldset>

      <h4>Walk</h4>
      {savedUrls.length > 0 ? <WalkPreview urls={savedUrls} label={`${alien.name} walking`} /> : <p className="muted">No walk yet.</p>}

      {!fixed && (
        <div className="alien-draw">
          <label>
            Describe the alien to draw{" "}
            <textarea
              value={description}
              rows={2}
              maxLength={LIMITS.picture.descriptionMaxLength}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="a round green alien with three wobbly legs and big curious eyes"
            />
          </label>
          <button type="button" disabled={jobId !== null || busy || tidyText(description).length < LIMITS.picture.descriptionMinLength} onClick={() => void draw()}>
            {savedUrls.length > 0 ? "Draw it again" : "Draw it"}
          </button>
          {jobId !== null && <p role="status">{step}</p>}
          {made !== null && (
            <div className="alien-made">
              <WalkPreview urls={made.urls} label="The new walk" />
              <p className="muted">
                {partsText(made.walk.parts)}
                {made.walk.fit < 1 ? ` Shrunk to ${Math.round(made.walk.fit * 100)}% so every frame fits.` : ""}
              </p>
              <TextFreeTick checked={checks.textFree} onChange={(v) => setChecks({ ...checks, textFree: v })} />
              <Tick checked={checks.friendly} onChange={(v) => setChecks({ ...checks, friendly: v })} label="Friendly, never scary: no teeth, claws, horns or angry eyebrows" />
              <Tick checked={checks.edges} onChange={(v) => setChecks({ ...checks, edges: v })} label="Nothing is cut off at the edges in any frame" />
              <button type="button" className="primary" disabled={!allChecks || busy || !nameOk || changed} onClick={() => void run(() => useWalk(made))}>
                Use this walk
              </button>
              {changed && <span className="muted"> Save the stats first.</span>}
            </div>
          )}
        </div>
      )}

      {alien.status === "DRAFT" && !fixed && alien.art.length === A.frames && (
        <fieldset disabled={busy}>
          <legend>Publish</legend>
          {(Object.keys(TICK_LABEL) as (keyof AlienTicks)[]).map((k) => (
            <Tick key={k} checked={ticks[k]} onChange={(v) => setTicks({ ...ticks, [k]: v })} label={TICK_LABEL[k]} />
          ))}
          <button
            type="button"
            className="primary"
            disabled={!allTicks || changed}
            onClick={() => void run(async () => (await api.publishAlien(alien.alienId, ticks), "Publishing. New games get the alien when it is done."))}
          >
            Publish
          </button>
          {changed && <span className="muted"> Save the stats first.</span>}
        </fieldset>
      )}

      <p className="row">
        {alien.status === "DRAFT" && !fixed && (
          <button type="button" disabled={busy} onClick={() => setDeleting(true)}>
            Delete draft
          </button>
        )}
        <button type="button" onClick={onClose}>
          Close
        </button>
      </p>
      {deleting && (
        <ConfirmDialog labelledBy="alien-delete" onCancel={() => setDeleting(false)}>
          {(cancelRef) => (
            <>
              <h3 id="alien-delete">Delete {alien.name}?</h3>
              <p>The draft goes; its walk pictures stay in the library.</p>
              <div className="dialog-buttons">
                <button type="button" ref={cancelRef} onClick={() => setDeleting(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setDeleting(false);
                    void api.deleteAlien(alien.alienId).then(onDeleted, (e: unknown) => setError(errorText(e)));
                  }}
                >
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

function Tick({ checked, onChange, label }: { readonly checked: boolean; readonly onChange: (v: boolean) => void; readonly label: string }) {
  const id = useId();
  return (
    <p className="row">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}</label>
    </p>
  );
}

/** R34 is throttled (2 a second, burst 5): six frames in a row may meet a 429, so wait and try again. */
async function withRetry<T>(call: () => Promise<T>, tries = 3): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 429 || attempt >= tries) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
  }
}
