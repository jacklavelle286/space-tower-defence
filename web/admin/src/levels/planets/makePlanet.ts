// Make a planet for me (Gate M, LD20; owner 2026-11-19): a theme ("fire", "ice crystals") gives a suggested name, the
// descriptions its icon and backdrop are drawn from, and the drawing runs themselves (R38 start, R39 follow, the SVG
// made into a PNG of the kind's size as the Pictures page does). Every drawing is approved by a person with the
// "no letters, numbers or words" tick before it is kept (R34 with approve); nothing here approves on its own.
import type { PictureKindId } from "@scd/shared";
import { ApiError, type AdminApi } from "../../api";
import { capMessage, capPeriod, capsFromError, clock, jobFailureMessage, pictureError, pollDelay, tidyText } from "../../pictures/messages";
import { blobToBase64, browserTools, renderSvg, type ImageTools } from "../../pictures/normalise";

export const THEME_MAX = 40;

/** A theme as it is used: one line, 3 to 40 characters, no < or >. */
export function themeOk(theme: string): boolean {
  const t = tidyText(theme);
  return t.length >= 3 && t.length <= THEME_MAX && !/[<>]/u.test(t);
}

/** "ice crystals" -> "Ice Crystals Planet" (at most 40 characters). */
export function suggestName(theme: string): string {
  const words = tidyText(theme)
    .split(" ")
    .filter((w) => w !== "")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  const name = words.join(" ");
  return (/planet|world$/iu.test(name) ? name : `${name} Planet`).slice(0, 40).trim();
}

/** What the icon (the planet on Home) and the backdrop (the ground its maps sit on) are drawn from. Both stay within
 * the drawing's 200 characters for a theme of up to 40. The backdrop asks for nothing a child could take for a path,
 * a pad or an alien (the Publish tab's hand ticks). */
export function iconDescription(theme: string): string {
  return `A round ${tidyText(theme)} planet floating in space, bright friendly colours, simple shapes`;
}
export function backdropDescription(theme: string): string {
  return `The ground of a ${tidyText(theme)} planet seen from above, soft colours, gentle texture only, no paths, no creatures, no buildings`;
}

export type DrawStep = (text: string) => void;

export interface Drawing {
  readonly jobId: string;
  readonly kind: PictureKindId;
  readonly png: Blob;
}

export interface DrawRun {
  readonly done: Promise<Drawing>;
  cancel(): void;
}

export interface DrawTools {
  readonly tools?: ImageTools;
  readonly delay?: (elapsedMs: number) => number;
  readonly wait?: (ms: number) => Promise<void>;
  readonly newJobId?: () => string;
  readonly now?: () => number;
}

/** Why a drawing could not start, in the Pictures page's words (the caps, drawing switched off, a refused kind). */
export function startError(error: unknown): string {
  if (error instanceof ApiError && error.code === "PICTURE_CAP_REACHED") return capMessage(capPeriod(error), capsFromError(error));
  return pictureError(error);
}

/** Draws one picture: start the job, follow it until it is ready, and make its PNG. Rejects with the reason to show,
 * or "cancelled". */
export function drawPicture(api: Pick<AdminApi, "startPictureJob" | "getPictureJob">, kind: PictureKindId, description: string, onStep: DrawStep, options: DrawTools = {}): DrawRun {
  const { tools = browserTools, delay = pollDelay, wait = (ms) => new Promise((r) => setTimeout(r, ms)), newJobId = () => crypto.randomUUID(), now = () => Date.now() } = options;
  let cancelled = false;
  const stop = (): void => {
    if (cancelled) throw new Error("cancelled");
  };
  const jobId = newJobId();
  const done = (async (): Promise<Drawing> => {
    onStep("Waiting to start…");
    try {
      await api.startPictureJob({ jobId, description, kind });
    } catch (error) {
      throw new Error(startError(error), { cause: error });
    }
    const started = now();
    for (;;) {
      await wait(delay(now() - started));
      stop();
      const job = await api.getPictureJob(jobId);
      stop();
      if (job.state === "QUEUED") onStep("Waiting to start…");
      else if (job.state === "DRAWING") onStep(`${job.phase === "thinking" ? "Thinking" : "Drawing"}… ${clock(job.elapsedSeconds ?? Math.round((now() - started) / 1000))}`);
      else if (job.state === "FAILED") throw new Error(jobFailureMessage(job.error));
      else {
        try {
          return { jobId, kind, png: await renderSvg(job.svg, tools, kind) };
        } catch (error) {
          throw new Error(jobFailureMessage("unusable"), { cause: error });
        }
      }
    }
  })();
  return {
    done,
    cancel: () => {
      cancelled = true;
    },
  };
}

/** Keeps an approved drawing in the library (R34; the person ticked "no letters, numbers or words"); its picture ID. */
export async function keepDrawing(api: Pick<AdminApi, "createPicture">, drawing: Drawing, name: string): Promise<string> {
  const saved = await api.createPicture({ name: name.slice(0, 40), source: "GENERATED", jobId: drawing.jobId, pngBase64: await blobToBase64(drawing.png), approve: true, textFree: true });
  // The same pixels already stored as a draft come back as that draft (duplicate), not approved.
  if (saved.picture.state !== "APPROVED") throw new Error("That picture is already in the library as a draft: approve it on the Pictures page, or draw again.");
  return saved.picture.id;
}
