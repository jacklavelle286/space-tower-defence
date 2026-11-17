// The Versions page (Gate M, LD7; scope-level-designer.md §3.1 step 13, §3.1a): every published version of the
// planet, newest first, with which is live, where each came from (a release or a level published here), who made it
// and when. Make live moves current.json (an older version is the rollback: saved games stay on the version they
// started on). Per wave set: Retire (no new games; started ones carry on) and Mark invalid (no new games; a started
// one can only be ended, recorded as given up, never as a loss). Testers are the accounts that see preview versions;
// a child's tester code is in their Settings. Compare shows what changed between any two versions.
import { useCallback, useEffect, useState } from "react";
import { describeError, ApiError, type AdminApi, type GameData, type WaveSetState } from "../../api";
import { ConfirmDialog } from "../../ConfirmDialog";
import { hrefOf } from "../../routes";
import "../levels.css";
import { diffPlanets, diffText, type DiffLine } from "./diff";
import { refusalText } from "./PublishTab";

const TESTER_CODE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const MAX_TESTERS = 20; // api/shared/versions.py

const STATE_TEXT: Record<WaveSetState, string> = {
  published: "Open",
  preview: "Testers only",
  retired: "Retired: no new games",
  invalid: "Invalid: started games can only end",
};

type Pending =
  | { kind: "live"; version: string; rollback: boolean }
  | { kind: "state"; version: string; waveSetId: string; name: string; state: "published" | "retired" | "invalid" };

function who(by: string | undefined): string {
  return by === undefined ? "" : `operator ${by.slice(0, 8)}`;
}

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.code === "PUBLISH_REFUSED") {
    const code = error.info["code"];
    const message = error.info["message"];
    return refusalText({ code: typeof code === "string" ? code : "UNKNOWN", message: typeof message === "string" ? message : "" });
  }
  return describeError(error);
}

export function VersionsPage({ api }: { api: Pick<AdminApi, "getGameData" | "getVersion" | "makeLive" | "setWaveSetState" | "setTesters"> }) {
  const [data, setData] = useState<GameData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [testers, setTesters] = useState<string[]>([]);
  const [newTester, setNewTester] = useState("");
  const [compare, setCompare] = useState<{ a: string; b: string }>({ a: "", b: "" });
  const [diff, setDiff] = useState<DiffLine[] | null>(null);

  const load = useCallback(() => {
    api.getGameData().then(
      (answer) => {
        setData(answer);
        setTesters(answer.testers);
        const [newest, older] = answer.versions;
        setCompare((c) => (c.a === "" && newest !== undefined ? { a: older?.campaignVersion ?? newest.campaignVersion, b: newest.campaignVersion } : c));
      },
      (error: unknown) => setMessage(describeError(error)),
    );
  }, [api]);
  useEffect(load, [load]);

  async function act(run: () => Promise<unknown>, done: string) {
    setPending(null);
    setBusy(true);
    setMessage(null);
    try {
      await run();
      setMessage(done);
      load();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function showDiff() {
    setDiff(null);
    try {
      const [a, b] = await Promise.all([api.getVersion(compare.a), api.getVersion(compare.b)]);
      setDiff(diffPlanets(a.document, b.document));
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  if (data === null) return <section>{message !== null ? <p role="alert">{message}</p> : <p>Loading…</p>}</section>;
  const liveIndex = data.versions.findIndex((v) => v.live);
  const newTesterOk = TESTER_CODE.test(newTester.trim()) && !testers.includes(newTester.trim());
  const testersChanged = JSON.stringify([...testers].sort()) !== JSON.stringify([...data.testers].sort());

  return (
    <section className="versions-page" aria-labelledby="versions-heading">
      <p>
        <a href={hrefOf({ page: "levels" })}>Levels</a>
      </p>
      <h2 id="versions-heading">Versions</h2>
      <p className="muted">
        Live for new games: <strong>{data.current.campaignVersion}</strong> (rules {data.current.rulesetVersion}). Saved games
        always stay on the version they started on.
      </p>
      {message !== null && (
        <p role="status" className="notice">
          {message}
        </p>
      )}

      <table className="versions-table">
        <thead>
          <tr>
            <th scope="col">Version</th>
            <th scope="col">Made</th>
            <th scope="col">Wave sets</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.versions.map((v, i) => (
            <tr key={v.campaignVersion} className={v.live ? "live" : undefined}>
              <th scope="row">
                {v.campaignVersion}
                {v.live && <span className="badge"> live</span>}
              </th>
              <td>
                {v.source === "portal" ? `level ${v.levelId ?? "?"}, ${who(v.by)}` : "a release"}
                <br />
                <span className="muted">{v.writtenAt}</span>
              </td>
              <td>
                <ul className="wave-set-states">
                  {v.waveSets.map((ws) => (
                    <li key={ws.waveSetId}>
                      <strong>{ws.name}</strong> ({ws.mode === "CAMPAIGN" ? "campaign" : "challenge"}): {STATE_TEXT[ws.state]}{" "}
                      {(ws.state === "published" || ws.state === "preview") && (
                        <button type="button" disabled={busy} onClick={() => setPending({ kind: "state", version: v.campaignVersion, waveSetId: ws.waveSetId, name: ws.name, state: "retired" })}>
                          Retire
                        </button>
                      )}
                      {ws.state === "retired" && (
                        <button type="button" disabled={busy} onClick={() => setPending({ kind: "state", version: v.campaignVersion, waveSetId: ws.waveSetId, name: ws.name, state: "published" })}>
                          Open again
                        </button>
                      )}
                      {ws.state !== "invalid" && (
                        <button type="button" disabled={busy} onClick={() => setPending({ kind: "state", version: v.campaignVersion, waveSetId: ws.waveSetId, name: ws.name, state: "invalid" })}>
                          Mark invalid
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </td>
              <td>
                {!v.live && (
                  <button type="button" disabled={busy} onClick={() => setPending({ kind: "live", version: v.campaignVersion, rollback: liveIndex !== -1 && i > liveIndex })}>
                    Make live
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Compare two versions</h3>
      <div className="versions-compare">
        {(["a", "b"] as const).map((side) => (
          <label key={side}>
            {side === "a" ? "From" : "To"}{" "}
            <select value={compare[side]} onChange={(e) => setCompare({ ...compare, [side]: e.target.value })}>
              {data.versions.map((v) => (
                <option key={v.campaignVersion} value={v.campaignVersion}>
                  {v.campaignVersion}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button type="button" onClick={() => void showDiff()} disabled={compare.a === "" || compare.a === compare.b}>
          Compare
        </button>
      </div>
      {diff !== null &&
        (diff.length === 0 ? (
          <p className="muted">No differences.</p>
        ) : (
          <ul className="publish-diff">
            {diff.map((line) => (
              <li key={`${line.change}-${line.section}-${line.id}`}>{diffText(line)}</li>
            ))}
          </ul>
        ))}

      <h3>Testers</h3>
      <p className="muted">
        Tester accounts see preview versions on Home. A child's tester code is on their Settings page. At most {MAX_TESTERS}.
      </p>
      <ul>
        {testers.map((t) => (
          <li key={t}>
            <code>{t}</code>{" "}
            <button type="button" onClick={() => setTesters(testers.filter((x) => x !== t))}>
              Remove
            </button>
          </li>
        ))}
        {testers.length === 0 && <li className="muted">No testers.</li>}
      </ul>
      <label>
        Tester code <input value={newTester} onChange={(e) => setNewTester(e.target.value)} autoComplete="off" spellCheck={false} />
      </label>{" "}
      <button
        type="button"
        disabled={!newTesterOk || testers.length >= MAX_TESTERS}
        onClick={() => {
          setTesters([...testers, newTester.trim()]);
          setNewTester("");
        }}
      >
        Add
      </button>{" "}
      <button type="button" className="primary" disabled={busy || !testersChanged} onClick={() => void act(() => api.setTesters(testers), "Testers saved.")}>
        Save testers
      </button>

      <h3>History</h3>
      {data.history.length === 0 ? (
        <p className="muted">Nothing published from the portal yet.</p>
      ) : (
        <ul>
          {data.history.map((h) => (
            <li key={`${h.at}-${h.campaignVersion}`}>
              {h.at}: {h.action === "publish" ? `published ${h.campaignVersion} from level ${h.levelId ?? "?"}${h.live === true ? ", live" : ", preview"}` : `made ${h.campaignVersion} live`}
              {h.prev !== undefined ? ` (live was ${h.prev})` : ""}, {who(h.by)}
            </li>
          ))}
        </ul>
      )}

      {pending !== null && (
        <ConfirmDialog labelledBy="versions-confirm" onCancel={() => setPending(null)}>
          {(cancelRef) => (
            <>
              <h3 id="versions-confirm">
                {pending.kind === "live"
                  ? `Make ${pending.version} live${pending.rollback ? " (roll back)" : ""}?`
                  : pending.state === "invalid"
                    ? `Mark ${pending.name} in ${pending.version} invalid?`
                    : pending.state === "retired"
                      ? `Retire ${pending.name} in ${pending.version}?`
                      : `Open ${pending.name} in ${pending.version} again?`}
              </h3>
              <p>
                {pending.kind === "live"
                  ? "New games use it in about a minute. Games already started stay on their own version."
                  : pending.state === "invalid"
                    ? "No new games. A game already started on it can only be ended; it is recorded as given up, never as a loss. This cannot be undone here."
                    : pending.state === "retired"
                      ? "No new games on it. Games already started carry on as normal."
                      : "New games can start on it again."}
              </p>
              <div className="dialog-buttons">
                <button type="button" ref={cancelRef} onClick={() => setPending(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() =>
                    void (pending.kind === "live"
                      ? act(() => api.makeLive(pending.version), `${pending.version} is live for new games.`)
                      : act(
                          () => api.setWaveSetState({ campaignVersion: pending.version, waveSetId: pending.waveSetId, state: pending.state }),
                          `${pending.name} in ${pending.version}: ${STATE_TEXT[pending.state]}.`,
                        ))
                  }
                >
                  {pending.kind === "live" ? "Make live" : pending.state === "invalid" ? "Mark invalid" : pending.state === "retired" ? "Retire" : "Open again"}
                </button>
              </div>
            </>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
