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

export function SubmissionDetailPage() {
  const { id = "" } = useParams();
  const submission = useSubmission(id);
  const history = useSubmissionHistory(id);
  const addRevision = useAddSubmissionRevision(id);
  const preReviews = useAiPreReviews(id);
  const runPreReview = useRunAiPreReview(id);
  const [file, setFile] = useState<File>();
  const [response, setResponse] = useState("");
  const [showRevision, setShowRevision] = useState(false);

  if (submission.isLoading) return <main className="mx-auto max-w-5xl px-4 py-10"><div className="h-80 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" /></main>;
  if (!submission.data || submission.error) return <main className="mx-auto max-w-3xl px-4 py-16"><div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Submission not found or you do not have access.</div></main>;

  const data = submission.data;
  const canRevise = history.data?.canManage === true && !["accepted", "rejected", "withdrawn"].includes(data.status);
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

  return <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
    <Link to="/submissions" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4" />Back to submissions</Link>
    <header className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div>
        <div className="flex flex-wrap gap-2"><Badge variant="outline">{data.submissionType?.replaceAll("_", " ") || "Submission"}</Badge><Badge>{data.status.replaceAll("_", " ")}</Badge><Badge variant="secondary">Revision {data.currentRevisionNumber}</Badge></div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{data.title}</h1><p className="mt-2 text-sm text-slate-500">{data.researchField || "Research field not specified"}</p>
      </div>{canRevise ? <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setShowRevision((value) => !value)}><Upload />New PDF version</Button><SubmitReviewDialog submissionId={id} artifactTitle={data.title} artifactType={data.submissionType} /></div> : null}</div>
      {data.abstract ? <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-400">{data.abstract}</p> : null}
    </header>

    <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900 dark:bg-blue-950/20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><Bot className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" /><div><h2 className="font-semibold">AI pre-review · advisory only</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-400">Surfaces alignment, unsupported claims and human review focus areas. It does not prove novelty, validate a research gap, or replace a reviewer.</p></div></div>{canRevise ? <Button size="sm" onClick={() => runPreReview.mutateAsync().then(() => toast.success("AI pre-review queued")).catch((error: { response?: { data?: { error?: { message?: string } } } }) => toast.error(error.response?.data?.error?.message ?? "AI pre-review is unavailable or not configured"))} disabled={runPreReview.isPending || preReviewRunning}><Play />{runPreReview.isPending || preReviewRunning ? "Analyzing…" : "Run pre-review"}</Button> : null}</div>
      {preReviewRunning ? <p className="mt-4 text-sm text-blue-800 dark:text-blue-300">AI pre-review is running. Results appear here when it finishes.</p> : null}
      {preReviewFailed ? <p className="mt-4 text-sm text-red-700 dark:text-red-400">{latestPreReview?.errorMessage ?? "AI pre-review failed."}</p> : null}
      {latestPreReview?.status === "COMPLETED" ? <div className="mt-5 grid gap-4 border-t border-blue-200 pt-5 dark:border-blue-900 md:grid-cols-2"><div><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</h3><p className="mt-2 text-sm leading-6">{latestPreReview.summary}</p>{latestPreReview.goalAlignment ? <p className="mt-3 text-sm"><strong>Goal alignment:</strong> {latestPreReview.goalAlignment.assessment}</p> : null}</div><div><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Human review focus</h3><ul className="mt-2 space-y-1.5 text-sm">{latestPreReview.reviewFocusAreas.map((item) => <li key={item}>• {item}</li>)}</ul>{latestPreReview.limitations.length ? <div className="mt-4 rounded-lg bg-white/70 p-3 text-xs text-slate-600 dark:bg-slate-950/40 dark:text-slate-400"><strong>Analysis limitations:</strong> {latestPreReview.limitations.join(" ")}</div> : null}</div></div> : null}
    </section>

    {history.data ? <VersionHistory id={id} history={history.data} readOnly={["accepted", "rejected", "withdrawn"].includes(data.status)} /> : <p className="mt-6 text-sm text-muted-foreground">{history.error ? "Không thể tải lịch sử phiên bản. Hãy tải lại trang." : "Đang tải lịch sử phiên bản…"}</p>}
    {showRevision && canRevise ? <section className="mt-6 rounded-xl border bg-card p-5"><h2 className="font-semibold">Upload a new PDF version</h2><label className="mt-3 block text-sm">PDF file<input type="file" accept="application/pdf,.pdf" className="mt-2 block w-full min-w-0 text-xs" onChange={(event) => setFile(event.target.files?.[0])} /></label><label className="mt-3 block text-sm">Revision summary<textarea className="mt-2 min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={response} onChange={(event) => setResponse(event.target.value)} /></label><Button className="mt-3" size="sm" onClick={uploadRevision} disabled={!file || addRevision.isPending}>Upload version</Button></section> : null}
    <section className="mt-6 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2"><Claim title="Research goal" value={data.researchGoal} /><Claim title="Research questions" value={data.researchQuestions?.map((item, index) => `${index + 1}. ${item}`).join("\n")} preserve /><Claim title="Claimed research gap" value={data.claimedResearchGap} /><Claim title="Claimed contribution" value={data.claimedContribution} /><Claim title="Methodology" value={data.methodology} /><Claim title="Scope" value={data.scope} /></section>
  </main>;
}

function Claim({ title, value, preserve }: { title: string; value?: string; preserve?: boolean }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-zinc-950"><h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</h2><p className={`mt-3 text-sm leading-6 text-slate-700 dark:text-slate-300 ${preserve ? "whitespace-pre-line" : ""}`}>{value || "Not specified"}</p></article>;
}
