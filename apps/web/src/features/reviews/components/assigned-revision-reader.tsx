import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Eye, GitCompare, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { submissionsApi } from "@/features/submissions";
import { useI18n } from "@/i18n";
import { Link } from "react-router-dom";
import type { PdfFitMode, PdfViewState } from "./pdf-manuscript-viewer";
import "@/pages/reviews/review-workspace.css";

export interface ReadOnlyRevisionOption {
  id: string;
  revisionNumber: number;
  label?: string;
}

/** A read-only presentation over the same authenticated immutable revision reader. */
export function ReadOnlyReviewManuscript({
  title,
  submissionId,
  revision,
  roundNumber,
  artifactTypeLabel,
  projectTitle,
  statusLabel,
  statusClassName,
  text,
  backHref,
  backLabel,
  primaryAction,
  compareHref,
  compareLabel,
  availableVersions,
  onSelectVersion,
  historicalBanner,
  contextPanel,
}: {
  title: string;
  submissionId: string;
  revision: { id: string; revisionNumber: number; contentType?: string };
  roundNumber?: number;
  artifactTypeLabel?: string;
  projectTitle?: string;
  statusLabel?: string;
  statusClassName?: string;
  text?: string;
  backHref: string;
  backLabel?: string;
  primaryAction?: ReactNode;
  compareHref?: string;
  compareLabel?: string;
  availableVersions?: ReadOnlyRevisionOption[];
  onSelectVersion?: (revisionId: string) => void;
  historicalBanner?: string;
  contextPanel?: ReactNode;
}) {
  const { t } = useI18n();
  const [contextOpen, setContextOpen] = useState(false);

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6" data-no-i18n>
      <header className="rounded-xl border border-border bg-card shadow-xs">
        <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="-ml-2 h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground">
                <Link to={backHref}>
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{backLabel ?? t("mentorLifecycle.backRequest")}</span>
                </Link>
              </Button>
              <Badge variant="outline" className="h-5 gap-1 border-slate-300/80 bg-slate-100/80 px-2 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
                <Eye className="h-3 w-3" aria-hidden="true" />
                {t("mentorLifecycle.readOnly")}
              </Badge>
              {statusLabel ? (
                <Badge variant="outline" className={`h-5 px-2 text-[11px] font-medium ${statusClassName ?? "border-border bg-muted/60 text-muted-foreground"}`}>
                  {statusLabel}
                </Badge>
              ) : null}
            </div>

            <h1 className="break-words text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl">
              {title}
            </h1>

            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
              {projectTitle ? <span className="font-medium text-foreground/80">{projectTitle}</span> : null}
              {projectTitle && artifactTypeLabel ? <span aria-hidden="true">·</span> : null}
              {artifactTypeLabel ? <span>{artifactTypeLabel}</span> : null}
              {(projectTitle || artifactTypeLabel) ? <span aria-hidden="true">·</span> : null}
              <span className="font-medium text-foreground">
                {t("mentorWorkspace.version", { version: revision.revisionNumber })}
              </span>
              {roundNumber ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{t("mentorWorkspace.round", { round: roundNumber })}</span>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {availableVersions && availableVersions.length > 1 && onSelectVersion ? (
              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="sr-only">{t("mentorLifecycle.switchVersion")}</span>
                <select
                  aria-label={t("mentorLifecycle.switchVersion")}
                  value={revision.id}
                  onChange={event => onSelectVersion(event.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {availableVersions.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.label ?? t("mentorWorkspace.version", { version: option.revisionNumber })}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {compareHref ? (
              <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                <Link to={compareHref}>
                  <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{compareLabel ?? t("mentorLifecycle.compareVersions", { prev: Math.max(1, revision.revisionNumber - 1), curr: revision.revisionNumber })}</span>
                </Link>
              </Button>
            ) : null}

            {contextPanel ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                aria-expanded={contextOpen}
                onClick={() => setContextOpen(open => !open)}
              >
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{contextOpen ? t("mentorLifecycle.hideDetails") : t("mentorLifecycle.requestDetails")}</span>
                {contextOpen ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
              </Button>
            ) : null}

            {primaryAction}
          </div>
        </div>

        {historicalBanner ? (
          <div className="border-t border-amber-500/25 bg-amber-500/[0.06] px-4 py-2 text-xs text-amber-900 dark:text-amber-200" role="status">
            {historicalBanner}
          </div>
        ) : null}

        {contextPanel && contextOpen ? (
          <div className="border-t border-border/75 bg-muted/20 px-4 py-3 text-xs">
            {contextPanel}
          </div>
        ) : null}
      </header>

      <div className={revision.contentType === "PDF" ? "flex h-[78dvh] min-h-[460px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs" : "rounded-xl border border-border bg-card p-4 shadow-xs"}>
        <AssignedRevisionReader
          key={revision.id}
          submissionId={submissionId}
          revisionId={revision.id}
          contentType={revision.contentType}
          text={text}
          compact={revision.contentType === "PDF"}
          ariaLabel={`${title} — ${t("mentorWorkspace.version", { version: revision.revisionNumber })}`}
          onDownload={revision.contentType === "PDF" ? () => void submissionsApi.downloadRevision(submissionId, revision.id, revision.revisionNumber) : undefined}
        />
      </div>
    </section>
  );
}

const PdfManuscriptViewer = lazy(() => import("./pdf-manuscript-viewer"));

async function isRealPdfBlob(blob: Blob): Promise<boolean> {
  if (blob.size < 5) return false;
  try {
    if (typeof blob.arrayBuffer !== "function") return false;
    const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 && head[4] === 0x2d; // "%PDF-"
  } catch {
    return false;
  }
}

export function AssignedRevisionReader({
  submissionId,
  revisionId,
  contentType,
  text,
  compact = false,
  onDownload,
  cachedBlob,
  onBlobLoaded,
  initialPage,
  initialFitMode,
  initialZoom,
  jumpToPageRequest,
  syncedZoom,
  onViewStateChange,
  ariaLabel,
}: {
  submissionId: string;
  revisionId?: string;
  contentType?: string;
  text?: string;
  compact?: boolean;
  onDownload?: () => void;
  cachedBlob?: Blob | null;
  onBlobLoaded?: (revisionId: string, blob: Blob) => void;
  initialPage?: number;
  initialFitMode?: PdfFitMode;
  initialZoom?: number;
  jumpToPageRequest?: { page: number; nonce: number } | null;
  syncedZoom?: { fitMode: PdfFitMode; customZoom: number } | null;
  onViewStateChange?: (state: PdfViewState) => void;
  ariaLabel?: string;
}) {
  const { t } = useI18n();
  const readerId = useId();
  const onBlobLoadedRef = useRef(onBlobLoaded);
  onBlobLoadedRef.current = onBlobLoaded;
  const sections = useMemo(() => {
    const parts: Array<{ title: string; content: string }> = [];
    for (const line of (text ?? "").split("\n")) {
      const heading = line.match(/^#{1,6}\s+(.+)/)?.[1] ?? line.match(/^\\(?:chapter|section|subsection)\*?\{([^}]+)\}/)?.[1];
      if (!parts.length || (heading && parts.length < 60)) {
        parts.push({ title: heading ?? t("mentorWorkspace.documentStart"), content: line });
      } else {
        parts[parts.length - 1]!.content += `\n${line}`;
      }
    }
    return parts;
  }, [text, t]);

  const [url, setUrl] = useState("");
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [usePdfJs, setUsePdfJs] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [fallbackBlob, setFallbackBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (!fallbackBlob) return;
    const fallbackUrl = URL.createObjectURL(fallbackBlob);
    setUrl(fallbackUrl);
    return () => URL.revokeObjectURL(fallbackUrl);
  }, [fallbackBlob]);

  useEffect(() => {
    setUrl("");
    setPdfBlob(null);
    setUsePdfJs(false);
    setFallbackBlob(null);
    setFailed(false);
    if (contentType !== "PDF" || !revisionId) return;

    const controller = new AbortController();
    let objectUrl = "";

    const hydrateBlob = async (raw: Blob, fromCache: boolean) => {
      if (controller.signal.aborted) return;
      const normalized = fromCache ? raw : new Blob([raw], { type: "application/pdf" });
      if (!fromCache) onBlobLoadedRef.current?.(revisionId, normalized);
      const realPdf = compact ? await isRealPdfBlob(normalized) : false;
      if (controller.signal.aborted) return;
      if (realPdf) {
        setPdfBlob(normalized);
        setUsePdfJs(true);
      } else {
        objectUrl = URL.createObjectURL(normalized);
        setUrl(objectUrl);
        setUsePdfJs(false);
      }
    };

    if (cachedBlob && attempt === 0) {
      void hydrateBlob(cachedBlob, true);
    } else {
      submissionsApi
        .revisionBlob(submissionId, revisionId, controller.signal)
        .then(blob => hydrateBlob(blob, false))
        .catch(() => {
          if (!controller.signal.aborted) setFailed(true);
        });
    }

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [submissionId, revisionId, contentType, compact, attempt, cachedBlob]);

  if (contentType === "PDF") {
    return (
      <div className={compact ? "rw-reader-body" : "mt-4"} aria-live="polite">
        {usePdfJs && pdfBlob ? (
          <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">{t("Loading assigned PDF…")}</p>}>
            <PdfManuscriptViewer
              blob={pdfBlob}
              onDownload={onDownload}
              initialPage={initialPage}
              initialFitMode={initialFitMode}
              initialZoom={initialZoom}
              jumpToPageRequest={jumpToPageRequest}
              syncedZoom={syncedZoom}
              onViewStateChange={onViewStateChange}
              ariaLabel={ariaLabel}
              onError={() => {
                // Fallback to native browser iframe if PDF.js hits an exotic font/stream error
                setFallbackBlob(pdfBlob);
                setUsePdfJs(false);
              }}
            />
          </Suspense>
        ) : url ? (
          <iframe
            title={ariaLabel ?? t("Assigned manuscript PDF")}
            src={url}
            className={compact ? "rw-pdf-frame" : "h-[70vh] w-full rounded-md border"}
          />
        ) : failed ? (
          <div className="m-4 rounded-md border p-4 text-sm">
            <p>{t("Could not load the assigned PDF.")}</p>
            <Button variant="outline" className="mt-2" onClick={() => setAttempt(n => n + 1)}>
              {t("Retry")}
            </Button>
          </div>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">{t("Loading assigned PDF…")}</p>
        )}
        {!compact ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Use the PDF toolbar to navigate pages. Feedback uses page or section references; quotations must be checked manually.")}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={compact ? "rw-reader-body rw-reader-text-wrap" : "mt-4"}>
      {sections.length > 1 && (
        <label className="mb-3 block text-sm">
          {t("mentorWorkspace.goToSection")}
          <select
            className="ml-3 max-w-full rounded-md border bg-background p-2"
            defaultValue=""
            onChange={event =>
              document.getElementById(`${readerId}-${event.target.value}`)?.scrollIntoView({ block: "start", behavior: "auto" })
            }
          >
            <option value="" disabled>
              {t("mentorWorkspace.chooseSection")}
            </option>
            {sections.map((section, index) => (
              <option key={index} value={index}>
                {section.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className={compact ? "rw-text-frame" : "max-h-[70vh] overflow-auto rounded-lg border bg-muted/20 p-4"}>
        {text ? (
          sections.map((section, index) => (
            <pre key={index} id={`${readerId}-${index}`} className="scroll-mt-4 whitespace-pre-wrap break-words text-sm leading-7">
              {section.content}
            </pre>
          ))
        ) : (
          <p>{t("No text snapshot available")}</p>
        )}
      </div>
    </div>
  );
}
