// Plain words for the picture pages: refusals from admin-api (R34-R38), why a drawing failed (R39), and how many
// drawings are left. Anything else falls back to the shared wording (api.ts describeError).

import { ApiError, describeError, type PictureUsage } from "../api";

const RULES: Readonly<Record<string, string>> = {
  not_png: "The picture couldn't be read as a PNG. Try again in Chrome.",
  png_shape: "The picture wasn't a 256 by 256 PNG. Try again in Chrome.",
  blank: "The picture is empty (completely see-through). Try another picture.",
  not_text_free: 'Tick "No letters, numbers or words in this picture" first.',
  picture_not_approved: "This picture isn't approved yet.",
  job_used: "A different picture has already been saved from this drawing.",
};

/** Words for a failed R34, R35, R36 or R37 call. */
export function pictureError(error: unknown): string {
  if (error instanceof ApiError && error.code === "VALIDATION_FAILED") {
    const known = error.details.map((p) => RULES[p.rule]).filter((m): m is string => m !== undefined);
    if (known.length > 0) return [...new Set(known)].join(" ");
    if (error.details.some((p) => p.field === "name")) return "The name must be 1 to 40 characters, without < or >.";
  }
  return describeError(error);
}

/** The two caps, from R33/R38's usage or from R38's 429 details, and admin-api's own verdict when it sent one. */
export type PictureCaps = Pick<PictureUsage, "dailyCap" | "monthlyCap" | "drawingOn">;

/** True when drawing is switched off: admin-api says so (`drawingOn: false`, which also covers an environment with
 * no queue), or either cap is 0. */
export function drawingOff(usage: PictureCaps | null): boolean {
  return usage !== null && (usage.drawingOn === false || usage.dailyCap <= 0 || usage.monthlyCap <= 0);
}

/** Which cap is used up, if any. */
export function capReached(usage: PictureUsage | null): "day" | "month" | null {
  if (usage === null) return null;
  if (usage.usedMonth >= usage.monthlyCap) return "month";
  if (usage.usedToday >= usage.dailyCap) return "day";
  return null;
}

/** "17 of 100 left today · 140 of 150 left this month". */
export function usageText(usage: PictureUsage): string {
  if (drawingOff(usage)) return "Drawing is switched off.";
  const today = Math.max(0, usage.dailyCap - usage.usedToday);
  const month = Math.max(0, usage.monthlyCap - usage.usedMonth);
  return `${today} of ${usage.dailyCap} left today · ${month} of ${usage.monthlyCap} left this month`;
}

/** The words for a cap that is reached: R38's 429, or a cap the usage already shows as used up. */
export function capMessage(period: "day" | "month" | "off" | null, usage: PictureCaps | null): string {
  if (period === "off" || drawingOff(usage)) return "Drawing is switched off.";
  if (period === "month") {
    const cap = usage === null ? "all the" : String(usage.monthlyCap);
    return `You've drawn ${cap} pictures this month. You can draw more next month.`;
  }
  const cap = usage === null ? "all the" : String(usage.dailyCap);
  return `You've drawn ${cap} pictures today. You can draw more tomorrow.`;
}

/** The period of R38's 429 PICTURE_CAP_REACHED (details `{period: "day"|"month"|"off", resetsAt?, dailyCap,
 * monthlyCap}`), or null for any other error. "off" means a cap is 0 (or no queue): drawing is switched off. */
export function capPeriod(error: unknown): "day" | "month" | "off" | null {
  if (!(error instanceof ApiError) || error.code !== "PICTURE_CAP_REACHED") return null;
  const period = error.info["period"];
  return period === "month" || period === "off" ? period : "day";
}

/** The caps R38's 429 names in its details, or null when they are missing. */
export function capsFromError(error: unknown): PictureCaps | null {
  if (!(error instanceof ApiError)) return null;
  const { dailyCap, monthlyCap } = error.info;
  return typeof dailyCap === "number" && typeof monthlyCap === "number" ? { dailyCap, monthlyCap } : null;
}

/** Why a drawing failed (R39 FAILED `error`), in words that say what to do next. */
export function jobFailureMessage(code: string): string {
  switch (code) {
    case "declined":
      return "Claude wouldn't draw that. Try different words.";
    case "too_long":
      return "The drawing got too complicated. Try a simpler description.";
    case "unusable":
      return "Claude's drawing couldn't be used safely. Press Try again.";
    case "expired":
      return "This drawing is too old to use now. Press Try again.";
    case "could_not_start":
      return "The drawing couldn't start (it wasn't counted). Press Try again.";
    default:
      return "That didn't finish. Press Try again."; // timed_out, bedrock_error, throttled and anything new
  }
}

/** "0:42", "1:20". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** How long to wait before asking about a job again: every 3 s, then every 5 s after the first minute. */
export function pollDelay(elapsedMs: number): number {
  return elapsedMs < 60_000 ? 3000 : 5000;
}

/** A description or change note as it is sent: runs of spaces and new lines become one space, and the ends are
 * trimmed, so a trailing space or a press of Enter never turns the button off silently. */
export function tidyText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A drawing description as R38 accepts it: 3-200 characters of plain text (check the tidied text). */
export function descriptionOk(text: string, low = 3, high = 200): boolean {
  return (
    text.length >= low &&
    text.length <= high &&
    text === text.trim() &&
    ![...text].some((ch) => ch === "<" || ch === ">" || ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)
  );
}
