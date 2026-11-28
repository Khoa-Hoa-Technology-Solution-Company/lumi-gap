import { useEffect, useMemo, useState } from "react";
import type { ResearchVersion } from "@trend/shared-types";
import { ArrowLeft, Columns2, Download, FileCode2, FileText, Link2, Lock, Maximize2, MessageSquareText, Minimize2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { submissionsApi } from "@/features/submissions";
import { diffContent } from "@/features/submissions/content-diff";
import { useI18n } from "@/i18n";
import type { ReviewWorkspace } from "../api/reviews.api";
import { AssignedRevisionReader } from "./assigned-revision-reader";
import type { PdfFitMode, PdfViewState } from "./pdf-manuscript-viewer";
import { PreviousFeedbackPanel } from "./previous-feedback-panel";

interface RevisionCompareViewProps {
  assignmentId: string;
  submissionId: string;
  before: ResearchVersion;
  after: ResearchVersion;
  selectableBaselines: ResearchVersion[];
  onSelectBaseline: (revisionId: string) => void;
  baselineRoundNumber?: number;
  currentRoundNumber: number;
  hasPreviousFeedback?: boolean;
  previousFeedbackCount?: number;
  currentCriteria?: ReviewWorkspace["criteria"];
  currentTemplateGuidelines?: string[];
  assignedCachedBlob?: Blob | null;
  onAssignedBlobLoaded?: (revisionId: string, blob: Blob) => void;
  initialAssignedView?: PdfViewState | null;
  onAssignedViewChange?: (state: PdfViewState) => void;
  onExitCompare: () => void;
}

type ComparePaneFocus = "split" | "before" | "after";
type CompareDisplayMode = "sideBySide" | "textDiff";

export function RevisionCompareView({
  assignmentId,
  submissionId,
  before,
  after,
  selectableBaselines,
  onSelectBaseline,
  baselineRoundNumber,
  currentRoundNumber,
  hasPreviousFeedback = false,
  previousFeedbackCount,
  currentCriteria,
  currentTemplateGuidelines,
  assignedCachedBlob,
  onAssignedBlobLoaded,
  initialAssignedView,
  onAssignedViewChange,
  onExitCompare,
}: RevisionCompareViewProps) {
  const { t } = useI18n();
  const [paneFocus, setPaneFocus] = useState<ComparePaneFocus>("split");
  const [mobileSide, setMobileSide] = useState<"before" | "after" | "feedback">("after");
  const [syncZoomEnabled, setSyncZoomEnabled] = useState(false);
  const [sharedZoom, setSharedZoom] = useState<{ fitMode: PdfFitMode; customZoom: number } | null>(null);
  const [feedbackPanelOpen, setFeedbackPanelOpen] = useState(false);
  const [feedbackPanelWide, setFeedbackPanelWide] = useState(false);
  const [beforeJumpRequest, setBeforeJumpRequest] = useState<{ page: number; nonce: number } | null>(null);
  const [pendingBaselineJump, setPendingBaselineJump] = useState<{ revisionId: string; page: number } | null>(null);

  // Close panel and reset jump state when assignment changes so stale assignment feedback never lingers
  useEffect(() => {
    setFeedbackPanelOpen(false);
    setBeforeJumpRequest(null);
    setPendingBaselineJump(null);
    setMobileSide("after");
  }, [assignmentId]);

  // Trigger deferred jump once left pane switches to the target reviewed version
  useEffect(() => {
    if (!pendingBaselineJump || before.id !== pendingBaselineJump.revisionId) return;
    setBeforeJumpRequest({ page: pendingBaselineJump.page, nonce: Date.now() });
    setPendingBaselineJump(null);
  }, [before.id, pendingBaselineJump]);

  const hasCompatibleTextSnapshots = Boolean(
    before.contentSnapshot != null &&
      after.contentSnapshot != null &&
      before.contentSnapshot.trim().length > 0 &&
      after.contentSnapshot.trim().length > 0,
  );
  const [displayMode, setDisplayMode] = useState<CompareDisplayMode>("sideBySide");

  const textDiff = useMemo(() => {
    if (!hasCompatibleTextSnapshots) return undefined;
    return diffContent(before.contentSnapshot!, after.contentSnapshot!);
  }, [hasCompatibleTextSnapshots, before.contentSnapshot, after.contentSnapshot]);

  // Reset to side-by-side if newly chosen baseline lacks text snapshot
  useEffect(() => {
    if (!hasCompatibleTextSnapshots && displayMode === "textDiff") {
      setDisplayMode("sideBySide");
    }
  }, [hasCompatibleTextSnapshots, displayMode]);

  // Escape keyboard shortcut closes Previous Feedback panel first, otherwise exits Compare Mode
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (feedbackPanelOpen) {
        setFeedbackPanelOpen(false);
        if (mobileSide === "feedback") setMobileSide("after");
        return;
      }
      onExitCompare();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onExitCompare, feedbackPanelOpen, mobileSide]);

  const handleJumpToReviewedPage = (revisionId: string, page: number) => {
    if (displayMode !== "sideBySide") setDisplayMode("sideBySide");
    if (paneFocus === "after") setPaneFocus("split");
    setMobileSide("before");
    if (before.id === revisionId) {
      setBeforeJumpRequest({ page, nonce: Date.now() });
    } else if (selectableBaselines.some(v => v.id === revisionId)) {
      setPendingBaselineJump({ revisionId, page });
      onSelectBaseline(revisionId);
    }
  };

  const handleDownloadVersion = (version: ResearchVersion) => {
    void submissionsApi
      .downloadRevision(submissionId, version.id, version.revisionNumber)
      .catch(() => toast.error(t("reviewWorkspace.pdfUnavailable")));
  };

  const handleBeforeViewChange = (state: PdfViewState) => {
    if (!syncZoomEnabled) return;
    setSharedZoom(prev =>
      prev && prev.fitMode === state.fitMode && Math.abs(prev.customZoom - state.customZoom) < 0.001
        ? prev
        : { fitMode: state.fitMode, customZoom: state.customZoom },
    );
  };

  const handleAfterViewChange = (state: PdfViewState) => {
    onAssignedViewChange?.(state);
    if (!syncZoomEnabled) return;
    setSharedZoom(prev =>
      prev && prev.fitMode === state.fitMode && Math.abs(prev.customZoom - state.customZoom) < 0.001
        ? prev
        : { fitMode: state.fitMode, customZoom: state.customZoom },
    );
  };

  const sourceKindLabel =
    before.contentType === "LATEX" || after.contentType === "LATEX"
      ? t("reviewWorkspace.compare.sourceKindLatex")
      : t("reviewWorkspace.compare.sourceKindText");

  return (
    <section
      className="rw-compare-shell"
      aria-label={t("reviewWorkspace.compare.title")}
      data-testid="review-compare-mode"
    >
      {/* Clean Compare Mode Toolbar */}
      <header className="rw-compare-header">
        <div className="rw-compare-header-left">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-medium"
            onClick={onExitCompare}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t("reviewWorkspace.compare.backToReview")}</span>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">{t("reviewWorkspace.compare.title")}</h2>
              <Badge variant="secondary" className="h-5 px-2 text-[11px] font-semibold tabular-nums">
                v{before.revisionNumber} → v{after.revisionNumber}
              </Badge>
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              {displayMode === "textDiff"
                ? t("reviewWorkspace.compare.textDiffHonestNote", { kind: sourceKindLabel })
                : t("reviewWorkspace.compare.manualPdfNote")}
            </p>
          </div>
        </div>

        <div className="rw-compare-header-controls">
          {selectableBaselines.length > 1 ? (
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="hidden sm:inline">{t("reviewWorkspace.compare.baselineLabel")}</span>
              <select
                aria-label={t("reviewWorkspace.compare.baselineLabel")}
                value={before.id}
                onChange={e => onSelectBaseline(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-xs font-medium text-foreground"
              >
                {selectableBaselines.map(ver => (
                  <option key={ver.id} value={ver.id}>
                    v{ver.revisionNumber} ({new Date(ver.createdAt).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {hasCompatibleTextSnapshots ? (
            <div className="rw-layout-switch" role="group" aria-label={t("reviewWorkspace.compare.displayMode")}>
              <button
                type="button"
                data-active={displayMode === "sideBySide"}
                onClick={() => setDisplayMode("sideBySide")}
              >
                <FileText size={12} className="mr-1" aria-hidden="true" />
                {t("reviewWorkspace.compare.sideBySide")}
              </button>
              <button
                type="button"
                data-active={displayMode === "textDiff"}
                onClick={() => setDisplayMode("textDiff")}
              >
                <FileCode2 size={12} className="mr-1" aria-hidden="true" />
                {t("reviewWorkspace.compare.textDiff")}
              </button>
            </div>
          ) : null}

          {displayMode === "sideBySide" && before.contentType === "PDF" && after.contentType === "PDF" ? (
            <button
              type="button"
              className="rw-compare-toggle-btn"
              aria-pressed={syncZoomEnabled}
              data-active={syncZoomEnabled ? "true" : undefined}
              title={t("reviewWorkspace.compare.syncZoomHint")}
              onClick={() => {
                setSyncZoomEnabled(prev => {
                  if (prev) setSharedZoom(null);
                  return !prev;
                });
              }}
            >
              <Link2 size={12} aria-hidden="true" />
              <span>{t("reviewWorkspace.compare.syncZoom")}</span>
            </button>
          ) : null}

          {hasPreviousFeedback ? (
            <button
              type="button"
              className="rw-compare-toggle-btn"
              aria-expanded={feedbackPanelOpen}
              aria-pressed={feedbackPanelOpen}
              data-active={feedbackPanelOpen ? "true" : undefined}
              data-testid="compare-previous-feedback-toggle"
              onClick={() => {
                setFeedbackPanelOpen(open => {
                  const next = !open;
                  if (!next && mobileSide === "feedback") setMobileSide("after");
                  return next;
                });
              }}
            >
              <MessageSquareText size={12} aria-hidden="true" />
              <span>{t("reviewWorkspace.compare.previousFeedback.button")}</span>
              {typeof previousFeedbackCount === "number" && previousFeedbackCount > 0 ? (
                <span className="rw-compare-badge-count tabular-nums">{previousFeedbackCount}</span>
              ) : null}
            </button>
          ) : null}

          {displayMode === "sideBySide" && paneFocus !== "split" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden h-8 gap-1.5 text-xs lg:inline-flex"
              onClick={() => setPaneFocus("split")}
            >
              <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>50 / 50</span>
            </Button>
          ) : null}
        </div>
      </header>

      <div className="rw-compare-body" data-feedback-open={feedbackPanelOpen ? "true" : undefined} data-mobile-side={mobileSide}>
      <div className="rw-compare-main">
      {/* Text/Source Diff View (only when both revisions have compatible contentSnapshot) */}
      {displayMode === "textDiff" && hasCompatibleTextSnapshots ? (
        <div className="rw-compare-text-panel" role="region" aria-label={t("reviewWorkspace.compare.textDiff")}>
          {textDiff ? (
            <div className="rw-compare-diff-scroll font-mono text-xs leading-6">
              <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-card px-3 py-2 font-sans text-xs text-muted-foreground">
                <span>{t("reviewWorkspace.compare.diffLegend")}</span>
                <span className="font-medium text-foreground">
                  v{before.revisionNumber} → v{after.revisionNumber} ({sourceKindLabel})
                </span>
              </div>
              {textDiff.map((line, index) => (
                <div
                  key={index}
                  className={`whitespace-pre-wrap break-words px-3 py-0.5 ${
                    line.kind === "added"
                      ? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
                      : line.kind === "removed"
                        ? "bg-rose-500/10 text-rose-900 dark:text-rose-200"
                        : "text-muted-foreground"
                  }`}
                >
                  {line.kind === "added" ? "+ " : line.kind === "removed" ? "− " : "  "}
                  {line.text || " "}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rw-compare-pane">
                <div className="rw-compare-pane-head">
                  <span className="font-semibold">v{before.revisionNumber}</span>
                </div>
                <pre className="flex-1 overflow-auto p-3 text-xs leading-6 whitespace-pre-wrap break-words">
                  {before.contentSnapshot}
                </pre>
              </div>
              <div className="rw-compare-pane">
                <div className="rw-compare-pane-head">
                  <span className="font-semibold">v{after.revisionNumber}</span>
                </div>
                <pre className="flex-1 overflow-auto p-3 text-xs leading-6 whitespace-pre-wrap break-words">
                  {after.contentSnapshot}
                </pre>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Mobile / Tablet Version Switcher (< 1024px) — never squishes two PDFs into one narrow row */}
          <div className="rw-compare-mobile-tabs" role="tablist" aria-label={t("reviewWorkspace.compare.title")}>
            <button
              type="button"
              role="tab"
              aria-selected={mobileSide === "before"}
              className="rw-mobile-tab"
              data-active={mobileSide === "before" ? "true" : undefined}
              onClick={() => setMobileSide("before")}
            >
              <span>
                v{before.revisionNumber} · {t("reviewWorkspace.compare.beforeShort")}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileSide === "after"}
              className="rw-mobile-tab"
              data-active={mobileSide === "after" ? "true" : undefined}
              onClick={() => setMobileSide("after")}
            >
              <span>
                v{after.revisionNumber} · {t("reviewWorkspace.compare.afterShort")}
              </span>
            </button>
            {hasPreviousFeedback ? (
              <button
                type="button"
                role="tab"
                aria-selected={mobileSide === "feedback"}
                className="rw-mobile-tab"
                data-active={mobileSide === "feedback" ? "true" : undefined}
                onClick={() => {
                  setFeedbackPanelOpen(true);
                  setMobileSide("feedback");
                }}
              >
                <MessageSquareText size={13} aria-hidden="true" />
                <span>{t("reviewWorkspace.compare.previousFeedback.button")}</span>
              </button>
            ) : null}
          </div>

          {/* Two Independent Document Readers (50/50 split on desktop; single active tab on mobile/tablet) */}
          <div className="rw-compare-grid" data-focus={paneFocus} data-mobile-side={mobileSide}>
            {/* Left: Historical Reviewed Revision (Read-Only) */}
            <section
              className="rw-compare-pane rw-compare-pane-before"
              aria-label={t("reviewWorkspace.compare.beforeTitle", { version: before.revisionNumber })}
              data-testid="compare-pane-before"
            >
              <div className="rw-compare-pane-head">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant="outline" className="h-5 shrink-0 px-2 text-[11px] font-semibold">
                    v{before.revisionNumber}
                  </Badge>
                  <span className="truncate text-xs font-semibold text-foreground">
                    {baselineRoundNumber
                      ? t("reviewWorkspace.compare.beforeWithRound", { round: baselineRoundNumber })
                      : t("reviewWorkspace.compare.beforeLabel")}
                  </span>
                  <span className="hidden text-[11px] text-muted-foreground xl:inline">
                    · {t("reviewWorkspace.compare.readOnlyTag")}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {before.hasPdf ? (
                    <button
                      type="button"
                      className="rw-pdf-btn"
                      title={t("reviewWorkspace.downloadPdf")}
                      aria-label={`${t("reviewWorkspace.downloadPdf")} v${before.revisionNumber}`}
                      onClick={() => handleDownloadVersion(before)}
                    >
                      <Download size={13} aria-hidden="true" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rw-pdf-btn hidden lg:inline-flex"
                    title={
                      paneFocus === "before"
                        ? t("reviewWorkspace.compare.restoreSplit")
                        : t("reviewWorkspace.compare.expandPane")
                    }
                    aria-label={
                      paneFocus === "before"
                        ? t("reviewWorkspace.compare.restoreSplit")
                        : t("reviewWorkspace.compare.expandPane")
                    }
                    onClick={() => setPaneFocus(prev => (prev === "before" ? "split" : "before"))}
                  >
                    {paneFocus === "before" ? <Minimize2 size={13} aria-hidden="true" /> : <Maximize2 size={13} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <AssignedRevisionReader
                key={`compare-before-${before.id}`}
                compact
                submissionId={submissionId}
                revisionId={before.id}
                contentType={before.contentType}
                text={before.contentSnapshot ?? undefined}
                jumpToPageRequest={beforeJumpRequest}
                syncedZoom={syncZoomEnabled ? sharedZoom : null}
                onViewStateChange={handleBeforeViewChange}
                ariaLabel={t("reviewWorkspace.compare.beforeTitle", { version: before.revisionNumber })}
                onDownload={before.hasPdf ? () => handleDownloadVersion(before) : undefined}
              />
            </section>

            {/* Right: Assigned Current Revision (Fixed / Immutable) */}
            <section
              className="rw-compare-pane rw-compare-pane-after"
              aria-label={t("reviewWorkspace.compare.afterTitle", { version: after.revisionNumber })}
              data-testid="compare-pane-after"
            >
              <div className="rw-compare-pane-head rw-compare-pane-head-current">
                <div className="flex min-w-0 items-center gap-2">
                  <Lock size={12} className="shrink-0 text-primary" aria-hidden="true" />
                  <Badge className="h-5 shrink-0 px-2 text-[11px] font-semibold">
                    v{after.revisionNumber}
                  </Badge>
                  <span className="truncate text-xs font-semibold text-foreground">
                    {t("reviewWorkspace.compare.afterWithRound", { round: currentRoundNumber })}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {after.hasPdf ? (
                    <button
                      type="button"
                      className="rw-pdf-btn"
                      title={t("reviewWorkspace.downloadPdf")}
                      aria-label={`${t("reviewWorkspace.downloadPdf")} v${after.revisionNumber}`}
                      onClick={() => handleDownloadVersion(after)}
                    >
                      <Download size={13} aria-hidden="true" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rw-pdf-btn hidden lg:inline-flex"
                    title={
                      paneFocus === "after"
                        ? t("reviewWorkspace.compare.restoreSplit")
                        : t("reviewWorkspace.compare.expandPane")
                    }
                    aria-label={
                      paneFocus === "after"
                        ? t("reviewWorkspace.compare.restoreSplit")
                        : t("reviewWorkspace.compare.expandPane")
                    }
                    onClick={() => setPaneFocus(prev => (prev === "after" ? "split" : "after"))}
                  >
                    {paneFocus === "after" ? <Minimize2 size={13} aria-hidden="true" /> : <Maximize2 size={13} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <AssignedRevisionReader
                key={`compare-after-${after.id}`}
                compact
                submissionId={submissionId}
                revisionId={after.id}
                contentType={after.contentType}
                text={after.contentSnapshot ?? undefined}
                cachedBlob={assignedCachedBlob}
                onBlobLoaded={onAssignedBlobLoaded}
                initialPage={initialAssignedView?.page}
                initialFitMode={initialAssignedView?.fitMode}
                initialZoom={initialAssignedView?.customZoom}
                syncedZoom={syncZoomEnabled ? sharedZoom : null}
                onViewStateChange={handleAfterViewChange}
                ariaLabel={t("reviewWorkspace.compare.afterTitle", { version: after.revisionNumber })}
                onDownload={after.hasPdf ? () => handleDownloadVersion(after) : undefined}
              />
            </section>
          </div>
        </>
      )}
      </div>

      {hasPreviousFeedback ? (
        <PreviousFeedbackPanel
          assignmentId={assignmentId}
          open={feedbackPanelOpen}
          activeBeforeVersion={before}
          selectableBaselines={selectableBaselines}
          currentCriteria={currentCriteria}
          currentTemplateGuidelines={currentTemplateGuidelines}
          wide={feedbackPanelWide}
          onToggleWide={() => setFeedbackPanelWide(w => !w)}
          onClose={() => {
            setFeedbackPanelOpen(false);
            if (mobileSide === "feedback") setMobileSide("after");
          }}
          onSelectBaseline={onSelectBaseline}
          onJumpToReviewedPage={handleJumpToReviewedPage}
        />
      ) : null}
      </div>
    </section>
  );
}
