// @vitest-environment jsdom
// The Publish tab (Gate M, LD7): the buttons stay off until every automatic tick (saved, no problems, checks on this
// revision against live, server Validate) and every hand tick; Send to testers and Publish ask R49 with the live
// version as the source; a running publish is followed until done; refusals read as sentences.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, HAND_TICKS, type LevelPublish, type LevelReview } from "../../api";
import { FakeAdminApi } from "../../testing/fakeApi";
import { newLevel, REPO_BASE } from "../levelFile";
import { PublishStatus, PublishTab, refusalText } from "./PublishTab";

let fake: FakeAdminApi;
const level = newLevel("zigzag", "Zigzag", "zigzag");
const TESTED: LevelReview = { testPlayedDraftRevision: 0, sourceVersion: REPO_BASE.version, blocking: 0, warnings: 0 };

beforeEach(async () => {
  fake = new FakeAdminApi();
  await fake.api.createLevel(level);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function show(props: { review?: LevelReview; publish?: LevelPublish | null; dirty?: boolean; baseVersion?: string | null; released?: boolean } = {}) {
  const onView = vi.fn();
  render(
    <PublishTab
      api={fake.api}
      levelId="zigzag"
      level={level}
      draftRevision={0}
      review={props.review}
      dirty={props.dirty ?? false}
      blocked={false}
      baseVersion={props.baseVersion === undefined ? REPO_BASE.version : props.baseVersion}
      released={props.released ?? true}
      publish={props.publish ?? null}
      versions={[]}
      onView={onView}
    />,
  );
  return onView;
}

const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const tickAll = () => {
  for (const [, text] of HAND_TICKS) fireEvent.click(screen.getByRole("checkbox", { name: text }));
};

describe("PublishTab", () => {
  it("shows what changes against live, and keeps both buttons off without a test play", async () => {
    show();
    expect(screen.getByText("New map Zigzag")).toBeTruthy();
    await act(async () => button("Validate on the server").click());
    tickAll();
    expect(button("Send to testers").disabled).toBe(true);
    expect(button("Publish").disabled).toBe(true);
  });

  it("with every tick, Send to testers queues a preview from the live version", async () => {
    await fake.api.recordTestplay("zigzag", { draftRevision: 0, sourceVersion: REPO_BASE.version, blocking: 0, warnings: 0 });
    const onView = show({ review: TESTED });
    expect(button("Send to testers").disabled).toBe(true); // not validated yet
    await act(async () => button("Validate on the server").click());
    tickAll();
    await act(async () => button("Send to testers").click());
    expect(fake.callsNamed("publishLevel")[0]?.args[1]).toEqual({
      draftRevision: 0,
      sourceVersion: REPO_BASE.version,
      live: false,
      ticks: Object.fromEntries(HAND_TICKS.map(([k]) => [k, true])),
    });
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ publish: expect.objectContaining({ state: "QUEUED" }) }), false);
  });

  it("Publish asks first, then queues a live publish", async () => {
    await fake.api.recordTestplay("zigzag", { draftRevision: 0, sourceVersion: REPO_BASE.version, blocking: 0, warnings: 0 });
    show({ review: TESTED });
    await act(async () => button("Validate on the server").click());
    tickAll();
    act(() => button("Publish").click());
    expect(screen.getByRole("heading", { name: "Publish Zigzag for everyone?" })).toBeTruthy();
    const confirm = screen.getAllByRole("button", { name: "Publish" }).at(-1)!;
    await act(async () => confirm.click());
    expect((fake.callsNamed("publishLevel")[0]!.args[1] as { live: boolean }).live).toBe(true);
  });

  it("a check against an older live version, or no live version at all, keeps publishing off", async () => {
    show({ review: { ...TESTED, sourceVersion: "luna-1-c0" } });
    await act(async () => button("Validate on the server").click());
    tickAll();
    expect(button("Publish").disabled).toBe(true);
    cleanup();
    show({ review: TESTED, baseVersion: null });
    expect(screen.getByText(/publishing is off/u)).toBeTruthy();
  });

  it("a server refusal reads as a sentence", async () => {
    fake.validation = new ApiError(409, "PUBLISH_REFUSED", [], { code: "STALE_SOURCE", message: "m" });
    show({ review: TESTED });
    await act(async () => button("Validate on the server").click());
    expect(screen.getByRole("alert").textContent).toMatch(/live game changed after these checks/u);
  });

  it("follows a running publish until the level view says it is done", async () => {
    vi.useFakeTimers();
    const stored = fake.levels.get("zigzag")!;
    stored.publish = { draftRevision: 0, state: "DONE", campaignVersion: "luna-1-a1", live: true };
    const onView = show({ publish: { draftRevision: 0, state: "RUNNING" } });
    expect(screen.getByText(/the publisher is checking it/u)).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ publish: expect.objectContaining({ state: "DONE" }) }), true);
  });
});

describe("an unreleased planet (LD10)", () => {
  it("offers only Send to testers, and says why", () => {
    show({ review: TESTED, released: false, baseVersion: "mars-1-new" });
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(screen.getByRole("button", { name: "Send to testers" })).toBeTruthy();
    expect(screen.getByText(/not released yet: its versions are previews/u)).toBeTruthy();
    expect(screen.getByText(/its first version starts from this level, which must hold the 50-wave campaign/u)).toBeTruthy();
  });
});

describe("PublishStatus and refusalText", () => {
  it("says where the new version is", () => {
    render(<PublishStatus publish={{ draftRevision: 3, state: "DONE", campaignVersion: "luna-1-a4", live: true }} />);
    expect(screen.getByRole("status").textContent).toBe("luna-1-a4 is live for new games in about a minute (draft revision 3).");
    cleanup();
    render(<PublishStatus publish={{ draftRevision: 3, state: "DONE", campaignVersion: "luna-1-a4", live: false, liveRefused: "LIVE_MOVED" }} />);
    expect(screen.getByRole("status").textContent).toMatch(/it is a preview\. Make it live in Versions/u);
    cleanup();
    render(<PublishStatus publish={{ draftRevision: 3, state: "REFUSED", refusal: { code: "BANK_NOT_READY", message: "x" } }} />);
    expect(screen.getByRole("alert").textContent).toMatch(/not enough activities/u);
  });

  it("names an unknown code rather than hiding it", () => {
    expect(refusalText({ code: "SOMETHING_NEW", message: "details" })).toBe("The publisher refused (SOMETHING_NEW): details");
  });
});
