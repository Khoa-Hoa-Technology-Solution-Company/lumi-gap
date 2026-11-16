import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
  User,
  Download,
  ChevronDown,
  GitCompare,
  ShieldAlert,
  Scale,
  CheckSquare,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmissionIntroductionView } from "@/features/submissions/components/submission-introduction-view";
import { VersionHistory } from "@/features/submissions/components/version-history";
import { SubmitReviewDialog } from "@/features/reviews/components/submit-review-dialog";
import { SubmissionReviewProgress } from "@/features/submissions/components/submission-review-progress";
import { internalAssessmentLabel } from "@/features/reviews/scientific-review-model";
import { ContentComparison } from "@/features/submissions/components/content-comparison";
import { submissionStatusBadge, submissionTypeBadge } from "./submission-list";
import { useI18n } from "@/i18n";
import {
  useAddSubmissionRevision,
  useCreateSubmissionVersion,
  useAiPreReviews,
  useRunAiPreReview,
  useSubmission,
  useSubmissionHistory,
  submissionsApi,
} from "@/features/submissions";
import { projectSubmissionPath } from "@/features/submissions/project-submission-path";

// Read-only adapter for historical mentor scores; new reviews use published templates.
const LEGACY_RUBRIC_LABELS = [
  { key: "rq_clarity", label: "Câu hỏi nghiên cứu & Mục tiêu", desc: "Tính rõ ràng, khả thi và sự đóng góp tri thức của câu hỏi nghiên cứu." },
  { key: "methodology", label: "Phương pháp luận", desc: "Tính chặt chẽ, tính tái lập và sự phù hợp của quy trình nghiên cứu." },
  { key: "results", label: "Kết quả & Dữ liệu", desc: "Độ tin cậy của phân tích, minh bạch về số liệu và tính logic của kết quả." },
  { key: "evidence", label: "Bằng chứng & Lập luận", desc: "Các luận điểm có bằng chứng khoa học đối chiếu, không suy diễn thiếu căn cứ." },
  { key: "discussion", label: "Thảo luận & So sánh", desc: "So sánh khách quan với các công trình trước, không tự nhận là tốt nhất khi điều kiện khác biệt." },
  { key: "limitations", label: "Giới hạn nghiên cứu", desc: "Thành thật thừa nhận các hạn chế về tập dữ liệu, phương pháp hoặc phạm vi." },
  { key: "citations", label: "Trích dẫn & Nguồn tham khảo", desc: "Trích dẫn chuẩn xác, không bịa nguồn, không có trích dẫn ma hoặc sai ngữ cảnh." },
  { key: "integrity", label: "Liêm chính học thuật & AI", desc: "Minh bạch việc sử dụng công cụ AI trợ giúp, đúng chuẩn mực COPE/ICMJE." },
];

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
  const navigate = useNavigate();
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

  // Active selected version
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [showDiff, setShowDiff] = useState(false);
  const [addressedAiItems, setAddressedAiItems] = useState<Record<string, boolean>>({});

  // Revision upload modal / section state
  const [showRevision, setShowRevision] = useState(false);
  const [revisionFile, setRevisionFile] = useState<File>();
  const [revisionResponse, setRevisionResponse] = useState("");
  const [revisionContent, setRevisionContent] = useState("");
  const [revisionMode, setRevisionMode] = useState<"PDF" | "TEXT">("PDF");


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
    contentType: "text/markdown",
    checksumSha256: "",
    sizeBytes: 0,
    sourceRevisionId: null,
    responseToReview: null,
    reviews: [],
    createdAt: data.updatedAt,
  };
  const previousVersion = versions.find(v => v.revisionNumber === (currentVersion.revisionNumber - 1));

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
              <SubmitReviewDialog submissionId={id} revisionId={currentVersion.id} artifactTitle={data.title} artifactType={data.submissionType} />
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
              <div className="flex items-center gap-2">
                {previousVersion && (
                  <Button
                    size="sm"
                    variant={showDiff ? "secondary" : "outline"}
                    className="gap-1.5 text-xs h-8"
                    onClick={() => setShowDiff(prev => !prev)}
                  >
                    <GitCompare className="h-3.5 w-3.5" />
                    {showDiff ? "Ẩn so sánh" : `So sánh với v${previousVersion.revisionNumber}`}
                  </Button>
                )}
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
            </div>

            {/* Comparison view when enabled */}
            {showDiff && previousVersion && (
              <div className="mt-4 rounded-xl border border-primary/30 bg-muted/10 p-4">
                <div className="flex items-center justify-between pb-3 border-b mb-3">
                  <span className="text-xs font-semibold flex items-center gap-1.5 text-primary">
                    <GitCompare className="h-4 w-4" />
                    So sánh bản thảo: v{previousVersion.revisionNumber} → v{currentVersion.revisionNumber}
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setShowDiff(false)}>
                    Đóng
                  </Button>
                </div>
                <ContentComparison id={id} before={previousVersion} after={currentVersion} />
              </div>
            )}

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
          <details className="group rounded-xl border border-primary/20 bg-primary/5 p-5" open={latestPreReview?.status === "COMPLETED"}>
            <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-sm">
              <span className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                AI Pre-review (Cố vấn học thuật sơ bộ)
              </span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 text-muted-foreground" />
            </summary>
            <div className="mt-4 space-y-4 text-xs leading-5">
              <div className="rounded-lg border border-amber-300/60 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Lưu ý liêm chính học thuật:</strong> AI Pre-review là công cụ phân tích cố vấn sơ bộ tự động, không thay thế bình duyệt chính thức của Mentor hoặc phê chuẩn của Hội đồng học thuật. Sinh viên cần đối chiếu và tự kiểm chứng từng gợi ý.
                </p>
              </div>
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
                <div className="space-y-4 pt-3 border-t border-primary/20">
                  <div className="rounded-lg border bg-card p-3 space-y-1">
                    <strong className="text-primary block font-semibold">Tóm tắt phân tích học thuật:</strong>
                    <p className="text-foreground leading-relaxed">{latestPreReview.summary}</p>
                  </div>

                  {latestPreReview.goalAlignment && (
                    <div className="rounded-lg border bg-card p-3 space-y-1">
                      <strong className="text-primary block font-semibold">Mục tiêu nghiên cứu & Độ tương thích (Goal Alignment):</strong>
                      <p className="text-foreground leading-relaxed">
                        {typeof latestPreReview.goalAlignment === "string" ? latestPreReview.goalAlignment : latestPreReview.goalAlignment?.assessment ?? ""}
                      </p>
                    </div>
                  )}

                  {latestPreReview.rqCoverage && latestPreReview.rqCoverage.length > 0 && (
                    <div className="rounded-lg border bg-card p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <strong className="text-primary flex items-center gap-1.5 font-semibold">
                          <CheckSquare className="h-3.5 w-3.5" />
                          Độ bao phủ câu hỏi nghiên cứu (RQ Coverage)
                        </strong>
                        <span className="text-[11px] text-muted-foreground">Tự rà soát trước khi gửi Mentor</span>
                      </div>
                      <ul className="space-y-1.5">
                        {latestPreReview.rqCoverage.map((rq: any, idx: number) => {
                          const key = `rq_${idx}`;
                          const isAddressed = addressedAiItems[key];
                          return (
                            <li key={idx} className="flex items-start gap-2 rounded bg-muted/20 p-2 text-xs">
                              <input
                                type="checkbox"
                                id={key}
                                checked={!!isAddressed}
                                onChange={e => setAddressedAiItems(prev => ({ ...prev, [key]: e.target.checked }))}
                                className="mt-0.5 rounded border-input"
                              />
                              <label htmlFor={key} className={`cursor-pointer ${isAddressed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                <span className="font-semibold">{rq.question ?? `RQ ${idx + 1}`}:</span> {rq.status || rq.assessment || JSON.stringify(rq)}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {latestPreReview.unsupportedClaims && latestPreReview.unsupportedClaims.length > 0 && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <strong className="text-destructive flex items-center gap-1.5 font-semibold">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Luận điểm thiếu bằng chứng đối chứng ({latestPreReview.unsupportedClaims.length})
                        </strong>
                        <span className="text-[11px] text-destructive/80">Cần bổ sung nguồn</span>
                      </div>
                      <ul className="space-y-2">
                        {latestPreReview.unsupportedClaims.map((claim: any, idx: number) => {
                          const key = `claim_${idx}`;
                          const isAddressed = addressedAiItems[key];
                          return (
                            <li key={idx} className="rounded border bg-card p-2.5 text-xs space-y-1">
                              <div className="flex items-start gap-2">
                                <input
                                  type="checkbox"
                                  id={key}
                                  checked={!!isAddressed}
                                  onChange={e => setAddressedAiItems(prev => ({ ...prev, [key]: e.target.checked }))}
                                  className="mt-0.5 rounded border-input"
                                />
                                <label htmlFor={key} className={`cursor-pointer ${isAddressed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                  {typeof claim === "string" ? claim : (
                                    <div>
                                      {claim.quote && <p className="italic text-muted-foreground">“{claim.quote}”</p>}
                                      <p className="font-medium mt-0.5">{claim.reason ?? claim.claim}</p>
                                    </div>
                                  )}
                                </label>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {latestPreReview.citationIssues && latestPreReview.citationIssues.length > 0 && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
                      <strong className="text-amber-800 dark:text-amber-300 block font-semibold">
                        Cảnh báo trích dẫn & Nguồn tài liệu ({latestPreReview.citationIssues.length}):
                      </strong>
                      <ul className="list-disc pl-4 space-y-1">
                        {latestPreReview.citationIssues.map((issue: any, idx: number) => (
                          <li key={idx} className="text-xs text-foreground">
                            {typeof issue === "string" ? issue : `${issue.citation}: ${issue.issue}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {latestPreReview.reviewFocusAreas?.length ? (
                    <div className="rounded-lg border bg-card p-3 space-y-1">
                      <strong className="text-primary block font-semibold">Các điểm trọng tâm khuyến nghị rà soát:</strong>
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
          {canProvideFeedback && <section className="rounded-xl border bg-card p-5 space-y-3"><h3 className="font-semibold">{t("Mentor academic review")}</h3><p className="text-sm text-muted-foreground">{t("Review the assigned immutable revision using its published template. Previous feedback stays in history.")}</p><Button onClick={async () => { try { const prepared = await submissionsApi.prepareMentorReview(id); navigate(`/reviews/${prepared.assignmentId}`); } catch (error) { const message=(error as {response?:{data?:{error?:{message?:string}}}})?.response?.data?.error?.message; toast.error(t(message || "Ask the owner to share this manuscript and assign mentor review first.")); } }}>{t("Open review workspace")}</Button></section>}

          {/* Feedback Display Card (when feedback exists) */}
          {latestMentorReview?.requestId ? <section className="rounded-xl border bg-card p-5"><h3 className="font-semibold">{t("Mentor academic review")} · v{currentVersion.revisionNumber}</h3><p className="mt-2 text-sm font-medium">{t(internalAssessmentLabel(latestMentorReview.overallAssessment ?? undefined))}</p><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{latestMentorReview.overallComment}</p><Button asChild className="mt-4" variant="outline"><Link to={`/review-requests/${latestMentorReview.requestId}`}>{t("View feedback and respond")}</Link></Button></section> : latestMentorReview ? (
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

              {/* Rubric Evaluation Summary */}
              {latestMentorReview.responses?.some((r: any) => r.criterionKey?.startsWith("rubric:")) && (
                <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                      <Scale className="h-3.5 w-3.5 text-primary" />
                      Kết quả đánh giá theo Rubric học thuật
                    </h4>
                    {latestMentorReview.weightedScore !== null && latestMentorReview.weightedScore !== undefined && (
                      <span className="font-bold text-xs text-primary">
                        Điểm tổng hợp: {Number(latestMentorReview.weightedScore).toFixed(1)} / 5.0
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {latestMentorReview.responses
                      .filter((r: any) => r.criterionKey?.startsWith("rubric:"))
                      .map((r: any, idx: number) => {
                        const cleanKey = r.criterionKey.replace(/^rubric:/, "");
                        const crit = LEGACY_RUBRIC_LABELS.find(c => c.key === cleanKey);
                        const title = crit ? crit.label : cleanKey;
                        return (
                          <div key={idx} className="rounded border bg-card p-2.5 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-foreground">{title}</span>
                              {r.score !== null && (
                                <Badge variant="outline" className="text-[11px] font-bold">
                                  {r.score} / 5
                                </Badge>
                              )}
                            </div>
                            {r.comment && !r.comment.startsWith("Rubric score:") && (
                              <p className="text-muted-foreground text-[11px]">{r.comment}</p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Requested Information */}
              {latestMentorReview.keyStrengths && (
                <div className="rounded-lg border border-amber-300/60 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200">
                  <span className="font-semibold block mb-1">Đề nghị bổ sung thêm:</span>
                  <p>{latestMentorReview.keyStrengths}</p>
                </div>
              )}

              {/* Paragraph Comments */}
              {latestMentorReview.responses && latestMentorReview.responses.filter((r: any) => !r.criterionKey?.startsWith("rubric:")).length > 0 && (
                <div className="space-y-3 pt-2 border-t">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                    Bình luận chi tiết theo đoạn ({latestMentorReview.responses.filter((r: any) => !r.criterionKey?.startsWith("rubric:")).length}):
                  </h4>
                  <div className="space-y-2.5">
                    {latestMentorReview.responses
                      .filter((r: any) => !r.criterionKey?.startsWith("rubric:"))
                      .map((resp: any, i: number) => (
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
          ) : !canProvideFeedback && history.data?.assignedMentor && (!history.data.reviewRequests?.length || history.data.reviewRequests?.some(r=>["REQUESTED","ACCEPTED","IN_REVIEW","RESUBMITTED"].includes(r.status))) ? (
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
