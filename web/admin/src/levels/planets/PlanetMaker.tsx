// Planets → Make a planet for me (Gate M, LD20; owner 2026-11-19: "theme in, everything out"). A theme gives the name,
// then the icon and the backdrop are drawn from it (or chosen from approved pictures) and shown for approval with the
// "no letters, numbers or words" tick; then one button adds the planet and makes its campaign level with Make it all
// (LD18: map, 50 waves tuned by default, 3 challenges by default) on the planet's backdrop, and opens it in the editor. Sending it to testers
// and releasing the planet stay the person's steps.
import { MARGIN_PRESETS, MAX_CHALLENGES, type MarginPreset } from "@scd/game-core";
import type { PictureKindId } from "@scd/shared";
import { useEffect, useRef, useState } from "react";
import { describeError, type AdminApi, type PictureSummary } from "../../api";
import { TextFreeTick } from "../../pictures/TextFreeTick";
import { browserTools } from "../../pictures/normalise";
import { loadLiveBase } from "../liveBase";
import type { WholeLevelWorkers } from "../maker/wholeLevel";
import { makeWholeLevel, type WholeLevelRun } from "../maker/wholeLevel";
import { backdropDescription, drawPicture, iconDescription, keepDrawing, suggestName, themeOk, type DrawRun, type DrawTools, type Drawing } from "./makePlanet";

type Api = Pick<AdminApi, "startPictureJob" | "getPictureJob" | "createPicture" | "createPlanet" | "getGameData" | "createLevel">;

type Slot = "icon" | "backdrop";
const KIND: Record<Slot, PictureKindId> = { icon: "planet", backdrop: "background" };
const LABEL: Record<Slot, string> = { icon: "Icon (the planet on Home)", backdrop: "Backdrop (the ground its maps sit on)" };
/** A slot's choice: draw it from the theme, an approved picture, or (backdrop only) none: the Moon ground. */
const DRAW = "draw";
const NONE = "";

type Card =
  | { readonly state: "drawing"; readonly step: string }
  | { readonly state: "ready"; readonly drawing: Drawing; readonly url: string; readonly textFree: boolean }
  | { readonly state: "keeping"; readonly url: string }
  | { readonly state: "kept"; readonly pictureId: string; readonly url: string }
  | { readonly state: "failed"; readonly message: string };

type Props = {
  readonly api: Api;
  readonly icons: readonly PictureSummary[];
  readonly backgrounds: readonly PictureSummary[];
  /** Planet IDs in use. */
  readonly taken: ReadonlySet<string>;
  readonly slugOf: (name: string) => string;
  readonly onPlanetAdded: () => void;
  /** The level is made and saved: open it, with what was made. */
  readonly onDone: (levelId: string, text: string) => void;
  readonly draw?: DrawTools;
  readonly workers?: WholeLevelWorkers;
  readonly seed?: number;
};

export function PlanetMaker({ api, icons, backgrounds, taken, slugOf, onPlanetAdded, onDone, draw = {}, workers, seed }: Props) {
  const [theme, setTheme] = useState("");
  const [nameText, setName] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<Slot, string>>({ icon: DRAW, backdrop: DRAW });
  const [cards, setCards] = useState<Partial<Record<Slot, Card>>>({});
  const [challenges, setChallenges] = useState(3);
  const [tune, setTune] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const runs = useRef<Partial<Record<Slot, DrawRun>>>({});
  const making = useRef<WholeLevelRun | null>(null);
  const tools = draw.tools ?? browserTools;
  const urls = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const run of Object.values(runs.current)) run?.cancel();
      making.current?.cancel();
      for (const url of urls.current) tools.release(url);
    },
    [tools],
  );

  const name = nameText ?? (themeOk(theme) ? suggestName(theme) : "");
  const base = slugOf(name);
  let planetId = base;
  for (let n = 2; taken.has(planetId); n += 1) planetId = `${base}-${n}`.slice(0, 34);
  const nameOk = name.trim() !== "" && name.length <= 40 && planetId.length >= 2;
  const busy = progress !== null;
  const drawingNow = Object.values(cards).some((c) => c?.state === "drawing" || c?.state === "keeping");

  /** The picture a slot will use: an approved one chosen, a kept drawing, null for none, or undefined while not ready. */
  const pictureFor = (slot: Slot): string | null | undefined => {
    const chosen = choice[slot];
    if (chosen === NONE) return null;
    if (chosen !== DRAW) return chosen;
    const card = cards[slot];
    return card?.state === "kept" ? card.pictureId : undefined;
  };
  const ready = nameOk && pictureFor("icon") !== undefined && pictureFor("backdrop") !== undefined;

  const start = (slot: Slot): void => {
    runs.current[slot]?.cancel();
    const description = slot === "icon" ? iconDescription(theme) : backdropDescription(theme);
    const run = drawPicture(api, KIND[slot], description, (step) => setCards((c) => ({ ...c, [slot]: { state: "drawing", step } })), draw);
    runs.current[slot] = run;
    setCards((c) => ({ ...c, [slot]: { state: "drawing", step: "Waiting to start…" } }));
    run.done.then(
      (drawing) => {
        const url = tools.preview(drawing.png);
        urls.current.push(url);
        setCards((c) => ({ ...c, [slot]: { state: "ready", drawing, url, textFree: false } }));
      },
      (error: unknown) => {
        const text = error instanceof Error ? error.message : String(error);
        if (text !== "cancelled") setCards((c) => ({ ...c, [slot]: { state: "failed", message: text } }));
      },
    );
  };

  const keep = async (slot: Slot): Promise<void> => {
    const card = cards[slot];
    if (card?.state !== "ready" || !card.textFree) return;
    setCards((c) => ({ ...c, [slot]: { state: "keeping", url: card.url } }));
    try {
      const pictureId = await keepDrawing(api, card.drawing, `${name} ${slot === "icon" ? "planet" : "ground"}`);
      setCards((c) => ({ ...c, [slot]: { state: "kept", pictureId, url: card.url } }));
    } catch (error) {
      setCards((c) => ({ ...c, [slot]: { ...card, textFree: card.textFree } }));
      setMessage(`The picture could not be kept: ${error instanceof Error ? error.message : describeError(error)}`);
    }
  };

  const make = async (): Promise<void> => {
    const icon = pictureFor("icon");
    const backdrop = pictureFor("backdrop");
    if (icon === undefined || backdrop === undefined) return;
    setMessage(null);
    setProgress("Adding the planet…");
    let added = false;
    try {
      await api.createPlanet({ planetId, name: name.trim(), icon, artSet: "moon", backdrop });
      added = true;
      onPlanetAdded();
      setProgress("Loading the new planet…");
      await loadLiveBase(api, planetId); // the challenges are made against this planet (still empty)
      const levelId = `${planetId}-map`;
      const run = makeWholeLevel(
        { levelId, name: name.trim(), seed: seed ?? 1 + Math.floor(Math.random() * 999_999), ownsCampaign: true, challenges, preset: MARGIN_PRESETS[0] as MarginPreset, tune },
        setProgress,
        workers,
      );
      making.current = run;
      const made = await run.done;
      making.current = null;
      setProgress("Saving the level…");
      const level = backdrop === null ? made.level : { ...made.level, map: { ...made.level.map, art: { ...made.level.map.art, backdrop } } };
      await api.createLevel(level, planetId);
      onDone(levelId, [`${name.trim()} is added (not released). Its campaign level:`, ...made.notes].join(" "));
    } catch (error) {
      const text = error instanceof Error ? error.message : describeError(error);
      const what = text === "cancelled" ? "Stopped." : `It could not be finished: ${text === "" ? describeError(error) : text}`;
      setMessage(added ? `${what} The planet ${name.trim()} was added: make its level on Levels → New level.` : what);
    } finally {
      making.current = null;
      setProgress(null);
    }
  };

  const slots: Slot[] = ["icon", "backdrop"];
  return (
    <fieldset className="planet-maker">
      <legend>Make a planet for me</legend>
      <p className="hint">
        Type a theme. The icon and the backdrop are drawn from it for you to approve, then the planet is added with its campaign level (map, 50 waves and
        challenges), ready for you to send to testers.
      </p>
      <label>
        Theme{" "}
        <input value={theme} maxLength={40} disabled={busy} placeholder="fire, ice crystals, jungle" onChange={(e) => setTheme(e.target.value)} />
      </label>
      <label>
        Name <input value={name} maxLength={40} disabled={busy} onChange={(e) => setName(e.target.value)} />
      </label>
      {nameOk && <p className="muted">ID {planetId}</p>}
      {slots.map((slot) => {
        const card = cards[slot];
        const pictures = slot === "icon" ? icons : backgrounds;
        return (
          <div key={slot} className="planet-maker-slot">
            <label>
              {LABEL[slot]}{" "}
              <select
                value={choice[slot]}
                disabled={busy || drawingNow}
                onChange={(e) => {
                  setChoice({ ...choice, [slot]: e.target.value });
                  runs.current[slot]?.cancel();
                  setCards((c) => ({ ...c, [slot]: undefined }));
                }}
              >
                <option value={DRAW}>Draw a new one from the theme</option>
                {slot === "backdrop" && <option value={NONE}>None: the Moon ground</option>}
                {pictures.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {choice[slot] === DRAW && (
              <>
                {card === undefined && (
                  <button type="button" disabled={busy || !themeOk(theme)} onClick={() => start(slot)}>
                    Draw the {slot}
                  </button>
                )}
                {card?.state === "drawing" && <p role="status">{card.step}</p>}
                {card?.state === "failed" && (
                  <>
                    <p role="alert">{card.message}</p>
                    <button type="button" disabled={busy || !themeOk(theme)} onClick={() => start(slot)}>
                      Try again
                    </button>
                  </>
                )}
                {(card?.state === "ready" || card?.state === "keeping" || card?.state === "kept") && (
                  <img src={card.url} alt={`The drawn ${slot}`} className={slot === "icon" ? "planet-maker-icon" : "planet-maker-backdrop"} />
                )}
                {card?.state === "ready" && (
                  <>
                    <TextFreeTick checked={card.textFree} onChange={(textFree) => setCards((c) => ({ ...c, [slot]: { ...card, textFree } }))} />
                    <p className="row">
                      <button type="button" className="primary" disabled={busy || !card.textFree} onClick={() => void keep(slot)}>
                        Approve and use it
                      </button>
                      <button type="button" disabled={busy} onClick={() => start(slot)}>
                        Draw again
                      </button>
                    </p>
                  </>
                )}
                {card?.state === "keeping" && <p role="status">Keeping it…</p>}
                {card?.state === "kept" && <p className="muted">Approved and kept in the library.</p>}
              </>
            )}
          </div>
        );
      })}
      <label>
        Challenges{" "}
        <select value={challenges} disabled={busy} onChange={(e) => setChallenges(Number(e.target.value))}>
          {Array.from({ length: MAX_CHALLENGES + 1 }, (_, n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={tune} disabled={busy} onChange={(e) => setTune(e.target.checked)} /> Tune the waves with the test player (about half a
        minute)
      </label>
      <p className="row">
        <button type="button" className="primary" disabled={!ready || busy || drawingNow} onClick={() => void make()}>
          Make the planet and its level
        </button>
        {busy && (
          <button type="button" onClick={() => making.current?.cancel()}>
            Stop
          </button>
        )}
      </p>
      {!ready && !busy && <p className="muted">Give it a theme and a name, and approve or choose both pictures first.</p>}
      {progress !== null && <p role="status">{progress}</p>}
      {message !== null && <p role="alert">{message}</p>}
    </fieldset>
  );
}
