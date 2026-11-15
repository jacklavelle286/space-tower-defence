// The answer area of ARRANGE (D6.3): letter or grapheme tiles (LETTERS, the age-5 way to spell, D-7) or 3-6 items to
// put in order (SEQUENCE), and a row of empty spaces. No drags (Phase 38 risk: a drag has no keyboard path):
// - mouse: click a tile and it fills the next empty space; click a placed tile and it goes back to the tiles;
// - keyboard, tiles (one tab stop): arrows move, Enter or Space places the tile; typing a letter places the first free
//   tile with that letter (LETTERS only); with grapheme tiles the next letter can grow the tile just typed (r, a, i, n
//   gives r + ai + n when there is an "ai" tile), so no typed letter is dropped; Backspace takes the last placed tile back;
// - keyboard, spaces (one tab stop): Left/Right move; Enter lifts a placed tile, Left/Right move it, Enter puts it
//   down, Esc puts it back where it was; Delete or Backspace sends the focused tile back.
// The answer is the tiles' VALUES in order (C20.1), so two "o" tiles are interchangeable; the canonicaliser builds it.
// Placed tiles leave a gap in the tile row, so the other tiles do not jump about.
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ArrangeFields, PanelTile } from "./activity";
import type { RawAnswer } from "./canonical";
import { PANEL_COPY as COPY } from "./copy";

export interface ArrangeAreaProps {
  readonly step: ArrangeFields;
  readonly labelledBy: string;
  readonly value: RawAnswer;
  readonly disabled: boolean;
  onChange(value: RawAnswer): void;
}

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
/** A single typed letter in lower case (explicit mapping, as the canonicaliser), or null for any other key. */
function letterOf(key: string): string | null {
  if (key.length !== 1) return null;
  if (LOWER.includes(key) || key === "'") return key;
  const at = UPPER.indexOf(key);
  return at === -1 ? null : (LOWER[at] ?? null);
}

function TileFace({ tile }: { tile: PanelTile }) {
  return tile.imageUrl !== undefined ? (
    <img className="lp-tile-img" src={tile.imageUrl} alt="" draggable={false} />
  ) : (
    <span className="lp-reading lp-tile-text">{tile.text}</span>
  );
}

export function ArrangeArea({ step, labelledBy, value, disabled, onChange }: ArrangeAreaProps) {
  const spaces: (string | null)[] = Array.from({ length: step.slots }, (_, i) => (Array.isArray(value) ? ((value as (string | null)[])[i] ?? null) : null));
  const placed = new Set(spaces.filter((id): id is string => id !== null));
  const free = step.tiles.filter((t) => !placed.has(t.id));
  const [tileFocus, setTileFocus] = useState<string | null>(null);
  const [spaceFocus, setSpaceFocus] = useState(0);
  const [lifted, setLifted] = useState<{ readonly at: number; readonly from: number } | null>(null);
  const [said, setSaid] = useState("");
  const tileButtons = useRef(new Map<string, HTMLButtonElement>());
  const spaceButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const pendingFocus = useRef<{ readonly tile: string } | { readonly space: number } | null>(null);
  // The tile placed by the last typed letter and the letters typed for it, so the next letter can grow it into a
  // grapheme tile ("a" then "i" becomes "ai"). Any other move forgets it.
  const lastTyped = useRef<{ readonly at: number; readonly tile: string; readonly typed: string } | null>(null);

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if ("tile" in target) tileButtons.current.get(target.tile)?.focus();
    else spaceButtons.current[target.space]?.focus();
  });

  const tileById = (id: string | null) => step.tiles.find((t) => t.id === id);
  const nameOf = (tile: PanelTile) => tile.alt ?? tile.text;
  const tabTile = tileFocus !== null && free.some((t) => t.id === tileFocus) ? tileFocus : (free[0]?.id ?? null);

  function focusSpace(index: number) {
    setSpaceFocus(index);
    pendingFocus.current = { space: index };
  }

  /** Place a tile in the first empty space. `fromKeys`: keep the keyboard in the tile row (or move to the spaces). */
  function place(tile: PanelTile, fromKeys: boolean, typed: string | null = null) {
    lastTyped.current = null;
    if (disabled || placed.has(tile.id)) return;
    const at = spaces.indexOf(null);
    if (at === -1) {
      setSaid(COPY.fillFirst);
      return;
    }
    const next = [...spaces];
    next[at] = tile.id;
    onChange(next);
    setSaid(COPY.placed(nameOf(tile), at + 1, step.slots));
    if (typed !== null) lastTyped.current = { at, tile: tile.id, typed };
    if (!fromKeys) return;
    const order = step.tiles.filter((t) => !placed.has(t.id));
    const index = order.findIndex((t) => t.id === tile.id);
    const neighbour = order[index + 1] ?? order[index - 1];
    if (neighbour !== undefined && next.includes(null)) {
      setTileFocus(neighbour.id);
      pendingFocus.current = { tile: neighbour.id };
    } else {
      focusSpace(at);
    }
  }

  function removeAt(index: number) {
    lastTyped.current = null;
    const tile = tileById(spaces[index] ?? null);
    if (disabled || tile === undefined) return;
    const next = [...spaces];
    next[index] = null;
    onChange(next);
    setLifted(null);
    setSaid(COPY.removed(nameOf(tile)));
  }

  function removeLast() {
    for (let i = spaces.length - 1; i >= 0; i -= 1) {
      if (spaces[i] !== null) {
        removeAt(i);
        return true;
      }
    }
    return false;
  }

  /** Keys that work anywhere in the area: typing a letter, Backspace. True when handled. */
  function areaKey(event: KeyboardEvent<HTMLElement>): boolean {
    if (event.key === "Backspace") {
      event.preventDefault();
      removeLast();
      return true;
    }
    const letter = step.mode === "LETTERS" ? letterOf(event.key) : null;
    if (letter === null || event.ctrlKey || event.metaKey || event.altKey) return false;
    event.preventDefault();
    if (grow(letter)) return true;
    const tile = free.find((t) => t.value === letter) ?? free.find((t) => t.value.startsWith(letter));
    if (tile !== undefined) place(tile, true, letter);
    return true;
  }

  /** The typed letter continues the tile it typed last: keep it, or swap it for the grapheme tile now spelled. */
  function grow(letter: string): boolean {
    const last = lastTyped.current;
    if (last === null || spaces[last.at] !== last.tile) return false;
    const typed = last.typed + letter;
    const current = tileById(last.tile);
    if (current !== undefined && current.value.startsWith(typed)) {
      lastTyped.current = { ...last, typed }; // "a" already placed "ai": the "i" completes it
      return true;
    }
    const swap = free.find((t) => t.value === typed) ?? free.find((t) => t.value.startsWith(typed));
    if (swap === undefined) return false;
    const next = [...spaces];
    next[last.at] = swap.id;
    onChange(next);
    setSaid(COPY.placed(nameOf(swap), last.at + 1, step.slots));
    lastTyped.current = { at: last.at, tile: swap.id, typed };
    // Keep the keyboard in the tile row: the tile it was on may be the one just placed. The freed tile is free again.
    setTileFocus(last.tile);
    pendingFocus.current = { tile: last.tile };
    return true;
  }

  function onTileKey(event: KeyboardEvent<HTMLButtonElement>, tile: PanelTile) {
    if (disabled) return;
    const key = event.key;
    if (key === "ArrowLeft" || key === "ArrowUp" || key === "ArrowRight" || key === "ArrowDown" || key === "Home" || key === "End") {
      event.preventDefault();
      const at = free.findIndex((t) => t.id === tile.id);
      const count = free.length;
      const next = key === "Home" ? 0 : key === "End" ? count - 1 : (at + (key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1) + count) % count;
      const target = free[next];
      if (target !== undefined) {
        setTileFocus(target.id);
        tileButtons.current.get(target.id)?.focus();
      }
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      place(tile, true);
    } else {
      areaKey(event);
    }
  }

  function onSpaceKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (disabled) return;
    const key = event.key;
    if (key === "ArrowLeft" || key === "ArrowRight" || key === "Home" || key === "End") {
      event.preventDefault();
      const target = key === "Home" ? 0 : key === "End" ? step.slots - 1 : index + (key === "ArrowLeft" ? -1 : 1);
      if (target < 0 || target >= step.slots) return;
      if (lifted !== null && (key === "ArrowLeft" || key === "ArrowRight")) {
        // Move the lifted tile one space, swapping with whatever is there.
        const next = [...spaces];
        const moving = next[index] ?? null;
        next[index] = next[target] ?? null;
        next[target] = moving;
        onChange(next);
        setLifted({ at: target, from: lifted.from });
        const tile = tileById(moving);
        if (tile !== undefined) setSaid(COPY.movedTile(nameOf(tile), target + 1));
      }
      focusSpace(target);
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      if (lifted !== null) {
        setLifted(null);
        const tile = tileById(spaces[index] ?? null);
        if (tile !== undefined) setSaid(COPY.placed(nameOf(tile), index + 1, step.slots));
      } else {
        const tile = tileById(spaces[index] ?? null);
        if (tile !== undefined) {
          setLifted({ at: index, from: index });
          setSaid(COPY.liftedTile(nameOf(tile)));
        }
      }
    } else if (key === "Escape" && lifted !== null) {
      event.preventDefault();
      // Put it back where it was lifted from.
      const next = [...spaces];
      const moving = next[lifted.at] ?? null;
      next[lifted.at] = next[lifted.from] ?? null;
      next[lifted.from] = moving;
      onChange(next);
      setLifted(null);
      setSaid(COPY.dropCancelled);
      focusSpace(lifted.from);
    } else if (key === "Delete" || key === "Backspace") {
      event.preventDefault();
      if (spaces[index] !== null) removeAt(index);
      else removeLast();
    } else {
      areaKey(event);
    }
  }

  return (
    <div className="lp-arrange" role="group" aria-labelledby={labelledBy}>
      {step.orderLabel !== undefined ? <p className="lp-order-label">{step.orderLabel}</p> : null}
      <div className="lp-spaces" role="group" aria-label={COPY.spacesLabel}>
        {spaces.map((id, index) => {
          const tile = tileById(id);
          const isLifted = lifted?.at === index;
          return (
            <button
              key={index}
              type="button"
              className={["lp-space", tile !== undefined ? "is-filled" : "", isLifted ? "is-lifted" : ""].filter(Boolean).join(" ")}
              tabIndex={index === spaceFocus && !disabled ? 0 : -1}
              aria-label={COPY.space(index + 1, step.slots, tile !== undefined ? nameOf(tile) : null)}
              aria-pressed={isLifted}
              aria-disabled={disabled ? true : undefined}
              ref={(el) => {
                spaceButtons.current[index] = el;
              }}
              onClick={() => removeAt(index)}
              onKeyDown={(e) => onSpaceKey(e, index)}
            >
              {tile !== undefined ? <TileFace tile={tile} /> : null}
            </button>
          );
        })}
      </div>
      <div className="lp-tiles" role="group" aria-label={COPY.tilesLabel}>
        {step.tiles.map((tile) => {
          const isPlaced = placed.has(tile.id);
          return (
            <button
              key={tile.id}
              type="button"
              className={isPlaced ? "lp-tile is-placed" : "lp-tile"}
              tabIndex={!isPlaced && tile.id === tabTile && !disabled ? 0 : -1}
              aria-label={nameOf(tile)}
              aria-hidden={isPlaced ? true : undefined}
              aria-disabled={disabled ? true : undefined}
              disabled={isPlaced}
              ref={(el) => {
                if (el) tileButtons.current.set(tile.id, el);
                else tileButtons.current.delete(tile.id);
              }}
              onClick={() => place(tile, false)}
              onKeyDown={(e) => onTileKey(e, tile)}
            >
              <TileFace tile={tile} />
            </button>
          );
        })}
      </div>
      <span className="lp-sr" aria-live="polite">
        {said}
      </span>
    </div>
  );
}
