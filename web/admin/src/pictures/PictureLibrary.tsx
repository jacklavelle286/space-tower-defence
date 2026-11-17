// The picture library (Phase 42a): every stored picture, drafts and approved, with filters. Open one to see it, which
// activities use it (R35), approve a draft (R36, with the "no letters, numbers or words" tick) or delete it (R37).
// Deleting an approved picture removes its served file too; admin-api refuses while any activity draft or version
// uses it and names those activities, listed here as links. A draft's picture is not served, so it comes with R35
// and is shown through a blob: URL.
//
// Picture kinds (Gate P2): each tile says what the picture is for, and the "Kind" filter shows one kind. A picture
// saved before kinds reads as "Activity picture (one object)", as admin-api reads it.
import { isActivityPictureKind, pictureKindLabel, pictureKindOf, type PictureKindId } from "@scd/shared";
import { useEffect, useId, useRef, useState } from "react";
import { ApiError, pictureUsers, type AdminApi, type PictureDetail, type PictureSource, type PictureState, type PictureSummary } from "../api";
import { ConfirmDialog, useFocusReturn } from "../ConfirmDialog";
import { hrefOf } from "../routes";
import { KindSelect } from "./KindSelect";
import { pictureError } from "./messages";
import { base64ToBlob, browserTools, previewSize, type ImageTools } from "./normalise";
import { TextFreeTick } from "./TextFreeTick";

type Props = {
  readonly api: AdminApi;
  readonly pictures: readonly PictureSummary[];
  /** After an approve or a delete: the page reads the library again. */
  readonly onChanged: () => void;
  readonly tools?: ImageTools;
};

const STATE_LABEL: Record<PictureState, string> = { APPROVED: "Approved", DRAFT: "Draft" };
const SOURCE_LABEL: Record<PictureSource, string> = { UPLOAD: "Uploaded", GENERATED: "Drawn" };

export function PictureLibrary({ api, pictures, onChanged, tools = browserTools }: Props) {
  const [state, setState] = useState<PictureState | "">("");
  const [source, setSource] = useState<PictureSource | "">("");
  const [kind, setKind] = useState<PictureKindId | "">("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const items = useRef(new Map<string, HTMLButtonElement>());
  // After a delete the details (and the focused button) are gone: focus the message that says what happened.
  const [focusMessage, setFocusMessage] = useState(0);
  const ids = useId();

  useEffect(() => {
    if (focusMessage > 0) messageRef.current?.focus();
  }, [focusMessage]);

  const needle = query.trim().toLowerCase();
  const shown = pictures
    .filter(
      (p) =>
        (state === "" || p.state === state) &&
        (source === "" || p.source === source) &&
        (kind === "" || pictureKindOf(p.kind) === kind) &&
        (needle === "" || p.name.toLowerCase().includes(needle)),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const selected = open === null ? undefined : pictures.find((p) => p.id === open);

  return (
    <section className="pictures-library" aria-label="Picture library">
      <div className="filters">
        <span className="field">
          <label htmlFor={`${ids}-state`}>Show</label>
          <select id={`${ids}-state`} value={state} onChange={(e) => setState(e.target.value as PictureState | "")}>
            <option value="">Approved and drafts</option>
            <option value="APPROVED">Approved</option>
            <option value="DRAFT">Drafts</option>
          </select>
        </span>
        <span className="field">
          <label htmlFor={`${ids}-source`}>From</label>
          <select id={`${ids}-source`} value={source} onChange={(e) => setSource(e.target.value as PictureSource | "")}>
            <option value="">Anywhere</option>
            <option value="UPLOAD">Uploaded</option>
            <option value="GENERATED">Drawn</option>
          </select>
        </span>
        <span className="field">
          <label htmlFor={`${ids}-kind`}>Kind</label>
          <KindSelect id={`${ids}-kind`} value={kind} onChange={setKind} first="Every kind" />
        </span>
        <span className="field">
          <label htmlFor={`${ids}-search`}>Name</label>
          <input id={`${ids}-search`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </span>
      </div>
      <div role="status">
        {message !== null && (
          <p className="ok" ref={messageRef} tabIndex={-1}>
            {message}
          </p>
        )}
      </div>
      <p className="muted">
        {shown.length} of {pictures.length} picture{pictures.length === 1 ? "" : "s"}. Only approved pictures of the
        activity kinds can go in activities.
      </p>
      <ul className="library-grid">
        {shown.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              ref={(el) => {
                if (el === null) items.current.delete(p.id);
                else items.current.set(p.id, el);
              }}
              className="library-item"
              aria-pressed={open === p.id} aria-label={`${p.name} (${STATE_LABEL[p.state]})`} onClick={() => setOpen(open === p.id ? null : p.id)}>
              {p.url !== undefined ? <img src={p.url} alt="" width={96} height={96} loading="lazy" /> : <span className="thumb empty library-draft">Draft</span>}
              <span>{p.name}</span>
              <small className={`state state-${p.state.toLowerCase()}`}>
                {STATE_LABEL[p.state]} · {SOURCE_LABEL[p.source]}
              </small>
              <small className="kind-tag">{pictureKindLabel(pictureKindOf(p.kind))}</small>
            </button>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="muted">No pictures match.</p>}
      {selected !== undefined && (
        <PictureDetails
          key={`${selected.id}-${selected.state}`}
          api={api}
          summary={selected}
          tools={tools}
          onClose={() => {
            setOpen(null);
            items.current.get(selected.id)?.focus(); // back to the picture that opened the details
          }}
          onChanged={(done, deleted) => {
            setMessage(done);
            if (deleted) {
              setOpen(null);
              setFocusMessage((n) => n + 1);
            }
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function PictureDetails({
  api,
  summary,
  tools,
  onClose,
  onChanged,
}: {
  readonly api: AdminApi;
  readonly summary: PictureSummary;
  readonly tools: ImageTools;
  readonly onClose: () => void;
  readonly onChanged: (message: string, deleted: boolean) => void;
}) {
  const [detail, setDetail] = useState<PictureDetail | null>(null);
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [textFree, setTextFree] = useState(false);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Opening a picture puts its details below the grid: move focus there, so the operator lands on what opened.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let live = true;
    let url: string | null = null;
    api.getPicture(summary.id).then(
      (got) => {
        if (!live) return;
        setDetail(got);
        if (got.pngBase64 !== undefined) {
          try {
            url = tools.preview(base64ToBlob(got.pngBase64));
            setDraftUrl(url);
          } catch {
            setError("This draft's picture couldn't be shown.");
          }
        }
      },
      (failure: unknown) => live && setError(pictureError(failure)),
    );
    return () => {
      live = false;
      if (url !== null) tools.release(url);
    };
  }, [api, summary.id, tools]);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.approvePicture(summary.id, { textFree: true });
      onChanged(`"${saved.picture.name}" is approved and in My pictures.`, false);
    } catch (failure) {
      setError(pictureError(failure));
    } finally {
      setBusy(false);
    }
  }

  const src = summary.url ?? draftUrl;
  const usedBy = detail?.usedBy ?? [];
  return (
    <section className="picture-details" aria-label={`Picture: ${summary.name}`}>
      <h3 ref={headingRef} tabIndex={-1}>
        {summary.name}
      </h3>
      <div className="picture-review">
        {src !== null ? <img className="picture-preview" src={src} alt={summary.name} {...previewSize(pictureKindOf(summary.kind))} /> : <span className="thumb empty picture-preview" aria-hidden="true" />}
        <div className="picture-review-form">
          <p>
            {pictureKindLabel(pictureKindOf(summary.kind))}
            {isActivityPictureKind(pictureKindOf(summary.kind)) ? "" : " (not used in the game yet)"}
          </p>
          <p>
            {STATE_LABEL[summary.state]} · {SOURCE_LABEL[summary.source]}
            {detail?.picture.description !== undefined && <> · asked for “{detail.picture.description}”</>}
          </p>
          <p className="muted">ID: {summary.id}</p>
          {detail !== null && (
            <p>
              {usedBy.length === 0 ? (
                "No activity or level uses it."
              ) : (
                <>
                  Used by:{" "}
                  {usedBy.map((id, i) => (
                    <span key={id}>
                      {i > 0 && ", "}
                      {id.startsWith("level:") ? (
                        // "level:<id>" is a draft; "level:<id>@<version>" a published version (LD6), which keeps it for good.
                        <a href={hrefOf({ page: "level", id: (id.slice("level:".length).split("@")[0] ?? "") })}>
                          level {id.slice("level:".length).replace("@", ", published as ")}
                        </a>
                      ) : (
                        <a href={hrefOf({ page: "activity", id })}>{id}</a>
                      )}
                    </span>
                  ))}
                </>
              )}
            </p>
          )}
          <div role="status">{error !== null && <p className="error">{error}</p>}</div>
          {summary.state === "DRAFT" && (
            <>
              <TextFreeTick checked={textFree} onChange={setTextFree} />
              <p className="actions">
                <button type="button" className="primary" disabled={busy || !textFree} onClick={() => void approve()}>
                  Approve
                </button>
              </p>
            </>
          )}
          <p className="actions">
            <button type="button" onClick={onClose}>
              Close
            </button>
          </p>
          <DeletePicture api={api} picture={summary} onDeleted={(done) => onChanged(done, true)} />
        </div>
      </div>
    </section>
  );
}

function DeletePicture({ api, picture, onDeleted }: { readonly api: AdminApi; readonly picture: PictureSummary; readonly onDeleted: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [users, setUsers] = useState<string[]>([]);
  const headingId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  useFocusReturn(open, triggerRef);
  const approved = picture.state === "APPROVED";

  async function confirm() {
    setBusy(true);
    setMessage(null);
    setUsers([]);
    try {
      await api.deletePicture(picture.id);
      onDeleted(`"${picture.name}" deleted.`);
    } catch (error) {
      if (error instanceof ApiError && error.code === "NOT_FOUND") {
        onDeleted(`"${picture.name}" was already deleted.`);
        return;
      }
      setBusy(false);
      setOpen(false);
      const using = pictureUsers(error);
      setUsers(using);
      setMessage(using.length > 0 ? null : pictureError(error));
    }
  }

  return (
    <section className="danger-zone" aria-label="Delete picture">
      <button type="button" className="danger" ref={triggerRef} onClick={() => setOpen(true)} disabled={busy}>
        Delete picture
      </button>
      <div role="status">
        {users.length > 0 && (
          <div className="error">
            <p>
              “{picture.name}” can't be deleted: {users.length === 1 ? "this activity uses it" : `these ${users.length} activities use it`}. Change or
              delete {users.length === 1 ? "it" : "them"} first. A published activity keeps its pictures in every version until the activity itself
              is deleted.
            </p>
            <ul>
              {users.map((id) => (
                <li key={id}>
                  <a href={hrefOf({ page: "activity", id })}>{id}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {message !== null && <p className="error">{message}</p>}
      </div>
      {open && (
        <ConfirmDialog labelledBy={headingId} onCancel={() => !busy && setOpen(false)}>
          {(cancelRef) => (
            <>
              <h3 id={headingId}>Delete “{picture.name}”?</h3>
              <p>{approved ? "This removes the picture from the library and from the websites." : "This removes the draft picture."}</p>
              <p>
                <strong>This cannot be undone.</strong>
              </p>
              {approved && <p className="muted">If any activity uses this picture, in its draft or in any published version, nothing is deleted and you get the list of those activities.</p>}
              <p className="dialog-actions">
                <button type="button" ref={cancelRef} onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="button" className="danger" onClick={() => void confirm()} disabled={busy}>
                  {busy ? "Deleting…" : "Delete picture"}
                </button>
              </p>
            </>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
