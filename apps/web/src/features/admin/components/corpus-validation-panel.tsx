import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  FileCheck,
  HelpCircle,
  Info,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils";
import type {
  CorpusValidationCheck,
  CorpusValidationCheckStatus,
  CorpusValidationDecision,
  CorpusValidationMetrics,
  CorpusValidationRun,
} from "@trend/shared-types";
import {
  useCorpusValidationRun,
  useLatestCorpusValidation,
  useTriggerCorpusValidation,
} from "../hooks/use-admin-sync";

export interface CorpusValidationPanelProps {
  campaignId: string;
  campaignKey: string;
  workerStatus: "alive" | "stale" | "missing";
  onReviewPause?: () => void;
}

export const CORPUS_VALIDATION_DECISION_CONFIG: Record<
  CorpusValidationDecision,
  {
    label: string;
    severity: "success" | "warning" | "danger";
    guidance: string;
  }
> = {
  pass_to_continue: {
    label: "Safe to continue",
    severity: "success",
    guidance: "Active campaign checks are healthy. Ingest may proceed.",
  },
  continue_with_warning: {
    label: "Continue with warning",
    severity: "warning",
    guidance: "Review warning checks below; campaign ingest may continue.",
  },
  pause_and_remediate: {
    label: "Pause and remediate",
    severity: "danger",
    guidance: "Validation identified critical anomalies. Campaign pause is recommended.",
  },
  final_pass: {
    label: "Final validation passed",
    severity: "success",
    guidance: "Ready for embedding. The corpus snapshot meets baseline quality and taxonomy standards.",
  },
  final_warning: {
    label: "Completed with warnings",
    severity: "warning",
    guidance: "Corpus complete, but review warning checks before triggering embedding.",
  },
  final_fail: {
    label: "Final validation failed",
    severity: "danger",
    guidance: "Final validation failed. Embedding is not recommended until issues are remediated.",
  },
};

const CHECK_STATUS_CONFIG: Record<
  CorpusValidationCheckStatus,
  { label: string; badgeClass: string; icon: typeof CheckCircle2 }
> = {
  pass: {
    label: "Pass",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  warning: {
    label: "Warning",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400",
    icon: AlertTriangle,
  },
  fail: {
    label: "Fail",
    badgeClass: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400",
    icon: XCircle,
  },
  info: {
    label: "Info",
    badgeClass: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-400",
    icon: Info,
  },
  pending: {
    label: "Pending",
    badgeClass: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300",
    icon: HelpCircle,
  },
};

export function filterCorpusValidationChecks(
  checks: CorpusValidationCheck[],
  showOnlyIssues: boolean,
): CorpusValidationCheck[] {
  if (!showOnlyIssues) return checks;
  return checks.filter((check) => check.status === "warning" || check.status === "fail");
}

export function CorpusValidationPanel({
  campaignId,
  campaignKey,
  workerStatus,
  onReviewPause,
}: CorpusValidationPanelProps) {
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [confirmingForce, setConfirmingForce] = useState(false);
  const [showOnlyIssues, setShowOnlyIssues] = useState(false);
  const [expandedCheckKeys, setExpandedCheckKeys] = useState<Set<string>>(new Set());

  // Reset transient run state when active campaignId changes
  useEffect(() => {
    setActiveRunId(null);
    setConfirmingForce(false);
    setExpandedCheckKeys(new Set());
  }, [campaignId]);

  const latestQuery = useLatestCorpusValidation(campaignId);
  const runQuery = useCorpusValidationRun(activeRunId, campaignId);
  const triggerMutation = useTriggerCorpusValidation();

  // Handle active run ID synchronization from latest query if queued or running
  useEffect(() => {
    if (latestQuery.data && !activeRunId) {
      if (latestQuery.data.state === "queued" || latestQuery.data.state === "running") {
        setActiveRunId(latestQuery.data.id);
      }
    }
  }, [latestQuery.data, activeRunId]);

  const currentRun: CorpusValidationRun | null = activeRunId
    ? (runQuery.data ?? (latestQuery.data?.id === activeRunId ? latestQuery.data : null))
    : (latestQuery.data ?? null);

  const isTriggerPending = triggerMutation.isPending;
  const isScanActive = currentRun?.state === "queued" || currentRun?.state === "running";

  const handleTrigger = async (force = false) => {
    try {
      const result = await triggerMutation.mutateAsync({ campaignId, force });
      setActiveRunId(result.validationRunId);
      setConfirmingForce(false);
      if (result.reused) {
        toast.info("Reused existing validation for this committed-page snapshot.");
      } else {
        toast.success(`Corpus validation scan ${force ? "(forced) " : ""}queued.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to trigger corpus validation.";
      toast.error(message);
    }
  };

  const toggleCheckDetail = (key: string) => {
    setExpandedCheckKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredChecks = useMemo(() => {
    return filterCorpusValidationChecks(currentRun?.checks ?? [], showOnlyIssues);
  }, [currentRun?.checks, showOnlyIssues]);

  return (
    <div className="rounded-xl border border-[#EAEAEA] bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,0.01)] dark:border-[#26334A] dark:bg-[#111B27] space-y-5">
      {/* Panel Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-600 dark:text-indigo-400">
            <FileCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold tracking-tight">Corpus Validation</h3>
              <Badge variant="outline" className="font-mono text-xs">
                {campaignKey}
              </Badge>
              {currentRun && (
                <Badge variant="secondary" className="font-mono text-xs">
                  {formatNumber(currentRun.snapshotCommittedPages)} pages
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Internal consistency, taxonomy, quality, provenance, and sampling verification.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {currentRun?.state === "completed" && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={isTriggerPending || isScanActive}
                onClick={() => handleTrigger(false)}
              >
                <RefreshCw className={cn("mr-2 h-3.5 w-3.5", isTriggerPending && "animate-spin")} />
                Refresh validation
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={isTriggerPending || isScanActive}
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setConfirmingForce(true)}
              >
                Force new scan
              </Button>
            </>
          )}

          {currentRun?.state === "failed" && (
            <Button
              variant="outline"
              size="sm"
              disabled={isTriggerPending}
              onClick={() => handleTrigger(false)}
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Retry validation
            </Button>
          )}

        </div>
      </div>

      {/* Confirmation Step for Force Rerun */}
      {confirmingForce && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-semibold">Force new validation scan?</p>
            <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
              Force rerun bypasses committed-page snapshot caching and executes an un-cached full-corpus scan.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isTriggerPending}
              onClick={() => setConfirmingForce(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={isTriggerPending}
              onClick={() => handleTrigger(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isTriggerPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Confirm Force Rerun
            </Button>
          </div>
        </div>
      )}

      {/* UX State: Query Loading Initial */}
      {latestQuery.isLoading && !currentRun && (
        <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading validation status...
        </div>
      )}

      {/* UX State: Query Error */}
      {latestQuery.isError && !currentRun && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>Corpus validation could not be loaded. Verify admin access and backend status.</span>
          <Button variant="outline" size="sm" onClick={() => void latestQuery.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* UX State: No Validation Yet */}
      {!latestQuery.isLoading && !currentRun && !latestQuery.isError && (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground space-y-3">
          <FileCheck className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p>
            No corpus validation scan has been run for this campaign yet.
            Validation scans persisted campaign memberships, taxonomy coverage, quality eligibility, and sampling cohorts.
          </p>
          <Button
            size="sm"
            disabled={isTriggerPending}
            onClick={() => handleTrigger(false)}
          >
            {isTriggerPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-2 h-3.5 w-3.5" />}
            Run validation
          </Button>
        </div>
      )}

      {/* UX State: Queued */}
      {currentRun?.state === "queued" && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/40 dark:bg-blue-950/30 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-900 dark:text-blue-300">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            Corpus validation scan queued...
          </div>
          <p className="text-xs text-blue-700 dark:text-blue-400">
            The scan is queued for execution against the committed-page snapshot ({formatNumber(currentRun.snapshotCommittedPages)} pages).
            Corpus-validation worker must be active to process this job.
          </p>
          {workerStatus !== "alive" && (
            <div className="mt-2 flex items-center gap-2 rounded bg-amber-100 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              Corpus-validation worker is {workerStatus}. Start that worker before expecting this queued scan to run.
            </div>
          )}
        </div>
      )}

      {/* UX State: Running */}
      {currentRun?.state === "running" && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/40 dark:bg-blue-950/30 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-900 dark:text-blue-300">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              Validating campaign snapshot ({formatNumber(currentRun.snapshotCommittedPages)} pages)...
            </div>
            <span className="font-mono text-xs text-blue-700 dark:text-blue-400">
              Validator {currentRun.validatorVersion}
            </span>
          </div>
          <p className="text-xs text-blue-700 dark:text-blue-400">
            Ingest may continue while this scan runs. Snapshot stability will be checked upon completion.
          </p>
        </div>
      )}

      {/* UX State: Failed Worker Execution */}
      {currentRun?.state === "failed" && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 space-y-2"
        >
          <div className="flex items-center gap-2 font-semibold">
            <XCircle className="h-4 w-4 text-red-600" />
            Validation scan failed to complete
          </div>
          <p className="text-xs text-red-700 dark:text-red-300">
            {currentRun.failureReason ?? "The validation worker encountered an unexpected error during scan execution."}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Note: Execution failure indicates a worker runtime issue, not a corpus validation decision.
          </p>
        </div>
      )}

      {/* UX State: Completed Validation Results */}
      {currentRun?.state === "completed" && (
        <>
          {/* Decision Presentation Banner */}
          {currentRun.decision && (
            <DecisionCard
              decision={currentRun.decision}
              overallStatus={currentRun.overallStatus}
              completedAt={currentRun.completedAt}
              onReviewPause={onReviewPause}
            />
          )}

          {/* Checks Scannable List */}
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Validation Checks ({filteredChecks.length} / {currentRun.checks.length})
                </h4>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showOnlyIssues}
                  onChange={(e) => setShowOnlyIssues(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Show warnings and failures only
              </label>
            </div>

            {filteredChecks.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                {showOnlyIssues ? "No warning or failure checks found." : "No validation checks returned."}
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredChecks.map((check) => {
                  const statusInfo = CHECK_STATUS_CONFIG[check.status] ?? CHECK_STATUS_CONFIG.pending;
                  const StatusIcon = statusInfo.icon;
                  const isExpanded = expandedCheckKeys.has(check.key);

                  return (
                    <div
                      key={check.key}
                      className="rounded-lg border bg-background/50 p-3 transition-colors text-sm"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <StatusIcon
                            className={cn(
                              "h-4 w-4 shrink-0",
                              check.status === "pass" && "text-emerald-600 dark:text-emerald-400",
                              check.status === "warning" && "text-amber-600 dark:text-amber-400",
                              check.status === "fail" && "text-red-600 dark:text-red-400",
                              check.status === "info" && "text-blue-600 dark:text-blue-400"
                            )}
                          />
                          <span className="font-semibold text-xs sm:text-sm truncate">{check.label}</span>
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 rounded-full", statusInfo.badgeClass)}>
                            {statusInfo.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
                          <span className="text-muted-foreground">Actual: <strong className="text-foreground">{formatValue(check.actual)}</strong></span>
                          <span className="text-muted-foreground">Target: <strong className="text-foreground">{check.target}</strong></span>
                          {check.detail && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground"
                              onClick={() => toggleCheckDetail(check.key)}
                              aria-label={`Toggle detail for ${check.label}`}
                            >
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                        </div>
                      </div>
                      {isExpanded && check.detail && (
                        <div className="mt-2 rounded bg-muted/60 p-2 font-mono text-xs text-muted-foreground whitespace-pre-wrap">
                          {check.detail}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Metrics Sections */}
          {currentRun.metrics && (
            <MetricsSections metrics={currentRun.metrics} />
          )}
        </>
      )}
    </div>
  );
}

function DecisionCard({
  decision,
  overallStatus,
  completedAt,
  onReviewPause,
}: {
  decision: CorpusValidationDecision;
  overallStatus?: string;
  completedAt?: string;
  onReviewPause?: () => void;
}) {
  const config = CORPUS_VALIDATION_DECISION_CONFIG[decision] ?? {
    label: decision.replaceAll("_", " "),
    severity: "warning",
    guidance: "Validation scan completed.",
  };

  const isSuccess = config.severity === "success";
  const isWarning = config.severity === "warning";
  const isDanger = config.severity === "danger";

  return (
    <div
      className={cn(
        "rounded-xl border p-4 shadow-sm space-y-3",
        isSuccess && "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/30",
        isWarning && "border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/30",
        isDanger && "border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/30"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {isSuccess && <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />}
          {isWarning && <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />}
          {isDanger && <ShieldAlert className="h-6 w-6 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />}
          <div>
            <div className="flex items-center gap-2">
              <h4
                className={cn(
                  "text-base font-bold tracking-tight",
                  isSuccess && "text-emerald-950 dark:text-emerald-200",
                  isWarning && "text-amber-950 dark:text-amber-200",
                  isDanger && "text-red-950 dark:text-red-200"
                )}
              >
                {config.label}
              </h4>
              {overallStatus && (
                <Badge variant="outline" className="text-[10px] uppercase font-mono">
                  {overallStatus}
                </Badge>
              )}
            </div>
            <p
              className={cn(
                "mt-0.5 text-xs font-medium",
                isSuccess && "text-emerald-800 dark:text-emerald-300",
                isWarning && "text-amber-800 dark:text-amber-300",
                isDanger && "text-red-800 dark:text-red-300"
              )}
            >
              {config.guidance}
            </p>
          </div>
        </div>

        {decision === "pause_and_remediate" && onReviewPause && (
          <Button
            size="sm"
            variant="destructive"
            onClick={onReviewPause}
            className="shrink-0"
          >
            Review pause action
          </Button>
        )}
      </div>
      {completedAt && (
        <p className="text-[11px] text-muted-foreground text-right">
          Completed at {new Date(completedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function MetricsSections({ metrics }: { metrics: CorpusValidationMetrics }) {
  const canonical = metrics.papers.canonicalPapers ?? 0;

  return (
    <div className="space-y-4 border-t pt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Corpus Validation Metrics
      </h4>

      {/* Snapshot Stability Warning */}
      {metrics.campaign.snapshotChangedDuringScan && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          Ingest advanced while validation was scanning. Snapshot updated during run; metrics are advisory.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Section 1: Corpus Integrity */}
        <div className="rounded-lg border bg-background/40 p-3 space-y-2">
          <p className="text-xs font-bold tracking-tight text-foreground flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-blue-500" /> Corpus Integrity
          </p>
          <div className="space-y-1 text-xs">
            <MetricRow label="Campaign memberships" value={formatNumber(metrics.papers.campaignMemberships)} />
            <MetricRow label="Canonical papers" value={formatNumber(canonical)} />
            <MetricRow
              label="Orphan memberships"
              value={formatNumber(metrics.papers.orphanMemberships)}
              warning={metrics.papers.orphanMemberships > 0}
            />
            <MetricRow
              label="Duplicate OpenAlex IDs"
              value={formatNumber(metrics.papers.duplicateOpenAlexIdGroups)}
              warning={metrics.papers.duplicateOpenAlexIdGroups > 0}
            />
            <MetricRow
              label="Duplicate source records"
              value={formatNumber(metrics.papers.duplicateSourceRecordGroups)}
              warning={metrics.papers.duplicateSourceRecordGroups > 0}
            />
          </div>
        </div>

        {/* Section 2: Metadata Readiness */}
        <div className="rounded-lg border bg-background/40 p-3 space-y-2">
          <p className="text-xs font-bold tracking-tight text-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" /> Metadata Readiness
          </p>
          <div className="space-y-1 text-xs">
            <MetricRow label="Active papers" value={formatCorpusValidationCoverage(metrics.papers.activePapers, canonical)} />
            <MetricRow label="With abstract" value={formatCorpusValidationCoverage(metrics.papers.withAbstract, canonical)} />
            <MetricRow label="Full taxonomy" value={formatCorpusValidationCoverage(metrics.papers.withFullTaxonomy, canonical)} />
            <MetricRow label="Source provenance" value={formatCorpusValidationCoverage(metrics.papers.withSourceProvenance, canonical)} />
            <MetricRow label="Quality eligible" value={formatCorpusValidationCoverage(metrics.papers.qualityEligible, canonical)} />
            <MetricRow label="With quality check" value={formatCorpusValidationCoverage(metrics.papers.withQualityCheck, canonical)} />
            <MetricRow label="OpenAlex identity" value={formatCorpusValidationCoverage(metrics.papers.withOpenAlexIdentity, canonical)} />
          </div>
        </div>

        {/* Section 3: Campaign Ledger */}
        <div className="rounded-lg border bg-background/40 p-3 space-y-2">
          <p className="text-xs font-bold tracking-tight text-foreground flex items-center gap-1.5">
            <FileCheck className="h-3.5 w-3.5 text-emerald-500" /> Campaign Ledger
          </p>
          <div className="space-y-1 text-xs">
            <MetricRow label="Stored committed pages" value={formatNumber(metrics.campaign.storedCommittedPages)} />
            <MetricRow label="Ledger committed pages" value={formatNumber(metrics.campaign.ledgerCommittedPages)} />
            <MetricRow label="Accepted works" value={formatNumber(metrics.campaign.acceptedWorks)} />
            <MetricRow
              label="Rejected works"
              value={formatNumber(metrics.campaign.rejectedWorks)}
              warning={metrics.campaign.rejectedWorks > 0}
            />
            <MetricRow
              label="Conflict works"
              value={formatNumber(metrics.campaign.conflictWorks)}
              warning={metrics.campaign.conflictWorks > 0}
            />
            <MetricRow
              label="Snapshot pages range"
              value={`${formatNumber(metrics.campaign.snapshotStartedCommittedPages)} → ${formatNumber(metrics.campaign.snapshotEndedCommittedPages)}`}
            />
          </div>
        </div>
      </div>

      {/* Sampling & Cohorts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Sampling */}
        <div className="rounded-lg border bg-background/40 p-3 space-y-2">
          <p className="text-xs font-bold tracking-tight text-foreground">Sampling Strata</p>
          <div className="grid grid-cols-2 gap-2 font-mono text-xs">
            <div className="rounded bg-muted/50 p-2">
              <span className="text-[10px] text-muted-foreground uppercase block">Fill Percentage</span>
              <span className="text-sm font-bold text-foreground">
                {metrics.sampling.completedFillPct.toFixed(1)}%
              </span>
            </div>
            <div className="rounded bg-muted/50 p-2">
              <span className="text-[10px] text-muted-foreground uppercase block">Variation Distance</span>
              <span className="text-sm font-bold text-foreground">
                {metrics.sampling.totalVariationDistancePct.toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="space-y-1 text-xs pt-1">
            <MetricRow label="Completed strata" value={formatNumber(metrics.sampling.completedStrata)} />
            <MetricRow label="Target works completed" value={formatNumber(metrics.sampling.completedTargetWorks)} />
            <MetricRow label="Distinct memberships" value={formatNumber(metrics.sampling.completedDistinctMemberships)} />
          </div>
        </div>

        {/* Cohorts */}
        <div className="rounded-lg border bg-background/40 p-3 space-y-2">
          <p className="text-xs font-bold tracking-tight text-foreground">Baseline & Priority Cohorts</p>
          {metrics.cohorts.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No cohort breakdown recorded.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {metrics.cohorts.map((cohort) => (
                <div key={cohort.cohortId} className="flex items-center justify-between rounded bg-muted/40 p-2 font-mono">
                  <div>
                    <span className="font-semibold text-foreground">{cohort.cohortId}</span>
                    <p className="text-[10px] text-muted-foreground normal-case font-sans">
                      {cohort.cohortId === "analytics-baseline"
                        ? "Supports Trends analytics"
                        : cohort.cohortId === "retrieval-priority"
                          ? "Enriches Search/RAG/Reports"
                          : cohort.reason}
                    </p>
                  </div>
                  <span className="font-bold text-foreground">{formatNumber(cohort.uniquePapers)} papers</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dead Letters */}
      <div className="rounded-lg border bg-background/40 p-3 space-y-2">
        <p className="text-xs font-bold tracking-tight text-foreground">Dead Letter Ingestion Items</p>
        {metrics.deadLetters.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            No dead letters recorded for this campaign.
          </div>
        ) : (
          <div className="space-y-1.5 text-xs">
            {metrics.deadLetters.map((dl, idx) => (
              <div key={idx} className="flex items-center justify-between rounded bg-red-50 p-2 text-red-900 dark:bg-red-950/40 dark:text-red-200">
                <span className="font-mono">
                  State: <strong>{dl.state}</strong> | Reason: <strong>{dl.reasonCode}</strong>
                </span>
                <Badge variant="destructive" className="font-mono text-xs">
                  {formatNumber(dl.count)}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricRow({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono font-medium", warning && "text-amber-600 dark:text-amber-400 font-bold")}>
        {value}
      </span>
    </div>
  );
}

export function formatCorpusValidationCoverage(count: number, canonicalPapers: number): string {
  if (!canonicalPapers || canonicalPapers <= 0) return `${formatNumber(count)} (N/A)`;
  const pct = (count / canonicalPapers) * 100;
  return `${formatNumber(count)} / ${formatNumber(canonicalPapers)} (${pct.toFixed(1)}%)`;
}

function formatValue(val: number | string): string {
  if (typeof val === "number") return formatNumber(val);
  return String(val);
}
