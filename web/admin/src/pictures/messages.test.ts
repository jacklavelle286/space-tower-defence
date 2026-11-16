// The words the operator reads on the Pictures page: usage, caps, failed drawings, refusals, and the poll timing.
import { describe, expect, it } from "vitest";
import { ApiError } from "../api";
import { capMessage, capPeriod, capReached, capsFromError, clock, descriptionOk, drawingOff, jobFailureMessage, pictureError, pollDelay, tidyText, usageText, weightMessage } from "./messages";

const usage = (usedToday: number, usedMonth: number, dailyCap = 100, monthlyCap = 150) => ({ usedToday, dailyCap, usedMonth, monthlyCap });

describe("picture messages", () => {
  it("shows what is left today and this month, and when a cap is reached", () => {
    expect(usageText(usage(3, 10))).toBe("97 of 100 left today · 140 of 150 left this month");
    expect(capReached(usage(99, 10))).toBeNull();
    expect(capReached(usage(100, 10))).toBe("day");
    expect(capReached(usage(5, 150))).toBe("month");
    expect(capMessage("day", usage(100, 120))).toBe("You've drawn 100 pictures today. You can draw more tomorrow.");
    expect(capMessage("month", usage(3, 150))).toBe("You've drawn 150 pictures this month. You can draw more next month.");
  });

  it("checks a heavier kind's weight against what is left (a background takes 3 places)", () => {
    expect(capReached(usage(97, 10), 3)).toBeNull(); // exactly fills the day
    expect(capReached(usage(98, 10), 3)).toBe("day");
    expect(capReached(usage(98, 10))).toBeNull(); // a lighter kind still fits
    expect(capReached(usage(5, 148), 3)).toBe("month");
    expect(weightMessage("day", 3)).toBe("This kind counts as 3 drawings, and fewer than 3 are left today. Choose another kind, or draw it tomorrow.");
    expect(weightMessage("month", 3)).toMatch(/left this month\. Choose another kind, or draw it next month\.$/u);
  });

  it("says drawing is switched off when either cap is 0", () => {
    expect(drawingOff(usage(0, 0, 0, 150))).toBe(true);
    expect(drawingOff(usage(0, 0, 100, 0))).toBe(true);
    expect(drawingOff(null)).toBe(false);
    expect(usageText(usage(0, 0, 0, 150))).toBe("Drawing is switched off.");
    expect(capMessage("day", usage(0, 0, 0, 150))).toBe("Drawing is switched off.");
  });

  it("says drawing is switched off when admin-api's drawingOn is false (no queue), whatever the caps", () => {
    expect(drawingOff({ ...usage(0, 0), drawingOn: false })).toBe(true);
    expect(drawingOff({ ...usage(0, 0), drawingOn: true })).toBe(false);
    expect(usageText({ ...usage(0, 0), drawingOn: false })).toBe("Drawing is switched off.");
  });

  it("words a second, different picture from the same drawing", () => {
    expect(pictureError(new ApiError(400, "VALIDATION_FAILED", [{ field: "jobId", rule: "job_used" }]))).toBe(
      "A different picture has already been saved from this drawing.",
    );
  });

  it("words an unknown kind and a kind that doesn't match the drawing (Gate P2)", () => {
    expect(pictureError(new ApiError(400, "VALIDATION_FAILED", [{ field: "kind", rule: "unknown_kind" }]))).toBe(
      "That kind of picture isn't known here. Reload the page and try again.",
    );
    expect(pictureError(new ApiError(400, "VALIDATION_FAILED", [{ field: "kind", rule: "kind_mismatch" }]))).toBe(
      "That drawing was made as a different kind of picture. Reload the page and try again.",
    );
    expect(pictureError(new ApiError(400, "VALIDATION_FAILED", [{ field: "kind", rule: "already_another_kind" }]))).toBe(
      "This picture is already in My pictures as a different kind. Find it in the library, or change the picture.",
    );
  });

  it("reads the period of R38's 429", () => {
    expect(capPeriod(new ApiError(429, "PICTURE_CAP_REACHED", [], { period: "month" }))).toBe("month");
    expect(capPeriod(new ApiError(429, "PICTURE_CAP_REACHED", [], { period: "day" }))).toBe("day");
    expect(capPeriod(new ApiError(429, "PICTURE_CAP_REACHED"))).toBe("day");
    expect(capPeriod(new ApiError(503, "THROTTLED"))).toBeNull();
    // admin-api's shape (api/shared/picture_admin.py): "off" when a cap is 0, and the caps beside the period.
    const off = new ApiError(429, "PICTURE_CAP_REACHED", [], { period: "off", dailyCap: 0, monthlyCap: 150 });
    expect(capPeriod(off)).toBe("off");
    expect(capMessage(capPeriod(off), capsFromError(off))).toBe("Drawing is switched off.");
    const day = new ApiError(429, "PICTURE_CAP_REACHED", [], { period: "day", resetsAt: "2026-11-17T00:00:00Z", dailyCap: 100, monthlyCap: 150 });
    expect(capMessage(capPeriod(day), capsFromError(day))).toBe("You've drawn 100 pictures today. You can draw more tomorrow.");
    expect(capsFromError(new ApiError(503, "THROTTLED"))).toBeNull();
  });

  it("words each drawing failure", () => {
    expect(jobFailureMessage("declined")).toBe("Claude wouldn't draw that. Try different words.");
    expect(jobFailureMessage("too_long")).toBe("The drawing got too complicated. Try a simpler description.");
    expect(jobFailureMessage("unusable")).toBe("Claude's drawing couldn't be used safely. Press Try again.");
    expect(jobFailureMessage("bad_request")).toBe("That kind of picture can't be drawn yet. Reload the page and try again.");
    for (const code of ["timed_out", "bedrock_error", "throttled", "something_new"]) expect(jobFailureMessage(code)).toBe("That didn't finish. Press Try again.");
  });

  it("words admin-api's picture refusals", () => {
    expect(pictureError(new ApiError(400, "VALIDATION_FAILED", [{ field: "pngBase64", rule: "not_png" }]))).toMatch(/PNG/u);
    expect(pictureError(new ApiError(400, "VALIDATION_FAILED", [{ field: "pngBase64", rule: "blank" }]))).toMatch(/empty/u);
    expect(pictureError(new ApiError(400, "VALIDATION_FAILED", [{ field: "textFree", rule: "not_text_free" }]))).toMatch(/^Tick/u);
    expect(pictureError(new ApiError(400, "VALIDATION_FAILED", [{ field: "name", rule: "length" }]))).toMatch(/1 to 40/u);
    expect(pictureError(new ApiError(413, "PAYLOAD_TOO_LARGE"))).toMatch(/too big/u);
  });

  it("polls every 3 s, then every 5 s after a minute; shows m:ss", () => {
    expect(pollDelay(0)).toBe(3000);
    expect(pollDelay(59_999)).toBe(3000);
    expect(pollDelay(60_000)).toBe(5000);
    expect(clock(42)).toBe("0:42");
    expect(clock(80.9)).toBe("1:20");
  });

  it("checks a description like R38 does", () => {
    expect(descriptionOk("a fox")).toBe(true);
    expect(descriptionOk("ab")).toBe(false);
    expect(descriptionOk(" a fox")).toBe(false);
    expect(descriptionOk("a <b> fox")).toBe(false);
    expect(descriptionOk("a".repeat(201))).toBe(false);
  });

  it("tidies spaces and new lines before the check, so a trailing space or Enter is not a silent refusal", () => {
    expect(tidyText("a smiling orange fox ")).toBe("a smiling orange fox");
    expect(tidyText(" a red\n\n kite\t")).toBe("a red kite");
    expect(descriptionOk(tidyText("a fox\n"))).toBe(true);
    expect(descriptionOk(tidyText("  ab  "))).toBe(false);
  });
});
