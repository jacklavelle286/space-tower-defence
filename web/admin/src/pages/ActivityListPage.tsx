import { useEffect, useMemo, useState } from "react";
import { AGES, FACETS, NO_FILTER, agesLabel, facetValues, filterActivities, words, type ListFilter } from "../activityList";
import { describeError, type ActivitySummary, type AdminApi } from "../api";
import { hrefOf } from "../routes";

// A2 (D §D8.2): every activity header in one table, filtered in the browser. Each ID is a link to the activity's page,
// so the list works with the keyboard (Tab to a link, Enter) and a row can be opened in a new tab.
//
// Not here yet: "New activity" (the editor, Phase 39), the current version as "v3" and the "draft has changes" flag
// (R22 returns the published version's ID only, and no draft revision; Phase 36 can add both to the header).

type Props = { readonly api: AdminApi };

export function ActivityListPage({ api }: Props) {
  const [items, setItems] = useState<ActivitySummary[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListFilter>(NO_FILTER);

  useEffect(() => {
    api.listActivities().then(
      (page) => setItems(page.items),
      (error: unknown) => setMessage(describeError(error)),
    );
  }, [api]);

  const shown = useMemo(() => filterActivities(items ?? [], filter), [items, filter]);
  const set = (patch: Partial<ListFilter>) => setFilter({ ...filter, ...patch });

  return (
    <section aria-labelledby="activities-heading">
      <h2 id="activities-heading">Activities</h2>
      <p>
        <a className="button primary" href={hrefOf({ page: "new" })}>
          New activity
        </a>
      </p>
      {message !== null && <p className="error">{message}</p>}

      <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <label>
          Search{" "}
          <input
            type="search"
            value={filter.search}
            placeholder="ID or title"
            onChange={(e) => set({ search: e.target.value })}
          />
        </label>
        <label>
          Age{" "}
          <select value={filter.age} onChange={(e) => set({ age: e.target.value })}>
            <option value="">any</option>
            {AGES.map((age) => (
              <option key={age}>{age}</option>
            ))}
          </select>
        </label>
        {FACETS.map(({ key, label }) => (
          <label key={key}>
            {label}{" "}
            <select value={filter[key]} onChange={(e) => set({ [key]: e.target.value })}>
              <option value="">any</option>
              {facetValues(items ?? [], key).map((value) => (
                <option key={value} value={value}>
                  {words(value)}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button type="button" onClick={() => setFilter(NO_FILTER)} disabled={filter === NO_FILTER}>
          Clear
        </button>
      </form>

      {items === null ? (
        message === null && <p>Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">No activities yet. The seed script creates the first drafts.</p>
      ) : (
        <>
          <p className="muted" aria-live="polite">
            Showing {shown.length} of {items.length}.
          </p>
          <div className="table-scroll">
            <table className="activities">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Title</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Topic</th>
                  <th scope="col">Ages</th>
                  <th scope="col">Type</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Reward</th>
                  <th scope="col">State</th>
                  <th scope="col">Published version</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => (
                  <tr key={item.activityId}>
                    <td>
                      <a href={hrefOf({ page: "activity", id: item.activityId })}>{item.activityId}</a>
                    </td>
                    <td>{item.title}</td>
                    <td>{item.subject}</td>
                    <td className="mono">{item.topicId}</td>
                    <td>{agesLabel(item)}</td>
                    <td>{words(item.interactionType)}</td>
                    <td>{words(item.authoringMode)}</td>
                    <td>{words(item.rewardCategory)}</td>
                    <td>
                      <span className={`state state-${item.state.toLowerCase()}`}>{words(item.state)}</span>
                    </td>
                    <td className="mono">{item.publishedVersion ?? "—"}</td>
                    <td>{item.updatedAt.slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.length === 0 && <p className="muted">No activity matches these filters.</p>}
        </>
      )}
    </section>
  );
}
