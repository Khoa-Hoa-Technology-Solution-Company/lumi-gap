import { useI18n } from "@/i18n";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { ResearchVersion } from "@trend/shared-types";
import { AlertCircle, Download, FileCode2, FileText, Loader2, Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { submissionsApi } from "../api/submissions.api";
import "@/features/manuscripts/manuscripts.css";

const PdfPreview = lazy(() => import("@/features/academic-profile/components/private-evidence-pdf-preview"));

interface SubmissionDocumentViewerProps {
  submissionId: string;
  submissionTitle: string;
  version: ResearchVersion;
  historyLoading?: boolean;
  isLatestVersion?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function SubmissionDocumentViewer(props: SubmissionDocumentViewerProps) {
  const userId = useAuthStore((state) => state.user?.id ?? "anonymous");
  return <SubmissionDocumentReader key={`${userId}:${props.submissionId}:${props.version.id}`} {...props} />;
}

function SubmissionDocumentReader({
  submissionId,
  submissionTitle,
  version,
  historyLoading = false,
  isLatestVersion = true,
  expanded = false,
  onToggleExpand,
}: SubmissionDocumentViewerProps) {
  const { t } = useI18n();
  const userId = useAuthStore((state) => state.user?.id ?? "anonymous");
  const [downloading, setDownloading] = useState(false);
  const [viewMode, setViewMode] = useState<"PDF" | "TEXT">(version.hasPdf ? "PDF" : "TEXT");
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const failPreview = useCallback(() => setPdfError(true), []);

  useEffect(() => {
    setViewMode(version.hasPdf ? "PDF" : "TEXT");
  }, [version.id, version.hasPdf]);

  useEffect(() => {
    setPdfBlob(null);
    setPdfError(false);
    if (!submissionId || !version.id || !version.hasPdf || historyLoading || viewMode !== "PDF") {
      setPdfLoading(false);
      return;
    }
    const controller = new AbortController();
    setPdfLoading(true);
    submissionsApi
      .revisionBlob(submissionId, version.id, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        setPdfBlob(blob instanceof Blob ? blob : new Blob([blob], { type: "application/pdf" }));
        setPdfLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setPdfError(true);
        setPdfLoading(false);
      });
    return () => controller.abort();
  }, [userId, submissionId, version.id, version.hasPdf, historyLoading, viewMode, retryCount]);

  const paragraphs = useMemo(
    () =>
      (version.contentSnapshot ?? "")
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean),
    [version.contentSnapshot],
  );

  const displayFileName =
    version.originalFileName?.trim() ||
    `${submissionTitle.slice(0, 60).trim() || "ban-thao"}-v${version.revisionNumber}${version.hasPdf ? ".pdf" : ""}`;

  const sourceLabel = version.manuscriptSnapshotId
    ? "Bản chụp LaTeX"
    : version.hasPdf
      ? "PDF tải lên"
      : "Văn bản";

  const sizeLabel = formatFileSize(version.sizeBytes);

  async function handleDownload() {
    if (downloading || !version.id) return;
    setDownloading(true);
    try {
      await submissionsApi.downloadRevision(submissionId, version.id, version.revisionNumber);
    } catch {
      toast.error(t("Không thể tải tệp PDF. Vui lòng kiểm tra quyền truy cập và thử lại."));
    } finally {
      setDownloading(false);
    }
  }

  const canToggleMode = Boolean(version.hasPdf && version.contentSnapshot?.trim());

  return (
    <section className="submission-viewer-card rounded-xl border border-border bg-card shadow-xs overflow-hidden">
      {/* Slim Single-Line Viewer Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/75 bg-muted/20 px-3.5 py-2 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <h3 className="truncate text-xs font-semibold text-foreground sm:text-[13px]" title={displayFileName}>
            {displayFileName}
          </h3>
          <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[11px] font-semibold">
            v{version.revisionNumber}
          </Badge>
          {!isLatestVersion && (
            <Badge variant="outline" className="h-5 shrink-0 border-amber-300 bg-amber-50 px-1.5 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"> {t("Phiên bản cũ")} </Badge>
          )}
          <span className="hidden truncate text-[11.5px] text-muted-foreground sm:inline">
            · {t(sourceLabel)}
            {sizeLabel ? ` · ${sizeLabel}` : ""}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canToggleMode && (
            <div className="inline-flex rounded-lg border border-border bg-background p-0.5 text-xs" role="group" aria-label={t("Chế độ xem bản thảo")}>
              <button
                type="button"
                aria-pressed={viewMode === "PDF"}
                onClick={() => setViewMode("PDF")}
                className={`rounded-md px-2 py-0.5 text-[11.5px] font-medium transition-colors ${
                  viewMode === "PDF"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                PDF
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "TEXT"}
                onClick={() => setViewMode("TEXT")}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-medium transition-colors ${
                  viewMode === "TEXT"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileCode2 className="h-3 w-3" aria-hidden="true" /> {t("Văn bản")} </button>
            </div>
          )}

          {!historyLoading && version.hasPdf && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2.5 text-xs"
              disabled={downloading}
              onClick={() => void handleDownload()}
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} {t("Tải PDF")} </Button>
          )}

          {onToggleExpand && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="hidden h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground xl:inline-flex"
              onClick={onToggleExpand}
              title={t(expanded ? "Hiện bảng góp ý" : "Mở rộng vùng đọc")}
              aria-label={t(expanded ? "Hiện bảng góp ý" : "Mở rộng vùng đọc")}
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              <span>{t(expanded ? "Hiện góp ý" : "Mở rộng")}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Revision note banner if author wrote one for this version */}
      {version.responseToReview && (
        <div className="border-b border-border/70 bg-muted/10 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          <span className="font-medium text-foreground">{t("Ghi chú gửi bản v")}{version.revisionNumber}: </span>
          <span className="whitespace-pre-wrap">{version.responseToReview}</span>
        </div>
      )}

      {/* Document Body */}
      <div className="submission-viewer-body">
        {historyLoading ? (
          <div className="flex h-[520px] flex-col items-center justify-center gap-3 p-8 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span>{t("Đang tải thông tin bản thảo…")}</span>
          </div>
        ) : version.hasPdf && viewMode === "PDF" ? (
          pdfLoading ? (
            <div className="flex h-[560px] flex-col items-center justify-center gap-3 p-8 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span>{t("Đang tải bản PDF phiên bản v")}{version.revisionNumber}…</span>
            </div>
          ) : pdfError ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 p-8 text-center" role="alert">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div className="max-w-md space-y-1">
                <p className="text-sm font-medium text-foreground">{t("Không thể hiển thị trực tiếp bản PDF v")}{version.revisionNumber}</p>
                <p className="text-xs text-muted-foreground"> {t("Tệp có thể đang tạm gián đoạn kết nối hoặc trình duyệt không thể dựng bản xem trước. Bạn có thể thử tải lại hoặc tải tệp PDF về máy.")} </p>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRetryCount((n) => n + 1)}>
                  <RefreshCw className="h-3.5 w-3.5" /> {t("Thử lại")} </Button>
                <Button size="sm" className="gap-1.5" disabled={downloading} onClick={() => void handleDownload()}>
                  <Download className="h-3.5 w-3.5" /> {t("Tải PDF (v")}{version.revisionNumber})
                </Button>
              </div>
            </div>
          ) : pdfBlob ? (
            <div className="submission-pdf-stage" data-testid="submission-pdf-viewer">
              <Suspense
                fallback={
                  <div className="flex h-[560px] flex-col items-center justify-center gap-3 p-8 text-sm text-muted-foreground" role="status">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span>{t("Đang khởi tạo trình đọc PDF…")}</span>
                  </div>
                }
              >
                <PdfPreview blob={pdfBlob} zoomable compact continuous onError={failPreview} />
              </Suspense>
            </div>
          ) : null
        ) : paragraphs.length > 0 ? (
          <div className="max-h-[75vh] overflow-y-auto p-5 sm:p-6">
            <div className="space-y-3.5">
              {paragraphs.map((paragraph, index) => (
                <div
                  key={index}
                  id={`para-${index + 1}`}
                  className="rounded-lg border border-transparent p-3 transition-colors hover:border-border hover:bg-muted/20"
                >
                  <div className="mb-1 text-[11px] font-medium text-muted-foreground">{t("Đoạn")} {index + 1}</div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{paragraph}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <FileText className="h-8 w-8 opacity-40" />
            <p>{t("Phiên bản v")}{version.revisionNumber} {t("chưa có tệp PDF hoặc nội dung hiển thị.")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
