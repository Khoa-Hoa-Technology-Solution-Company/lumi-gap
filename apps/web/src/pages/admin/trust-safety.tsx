import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useAdminUsers } from "@/features/admin/hooks/use-admin-users";
import { useCommunities } from "@/features/forum/hooks/use-forum";
import { forumApi, type ForumAppealView, type ForumCopyrightClaim, type ForumQueueAction, type ForumQueueReport } from "@/features/forum/api/forum.api";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/utils/cn";

const control = "w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const card = "rounded-xl border bg-card p-5";
const actionLabels: Record<ForumQueueAction, string> = {
  DISMISS_REPORT: "Dismiss report", ESCALATE_REPORT: "Escalate to Admin",
  HIDE_CONTENT: "Hide content", RESTORE_CONTENT: "Restore content", REMOVE_CONTENT: "Remove content",
  LOCK_THREAD: "Lock discussion", UNLOCK_THREAD: "Unlock discussion", PIN_THREAD: "Pin discussion",
  UNPIN_THREAD: "Unpin discussion", MOVE_THREAD: "Move discussion",
  RESTRICT_USER: "Restrict author posting", LIFT_RESTRICTION: "Lift author restrictions",
};
type Run = (operation: () => Promise<unknown>) => void;
const finalStatuses = ["resolved", "dismissed", "reviewed"];

export function AdminTrustSafetyPage() {
  const [tab, setTab] = useState("reports");
  const [status, setStatus] = useState<Parameters<typeof forumApi.moderationQueue>[0]>("open");
  const [appealStatus, setAppealStatus] = useState<Parameters<typeof forumApi.appeals>[0]>("SUBMITTED");
  const viewer = useAuthStore((state) => state.user?.id);
  const qc = useQueryClient();
  const queue = useQuery({ queryKey: ["admin", "forum", viewer, "reports", status], queryFn: () => forumApi.moderationQueue(status), enabled: tab === "reports" });
  const appeals = useQuery({ queryKey: ["admin", "forum", viewer, "appeals", appealStatus], queryFn: () => forumApi.appeals(appealStatus), enabled: tab === "appeals" });
  const restrictions = useQuery({ queryKey: ["admin", "forum", viewer, "restrictions"], queryFn: forumApi.restrictions, enabled: tab === "restrictions" });
  const copyright = useQuery({ queryKey: ["admin", "forum", viewer, "copyright"], queryFn: forumApi.copyrightClaims, enabled: tab === "copyright" });
  const users = useAdminUsers({ role: "ADMIN", accountStatus: "ACTIVE", pageSize: 100 }, tab === "reports");
  const communities = useCommunities();
  const mutation = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSuccess: async () => {
      toast.success("Decision saved.");
      await Promise.all(["admin", "forum", "communities"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
    },
    onError: (error) => { toast.error(error instanceof Error ? error.message : "Could not save. Refresh and try again."); },
  });
  const pending = mutation.isPending;
  const run: Run = (operation) => mutation.mutate(operation);
  const current = tab === "reports" ? queue : tab === "appeals" ? appeals : tab === "restrictions" ? restrictions : copyright;

  return <div className="space-y-6">
    <PageHeader title="Trust & Safety" description="Review reports and appeals, manage posting restrictions and review verified copyright claims." />
    <nav aria-label="Moderation sections" className="flex flex-wrap gap-2 border-b pb-4">
      {Object.entries({ reports: "Reports", appeals: "Appeals", restrictions: "Restrictions", copyright: "Copyright claims" }).map(([value, label]) => <Button key={value} variant={tab === value ? "default" : "outline"} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</Button>)}
    </nav>
    <div className="flex flex-wrap items-center gap-2">
      {tab === "reports" ? <label className="flex items-center gap-3 text-sm">Queue<select className={control} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>{["open", "claimed", "under_review", "escalated", "resolved", "dismissed", "all"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label> : null}
      {tab === "appeals" ? <label className="flex items-center gap-3 text-sm">Status<select className={control} value={appealStatus} onChange={(event) => setAppealStatus(event.target.value as typeof appealStatus)}><option value="SUBMITTED">Pending review</option><option value="all">All appeals</option></select></label> : null}
      <Button className="ml-auto" size="sm" variant="outline" disabled={current.isFetching} onClick={() => { void current.refetch(); }}><RefreshCw className="h-4 w-4" />Refresh</Button>
    </div>
    {current.isPending ? <p role="status" className={card}>Loading…</p> : current.isError ? <p role="alert" className={card}>Could not load this queue. Use Refresh to try again.</p> : current.data?.length === 0 ? <div className={cn(card, "py-12 text-center text-muted-foreground")}><CheckCircle2 className="mx-auto mb-3 h-6 w-6" />There are no items in this view.</div> : <div className="space-y-4">
      {tab === "reports" ? queue.data?.map((report) => <ReportEditor key={report.id} report={report} viewer={viewer} admins={users.data?.data ?? []} communities={communities.data ?? []} pending={pending} run={run} />) : null}
      {tab === "appeals" ? appeals.data?.map((appeal) => <AppealEditor key={appeal.id} appeal={appeal} pending={pending} run={run} />) : null}
      {tab === "restrictions" ? restrictions.data?.map((restriction) => {
        const expired = Boolean(restriction.expiresAt && new Date(restriction.expiresAt) <= new Date());
        return <article className={card} key={restriction.id}><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold">{restriction.user?.fullName ?? restriction.userId}</h2><p className="mt-1 text-sm text-muted-foreground">{restriction.restrictionType} · {restriction.scope} · {restriction.revokedAt ? "Revoked" : expired ? "Expired" : "Active"}</p></div><Button variant="outline" disabled={pending || Boolean(restriction.revokedAt) || expired} onClick={() => run(() => forumApi.revokeRestriction(restriction.id))}>Revoke restriction</Button></div><p className="mt-3 whitespace-pre-wrap text-sm">{restriction.reason}</p>{restriction.expiresAt ? <p className="mt-2 text-xs text-muted-foreground">Expires {new Date(restriction.expiresAt).toLocaleString()}</p> : <p className="mt-2 text-xs text-muted-foreground">No automatic expiry</p>}</article>;
      }) : null}
      {tab === "copyright" ? copyright.data?.map((claim) => <CopyrightEditor key={claim.id} claim={claim} pending={pending} run={run} />) : null}
    </div>}
  </div>;
}

function DiscussionLink({ postId, commentId }: { postId?: string | null; commentId?: string | null }) {
  return postId ? <Button asChild size="sm" variant="outline"><Link to={"/forum/" + encodeURIComponent(postId) + (commentId ? "#comment-" + encodeURIComponent(commentId) : "")}>Open discussion<ArrowUpRight className="h-4 w-4" /></Link></Button> : null;
}

function DecisionNote({ value, onChange, maxLength = 5000 }: { value: string; onChange: (value: string) => void; maxLength?: number }) {
  return <label className="block space-y-2 text-sm"><span className="font-medium">Decision reason</span><textarea className={control} rows={3} minLength={3} maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Explain the decision for the affected user and the audit history." /></label>;
}

function ReportEditor({ report, viewer, admins, communities, pending, run }: {
  report: ForumQueueReport; viewer?: string; admins: Array<{ id: string; fullName: string }>;
  communities: Array<{ id: string; name: string; status: string }>; pending: boolean; run: Run;
}) {
  const [action, setAction] = useState<ForumQueueAction>("DISMISS_REPORT");
  const [reason, setReason] = useState("");
  const [assignee, setAssignee] = useState("");
  const [destination, setDestination] = useState("");
  const closed = finalStatuses.includes(report.status);
  const actions = (Object.keys(actionLabels) as ForumQueueAction[]).filter((value) => report.targetType === "THREAD" || !["LOCK_THREAD", "UNLOCK_THREAD", "PIN_THREAD", "UNPIN_THREAD", "MOVE_THREAD"].includes(value));
  return <article className={card}>
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><ShieldAlert className="h-4 w-4" />{report.reason} · {report.status} · {report.targetType}</p><h2 className="mt-2 break-words text-lg font-semibold">{report.contentSnapshot?.title ?? "Reported content"}</h2><p className="mt-1 text-xs text-muted-foreground">{new Date(report.createdAt).toLocaleString()} · reported version</p></div><DiscussionLink postId={report.postId} commentId={report.commentId} /></div>
    <details className="mt-4 text-sm"><summary className="cursor-pointer font-medium">Reported content snapshot</summary><p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3">{report.contentSnapshot?.body ?? "No snapshot is available for this older report."}</p></details>
    {report.description ? <p className="mt-3 whitespace-pre-wrap text-sm"><strong>Reporter context:</strong> {report.description}</p> : null}
    {closed ? null : <div className="mt-5 space-y-4 border-t pt-4">
      <div className="flex flex-wrap items-center gap-3"><Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => forumApi.claimReport(report.id, report.version))}>{report.assignedToId === viewer ? "Renew my claim" : "Claim report"}</Button>{report.claimExpiresAt ? <span className="text-xs text-muted-foreground">Claim expires {new Date(report.claimExpiresAt).toLocaleString()}</span> : null}</div>
      <div className="flex flex-wrap items-end gap-3"><label className="min-w-48 flex-1 space-y-2 text-sm"><span>Assign to an active Admin</span><select className={control} value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">Select an Admin</option>{admins.map((admin) => <option key={admin.id} value={admin.id}>{admin.fullName}</option>)}</select></label><Button size="sm" variant="outline" disabled={pending || !assignee} onClick={() => run(() => forumApi.reassignReport(report.id, assignee, report.version))}>Reassign</Button></div>
      <label className="block space-y-2 text-sm"><span>Moderation action</span><select className={control} value={action} onChange={(event) => setAction(event.target.value as ForumQueueAction)}>{actions.map((value) => <option key={value} value={value}>{actionLabels[value]}</option>)}</select></label>
      {action === "MOVE_THREAD" ? <label className="block space-y-2 text-sm"><span>Destination community</span><select className={control} value={destination} onChange={(event) => setDestination(event.target.value)}><option value="">Select a community</option>{communities.filter((community) => community.status === "ACTIVE" && community.id !== report.communityId).map((community) => <option key={community.id} value={community.id}>{community.name}</option>)}</select></label> : null}
      {action === "RESTRICT_USER" ? <p className="text-sm text-muted-foreground">This action restricts the author's posting across the forum until revoked.</p> : null}
      <DecisionNote value={reason} onChange={setReason} maxLength={2000} />
      <Button disabled={pending || reason.trim().length < 3 || (action === "MOVE_THREAD" && !destination)} onClick={() => run(() => forumApi.reportAction(report.id, action, { reason: reason.trim(), expectedVersion: report.version, ...(action === "MOVE_THREAD" ? { destinationCommunityId: destination } : {}) }))}>Apply decision</Button>
    </div>}
  </article>;
}

function ReviewCard({ title, children, postId, commentId }: { title: string; children: ReactNode; postId?: string | null; commentId?: string | null }) {
  return <article className={card}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{title}</h2><DiscussionLink postId={postId} commentId={commentId} /></div><div className="mt-4 space-y-4 text-sm">{children}</div></article>;
}

function AppealEditor({ appeal, pending, run }: { appeal: ForumAppealView; pending: boolean; run: Run }) {
  const [reason, setReason] = useState("");
  return <ReviewCard title={appeal.appellant?.fullName ?? "Moderation appeal"} postId={appeal.action?.postId} commentId={appeal.action?.commentId}>
    <p className="text-muted-foreground">{appeal.action?.action} · {appeal.status} · {new Date(appeal.submittedAt).toLocaleString()}</p>
    <p className="whitespace-pre-wrap"><strong>Original decision:</strong> {appeal.action?.reason ?? "No reason recorded"}</p><p className="whitespace-pre-wrap"><strong>Appeal:</strong> {appeal.reason}</p>
    {appeal.status === "SUBMITTED" ? <><DecisionNote value={reason} onChange={setReason} /><div className="flex flex-wrap gap-2"><Button disabled={pending || reason.trim().length < 3} onClick={() => run(() => forumApi.reviewAppeal(appeal.id, "UPHELD", reason.trim()))}>Uphold decision</Button><Button variant="outline" disabled={pending || reason.trim().length < 3} onClick={() => run(() => forumApi.reviewAppeal(appeal.id, "OVERTURNED", reason.trim()))}>Overturn decision</Button></div></> : <p className="whitespace-pre-wrap">{appeal.decisionReason}</p>}
  </ReviewCard>;
}

function CopyrightEditor({ claim, pending, run }: { claim: ForumCopyrightClaim; pending: boolean; run: Run }) {
  const [reason, setReason] = useState("");
  let safeUrl: string | undefined;
  try { const url = new URL(claim.originalSourceUrl ?? ""); if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) safeUrl = url.href; } catch { /* The source is optional. */ }
  return <ReviewCard title={claim.claimantName} postId={claim.postId} commentId={claim.targetType === "RESPONSE" ? claim.targetId : undefined}>
    <p className="text-muted-foreground">{claim.claimantEmail} · {claim.claimantOrganization} · {claim.status}</p>
    <p className="whitespace-pre-wrap"><strong>Copyrighted work:</strong> {claim.copyrightedWorkDescription}</p><p className="whitespace-pre-wrap"><strong>Ownership basis:</strong> {claim.ownershipBasis}</p><p className="whitespace-pre-wrap">{claim.details}</p>
    {safeUrl ? <a href={safeUrl} target="_blank" rel="noreferrer" className="break-all text-primary underline">Original source</a> : null}
    {["RECEIVED", "IN_REVIEW"].includes(claim.status) ? <><DecisionNote value={reason} onChange={setReason} /><div className="flex flex-wrap gap-2">{(["IN_REVIEW", "RESOLVED", "DISMISSED"] as const).map((status) => <Button key={status} variant="outline" disabled={pending || reason.trim().length < 3 || status === claim.status} onClick={() => run(() => forumApi.reviewCopyrightClaim(claim.id, status, reason.trim()))}>{status === "IN_REVIEW" ? "Start review" : status === "RESOLVED" ? "Resolve claim" : "Dismiss claim"}</Button>)}</div></> : <p className="whitespace-pre-wrap">{claim.resolutionNote}</p>}
  </ReviewCard>;
}
