// Pictures (Phases 42a and 42b): the operator's picture library. Three tabs: Upload (42a), Draw with Claude (42b) and
// Library (drafts and approved, with Delete). Approved pictures appear in the activity editor's picture picker under
// "My pictures". R33 gives the library, the drawing usage (daily and monthly caps) and the open drawing jobs.
//
// Every tab stays mounted while the page is open, so a drawing keeps its card (and keeps being followed) while the
// operator looks at another tab.
import { useCallback, useEffect, useState } from "react";
import type { AdminApi, PictureList, PictureUsage } from "../api";
import { DrawPicture } from "../pictures/DrawPicture";
import { pictureError, usageText } from "../pictures/messages";
import type { ImageTools } from "../pictures/normalise";
import { PictureLibrary } from "../pictures/PictureLibrary";
import { UploadPicture } from "../pictures/UploadPicture";
import { hrefOf, PICTURE_TABS, type PictureTab } from "../routes";

type Props = {
  readonly api: AdminApi;
  readonly tab: PictureTab;
  /** Test seams: a fake canvas, no wait between polls, fixed job IDs. */
  readonly tools?: ImageTools;
  readonly delay?: (elapsedMs: number) => number;
  readonly newJobId?: () => string;
};

const TAB_LABEL: Record<PictureTab, string> = { upload: "Upload", draw: "Draw with Claude", library: "Library" };

/** R33's open jobs, less any a library picture was already saved from (admin-api leaves those out too; this also
 * covers a list read just before a save). */
function openJobsWithoutPictures(list: PictureList): PictureList["openJobs"] {
  const saved = new Set(list.pictures.map((p) => p.jobId).filter((id): id is string => id !== undefined));
  return list.openJobs.filter((job) => !saved.has(job.jobId));
}

export function PicturesPage({ api, tab, tools, delay, newJobId }: Props) {
  const [list, setList] = useState<PictureList | null>(null);
  const [usage, setUsage] = useState<PictureUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api.listPictures().then(
      (got) => {
        setList(got);
        setUsage(got.generation);
        setError(null);
      },
      (failure: unknown) => setError(pictureError(failure)),
    );
  }, [api]);

  useEffect(reload, [reload]);

  const optional = {
    ...(tools !== undefined ? { tools } : {}),
  };

  return (
    <section className="pictures">
      <h2>Pictures</h2>
      <p className="muted">
        Pictures for activities. Approved pictures appear in the activity editor under “My pictures”.
        {usage !== null && ` Drawings: ${usageText(usage)}.`}
      </p>
      <nav aria-label="Picture tabs" className="tabs">
        <ul>
          {PICTURE_TABS.map((t) => (
            <li key={t}>
              <a href={hrefOf({ page: "pictures", tab: t })} aria-current={t === tab ? "page" : undefined}>
                {TAB_LABEL[t]}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {error !== null && (
        <p className="error" role="alert">
          {error}{" "}
          <button type="button" onClick={reload}>
            Try again
          </button>
        </p>
      )}
      {list === null ? (
        error === null && <p>Loading…</p>
      ) : (
        <>
          <div hidden={tab !== "upload"}>
            <UploadPicture api={api} onSaved={reload} {...optional} />
          </div>
          <div hidden={tab !== "draw"}>
            <DrawPicture
              api={api}
              usage={usage}
              openJobs={openJobsWithoutPictures(list)}
              onUsage={setUsage}
              onChanged={reload}
              {...optional}
              {...(delay !== undefined ? { delay } : {})}
              {...(newJobId !== undefined ? { newJobId } : {})}
            />
          </div>
          <div hidden={tab !== "library"}>
            <PictureLibrary api={api} pictures={list.pictures} onChanged={reload} {...optional} />
          </div>
        </>
      )}
    </section>
  );
}
