import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useResubmitCommunity, useReviewCommunity, type CommunityView } from "@/features/forum";
import { useI18n } from "@/i18n";

function requestError(error: unknown, fallback: string) {
  return (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;
}

/** Shown for PENDING_APPROVAL / REJECTED communities. Admins get approve / reject controls. */
export function CommunityReviewBanner({ community }: { community: CommunityView }) {
  const { t } = useI18n();
  const review = useReviewCommunity();
  const resubmit = useResubmitCommunity();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const pending = community.status === "PENDING_APPROVAL";

  return <div role="status" className={`mt-5 rounded-xl border p-4 text-sm ${pending ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-800"}`}>
    <p className="font-medium">{t(pending ? "Awaiting administrator approval" : "This community proposal was rejected")}</p>
    <p className="mt-1 leading-6">{t(pending ? "It is only visible to its proposer and administrators until approved." : "Only the proposer and administrators can see this community.")}</p>
    {community.reviewNote ? <p className="mt-2 leading-6"><span className="font-medium">{t("Reviewer note")}:</span> {community.reviewNote}</p> : null}
    {pending && community.isAdmin ? <div className="mt-3 space-y-3">
      {rejecting ? <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder={t("Reason for rejection (required)")} className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground" /> : null}
      <div className="flex flex-wrap gap-2">
        {rejecting
          ? <><Button size="sm" variant="destructive" disabled={review.isPending || !note.trim()} onClick={() => review.mutate({ id: community.id, input: { decision: "reject", note: note.trim() } })}>{t("Confirm rejection")}</Button><Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>{t("Cancel")}</Button></>
          : <><Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ id: community.id, input: { decision: "approve" } })}>{t("Approve")}</Button><Button size="sm" variant="outline" onClick={() => setRejecting(true)}>{t("Reject")}</Button></>}
      </div>
      {review.error ? <p role="alert" className="text-red-600">{requestError(review.error, t("Could not review this community."))}</p> : null}
    </div> : null}
    {!pending && community.isOwner ? <div className="mt-3 space-y-2">
      <p className="leading-6">{t("Update the community details in Manage, then send it back for review.")}</p>
      <Button size="sm" disabled={resubmit.isPending} onClick={() => resubmit.mutate(community.id)}>{t(resubmit.isPending ? "Working…" : "Resubmit proposal")}</Button>
      {resubmit.error ? <p role="alert" className="text-red-600">{requestError(resubmit.error, t("Could not resubmit this proposal."))}</p> : null}
    </div> : null}
  </div>;
}
