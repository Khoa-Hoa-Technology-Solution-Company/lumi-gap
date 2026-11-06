import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bot, Play, Upload, Send, FileText, Download } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmissionIntroductionView } from "@/features/submissions/components/submission-introduction-view";
import { VersionHistory } from "@/features/submissions/components/version-history";
import { SubmitReviewDialog } from "@/features/reviews/components/submit-review-dialog";
import { SubmissionReviewProgress } from "@/features/submissions/components/submission-review-progress";
import { useI18n } from "@/i18n";
import {
  useAddSubmissionRevision,
  useCreateSubmissionVersion,
  submissionsApi,
  useAiPreReviews,
  useRunAiPreReview,
  useSubmission,
  useSubmissionHistory,
} from "@/features/submissions";

import { projectSubmissionPath } from "@/features/submissions/project-submission-path";

export function SubmissionDetailPage({ submissionId, projectId, readOnly = false }: { submissionId?: string; projectId?: string; readOnly?: boolean }) {
  const { t, language } = useI18n();
  const uploading = useRef(false);
  const { id: routeId = "" } = useParams();
  const id = submissionId ?? routeId;
  const backPath = projectId ? projectSubmissionPath(projectId) : "/submissions";
  const Heading = projectId ? "h2" : "h1";
  const submission = useSubmission(id, projectId);
  const scopedAccess = Boolean(submission.data) && !submission.error;
  const history = useSubmissionHistory(id, scopedAccess);
  const addRevision = useAddSubmissionRevision(id);
  const createVersion = useCreateSubmissionVersion(id);
  const preReviews = useAiPreReviews(id, scopedAccess);
  const runPreReview = useRunAiPreReview(id);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [revisionFile, setRevisionFile] = useState<File>();
  const [revisionResponse, setRevisionResponse] = useState("");
  const [revisionContent, setRevisionContent] = useState("");
  const [revisionMode, setRevisionMode] = useState<"PDF" | "TEXT">("PDF");
  const [showRevision, setShowRevision] = useState(false);

  if (submission.isLoading) return <div className="mx-auto max-w-5xl px-4 py-10"><div className="h-80 animate-pulse rounded-lg bg-muted" /></div>;
  if (!submission.data || submission.error) return <div className="py-6"><Link to={backPath} className="text-sm text-primary">Back to submissions</Link><div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700" role="alert">{t("Unable to load this submission. It may be unavailable or you may not have access.")}<Button variant="outline" className="mt-3 block" disabled={submission.isFetching} onClick={() => void submission.refetch()}>{t("Retry")}</Button></div></div>;

  const data = submission.data;
  const canRevise = !readOnly && history.data?.canManage === true && !["accepted", "rejected", "withdrawn"].includes(data.status);
  const canRequestReview = !readOnly && history.data?.canRequestReview === true && !["accepted", "rejected", "withdrawn"].includes(data.status);
  const canRunPreReview = !readOnly && history.data?.canRunAiPreReview === true && !["completed", "accepted", "rejected", "withdrawn"].includes(data.status);
  // Extract versions and current version
  const versions = history.data?.versions ?? [];
  const currentVersion = versions.find(v => v.id === selectedVersionId)
    ?? versions.find(v => v.id === data.currentRevisionId)
    ?? versions.reduce<(typeof versions)[number] | undefined>((latest, version) => !latest || version.revisionNumber > latest.revisionNumber ? version : latest, undefined)
    ?? {
    id: data.currentRevisionId ?? "",
    revisionNumber: data.currentRevisionNumber ?? 1,
    hasPdf: false,
    contentSnapshot: "",
    reviews: [],
    createdAt: data.updatedAt,
  };

  const paragraphs: string[] = (currentVersion.contentSnapshot ?? "")
    .split(/\n\s*\n/)
    .map((p: string) => p.trim())
    .filter(Boolean);
  const revisionPending = addRevision.isPending || createVersion.isPending;


  const researchDetails = [
    { title: "Research goal", value: data.researchGoal },
    { title: "Research questions", value: data.researchQuestions?.map((item, index) => `${index + 1}. ${item}`).join("\n"), preserve: true },
    { title: "Claimed research gap", value: data.claimedResearchGap },
    { title: "Claimed contribution", value: data.claimedContribution },
    { title: "Methodology", value: data.methodology },
    { title: "Scope", value: data.scope },
  ].filter(item => item.value?.trim());
  const latestPreReview = preReviews.data?.[0];
  const preReviewRunning = latestPreReview?.status === "QUEUED" || latestPreReview?.status === "PROCESSING";
  const preReviewFailed = latestPreReview?.status === "FAILED";
  const preReviewOutdated = latestPreReview?.sourceRevisionId !== undefined && latestPreReview.sourceRevisionId !== data.currentRevisionId;

  async function uploadRevision() {
    if (uploading.current) return;
    if (revisionMode === "PDF" && !revisionFile) {
      toast.error("Choose a PDF revision");
      return;
    }
    if (revisionMode === "PDF" && revisionFile && (revisionFile.type !== "application/pdf" || revisionFile.size === 0 || revisionFile.size > 10 * 1024 * 1024)) {
      toast.error("Use a PDF no larger than 10 MB");
      return;
    }
    if (revisionMode === "TEXT" && (!revisionContent.trim() || revisionResponse.trim().length < 3)) {
      toast.error("Nhập nội dung bản thảo và mô tả thay đổi ít nhất 3 ký tự");
      return;
    }

    uploading.current = true;
    try {
      if (revisionMode === "PDF") {
        await addRevision.mutateAsync({ file: revisionFile!, responseToReview: revisionResponse || undefined });
      } else {
        await createVersion.mutateAsync({ content: revisionContent.trim(), summary: revisionResponse.trim(), expectedRevisionNumber: data.currentRevisionNumber });
      }
      toast.success("Immutable revision uploaded");
      setRevisionFile(undefined);
      setRevisionResponse("");
      setRevisionContent("");
      setSelectedVersionId("");
      setShowRevision(false);
    } catch {
      toast.error("Could not upload this revision");
    } finally {
      uploading.current = false;
    }
  }

  return <div className={projectId ? "project-submission-detail" : "mx-auto w-full max-w-5xl px-4 py-8 sm:px-6"}>
    <Link to={backPath} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" />Back to submissions</Link>
    <header className="mt-5 rounded-lg border border-border bg-card p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div>
        <div className="flex flex-wrap gap-2"><Badge variant="outline">{data.submissionType?.replaceAll("_", " ") || "Submission"}</Badge><Badge>{data.status.replaceAll("_", " ")}</Badge><Badge variant="secondary">Revision {data.currentRevisionNumber}</Badge></div>
        <Heading className="mt-4 text-2xl font-semibold tracking-tight">{data.title}</Heading><p className="mt-2 text-sm text-muted-foreground">{data.researchField || "Research field not specified"}</p>
      </div><div className="flex flex-wrap gap-2">{canRevise ? <Button variant="outline" onClick={() => setShowRevision((value) => !value)} disabled={revisionPending}><Upload />New PDF version</Button> : null}{canRequestReview ? <SubmitReviewDialog submissionId={id} artifactTitle={data.title} artifactType={data.submissionType} /> : null}</div></div>
      {data.abstract ? <div className="mt-5 border-t border-border pt-5"><SubmissionIntroductionView content={data.abstract} /></div> : null}
    </header>

    {history.data ? <SubmissionReviewProgress history={history.data} refreshing={history.isFetching || submission.isFetching} onRefresh={() => void Promise.all([submission.refetch(), history.refetch()])} /> : null}

    <section className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><Bot className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h2 className="font-semibold">AI pre-review · advisory only</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Surfaces alignment, unsupported claims and human review focus areas. It does not prove novelty, validate a research gap, or replace a reviewer.</p></div></div>{canRunPreReview ? <Button size="sm" onClick={() => runPreReview.mutateAsync().then(() => toast.success("AI pre-review queued")).catch((error: { response?: { data?: { error?: { message?: string } } } }) => toast.error(error.response?.data?.error?.message ?? "AI pre-review is unavailable or not configured"))} disabled={runPreReview.isPending || preReviewRunning}><Play />{runPreReview.isPending || preReviewRunning ? "Analyzing…" : "Run pre-review"}</Button> : null}</div>
      {preReviews.error ? <div className="mt-4" role="alert"><p className="text-sm">{t("Unable to load AI pre-reviews.")}</p><Button size="sm" variant="outline" disabled={preReviews.isFetching} onClick={() => void preReviews.refetch()}>{t("Retry")}</Button></div> : null}
      {latestPreReview?.sourceRevisionNumber ? <p className="mt-4 text-sm text-muted-foreground">{t("Analyzed revision")} {latestPreReview.sourceRevisionNumber}</p> : null}
      {preReviewOutdated ? <p className="mt-2 text-sm font-medium" role="status">{t("This AI pre-review targets an earlier version. Run it again to analyze the current version.")}</p> : null}
      {latestPreReview?.status === "COMPLETED" && !latestPreReview.sourceRevisionId ? <p className="mt-4 text-sm text-muted-foreground">{t("This older AI result has no recorded version. Run pre-review again to analyze the current version.")}</p> : null}
      {latestPreReview?.status === "CANCELLED" ? <p className="mt-4 text-sm text-muted-foreground">{t("AI pre-review was cancelled. Its source may be unavailable, closed or archived.")}</p> : null}
      {preReviewRunning ? <p className="mt-4 text-sm text-primary">AI pre-review is running. Results appear here when it finishes.</p> : null}
      {preReviewFailed ? <p className="mt-4 text-sm text-red-700 dark:text-red-400">{latestPreReview?.errorMessage ?? "AI pre-review failed."}</p> : null}
      {latestPreReview?.status === "COMPLETED" ? <div className="mt-5 grid gap-4 border-t border-primary/20 pt-5 md:grid-cols-2"><div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Summary</h3><p className="mt-2 text-sm leading-6">{latestPreReview.summary}</p>{latestPreReview.goalAlignment ? <p className="mt-3 text-sm"><strong>Goal alignment:</strong> {latestPreReview.goalAlignment.assessment}</p> : null}</div><div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Human review focus</h3><ul className="mt-2 space-y-1.5 text-sm">{latestPreReview.reviewFocusAreas.map((item) => <li key={item}>• {item}</li>)}</ul>{latestPreReview.limitations.length ? <div className="mt-4 rounded-lg bg-background/70 p-3 text-xs text-muted-foreground"><strong>Analysis limitations:</strong> {latestPreReview.limitations.join(" ")}</div> : null}</div>
        {latestPreReview.unsupportedClaims.length ? <div className="md:col-span-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unsupported claims</h3><ul className="mt-2 space-y-3 text-sm">{latestPreReview.unsupportedClaims.map((item, index) => <li key={index} className="rounded-lg border bg-background/70 p-3">{item.quote ? <blockquote className="border-l-2 pl-3 italic text-muted-foreground">“{item.quote}”</blockquote> : <p className="font-medium">{item.claim}</p>}<p className="mt-2">{item.reason}</p><p className="mt-1 text-xs text-muted-foreground">AI suggestion — verify</p></li>)}</ul></div> : null}
        {latestPreReview.citationIssues.length ? <div className="md:col-span-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Citation issues</h3><ul className="mt-2 space-y-1.5 text-sm">{latestPreReview.citationIssues.map((item, index) => <li key={index}>• {item}</li>)}</ul></div> : null}
        {latestPreReview.contributionComparison ? <div className="md:col-span-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contribution comparison</h3><p className="mt-2 text-sm leading-6">{latestPreReview.contributionComparison}</p></div> : null}</div> : null}
    </section>

        {/* Version Switcher Bar */}
        {versions.length > 1 && (
          <div className="mt-5 border-t border-border pt-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-muted-foreground mr-1">Lịch sử phiên bản:</span>
              {versions.map((v: any) => {
                const isSelected = (currentVersion?.id === v.id);
                const hasFeedback = v.reviews && v.reviews.length > 0;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVersionId(v.id)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors ${
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span>v{v.revisionNumber}</span>
                    {hasFeedback && (
                      <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-primary-foreground" : "bg-primary"}`} />
                    )}
                    <span className="text-[10px] opacity-75">
                      ({new Date(v.createdAt).toLocaleDateString(language, { month: 'numeric', day: 'numeric' })})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}


          {/* Manuscript Content Box */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-xs">
            <div className="flex items-center justify-between border-b border-border/80 pb-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-base">Nội dung bản thảo (v{currentVersion?.revisionNumber ?? 1})</h3>
              </div>
              {currentVersion?.hasPdf && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs h-8"
                  onClick={() => submissionsApi.downloadRevision(id, currentVersion.id, currentVersion.revisionNumber)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Tải PDF
                </Button>
              )}
            </div>

            {/* Content view */}
            <div className="mt-5">
              {currentVersion?.contentSnapshot ? (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground italic mb-2">
                    Nội dung văn bản được đánh số đoạn để tiện theo dõi góp ý:
                  </p>
                  {paragraphs.map((p: string, index: number) => (
                    <div
                      key={index}
                      id={`para-${index + 1}`}
                      className="group rounded-lg border border-transparent p-3 transition-colors hover:border-primary/20 hover:bg-muted/30"
                    >
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                        <span className="font-semibold text-primary/80">Đoạn {index + 1}</span>

                      </div>
                      <p className="text-sm leading-relaxed text-foreground break-words">{p}</p>
                    </div>
                  ))}
                </div>
              ) : currentVersion?.hasPdf ? (
                <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center space-y-3">
                  <FileText className="mx-auto h-10 w-10 text-primary/60" />
                  <h4 className="font-medium text-sm">Bản thảo định dạng PDF</h4>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Bản nộp đính kèm tệp PDF đầy đủ. Bạn có thể tải tệp về để đọc hoặc xem các ghi chú bên cạnh.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => submissionsApi.downloadRevision(id, currentVersion.id, currentVersion.revisionNumber)}
                  >
                    <Download className="h-4 w-4" />
                    Tải tệp PDF (v{currentVersion.revisionNumber})
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic py-6 text-center">
                  Nội dung bản thảo đang được cập nhật.
                </p>
              )}
            </div>
          </section>


    {history.data ? <VersionHistory id={id} history={history.data} readOnly={readOnly || ["accepted", "rejected", "withdrawn"].includes(data.status)} /> : <div className="mt-6 text-sm text-muted-foreground" role={history.error ? "alert" : "status"}>{history.error ? <><p>{t("Unable to load version history and review requests.")}</p><Button variant="outline" className="mt-3" disabled={history.isFetching} onClick={() => void history.refetch()}>{t("Retry")}</Button></> : "Đang tải lịch sử phiên bản…"}</div>}
      {/* Revision Upload Section */}
      {showRevision && canRevise && (
        <section className="mt-6 rounded-xl border border-primary/30 bg-card p-6 shadow-sm">
          <h2 className="font-semibold">{t("Upload a new PDF version")}</h2>
          <fieldset disabled={revisionPending}>
            <div className="mt-3 flex rounded-lg border bg-muted/40 p-0.5 text-xs w-fit">
              <button
                type="button"
                className={`rounded-md px-3 py-1 font-medium transition-colors ${revisionMode === "PDF" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setRevisionMode("PDF")}
              >
                Tải PDF mới
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1 font-medium transition-colors ${revisionMode === "TEXT" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setRevisionMode("TEXT")}
              >
                Cập nhật văn bản
              </button>
            </div>

            <label className="mt-3 block text-sm font-medium">
              {t("Revision summary")}
              <textarea
                className="mt-1.5 min-h-20 w-full rounded-md border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Tóm tắt ngắn gọn các điểm nhóm đã tiếp thu và sửa đổi theo góp ý của Mentor..."
                value={revisionResponse}
                maxLength={20000}
                onChange={e => setRevisionResponse(e.target.value)}
              />
            </label>

            {revisionMode === "PDF" ? (
              <label className="mt-3 block text-sm font-medium">
                {t("PDF file")}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="mt-1.5 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
                  onChange={e => setRevisionFile(e.target.files?.[0])}
                />
              </label>
            ) : (
              <label className="mt-3 block text-sm font-medium">
                Nội dung bản thảo mới
                <textarea
                  className="mt-1.5 min-h-40 w-full rounded-md border border-input bg-background p-3 text-xs font-mono leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Dán nội dung bản thảo đã chỉnh sửa..."
                  value={revisionContent}
                  maxLength={500000}
                  onChange={e => setRevisionContent(e.target.value)}
                  rows={8}
                />
              </label>
            )}

            <div className="flex justify-end gap-2 pt-3">
              <Button variant="ghost" size="sm" onClick={() => setShowRevision(false)}>
                Hủy
              </Button>
              <Button size="sm" onClick={uploadRevision} disabled={revisionPending || (revisionMode === "PDF" ? !revisionFile : !revisionContent.trim() || revisionResponse.trim().length < 3)}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {t("Upload version")}
              </Button>
            </div>
          </fieldset>
        </section>
      )}


    {researchDetails.length ? <section className="mt-6 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">{researchDetails.map(item => <Claim key={item.title} {...item} />)}</section> : null}
  </div>;
}

function Claim({ title, value, preserve }: { title: string; value?: string; preserve?: boolean }) {
  return <article className="rounded-lg border border-border bg-card p-5"><h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</h2><p className={`mt-3 text-sm leading-6 text-foreground  ${preserve ? "whitespace-pre-line" : ""}`}>{value || "Not specified"}</p></article>;
}
