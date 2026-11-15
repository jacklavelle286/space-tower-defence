import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** The browser's online flag. Connection-required buttons are disabled with a reason when false (D7.3, spine S7.4). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine);
}
