export type CorpusValidationRunState = "queued" | "running" | "completed" | "failed";
export type CorpusValidationOverallStatus = "in_progress" | "pass" | "warning" | "fail";
export type CorpusValidationDecision =
  | "pass_to_continue"
  | "continue_with_warning"
  | "pause_and_remediate"
  | "final_pass"
  | "final_warning"
  | "final_fail";
export type CorpusValidationCheckStatus = "pending" | "info" | "pass" | "warning" | "fail";

export interface CorpusValidationCheck {
  key: string;
  label: string;
  status: CorpusValidationCheckStatus;
  actual: number | string;
  target: string;
  detail: string;
}

export interface CorpusValidationCohortMetric {
  cohortId: string;
  reason: string;
  uniquePapers: number;
}

export interface CorpusValidationMetrics {
  campaign: {
    state: string;
    targetUniqueWorks: number;
    baselineTarget: number;
    priorityTarget: number;
    storedCommittedPages: number;
    ledgerCommittedPages: number;
    snapshotStartedCommittedPages: number;
    snapshotEndedCommittedPages: number;
    snapshotChangedDuringScan: boolean;
    acceptedWorks: number;
    uniqueWorks: number;
    rejectedWorks: number;
    conflictWorks: number;
  };
  papers: {
    campaignMemberships: number;
    canonicalPapers: number;
    orphanMemberships: number;
    activePapers: number;
    withAbstract: number;
    withFullTaxonomy: number;
    withSourceProvenance: number;
    withQualityCheck: number;
    qualityEligible: number;
    withOpenAlexIdentity: number;
    duplicateOpenAlexIdGroups: number;
    duplicateSourceRecordGroups: number;
  };
  sampling: {
    completedStrata: number;
    completedTargetWorks: number;
    completedDistinctMemberships: number;
    completedFillPct: number;
    totalVariationDistancePct: number;
  };
  cohorts: CorpusValidationCohortMetric[];
  deadLetters: Array<{ state: string; reasonCode: string; count: number }>;
}

export interface CorpusValidationRun {
  id: string;
  campaignId: string;
  state: CorpusValidationRunState;
  overallStatus?: CorpusValidationOverallStatus;
  decision?: CorpusValidationDecision;
  validatorVersion: string;
  snapshotCommittedPages: number;
  metrics?: CorpusValidationMetrics;
  checks: CorpusValidationCheck[];
  failureReason?: string;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
}
