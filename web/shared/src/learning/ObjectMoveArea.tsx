// The answer areas of OBJECT_MOVE (D6.3): share/count (DISTRIBUTE) and sort (SORT). Every move has a mouse way and a
// keyboard way, and every change is announced in words for screen readers. Nothing here is a drag: a drag-only
// interaction would have no keyboard path (Phase 38 risk), so "move" is click-then-click, or keys.
//
// DISTRIBUTE: a tray of identical objects and 1-3 zones.
// - mouse: click an object in the tray and it hops into the zone (one zone); with several zones click the object, then
//   the zone (clicking a zone also puts one in straight away). Click an object in a zone to send it back.
// - keyboard: Tab to a zone; + or Enter puts one in; - or Backspace takes one out.
// The count is announced ("Nova, has 3") but never shown as a numeral, so counting stays counting (D6.3).
//
// SORT: 4-8 objects and 2-3 labelled bins.
// - mouse: click an object (it lifts), click a bin (it drops); "Back to the start" returns a lifted object.
// - keyboard: the objects are one tab stop; arrows move between them; Enter lifts; arrows choose a bin; Enter drops;
//   digits 1-3 send the focused object to a bin, 0 back to the start; Esc cancels a lift (D5.3: Esc never closes the panel).
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { DistributeFields, PanelSortObject, SortFields } from "./activity";
import type { RawAnswer } from "./canonical";
import { PANEL_COPY as COPY } from "./copy";

type Counts = Readonly<Record<string, number>>;

/**
 * A click on the body of a zone or bin card (the big box under its label) counts as a click on its drop button: a
 * child naturally drops into the box. Clicks on a button inside (the label button, a placed object) do their own job.
 * Mouse only: the keyboard path is the drop button, so the card itself is not a tab stop.
 */
function onCardBody(event: MouseEvent<HTMLDivElement>, action: () => void) {
  if (event.target instanceof Element && event.target.closest("button") !== null) return;
  action();
}
type Places = Readonly<Record<string, string | null>>;

const asCounts = (value: RawAnswer): Counts => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Counts) : {});
const asPlaces = (value: RawAnswer): Places => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Places) : {});

export interface MoveAreaProps<T> {
  readonly step: T;
  readonly labelledBy: string;
  readonly value: RawAnswer;
  /** Checking, resolved, or a right part locked with a tick: nothing moves. */
  readonly disabled: boolean;
  onChange(value: RawAnswer): void;
}

/** Visually hidden, read by screen readers: what the last move did. */
function Announcer({ text }: { text: string }) {
  return (
    <span className="lp-sr" aria-live="polite">
      {text}
    </span>
  );
}

export function DistributeArea({ step, labelledBy, value, disabled, onChange }: MoveAreaProps<DistributeFields>) {
  const counts = asCounts(value);
  const placed = step.zones.reduce((sum, z) => sum + (counts[z.id] ?? 0), 0);
  const left = Math.max(0, step.sourceCount - placed);
  const [lifted, setLifted] = useState(false);
  const [said, setSaid] = useState("");
  const hint = `${labelledBy}-zone-hint`;
  const firstZone = step.zones[0];

  function putIn(zoneId: string) {
    if (disabled) return;
    setLifted(false);
    const zone = step.zones.find((z) => z.id === zoneId);
    if (zone === undefined) return;
    if (left === 0) {
      setSaid(COPY.noneLeft);
      return;
    }
    const n = (counts[zoneId] ?? 0) + 1;
    onChange({ ...counts, [zoneId]: n });
    setSaid(COPY.movedIn(zone.label, n));
  }

  function takeOut(zoneId: string) {
    if (disabled) return;
    const zone = step.zones.find((z) => z.id === zoneId);
    const have = counts[zoneId] ?? 0;
    if (zone === undefined || have === 0) return;
    onChange({ ...counts, [zoneId]: have - 1 });
    setSaid(COPY.movedOut(zone.label, have - 1));
  }

  function clickTray() {
    if (disabled) return;
    if (step.zones.length === 1 && firstZone !== undefined) putIn(firstZone.id);
    else {
      setLifted(true);
      setSaid(COPY.chooseWhere);
    }
  }

  function onZoneKey(event: KeyboardEvent<HTMLButtonElement>, zoneId: string) {
    if (event.key === "+" || event.key === "=" || event.key === "Add") {
      event.preventDefault();
      putIn(zoneId);
    } else if (event.key === "-" || event.key === "_" || event.key === "Subtract" || event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      takeOut(zoneId);
    }
  }

  return (
    <div className="lp-move" role="group" aria-labelledby={labelledBy}>
      <div className={lifted ? "lp-tray is-lifted" : "lp-tray"} role="group" aria-label={COPY.stillToMove}>
        {Array.from({ length: left }, (_, i) => (
          <button key={i} type="button" className="lp-object" tabIndex={-1} aria-label={COPY.trayObject(step.object.alt)} aria-disabled={disabled ? true : undefined} onClick={clickTray}>
            <img src={step.object.imageUrl} alt="" draggable={false} />
          </button>
        ))}
      </div>
      <span id={hint} className="lp-sr">
        {COPY.zoneHint}
      </span>
      <div className="lp-zones">
        {step.zones.map((zone) => {
          const n = counts[zone.id] ?? 0;
          return (
            <div key={zone.id} className="lp-zone" onClick={(e) => onCardBody(e, () => putIn(zone.id))}>
              <button
                type="button"
                className="lp-zone-drop"
                aria-label={COPY.zoneName(zone.label, n)}
                aria-describedby={hint}
                aria-disabled={disabled ? true : undefined}
                onClick={() => putIn(zone.id)}
                onKeyDown={(e) => onZoneKey(e, zone.id)}
              >
                {zone.imageUrl !== undefined ? <img className="lp-zone-img" src={zone.imageUrl} alt="" draggable={false} /> : null}
                <span className="lp-reading lp-zone-label">{zone.label}</span>
              </button>
              <div className="lp-zone-objects">
                {Array.from({ length: n }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    className="lp-object"
                    tabIndex={-1}
                    aria-label={COPY.placedObject(step.object.alt, zone.label)}
                    aria-disabled={disabled ? true : undefined}
                    onClick={() => takeOut(zone.id)}
                  >
                    <img src={step.object.imageUrl} alt="" draggable={false} />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <Announcer text={said} />
    </div>
  );
}

function ObjectFace({ object }: { object: PanelSortObject }) {
  return object.imageUrl !== undefined ? (
    <img className="lp-sort-img" src={object.imageUrl} alt="" draggable={false} />
  ) : (
    <span className="lp-reading lp-sort-text">{object.text}</span>
  );
}

export function SortArea({ step, labelledBy, value, disabled, onChange }: MoveAreaProps<SortFields>) {
  const places = asPlaces(value);
  const [focusId, setFocusId] = useState(step.objects[0]?.id ?? "");
  const [lifted, setLifted] = useState<string | null>(null);
  const [binFocus, setBinFocus] = useState(0);
  const [said, setSaid] = useState("");
  const objectButtons = useRef(new Map<string, HTMLButtonElement>());
  const binButtons = useRef<(HTMLButtonElement | null)[]>([]);
  // Focus to move once the render that moved an object (into another bin, so a new button) has been committed.
  const pendingFocus = useRef<{ readonly object: string } | { readonly bin: number } | null>(null);
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if ("object" in target) objectButtons.current.get(target.object)?.focus();
    else binButtons.current[target.bin]?.focus();
  });

  const binOf = (id: string) => places[id] ?? null;
  const labelOfBin = (binId: string | null) => step.bins.find((b) => b.id === binId)?.label ?? null;
  const nameOf = (object: PanelSortObject) => COPY.sortObjectName(object.alt, labelOfBin(binOf(object.id)) ?? COPY.notSorted);
  const find = (id: string) => step.objects.find((o) => o.id === id);

  const focusObject = (id: string) => {
    setFocusId(id);
    pendingFocus.current = { object: id };
    objectButtons.current.get(id)?.focus(); // at once when the button stays; again after the render when it moved
  };

  function place(objectId: string, binId: string | null) {
    if (disabled) return;
    const object = find(objectId);
    if (object === undefined) return;
    onChange({ ...places, [objectId]: binId });
    setLifted(null);
    const label = labelOfBin(binId);
    setSaid(label === null ? COPY.backToTray(object.alt) : COPY.sortedInto(object.alt, label));
  }

  function lift(objectId: string) {
    if (disabled) return;
    const object = find(objectId);
    if (object === undefined) return;
    if (lifted === objectId) {
      setLifted(null);
      setSaid(COPY.dropCancelled);
      return;
    }
    setLifted(objectId);
    setFocusId(objectId);
    setSaid(COPY.liftedObject(object.alt));
  }

  function onObjectKey(event: KeyboardEvent<HTMLButtonElement>, objectId: string) {
    if (disabled) return;
    const at = step.objects.findIndex((o) => o.id === objectId);
    const key = event.key;
    if (key === "ArrowLeft" || key === "ArrowUp" || key === "ArrowRight" || key === "ArrowDown" || key === "Home" || key === "End") {
      event.preventDefault();
      const count = step.objects.length;
      const next =
        key === "Home" ? 0 : key === "End" ? count - 1 : (at + (key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1) + count) % count;
      const id = step.objects[next]?.id;
      if (id !== undefined) focusObject(id);
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      if (lifted === objectId) {
        lift(objectId); // a second Enter on the lifted object cancels
        return;
      }
      const bin = Math.max(0, step.bins.findIndex((b) => b.id === binOf(objectId)));
      setBinFocus(bin);
      lift(objectId);
      pendingFocus.current = { bin };
    } else if (key.length === 1 && key >= "0" && key <= "9") {
      event.preventDefault();
      if (key === "0") {
        place(objectId, null);
      } else {
        const bin = step.bins[key.charCodeAt(0) - "1".charCodeAt(0)];
        if (bin !== undefined) place(objectId, bin.id);
      }
      focusObject(objectId);
    } else if (key === "Escape" && lifted !== null) {
      event.preventDefault();
      setLifted(null);
      setSaid(COPY.dropCancelled);
    }
  }

  function onBinKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (lifted === null) return;
    const key = event.key;
    if (key === "ArrowLeft" || key === "ArrowUp" || key === "ArrowRight" || key === "ArrowDown") {
      event.preventDefault();
      const count = step.bins.length;
      const next = (index + (key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1) + count) % count;
      setBinFocus(next);
      binButtons.current[next]?.focus();
    } else if (key === "Escape") {
      event.preventDefault();
      const id = lifted;
      setLifted(null);
      setSaid(COPY.dropCancelled);
      focusObject(id);
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      const bin = step.bins[index];
      const id = lifted;
      if (bin !== undefined) place(id, bin.id);
      focusObject(id);
    }
  }

  function dropInto(binId: string | null) {
    if (lifted === null) return;
    const id = lifted;
    place(id, binId);
    focusObject(id);
  }

  const objectButton = (object: PanelSortObject) => (
    <button
      key={object.id}
      type="button"
      className={lifted === object.id ? "lp-sort-object is-lifted" : "lp-sort-object"}
      tabIndex={object.id === focusId && !disabled ? 0 : -1}
      aria-label={nameOf(object)}
      aria-pressed={lifted === object.id}
      aria-disabled={disabled ? true : undefined}
      ref={(el) => {
        if (el) objectButtons.current.set(object.id, el);
        else objectButtons.current.delete(object.id);
      }}
      onClick={() => lift(object.id)}
      onKeyDown={(e) => onObjectKey(e, object.id)}
    >
      <ObjectFace object={object} />
    </button>
  );

  const inTray = step.objects.filter((o) => binOf(o.id) === null);
  return (
    <div className={lifted !== null ? "lp-move is-lifting" : "lp-move"} role="group" aria-labelledby={labelledBy}>
      <div className="lp-tray" role="group" aria-label={COPY.stillToSort}>
        {inTray.map(objectButton)}
        {lifted !== null && binOf(lifted) !== null ? (
          <button type="button" className="lp-btn lp-small lp-tray-drop" tabIndex={-1} onClick={() => dropInto(null)}>
            {COPY.trayDrop}
          </button>
        ) : null}
      </div>
      <div className="lp-bins">
        {step.bins.map((bin, index) => (
          <div key={bin.id} className={lifted !== null ? "lp-bin is-target" : "lp-bin"} onClick={(e) => onCardBody(e, () => dropInto(bin.id))}>
            <button
              type="button"
              className="lp-bin-drop"
              tabIndex={lifted !== null && index === binFocus ? 0 : -1}
              aria-label={COPY.binDrop(bin.label)}
              aria-disabled={lifted === null || disabled ? true : undefined}
              ref={(el) => {
                binButtons.current[index] = el;
              }}
              onClick={() => dropInto(bin.id)}
              onKeyDown={(e) => onBinKey(e, index)}
            >
              <span className="lp-badge" aria-hidden="true">
                {index + 1}
              </span>
              <span className="lp-reading lp-bin-label">{bin.label}</span>
            </button>
            <div className="lp-bin-objects">{step.objects.filter((o) => binOf(o.id) === bin.id).map(objectButton)}</div>
          </div>
        ))}
      </div>
      <Announcer text={said} />
    </div>
  );
}
