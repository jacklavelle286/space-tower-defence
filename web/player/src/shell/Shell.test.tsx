// @vitest-environment jsdom
import { unsignedToken } from "@scd/shared";
import { press, tab } from "@scd/shared/learning/testing";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthPort } from "../auth/types";
import type { PlayerConfig } from "../config";
import { dobString, ProfileSetup, validNickname } from "./ProfileSetup";
import type { Services } from "./services";
import { Shell } from "./Shell";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const CONFIG: PlayerConfig = {
  apiBase: "/api",
  region: "eu-west-2",
  userPoolId: "eu-west-2_x",
  clientId: "c".repeat(26),
  authDomain: "x.auth.eu-west-2.amazoncognito.com",
  scope: "game/play",
  releaseId: "test",
};
const ME = {
  nickname: "Ace",
  avatarId: "avatar-03",
  age: 6,
  ageBand: 6,
  planets: {},
  badges: {},
  session: { activeElsewhere: false, runId: null, deviceLabel: null, leaseExpiresAt: null },
  runs: [],
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

function fakeAuth(current: { sub: string | null }): AuthPort & { signIn: ReturnType<typeof vi.fn>; signOut: ReturnType<typeof vi.fn> } {
  return {
    accessToken: async () => (current.sub === null ? null : unsignedToken({ sub: current.sub })),
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    isTokenStorageKey: () => true,
  };
}

function renderShell(path: string, services: Services) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Shell services={services} />
    </MemoryRouter>,
  );
}

/** Choose a birthday with the mouse: open each part, click the value. */
function chooseBirthday(day: string, month: string, year: string) {
  for (const [part, value] of [["Day", day], ["Month", month], ["Year", year]] as const) {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${part}(:|, not chosen)`) }));
    fireEvent.click(within(screen.getByRole("group", { name: `Choose the ${part.toLowerCase()}` })).getByRole("button", { name: value }));
  }
}

afterEach(cleanup);

describe("Shell", () => {
  it("signed out: shows the landing page, and the buttons open managed login", async () => {
    const auth = fakeAuth({ sub: null });
    const fetchImpl = vi.fn();
    renderShell("/", { config: CONFIG, auth, fetchImpl, reload: vi.fn(), localPractice: false });
    fireEvent.click(await screen.findByRole("button", { name: "I'm new" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(auth.signIn.mock.calls).toEqual([["sign-up"], ["sign-in"]]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("first sign-in: no profile goes to setup, Done saves and opens Home", async () => {
    const auth = fakeAuth({ sub: A });
    const requests: { method: string; url: string; body: unknown }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ method: init?.method ?? "GET", url, body });
      if (url === "/api/me") return json(404, { error: { code: "PROFILE_NOT_FOUND" } });
      if (url === "/api/me/profile") return json(200, { ...ME, nickname: body.nickname });
      if (url === "/api/planets") return json(200, { ageBand: 6, planets: [] });
      return json(404, {});
    }) as unknown as typeof fetch;
    renderShell("/auth/callback", { config: CONFIG, auth, fetchImpl, reload: vi.fn(), localPractice: false });

    fireEvent.change(await screen.findByLabelText(/Your name/), { target: { value: "  Star Kid " } });
    fireEvent.click(screen.getByRole("radio", { name: "robot astronaut" }));
    chooseBirthday("9", "March", String(new Date().getFullYear() - 6));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(await screen.findByRole("heading", { name: "Hi, Star Kid!" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Saved to the cloud");
    const put = requests.find((r) => r.method === "PUT");
    expect(put?.body).toEqual({ nickname: "Star Kid", avatarId: "avatar-06", dob: `${new Date().getFullYear() - 6}-03-09` });
    // The birthday is not kept anywhere in the browser.
    expect(JSON.stringify({ ...localStorage })).not.toContain("-03-09");
  });

  it("setup: Done with a bad name shows the problem as an alert and moves focus to the name", async () => {
    const auth = fakeAuth({ sub: A });
    const fetchImpl = vi.fn(async (url: string) =>
      url === "/api/me" ? json(404, { error: { code: "PROFILE_NOT_FOUND" } }) : json(404, {}),
    ) as unknown as typeof fetch;
    renderShell("/auth/callback", { config: CONFIG, auth, fetchImpl, reload: vi.fn(), localPractice: false });
    const name = await screen.findByLabelText(/Your name/);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    const alerts = screen.getAllByRole("alert").map((a) => a.textContent);
    expect(alerts).toContain("Use letters, numbers, spaces or hyphens (up to 20).");
    expect(alerts).toContain("Please choose a real date.");
    expect(document.activeElement).toBe(name);
    expect(name.getAttribute("aria-invalid")).toBe("true");
  });

  it("returning player with a profile lands on Home", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url === "/api/me" ? json(200, ME) : json(200, { ageBand: 6, planets: [] }),
    ) as unknown as typeof fetch;
    renderShell("/", { config: CONFIG, auth: fakeAuth({ sub: A }), fetchImpl, reload: vi.fn(), localPractice: false });
    expect(await screen.findByRole("heading", { name: "Hi, Ace!" })).toBeTruthy();
  });

  it("a different child signing in elsewhere stops this page before its next request and reloads", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const current = { sub: A as string | null };
      const reload = vi.fn();
      let calls = 0;
      const fetchImpl = vi.fn(async (url: string) => {
        calls += 1;
        return url === "/api/me" ? json(200, ME) : json(200, { ageBand: 6, planets: [] });
      }) as unknown as typeof fetch;
      renderShell("/home", { config: CONFIG, auth: fakeAuth(current), fetchImpl, reload, localPractice: false });
      await screen.findByRole("heading", { name: "Hi, Ace!" });
      await waitFor(() => expect(calls).toBe(2));

      current.sub = B; // child B signs in in another tab: the shared token storage now holds B's token
      act(() => void window.dispatchEvent(new StorageEvent("storage", { key: "CognitoIdentityServiceProvider.x.LastAuthUser" })));
      expect(await screen.findByText("A different player signed in on this computer.")).toBeTruthy();
      await act(() => vi.advanceTimersByTimeAsync(2000));
      expect(reload).toHaveBeenCalledOnce();
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sign-out tells other tabs and goes through the auth library's sign-out", async () => {
    const auth = fakeAuth({ sub: A });
    const fetchImpl = vi.fn(async (url: string) =>
      url === "/api/me" ? json(200, ME) : json(200, { ageBand: 6, planets: [] }),
    ) as unknown as typeof fetch;
    const heard: unknown[] = [];
    const other = new BroadcastChannel("scd-identity");
    other.onmessage = (e) => heard.push(e.data);
    renderShell("/home", { config: CONFIG, auth, fetchImpl, reload: vi.fn(), localPractice: false });
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledOnce());
    await waitFor(() => expect(heard).toContainEqual({ type: "signed-out" }));
    other.close();
  });
});

describe("ProfileSetup rules", () => {
  it("nickname: trimmed, 1-20 letters, digits, spaces or hyphens", () => {
    expect(validNickname("  Mia ")).toBe("Mia");
    expect(validNickname("Star-Kid 7")).toBe("Star-Kid 7");
    expect(validNickname("")).toBeNull();
    expect(validNickname("   ")).toBeNull();
    expect(validNickname("x".repeat(21))).toBeNull();
    expect(validNickname("Zoë")).toBeNull();
    expect(validNickname("<b>")).toBeNull();
  });

  it("birthday: a real calendar date, not in the future", () => {
    const today = new Date(2026, 10, 15);
    expect(dobString(2020, 2, 29, today)).toBe("2020-02-29");
    expect(dobString(2021, 2, 29, today)).toBeNull();
    expect(dobString(2020, 4, 31, today)).toBeNull();
    expect(dobString(2026, 11, 15, today)).toBe("2026-11-15");
    expect(dobString(2026, 11, 16, today)).toBeNull();
  });

  it("shows the hints when Done is pressed with a missing name or date, and sends nothing", async () => {
    const save = vi.fn(async () => true);
    render(<ProfileSetup save={save} today={new Date(2026, 10, 15)} />);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByText("Use letters, numbers, spaces or hyphens (up to 20).")).toBeTruthy();
    expect(screen.getByText("Please choose a real date.")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it("offers twelve pictures as one radio group and the last ten years", () => {
    render(<ProfileSetup save={vi.fn(async () => true)} today={new Date(2026, 10, 15)} />);
    expect(screen.getAllByRole("radio")).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: "Year, not chosen" }));
    const years = within(screen.getByRole("group", { name: "Choose the year" })).getAllByRole("button").map((b) => b.textContent);
    expect(years[0]).toBe("2026");
    expect(years.at(-1)).toBe("2016");
  });

  // Backlog B-5: no native selects (their lists closed at once on Chrome for Linux); big buttons and a grid instead.
  it("birthday, mouse only: each part opens a grid in the page, a click chooses and closes it; no select anywhere", async () => {
    const save = vi.fn(async () => true);
    render(<ProfileSetup save={save} today={new Date(2026, 10, 15)} />);
    expect(document.querySelector("select")).toBeNull();
    fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: "Star Kid" } });
    const day = screen.getByRole("button", { name: "Day, not chosen" });
    expect(day.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(day);
    expect(day.getAttribute("aria-expanded")).toBe("true");
    expect(within(screen.getByRole("group", { name: "Choose the day" })).getAllByRole("button")).toHaveLength(31);
    fireEvent.click(screen.getByRole("button", { name: "9" }));
    expect(screen.queryByRole("group", { name: "Choose the day" })).toBeNull();
    expect(screen.getByRole("button", { name: "Day: 9" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Day: 9" }));
    fireEvent.click(screen.getByRole("button", { name: "Month, not chosen" }));
    fireEvent.click(screen.getByRole("button", { name: "March" }));
    fireEvent.click(screen.getByRole("button", { name: "Year, not chosen" }));
    fireEvent.click(screen.getByRole("button", { name: "2020" }));
    // a part can be changed again; the chosen value is marked
    fireEvent.click(screen.getByRole("button", { name: "Day: 9" }));
    expect(screen.getByRole("button", { name: "9" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Day: 9" })); // closes again
    expect(screen.queryByRole("group", { name: "Choose the day" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ nickname: "Star Kid", avatarId: "avatar-01", dob: "2020-03-09" }));
  });

  it("birthday, keyboard only: Enter opens a part on its first value, arrows move, Enter chooses, Esc closes", async () => {
    const save = vi.fn(async () => true);
    render(<ProfileSetup save={save} today={new Date(2026, 10, 15)} />);
    fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: "Pip" } });
    let el = tab();
    while (el.getAttribute("aria-label") !== "Day, not chosen") el = tab();
    press("Enter");
    expect(document.activeElement?.textContent).toBe("1");
    press("ArrowDown"); // a row of seven
    press("ArrowRight");
    expect(document.activeElement?.textContent).toBe("9");
    press("Enter");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Day: 9");
    tab();
    press(" ");
    press("ArrowDown");
    press("Escape"); // closes without choosing
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Month, not chosen");
    press("Enter");
    press("End");
    expect(document.activeElement?.textContent).toBe("December");
    press("Home");
    press("ArrowRight");
    press("ArrowRight"); // March
    press("Enter");
    tab();
    press("Enter");
    expect(document.activeElement?.textContent).toBe("2026");
    press("ArrowDown");
    press("ArrowRight"); // 2021
    press("Enter");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Year: 2021");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ dob: "2021-03-09" })));
  });

  it("birthday: Done with a missing or impossible date shows the problem and focuses the part to fix", () => {
    const save = vi.fn(async () => true);
    render(<ProfileSetup save={save} today={new Date(2026, 10, 15)} />);
    fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: "Pip" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Day, not chosen");
    expect(document.activeElement?.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toContain("Please choose a real date.");
    fireEvent.click(screen.getByRole("button", { name: "Day, not chosen" }));
    fireEvent.click(screen.getByRole("button", { name: "31" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Month, not chosen");
    fireEvent.click(screen.getByRole("button", { name: "Month, not chosen" }));
    fireEvent.click(screen.getByRole("button", { name: "February" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Year, not chosen");
    fireEvent.click(screen.getByRole("button", { name: "Year, not chosen" }));
    fireEvent.click(screen.getByRole("button", { name: "2020" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" })); // 31 February
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Day: 31");
    expect(save).not.toHaveBeenCalled();
  });
});
