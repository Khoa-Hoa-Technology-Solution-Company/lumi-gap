import { useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  History,
  Lock,
  Maximize2,
  MessageSquareText,
  Minimize2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  User,
  X,
} from "lucide-react";
import type { ResearchVersion } from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import type { PreviousReviewRound, ReviewWorkspace } from "../api/reviews.api";
import { usePreviousReviewFeedback } from "../hooks/use-reviews";
import { parseLocatorPage } from "../revision-comparison";
import { internalAssessmentLabel } from "../scientific-review-model";
import { isLumiGapSystemRubric, localizeSystemCriterion } from "../system-rubric-i18n";

export interface PreviousFeedbackPanelProps {
  assignmentId: string;
  open: boolean;
  activeBeforeVersion: ResearchVersion;
  selectableBaselines: ResearchVersion[];
  currentCriteria?: ReviewWorkspace["criteria"];
  currentTemplateGuidelines?: string[];
  wide: boolean;
  onToggleWide: () => void;
  onClose: () => void;
  onSelectBaseline: (revisionId: string) => void;
  onJumpToReviewedPage: (revisionId: string, page: number) => void;
}

const PRIORITY_BADGE_CLASSES: Record<string, string> = {
  MAJOR: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  MINOR: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  SUGGESTION: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

const ASSESSMENT_LABELS_VI: Record<string, string> = {
  STRONG: "Tốt",
  ADEQUATE: "Đạt yêu cầu",
  ACCEPTABLE: "Đạt yêu cầu",
  NEEDS_IMPROVEMENT: "Cần cải thiện",
  MAJOR_ISSUES: "Có vấn đề lớn",
  WEAK: "Chưa đạt",
  NOT_APPLICABLE: "Không áp dụng",
};

const ASSESSMENT_LABELS_EN: Record<string, string> = {
  STRONG: "Strong",
  ADEQUATE: "Adequate",
  ACCEPTABLE: "Acceptable",
  NEEDS_IMPROVEMENT: "Needs improvement",
  MAJOR_ISSUES: "Major issues",
  WEAK: "Weak",
  NOT_APPLICABLE: "Not applicable",
};

function priorityLabel(priority: string | undefined, language: string): string {
  if (priority === "MAJOR") return language === "vi" ? "Chỉnh sửa lớn" : "Major";
  if (priority === "SUGGESTION") return language === "vi" ? "Gợi ý" : "Suggestion";
  return language === "vi" ? "Chỉnh sửa nhỏ" : "Minor";
}

function getHttpStatus(error: unknown): number | undefined {
  if (isAxiosError(error)) return error.response?.status;
  if (error && typeof error === "object" && "response" in error) {
    const res = (error as { response?: { status?: number } }).response;
    return res?.status;
  }
  if (error && typeof error === "object" && "status" in error) {
    return (error as { status?: number }).status;
  }
  return undefined;
}

export function PreviousFeedbackPanel({
  assignmentId,
  open,
  activeBeforeVersion,
  selectableBaselines,
  currentCriteria,
  currentTemplateGuidelines,
  wide,
  onToggleWide,
  onClose,
  onSelectBaseline,
  onJumpToReviewedPage,
}: PreviousFeedbackPanelProps) {
  const { t, language } = useI18n();
  const query = usePreviousReviewFeedback(assignmentId, open);
  const [selectedRoundId, setSelectedRoundId] = useState<string>("");

  // Reset selected round strictly on assignment switch so stale rounds never bleed across assignments
  useEffect(() => {
    setSelectedRoundId("");
  }, [assignmentId]);

  // Only consume payload matching the current assignmentId
  const rounds = useMemo<PreviousReviewRound[]>(() => {
    if (!query.data || query.data.assignmentId !== assignmentId) return [];
    return [...query.data.rounds].sort((a, b) => b.roundNumber - a.roundNumber);
  }, [query.data, assignmentId]);

  const activeRound = useMemo<PreviousReviewRound | undefined>(() => {
    if (!rounds.length) return undefined;
    if (selectedRoundId) {
      const matched = rounds.find(r => r.id === selectedRoundId);
      if (matched) return matched;
    }
    // Default to the most recent valid submitted round before current round
    return rounds[0];
  }, [rounds, selectedRoundId]);

  if (!open) return null;

  const errorStatus = query.isError ? getHttpStatus(query.error) : undefined;
  const isUnauthorized = errorStatus === 401 || errorStatus === 403;
  const canSwitchLeftBaseline = Boolean(
    activeRound &&
      activeRound.revisionId !== activeBeforeVersion.id &&
      selectableBaselines.some(v => v.id === activeRound.revisionId),
  );
  const activeVersionNumber = activeRound?.revisionNumber ?? activeBeforeVersion.revisionNumber;
  const canNavigateToReviewedPdf = Boolean(
    activeRound &&
      (activeRound.revisionId === activeBeforeVersion.id ||
        selectableBaselines.some(v => v.id === activeRound.revisionId)) &&
      (activeBeforeVersion.contentType === "PDF" ||
        selectableBaselines.find(v => v.id === activeRound.revisionId)?.contentType === "PDF"),
  );

  const resolveCriterionTitle = (
    round: PreviousReviewRound,
    resp: NonNullable<PreviousReviewRound["responses"]>[number],
  ): string => {
    const cleanKey = resp.criterionKey.replace(/^rubric:/, "");
    const matchedCurrent = currentCriteria?.find(c => c.key === cleanKey || c.key === resp.criterionKey);
    const guidelines = round.guidelines ?? currentTemplateGuidelines;
    if (matchedCurrent) {
      const isSys = isLumiGapSystemRubric(guidelines);
      return localizeSystemCriterion(matchedCurrent, language, isSys, {
        versionNumber: round.templateVersionNumber,
        guidelines,
      }).title;
    }
    return resp.criterionTitle || cleanKey.replaceAll("_", " ");
  };

  const hasOverallSection = Boolean(
    activeRound?.overallComment?.trim() ||
      activeRound?.keyStrengths?.trim() ||
      activeRound?.keyConcerns?.trim(),
  );
  const rubricResponses = activeRound?.responses ?? [];
  const revisionItems = activeRound?.revisionItems ?? [];
  const hasScore =
    activeRound?.weightedScore != null &&
    (activeRound.reviewMode === "RUBRIC_ASSESSMENT" || rubricResponses.some(r => r.score != null));

  return (
    <aside
      className="rw-feedback-panel"
      data-wide={wide ? "true" : undefined}
      aria-label={t("reviewWorkspace.compare.previousFeedback.title")}
      data-testid="compare-previous-feedback-panel"
    >
      {/* Panel Header */}
      <header className="rw-feedback-panel-head">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <History className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-foreground truncate">
              {t("reviewWorkspace.compare.previousFeedback.title")}
            </h3>
            <Badge
              variant="outline"
              className="h-4.5 gap-1 border-slate-300/80 bg-slate-100/80 px-1.5 text-[10px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
            >
              <Lock className="h-2.5 w-2.5" aria-hidden="true" />
              {t("reviewWorkspace.compare.previousFeedback.readOnly")}
            </Badge>
          </div>
          {activeRound ? (
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {t("reviewWorkspace.compare.previousFeedback.roundVersionMeta", {
                round: activeRound.roundNumber,
                version: activeRound.revisionNumber ?? "—",
              })}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="rw-pdf-btn hidden xl:inline-flex"
            title={
              wide
                ? t("reviewWorkspace.compare.previousFeedback.standardWidth")
                : t("reviewWorkspace.compare.previousFeedback.expandWidth")
            }
            aria-label={
              wide
                ? t("reviewWorkspace.compare.previousFeedback.standardWidth")
                : t("reviewWorkspace.compare.previousFeedback.expandWidth")
            }
            onClick={onToggleWide}
          >
            {wide ? <Minimize2 size={13} aria-hidden="true" /> : <Maximize2 size={13} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="rw-pdf-btn"
            title={t("reviewWorkspace.compare.previousFeedback.close")}
            aria-label={t("reviewWorkspace.compare.previousFeedback.close")}
            data-testid="close-previous-feedback-panel"
            onClick={onClose}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Multi-Round Selector (shown when reviewer has 2+ prior submitted rounds) */}
      {rounds.length > 1 && activeRound ? (
        <div className="rw-feedback-panel-roundbar">
          <label className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
            <span className="shrink-0">{t("reviewWorkspace.compare.previousFeedback.roundSelector")}</span>
            <select
              aria-label={t("reviewWorkspace.compare.previousFeedback.roundSelector")}
              data-testid="previous-feedback-round-select"
              value={activeRound.id}
              onChange={event => setSelectedRoundId(event.target.value)}
              className="h-7 max-w-[210px] rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {rounds.map(round => (
                <option key={round.id} value={round.id}>
                  {t("reviewWorkspace.compare.previousFeedback.roundOption", {
                    round: round.roundNumber,
                    version: round.revisionNumber ?? "—",
                  })}
                  {round.submittedAt ? ` (${new Date(round.submittedAt).toLocaleDateString(language)})` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {/* Version Mismatch Helper Banner (when selected feedback round belongs to a different baseline PDF than left pane) */}
      {activeRound && activeRound.revisionId !== activeBeforeVersion.id ? (
        <div className="rw-feedback-mismatch-bar" role="status">
          <p className="text-[11px] leading-4 text-amber-900 dark:text-amber-200">
            {t("reviewWorkspace.compare.previousFeedback.mismatchNote", {
              active: activeBeforeVersion.revisionNumber,
              target: activeRound.revisionNumber ?? "—",
            })}
          </p>
          {canSwitchLeftBaseline ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px] shrink-0"
              onClick={() => onSelectBaseline(activeRound.revisionId)}
            >
              {t("reviewWorkspace.compare.previousFeedback.switchBaseline", {
                version: activeRound.revisionNumber ?? "—",
              })}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Scrollable Body */}
      <div className="rw-feedback-panel-scroll">
        {query.isLoading ? (
          <div className="space-y-3 p-3.5" role="status" aria-label={t("reviewWorkspace.compare.previousFeedback.loading")}>
            <p className="text-xs text-muted-foreground">{t("reviewWorkspace.compare.previousFeedback.loading")}</p>
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : query.isError ? (
          <div className="p-4" role="alert">
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3 text-xs">
              <div className="flex items-start gap-2 text-destructive">
                {isUnauthorized ? (
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <p className="leading-5 font-medium">
                  {isUnauthorized
                    ? t("reviewWorkspace.compare.previousFeedback.unauthorized")
                    : t("reviewWorkspace.compare.previousFeedback.error")}
                </p>
              </div>
              {!isUnauthorized ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs"
                  disabled={query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  <RefreshCw className={`h-3 w-3 ${query.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
                  <span>{t("reviewWorkspace.compare.previousFeedback.retry")}</span>
                </Button>
              ) : null}
            </div>
          </div>
        ) : !activeRound ? (
          <div className="p-6 text-center space-y-2" role="status">
            <MessageSquareText className="mx-auto h-6 w-6 text-muted-foreground/70" aria-hidden="true" />
            <p className="text-xs leading-5 text-muted-foreground">
              {t("reviewWorkspace.compare.previousFeedback.empty")}
            </p>
          </div>
        ) : (
          <div className="space-y-3.5 p-3.5">
            {/* A. Review Summary */}
            <section className="rw-feedback-section" aria-label={t("reviewWorkspace.compare.previousFeedback.summaryTitle")}>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/70">
                <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <ClipboardList className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  <span>{t("reviewWorkspace.compare.previousFeedback.summaryTitle")}</span>
                </h4>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10.5px] font-semibold tabular-nums">
                  {t("reviewWorkspace.compare.previousFeedback.roundOption", {
                    round: activeRound.roundNumber,
                    version: activeRound.revisionNumber ?? "—",
                  })}
                </Badge>
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 pt-2 text-xs">
                {activeRound.reviewerName ? (
                  <div className="min-w-0">
                    <dt className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                      <User className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {t("reviewWorkspace.compare.previousFeedback.reviewer")}
                    </dt>
                    <dd className="mt-0.5 truncate font-medium text-foreground">{activeRound.reviewerName}</dd>
                  </div>
                ) : null}
                {activeRound.submittedAt ? (
                  <div className="min-w-0">
                    <dt className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                      <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {t("reviewWorkspace.compare.previousFeedback.submittedAt")}
                    </dt>
                    <dd className="mt-0.5 font-medium text-foreground tabular-nums">
                      {new Date(activeRound.submittedAt).toLocaleString(language, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </dd>
                  </div>
                ) : null}
                <div className="min-w-0 col-span-2 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50">
                  <div>
                    <dt className="text-[10.5px] text-muted-foreground">
                      {t("reviewWorkspace.compare.previousFeedback.conclusion")}
                    </dt>
                    <dd className="mt-0.5 font-semibold text-foreground">
                      {t(
                        internalAssessmentLabel(
                          activeRound.overallAssessment,
                          "SUBMITTED",
                          activeRound.recommendation,
                        ),
                      )}
                    </dd>
                  </div>
                  {hasScore ? (
                    <div className="text-right">
                      <dt className="text-[10.5px] text-muted-foreground">
                        {t("reviewWorkspace.compare.previousFeedback.weightedScore")}
                      </dt>
                      <dd className="mt-0.5 font-semibold text-primary tabular-nums">
                        {activeRound.weightedScore!.toFixed(2)} / 5
                      </dd>
                    </div>
                  ) : null}
                </div>
              </dl>
            </section>

            {/* B. Overall Feedback */}
            {hasOverallSection ? (
              <section className="rw-feedback-section space-y-2.5" aria-label={t("reviewWorkspace.compare.previousFeedback.overallTitle")}>
                <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <MessageSquareText className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  <span>{t("reviewWorkspace.compare.previousFeedback.overallTitle")}</span>
                </h4>

                {activeRound.overallComment?.trim() ? (
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      {t("reviewWorkspace.compare.previousFeedback.overallComment")}
                    </p>
                    <p className="whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
                      {activeRound.overallComment}
                    </p>
                  </div>
                ) : null}

                {activeRound.keyStrengths?.trim() ? (
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-2.5 space-y-1">
                    <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                      <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {t("reviewWorkspace.compare.previousFeedback.strengths")}
                    </p>
                    <p className="whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
                      {activeRound.keyStrengths}
                    </p>
                  </div>
                ) : null}

                {activeRound.keyConcerns?.trim() ? (
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-2.5 space-y-1">
                    <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                      {t("reviewWorkspace.compare.previousFeedback.concerns")}
                    </p>
                    <p className="whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
                      {activeRound.keyConcerns}
                    </p>
                  </div>
                ) : null}
              </section>
            ) : null}

            {/* C. Rubric Evaluation (only when criterion responses exist) */}
            {rubricResponses.length > 0 ? (
              <section className="rw-feedback-section space-y-2" aria-label={t("reviewWorkspace.compare.previousFeedback.rubricTitle")}>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <BookOpen className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    <span>{t("reviewWorkspace.compare.previousFeedback.rubricTitle")}</span>
                  </h4>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {rubricResponses.length}
                  </span>
                </div>

                <div className="divide-y divide-border/70 rounded-lg border border-border/75 bg-background">
                  {rubricResponses.map(resp => {
                    const title = resolveCriterionTitle(activeRound, resp);
                    const evidencePage = parseLocatorPage(resp.evidence);
                    const assessMap = language === "vi" ? ASSESSMENT_LABELS_VI : ASSESSMENT_LABELS_EN;
                    return (
                      <div key={resp.criterionKey} className="rw-feedback-rubric-row">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold leading-4 text-foreground break-words">{title}</span>
                          <div className="flex shrink-0 items-center gap-1">
                            {resp.notApplicable ? (
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                                {t("reviewWorkspace.compare.previousFeedback.notApplicable")}
                              </Badge>
                            ) : resp.score != null ? (
                              <Badge variant="secondary" className="h-5 px-1.5 text-[10.5px] font-semibold tabular-nums">
                                {resp.score}
                                {resp.maxScore != null ? ` / ${resp.maxScore}` : ""}
                              </Badge>
                            ) : resp.assessment ? (
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                                {assessMap[resp.assessment] ?? resp.assessment.replaceAll("_", " ")}
                              </Badge>
                            ) : null}
                          </div>
                        </div>

                        {resp.comment?.trim() ? (
                          <p className="whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                            {resp.comment}
                          </p>
                        ) : null}

                        {resp.evidence?.trim() ? (
                          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
                            <span className="text-[11px] text-muted-foreground break-words">
                              <strong className="font-medium text-foreground/80">
                                {t("reviewWorkspace.compare.previousFeedback.evidence")}:{" "}
                              </strong>
                              {resp.evidence}
                            </span>
                            {evidencePage && canNavigateToReviewedPdf ? (
                              <button
                                type="button"
                                className="rw-feedback-page-btn"
                                onClick={() => onJumpToReviewedPage(activeRound.revisionId, evidencePage)}
                              >
                                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                <span>
                                  {t("reviewWorkspace.compare.previousFeedback.jumpToPage", {
                                    page: evidencePage,
                                    version: activeVersionNumber,
                                  })}
                                </span>
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* D & E. Revision Requests / Document Comments + Author Responses */}
            {revisionItems.length > 0 ? (
              <section className="rw-feedback-section space-y-2" aria-label={t("reviewWorkspace.compare.previousFeedback.itemsTitle")}>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    <span>{t("reviewWorkspace.compare.previousFeedback.itemsTitle")}</span>
                  </h4>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {revisionItems.length}
                  </span>
                </div>

                <ul className="space-y-2">
                  {revisionItems.map(item => {
                    const pageNum = parseLocatorPage(item.locator);
                    const prioClass = PRIORITY_BADGE_CLASSES[item.priority ?? "MINOR"] ?? PRIORITY_BADGE_CLASSES.MINOR;
                    const authorResponses = (item.responses ?? []).filter(r => r.status !== "DRAFT" && r.responseText.trim());
                    return (
                      <li key={item.id} className="rw-feedback-item-card">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <Badge variant="outline" className={`h-5 px-1.5 text-[10px] font-semibold ${prioClass}`}>
                            {priorityLabel(item.priority, language)}
                          </Badge>
                          {pageNum && canNavigateToReviewedPdf ? (
                            <button
                              type="button"
                              className="rw-feedback-page-btn"
                              data-testid={`feedback-jump-page-${pageNum}`}
                              onClick={() => onJumpToReviewedPage(activeRound.revisionId, pageNum)}
                            >
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                              <span>
                                {t("reviewWorkspace.compare.previousFeedback.jumpToPage", {
                                  page: pageNum,
                                  version: activeVersionNumber,
                                })}
                              </span>
                            </button>
                          ) : null}
                        </div>

                        <p className="whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
                          {item.description}
                        </p>

                        {item.locator?.trim() ? (
                          <p className="text-[11px] text-muted-foreground break-words">
                            <span className="font-medium text-foreground/80">
                              {t("reviewWorkspace.compare.previousFeedback.location")}:{" "}
                            </span>
                            {item.locator}
                          </p>
                        ) : null}

                        {item.quotation?.trim() ? (
                          <blockquote className="border-l-2 border-border pl-2.5 text-[11px] italic text-muted-foreground break-words">
                            {item.quotation}
                          </blockquote>
                        ) : null}

                        {item.createdAt ? (
                          <time className="block text-[10.5px] text-muted-foreground/80 tabular-nums" dateTime={item.createdAt}>
                            {new Date(item.createdAt).toLocaleString(language, {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </time>
                        ) : null}

                        {/* E. Author Response (only real submitted responses) */}
                        {authorResponses.length > 0 ? (
                          <div className="mt-1 space-y-1.5 rounded-lg border border-border/70 bg-muted/30 p-2.5">
                            {authorResponses.map(resp => (
                              <div key={resp.submissionRevisionId} className="space-y-0.5">
                                <p className="text-[10.5px] font-semibold text-foreground/85">
                                  {resp.submissionRevisionNumber != null
                                    ? t("reviewWorkspace.compare.previousFeedback.authorResponseVersion", {
                                        version: resp.submissionRevisionNumber,
                                      })
                                    : t("reviewWorkspace.compare.previousFeedback.authorResponse")}
                                </p>
                                <p className="whitespace-pre-wrap break-words text-xs leading-5 text-foreground/90">
                                  {resp.responseText}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}
