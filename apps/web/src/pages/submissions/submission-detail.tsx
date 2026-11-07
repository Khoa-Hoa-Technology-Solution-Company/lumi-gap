import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Play,
  Upload,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  FileText,
  Send,
  MessageSquare,
  History,
  User,
  Plus,
  Trash2,
  Download,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmissionIntroductionView } from "@/features/submissions/components/submission-introduction-view";
import { VersionHistory } from "@/features/submissions/components/version-history";
import { SubmitReviewDialog } from "@/features/reviews/components/submit-review-dialog";
import { SubmissionReviewProgress } from "@/features/submissions/components/submission-review-progress";
import { submissionStatusBadge, submissionTypeBadge } from "./submission-list";
import { useI18n } from "@/i18n";
import {
  useAddSubmissionRevision,
  useCreateSubmissionVersion,
  useAiPreReviews,
  useRunAiPreReview,
  useSubmission,
  useSubmissionHistory,
  useSubmitFeedback,
  submissionsApi,
} from "@/features/submissions";
import { projectSubmissionPath } from "@/features/submissions/project-submission-path";

export function SubmissionDetailPage({
  submissionId,
  projectId,
  readOnly = false,
}: {
  submissionId?: string;
  projectId?: string;
  readOnly?: boolean;
}) {
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
  const submitFeedbackMutation = useSubmitFeedback(id);
  const preReviews = useAiPreReviews(id, scopedAccess);
  const runPreReview = useRunAiPreReview(id);

  // Active selected version
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");

  // Revision upload modal / section state
  const [showRevision, setShowRevision] = useState(false);
  const [revisionFile, setRevisionFile] = useState<File>();
  const [revisionResponse, setRevisionResponse] = useState("");
  const [revisionContent, setRevisionContent] = useState("");
  const [revisionMode, setRevisionMode] = useState<"PDF" | "TEXT">("PDF");

  // Mentor feedback state
  const [overallComment, setOverallComment] = useState("");
  const [requestedInformation, setRequestedInformation] = useState("");
  const [paragraphComments, setParagraphComments] = useState<Array<{ criterionKey: string; comment: string; evidence: string }>>([]);
  const [newCommentParagraph, setNewCommentParagraph] = useState("1");
  const [newCommentText, setNewCommentText] = useState("");
  const [newCommentQuote, setNewCommentQuote] = useState("");

  if (submission.isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="h-80 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!submission.data || submission.error) {
    return (
      <div className="py-6">
        <Link to={backPath} className="text-sm text-primary">
          Back to submissions
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700" role="alert">
          {t("Unable to load this submission. It may be unavailable or you may not have access.")}
          <Button variant="outline" className="mt-3 block" disabled={submission.isFetching} onClick={() => void submission.refetch()}>
            {t("Retry")}
          </Button>
        </div>
      </div>
    );
  }

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

  // Mentor evaluation permission & current feedback
  const canProvideFeedback = !readOnly && (history.data?.canProvideFeedback ?? (data as any).canProvideFeedback ?? false);
  const latestMentorReview = (currentVersion?.reviews && currentVersion.reviews.length > 0)
    ? currentVersion.reviews[currentVersion.reviews.length - 1]
    : null;

  const researchDetails = [
    { title: "Research goal", value: data.researchGoal },
    { title: "Research questions", value: data.researchQuestions?.map((item: string, index: number) => `${index + 1}. ${item}`).join("\n"), preserve: true },
    { title: "Claimed research gap", value: data.claimedResearchGap },
    { title: "Claimed contribution", value: data.claimedContribution },
    { title: "Methodology", value: data.methodology },
    { title: "Scope", value: data.scope },
  ].filter(item => Boolean(item.value?.trim()));

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

  function addParagraphComment() {
    if (!newCommentText.trim()) return;
    setParagraphComments(prev => [
      ...prev,
      {
        criterionKey: `Đoạn ${newCommentParagraph}`,
        comment: newCommentText.trim(),
        evidence: newCommentQuote.trim(),
      },
    ]);
    setNewCommentText("");
    setNewCommentQuote("");
  }

  function removeParagraphComment(index: number) {
    setParagraphComments(prev => prev.filter((_, i) => i !== index));
  }

  async function handleMentorSubmit(result: "FEEDBACK_GIVEN" | "REVISION_REQUESTED" | "READY_TO_ADVANCE") {
    if (!overallComment.trim()) {
      toast.error("Vui lòng ghi nhận xét tổng quan cho nhóm sinh viên");
      return;
    }

    try {
      await submitFeedbackMutation.mutateAsync({
        result,
        overallComment: overallComment.trim(),
        requestedInformation: requestedInformation.trim() || undefined,
        paragraphComments: paragraphComments.length > 0 ? paragraphComments : undefined,
      });
      toast.success("Đã hoàn tất góp ý cho bản thảo");
      setOverallComment("");
      setRequestedInformation("");
      setParagraphComments([]);
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message ?? "Không thể gửi góp ý");
    }
  }



  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Top Bar Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          to={backPath}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to submissions
        </Link>

        <div className="flex items-center gap-2">
          {history.data?.assignedMentor && (
            <div className="inline-flex items-center gap-1.5 rounded-full border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
              <User className="h-3.5 w-3.5 text-primary" />
              <span>Mentor: <strong>{history.data.assignedMentor.fullName}</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* Main Header / Title Card */}
      <header className="mt-4 rounded-xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {submissionTypeBadge(data.submissionType)}
              {submissionStatusBadge(data.status, t)}
              <span className="text-xs font-semibold text-muted-foreground">
                Phiên bản v{currentVersion?.revisionNumber ?? data.currentRevisionNumber ?? 1}
              </span>
            </div>

            <Heading className="mt-3.5 text-2xl font-bold tracking-tight break-words text-foreground">
              {data.title}
            </Heading>
            {data.researchField ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {data.researchField}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canRevise && (
              <Button
                variant={data.status.toLowerCase().includes("revision") ? "default" : "outline"}
                onClick={() => setShowRevision(v => !v)}
                disabled={revisionPending}
                className="gap-1.5 shadow-xs"
              >
                <Upload className="h-4 w-4" />
                {t("New PDF version")}
              </Button>
            )}
            {canRequestReview && (
              <SubmitReviewDialog submissionId={id} artifactTitle={data.title} artifactType={data.submissionType} />
            )}
          </div>
        </div>

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

        {data.abstract && (
          <div className="mt-4 border-t border-border/80 pt-4">
            <SubmissionIntroductionView content={data.abstract} />
          </div>
        )}
      </header>

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

      {/* History and AI Load Errors with Retry */}
      {history.error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300" role="alert">
          <p>{t("Unable to load version history and review requests.")}</p>
          <Button variant="outline" size="sm" className="mt-2" disabled={history.isFetching} onClick={() => void history.refetch()}>
            {t("Retry")}
          </Button>
        </div>
      )}

      {preReviews.error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300" role="alert">
          <p>{t("Unable to load AI pre-reviews.")}</p>
          <Button variant="outline" size="sm" className="mt-2" disabled={preReviews.isFetching} onClick={() => void preReviews.refetch()}>
            {t("Retry")}
          </Button>
        </div>
      )}

      {/* 2-Column Main Workspace */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (Manuscript Content & Shared Context) - 7 cols */}
        <div className="space-y-6 lg:col-span-7">
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
                        {canProvideFeedback && (
                          <button
                            type="button"
                            className="hidden group-hover:inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                            onClick={() => {
                              setNewCommentParagraph(String(index + 1));
                              setNewCommentQuote(p.slice(0, 120) + (p.length > 120 ? "…" : ""));
                            }}
                          >
                            <MessageSquare className="h-3 w-3" />
                            Góp ý đoạn này
                          </button>
                        )}
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

          {/* Shared Context & Supporting Research Details */}
          {researchDetails.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-6 shadow-xs">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
                Tài liệu hỗ trợ liên quan đã chia sẻ
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {researchDetails.map(item => (
                  <article key={item.title} className="rounded-lg border bg-muted/10 p-4">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">{item.title}</h4>
                    <p className={`mt-2 text-sm leading-relaxed text-foreground ${item.preserve ? "whitespace-pre-line" : ""}`}>
                      {item.value}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* AI Pre-review Advisory (Collapsible) */}
          <details className="group rounded-xl border border-primary/20 bg-primary/5 p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-sm">
              <span className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                AI Pre-review (Tham khảo tự động)
              </span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 text-muted-foreground" />
            </summary>
            <div className="mt-4 space-y-4 text-xs leading-5">
              <p className="text-muted-foreground">
                Đánh giá sơ bộ mục tiêu và khoảng trống nghiên cứu mang tính gợi ý, không thay thế nhận xét của Mentor.
              </p>
              {latestPreReview && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {t("Analyzed revision")} {latestPreReview.sourceRevisionNumber ?? 1}
                  </Badge>
                  {preReviewOutdated && (
                    <span className="text-xs text-amber-700 dark:text-amber-400">
                      {t("This AI pre-review targets an earlier version. Run another pre-review if the manuscript changed significantly.")}
                    </span>
                  )}
                </div>
              )}
              {canRunPreReview && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runPreReview.mutateAsync().then(() => toast.success("AI pre-review queued")).catch((e: any) => toast.error(e.response?.data?.error?.message ?? "Lỗi AI"))}
                  disabled={runPreReview.isPending || preReviewRunning}
                >
                  <Play className="h-3.5 w-3.5 mr-1" />
                  {runPreReview.isPending || preReviewRunning ? "Đang phân tích…" : "Chạy AI Pre-review"}
                </Button>
              )}
              {latestPreReview?.status === "COMPLETED" && (
                <div className="space-y-3 pt-2 border-t border-primary/20">
                  <p><strong>Tóm tắt AI:</strong> {latestPreReview.summary}</p>
                  {latestPreReview.reviewFocusAreas?.length ? (
                    <div>
                      <strong>Điểm trọng tâm cần xem xét:</strong>
                      <ul className="list-disc pl-4 mt-1 space-y-0.5">
                        {latestPreReview.reviewFocusAreas.map((f: string, i: number) => <li key={i}>{f}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </details>
        </div>

        {/* Right Column (Mentor Feedback & Action Loop) - 5 cols */}
        <div className="space-y-6 lg:col-span-5">
          {/* Active Mentor Feedback Form */}
          {canProvideFeedback && (
            <section className="rounded-xl border-2 border-primary/40 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2 border-b pb-3">
                <MessageSquare className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-base text-foreground">Góp ý của Mentor (v{currentVersion?.revisionNumber ?? 1})</h3>
              </div>

              <div className="mt-4 space-y-5">
                {/* Overall comment */}
                <div>
                  <label className="block text-sm font-semibold text-foreground">
                    Nhận xét tổng quan <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    className="mt-2 w-full rounded-md border border-input bg-background p-3 text-sm leading-6 min-h-28 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Ghi nhận xét đánh giá tổng quan về nội dung, lập luận và hướng phát triển cho nhóm sinh viên..."
                    value={overallComment}
                    onChange={e => setOverallComment(e.target.value)}
                    rows={4}
                  />
                </div>

                {/* Paragraph-level comments */}
                <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center justify-between">
                    <span>Bình luận theo đoạn văn ({paragraphComments.length})</span>
                  </h4>

                  {paragraphComments.length > 0 && (
                    <ul className="space-y-2.5">
                      {paragraphComments.map((pc, i) => (
                        <li key={i} className="rounded-md border bg-card p-3 text-xs space-y-1">
                          <div className="flex items-center justify-between font-semibold text-primary">
                            <span>{pc.criterionKey}</span>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => removeParagraphComment(i)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          {pc.evidence && <p className="italic text-muted-foreground">“{pc.evidence}”</p>}
                          <p className="text-foreground">{pc.comment}</p>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex gap-2">
                      <Input
                        className="w-24 text-xs h-8"
                        placeholder="Số đoạn"
                        value={newCommentParagraph}
                        onChange={e => setNewCommentParagraph(e.target.value)}
                      />
                      <Input
                        className="flex-1 text-xs h-8"
                        placeholder="Trích dẫn đoạn văn (nếu có)"
                        value={newCommentQuote}
                        onChange={e => setNewCommentQuote(e.target.value)}
                      />
                    </div>
                    <textarea
                      className="w-full rounded-md border border-input bg-background p-2 text-xs min-h-16"
                      placeholder="Ý kiến góp ý cho đoạn này..."
                      value={newCommentText}
                      onChange={e => setNewCommentText(e.target.value)}
                      rows={2}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full text-xs h-8 gap-1"
                      onClick={addParagraphComment}
                      disabled={!newCommentText.trim()}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Thêm bình luận cho đoạn
                    </Button>
                  </div>
                </div>

                {/* Requested Information */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Đề nghị bổ sung tài liệu / bối cảnh (nếu cần)
                  </label>
                  <textarea
                    className="w-full rounded-md border border-input bg-background p-2.5 text-xs leading-5 min-h-16"
                    placeholder="Gợi ý tài liệu tham khảo hoặc yêu cầu nhóm cung cấp thêm dữ liệu nếu chưa đủ..."
                    value={requestedInformation}
                    onChange={e => setRequestedInformation(e.target.value)}
                    rows={2}
                  />
                </div>

                {/* 3 Outcome Buttons */}
                <div className="pt-3 border-t space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    Hoàn tất với một trong 3 kết luận:
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      type="button"
                      className="w-full justify-start gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={submitFeedbackMutation.isPending || !overallComment.trim()}
                      onClick={() => handleMentorSubmit("READY_TO_ADVANCE")}
                    >
                      <Sparkles className="h-4 w-4" />
                      <span>Có thể tiếp tục — Nội dung đạt yêu cầu cho bước tiếp theo</span>
                    </Button>

                    <Button
                      type="button"
                      className="w-full justify-start gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                      disabled={submitFeedbackMutation.isPending || !overallComment.trim()}
                      onClick={() => handleMentorSubmit("REVISION_REQUESTED")}
                    >
                      <AlertCircle className="h-4 w-4" />
                      <span>Cần chỉnh sửa — Yêu cầu nhóm sinh viên nộp phiên bản mới</span>
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full justify-start gap-2 border"
                      disabled={submitFeedbackMutation.isPending || !overallComment.trim()}
                      onClick={() => handleMentorSubmit("FEEDBACK_GIVEN")}
                    >
                      <CheckCircle2 className="h-4 w-4 text-blue-600" />
                      <span>Đã góp ý — Nhận xét thông thường, không bắt buộc vòng sửa</span>
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Feedback Display Card (when feedback exists) */}
          {latestMentorReview ? (
            <section className="rounded-xl border bg-card p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-base">Góp ý từ Mentor (v{currentVersion?.revisionNumber})</h3>
                </div>
                {latestMentorReview.submittedAt && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(latestMentorReview.submittedAt).toLocaleDateString(language, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>

              {/* Outcome Badge */}
              <div className="rounded-lg p-3.5 border flex items-center gap-3 bg-muted/30">
                {latestMentorReview.overallAssessment === "READY_TO_ADVANCE" ? (
                  <Badge className="bg-emerald-500/15 text-emerald-800 border-emerald-300 dark:text-emerald-300 text-sm py-1 px-3">
                    <Sparkles className="h-4 w-4 mr-1.5" />
                    Có thể tiếp tục
                  </Badge>
                ) : latestMentorReview.overallAssessment === "REVISION_REQUESTED" ? (
                  <Badge className="bg-rose-500/15 text-rose-800 border-rose-300 dark:text-rose-300 text-sm py-1 px-3">
                    <AlertCircle className="h-4 w-4 mr-1.5" />
                    Cần chỉnh sửa
                  </Badge>
                ) : (
                  <Badge className="bg-blue-500/15 text-blue-800 border-blue-300 dark:text-blue-300 text-sm py-1 px-3">
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                    Đã nhận góp ý
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  Người đánh giá: <strong>{latestMentorReview.reviewerName}</strong>
                </span>
              </div>

              {/* Overall Comment */}
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">Nhận xét tổng quan:</h4>
                <p className="mt-2 text-sm leading-relaxed text-foreground whitespace-pre-line bg-muted/20 p-3.5 rounded-lg border">
                  {latestMentorReview.overallComment}
                </p>
              </div>

              {/* Requested Information */}
              {latestMentorReview.keyStrengths && (
                <div className="rounded-lg border border-amber-300/60 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200">
                  <span className="font-semibold block mb-1">Đề nghị bổ sung thêm:</span>
                  <p>{latestMentorReview.keyStrengths}</p>
                </div>
              )}

              {/* Paragraph Comments */}
              {latestMentorReview.responses && latestMentorReview.responses.length > 0 && (
                <div className="space-y-3 pt-2 border-t">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                    Bình luận chi tiết theo đoạn ({latestMentorReview.responses.length}):
                  </h4>
                  <div className="space-y-2.5">
                    {latestMentorReview.responses.map((resp: any, i: number) => (
                      <div key={i} className="rounded-lg border bg-muted/20 p-3 text-xs space-y-1">
                        <span className="font-semibold text-primary block">{resp.criterionKey}</span>
                        {resp.evidence && <p className="italic text-muted-foreground">“{resp.evidence}”</p>}
                        <p className="text-foreground leading-relaxed">{resp.comment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Call to action if revision requested */}
              {latestMentorReview.overallAssessment === "REVISION_REQUESTED" && canRevise && (
                <div className="pt-3 border-t">
                  <Button
                    className="w-full gap-2"
                    onClick={() => { setShowRevision(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  >
                    <Upload className="h-4 w-4" />
                    Tạo phiên bản chỉnh sửa (v{data.currentRevisionNumber + 1})
                  </Button>
                </div>
              )}
            </section>
          ) : !canProvideFeedback && history.data?.assignedMentor ? (
            <section className="rounded-xl border border-dashed bg-muted/10 p-6 text-center space-y-3">
              <Clock className="mx-auto h-8 w-8 text-amber-600 dark:text-amber-400" />
              <h4 className="font-medium text-sm">Chờ Mentor góp ý</h4>
              <p className="text-xs text-muted-foreground leading-5">
                Bản thảo đã được gửi vào danh sách nhiệm vụ của Mentor. Nhóm sinh viên sẽ nhận được thông báo ngay khi Mentor hoàn tất góp ý.
              </p>
            </section>
          ) : null}

          {/* Submission Review Progress */}
          {history.data && (
            <SubmissionReviewProgress
              history={history.data}
              onRefresh={async () => {
                await Promise.all([history.refetch(), submission.refetch()]);
              }}
              refreshing={history.isFetching || submission.isFetching}
            />
          )}

          {/* Version history */}
          {history.data && (
            <VersionHistory
              id={id}
              history={history.data}
              readOnly={readOnly || ["accepted", "rejected", "withdrawn"].includes(data.status)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Claim({ title, value, preserve }: { title: string; value?: string; preserve?: boolean }) {
  if (!value) return null;
  return (
    <article className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</h2>
      <p className={`mt-3 text-sm leading-6 text-foreground ${preserve ? "whitespace-pre-line" : ""}`}>
        {value}
      </p>
    </article>
  );
}
