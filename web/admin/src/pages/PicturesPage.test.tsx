// @vitest-environment jsdom
// Pictures (Phases 42a and 42b) against a fake AdminApi and a fake canvas.
// Upload: only PNG or JPEG by its bytes, a preview, and Approve waits for the "no letters, numbers or words" tick.
// Draw with Claude: R38 with a client job ID, the progress card while R39 is polled, the browser's PNG of the SVG,
// one-click Approve (R34 GENERATED with approve), Try again with a change (previousJobId), Discard, the caps, failed
// drawings in plain words, "Use Chrome" when toBlob fails, and open jobs coming back after a reload.
// Library: filters, approving a draft, and Delete (refused while used, naming the activities).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeAdminApi } from "../testing/fakeApi";
import { FakeImages, fileWith, JPEG_MAGIC, PNG_MAGIC } from "../testing/images";
import { TEXT_FREE_LABEL } from "../pictures/TextFreeTick";
import type { PictureTab } from "../routes";
import { PicturesPage } from "./PicturesPage";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><circle cx="128" cy="128" r="60" fill="#f28c28"/></svg>';

let fake: FakeAdminApi;
let images: FakeImages;
let jobCount: number;

beforeEach(() => {
  window.localStorage.clear(); // discarded drawings are remembered in this browser
  fake = new FakeAdminApi();
  images = new FakeImages();
  jobCount = 0;
});
afterEach(cleanup);

const jobId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function openPage(tab: PictureTab, delay = 0) {
  render(
    <PicturesPage
      api={fake.api}
      tab={tab}
      tools={images.tools}
      delay={() => delay}
      newJobId={() => {
        jobCount += 1;
        return jobId(jobCount);
      }}
    />,
  );
  await waitFor(() => expect(fake.callsNamed("listPictures").length).toBeGreaterThan(0));
  await screen.findByRole("heading", { name: "Pictures" });
  await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
}

function pick(file: File) {
  fireEvent.change(screen.getByLabelText("Picture file"), { target: { files: [file] } });
}

describe("Upload", () => {
  it("says PNG or JPEG only, up to 5 MB, and refuses an SVG by its bytes", async () => {
    await openPage("upload");
    expect(screen.getByText(/PNG or JPEG only, up to 5 MB\. No SVG files\./u)).toBeTruthy();
    pick(fileWith([...'<svg xmlns="http://www.w3.org/2000/svg">'].map((c) => c.charCodeAt(0)), "kite.png"));
    expect(await screen.findByText(/^Only PNG or JPEG pictures/u)).toBeTruthy();
    expect(images.drawn).toEqual([]);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("previews the 256x256 picture; Add and approve waits for the tick, then sends R34 with approve", async () => {
    await openPage("upload");
    pick(fileWith(JPEG_MAGIC, "red_kite.jpg"));
    const preview = await screen.findByRole("img", { name: "The picture as it will be stored" });
    expect(preview.getAttribute("src")).toMatch(/^blob:/u);
    expect((screen.getByLabelText("Name (for the admin only)") as HTMLInputElement).value).toBe("red kite");
    const approve = screen.getByRole("button", { name: "Add and approve" }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(TEXT_FREE_LABEL));
    expect(approve.disabled).toBe(false);
    fireEvent.click(approve);
    expect(await screen.findByText('"red kite" is approved and in My pictures.')).toBeTruthy();
    expect(fake.callsNamed("createPicture").map((c) => c.args[0])).toEqual([{ name: "red kite", source: "UPLOAD", pngBase64: "(png)", approve: true, textFree: true }]);
    await waitFor(() => expect(fake.callsNamed("listPictures")).toHaveLength(2)); // the library is read again
  });

  it("can save a draft without the tick", async () => {
    await openPage("upload");
    pick(fileWith(PNG_MAGIC, "cat.png"));
    fireEvent.click(await screen.findByRole("button", { name: "Save as draft" }));
    expect(await screen.findByText('"cat" is saved as a draft.')).toBeTruthy();
    expect(fake.callsNamed("createPicture").map((c) => c.args[0])).toEqual([{ name: "cat", source: "UPLOAD", pngBase64: "(png)", approve: false, textFree: false }]);
  });

  it("says Use Chrome when the browser can't make the PNG", async () => {
    images.failToBlob = true;
    await openPage("upload");
    pick(fileWith(PNG_MAGIC, "cat.png"));
    expect(await screen.findByText(/^Use Chrome to add pictures/u)).toBeTruthy();
  });
});

describe("Draw with Claude", () => {
  function describeDrawing(text: string) {
    fireEvent.change(screen.getByLabelText("What should Claude draw?"), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Draw it" }));
  }

  it("shows the usage, starts a job with a client job ID, and follows it to a picture", async () => {
    fake.usage = { usedToday: 3, dailyCap: 100, usedMonth: 10, monthlyCap: 150 };
    await openPage("draw", 20);
    expect(screen.getAllByText(/97 of 100 left today · 140 of 150 left this month/u).length).toBeGreaterThan(0);
    fake.jobScripts.set(jobId(1), [{ state: "DRAWING", phase: "thinking", elapsedSeconds: 42 }]);
    describeDrawing("a smiling orange fox");
    expect(fake.callsNamed("startPictureJob").map((c) => c.args[0])).toEqual([{ jobId: jobId(1), description: "a smiling orange fox" }]);
    const card = await screen.findByRole("article", { name: "Drawing: a smiling orange fox" });
    expect(await within(card).findByText("Claude is thinking…")).toBeTruthy();
    expect(screen.getAllByText(/96 of 100 left today · 139 of 150 left this month/u).length).toBeGreaterThan(0);
    fake.jobScripts.set(jobId(1), [{ state: "DRAWING", phase: "drawing", elapsedSeconds: 80 }]);
    expect(await within(card).findByText("Drawing…")).toBeTruthy();
    // The live region holds the step only; the clock ticks outside it, from this browser's own clock.
    const live = within(card).getByRole("status");
    expect(live.textContent).toBe("Drawing…");
    expect(within(card).getByText("Time so far:", { exact: false }).closest("[role=status]")).toBeNull();
    fake.jobScripts.set(jobId(1), [{ state: "READY", svg: SVG, warnings: [] }]);
    const picture = await within(card).findByRole("img", { name: "Claude's drawing of a smiling orange fox" });
    expect(picture.getAttribute("src")).toMatch(/^blob:fake\//u);
    expect(images.decodedSvgs).toEqual([SVG]);
    // The SVG itself never enters the page: only the PNG made from it, through an <img>.
    expect(document.querySelector("svg circle")).toBeNull();
  });

  it("Approve needs the tick, then one click stores and approves the drawing (R34 GENERATED)", async () => {
    fake.nextJobScripts.push([{ state: "READY", svg: SVG }]);
    await openPage("draw");
    describeDrawing("a red kite");
    const card = await screen.findByRole("article", { name: "Drawing: a red kite" });
    const approve = (await within(card).findByRole("button", { name: "Approve" })) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.click(within(card).getByLabelText(TEXT_FREE_LABEL));
    fireEvent.click(approve);
    expect(await within(card).findByText('"A red kite" is approved and in My pictures.')).toBeTruthy();
    expect(fake.callsNamed("createPicture").map((c) => c.args[0])).toEqual([
      { name: "A red kite", source: "GENERATED", jobId: jobId(1), pngBase64: "(png)", approve: true, textFree: true },
    ]);
  });

  it("Try again with a change starts a new job from this drawing; Discard closes the card", async () => {
    fake.nextJobScripts.push([{ state: "READY", svg: SVG }], [{ state: "READY", svg: SVG }]);
    await openPage("draw");
    describeDrawing("a red kite");
    let card = await screen.findByRole("article", { name: "Drawing: a red kite" });
    fireEvent.click(await within(card).findByRole("button", { name: "Try again with a change" }));
    fireEvent.change(within(card).getByLabelText("What should change?"), { target: { value: "make it blue" } });
    fireEvent.click(within(card).getByRole("button", { name: "Draw it again with this change" }));
    expect(fake.callsNamed("startPictureJob").map((c) => c.args[0])).toEqual([
      { jobId: jobId(1), description: "a red kite" },
      { jobId: jobId(2), description: "a red kite", previousJobId: jobId(1), change: "make it blue" },
    ]);
    card = await screen.findByRole("article", { name: "Drawing: a red kite" });
    expect(within(card).getByText("Change: make it blue")).toBeTruthy();
    fireEvent.click(await within(card).findByRole("button", { name: "Discard" }));
    expect(screen.queryByRole("article")).toBeNull();
    expect(fake.callsNamed("createPicture")).toEqual([]);
  });

  it("words a failed drawing and offers Try again without the old drawing", async () => {
    fake.nextJobScripts.push([{ state: "FAILED", error: "declined" }]);
    await openPage("draw");
    describeDrawing("something odd");
    const card = await screen.findByRole("article", { name: "Drawing: something odd" });
    expect(await within(card).findByText("Claude wouldn't draw that. Try different words.")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
    expect(fake.callsNamed("startPictureJob").map((c) => c.args[0])).toEqual([
      { jobId: jobId(1), description: "something odd" },
      { jobId: jobId(2), description: "something odd" },
    ]);
  });

  it("says Use Chrome for drawing when toBlob fails", async () => {
    images.failToBlob = true;
    fake.nextJobScripts.push([{ state: "READY", svg: SVG }]);
    await openPage("draw");
    describeDrawing("a red kite");
    const card = await screen.findByRole("article", { name: "Drawing: a red kite" });
    expect(await within(card).findByText(/^Use Chrome for drawing/u)).toBeTruthy();
  });

  it("shows the cap's 429 in words and turns Draw it off when the usage says the cap is reached", async () => {
    fake.usage = { usedToday: 99, dailyCap: 100, usedMonth: 99, monthlyCap: 150 };
    fake.nextJobScripts.push([{ state: "DRAWING", phase: "thinking" }]);
    await openPage("draw", 50);
    describeDrawing("a red kite");
    await screen.findByRole("article", { name: "Drawing: a red kite" });
    await waitFor(() => expect((screen.getByRole("button", { name: "Draw it" }) as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByText("You've drawn 100 pictures today. You can draw more tomorrow.")).toBeTruthy();
  });

  it("a 429 from R38 is shown on the card, with no Try again", async () => {
    await openPage("draw");
    fake.usage = { usedToday: 100, dailyCap: 100, usedMonth: 100, monthlyCap: 150 }; // another tab used the rest
    describeDrawing("a red kite");
    const card = await screen.findByRole("article", { name: "Drawing: a red kite" });
    expect(await within(card).findByText("You've drawn 100 pictures today. You can draw more tomorrow.")).toBeTruthy(); // the caps come from the 429 details
    expect(within(card).queryByRole("button", { name: "Try again" })).toBeNull();
    await waitFor(() => expect(fake.callsNamed("listPictures")).toHaveLength(2)); // the usage is read again
  });

  it("tidies spaces and new lines in the description and the change note instead of turning the button off", async () => {
    fake.nextJobScripts.push([{ state: "READY", svg: SVG }]);
    await openPage("draw");
    fireEvent.change(screen.getByLabelText("What should Claude draw?"), { target: { value: "  a red\n kite \n" } });
    expect(screen.getByText(/Extra spaces and new lines are tidied away/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Draw it" }));
    const card = await screen.findByRole("article", { name: "Drawing: a red kite" });
    fireEvent.click(await within(card).findByRole("button", { name: "Try again with a change" }));
    fireEvent.change(within(card).getByLabelText("What should change?"), { target: { value: "make it blue \n" } });
    fireEvent.click(within(card).getByRole("button", { name: "Draw it again with this change" }));
    expect(fake.callsNamed("startPictureJob").map((c) => c.args[0])).toEqual([
      { jobId: jobId(1), description: "a red kite" },
      { jobId: jobId(2), description: "a red kite", previousJobId: jobId(1), change: "make it blue" },
    ]);
  });

  it("says drawing is switched off when admin-api says drawingOn is false (no queue), even with caps left", async () => {
    fake.usage = { usedToday: 0, dailyCap: 100, usedMonth: 0, monthlyCap: 150, drawingOn: false };
    await openPage("draw");
    expect(screen.getAllByText(/Drawing is switched off/u).length).toBeGreaterThan(0);
    expect(screen.queryByText(/100 of 100 left today/u)).toBeNull();
    fireEvent.change(screen.getByLabelText("What should Claude draw?"), { target: { value: "a red kite" } });
    expect((screen.getByRole("button", { name: "Draw it" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("moves focus to the saved message, and after Discard to the next card or the description box", async () => {
    fake.nextJobScripts.push([{ state: "READY", svg: SVG }], [{ state: "READY", svg: SVG }]);
    await openPage("draw");
    describeDrawing("a red kite");
    describeDrawing("a blue boat");
    const boat = await screen.findByRole("article", { name: "Drawing: a blue boat" });
    const kite = await screen.findByRole("article", { name: "Drawing: a red kite" });
    fireEvent.click(await within(boat).findByRole("button", { name: "Discard" }));
    await waitFor(() => expect(document.activeElement).toBe(within(kite).getByRole("heading")));
    fireEvent.click(await within(kite).findByRole("button", { name: "Save as draft" }));
    const saved = await within(kite).findByText('"A red kite" is saved as a draft.');
    await waitFor(() => expect(document.activeElement).toBe(saved));
    fireEvent.click(within(kite).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("What should Claude draw?")));
  });

  it("a discarded drawing does not come back when the page is opened again", async () => {
    fake.openJobs = [
      { jobId: jobId(8), description: "a green frog", state: "READY", startedAt: "2026-11-16T10:00:00Z" },
      { jobId: jobId(9), description: "a pink pig", state: "READY", startedAt: "2026-11-16T10:00:00Z" },
    ];
    fake.jobScripts.set(jobId(8), [{ state: "READY", svg: SVG }]);
    fake.jobScripts.set(jobId(9), [{ state: "READY", svg: SVG }]);
    await openPage("draw");
    const frog = await screen.findByRole("article", { name: "Drawing: a green frog" });
    fireEvent.click(await within(frog).findByRole("button", { name: "Discard" }));
    cleanup();
    await openPage("draw");
    expect(await screen.findByRole("article", { name: "Drawing: a pink pig" })).toBeTruthy();
    expect(screen.queryByRole("article", { name: "Drawing: a green frog" })).toBeNull();
  });

  it("an open job a library picture was saved from does not come back as a card", async () => {
    const saved = fake.seedPicture("Frog", "APPROVED", "GENERATED");
    const stored = fake.pictures.get(saved.id);
    if (stored !== undefined) fake.pictures.set(saved.id, { ...stored, jobId: jobId(8) });
    fake.openJobs = [{ jobId: jobId(8), description: "a green frog", state: "READY", startedAt: "2026-11-16T10:00:00Z" }];
    await openPage("draw");
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("says drawing is switched off when a cap is 0", async () => {
    fake.usage = { usedToday: 0, dailyCap: 0, usedMonth: 0, monthlyCap: 150 };
    await openPage("draw");
    expect(screen.getAllByText(/Drawing is switched off/u).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("What should Claude draw?"), { target: { value: "a red kite" } });
    expect((screen.getByRole("button", { name: "Draw it" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("brings back an open job after a reload, without starting it again", async () => {
    fake.openJobs = [{ jobId: jobId(9), description: "a green frog", state: "READY", startedAt: "2026-11-16T10:00:00Z" }];
    fake.jobScripts.set(jobId(9), [{ state: "READY", svg: SVG }]);
    await openPage("draw");
    const card = await screen.findByRole("article", { name: "Drawing: a green frog" });
    expect(await within(card).findByRole("img", { name: "Claude's drawing of a green frog" })).toBeTruthy();
    expect(fake.callsNamed("startPictureJob")).toEqual([]);
  });
});

describe("Library", () => {
  it("lists drafts and approved pictures, and filters them", async () => {
    fake.seedPicture("Fox");
    fake.seedPicture("Kite draft", "DRAFT", "GENERATED");
    await openPage("library");
    expect(screen.getByText("2 of 2 pictures. Only approved pictures can go in activities.", { exact: false })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "DRAFT" } });
    expect(screen.getByRole("button", { name: "Kite draft (Draft)" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fox (Approved)" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "UPLOAD" } });
    expect(screen.getByRole("button", { name: "Fox (Approved)" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Kite draft (Draft)" })).toBeNull();
  });

  it("approves a draft only with the tick", async () => {
    const draft = fake.seedPicture("Kite draft", "DRAFT", "GENERATED");
    await openPage("library");
    fireEvent.click(screen.getByRole("button", { name: "Kite draft (Draft)" }));
    const details = await screen.findByRole("region", { name: "Picture: Kite draft" });
    expect(document.activeElement).toBe(within(details).getByRole("heading", { name: "Kite draft" })); // focus follows
    expect(await within(details).findByRole("img", { name: "Kite draft" })).toBeTruthy(); // R35's PNG through a blob: URL
    const approve = within(details).getByRole("button", { name: "Approve" }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.click(within(details).getByLabelText(TEXT_FREE_LABEL));
    fireEvent.click(approve);
    expect(await screen.findByText('"Kite draft" is approved and in My pictures.')).toBeTruthy();
    expect(fake.callsNamed("approvePicture").map((c) => c.args)).toEqual([[draft.id, { textFree: true }]]);
  });

  it("refuses to delete a picture an activity uses, naming the activities as links", async () => {
    const fox = fake.seedPicture("Fox");
    fake.pictureUsers[fox.id] = ["ph-0102", "ma-0101"];
    await openPage("library");
    fireEvent.click(screen.getByRole("button", { name: "Fox (Approved)" }));
    const details = await screen.findByRole("region", { name: "Picture: Fox" });
    expect(await within(details).findByRole("link", { name: "ph-0102" })).toBeTruthy(); // R35's usedBy
    fireEvent.click(within(details).getByRole("button", { name: "Delete picture" }));
    const dialog = screen.getByRole("dialog", { name: "Delete “Fox”?" });
    expect(dialog.textContent).toContain("from the websites");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete picture" }));
    const zone = within(details).getByRole("region", { name: "Delete picture" });
    expect(await within(zone).findByText(/can't be deleted: these 2 activities use it/u)).toBeTruthy();
    expect(within(zone).getByRole("link", { name: "ma-0101" }).getAttribute("href")).toBe("#activities/ma-0101");
    expect(fake.pictures.has(fox.id)).toBe(true);
  });

  it("deletes an unused picture after the confirm", async () => {
    const fox = fake.seedPicture("Fox");
    await openPage("library");
    fireEvent.click(screen.getByRole("button", { name: "Fox (Approved)" }));
    const details = await screen.findByRole("region", { name: "Picture: Fox" });
    await within(details).findByText("No activity uses it.");
    fireEvent.click(within(details).getByRole("button", { name: "Delete picture" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete “Fox”?" })).getByRole("button", { name: "Delete picture" }));
    const done = await screen.findByText('"Fox" deleted.');
    await waitFor(() => expect(document.activeElement).toBe(done)); // the details and their button are gone
    expect(fake.callsNamed("deletePicture").map((c) => c.args)).toEqual([[fox.id]]);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Fox (Approved)" })).toBeNull());
  });
});
