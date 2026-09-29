import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpenCheck, Check, Clock3, FileCheck2, Inbox, Send, Shapes } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useReviewCenter, useReviewRequestAction, type ReviewCenterItem } from "@/features/reviews";

type CenterTab = "incoming" | "sent" | "progress" | "completed";
const activeStatuses = new Set(["ACCEPTED", "IN_REVIEW", "RESUBMITTED"]);
const finalStatuses = new Set(["COMPLETED", "DECLINED", "CANCELLED", "EXPIRED"]);

function statusClass(status: string) {
  if (status === "COMPLETED") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300";
  if (["DECLINED", "CANCELLED", "EXPIRED"].includes(status)) return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300";
  if (["REQUESTED", "REVISION_REQUESTED"].includes(status)) return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300";
  return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300";
}

export function ReviewDashboardPage() {
  const query = useReviewCenter();
  const actions = useReviewRequestAction();
  const [tab, setTab] = useState<CenterTab>("incoming");
  const [declining, setDeclining] = useState<ReviewCenterItem>();
  const [declineReason, setDeclineReason] = useState("");
  const data = query.data ?? { incoming: [], sent: [] };
  const items = useMemo(() => {
    if (tab === "incoming") return data.incoming.filter((item) => item.status === "REQUESTED");
    if (tab === "sent") return data.sent.filter((item) => !finalStatuses.has(item.status));
    if (tab === "progress") return data.incoming.filter((item) => activeStatuses.has(item.status));
    const byId = new Map([...data.incoming, ...data.sent].filter((item) => finalStatuses.has(item.status)).map((item) => [item.id, item]));
    return [...byId.values()];
  }, [data.incoming, data.sent, tab]);
  const counts = {
    incoming: data.incoming.filter((item) => item.status === "REQUESTED").length,
    sent: data.sent.filter((item) => !finalStatuses.has(item.status)).length,
    progress: data.incoming.filter((item) => activeStatuses.has(item.status)).length,
    completed: new Set([...data.incoming, ...data.sent].filter((item) => finalStatuses.has(item.status)).map((item) => item.id)).size,
  };

  if (query.isLoading) return <main className="mx-auto max-w-6xl px-4 py-10"><div className="h-72 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" /></main>;
  if (query.error) return <main className="mx-auto max-w-3xl px-4 py-16"><div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">The Review Center could not be loaded. Refresh and try again.</div></main>;

  async function accept(item: ReviewCenterItem) {
    try { await actions.accept.mutateAsync(item.id); toast.success("Review request accepted"); setTab("progress"); }
    catch { toast.error("This request could not be accepted"); }
  }
  async function decline() {
    if (!declining) return;
    try { await actions.decline.mutateAsync({ id: declining.id, reason: declineReason || undefined }); toast.success("Review request declined"); setDeclining(undefined); setDeclineReason(""); }
    catch { toast.error("This request could not be declined"); }
  }

  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
    <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Academic review</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Review Center</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Manage invitations, active assessments, feedback you requested, and review history.</p></div><div className="flex gap-2"><Button asChild variant="outline"><Link to="/review-opportunities"><BookOpenCheck className="h-4 w-4" />Browse opportunities</Link></Button><Button asChild><Link to="/review-templates"><Shapes className="h-4 w-4" />Review Templates</Link></Button></div></header>

    <nav className="mt-6 flex gap-1 overflow-x-auto border-b" aria-label="Review Center sections">{([
      ["incoming", "Incoming", Inbox], ["sent", "Sent", Send], ["progress", "In Progress", Clock3], ["completed", "Completed", FileCheck2],
    ] as const).map(([value, label, Icon]) => <button key={value} type="button" onClick={() => setTab(value)} className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${tab === value ? "border-blue-600 text-blue-700" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icon className="h-4 w-4" />{label}<span className="rounded-full bg-muted px-2 py-0.5 text-xs">{counts[value]}</span></button>)}</nav>

    {items.length ? <div className="mt-6 divide-y rounded-2xl border bg-card">{items.map((item) => <article key={item.id} className="p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{item.artifact.type?.replaceAll("_", " ") || "Research artifact"}</Badge><span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(item.status)}`}>{item.status.replaceAll("_", " ")}</span><span className="text-xs text-muted-foreground">Revision {item.artifact.revisionNumber}</span></div><h2 className="mt-3 text-lg font-semibold">{item.artifact.title}</h2><p className="mt-1 text-sm text-muted-foreground">{tab === "sent" ? `Reviewer: ${item.reviewer.fullName}` : `Requested by ${item.requester.fullName}`}{item.dueAt ? ` · Due ${new Date(item.dueAt).toLocaleDateString()}` : ""}</p>{item.message ? <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{item.message}</p> : null}</div><div className="flex shrink-0 gap-2">{tab === "incoming" && item.status === "REQUESTED" ? <><Button variant="outline" onClick={() => setDeclining(item)}>Decline</Button><Button onClick={() => accept(item)} disabled={actions.accept.isPending}><Check className="h-4 w-4" />Accept</Button></> : activeStatuses.has(item.status) ? <Button asChild><Link to={`/reviews/${item.assignment.id}`}>{item.latestReview?.status === "DRAFT" ? "Continue Review" : "Start Review"}<ArrowRight className="h-4 w-4" /></Link></Button> : <Button asChild variant="outline"><Link to={`/review-requests/${item.id}`}>View Details<ArrowRight className="h-4 w-4" /></Link></Button>}</div></div></article>)}</div> : <div className="mt-8 rounded-2xl border border-dashed p-10 text-center"><Inbox className="mx-auto h-7 w-7 text-muted-foreground" /><h2 className="mt-3 font-semibold">{tab === "incoming" ? "No Incoming Reviews" : tab === "sent" ? "No active requests sent" : tab === "progress" ? "No reviews in progress" : "No completed review history"}</h2><p className="mt-2 text-sm text-muted-foreground">{tab === "incoming" ? "You don't have any review requests right now." : "Review activity will appear here when available."}</p></div>}

    <Dialog open={Boolean(declining)} onOpenChange={(value) => { if (!value) setDeclining(undefined); }}><DialogContent><DialogHeader><DialogTitle>Decline review request?</DialogTitle><DialogDescription>The requester will be notified. A short reason helps them choose another reviewer.</DialogDescription></DialogHeader><label className="text-sm font-medium">Reason (optional)<textarea value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} maxLength={2000} className="mt-2 min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Workload, subject mismatch, or conflict of interest" /></label><DialogFooter><Button variant="ghost" onClick={() => setDeclining(undefined)}>Keep request</Button><Button variant="destructive" onClick={decline} disabled={actions.decline.isPending}>Decline request</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}
