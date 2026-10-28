import { Link } from "react-router-dom";
import type { SubmissionHistory } from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

const statusLabels: Record<string, string> = {
  REQUESTED: "Awaiting response", ACCEPTED: "Accepted", IN_REVIEW: "In review",
  SUBMITTED: "Feedback submitted", REVISION_REQUESTED: "Revision requested",
  RESUBMITTED: "Resubmitted", COMPLETED: "Completed", DECLINED: "Declined",
  CANCELLED: "Cancelled", EXPIRED: "Expired",
};

export function SubmissionReviewProgress({ history, onRefresh, refreshing }: { history: SubmissionHistory; onRefresh?: () => void; refreshing?: boolean }) {
  const { t, language } = useI18n();
  const requests = history.reviewRequests ?? [];
  return <section className="mt-6 rounded-lg border border-border bg-card p-5" data-no-i18n>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{t("Review requests")}</h2>{onRefresh ? <Button size="sm" variant="outline" onClick={onRefresh} disabled={refreshing}>{t("Refresh review status")}</Button> : null}</div>
    <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("Saving a submission does not send it to a reviewer. The project owner sends review requests.")}</p>
    {requests.length ? <ul className="mt-4 divide-y divide-border">{requests.map(request => <li key={request.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="break-words font-medium">{request.reviewerName}</span><Badge variant="secondary">{t(statusLabels[request.status] ?? request.status)}</Badge></div>
        <p className="mt-1 text-xs text-muted-foreground">{t("Revision")} {request.revisionNumber}{request.dueAt ? ` · ${t("Due date")}: ${new Date(request.dueAt).toLocaleDateString(language)}` : ""}</p>
        {request.revisionNumber < history.currentRevisionNumber && !["COMPLETED", "DECLINED", "CANCELLED", "EXPIRED"].includes(request.status) ? <p className="mt-2 text-sm text-muted-foreground">{t("This request targets an earlier version. Uploading a version does not resend it; open the request to submit your revisions when requested.")}</p> : null}
      </div>
      {request.canView ? <Button variant="outline" size="sm" className="self-start sm:shrink-0" asChild><Link to={`/review-requests/${request.id}`}>{t("View request")}</Link></Button> : null}
    </li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">{t("No review requests yet. Request a human review when the manuscript is ready; AI pre-review is optional.")}</p>}
  </section>;
}
