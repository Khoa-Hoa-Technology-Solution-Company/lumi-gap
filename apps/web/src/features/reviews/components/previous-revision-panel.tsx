import { useState } from "react";
import type { FeedbackItemPriority } from "@trend/shared-types";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Columns2,
  FileSearch,
  History,
  Lightbulb,
  Loader2,
  MapPin,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import type { ReviewWorkspace } from "../api/reviews.api";
import {
  computePreviousRevisionStats,
  parseLocatorPage,
  scopeRevisionResponses,
  type ComparisonBaselineResolution,
} from "../revision-comparison";

const LONG_DESCRIPTION_THRESHOLD = 220;

interface PreviousRevisionPanelProps {
  assignedRevisionId?: string;
  assignedRevisionNumber: number;
  currentRoundNumber: number;
  previousReviews?: ReviewWorkspace["previousReviews"];
  previousRevisionItems: ReviewWorkspace["previousRevisionItems"];
  baseline: ComparisonBaselineResolution;
  completed: boolean;
  canVerify: boolean;
  verifyingItemIds: Record<string, boolean>;
  onVerifyItem: (itemId: string, status: "ACCEPTED" | "REOPENED") => Promise<void>;
  onOpenCompare: () => void;
  onJumpToPage?: (page: number) => void;
  onProceedToAssessment?: () => void;
}

function severityMeta(priority: FeedbackItemPriority, t: (key: string) => string) {
  if (priority === "MAJOR") {
    return { label: t("reviewWorkspace.feedbackFirst.severity.MAJOR"), Icon: AlertCircle, tone: "major" as const };
  }
  if (priority === "SUGGESTION") {
    return { label: t("reviewWorkspace.feedbackFirst.severity.SUGGESTION"), Icon: Lightbulb, tone: "suggestion" as const };
  }
  return { label: t("reviewWorkspace.feedbackFirst.severity.MINOR"), Icon: AlertTriangle, tone: "minor" as const };
}

function formatScoreValue(score: number, language: string): string {
  const fixed = score.toFixed(2);
  return language === "vi" ? fixed.replace(".", ",") : fixed;
}

export function PreviousRevisionPanel({
  assignedRevisionId,
  assignedRevisionNumber,
  currentRoundNumber,
  previousReviews = [],
  previousRevisionItems,
  baseline,
  completed,
  canVerify,
  verifyingItemIds,
  onVerifyItem,
  onOpenCompare,
  onJumpToPage,
  onProceedToAssessment,
}: PreviousRevisionPanelProps) {
  const { t, language } = useI18n();
  const stats = computePreviousRevisionStats(previousRevisionItems);

  const severityRank: Record<FeedbackItemPriority, number> = { MAJOR: 0, MINOR: 1, SUGGESTION: 2 };
  const statusRank: Record<string, number> = { ADDRESSED: 0, REOPENED: 1, OPEN: 2, ACCEPTED: 3 };

  const sortedItems = [...previousRevisionItems].sort((a, b) => {
    const sDiff = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
    if (sDiff !== 0) return sDiff;
    return severityRank[a.priority ?? "MINOR"] - severityRank[b.priority ?? "MINOR"];
  });

  const activeItems = sortedItems.filter(item => item.status !== "ACCEPTED");
  const acceptedItems = sortedItems.filter(item => item.status === "ACCEPTED");

  // Keep active items clean; if > 3 items, focus first pending item while allowing expanding any other
  const [expandedItemId, setExpandedItemId] = useState<string | null>(activeItems[0]?.id ?? null);
  const [expandedLongDescs, setExpandedLongDescs] = useState<Record<string, boolean>>({});
  const [showAcceptedHistory, setShowAcceptedHistory] = useState(activeItems.length === 0);

  const shouldUseFocusedAccordion = activeItems.length > 3;

  const renderItemCard = (item: ReviewWorkspace["previousRevisionItems"][number], index: number, compactDefault = false) => {
    const sev = severityMeta(item.priority ?? "MINOR", t);
    const SevIcon = sev.Icon;
    const isSuggestion = item.priority === "SUGGESTION";
    const isSaving = Boolean(verifyingItemIds[item.id]);
    const isLongDesc = item.description.length > LONG_DESCRIPTION_THRESHOLD;
    const descOpen = Boolean(expandedLongDescs[item.id]);
    const { current: currentResponse, historical: olderResponses } = scopeRevisionResponses(
      item.responses,
      assignedRevisionId,
    );
    const locatorPage = parseLocatorPage(item.locator);
    const isExpanded = !compactDefault && (!shouldUseFocusedAccordion || expandedItemId === item.id);
    const canAct = !completed && canVerify && ["ADDRESSED", "ACCEPTED", "REOPENED"].includes(item.status);
    const itemNum = String(index + 1).padStart(2, "0");

    const statusLabel =
      item.status === "OPEN"
        ? t("reviewWorkspace.revisionFirst.status.OPEN")
        : item.status === "ADDRESSED"
          ? t("reviewWorkspace.revisionFirst.status.ADDRESSED")
          : item.status === "ACCEPTED"
            ? t("reviewWorkspace.revisionFirst.status.ACCEPTED")
            : t("reviewWorkspace.revisionFirst.status.REOPENED");

    return (
      <article
        key={item.id}
        className="rw-prev-item-card"
        data-status={item.status}
        data-testid={`prev-revision-item-${item.id}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">
              {t("reviewWorkspace.revisionFirst.itemNumber", { num: itemNum })}
            </span>
            {item.roundNumber ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{t("reviewWorkspace.round", { round: item.roundNumber })}</span>
              </>
            ) : null}
            {item.revisionNumber ? (
              <>
                <span aria-hidden="true">·</span>
                <span>v{item.revisionNumber}</span>
              </>
            ) : null}
            <span className="rw-severity-pill" data-tone={sev.tone}>
              <SevIcon size={11} aria-hidden="true" />
              <span>{sev.label}</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="rw-item-status-pill" data-status={item.status}>
              {statusLabel}
            </span>
            {(shouldUseFocusedAccordion || compactDefault) ? (
              <button
                type="button"
                className="rw-text-action inline-flex items-center gap-0.5"
                aria-expanded={isExpanded}
                onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
              >
                {isExpanded ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
              </button>
            ) : null}
          </div>
        </div>

        {/* Original requirement — preserved verbatim, never rewritten */}
        <div className="space-y-1">
          <p className={`text-sm font-medium leading-snug text-foreground ${isLongDesc && !descOpen ? "line-clamp-3" : ""}`}>
            {item.description}
          </p>
          {isLongDesc ? (
            <button
              type="button"
              className="rw-text-action"
              onClick={() => setExpandedLongDescs(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
            >
              {descOpen ? t("reviewWorkspace.showLess") : t("reviewWorkspace.showMore")}
            </button>
          ) : null}
        </div>

        {/* Locator + Jump to page if parseable */}
        {item.locator ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/20 px-2.5 py-1.5 text-xs">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <MapPin size={12} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{item.locator}</span>
            </span>
            {locatorPage && onJumpToPage ? (
              <button
                type="button"
                className="rw-text-action shrink-0 inline-flex items-center gap-1"
                onClick={() => onJumpToPage(locatorPage)}
              >
                <FileSearch size={12} aria-hidden="true" />
                <span>{t("reviewWorkspace.revisionFirst.jumpToLocation", { page: locatorPage })}</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {isExpanded ? (
          <div className="space-y-2.5 pt-0.5">
            {/* Author response scoped STRICTLY to current assignedRevisionId */}
            <div className="rounded-lg border border-border/80 bg-muted/25 p-2.5 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">
                  {t("reviewWorkspace.revisionFirst.teamResponseForVersion", { version: assignedRevisionNumber })}
                </span>
                {isSuggestion ? (
                  <span className="text-[11px] text-muted-foreground">({t("reviewWorkspace.optional")})</span>
                ) : null}
              </div>
              {currentResponse ? (
                <p className="whitespace-pre-wrap leading-5 text-foreground/90">{currentResponse.responseText}</p>
              ) : (
                <p className="italic text-muted-foreground">
                  {t("reviewWorkspace.revisionFirst.noCurrentVersionResponse")}
                </p>
              )}
            </div>

            {/* Historical responses from earlier versions collapsed cleanly */}
            {olderResponses.length > 0 ? (
              <details className="rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs">
                <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                  {t("reviewWorkspace.revisionFirst.olderResponses", { count: olderResponses.length })}
                </summary>
                <ul className="mt-1.5 space-y-1.5 border-t border-border/60 pt-1.5">
                  {olderResponses.map(resp => (
                    <li key={resp.submissionRevisionId} className="text-muted-foreground whitespace-pre-wrap leading-5">
                      {resp.responseText}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {/* Verification Controls — isolated per item with double-click lock */}
            {canAct ? (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {t("reviewWorkspace.revisionFirst.verifyPrompt")}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={item.status === "ACCEPTED" ? "default" : "outline"}
                    className="h-7 gap-1 text-xs"
                    disabled={isSaving}
                    onClick={() => void onVerifyItem(item.id, "ACCEPTED")}
                  >
                    {isSaving ? (
                      <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 size={13} aria-hidden="true" />
                    )}
                    <span>{t("reviewWorkspace.revisionFirst.markAccepted")}</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={item.status === "REOPENED" ? "destructive" : "outline"}
                    className="h-7 gap-1 text-xs"
                    disabled={isSaving}
                    onClick={() => void onVerifyItem(item.id, "REOPENED")}
                  >
                    {isSaving ? (
                      <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <RotateCcw size={13} aria-hidden="true" />
                    )}
                    <span>{t("reviewWorkspace.revisionFirst.markReopened")}</span>
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <section className="rw-card p-4 space-y-4" data-testid="previous-revision-panel">
      {/* Revision-First Header with Honest Counts + Compact Compare Entry Point */}
      <header className="space-y-2.5 border-b border-border/80 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("reviewWorkspace.revisionFirst.headerTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("reviewWorkspace.revisionFirst.headerMeta", {
                version: assignedRevisionNumber,
                round: currentRoundNumber,
              })}
            </p>
          </div>

          {baseline.status === "available" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs font-medium"
              onClick={onOpenCompare}
              data-testid="open-compare-cta"
            >
              <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {t("reviewWorkspace.compare.ctaVersions", {
                  before: baseline.defaultBefore.revisionNumber,
                  after: baseline.after.revisionNumber,
                })}
              </span>
            </Button>
          ) : null}
        </div>

        {/* Missing Previous Version Honest Notice (Section 14 — never silently falls back) */}
        {baseline.status === "missing_previous" ? (
          <div className="rounded-lg border border-amber-300/70 bg-amber-500/8 px-3 py-2 text-xs text-amber-900 dark:text-amber-200" role="status">
            {t("reviewWorkspace.compare.missingPrevious")}
          </div>
        ) : null}

        {/* Real Progress Breakdown (distinguishes reviewed vs accepted — never 100% resolved if REOPENED > 0) */}
        {stats.totalMandatory > 0 ? (
          <div className="space-y-1.5 rounded-lg border border-border/80 bg-muted/20 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-foreground tabular-nums">
                {t("reviewWorkspace.revisionFirst.reviewedProgress", {
                  reviewed: stats.reviewedMandatory,
                  total: stats.totalMandatory,
                })}
              </span>
              {stats.allMandatoryResolved ? (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 size={13} aria-hidden="true" />
                  {t("reviewWorkspace.revisionFirst.allAccepted")}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground tabular-nums">
              <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                {t("reviewWorkspace.revisionFirst.countAccepted", { count: stats.acceptedMandatory })}
              </span>
              <span className={stats.reopenedMandatory > 0 ? "font-medium text-rose-700 dark:text-rose-300" : ""}>
                {t("reviewWorkspace.revisionFirst.countReopened", { count: stats.reopenedMandatory })}
              </span>
              <span className={stats.pendingReviewMandatory > 0 ? "font-medium text-primary" : ""}>
                {t("reviewWorkspace.revisionFirst.countPending", {
                  count: stats.pendingReviewMandatory + stats.awaitingAuthorMandatory,
                })}
              </span>
            </div>
          </div>
        ) : null}
      </header>

      {/* Active Items Needing Attention */}
      {activeItems.length > 0 ? (
        <div className="space-y-2.5">
          {activeItems.map((item, idx) => renderItemCard(item, idx, false))}
        </div>
      ) : null}

      {/* Already-Accepted Items Collapsed Cleanly (reopenable if regression detected) */}
      {acceptedItems.length > 0 ? (
        <div className="space-y-2">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-border/75 bg-muted/15 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={showAcceptedHistory}
            onClick={() => setShowAcceptedHistory(prev => !prev)}
          >
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>{t("reviewWorkspace.revisionFirst.acceptedHistory", { count: acceptedItems.length })}</span>
            </span>
            {showAcceptedHistory ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
          </button>
          {showAcceptedHistory ? (
            <div className="space-y-2">
              {acceptedItems.map((item, idx) => renderItemCard(item, activeItems.length + idx, false))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Collapsible Previous Round Overall Summary */}
      {previousReviews.length > 0 ? (
        <details className="rounded-lg border border-border/75 bg-muted/15 px-3 py-2.5 text-xs">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-foreground">
            <span className="inline-flex items-center gap-1.5">
              <History size={13} className="text-muted-foreground" aria-hidden="true" />
              <span>{t("reviewWorkspace.revisionFirst.previousSummaries", { count: previousReviews.length })}</span>
            </span>
            <ChevronDown size={13} className="text-muted-foreground" aria-hidden="true" />
          </summary>
          <div className="mt-2.5 space-y-2 border-t border-border/60 pt-2.5">
            {previousReviews.map(prev => (
              <div key={prev.id} className="rounded-md border bg-background p-2.5 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">
                    {t("reviewWorkspace.previousRound.summaryTitle", { round: prev.roundNumber })}
                    {prev.revisionNumber ? ` · v${prev.revisionNumber}` : ""}
                  </span>
                  {prev.weightedScore != null ? (
                    <Badge variant="secondary" className="h-5 text-[11px] tabular-nums">
                      {formatScoreValue(prev.weightedScore, language)} / 5
                    </Badge>
                  ) : null}
                </div>
                {prev.overallComment ? (
                  <p className="whitespace-pre-wrap leading-5 text-foreground/85">{prev.overallComment}</p>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {/* Smooth next-step CTA once all addressed items are reviewed */}
      {!completed && stats.pendingReviewMandatory === 0 && onProceedToAssessment ? (
        <div className="flex justify-end pt-1">
          <Button type="button" size="sm" variant="secondary" className="h-8 text-xs" onClick={onProceedToAssessment}>
            {t("reviewWorkspace.revisionFirst.proceedToReview")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
