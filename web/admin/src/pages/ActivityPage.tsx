import { useCallback, useState } from "react";
import { ActivityEditor } from "../editor/ActivityEditor";
import type { AdminApi } from "../api";
import { hrefOf } from "../routes";
import { DeleteActivity } from "./DeleteActivity";

// One activity at #activities/<id> (D §D8.4 A3-A6). Since Phase 39 the page is the full editor (web/admin/src/editor/):
// every interaction type, validate, preview-solve in the child's own panel, and publish with the review checklist.
// The Milestone 1 stand-in preview (plain buttons for multiple choice) is gone. Below the editor, set apart, the one
// Delete activity button (owner decision 2026-11-16); retire and withdraw have API routes but no buttons.

type Props = { readonly api: AdminApi; readonly activityId: string; readonly navigate?: (hash: string) => void };

export function ActivityPage({ api, activityId, navigate }: Props) {
  const [loaded, setLoaded] = useState(false); // no Delete for an activity that failed to load or does not exist
  const markLoaded = useCallback(() => setLoaded(true), []);
  return (
    <div className="detail">
      <p>
        <a href={hrefOf({ page: "activities" })}>← All activities</a>
      </p>
      <ActivityEditor api={api} activityId={activityId} onLoad={markLoaded} />
      {loaded && <DeleteActivity api={api} activityId={activityId} {...(navigate === undefined ? {} : { navigate })} />}
    </div>
  );
}
