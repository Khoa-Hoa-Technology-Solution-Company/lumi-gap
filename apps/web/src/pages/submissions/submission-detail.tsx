import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bot, Play, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VersionHistory } from "@/features/submissions/components/version-history";
import { SubmitReviewDialog } from "@/features/reviews/components/submit-review-dialog";
import {
  useAddSubmissionRevision,
  useAiPreReviews,
  useRunAiPreReview,
  useSubmission,
  useSubmissionHistory,
} from "@/features/submissions";

import { projectSubmissionPath } from "@/features/submissions/project-submission-path";

export function SubmissionDetailPage({ submissionId, projectId, readOnly = false }: { submissionId?: string; projectId?: string; readOnly?: boolean }) {
  const { id: routeId = "" } = useParams();
  const id = submissionId ?? routeId;
  const backPath = projectId ? projectSubmissionPath(projectId) : "/submissions";
  const Heading = projectId ? "h2" : "h1";
  const submission = useSubmission(id, projectId);
  const scopedAccess = Boolean(submission.data) && !submission.error;
  const history = useSubmissionHistory(id, scopedAccess);
  const addRevision = useAddSubmissionRevision(id);
  const preReviews = useAiPreReviews(id, scopedAccess);
  const runPreReview = useRunAiPreReview(id);
  const [file, setFile] = useState<File>();
  const [response, setResponse] = useState("");
  const [showRevision, setShowRevision] = useState(false);

  if (submission.isLoading) return <div className="mx-auto max-w-5xl px-4 py-10"><div className="h-80 animate-pulse rounded-lg bg-muted" /></div>;
  if (!submission.data || submission.error) return <div className="py-6"><Link to={backPath} className="text-sm text-primary">Back to submissions</Link><div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Submission not found or you do not have access.</div></div>;

  const data = submission.data;
  const canRevise = !readOnly && history.data?.canManage === true && !["accepted", "rejected", "withdrawn"].includes(data.status);
  const latestPreReview = preReviews.data?.[0];
  const preReviewRunning = latestPreReview?.status === "QUEUED" || latestPreReview?.status === "PROCESSING";
  const preReviewFailed = latestPreReview?.status === "FAILED";

  async function uploadRevision() {
    if (!file) return toast.error("Choose a PDF revision");
    if (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) return toast.error("Use a PDF no larger than 10 MB");
    try {
      await addRevision.mutateAsync({ file, responseToReview: response || undefined });
      toast.success("Immutable revision uploaded");
      setFile(undefined); setResponse(""); setShowRevision(false);
    } catch { toast.error("Could not upload this revision"); }
  }

  return <div className={projectId ? "project-submission-detail" : "mx-auto w-full max-w-5xl px-4 py-8 sm:px-6"}>
    <Link to={backPath} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" />Back to submissions</Link>
    <header className="mt-5 rounded-lg border border-border bg-card p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div>
        <div className="flex flex-wrap gap-2"><Badge variant="outline">{data.submissionType?.replaceAll("_", " ") || "Submission"}</Badge><Badge>{data.status.replaceAll("_", " ")}</Badge><Badge variant="secondary">Revision {data.currentRevisionNumber}</Badge></div>
        <Heading className="mt-4 text-2xl font-semibold tracking-tight">{data.title}</Heading><p className="mt-2 text-sm text-muted-foreground">{data.researchField || "Research field not specified"}</p>
      </div>{canRevise ? <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setShowRevision((value) => !value)}><Upload />New PDF version</Button><SubmitReviewDialog submissionId={id} artifactTitle={data.title} artifactType={data.submissionType} /></div> : null}</div>
      {data.abstract ? <p className="mt-4 text-sm leading-6 text-muted-foreground">{data.abstract}</p> : null}
    </header>

    <section className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><Bot className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h2 className="font-semibold">AI pre-review · advisory only</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Surfaces alignment, unsupported claims and human review focus areas. It does not prove novelty, validate a research gap, or replace a reviewer.</p></div></div>{canRevise ? <Button size="sm" onClick={() => runPreReview.mutateAsync().then(() => toast.success("AI pre-review queued")).catch((error: { response?: { data?: { error?: { message?: string } } } }) => toast.error(error.response?.data?.error?.message ?? "AI pre-review is unavailable or not configured"))} disabled={runPreReview.isPending || preReviewRunning}><Play />{runPreReview.isPending || preReviewRunning ? "Analyzing…" : "Run pre-review"}</Button> : null}</div>
      {preReviewRunning ? <p className="mt-4 text-sm text-primary">AI pre-review is running. Results appear here when it finishes.</p> : null}
      {preReviewFailed ? <p className="mt-4 text-sm text-red-700 dark:text-red-400">{latestPreReview?.errorMessage ?? "AI pre-review failed."}</p> : null}
      {latestPreReview?.status === "COMPLETED" ? <div className="mt-5 grid gap-4 border-t border-primary/20 pt-5 md:grid-cols-2"><div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Summary</h3><p className="mt-2 text-sm leading-6">{latestPreReview.summary}</p>{latestPreReview.goalAlignment ? <p className="mt-3 text-sm"><strong>Goal alignment:</strong> {latestPreReview.goalAlignment.assessment}</p> : null}</div><div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Human review focus</h3><ul className="mt-2 space-y-1.5 text-sm">{latestPreReview.reviewFocusAreas.map((item) => <li key={item}>• {item}</li>)}</ul>{latestPreReview.limitations.length ? <div className="mt-4 rounded-lg bg-background/70 p-3 text-xs text-muted-foreground"><strong>Analysis limitations:</strong> {latestPreReview.limitations.join(" ")}</div> : null}</div></div> : null}
    </section>

    {history.data ? <VersionHistory id={id} history={history.data} readOnly={readOnly || ["accepted", "rejected", "withdrawn"].includes(data.status)} /> : <p className="mt-6 text-sm text-muted-foreground">{history.error ? "Không thể tải lịch sử phiên bản. Hãy tải lại trang." : "Đang tải lịch sử phiên bản…"}</p>}
    {showRevision && canRevise ? <section className="mt-6 rounded-xl border bg-card p-5"><h2 className="font-semibold">Upload a new PDF version</h2><label className="mt-3 block text-sm">PDF file<input type="file" accept="application/pdf,.pdf" className="mt-2 block w-full min-w-0 text-xs" onChange={(event) => setFile(event.target.files?.[0])} /></label><label className="mt-3 block text-sm">Revision summary<textarea className="mt-2 min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={response} onChange={(event) => setResponse(event.target.value)} /></label><Button className="mt-3" size="sm" onClick={uploadRevision} disabled={!file || addRevision.isPending}>Upload version</Button></section> : null}
    <section className="mt-6 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2"><Claim title="Research goal" value={data.researchGoal} /><Claim title="Research questions" value={data.researchQuestions?.map((item, index) => `${index + 1}. ${item}`).join("\n")} preserve /><Claim title="Claimed research gap" value={data.claimedResearchGap} /><Claim title="Claimed contribution" value={data.claimedContribution} /><Claim title="Methodology" value={data.methodology} /><Claim title="Scope" value={data.scope} /></section>
  </div>;
}

function Claim({ title, value, preserve }: { title: string; value?: string; preserve?: boolean }) {
  return <article className="rounded-lg border border-border bg-card p-5"><h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</h2><p className={`mt-3 text-sm leading-6 text-foreground  ${preserve ? "whitespace-pre-line" : ""}`}>{value || "Not specified"}</p></article>;
}
