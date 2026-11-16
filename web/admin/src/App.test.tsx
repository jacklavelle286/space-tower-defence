// @vitest-environment jsdom
// The shell (Phase 35): the guard runs on the stored token BEFORE any admin request, navigation is links, and the
// server's refusals (403 FORBIDDEN, gateway 401) win over what the claims said. fetch is faked: /config.json and
// /api/admin/* answer from the tables below, and every request is recorded.
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { BANK } from "./testing/bank";
import { CONFIG, operatorToken, playerToken } from "./testing/tokens";

const TOKEN_KEY = "scd-admin-token";

const SUMMARY = {
  activityId: "ph-0102",
  title: "Which letters make /sh/?",
  subject: "phonics",
  topicId: "phonics-gpc-consonant-digraphs",
  rewardCategory: "NORMAL",
  interactionType: "MULTIPLE_CHOICE",
  authoringMode: "FIXED",
  state: "PUBLISHED",
  publishedVersion: "v-0001",
  minAge: 5,
  maxAge: 6,
  updatedAt: "2026-11-15T10:00:00Z",
};

const VIEW = {
  header: { ...SUMMARY, fromDraftRevision: 0 },
  draft: {
    definition: {
      activityId: "ph-0102",
      title: SUMMARY.title,
      subject: "phonics",
      topicId: SUMMARY.topicId,
      minAge: 5,
      maxAge: 6,
      interactionType: "MULTIPLE_CHOICE",
      authoringMode: "FIXED",
      rewardCategory: "NORMAL",
      audioRequirement: "REQUIRED",
      prompt: { text: "Listen. Which letters make this sound?" },
      activityPayload: { optionStyle: "GRAPHEME", options: [{ id: "a", text: "s" }, { id: "b", text: "sh" }] },
      answerSpecification: { accepted: ["b"] },
    },
    draftRevision: 0,
    updatedAt: SUMMARY.updatedAt,
  },
  versions: [],
};

let calls: string[] = [];
let apiStatus = 200;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  calls = [];
  apiStatus = 200;
  window.history.replaceState(null, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      if (input === "/config.json") return Promise.resolve(json(CONFIG));
      calls.push(input);
      if (apiStatus === 403) return Promise.resolve(json({ error: { code: "FORBIDDEN", message: "x" } }, 403));
      if (apiStatus === 401) return Promise.resolve(json({ message: "Unauthorized" }, 401));
      if (input.startsWith("/api/admin/activities?")) return Promise.resolve(json({ items: [SUMMARY], nextCursor: null }));
      if (input === "/api/admin/activities/ph-0102") return Promise.resolve(json(VIEW));
      if (input.startsWith("/api/admin/speech-definitions?")) return Promise.resolve(json({ items: [], nextCursor: null }));
      if (input === "/api/admin/bank-status") return Promise.resolve(json(BANK));
      return Promise.resolve(json({ error: { code: "NOT_FOUND" } }, 404));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

function signedInAs(token: string, hash = "") {
  window.sessionStorage.setItem(TOKEN_KEY, token);
  if (hash !== "") window.history.replaceState(null, "", `/${hash}`);
  render(<App />);
}

const goTo = (hash: string) =>
  act(() => {
    window.history.replaceState(null, "", `/${hash}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });

describe("route guard", () => {
  it("shows a player account 'not authorised' and sends no admin request", async () => {
    signedInAs(playerToken());
    expect(await screen.findByRole("heading", { name: "Not authorised" })).toBeTruthy();
    expect(screen.getByText(/Player accounts sign in to the game/u)).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(calls).toEqual([]);
  });

  it("shows an operator outside the admin group 'not authorised' and sends no admin request", async () => {
    signedInAs(operatorToken(["viewers"]));
    expect(await screen.findByText("This account can't use the content admin.")).toBeTruthy();
    expect(screen.getByText(/not in the admin group/u)).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("switches to 'not authorised' when the server answers 403 FORBIDDEN", async () => {
    apiStatus = 403;
    signedInAs(operatorToken());
    expect(await screen.findByRole("heading", { name: "Not authorised" })).toBeTruthy();
    expect(screen.getByText(/The server refused this account/u)).toBeTruthy();
  });

  it("asks for a new sign-in when the gateway answers 401", async () => {
    apiStatus = 401;
    signedInAs(operatorToken());
    expect(await screen.findByText("Your sign-in has expired. Sign in again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe("shell", () => {
  it("opens on the activity list with state, type, subject and ages", async () => {
    signedInAs(operatorToken());
    const table = await screen.findByRole("table");
    const row = within(table).getByRole("row", { name: /ph-0102/u });
    for (const text of ["phonics", "5–6", "multiple choice", "published", "fixed"]) {
      expect(within(row).getByText(text)).toBeTruthy();
    }
    expect(calls).toEqual(["/api/admin/activities?limit=200"]);
  });

  it("navigates with links and marks the current page", async () => {
    signedInAs(operatorToken());
    const nav = await screen.findByRole("navigation", { name: "Admin pages" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["Activities", "Speech", "Pictures", "Bank status"]);
    expect(within(nav).getByRole("link", { name: "Activities" }).getAttribute("aria-current")).toBe("page");

    await goTo("#bank");
    expect(screen.getByRole("heading", { name: "Bank status" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Bank status" }).getAttribute("aria-current")).toBe("page");
    expect(await screen.findByRole("article", { name: /Age 5/u })).toBeTruthy();
    expect(calls).toContain("/api/admin/bank-status"); // R30 (Phase 42)

    await goTo("#speech");
    await waitFor(() => expect(calls).toContain("/api/admin/speech-definitions?limit=200"));
  });

  it("opens one activity from its link and goes back to the list", async () => {
    signedInAs(operatorToken());
    const link = await screen.findByRole("link", { name: "ph-0102" });
    expect(link.getAttribute("href")).toBe("#activities/ph-0102");
    await goTo("#activities/ph-0102");
    expect(await screen.findByDisplayValue("Listen. Which letters make this sound?")).toBeTruthy();
    expect(calls).toContain("/api/admin/activities/ph-0102");
    expect(screen.getByRole("link", { name: "← All activities" }).getAttribute("href")).toBe("#activities");
  });

  it("opens New activity from the list, under the Activities tab", async () => {
    signedInAs(operatorToken());
    const link = await screen.findByRole("link", { name: "New activity" });
    expect(link.getAttribute("href")).toBe("#new-activity");
    await goTo("#new-activity");
    expect(screen.getByRole("heading", { name: "New activity" })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Admin pages" });
    expect(within(nav).getByRole("link", { name: "Activities" }).getAttribute("aria-current")).toBe("page");
  });
});
