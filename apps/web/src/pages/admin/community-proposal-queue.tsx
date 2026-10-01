import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type CommunityView, useCommunityList, useReviewCommunity } from "@/features/forum";
import { useI18n } from "@/i18n";

const requestError = (error: unknown, fallback: string) => (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? fallback;

/** Admin queue of communities waiting for approval. Rejecting requires a note the proposer will see. */
export function CommunityProposalQueue() {
  const { t } = useI18n();
  const list = useCommunityList({ status: "PENDING_APPROVAL", sort: "newest" });
  const review = useReviewCommunity();
  const proposals = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const [target, setTarget] = useState<CommunityView>();
  const [note, setNote] = useState("");

  async function decide(community: CommunityView, decision: "approve" | "reject", reason?: string) {
    try {
      await review.mutateAsync({ id: community.id, input: { decision, note: reason } });
      toast.success(t(decision === "approve" ? "Community approved" : "Community proposal rejected"));
      setTarget(undefined);
      setNote("");
    } catch (error) {
      toast.error(requestError(error, t("Could not review this community.")));
    }
  }

  if (list.isLoading) return <div className="space-y-2">{[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div>;
  if (list.error) return <p className="text-sm text-red-600">{t("Unable to load communities. Please try again.")}</p>;
  if (proposals.length === 0) return <div className="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">{t("No proposals are waiting for approval.")}</div>;

  return <>
    <div className="overflow-hidden rounded-xl border bg-card"><div className="divide-y">
      {proposals.map((community) => <div key={community.id} className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/communities/${community.slug}`} className="font-semibold hover:text-blue-700">{community.name}</Link>
            <Badge variant="outline">{t(community.visibility === "private" ? "Private" : "Public")}</Badge>
            {community.researchField ? <span className="text-xs font-medium text-blue-700">{community.researchField}</span> : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{community.description}</p>
          {community.researchTopics.length ? <div className="mt-2 flex flex-wrap gap-1.5">{community.researchTopics.slice(0, 5).map((topic) => <Badge key={topic} variant="secondary" className="font-normal">{topic}</Badge>)}</div> : null}
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={review.isPending} onClick={() => decide(community, "approve")}><Check className="h-4 w-4" />{t("Approve")}</Button>
          <Button size="sm" variant="outline" className="text-red-600" disabled={review.isPending} onClick={() => { setTarget(community); setNote(""); }}><X className="h-4 w-4" />{t("Reject")}</Button>
        </div>
      </div>)}
    </div></div>
    {list.hasNextPage ? <div className="mt-4 text-center"><Button variant="outline" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{t(list.isFetchingNextPage ? "Loading…" : "Load more")}</Button></div> : null}

    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) setTarget(undefined); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Reject this proposal?")}</DialogTitle>
          <DialogDescription>{t("The proposer sees your note and can revise and resubmit.")}</DialogDescription>
        </DialogHeader>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} aria-label={t("Reason for rejection (required)")} placeholder={t("Reason for rejection (required)")} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setTarget(undefined)}>{t("Cancel")}</Button>
          <Button variant="destructive" disabled={review.isPending || !note.trim()} onClick={() => target && decide(target, "reject", note.trim())}>{t("Confirm rejection")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
