import { ActivityEditor } from "../editor/ActivityEditor";
import type { AdminApi } from "../api";
import { hrefOf } from "../routes";

// One activity at #activities/<id> (D §D8.4 A3-A6). Since Phase 39 the page is the full editor (web/admin/src/editor/):
// every interaction type, validate, preview-solve in the child's own panel, and publish with the review checklist.
// The Milestone 1 stand-in preview (plain buttons for multiple choice) is gone.

type Props = { readonly api: AdminApi; readonly activityId: string };

export function ActivityPage({ api, activityId }: Props) {
  return (
    <div className="detail">
      <p>
        <a href={hrefOf({ page: "activities" })}>← All activities</a>
      </p>
      <ActivityEditor api={api} activityId={activityId} />
    </div>
  );
}
