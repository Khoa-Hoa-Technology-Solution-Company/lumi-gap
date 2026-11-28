import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MentorManuscriptSendInput, MentorManuscriptSendResult } from "@trend/shared-types";
import {
  MANUSCRIPT_DOCUMENT_TYPES,
  MANUSCRIPT_PDF_MAX_BYTES,
  MANUSCRIPT_PDF_MAX_MB,
  MANUSCRIPT_PDF_RECOMMENDED_BYTES,
  MANUSCRIPT_PDF_RECOMMENDED_MB,
} from "@trend/shared-types";
import { CheckCircle2, FileText, Loader2, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormRequiredLegend, RequiredMark } from "@/components/ui/required-mark";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { useProject } from "@/features/projects/hooks/use-projects";
import { manuscriptsApi } from "@/features/manuscripts/manuscripts.api";
import { refreshMentorReviewQueries } from "@/features/reviews/hooks/use-reviews";
import { submissionsApi } from "../api/submissions.api";
import { useRevisionResponseDrafts } from "../revision-response-drafts";
import "@/features/manuscripts/manuscripts.css";
import "../mentor-manuscript.css";

const PdfPreview = lazy(() => import("@/features/academic-profile/components/private-evidence-pdf-preview"));

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectTitle?: string;
  manuscriptId?: string;
  submissionId?: string;
  initialMentorId?: string;
  prepareSnapshot?: () => Promise<{ id: string; sourceVersion: number }>;
  onSent: (result: MentorManuscriptSendResult) => void;
  onSentMeta?: (meta: { mentorName?: string; responseCount: number }) => void;
}

const PDF_ERROR_TRANSLATIONS: Record<string, string> = {
  PDF_EMPTY: "Tệp PDF không có dữ liệu.",
  PDF_TOO_LARGE: `Bản PDF vượt giới hạn dung lượng cho phép (${MANUSCRIPT_PDF_MAX_MB} MB).`,
  PDF_INVALID_FORMAT: "Tệp được chọn không phải tài liệu PDF hợp lệ.",
  PDF_PASSWORD_PROTECTED: "Bản PDF được bảo vệ bằng mật khẩu. Vui lòng sử dụng bản không yêu cầu mật khẩu.",
  PDF_CORRUPTED: "Không thể đọc cấu trúc của bản PDF này. Hãy xuất lại tài liệu thành PDF và thử lại.",
  PDF_PAGE_LIMIT_EXCEEDED: "Bản PDF vượt quá số trang tối đa được hỗ trợ.",
  PDF_VALIDATION_TIMEOUT: "Quá trình kiểm tra PDF mất nhiều thời gian hơn dự kiến. Bạn có thể thử lại.",
  PDF_VALIDATION_RESOURCE_LIMIT: "Bản PDF có cấu trúc phức tạp hoặc vượt khả năng xử lý hiện tại.",
  PDF_VALIDATION_UNAVAILABLE: "Dịch vụ kiểm tra PDF tạm thời chưa khả dụng. Vui lòng thử lại sau.",
};

function formatUploadError(error: unknown, fallback: string, t: (k: string) => string): string {
  const errObj = error as { response?: { data?: { error?: { code?: string; message?: string } } } };
  const code = errObj?.response?.data?.error?.code;
  const serverMessage = errObj?.response?.data?.error?.message;
  if (serverMessage) return t(serverMessage);
  if (code && PDF_ERROR_TRANSLATIONS[code]) return t(PDF_ERROR_TRANSLATIONS[code]!);
  return fallback;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function MentorManuscriptDialog(props: Props) {
  const userId = useAuthStore((state) => state.user?.id);
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? (
        <MentorManuscriptForm
          key={`${userId}:${props.projectId}:${props.manuscriptId ?? ""}:${props.submissionId ?? ""}:${props.initialMentorId ?? ""}`}
          {...props}
        />
      ) : null}
    </Dialog>
  );
}

function MentorManuscriptForm(props: Props) {
  const { t } = useI18n(),
    client = useQueryClient(),
    userId = useAuthStore((state) => state.user?.id);
  const { projectId } = props;
  const project = useProject(projectId);
  const manuscripts = useQuery({
    queryKey: ["manuscripts", userId, projectId],
    queryFn: () => manuscriptsApi.list(projectId),
  });
  const mentors = useQuery({
    queryKey: ["submissions", "active-mentors", userId, projectId],
    queryFn: () => submissionsApi.activeMentors(projectId),
    retry: false,
  });
  const [source, setSource] = useState<"SNAPSHOT" | "PDF">(
    props.submissionId && !props.manuscriptId ? "PDF" : "SNAPSHOT",
  );
  const [choice, setChoice] = useState(props.manuscriptId ?? "");
  const manuscriptId = choice || manuscripts.data?.[0]?.id || "";
  const manuscript = manuscripts.data?.find((item) => item.id === manuscriptId);
  const [selectedMentor, setSelectedMentor] = useState(props.initialMentorId ?? "");
  const matchedInitialMentor = selectedMentor
    ? mentors.data?.find((item) => item.canonicalId === selectedMentor || item.id === selectedMentor)
    : undefined;
  const mentorId =
    (matchedInitialMentor?.canonicalId ?? matchedInitialMentor?.id ?? selectedMentor) ||
    (mentors.data?.length === 1 ? (mentors.data[0]!.canonicalId ?? mentors.data[0]!.id) : "");
  const mentorObj = mentors.data?.find((item) => (item.canonicalId ?? item.id) === mentorId);

  const context = useQuery({
    queryKey: ["mentor-send-context", userId, projectId, source === "SNAPSHOT" ? manuscriptId : "", props.submissionId],
    queryFn: () =>
      submissionsApi.mentorFeedbackContext({
        projectId,
        ...(props.submissionId ? { submissionId: props.submissionId } : source === "SNAPSHOT" ? { manuscriptId } : {}),
      }),
    enabled: Boolean(props.submissionId || (source === "SNAPSHOT" && manuscriptId)),
    retry: false,
  });

  const [file, setFile] = useState<File>();
  const [fileError, setFileError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [prepared, setPrepared] = useState<{
    snapshotId: string;
    compilationId: string;
    version: number;
    manuscriptId: string;
  }>();
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [pdfValid, setPdfValid] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const submitting = useRef(false);
  const generation = useRef(0);
  const autoPrepared = useRef(false);
  const retry = useRef({ signature: "", key: crypto.randomUUID() });

  useEffect(() => () => {
    generation.current++;
  }, []);
  useEffect(() => {
    setTimedOut(false);
    if (!prepared) return;
    const timer = setTimeout(() => setTimedOut(true), 95000);
    return () => clearTimeout(timer);
  }, [prepared?.compilationId]);

  const compilation = useQuery({
    queryKey: ["mentor-send-compile", userId, projectId, prepared?.manuscriptId, prepared?.snapshotId, prepared?.compilationId],
    queryFn: () => manuscriptsApi.compilations(projectId, prepared!.manuscriptId, prepared!.snapshotId, prepared!.compilationId),
    enabled: Boolean(prepared && source === "SNAPSHOT"),
    retry: false,
    refetchInterval: (query) =>
      !timedOut && (!query.state.data?.latest || ["QUEUED", "COMPILING"].includes(query.state.data.latest.status)) ? 1200 : false,
  });
  const successful = prepared && compilation.data?.successful?.id === prepared.compilationId ? compilation.data.successful : null;
  const pdf = useQuery({
    queryKey: ["mentor-send-pdf", userId, projectId, prepared?.manuscriptId, prepared?.compilationId],
    queryFn: () => manuscriptsApi.pdf(projectId, prepared!.manuscriptId, prepared!.compilationId),
    enabled: Boolean(successful && source === "SNAPSHOT"),
    retry: false,
    gcTime: 0,
  });

  const blob = source === "PDF" ? file : pdf.data;
  const request = context.data?.requests.find((item) => item.mentorId === mentorId);
  const waiting = request && ["REQUESTED", "ACCEPTED", "IN_REVIEW", "RESUBMITTED"].includes(request.status);
  const items = request?.status === "REVISION_REQUESTED" ? request.items : [];
  const mandatoryItems = items.filter((item) => !item.optional && item.priority?.toUpperCase() !== "SUGGESTION");
  const title =
    source === "SNAPSHOT"
      ? manuscript?.title
      : context.data?.submission?.title ?? file?.name.replace(/\.pdf$/i, "") ?? "";

  // Shared scoped draft persistence synced with SubmissionFeedbackPanel
  const effectiveSubmissionId = context.data?.submission?.id ?? props.submissionId;
  const { drafts: responses, setDraft, clearDrafts } = useRevisionResponseDrafts({
    userId,
    projectId,
    submissionId: effectiveSubmissionId,
    requestId: request?.id,
  });

  const missingMandatoryItems = mandatoryItems.filter((item) => !responses[item.id]?.trim());
  const answeredMandatoryCount = mandatoryItems.length - missingMandatoryItems.length;
  const answeredTotalCount = items.filter((item) => Boolean(responses[item.id]?.trim())).length;

  const send = useMutation({
    mutationFn: ({ input, upload }: { input: MentorManuscriptSendInput; upload?: File }) =>
      submissionsApi.sendMentorFeedback(input, upload, {
        onUploadProgress: upload ? (pct) => setUploadPercent(pct) : undefined,
      }),
    onSuccess: (result, variables) => {
      setUploadPercent(null);
      if (items.length) {
        clearDrafts(items.map((item) => item.id));
      }
      void Promise.all([
        refreshMentorReviewQueries(client),
        client.invalidateQueries({ queryKey: ["mentor-send-context"] }),
        client.invalidateQueries({ queryKey: ["manuscripts"] }),
      ]);
      props.onSentMeta?.({
        mentorName: mentorObj?.fullName,
        responseCount: variables.input.responses?.length ?? 0,
      });
      props.onSent(result);
    },
    onError: () => {
      setUploadPercent(null);
    },
  });

  const busy = preparing || send.isPending;

  async function prepare() {
    if (preparing || !manuscriptId) return;
    const current = ++generation.current;
    setPreparing(true);
    setError("");
    setPrepared(undefined);
    setPdfValid(false);
    try {
      const detail = await manuscriptsApi.detail(projectId, manuscriptId);
      if (!detail.compiler?.available) throw new Error(t("PDF compilation is not available on this server."));
      const snapshot =
        props.prepareSnapshot && manuscriptId === props.manuscriptId
          ? await props.prepareSnapshot()
          : await manuscriptsApi.snapshot(projectId, manuscriptId, {
              label: t("Mentor feedback snapshot"),
              clientKey: crypto.randomUUID(),
              minimumSequences: {},
              reuseUnchanged: true,
            });
      if (current !== generation.current) return;
      const job = await manuscriptsApi.compile(
        projectId,
        manuscriptId,
        snapshot.id,
        detail.compilerSettings?.engine ?? "pdflatex",
        detail.compilerSettings?.texLiveVersion ?? detail.compiler.versions?.[0] ?? "2022",
      );
      if (current === generation.current)
        setPrepared({ snapshotId: snapshot.id, compilationId: job.id, version: snapshot.sourceVersion, manuscriptId });
    } catch (failure) {
      if (current === generation.current)
        setError(
          formatUploadError(
            failure,
            failure instanceof Error ? failure.message : t("Could not prepare the PDF. Your manuscript is retained."),
            t,
          ),
        );
    } finally {
      if (current === generation.current) setPreparing(false);
    }
  }

  useEffect(() => {
    if (source === "SNAPSHOT" && props.manuscriptId && manuscript && !autoPrepared.current) {
      autoPrepared.current = true;
      void prepare();
    }
  }, [source, props.manuscriptId, manuscript]);

  function reset() {
    generation.current++;
    setPrepared(undefined);
    setPdfValid(false);
    setError("");
    setFileError("");
    setPreparing(false);
  }

  function handleSelectedFile(next: File | undefined) {
    reset();
    retry.current = { signature: "", key: crypto.randomUUID() };
    if (!next) {
      setFile(undefined);
      return;
    }
    if (next.size <= 0) {
      const msg = t("Tệp PDF không có dữ liệu.");
      setFileError(msg);
      setError(msg);
      setFile(undefined);
      return;
    }
    if (next.size > MANUSCRIPT_PDF_MAX_BYTES) {
      const msg = t(`Use a PDF no larger than ${MANUSCRIPT_PDF_MAX_MB} MB`);
      setFileError(msg);
      setError(msg);
      setFile(undefined);
      return;
    }
    if (!next.name.toLowerCase().endsWith(".pdf") || (next.type && next.type !== "application/pdf" && next.type !== "application/octet-stream")) {
      const msg = t("Tệp được chọn không phải tài liệu PDF hợp lệ.");
      setFileError(msg);
      setError(msg);
      setFile(undefined);
      return;
    }
    setFileError("");
    setFile(next);
  }

  const missingMandatory = missingMandatoryItems.length > 0;

  // Explicit submit readiness reasons (Section 10: never silently disable submit!)
  const readinessReasons: string[] = [];
  if (source === "PDF") {
    if (!file) readinessReasons.push(t("Chưa chọn tệp PDF bản thảo."));
    else if (!pdfValid) readinessReasons.push(t("Bản PDF chưa hoàn tất kiểm tra xem trước."));
  } else {
    if (!manuscriptId) readinessReasons.push(t("Chưa chọn bản thảo LaTeX."));
    else if (!prepared || !successful || !pdf.data) readinessReasons.push(t("Bản LaTeX chưa được biên dịch thành công."));
    else if (!pdfValid) readinessReasons.push(t("Bản PDF biên dịch chưa hoàn tất kiểm tra xem trước."));
  }
  if (!mentorId) readinessReasons.push(t("Chưa chọn giảng viên nhận bản thảo."));
  if (waiting) readinessReasons.push(t("Giảng viên đang đánh giá phiên bản hiện tại."));
  if (missingMandatoryItems.length > 0) {
    readinessReasons.push(
      t("Còn {{count}} yêu cầu chỉnh sửa bắt buộc chưa có phản hồi.", { count: missingMandatoryItems.length }),
    );
  }
  if (context.error || mentors.error) {
    readinessReasons.push(t("Chưa thể tải đầy đủ thông tin giảng viên hoặc lịch sử yêu cầu."));
  }

  const submitDisabled =
    busy ||
    !mentorId ||
    Boolean(waiting) ||
    !pdfValid ||
    !blob ||
    context.isFetching ||
    Boolean(context.error || mentors.error) ||
    missingMandatory;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setAttemptedSubmit(true);
    if (missingMandatoryItems.length > 0) {
      const firstId = missingMandatoryItems[0]!.id;
      document.getElementById(`revision-response-${firstId}`)?.focus();
      return;
    }
    if (submitting.current || submitDisabled) return;

    const preparedResponses = items
      .map((item) => ({
        revisionItemId: item.id,
        responseText: responses[item.id]?.trim() ?? "",
        optional: Boolean(item.optional || item.priority?.toUpperCase() === "SUGGESTION"),
      }))
      .filter((item) => !item.optional || item.responseText.length > 0)
      .map(({ revisionItemId, responseText }) => ({ revisionItemId, responseText }));

    const values: Omit<MentorManuscriptSendInput, "clientKey"> = {
      projectId,
      mentorId,
      source,
      message: message.trim() || undefined,
      ...(context.data?.submission
        ? { submissionId: context.data.submission.id, expectedRevisionNumber: context.data.submission.currentRevisionNumber }
        : {}),
      ...(source === "SNAPSHOT" && prepared
        ? { manuscriptSnapshotId: prepared.snapshotId, compilationId: prepared.compilationId }
        : { title: (title && title.trim().length >= 2 ? title : file!.name).slice(0, 300) }),
      ...(preparedResponses.length ? { responses: preparedResponses } : {}),
    };
    const signature = JSON.stringify({ values, name: file?.name, size: file?.size, modified: file?.lastModified });
    if (retry.current.signature && retry.current.signature !== signature) retry.current.key = crypto.randomUUID();
    retry.current.signature = signature;
    submitting.current = true;
    setError("");
    setUploadPercent(source === "PDF" ? 0 : null);
    try {
      await send.mutateAsync({
        input: { ...values, clientKey: retry.current.key },
        upload: source === "PDF" ? file : undefined,
      });
    } catch (failure) {
      setError(
        formatUploadError(
          failure,
          t("Could not send. Your selected PDF and message are retained; try again."),
          t,
        ),
      );
    } finally {
      submitting.current = false;
    }
  }

  const isRevisionFlow = request?.status === "REVISION_REQUESTED";

  return (
    <DialogContent
      className="mentor-manuscript-dialog"
      data-no-i18n
      showClose={!busy}
      closeLabel={t("Close")}
      onInteractOutside={(event) => event.preventDefault()}
      onEscapeKeyDown={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {isRevisionFlow ? t("Gửi phiên bản mới để góp ý") : t("Send manuscript for feedback")}
        </DialogTitle>
        <DialogDescription>
          {isRevisionFlow
            ? t("Chuẩn bị bản chỉnh sửa và phản hồi các yêu cầu của giảng viên.")
            : `${props.projectTitle ?? project.data?.title ?? t("Research project")} · ${t("Internal mentor review")}`}
        </DialogDescription>
      </DialogHeader>

      <FormRequiredLegend className="-mt-1" />

      <form onSubmit={submit} aria-busy={busy} className="mentor-send-form" noValidate>
        <fieldset disabled={busy}>
          {title ? (
            <div className="mentor-send-metadata">
              <strong>{title}</strong>
              <span>
                {source === "SNAPSHOT" && manuscript ? t(MANUSCRIPT_DOCUMENT_TYPES[manuscript.documentType].label) : "PDF"} ·{" "}
                {t("Information from the selected manuscript")}
              </span>
            </div>
          ) : null}

          {/* Group 1: Manuscript Source */}
          <fieldset className="mentor-send-source">
            <legend>
              {t("Choose content to send")}
              <RequiredMark />
            </legend>
            <label>
              <input
                type="radio"
                name="mentor-send-source"
                checked={source === "SNAPSHOT"}
                onChange={() => {
                  reset();
                  setSource("SNAPSHOT");
                }}
              />
              {t("Manuscript written on LumiGap (recommended)")}
            </label>
            <label>
              <input
                type="radio"
                name="mentor-send-source"
                checked={source === "PDF"}
                onChange={() => {
                  reset();
                  setSource("PDF");
                }}
              />
              {t("Upload a PDF from your computer")}
            </label>
          </fieldset>

          {source === "SNAPSHOT" ? (
            <div className="mentor-send-snapshot">
              {!props.manuscriptId ? (
                <label>
                  <span>
                    {t("Manuscript")}
                    <RequiredMark />
                  </span>
                  <select
                    required
                    aria-required="true"
                    aria-label={t("Manuscript")}
                    value={manuscriptId}
                    onChange={(event) => {
                      reset();
                      setChoice(event.target.value);
                    }}
                  >
                    <option value="">{t("Select a manuscript")}</option>
                    {manuscripts.data?.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {manuscripts.isLoading ? (
                <p role="status">{t("Loading manuscripts…")}</p>
              ) : manuscripts.error ? (
                <p role="alert">
                  {t("Could not load manuscripts.")}{" "}
                  <button type="button" onClick={() => void manuscripts.refetch()}>
                    {t("Retry")}
                  </button>
                </p>
              ) : !manuscripts.data?.length ? (
                <p>{t("No LumiGap manuscript yet. Upload a PDF or start writing in Manuscripts.")}</p>
              ) : null}
              <p className="mentor-send-hint">
                {t("A fixed saved version is sent. Your team can continue editing the working draft.")}
              </p>
              {prepared ? (
                <p className="text-xs font-medium text-foreground">
                  {t("Source revision")} {prepared.version} · LaTeX Snapshot
                </p>
              ) : null}
              <Button type="button" variant="outline" disabled={!manuscript || preparing} onClick={() => void prepare()}>
                {t(preparing ? "Saving snapshot…" : prepared ? "Prepare PDF again" : "Save snapshot and preview PDF")}
              </Button>
              {prepared &&
              !successful &&
              !timedOut &&
              !["FAILED", "TIMED_OUT", "BLOCKED"].includes(compilation.data?.latest?.status ?? "") ? (
                <p role="status" aria-busy={compilation.isFetching}>
                  {t("Compiling the selected snapshot…")}
                </p>
              ) : null}
              {prepared &&
              ((timedOut && !successful) ||
                ["FAILED", "TIMED_OUT", "BLOCKED"].includes(compilation.data?.latest?.status ?? "")) ? (
                <div role="alert">
                  <p>{t("The snapshot did not compile. Your source is retained; fix it and prepare the PDF again.")}</p>
                  {compilation.data?.latest?.diagnostics ? (
                    <details>
                      <summary>{t("Compiler log")}</summary>
                      <pre>{compilation.data.latest.diagnostics}</pre>
                    </details>
                  ) : null}
                </div>
              ) : null}
              {compilation.error || pdf.error ? (
                <p role="alert">
                  {t("Could not load the prepared PDF. Try again.")}{" "}
                  <button type="button" onClick={() => void (compilation.error ? compilation.refetch() : pdf.refetch())}>
                    {t("Retry")}
                  </button>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              <label className="mentor-send-upload" htmlFor="mentor-pdf-upload-input">
                <span>
                  {t("Choose PDF manuscript")}
                  <RequiredMark />
                </span>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    handleSelectedFile(e.dataTransfer.files?.[0]);
                  }}
                  className={`rounded-lg border border-dashed p-3.5 transition-colors ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : fileError
                        ? "border-destructive/60 bg-destructive/5"
                        : "border-border bg-muted/15"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    id="mentor-pdf-upload-input"
                    type="file"
                    accept="application/pdf,.pdf"
                    aria-required="true"
                    aria-invalid={Boolean(fileError)}
                    aria-describedby="mentor-pdf-upload-hint"
                    className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
                    onChange={(event) => handleSelectedFile(event.target.files?.[0])}
                  />
                  {!file ? (
                    <p id="mentor-pdf-upload-hint" className="mt-2 flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                      <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {t("Chọn hoặc kéo thả bản PDF vào đây.")}{" "}
                        {t("PDF · tối đa {{max}} MB (khuyến nghị dưới {{rec}} MB)", {
                          max: MANUSCRIPT_PDF_MAX_MB,
                          rec: MANUSCRIPT_PDF_RECOMMENDED_MB,
                        })}
                      </span>
                    </p>
                  ) : (
                    <div id="mentor-pdf-upload-hint" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-[11px] font-normal text-muted-foreground">
                            {formatFileSize(file.size)} ·{" "}
                            {pdfValid ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                {t("Đã kiểm tra hợp lệ")}
                              </span>
                            ) : (
                              <span>{t("Đang kiểm tra bản xem trước…")}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          if (fileInputRef.current) fileInputRef.current.value = "";
                          handleSelectedFile(undefined);
                        }}
                      >
                        <X className="mr-1 h-3 w-3" aria-hidden="true" />
                        {t("Xóa tệp")}
                      </Button>
                    </div>
                  )}
                </div>
              </label>

              {file && file.size > MANUSCRIPT_PDF_RECOMMENDED_BYTES && (
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {t("Tài liệu có dung lượng lớn. Bạn có thể tối ưu hình ảnh hoặc xuất lại PDF để tải nhanh hơn.")}
                </p>
              )}
              {fileError && (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {fileError}
                </p>
              )}
            </div>
          )}

          {blob ? (
            <details className="mentor-send-preview">
              <summary>{t("Preview PDF to be shared")}</summary>
              <Suspense fallback={<p role="status">{t("Loading private PDF…")}</p>}>
                <PdfPreview blob={blob} compact zoomable onValidation={setPdfValid} />
              </Suspense>
            </details>
          ) : null}

          {/* Group 2: Lecturer Recipient */}
          <label>
            <span>
              {t("Send to lecturer")}
              <RequiredMark />
            </span>
            <select
              required
              aria-required="true"
              aria-invalid={attemptedSubmit && !mentorId}
              value={mentorId}
              onChange={(event) => {
                setSelectedMentor(event.target.value);
              }}
            >
              <option value="">{t("Select an accepted mentor")}</option>
              {mentors.data?.map((item) => (
                <option key={item.id} value={item.canonicalId ?? item.id}>
                  {item.fullName}
                </option>
              ))}
            </select>
          </label>
          {mentors.isLoading ? (
            <p role="status">{t("Loading mentors…")}</p>
          ) : mentors.error ? (
            <p role="alert">
              {t("Could not load mentors.")}{" "}
              <button type="button" onClick={() => void mentors.refetch()}>
                {t("Retry")}
              </button>
            </p>
          ) : !mentors.data?.length ? (
            <p>
              {t("No accepted mentor with valid access is available.")}{" "}
              <Link to={`/projects/${projectId}?tab=support`}>{t("Find an advisor")}</Link>
            </p>
          ) : (
            <p className="mentor-send-hint">{t("Only accepted mentors with valid access can receive this version.")}</p>
          )}
          {context.error ? (
            <p role="alert">
              {t("Could not load review history.")}{" "}
              <button type="button" onClick={() => void context.refetch()}>
                {t("Retry")}
              </button>
            </p>
          ) : null}

          {waiting ? (
            <div
              role="status"
              className="rounded-lg border border-amber-300/80 bg-amber-50/70 p-3 text-xs leading-5 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200"
            >
              <p className="font-medium">
                {t("Giảng viên này đang đánh giá phiên bản v")}{context.data?.submission?.currentRevisionNumber ?? 1}.
              </p>
              <p className="mt-1">
                {t("Bản đã gửi sẽ không bị thay đổi hay tự hủy. Vui lòng chờ giảng viên hoàn tất góp ý trước khi gửi phiên bản mới cho giảng viên này, hoặc chọn cố vấn khác nếu nhóm có nhiều giảng viên hướng dẫn.")}{" "}
                {context.data?.submission?.id && (
                  <Link
                    className="font-medium underline"
                    to={`/projects/${projectId}?tab=submissions&submission=${context.data.submission.id}`}
                  >
                    {t("Open submitted version")}
                  </Link>
                )}
              </p>
            </div>
          ) : null}

          {/* Group 3: Numbered Revision Response Fields */}
          {items.length ? (
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-foreground">
                {t("Respond to requested changes")}{" "}
                <span className="font-normal text-muted-foreground">
                  ({answeredMandatoryCount}/{mandatoryItems.length} {t("yêu cầu bắt buộc")})
                </span>
              </legend>
              {items.map((item, idx) => {
                const isOptional = Boolean(item.optional || item.priority?.toUpperCase() === "SUGGESTION");
                const value = responses[item.id] ?? "";
                const missingThis = attemptedSubmit && !isOptional && !value.trim();
                const fieldId = `revision-response-${item.id}`;
                const errId = `revision-error-${item.id}`;
                return (
                  <div key={item.id} className="space-y-2 rounded-lg border border-border bg-muted/15 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-foreground">
                        {t("Yêu cầu chỉnh sửa")} {idx + 1}
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          isOptional
                            ? "border-sky-300/70 bg-sky-500/10 text-[10.5px] text-sky-800 dark:text-sky-300"
                            : item.priority === "MAJOR"
                              ? "border-amber-300/80 bg-amber-500/12 text-[10.5px] text-amber-900 dark:text-amber-200"
                              : "text-[10.5px]"
                        }
                      >
                        {isOptional ? t("Gợi ý · Không bắt buộc") : item.priority === "MAJOR" ? t("Chỉnh sửa lớn") : t("Chỉnh sửa nhỏ")}
                      </Badge>
                    </div>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">{item.description}</p>
                    {item.locator && (
                      <p className="text-[11px] text-muted-foreground">
                        {t("Vị trí:")} {item.locator}
                      </p>
                    )}
                    <label htmlFor={fieldId} className="pt-1">
                      <span>
                        {t("Phản hồi của nhóm")}
                        {isOptional ? (
                          <span className="ml-1 font-normal text-muted-foreground">({t("Không bắt buộc")})</span>
                        ) : (
                          <RequiredMark />
                        )}
                      </span>
                      <textarea
                        id={fieldId}
                        required={!isOptional}
                        aria-required={!isOptional}
                        aria-invalid={missingThis}
                        aria-describedby={missingThis ? errId : undefined}
                        maxLength={10000}
                        rows={2}
                        value={value}
                        placeholder={t("Mô tả vị trí đã chỉnh sửa hoặc giải trình phương án của nhóm...")}
                        onChange={(event) => setDraft(item.id, event.target.value)}
                      />
                    </label>
                    {missingThis && (
                      <p id={errId} role="alert" className="text-xs font-medium text-destructive">
                        {t("Vui lòng nhập phản hồi cho yêu cầu chỉnh sửa này.")}
                      </p>
                    )}
                  </div>
                );
              })}
            </fieldset>
          ) : null}

          {/* Group 4: Optional Note */}
          <label>
            <span>{t("What would your team like feedback on? (optional)")}</span>
            <textarea rows={3} maxLength={5000} value={message} onChange={(event) => setMessage(event.target.value)} />
          </label>

          {/* Compact Confirmation Summary */}
          {mentorId && blob && !waiting && (
            <div className="rounded-lg border border-border/80 bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">{t("Tóm tắt trước khi gửi")}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {mentorObj && (
                  <span>
                    {t("Người nhận:")} <strong className="text-foreground">{mentorObj.fullName}</strong>
                  </span>
                )}
                <span>
                  {t("Nguồn:")}{" "}
                  <strong className="text-foreground">
                    {source === "SNAPSHOT"
                      ? `LaTeX Snapshot${prepared ? ` (v${prepared.version})` : ""}`
                      : file?.name ?? "PDF"}
                  </strong>
                </span>
                {items.length > 0 && (
                  <span>
                    {t("Phản hồi kèm theo:")}{" "}
                    <strong className="text-foreground">
                      {answeredTotalCount}/{items.length}
                    </strong>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Honest Upload & Server Processing Stage */}
          {send.isPending && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs" role="status" aria-live="polite">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
                <span>
                  {source === "PDF" && uploadPercent !== null && uploadPercent < 100
                    ? t("Đang tải bản PDF lên ({{percent}}%)…", { percent: uploadPercent })
                    : t("Đã tải tệp lên. Máy chủ đang kiểm tra bản thảo và lưu phiên bản…")}
                </span>
              </div>
              {source === "PDF" && uploadPercent !== null && uploadPercent < 100 && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-150"
                    style={{ width: `${uploadPercent}%` }}
                  />
                </div>
              )}
            </div>
          )}

          <p className="mentor-send-hint">
            {t(
              "The mentor receives this request in Mentor Workspace and can only read and review the version you share. This is internal feedback, not a conference or journal submission.",
            )}
          </p>
        </fieldset>

        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}

        {/* Explicit Submit Readiness Summary when button is disabled */}
        {!busy && submitDisabled && readinessReasons.length > 0 && (
          <div className="rounded-lg border border-border/80 bg-muted/25 px-3 py-2 text-xs text-muted-foreground" role="status">
            <span className="font-medium text-foreground">{t("Chưa thể gửi:")} </span>
            {readinessReasons.join(" · ")}
          </div>
        )}

        <footer>
          <Button type="button" variant="outline" disabled={busy} onClick={() => props.onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={submitDisabled}>
            {t(send.isPending ? "Sending…" : "Send for mentor feedback")}
          </Button>
        </footer>
      </form>
    </DialogContent>
  );
}
