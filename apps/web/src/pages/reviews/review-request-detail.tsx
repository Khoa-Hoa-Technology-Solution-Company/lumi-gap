import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock3, FileText, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useReviewRequest, useReviewRequestAction } from "@/features/reviews";
import { useSubmissionRevisions } from "@/features/submissions";
import { useAuthStore } from "@/stores/auth-store";

const DEFAULT_REVIEW_WINDOW_DAYS = 30; // backend DEFAULT_REVIEW_WINDOW_DAYS, used when a request has no due date

export function ReviewRequestDetailPage() {
  const { requestId = "" } = useParams();
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const query = useReviewRequest(requestId);
  const actions = useReviewRequestAction();
  const submissionId = query.data?.artifact.submissionId ?? "";
  const revisions = useSubmissionRevisions(submissionId);
  const [selectedVersion, setSelectedVersion] = useState("");
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [cancelOpen, setCancelOpen] = useState(false);
  const detail = query.data;
  const openItems = useMemo(() => detail?.reviews.flatMap((review) => review.requiredRevisions).filter((item) => ["OPEN", "REOPENED"].includes(item.status)) ?? [], [detail]);

  useEffect(() => { setResponses(Object.fromEntries(openItems.map((item) => [item.id, ""]))); }, [openItems]);
  if (query.isLoading) return <main className="mx-auto max-w-5xl px-4 py-10"><div className="h-80 animate-pulse rounded-2xl bg-muted" /></main>;
  if (!detail || query.error) return <main className="mx-auto max-w-3xl px-4 py-16"><div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">This review request is unavailable or you do not have access.</div></main>;
  const isRequester = currentUser?.id === detail.requester.id;
  // Mirrors the backend rule: cancel before acceptance, or after the deadline of an accepted review.
  const deadline = detail.dueAt ? new Date(detail.dueAt) : new Date(new Date(detail.createdAt).getTime() + DEFAULT_REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const acceptedNotOverdue = ["ACCEPTED", "IN_REVIEW"].includes(detail.status) && deadline.getTime() >= Date.now();
  const canCancel = isRequester && (detail.status === "REQUESTED" || (["ACCEPTED", "IN_REVIEW"].includes(detail.status) && !acceptedNotOverdue));
  const canResubmit = isRequester && detail.status === "REVISION_REQUESTED" && openItems.length > 0;
  const pdfOptions = revisions.data?.filter((item) => item.revisionNumber > detail.artifact.revisionNumber) ?? [];

  async function resubmit() {
    if (!detail) return;
    if (!selectedVersion) return toast.error("Select the revised artifact version");
    if (openItems.some((item) => !responses[item.id]?.trim())) return toast.error("Respond to every required revision");
    try {
      await actions.resubmit.mutateAsync({ id: detail.id, input: {
        revisionId: selectedVersion,
        responses: openItems.map((item) => ({ revisionItemId: item.id, responseText: (responses[item.id] ?? "").trim() })),
      } });
      toast.success("Revision resubmitted to the reviewer");
      await query.refetch();
    } catch (error) {
      const message = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(message || "Could not resubmit this revision");
    }
  }

  return <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
    <div className="flex items-center justify-between"><Link to="/reviews" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Review Center</Link>{canCancel ? <Button variant="ghost" className="text-red-600" onClick={() => setCancelOpen(true)}>Cancel request</Button> : null}</div>
    <header className="mt-5 border-b pb-6"><div className="flex flex-wrap items-center gap-2"><Badge>{detail.status.replaceAll("_", " ")}</Badge><Badge variant="outline">{detail.artifact.type?.replaceAll("_", " ") || "Research artifact"}</Badge><Badge variant="secondary">Revision {detail.artifact.revisionNumber}</Badge></div><h1 className="mt-4 text-2xl font-semibold">{detail.artifact.title}</h1><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">Requested by</dt><dd className="mt-1 font-medium">{detail.requester.fullName}</dd></div><div><dt className="text-muted-foreground">Reviewer</dt><dd className="mt-1 font-medium">{detail.reviewer.fullName}</dd></div><div><dt className="text-muted-foreground">Due date</dt><dd className="mt-1 font-medium">{detail.dueAt ? new Date(detail.dueAt).toLocaleDateString() : "No due date"}</dd></div></dl>{detail.message ? <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">{detail.message}</p> : null}{isRequester && acceptedNotOverdue ? <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-300">The reviewer has accepted this request, so it can no longer be cancelled. If the review is still not delivered after {deadline.toLocaleDateString()}, you can cancel it and invite another reviewer.</p> : null}</header>

    <section className="mt-6 rounded-xl border bg-card p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Template v{detail.templateVersion.versionNumber}</p><h2 className="mt-1 text-lg font-semibold">{detail.templateVersion.reviewMode.replaceAll("_", " ")}</h2></div><Badge variant="outline">{detail.templateVersion.criteria.length} criteria</Badge></div></section>

    <section className="mt-8"><h2 className="text-lg font-semibold">Review History</h2>{detail.reviews.length ? <div className="mt-4 space-y-6">{detail.reviews.map((review) => <article key={review.id} className="rounded-xl border bg-card"><header className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><p className="text-xs text-muted-foreground">Review Round {review.roundNumber} · Version {revisions.data?.find((item) => item._id === review.revisionId)?.revisionNumber ?? "?"} · {review.weightedScore != null ? `Score ${review.weightedScore.toFixed(2)}` : "No rubric score"}</p><p className="mt-1 font-semibold">{review.overallAssessment?.replaceAll("_", " ") || review.status}</p></div>{review.submittedAt ? <span className="text-xs text-muted-foreground">Submitted {new Date(review.submittedAt).toLocaleDateString()}</span> : null}</header><div className="grid gap-5 p-5 sm:grid-cols-2">{review.keyStrengths ? <Summary title="Key Strengths" value={review.keyStrengths} /> : null}{review.keyConcerns ? <Summary title="Key Concerns" value={review.keyConcerns} /> : null}{review.overallComment ? <div className="sm:col-span-2"><Summary title="Overall Comment" value={review.overallComment} /></div> : null}</div><div className="divide-y border-t">{detail.templateVersion.criteria.map((criterion) => { const response = review.responses.find((item) => item.criterionKey === criterion.key); if (!response) return null; return <div key={criterion.key} className="p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{criterion.title}</h3>{response.assessment ? <Badge variant="outline">{response.assessment.replaceAll("_", " ")}</Badge> : null}{response.score !== undefined && response.score !== null ? <Badge variant="outline">Score {response.score}</Badge> : null}</div>{response.comment ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{response.comment}</p> : null}{response.evidence ? <p className="mt-2 text-xs text-muted-foreground"><strong>Reference:</strong> {response.evidence}</p> : null}</div>; })}</div>{review.requiredRevisions.length ? <div className="border-t bg-amber-50/50 p-5 dark:bg-amber-950/10"><h3 className="font-semibold">Required Revisions</h3><ul className="mt-3 space-y-2">{review.requiredRevisions.map((item) => <li key={item.id} className="flex gap-3 text-sm"><span className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.priority === "MAJOR" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{item.priority}</span><span>{item.description}{item.responses?.map((response) => <span key={response.submissionRevisionId} className="mt-2 block text-xs text-muted-foreground">Author response: {response.responseText} · {response.status}</span>)}</span><Badge variant="outline" className="ml-auto">{item.status}</Badge></li>)}</ul></div> : null}</article>)}</div> : <div className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground"><Clock3 className="mx-auto mb-3 h-6 w-6" />The reviewer has not submitted feedback yet.</div>}</section>

    {canResubmit ? <section className="mt-8 rounded-xl border border-blue-200 bg-blue-50/30 p-5 dark:border-blue-900 dark:bg-blue-950/10"><div className="flex gap-3"><RotateCcw className="mt-0.5 h-5 w-5 text-blue-700" /><div><h2 className="font-semibold">Respond and Submit Revision</h2><p className="mt-1 text-sm text-muted-foreground">Update the artifact first, then explain how each required revision was addressed.</p></div></div><label className="mt-5 block text-sm font-medium">Revised artifact version<select value={selectedVersion} onChange={(event) => setSelectedVersion(event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">Select revised version</option>{pdfOptions.map((revision) => <option key={revision._id} value={revision._id}>Revision {revision.revisionNumber} · {new Date(revision.createdAt).toLocaleDateString()}</option>)}</select></label><Link to={`/submissions/${submissionId}`} className="mt-2 inline-block text-sm text-blue-700">Manage versions / upload or edit the revised article</Link><div className="mt-5 space-y-3">{openItems.map((item) => <label key={item.id} className="block rounded-lg border bg-background p-4 text-sm font-medium"><span className="flex items-center gap-2"><Badge variant="outline">{item.priority}</Badge>{item.description}</span><textarea value={responses[item.id] ?? ""} onChange={(event) => setResponses((current) => ({ ...current, [item.id]: event.target.value }))} className="mt-3 min-h-24 w-full rounded-md border px-3 py-2 text-sm font-normal" placeholder="Describe the change and where the reviewer can find it." /></label>)}</div><div className="mt-5 flex justify-end"><Button onClick={resubmit} disabled={actions.resubmit.isPending}><Send className="h-4 w-4" />{actions.resubmit.isPending ? "Submitting…" : "Submit Revision"}</Button></div></section> : null}

    {detail.status === "COMPLETED" ? <div className="mt-8 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300"><CheckCircle2 className="h-5 w-5" /><span>This academic review is complete. Every review round remains available above.</span></div> : null}

    <Dialog open={cancelOpen} onOpenChange={setCancelOpen}><DialogContent><DialogHeader><DialogTitle>Cancel this review request?</DialogTitle><DialogDescription>The reviewer will lose access to the assigned review workspace. Existing submitted feedback is never deleted.</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => setCancelOpen(false)}>Keep request</Button><Button variant="destructive" onClick={async () => { try { await actions.cancel.mutateAsync(detail.id); toast.success("Review request cancelled"); navigate("/reviews"); } catch { toast.error("This request can no longer be cancelled"); } }}>Cancel request</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}

function Summary({ title, value }: { title: string; value: string }) { return <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{value}</p></div>; }
