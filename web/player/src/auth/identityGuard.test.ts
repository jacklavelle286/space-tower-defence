// @vitest-environment jsdom
import { unsignedToken } from "@scd/shared";
import { describe, expect, it, vi } from "vitest";
import { startIdentityGuard, type IdentityMessage } from "./identityGuard";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";

function fakeChannel() {
  const listeners: ((event: MessageEvent) => void)[] = [];
  const posted: IdentityMessage[] = [];
  return {
    posted,
    deliver(message: IdentityMessage) {
      for (const l of listeners) l(new MessageEvent("message", { data: message }));
    },
    postMessage: (m: IdentityMessage) => posted.push(m),
    addEventListener: (_t: "message", l: (event: MessageEvent) => void) => listeners.push(l),
    close: vi.fn(),
  };
}

function authFor(current: { sub: string | null }) {
  return {
    accessToken: async () => (current.sub === null ? null : unsignedToken({ sub: current.sub })),
    isTokenStorageKey: (key: string | null) => key === null || key.startsWith("CognitoIdentityServiceProvider.client."),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("identity guard (one page load = one account)", () => {
  it("announces this page's account to other tabs", () => {
    const channel = fakeChannel();
    startIdentityGuard({ ownerSub: A, auth: authFor({ sub: A }), onLost: vi.fn(), channel }).dispose();
    expect(channel.posted).toEqual([{ type: "signed-in", sub: A }]);
  });

  it("stops when another tab signs in as a different child, not the same one", () => {
    const channel = fakeChannel();
    const onLost = vi.fn();
    const guard = startIdentityGuard({ ownerSub: A, auth: authFor({ sub: A }), onLost, channel });
    channel.deliver({ type: "signed-in", sub: A });
    expect(onLost).not.toHaveBeenCalled();
    channel.deliver({ type: "signed-in", sub: B });
    channel.deliver({ type: "signed-out" });
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(onLost).toHaveBeenCalledWith("other-player");
    guard.dispose();
  });

  it("stops when any tab signs out", () => {
    const channel = fakeChannel();
    const onLost = vi.fn();
    startIdentityGuard({ ownerSub: A, auth: authFor({ sub: A }), onLost, channel });
    channel.deliver({ type: "signed-out" });
    expect(onLost).toHaveBeenCalledWith("signed-out");
  });

  it("re-checks the stored token when the auth library's storage changes in another tab", async () => {
    const current = { sub: A as string | null };
    const onLost = vi.fn();
    const guard = startIdentityGuard({ ownerSub: A, auth: authFor(current), onLost, channel: null });
    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));
    current.sub = B;
    window.dispatchEvent(new StorageEvent("storage", { key: "something-else" }));
    await flush();
    expect(onLost).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent("storage", { key: "CognitoIdentityServiceProvider.client.LastAuthUser" }));
    await flush();
    expect(onLost).toHaveBeenCalledWith("other-player");
    guard.dispose();
  });

  it("re-checks when the page becomes visible, and treats no token as signed out", async () => {
    const current = { sub: A as string | null };
    const onLost = vi.fn();
    const guard = startIdentityGuard({ ownerSub: A, auth: authFor(current), onLost, channel: null });
    current.sub = null;
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(onLost).toHaveBeenCalledWith("signed-out");
    guard.dispose();
  });
});
