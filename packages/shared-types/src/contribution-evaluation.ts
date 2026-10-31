import type { AllocationRosterPerson } from "./project-contributions.js";
import type { ManuscriptWritingReference } from "./manuscript-writing.js";

export interface ContributionEvaluationRule {
  id: string; version: number; title: string; rationale: string;
  defaultWeight: number; maxWeight: number; createdAt: string;
}
export interface EvaluationParticipation { userId: string; basisPoints: number }
export interface EvaluationSource {
  id: string; version: number; title: string; description: string; workDate: string;
  status: string; evidence: string; evidenceRefs: unknown; participants: string[];
}
export interface EvaluationPayload {
  ruleId: string; outcomeKey: string; weight: number; rationale: string;
  retrospectiveWeight: boolean; sources: EvaluationSource[]; participation: EvaluationParticipation[];
  writingReference?: ManuscriptWritingReference;
}
export type EvaluationDecisionKind = "PARTICIPANT" | "WEIGHT" | "CHALLENGE" | "RESOLUTION";
export interface EvaluationObjection { userId: string; evaluationId: string; version: number; note: string }
export interface EvaluationDecision {
  userId: string; kind: EvaluationDecisionKind; decision: "APPROVE" | "DISPUTE";
  note: string; payloadHash: string; createdAt: string;
}
export interface OutcomeEvaluation {
  id: string; version: number; payloadHash: string; payload: EvaluationPayload;
  createdAt: string; createdById: string; decisions: EvaluationDecision[];
  canApprove: boolean; canApproveWeight: boolean; canChallenge: boolean;
  supersededById?: string | null;
  unresolvedObjections?: EvaluationObjection[];
  canResolveObjection?: boolean;
  approvalBlockedReason?: "SOURCE_CHANGED" | "RULE_CHANGED" | null;
}
export type EvaluationEligibility = "ELIGIBLE" | "PENDING" | "DISPUTED" | "EXCLUDED";
export type EvaluationExclusionReason = "AWAITING_PROPOSAL" | "SOURCE_CHANGED" | "SOURCE_OUTSIDE_PERIOD" | "RULE_CHANGED" | "SOURCE_NOT_CONFIRMED" | "MISSING_EVIDENCE" | "PARTICIPATION_MISMATCH" | "MEMBERSHIP_MISMATCH" | "AWAITING_WEIGHT" | "AWAITING_PARTICIPANTS" | "DISPUTED";
export interface ContributionEvaluationRow {
  outcomeId: string | null; outcomeKey: string | null; title: string;
  sources: EvaluationSource[]; evaluation: OutcomeEvaluation | null;
  eligibility: EvaluationEligibility; reasons: EvaluationExclusionReason[];
  verificationMode: "INDEPENDENTLY_ACCEPTED" | "TEAM_CONFIRMED" | "SOLO_SELF_CONFIRMED" | null;
}
export interface EvaluationCoverage {
  total: number; eligible: number; pending: number; disputed: number; excluded: number;
}
export interface EvaluationMemberScore {
  userId: string; rawScore: string; basisPoints: number | null;
  components: { outcomeKey: string; weight: number; participationBasisPoints: number; rawScore: string }[];
}
export interface EvaluationCalculation {
  algorithmVersion: "WEIGHTED_CONFIRMED_V1"; status: "PROVISIONAL" | "INSUFFICIENT_DATA";
  totalRawScore: string; scores: EvaluationMemberScore[];
}
export interface ContributionEvaluationSnapshot {
  id: string; projectId: string; rule: ContributionEvaluationRule; periodId: string; inputHash: string;
  period: { id: string; scope: string; periodStart: string; periodEnd: string };
  rounding: "LARGEST_REMAINDER_UUID_ASC_V1";
  inputVersion: string; calculatedAt: string; calculatedBy: string;
  roster: AllocationRosterPerson[]; coverage: EvaluationCoverage;
  calculation: EvaluationCalculation; outcomes: ContributionEvaluationRow[]; isStale: boolean;
}
export interface ContributionEvaluationBoard {
  rule: ContributionEvaluationRule | null; rules: ContributionEvaluationRule[];
  items: ContributionEvaluationRow[]; roster: AllocationRosterPerson[];
  total: number; page: number; pageSize: number; hasNext: boolean;
  coverage: EvaluationCoverage; currentActorId: string;
}
export interface EvaluationProposalInput {
  clientKey: string; ruleId: string; outcomeKey: string; expectedVersion: number;
  contributionIds: string[]; weight: number; rationale: string;
  retrospectiveWeight: boolean; participation: EvaluationParticipation[];
  writingReportId?: string;
}
export interface ContributionEvaluationRun {
  id: string; status: "QUEUED" | "COMPLETED" | "FAILED";
  snapshotId: string | null; createdAt: string;
}
export interface EvaluationAllocationReference {
  snapshotId: string; ruleVersion: number; calculatedAt: string; inputHash: string;
  differences: { userId: string; suggestedBasisPoints: number; proposedBasisPoints: number; deltaBasisPoints: number; rationale: string }[];
}
