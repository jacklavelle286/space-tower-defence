import { tokenSub } from "@scd/shared";
import type { AuthPort } from "./types";

/** The cross-tab channel. Messages carry only an account `sub` (not a secret, not personal data) or a sign-out. */
export const IDENTITY_CHANNEL = "scd-identity";

export type IdentityMessage = { type: "signed-in"; sub: string } | { type: "signed-out" };

export type LostReason = "other-player" | "signed-out";

interface ChannelLike {
  postMessage(message: IdentityMessage): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  close(): void;
}

export interface IdentityGuardOptions {
  ownerSub: string;
  auth: Pick<AuthPort, "accessToken" | "isTokenStorageKey">;
  /** Runs once when this page must stop: another account signed in here, or anyone signed out anywhere. */
  onLost: (reason: LostReason) => void;
  win?: Window;
  channel?: ChannelLike | null;
}

export interface IdentityGuard {
  /** Tell other tabs this child is about to sign out, so they stop too (E.7.4 point 2). */
  announceSignOut(): void;
  dispose(): void;
}

function openChannel(): ChannelLike | null {
  return typeof BroadcastChannel === "undefined" ? null : (new BroadcastChannel(IDENTITY_CHANNEL) as ChannelLike);
}

/**
 * One page load = one account (E.7.4, spine S7.2). After the page binds `ownerSub`, this re-checks the signed-in
 * account whenever something could have changed it: another tab's message, the auth library's storage entries changing
 * in another tab (`storage` event), and the page becoming visible again. On a different account, or no account,
 * `onLost` runs; the shell then stops the queue and the API client and reloads. Identity changes never touch the queue's
 * state (F §7): the previous child's ops are simply never sent.
 */
export function startIdentityGuard(options: IdentityGuardOptions): IdentityGuard {
  const win = options.win ?? window;
  const channel = options.channel === undefined ? openChannel() : options.channel;
  let lost = false;

  function lose(reason: LostReason) {
    if (lost) return;
    lost = true;
    options.onLost(reason);
  }

  async function recheck() {
    if (lost) return;
    let token: string | null;
    try {
      token = await options.auth.accessToken({ forceRefresh: false });
    } catch {
      return; // could not refresh right now (offline): not evidence of a different player
    }
    if (token === null) lose("signed-out");
    else if (tokenSub(token) !== options.ownerSub) lose("other-player");
  }

  const onMessage = (event: MessageEvent) => {
    const message = event.data as IdentityMessage | undefined;
    if (message?.type === "signed-out") lose("signed-out");
    else if (message?.type === "signed-in" && message.sub !== options.ownerSub) lose("other-player");
  };
  const onStorage = (event: StorageEvent) => {
    if (options.auth.isTokenStorageKey(event.key)) void recheck();
  };
  const onVisibility = () => {
    if (win.document.visibilityState === "visible") void recheck();
  };

  channel?.addEventListener("message", onMessage);
  win.addEventListener("storage", onStorage);
  win.document.addEventListener("visibilitychange", onVisibility);
  // Tell other tabs who this page belongs to; a tab bound to another child stops and reloads.
  channel?.postMessage({ type: "signed-in", sub: options.ownerSub });

  return {
    announceSignOut() {
      channel?.postMessage({ type: "signed-out" });
    },
    dispose() {
      win.removeEventListener("storage", onStorage);
      win.document.removeEventListener("visibilitychange", onVisibility);
      channel?.close();
    },
  };
}
