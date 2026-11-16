// Upload a picture (Phase 42a): pick a PNG or JPEG of at most 5 MB, see it as the library will keep it (256x256, the
// picture letterboxed on a transparent background), name it, tick "No letters, numbers or words in this picture", then
// "Add and approve" (R34 with approve) or "Save as draft". The browser makes the PNG (normalise.ts); admin-api checks
// it again and writes it from its pixels.
//
// Picture kinds (Gate P2): the operator says what the picture is for, "Activity picture (one object)" unless changed.
// An "Activity scene" fills the square (cover: the edges that stick out are cut off); every other kind keeps the
// whole picture with see-through bars (contain). Changing the kind after choosing a file makes the preview again.
import { DEFAULT_PICTURE_KIND, type PictureKindId } from "@scd/shared";
import { useEffect, useId, useRef, useState } from "react";
import type { AdminApi } from "../api";
import { KindSelect } from "./KindSelect";
import { pictureError } from "./messages";
import {
  blobToBase64,
  browserTools,
  fitFor,
  nameFromFile,
  nameOk,
  NAME_MAX,
  normaliseUpload,
  PictureError,
  pictureProblemMessage,
  type Fit,
  type ImageTools,
} from "./normalise";
import { TextFreeTick } from "./TextFreeTick";

type Props = {
  readonly api: AdminApi;
  /** After a picture is stored: the page refreshes the library. */
  readonly onSaved: () => void;
  readonly tools?: ImageTools;
};

type Ready = { readonly png: Blob; readonly url: string };

export function UploadPicture({ api, onSaved, tools = browserTools }: Props) {
  const [kind, setKind] = useState<PictureKindId>(DEFAULT_PICTURE_KIND);
  const [file, setFile] = useState<File | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [name, setName] = useState("");
  const [textFree, setTextFree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const nameId = useId();

  // A save removes the form and its focused button: move focus to the message that says what happened.
  useEffect(() => {
    if (done !== null) doneRef.current?.focus();
  }, [done]);

  // Free the preview's blob: URL when it changes or the tab closes.
  useEffect(() => {
    if (ready === null) return;
    return () => tools.release(ready.url);
  }, [ready, tools]);

  async function prepare(chosen: File, fit: Fit, keepName: boolean) {
    setError(null);
    setDone(null);
    setReady(null);
    setTextFree(false);
    setBusy(true);
    try {
      const png = await normaliseUpload(chosen, tools, fit);
      setReady({ png, url: tools.preview(png) });
      if (!keepName) setName(nameFromFile(chosen.name));
    } catch (problem) {
      setError(problem instanceof PictureError ? pictureProblemMessage(problem.problem) : pictureProblemMessage("unreadable"));
      setFile(null);
      if (fileInput.current !== null) fileInput.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  async function choose(chosen: File | undefined) {
    setFile(chosen ?? null);
    if (chosen === undefined) {
      setError(null);
      setDone(null);
      setReady(null);
      setTextFree(false);
      return;
    }
    await prepare(chosen, fitFor(kind), false);
  }

  /** A new kind: a picture already chosen is fitted again when the fit changes (contain or cover). */
  async function changeKind(next: PictureKindId) {
    const before = fitFor(kind);
    setKind(next);
    if (file !== null && fitFor(next) !== before) await prepare(file, fitFor(next), true);
  }

  async function save(approve: boolean) {
    if (ready === null) return;
    setBusy(true);
    setError(null);
    try {
      const pngBase64 = await blobToBase64(ready.png);
      const saved = await api.createPicture({ name, source: "UPLOAD", kind, pngBase64, approve, textFree });
      const what = saved.picture.state === "APPROVED" ? "approved and in My pictures" : "saved as a draft";
      setDone(
        saved.duplicate === true
          ? `This picture is already in the library as "${saved.picture.name}" (${saved.picture.state === "APPROVED" ? "approved" : "draft"}).`
          : `"${saved.picture.name}" is ${what}.`,
      );
      setReady(null);
      setTextFree(false);
      setName("");
      setFile(null);
      if (fileInput.current !== null) fileInput.current.value = "";
      onSaved();
    } catch (failure) {
      setError(pictureError(failure));
    } finally {
      setBusy(false);
    }
  }

  const nameGood = nameOk(name);
  const cover = fitFor(kind) === "cover";
  return (
    <section className="pictures-upload" aria-label="Upload a picture">
      <p className="muted">
        PNG or JPEG only, up to 5 MB. No SVG files. The picture is made 256 by 256 pixels here in the browser; its
        hidden details (camera, place, date) are left out.
      </p>
      <p className="field">
        <label htmlFor={`${nameId}-kind`}>What is this picture for?</label>
        <KindSelect id={`${nameId}-kind`} value={kind} disabled={busy} describedBy={`${nameId}-kind-hint`} onChange={(next) => next !== "" && void changeKind(next)} />
        <small id={`${nameId}-kind-hint`} className="muted">
          {cover
            ? "A scene fills the square: if the picture isn't square, its edges are cut off."
            : "The whole picture is kept: if it isn't square, it gets a see-through border."}
        </small>
      </p>
      <p className="field">
        <label htmlFor={`${nameId}-file`}>Picture file</label>
        <input
          id={`${nameId}-file`}
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg"
          disabled={busy}
          onChange={(e) => void choose(e.target.files?.[0])}
        />
      </p>
      <div role="status">
        {error !== null && <p className="error">{error}</p>}
        {done !== null && (
          <p className="ok" ref={doneRef} tabIndex={-1}>
            {done}
          </p>
        )}
      </div>
      {ready !== null && (
        <div className="picture-review">
          <img className="picture-preview" src={ready.url} alt="The picture as it will be stored" width={256} height={256} />
          <div className="picture-review-form">
            <p className="field">
              <label htmlFor={nameId}>Name (for the admin only)</label>
              <input id={nameId} type="text" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />
              {!nameGood && <small className="error">1 to {NAME_MAX} characters, no spaces at the ends, no &lt; or &gt;.</small>}
            </p>
            <TextFreeTick checked={textFree} onChange={setTextFree} />
            <p className="actions">
              <button type="button" className="primary" disabled={busy || !textFree || !nameGood} onClick={() => void save(true)}>
                Add and approve
              </button>
              <button type="button" disabled={busy || !nameGood} onClick={() => void save(false)}>
                Save as draft
              </button>
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
