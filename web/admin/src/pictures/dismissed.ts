// Drawings the operator discarded, remembered in this browser for a day so a reload or a return to Pictures does not
// bring their cards back (R33 lists QUEUED and READY jobs of the last 24 h; Discard has no server call, and the job
// stays as cost history). A saved drawing needs none of this: admin-api stops listing it once R34 stores a picture
// from it. Storage can be missing or throw (a private window, blocked site data): then nothing is remembered, which
// only means a discarded card can come back.
const KEY = "scd.admin.discardedPictureJobs";
const KEEP_MS = 24 * 60 * 60 * 1000;

type Stored = Record<string, number>;

function read(now: number): Stored {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const fresh: Stored = {};
    for (const [jobId, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === "number" && now - at < KEEP_MS) fresh[jobId] = at;
    }
    return fresh;
  } catch {
    return {};
  }
}

/** The job IDs discarded in this browser in the last 24 hours. */
export function discardedJobs(now = Date.now()): ReadonlySet<string> {
  return new Set(Object.keys(read(now)));
}

/** Remember that this drawing was discarded (older entries are dropped as it writes). */
export function rememberDiscarded(jobId: string, now = Date.now()): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...read(now), [jobId]: now }));
  } catch {
    // Not remembered: the card may come back after a reload.
  }
}
