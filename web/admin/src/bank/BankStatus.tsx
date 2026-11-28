import { bandName } from "@scd/shared";
import { useCallback, useEffect, useState } from "react";
import {
  describeError,
  type AdminApi,
  type BankBand,
  type BankStatus as Status,
} from "../api";
import {
  campaignNote,
  emptyTopics,
  MODE_LABEL,
  modeSentence,
  needSentence,
  plural,
  SLOT_WORD,
  topicNames,
} from "./status";

// A10 bank status (D §D8.5; Phase 42, M3-07): for each age, the published activities per subject and slot kind
// against the thresholds (R30), whether the age is ready, and plainly what to add. Read-only: one request, one
// Refresh button. Every number is the server's (shared/selection), so this page and the selector always agree.
// The Counted column counts selection units (a big template is 2), which is what the thresholds are in.

type Props = { readonly api: AdminApi };

export function BankStatus({ api }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(() => {
    api.bankStatus().then(
      (body) => {
        setStatus(body);
        setMessage(null);
        setLoading(false);
      },
      (error: unknown) => {
        setMessage(describeError(error));
        setLoading(false);
      },
    );
  }, [api]);
  useEffect(fetchStatus, [fetchStatus]);
  const refresh = () => {
    setLoading(true);
    fetchStatus();
  };

  return (
    <section aria-labelledby="bank-heading" className="bank">
      <h2 id="bank-heading">Bank status</h2>
      <p className="muted">
        Published activities for each school year, against the thresholds new games
        need. An activity marked <em>Both</em> counts for normal and for meteor
        slots. <em>Counted</em> is what the thresholds measure: an activity
        counts 1, and a template counts 2 when it can make 20 or more questions.
      </p>
      <p>
        <button type="button" onClick={refresh} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </p>
      <p className="visually-hidden" role="status">
        {loading
          ? "Loading bank status…"
          : status !== null && message === null
            ? "Bank status is up to date."
            : ""}
      </p>
      {message !== null && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      {status !== null && status.releasedWaveSets === null && (
        <p className="notice">
          The released game could not be read, so each age was judged without
          its wave sets: it needs at least one activity for a normal slot and
          one for a meteor slot. Refresh to try again.
        </p>
      )}
      {status !== null && status.rules.starterUntilEligible && (
        <p className="notice" role="note">
          Until an age is ready, its new games use the starter rules: any
          subject can fill a slot, and a game is refused only when there is
          nothing left to play.
        </p>
      )}
      {status?.ageBands.map((band) => (
        <AgeBand key={band.ageBand} band={band} status={status} />
      ))}
    </section>
  );
}

function AgeBand({
  band,
  status,
}: {
  readonly band: BankBand;
  readonly status: Status;
}) {
  const headingId = `bank-age-${band.ageBand}`;
  const note = campaignNote(band, status.rules.campaignSlots);
  const unitsPerTopic = status.rules.unitsPerTopic;
  return (
    <article aria-labelledby={headingId} className="bank-age">
      <h3 id={headingId}>
        {bandName(band.ageBand)}{" "}
        <span className={`state bank-${band.mode.toLowerCase()}`}>
          {MODE_LABEL[band.mode]}
        </span>
      </h3>
      <p>{modeSentence(band)}</p>
      {note !== null && <p className="muted">{note}</p>}

      <div className="table-scroll">
        <table aria-label={`${bandName(band.ageBand)} counts`}>
          <thead>
            <tr>
              <th scope="col">Subject</th>
              <th scope="col">Slots</th>
              <th scope="col">Counted</th>
              <th scope="col">Threshold</th>
              <th scope="col">Topics</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {band.groups.map((group) => (
              <tr key={`${group.subject}-${group.rewardCategory}`}>
                <td>{group.subject}</td>
                <td>{SLOT_WORD[group.rewardCategory]}</td>
                <td>{group.count}</td>
                <td>{group.threshold}</td>
                <td>{group.topics.length}</td>
                <td className={group.ok ? "ok" : "error"}>
                  {group.ok
                    ? "enough"
                    : `${group.threshold - group.count} more`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="bank-facts">
        {band.subjects.map((s) => (
          <li key={s.subject}>
            {s.subject}: {plural(s.topics, "topic")} covered,{" "}
            {s.topicsWithEnough} with {unitsPerTopic} or more activities (needs{" "}
            {s.topicsNeeded}) <Met ok={s.ok} />
          </li>
        ))}
        {band.templates.map((t) => (
          <li key={`${t.subject}-${t.rewardCategory}`}>
            {t.subject} templates for {SLOT_WORD[t.rewardCategory]} slots:{" "}
            {t.instances} of {t.needed} questions <Met ok={t.ok} />
          </li>
        ))}
      </ul>

      <h4>What to add</h4>
      {band.needs.length === 0 ? (
        <p className="ok">Nothing: {bandName(band.ageBand)} meets every threshold.</p>
      ) : (
        <ul aria-label={`What to add for ${bandName(band.ageBand)}`}>
          {band.needs.map((need, index) => (
            <li key={index}>
              {needSentence(need, unitsPerTopic)}
              {need.what === "TOPICS" && (
                <EmptyTopics band={band} subject={need.subject} />
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/** Pass or fail in words; the tick or cross is decoration only. */
function Met({ ok }: { readonly ok: boolean }) {
  return (
    <span className={ok ? "ok" : "error"}>
      <span aria-hidden="true">{ok ? "✓" : "✗"}</span> {ok ? "met" : "not met"}
    </span>
  );
}

function EmptyTopics({
  band,
  subject,
}: {
  readonly band: BankBand;
  readonly subject: string;
}) {
  const topics = emptyTopics(band, subject);
  if (topics.length === 0) return null;
  return (
    <span className="muted"> Topics with none yet: {topicNames(topics)}.</span>
  );
}
