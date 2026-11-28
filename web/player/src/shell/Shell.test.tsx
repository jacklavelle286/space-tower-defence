// @vitest-environment jsdom
import { unsignedToken } from "@scd/shared";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthPort } from "../auth/types";
import type { PlayerConfig } from "../config";
import { ProfileSetup, validNickname } from "./ProfileSetup";
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
    fireEvent.click(screen.getByLabelText("Year 2"));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(await screen.findByRole("heading", { name: "Hi, Star Kid!" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Saved to the cloud");
    const put = requests.find((r) => r.method === "PUT");
    expect(put?.body).toEqual({ nickname: "Star Kid", avatarId: "avatar-06", schoolYear: 2 });
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
    expect(alerts).toContain("Please choose your school year.");
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

  it("shows the hints when Done is pressed with a missing name or school year, and sends nothing", () => {
    const save = vi.fn(async () => true);
    render(<ProfileSetup save={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByText("Use letters, numbers, spaces or hyphens (up to 20).")).toBeTruthy();
    expect(screen.getByText("Please choose your school year.")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it("offers twelve pictures and six school years, Reception to Year 5, each as a radio group", () => {
    render(<ProfileSetup save={vi.fn(async () => true)} />);
    const years = within(screen.getByRole("radiogroup")).getAllByRole("radio");
    expect(years.map((r) => r.closest("label")?.textContent)).toEqual(["Reception", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]);
    expect(screen.getAllByRole("radio")).toHaveLength(12 + 6);
  });

  it("YG1: a name and a school year are enough; no date of birth is asked for", async () => {
    const save = vi.fn(async () => true);
    render(<ProfileSetup save={save} />);
    expect(screen.queryByText(/birthday/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: "Pip" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(document.activeElement?.closest("label")?.textContent).toBe("Reception"); // focus moves to the years
    fireEvent.click(screen.getByLabelText("Year 4"));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ nickname: "Pip", avatarId: "avatar-01", schoolYear: 4 }));
  });
});
