// @vitest-environment jsdom
// Phase 22 exit criteria, end to end on the client: the panel on a real run (fake server applying ops with the
// shared reducer), the real sync queue, the Play rule with a fake audio element and a fake speech service, and clip
// bytes in (fake) IndexedDB. A "refresh" throws away everything in memory and rebuilds from the server and the
// browser database, as a page reload would.
import { ClipPlayer, idbClipStore, openLocalDb } from "@scd/shared/audio";
import { FakeAudio, FakeSpeech, type AudioEvent } from "@scd/shared/audio/testing";
import { PANEL_COPY as COPY } from "@scd/shared/learning";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it } from "vitest";
import { press, tab } from "@scd/shared/learning/testing";
import { PROTOCOL_VERSION } from "../sync/protocol";
import { SyncQueue } from "../sync/queue";
import { AckTracker } from "./ackTracker";
import { ActivityPanel } from "./ActivityPanel";
import { loadRun } from "./loadRun";
import { SyncedRun } from "./syncedRun";
import { DEV_ACTIVITIES, PHASE38_ACTIVITIES } from "../dev/fakeRunServer";
import { apiFor, CLIP, RUN_ID, serverAtActivity, SESSION_ID, testGameData } from "./testing";

afterEach(cleanup);

type Setup = Awaited<ReturnType<typeof serverAtActivity>>;

/** One page load: everything in memory is new; only the server and the browser database carry over. */
async function pageLoad(setup: Setup, factory: IDBFactory, prepare?: (speech: FakeSpeech) => void) {
  const events: AudioEvent[] = [];
  const audio = new FakeAudio(events);
  const speech = new FakeSpeech(events);
  speech.serve("prompt", CLIP);
  prepare?.(speech);
  const db = await openLocalDb("test-sub", factory);
  if (db === null) throw new Error("no database");
  const player = new ClipPlayer({ requestSpeech: speech.requestSpeech, store: idbClipStore(db), output: audio, download: speech.download, online: () => true });
  const api = apiFor(setup.server);
  const tracker = new AckTracker();
  const queue = new SyncQueue({ transport: tracker.wrap(api), protocolVersion: PROTOCOL_VERSION });
  queue.setSession({ sessionId: SESSION_ID, generation: setup.generation });
  const loaded = await loadRun(api, RUN_ID, async () => testGameData());
  if (loaded.kind !== "ready") throw new Error(`run not ready: ${loaded.kind}`);
  const run = new SyncedRun({ runId: RUN_ID, initial: loaded.run.state, enqueue: (op) => queue.enqueue(op) });
  const content = loaded.run.content.get("N-001");
  if (content === undefined) throw new Error("no content for N-001");
  const view = render(
    <ActivityPanel
      run={run}
      slotId="N-001"
      activity={content.activity}
      clips={content.clips}
      player={player}
      tracker={tracker}
      onContinue={() => undefined}
      onSaveAndExit={() => undefined}
      onResync={() => undefined}
    />,
  );
  return { events, audio, speech, player, view, db, queue };
}

const serverSlot = (setup: Setup) => setup.server.state.runs[0]!.state.slots.find((s) => s.slotId === "N-001")!;
const option = (text: string) => screen.getByRole("radio", { name: new RegExp(`: ${text}(, tried)?$`) });
const kinds = (events: AudioEvent[]) => events.map((e) => e.kind);

async function answer(text: string, expectLine: string) {
  fireEvent.click(option(text));
  fireEvent.click(screen.getByRole("button", { name: COPY.check }));
  await screen.findByText(expectLine);
}

describe("learning panel on a saved run (Phase 22 exit criteria)", () => {
  it("two wrong answers, refresh: two greyed tries and one left; Play works after refresh; the third try resolves", async () => {
    const setup = await serverAtActivity();
    const factory = new IDBFactory();

    // First page load: the clip is fetched ahead of Play, then two wrong tries.
    const first = await pageLoad(setup, factory);
    await screen.findAllByRole("radio"); // the answer area appears once the sound is here (audio required)
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));
    await waitFor(() => expect(first.audio.playing).toEqual([5, 4, 3, 2, 1]));
    await answer("s", COPY.notQuite);
    await answer("ch", COPY.notQuite);
    expect(serverSlot(setup).attempts.map((a) => a.answer)).toEqual(["a", "c"]); // the server counted both
    first.view.unmount();
    first.player.dispose();
    first.db.close();

    // Refresh: a new page load.
    const second = await pageLoad(setup, factory);
    await screen.findAllByRole("radio");
    expect(screen.getAllByText(COPY.tried)).toHaveLength(2);
    expect(option("s").getAttribute("aria-disabled")).toBe("true");
    expect(option("ch").getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(COPY.triesLeft(1))).toBeTruthy();

    // Play after the refresh: the clip is in the browser database, so it sounds at once and the request still goes.
    second.speech.hold();
    const before = second.events.length;
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));
    await waitFor(() => expect(second.audio.playing).toEqual([5, 4, 3, 2, 1]));
    expect(kinds(second.events.slice(before))).toEqual(["prime", "start", "request"]);
    expect(second.speech.pending).toHaveLength(1); // sounding before the response arrived
    await act(async () => second.speech.release());

    // The third try resolves the activity: right answer, reward once.
    const credits = setup.server.state.runs[0]!.state.snapshot!.credits;
    await answer("sh", COPY.correct);
    expect(screen.getByText(COPY.rewardCredits(serverSlot(setup).reward.credits))).toBeTruthy();
    expect(serverSlot(setup).status).toBe("SUCCEEDED");
    expect(serverSlot(setup).attempts).toHaveLength(3);
    expect(setup.server.state.runs[0]!.state.snapshot!.credits).toBe(credits + serverSlot(setup).reward.credits);
    expect(screen.getByRole("button", { name: COPY.continue })).toBeTruthy();
  });

  it("a speech failure is never an attempt: the sound fails, Try again works, the server's attempts are unchanged", async () => {
    const setup = await serverAtActivity();
    const opsBefore = setup.server.log.filter((l) => l.endsWith("/ops")).length;
    const page = await pageLoad(setup, new IDBFactory(), (speech) => {
      speech.failNextRequest = { kind: "error", status: 503, code: "SPEECH_UNAVAILABLE", body: null };
    });
    await screen.findByText(COPY.soundFailed);
    expect(screen.queryAllByRole("radio")).toHaveLength(0); // the question is not shown without its sound
    expect(serverSlot(setup).attempts).toHaveLength(0);
    expect(setup.server.log.filter((l) => l.endsWith("/ops"))).toHaveLength(opsBefore); // nothing was sent as an op

    fireEvent.click(screen.getAllByRole("button", { name: COPY.tryAgain })[0]!);
    await screen.findAllByRole("radio");
    expect(screen.getByText(COPY.triesLeft(3))).toBeTruthy();
    expect(serverSlot(setup).attempts).toHaveLength(0);
    expect(page.speech.requests).toHaveLength(2);
  });

  it("Check waits for the server's acknowledgement before any feedback (durability, online only)", async () => {
    const setup = await serverAtActivity();
    await pageLoad(setup, new IDBFactory());
    await screen.findAllByRole("radio");
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));
    fireEvent.click(option("th"));
    fireEvent.click(screen.getByRole("button", { name: COPY.check }));
    expect(screen.getAllByText(COPY.checking).length).toBeGreaterThan(0);
    expect(screen.queryByText(COPY.notQuite)).toBeNull();
    await screen.findByText(COPY.notQuite);
    expect(serverSlot(setup).attempts).toHaveLength(1);
  });
});

describe("Phase 37 types on a saved run", () => {
  const picture = DEV_ACTIVITIES.filter((e) => e.activity.interactionType === "PICTURE_SELECT");
  const track = DEV_ACTIVITIES.filter((e) => e.activity.interactionType === "NUMBER_SELECT" && (e.activity.activityPayload as { display: string }).display === "TRACK");
  const card = (name: string) => screen.getByRole("radio", { name: new RegExp(`^\\d: ${name}(, tried)?$`) });

  it("PICTURE_SELECT, mouse only: two wrong cards, refresh shows them greyed, the third try is right and rewarded once", async () => {
    const setup = await serverAtActivity(picture);
    const factory = new IDBFactory();
    const first = await pageLoad(setup, factory);
    expect(screen.queryByRole("button", { name: /Play/ })).toBeNull(); // no clip on this activity
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["1: a pig", "2: the sun", "3: a dog", "4: a cat"]);
    fireEvent.click(card("a pig"));
    fireEvent.click(screen.getByRole("button", { name: COPY.check }));
    await screen.findByText(COPY.notQuite);
    fireEvent.click(card("a cat"));
    fireEvent.click(screen.getByRole("button", { name: COPY.check }));
    await waitFor(() => expect(serverSlot(setup).attempts.map((a) => a.answer)).toEqual(["c", "a"]));
    first.view.unmount();
    first.player.dispose();
    first.db.close();

    await pageLoad(setup, factory);
    expect(card("a pig").getAttribute("aria-label")).toBe("1: a pig, tried");
    expect(card("a cat").getAttribute("aria-label")).toBe("4: a cat, tried");
    const credits = setup.server.state.runs[0]!.state.snapshot!.credits;
    fireEvent.click(card("the sun"));
    fireEvent.click(screen.getByRole("button", { name: COPY.check }));
    await screen.findByText(COPY.correct);
    expect(serverSlot(setup).status).toBe("SUCCEEDED");
    expect(setup.server.state.runs[0]!.state.snapshot!.credits).toBe(credits + serverSlot(setup).reward.credits);
  });

  it("NUMBER_SELECT, keyboard only: Tab to the track, arrows to the number, Tab to Check, Enter; the server judges '5'", async () => {
    const setup = await serverAtActivity(track);
    await pageLoad(setup, new IDBFactory());
    expect(screen.getByRole("img", { name: "a dice with five dots" })).toBeTruthy();
    tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("0");
    press("End");
    press("ArrowLeft");
    press("ArrowLeft");
    press("ArrowLeft");
    press("ArrowLeft");
    press("ArrowLeft");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("5");
    expect(tab().textContent).toMatch(COPY.check);
    press("Enter");
    await screen.findByText(COPY.correct);
    expect(serverSlot(setup).attempts).toMatchObject([{ answer: "5", correct: true }]);
    expect(serverSlot(setup).status).toBe("SUCCEEDED");
  });
});

describe("Phase 38 types on a saved run", () => {
  const byId = (id: string) => PHASE38_ACTIVITIES.filter((e) => e.activity.activityId === id);

  it("ARRANGE, keyboard only: a wrong word is recorded, survives a refresh, then the right word resolves", async () => {
    const setup = await serverAtActivity(byId("dev-letters-1"));
    const factory = new IDBFactory();
    const first = await pageLoad(setup, factory);
    expect(screen.getByRole("img", { name: "a cat" })).toBeTruthy();
    let el = tab();
    while (!el.className.includes("lp-tile")) el = tab();
    press("c");
    press("o");
    press("t");
    while (!(el.textContent ?? "").includes(COPY.check)) el = tab();
    press("Enter");
    await screen.findByText(COPY.notQuite);
    expect(serverSlot(setup).attempts.map((a) => a.answer)).toEqual(["cot"]);
    first.view.unmount();
    first.player.dispose();
    first.db.close();

    await pageLoad(setup, factory);
    expect(screen.getByRole("button", { name: "Space 2 of 3: o" })).toBeTruthy(); // the arrangement stays
    expect(screen.getByText(COPY.triedList(["cot"]))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Space 2 of 3: o" }));
    fireEvent.click(screen.getByRole("button", { name: "Space 3 of 3: t" }));
    fireEvent.click(screen.getByRole("button", { name: "a" }));
    fireEvent.click(screen.getByRole("button", { name: "t" }));
    fireEvent.click(screen.getByRole("button", { name: COPY.check }));
    await screen.findByText(COPY.correct);
    expect(serverSlot(setup).attempts).toMatchObject([{ answer: "cot" }, { answer: "cat", correct: true }]);
  });

  it("two-step, mouse only: one Check, one attempt joined by '|'; the right part is still locked after a refresh", async () => {
    const setup = await serverAtActivity(byId("dev-two-step-1"));
    const factory = new IDBFactory();
    const first = await pageLoad(setup, factory);
    fireEvent.click(screen.getByRole("radio", { name: "3: 25" }));
    fireEvent.change(screen.getByRole("textbox", { name: "5 × 6 = ?" }), { target: { value: "35" } });
    fireEvent.click(screen.getByRole("button", { name: COPY.check }));
    await screen.findByText(COPY.notQuite);
    expect(serverSlot(setup).attempts).toMatchObject([{ answer: "c|35", correct: false }]);
    first.view.unmount();
    first.player.dispose();
    first.db.close();

    await pageLoad(setup, factory);
    expect(screen.getByText(COPY.partRight)).toBeTruthy();
    expect(screen.getByText(COPY.partAgain)).toBeTruthy();
    expect(screen.getByRole("radio", { name: "3: 25" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByRole("textbox", { name: "5 × 6 = ?" }), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: COPY.check }));
    await screen.findByText(COPY.correct);
    expect(serverSlot(setup).attempts).toHaveLength(2);
    expect(serverSlot(setup).status).toBe("SUCCEEDED");
  });
});
