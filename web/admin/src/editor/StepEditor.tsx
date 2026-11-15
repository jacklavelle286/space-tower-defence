// One step's fields, per interaction type (D §D8.4: "payload editor per type: structured fields, never raw JSON").
// Field paths match admin-api's problem paths (activityPayload.options.2.text, answerSpecification.accepted), so a
// validation problem can focus its input. The right answer is chosen next to the thing it is about: a radio on the
// right option, a count on each zone, a group for each object, the order of the tiles.
import { decimal } from "@scd/shared";
import { NumberField, PicturePicker, Row, SelectField, TextField } from "./fields";
import {
  acceptedOf,
  blankTile,
  nextId,
  numberValues,
  OPTION_STYLES,
  SIZES,
  type Cue,
  type Picture,
  type StepDraft,
} from "./model";
import { fieldId } from "./problems";

type Props<S extends StepDraft = StepDraft> = {
  readonly step: S;
  readonly onChange: (step: StepDraft) => void;
  /** `activityPayload`, or `additionalSteps.0.activityPayload` for the second part. */
  readonly payloadPath: string;
  /** `answerSpecification.accepted`, or the second part's. */
  readonly answerPath: string;
  /** "" for the first part, "Part 2 " for the second, so every label on the page is unique. */
  readonly prefix: string;
};

export function StepEditor(props: Props) {
  const { step } = props;
  const hint = acceptedOf(step).some((built) => !built.canonical) ? (
    <p className="muted">The right answer is not complete yet; validation will say what is missing.</p>
  ) : null;
  return (
    <div className="step-editor">
      {step.kind === "MULTIPLE_CHOICE" && <MultipleChoice {...props} step={step} />}
      {step.kind === "PICTURE_SELECT" && <PictureSelect {...props} step={step} />}
      {step.kind === "NUMBER_SELECT" && <NumberSelect {...props} step={step} />}
      {step.kind === "DISTRIBUTE" && <Distribute {...props} step={step} />}
      {step.kind === "SORT" && <Sort {...props} step={step} />}
      {step.kind === "LETTERS" && <Letters {...props} step={step} />}
      {step.kind === "SEQUENCE" && <Sequence {...props} step={step} />}
      {step.kind === "NUMERIC" && <Numeric {...props} step={step} />}
      {step.kind === "WORD" && <Word {...props} step={step} />}
      {hint}
    </div>
  );
}

type Of<K extends StepDraft["kind"]> = Props<Extract<StepDraft, { kind: K }>>;

function replace<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((old, i) => (i === index ? item : old));
}

function without<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, i) => i !== index);
}

// --- Pieces several types share ----------------------------------------------------------------------------------

function StimulusEditor({ value, onChange, path, prefix }: { value: Picture | null; onChange: (p: Picture | null) => void; path: string; prefix: string }) {
  return (
    <div className="sub">
      <label className="check">
        <input type="checkbox" checked={value !== null} onChange={(e) => onChange(e.target.checked ? { assetId: "", alt: "" } : null)} />{" "}
        {prefix}Show a picture with the question
      </label>
      {value !== null && (
        <Row label={`${prefix}Picture shown with the question`}>
          <PicturePicker path={`${path}.stimulus.assetId`} label={`${prefix}Question picture`} value={value.assetId} onChange={(assetId) => onChange({ ...value, assetId })} />
          <TextField path={`${path}.stimulus.alt`} label={`${prefix}Question picture alt text`} value={value.alt} maxLength={60} onChange={(alt) => onChange({ ...value, alt })} />
        </Row>
      )}
    </div>
  );
}

function CueEditor({ value, onChange, path, prefix }: { value: Cue | null; onChange: (c: Cue | null) => void; path: string; prefix: string }) {
  return (
    <div className="sub">
      <label className="check">
        <input type="checkbox" checked={value !== null} onChange={(e) => onChange(e.target.checked ? { assetId: "", alt: "", text: "" } : null)} />{" "}
        {prefix}Show a cue (a picture and/or rule text such as "hop + ing")
      </label>
      {value === null && <small className="muted">Without a cue, the activity needs a prompt clip that says the word.</small>}
      {value !== null && (
        <Row label={`${prefix}Cue`}>
          <PicturePicker path={`${path}.cue.assetId`} label={`${prefix}Cue picture`} value={value.assetId} optional onChange={(assetId) => onChange({ ...value, assetId })} />
          {value.assetId !== "" && (
            <TextField path={`${path}.cue.alt`} label={`${prefix}Cue picture alt text`} value={value.alt} maxLength={60} onChange={(alt) => onChange({ ...value, alt })} />
          )}
          <TextField path={`${path}.cue.text`} label={`${prefix}Cue text`} value={value.text} maxLength={40} onChange={(text) => onChange({ ...value, text })} />
        </Row>
      )}
    </div>
  );
}

function WordList({ words, onChange, path, label, max }: { words: string[]; onChange: (w: string[]) => void; path: string; label: string; max: number }) {
  return (
    <div className="sub" id={fieldId(path)} tabIndex={-1}>
      {words.map((word, i) => (
        <span key={i} className="inline">
          <TextField path={`${path}.${i}`} label={`${label} ${i + 1}`} value={word} maxLength={64} onChange={(w) => onChange(replace(words, i, w))} />
          {words.length > 1 && (
            <button type="button" onClick={() => onChange(without(words, i))} aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}>
              Remove
            </button>
          )}
        </span>
      ))}
      {words.length < max && (
        <button type="button" onClick={() => onChange([...words, ""])}>
          Add another accepted answer
        </button>
      )}
      {words.length > 1 && <small className="muted">More than one accepted answer needs a review note saying why each is right.</small>}
    </div>
  );
}

// --- The types ---------------------------------------------------------------------------------------------------

function MultipleChoice({ step, onChange, payloadPath: p, answerPath, prefix }: Of<"MULTIPLE_CHOICE">) {
  const set = (patch: Partial<typeof step>) => onChange({ ...step, ...patch });
  return (
    <>
      <SelectField path={`${p}.optionStyle`} label={`${prefix}Option style`} value={step.optionStyle} options={OPTION_STYLES} onChange={(optionStyle) => set({ optionStyle })} />
      <fieldset className="list" id={fieldId(`${p}.options`)} tabIndex={-1}>
        <legend>{prefix}Options (4 to 6) and the right one</legend>
        {step.options.map((option, i) => (
          <Row key={option.id} label={`${prefix}Option ${option.id}`}>
            <input
              type="radio"
              id={i === 0 ? fieldId(answerPath) : undefined}
              name={`${answerPath}-right`}
              checked={step.answer === option.id}
              onChange={() => set({ answer: option.id })}
              aria-label={`${prefix}Option ${option.id} is right`}
            />
            <TextField path={`${p}.options.${i}.text`} label={`${prefix}Option ${option.id} text`} value={option.text} maxLength={24} onChange={(text) => set({ options: replace(step.options, i, { ...option, text }) })} />
            {step.options.length > SIZES.options.min && (
              <button type="button" onClick={() => set({ options: without(step.options, i), answer: step.answer === option.id ? "" : step.answer })}>
                Remove {option.id}
              </button>
            )}
          </Row>
        ))}
        {step.options.length < SIZES.options.max && (
          <button type="button" onClick={() => set({ options: [...step.options, { id: nextId("", step.options.map((o) => o.id)), text: "" }] })}>
            {prefix}Add an option
          </button>
        )}
      </fieldset>
      <StimulusEditor value={step.stimulus} onChange={(stimulus) => set({ stimulus })} path={p} prefix={prefix} />
    </>
  );
}

function PictureSelect({ step, onChange, payloadPath: p, answerPath, prefix }: Of<"PICTURE_SELECT">) {
  const set = (patch: Partial<typeof step>) => onChange({ ...step, ...patch });
  return (
    <>
      <fieldset className="list" id={fieldId(`${p}.options`)} tabIndex={-1}>
        <legend>{prefix}Picture cards (4 to 6) and the right one</legend>
        {step.options.map((option, i) => (
          <Row key={option.id} label={`${prefix}Option ${option.id}`}>
            <input
              type="radio"
              id={i === 0 ? fieldId(answerPath) : undefined}
              name={`${answerPath}-right`}
              checked={step.answer === option.id}
              onChange={() => set({ answer: option.id })}
              aria-label={`${prefix}Option ${option.id} is right`}
            />
            <PicturePicker path={`${p}.options.${i}.assetId`} label={`${prefix}Option ${option.id} picture`} value={option.assetId} onChange={(assetId) => set({ options: replace(step.options, i, { ...option, assetId }) })} />
            <TextField path={`${p}.options.${i}.alt`} label={`${prefix}Option ${option.id} alt text`} value={option.alt} maxLength={60} onChange={(alt) => set({ options: replace(step.options, i, { ...option, alt }) })} />
            <TextField path={`${p}.options.${i}.caption`} label={`${prefix}Option ${option.id} caption (optional)`} value={option.caption} maxLength={24} onChange={(caption) => set({ options: replace(step.options, i, { ...option, caption }) })} />
            {step.options.length > SIZES.options.min && (
              <button type="button" onClick={() => set({ options: without(step.options, i), answer: step.answer === option.id ? "" : step.answer })}>
                Remove {option.id}
              </button>
            )}
          </Row>
        ))}
        {step.options.length < SIZES.options.max && (
          <button type="button" onClick={() => set({ options: [...step.options, { id: nextId("", step.options.map((o) => o.id)), assetId: "", alt: "", caption: "" }] })}>
            {prefix}Add a picture card
          </button>
        )}
        <small className="muted">Alt text is neutral: it names the picture and never gives the answer away.</small>
      </fieldset>
      <StimulusEditor value={step.stimulus} onChange={(stimulus) => set({ stimulus })} path={p} prefix={prefix} />
    </>
  );
}

function NumberSelect({ step, onChange, payloadPath: p, answerPath, prefix }: Of<"NUMBER_SELECT">) {
  const set = (patch: Partial<typeof step>) => onChange({ ...step, ...patch });
  const values = numberValues(step.numberSet);
  const numbers = step.numberSet;
  return (
    <>
      <SelectField
        path={`${p}.numberSet`}
        label={`${prefix}Numbers`}
        value={numbers.kind}
        options={[
          { value: "RANGE", label: "A range (from, to, step)" },
          { value: "LIST", label: "A list" },
        ]}
        onChange={(kind) => set({ numberSet: kind === "LIST" ? { kind: "LIST", values } : { kind: "RANGE", min: 0, max: 10, step: 1 } })}
      />
      {numbers.kind === "RANGE" ? (
        <span className="inline">
          <NumberField path={`${p}.numberSet.min`} label={`${prefix}From`} value={numbers.min} min={0} max={100} onChange={(min) => set({ numberSet: { ...numbers, min } })} />
          <NumberField path={`${p}.numberSet.max`} label={`${prefix}To`} value={numbers.max} min={0} max={100} onChange={(max) => set({ numberSet: { ...numbers, max } })} />
          <NumberField path={`${p}.numberSet.step`} label={`${prefix}Step`} value={numbers.step} min={1} max={100} onChange={(s) => set({ numberSet: { ...numbers, step: s } })} />
        </span>
      ) : (
        <TextField
          path={`${p}.numberSet.values`}
          label={`${prefix}The numbers, in order, separated by spaces`}
          value={numbers.values.map((n) => decimal(n) ?? "").join(" ")}
          wide
          onChange={(text) =>
            set({
              numberSet: {
                kind: "LIST",
                values: text
                  .split(/[\s,]+/u)
                  .filter((t) => /^[0-9]{1,3}$/u.test(t))
                  .map((t) => Number.parseInt(t, 10)),
              },
            })
          }
        />
      )}
      <SelectField
        path={`${p}.display`}
        label={`${prefix}Layout`}
        value={step.display}
        options={[
          { value: "TRACK", label: "Number track (up to 21 numbers)" },
          { value: "GRID", label: "Hundred square" },
        ]}
        onChange={(display) => set({ display: display === "GRID" ? "GRID" : "TRACK" })}
      />
      <SelectField
        path={answerPath}
        label={`${prefix}Right number`}
        value={step.answer}
        options={[{ value: "", label: "Choose…" }, ...values.map((n) => ({ value: decimal(n) ?? "", label: decimal(n) ?? "" }))]}
        onChange={(answer) => set({ answer })}
      />
      <StimulusEditor value={step.stimulus} onChange={(stimulus) => set({ stimulus })} path={p} prefix={prefix} />
    </>
  );
}

function Distribute({ step, onChange, payloadPath: p, answerPath, prefix }: Of<"DISTRIBUTE">) {
  const set = (patch: Partial<typeof step>) => onChange({ ...step, ...patch });
  return (
    <>
      <Row label={`${prefix}The objects`}>
        <PicturePicker path={`${p}.objectAssetId`} label={`${prefix}Object picture`} value={step.object.assetId} onChange={(assetId) => set({ object: { ...step.object, assetId } })} />
        <TextField path={`${p}.objectAlt`} label={`${prefix}Object alt text`} value={step.object.alt} maxLength={60} onChange={(alt) => set({ object: { ...step.object, alt } })} />
        <NumberField path={`${p}.sourceCount`} label={`${prefix}How many objects (2 to 12)`} value={step.sourceCount} min={2} max={12} onChange={(sourceCount) => set({ sourceCount })} />
      </Row>
      <label className="check">
        <input type="checkbox" id={fieldId(`${p}.requireAllPlaced`)} checked={step.requireAllPlaced} onChange={(e) => set({ requireAllPlaced: e.target.checked })} /> {prefix}
        Every object must be placed (sharing); untick for "put 4 in the box" (counting)
      </label>
      <fieldset className="list" id={fieldId(`${p}.zones`)} tabIndex={-1}>
        <legend>{prefix}Zones (1 to 3) and how many go in each</legend>
        {step.zones.map((zone, i) => (
          <Row key={zone.id} label={`${prefix}Zone ${i + 1}`}>
            <TextField path={`${p}.zones.${i}.label`} label={`${prefix}Zone ${i + 1} label`} value={zone.label} maxLength={24} onChange={(label) => set({ zones: replace(step.zones, i, { ...zone, label }) })} />
            <PicturePicker path={`${p}.zones.${i}.assetId`} label={`${prefix}Zone ${i + 1} picture`} value={zone.assetId} optional onChange={(assetId) => set({ zones: replace(step.zones, i, { ...zone, assetId }) })} />
            <TextField
              path={`${answerPath}.${zone.id}`}
              label={`${prefix}Zone ${i + 1} right count`}
              value={step.answer[zone.id] ?? ""}
              maxLength={2}
              onChange={(count) => set({ answer: { ...step.answer, [zone.id]: count } })}
            />
            {step.zones.length > SIZES.zones.min && (
              <button
                type="button"
                onClick={() => {
                  const { [zone.id]: _gone, ...answer } = step.answer;
                  set({ zones: without(step.zones, i), answer });
                }}
              >
                Remove zone {i + 1}
              </button>
            )}
          </Row>
        ))}
        {step.zones.length < SIZES.zones.max && (
          <button type="button" onClick={() => set({ zones: [...step.zones, { id: nextId("z", step.zones.map((z) => z.id)), label: "", assetId: "" }] })}>
            {prefix}Add a zone
          </button>
        )}
      </fieldset>
      <span id={fieldId(answerPath)} tabIndex={-1} />
    </>
  );
}

function Sort({ step, onChange, payloadPath: p, answerPath, prefix }: Of<"SORT">) {
  const set = (patch: Partial<typeof step>) => onChange({ ...step, ...patch });
  const groups = [{ value: "", label: "Choose…" }, ...step.bins.map((b, i) => ({ value: b.id, label: b.label === "" ? `Group ${i + 1}` : b.label }))];
  return (
    <>
      <fieldset className="list" id={fieldId(`${p}.bins`)} tabIndex={-1}>
        <legend>{prefix}Groups (2 to 3)</legend>
        {step.bins.map((bin, i) => (
          <Row key={bin.id} label={`${prefix}Group ${i + 1}`}>
            <TextField path={`${p}.bins.${i}.label`} label={`${prefix}Group ${i + 1} label`} value={bin.label} maxLength={24} onChange={(label) => set({ bins: replace(step.bins, i, { ...bin, label }) })} />
            {step.bins.length > SIZES.bins.min && (
              <button
                type="button"
                onClick={() =>
                  set({
                    bins: without(step.bins, i),
                    answer: Object.fromEntries(Object.entries(step.answer).filter(([, target]) => target !== bin.id)),
                  })
                }
              >
                Remove group {i + 1}
              </button>
            )}
          </Row>
        ))}
        {step.bins.length < SIZES.bins.max && (
          <button type="button" onClick={() => set({ bins: [...step.bins, { id: nextId("b", step.bins.map((b) => b.id)), label: "" }] })}>
            {prefix}Add a group
          </button>
        )}
      </fieldset>
      <fieldset className="list" id={fieldId(`${p}.objects`)} tabIndex={-1}>
        <legend>{prefix}Objects to sort (4 to 8) and the right group for each</legend>
        {step.objects.map((object, i) => (
          <Row key={object.id} label={`${prefix}Object ${i + 1}`}>
            <SelectField
              path={`${p}.objects.${i}`}
              label={`${prefix}Object ${i + 1} shows`}
              value={object.picture ? "picture" : "word"}
              options={[
                { value: "word", label: "a word" },
                { value: "picture", label: "a picture" },
              ]}
              onChange={(v) => set({ objects: replace(step.objects, i, { ...object, picture: v === "picture" }) })}
            />
            {object.picture ? (
              <>
                <PicturePicker path={`${p}.objects.${i}.assetId`} label={`${prefix}Object ${i + 1} picture`} value={object.assetId} onChange={(assetId) => set({ objects: replace(step.objects, i, { ...object, assetId }) })} />
                <TextField path={`${p}.objects.${i}.alt`} label={`${prefix}Object ${i + 1} alt text`} value={object.alt} maxLength={60} onChange={(alt) => set({ objects: replace(step.objects, i, { ...object, alt }) })} />
              </>
            ) : (
              <TextField path={`${p}.objects.${i}.text`} label={`${prefix}Object ${i + 1} word`} value={object.text} maxLength={24} onChange={(text) => set({ objects: replace(step.objects, i, { ...object, text }) })} />
            )}
            <SelectField
              path={`${answerPath}.${object.id}`}
              label={`${prefix}Object ${i + 1} right group`}
              value={step.answer[object.id] ?? ""}
              options={groups}
              onChange={(target) => set({ answer: { ...step.answer, [object.id]: target } })}
            />
            {step.objects.length > SIZES.sortObjects.min && (
              <button
                type="button"
                onClick={() => {
                  const { [object.id]: _gone, ...answer } = step.answer;
                  set({ objects: without(step.objects, i), answer });
                }}
              >
                Remove object {i + 1}
              </button>
            )}
          </Row>
        ))}
        {step.objects.length < SIZES.sortObjects.max && (
          <button
            type="button"
            onClick={() => set({ objects: [...step.objects, { id: nextId("o", step.objects.map((o) => o.id)), text: "", assetId: "", alt: "", picture: false }] })}
          >
            {prefix}Add an object
          </button>
        )}
      </fieldset>
      <span id={fieldId(answerPath)} tabIndex={-1} />
    </>
  );
}

function TileRows({ step, set, p, prefix, max, pictures }: { step: Extract<StepDraft, { kind: "LETTERS" | "SEQUENCE" }>; set: (s: StepDraft) => void; p: string; prefix: string; max: number; pictures: boolean }) {
  const tiles = step.tiles;
  const min = step.kind === "LETTERS" ? SIZES.letterTiles.min : SIZES.sequenceTiles.min;
  return (
    <fieldset className="list" id={fieldId(`${p}.tiles`)} tabIndex={-1}>
      <legend>
        {prefix}Tiles, in the order the child sees them ({step.kind === "LETTERS" ? "the spaces plus up to 3 extra" : "3 to 6"})
      </legend>
      {tiles.map((tile, i) => (
        <Row key={tile.id} label={`${prefix}Tile ${i + 1}`}>
          <TextField path={`${p}.tiles.${i}.value`} label={`${prefix}Tile ${i + 1} value`} value={tile.value} maxLength={12} onChange={(value) => set({ ...step, tiles: replace(tiles, i, { ...tile, value }) })} />
          {pictures && (
            <>
              <PicturePicker path={`${p}.tiles.${i}.assetId`} label={`${prefix}Tile ${i + 1} picture`} value={tile.assetId} optional onChange={(assetId) => set({ ...step, tiles: replace(tiles, i, { ...tile, assetId }) })} />
              {tile.assetId !== "" && (
                <TextField path={`${p}.tiles.${i}.alt`} label={`${prefix}Tile ${i + 1} alt text`} value={tile.alt} maxLength={60} onChange={(alt) => set({ ...step, tiles: replace(tiles, i, { ...tile, alt }) })} />
              )}
            </>
          )}
          {tiles.length > min && (
            <button
              type="button"
              onClick={() => set(step.kind === "SEQUENCE" ? { ...step, tiles: without(tiles, i), answer: step.answer.filter((id) => id !== tile.id) } : { ...step, tiles: without(tiles, i) })}
            >
              Remove tile {i + 1}
            </button>
          )}
        </Row>
      ))}
      {tiles.length < max && (
        <button type="button" onClick={() => set({ ...step, tiles: [...tiles, blankTile(nextId("t", tiles.map((t) => t.id)))] })}>
          {prefix}Add a tile
        </button>
      )}
      <small className="muted">The order shown must not already be the answer.</small>
    </fieldset>
  );
}

function Letters({ step, onChange, payloadPath: p, answerPath, prefix }: Of<"LETTERS">) {
  const set = (patch: Partial<typeof step>) => onChange({ ...step, ...patch });
  return (
    <>
      <TileRows step={step} set={onChange} p={p} prefix={prefix} max={Math.min(SIZES.letterTiles.max, step.slots + 3)} pictures={false} />
      <NumberField path={`${p}.slots`} label={`${prefix}Spaces (2 to 8)`} value={step.slots} min={2} max={8} onChange={(slots) => set({ slots })} />
      <CueEditor value={step.cue} onChange={(cue) => set({ cue })} path={p} prefix={prefix} />
      <WordList words={step.answer} onChange={(answer) => set({ answer })} path={answerPath} label={`${prefix}Right word`} max={SIZES.acceptedWords.max} />
    </>
  );
}

function Sequence({ step, onChange, payloadPath: p, answerPath, prefix }: Of<"SEQUENCE">) {
  const set = (patch: Partial<typeof step>) => onChange({ ...step, ...patch });
  const options = [{ value: "", label: "Choose…" }, ...step.tiles.map((t, i) => ({ value: t.id, label: t.value === "" ? `Tile ${i + 1}` : t.value }))];
  return (
    <>
      <TileRows step={step} set={onChange} p={p} prefix={prefix} max={SIZES.sequenceTiles.max} pictures />
      <TextField path={`${p}.orderLabel`} label={`${prefix}Order label`} value={step.orderLabel} maxLength={40} hint='Shown to the child, for example "smallest first".' onChange={(orderLabel) => set({ orderLabel })} />
      <fieldset className="list" id={fieldId(answerPath)} tabIndex={-1}>
        <legend>{prefix}The right order</legend>
        {step.tiles.map((_, i) => (
          <SelectField
            key={i}
            path={`${answerPath}.0.${i}`}
            label={`${prefix}Position ${i + 1}`}
            value={step.answer[i] ?? ""}
            options={options}
            onChange={(id) => {
              const answer = step.tiles.map((__, j) => (j === i ? id : (step.answer[j] ?? "")));
              set({ answer });
            }}
          />
        ))}
      </fieldset>
    </>
  );
}

function Numeric({ step, onChange, payloadPath: p, answerPath, prefix }: Of<"NUMERIC">) {
  const set = (patch: Partial<typeof step>) => onChange({ ...step, ...patch });
  return (
    <>
      <NumberField path={`${p}.maxLength`} label={`${prefix}Longest answer in digits (1 to 3)`} value={step.maxLength} min={1} max={3} onChange={(maxLength) => set({ maxLength })} />
      <TextField path={answerPath} label={`${prefix}Right number`} value={step.answer} maxLength={3} onChange={(answer) => set({ answer })} />
      <StimulusEditor value={step.stimulus} onChange={(stimulus) => set({ stimulus })} path={p} prefix={prefix} />
    </>
  );
}

function Word({ step, onChange, payloadPath: p, answerPath, prefix }: Of<"WORD">) {
  const set = (patch: Partial<typeof step>) => onChange({ ...step, ...patch });
  return (
    <>
      <NumberField path={`${p}.maxLength`} label={`${prefix}Longest answer in letters (2 to 12)`} value={step.maxLength} min={2} max={12} onChange={(maxLength) => set({ maxLength })} />
      <CueEditor value={step.cue} onChange={(cue) => set({ cue })} path={p} prefix={prefix} />
      <WordList words={step.answer} onChange={(answer) => set({ answer })} path={answerPath} label={`${prefix}Right word`} max={SIZES.acceptedWords.max} />
    </>
  );
}
