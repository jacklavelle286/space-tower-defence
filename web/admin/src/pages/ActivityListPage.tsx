import { bandName } from "@scd/shared";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  COLUMNS,
  NO_FILTER,
  UPDATED_WITHIN,
  ageValues,
  agesLabel,
  facetValues,
  filterActivities,
  isEmpty,
  loadListState,
  nextSort,
  saveListState,
  withCurrent,
  words,
  type Facet,
  type ListFilter,
  type Sort,
  type SortKey,
} from "../activityList";
import { describeError, type ActivitySummary, type AdminApi } from "../api";
import { clearFlash, peekFlash } from "../flash";
import { hrefOf } from "../routes";

// A2 (D §D8.2): every activity header in one table, filtered in the browser. Each ID is a link to the activity's page,
// so the list works with the keyboard (Tab to a link, Enter) and a row can be opened in a new tab. Every column has a
// filter in the row under the headers, and every header sorts (click again to reverse). Filters and sort are kept for
// the tab in sessionStorage, so opening an activity and coming back keeps them.
//
// Not here yet: "New activity" (the editor, Phase 39), the current version as "v3" and the "draft has changes" flag
// (R22 returns the published version's ID only, and no draft revision; Phase 36 can add both to the header).

type Props = { readonly api: AdminApi };

export function ActivityListPage({ api }: Props) {
  const [items, setItems] = useState<ActivitySummary[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saved] = useState(loadListState);
  const [filter, setFilter] = useState<ListFilter>(saved.filter);
  const [sort, setSort] = useState<Sort>(saved.sort);
  const [flash] = useState(peekFlash); // e.g. "Activity ph-0102 deleted." after a delete sent the operator here
  useEffect(clearFlash, []);

  useEffect(() => {
    api.listActivities().then(
      (page) => setItems(page.items),
      (error: unknown) => setMessage(describeError(error)),
    );
  }, [api]);

  useEffect(() => saveListState(filter, sort), [filter, sort]);

  const shown = useMemo(() => filterActivities(items ?? [], filter, sort), [items, filter, sort]);
  const set = (patch: Partial<ListFilter>) => setFilter({ ...filter, ...patch });
  const all = items ?? [];

  const text = (key: "activityId" | "title" | "topicId" | "publishedVersion", label: string) => (
    <input
      type="search"
      aria-label={`Filter ${label}: contains`}
      placeholder="contains"
      value={filter[key]}
      onChange={(e) => set({ [key]: e.target.value })}
    />
  );
  const facet = (key: Facet, label: string) => (
    <select aria-label={`Filter ${label}`} value={filter[key]} onChange={(e) => set({ [key]: e.target.value })}>
      <option value="">any</option>
      {withCurrent(facetValues(all, key), filter[key]).map((value) => (
        <option key={value} value={value}>
          {words(value)}
        </option>
      ))}
    </select>
  );
  const filterCell: Record<SortKey, ReactNode> = {
    activityId: text("activityId", "ID"),
    title: text("title", "Title"),
    subject: facet("subject", "Subject"),
    topicId: text("topicId", "Topic"),
    ages: (
      <select aria-label="Filter School years: includes year" value={filter.age} onChange={(e) => set({ age: e.target.value })}>
        <option value="">any</option>
        {withCurrent(ageValues(all), filter.age).map((age) => (
          <option key={age} value={age}>
            {bandName(Number(age))}
          </option>
        ))}
      </select>
    ),
    interactionType: facet("interactionType", "Type"),
    authoringMode: facet("authoringMode", "Mode"),
    rewardCategory: facet("rewardCategory", "Reward"),
    state: facet("state", "State"),
    publishedVersion: text("publishedVersion", "Published version"),
    updatedAt: (
      <select
        aria-label="Filter Updated"
        value={filter.updatedWithinDays}
        onChange={(e) => set({ updatedWithinDays: e.target.value })}
      >
        <option value="">any time</option>
        {UPDATED_WITHIN.map(([days, label]) => (
          <option key={days} value={days}>
            {label}
          </option>
        ))}
      </select>
    ),
  };

  return (
    <section aria-labelledby="activities-heading">
      <h2 id="activities-heading">Activities</h2>
      <p>
        <a className="button primary" href={hrefOf({ page: "new" })}>
          New activity
        </a>
      </p>
      {flash !== null && (
        <p className="notice" role="status">
          {flash}
        </p>
      )}
      {message !== null && <p className="error">{message}</p>}

      {items === null ? (
        message === null && <p>Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">No activities yet. The seed script creates the first drafts.</p>
      ) : (
        <>
          <div className="list-tools">
            <p className="muted" aria-live="polite">
              Showing {shown.length} of {items.length}.
            </p>
            <button type="button" onClick={() => setFilter(NO_FILTER)} disabled={isEmpty(filter)}>
              Clear filters
            </button>
          </div>
          <div className="table-scroll">
            <table className="activities">
              <thead>
                <tr>
                  {COLUMNS.map(({ key, label }) => {
                    const sorted = sort.key === key;
                    return (
                      <th
                        key={key}
                        scope="col"
                        aria-sort={sorted ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                      >
                        <button type="button" className="sort" onClick={() => setSort(nextSort(sort, key))}>
                          {label}
                          <span aria-hidden="true">{sorted ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
                <tr className="filter-row">
                  {COLUMNS.map(({ key }) => (
                    <td key={key}>{filterCell[key]}</td>
                  ))}
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
