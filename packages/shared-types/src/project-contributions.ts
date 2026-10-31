import type { WorkspaceLink, WorkspacePage, WorkspacePerson } from "./project-workspace.js";

export const creditRoles = ["CONCEPTUALIZATION", "DATA_CURATION", "FORMAL_ANALYSIS", "FUNDING_ACQUISITION", "INVESTIGATION", "METHODOLOGY", "PROJECT_ADMINISTRATION", "RESOURCES", "SOFTWARE", "SUPERVISION", "VALIDATION", "VISUALIZATION", "WRITING_ORIGINAL_DRAFT", "WRITING_REVIEW_EDITING"] as const;
export type CreditRole = typeof creditRoles[number];

export const contributionCategories = [
  "CONCEPTUALIZATION_METHODOLOGY",
  "LITERATURE_DATA",
  "EXECUTION_VALIDATION",
  "WRITING_REVISION",
] as const;
export type ContributionCategoryKey = typeof contributionCategories[number];

export const defaultContributionCategoryWeights: Record<ContributionCategoryKey, number> = {
  CONCEPTUALIZATION_METHODOLOGY: 2500,
  LITERATURE_DATA: 2000,
  EXECUTION_VALIDATION: 3500,
  WRITING_REVISION: 2000,
};

export function inferContributionCategoryFromRoles(roles: readonly CreditRole[]): ContributionCategoryKey {
  if (roles.some((r) => r === "CONCEPTUALIZATION" || r === "METHODOLOGY")) {
    return "CONCEPTUALIZATION_METHODOLOGY";
  }
  if (roles.some((r) => r === "DATA_CURATION" || r === "RESOURCES")) {
    return "LITERATURE_DATA";
  }
  if (roles.some((r) => r === "WRITING_ORIGINAL_DRAFT" || r === "WRITING_REVIEW_EDITING" || r === "VISUALIZATION")) {
    return "WRITING_REVISION";
  }
  return "EXECUTION_VALIDATION";
}

export type ContributionArtifactLink = WorkspaceLink | { kind: "TASK"; id: string };
export interface ResolvedContributionArtifactRef {
  kind: ContributionArtifactLink["kind"];
  id: string;
  available: boolean;
  label?: string | null;
}

export type ContributionStatus = "DRAFT" | "SUBMITTED" | "ACCEPTED" | "NEEDS_CHANGES" | "DISPUTED" | "SELF_RECORDED";
export interface ContributionInput {
  title: string; description: string; category?: ContributionCategoryKey; source: "MANUAL" | "WORKSPACE"; workDate: string;
  participants: { userId: string; roles: CreditRole[] }[]; evidence: string; evidenceRefs: ContributionArtifactLink[];
}
export interface WorkContribution extends Omit<ContributionInput, "participants" | "category"> {
  id: string; projectId: string; category: ContributionCategoryKey; version: number; status: string; createdBy: WorkspacePerson;
  participants: { userId: string; name: string; roles: CreditRole[] }[];
  reviews: { userId: string; name: string; version: number; decision: string; note: string; createdAt: string }[];
  history: { id: string; action: string; version: number; actorId: string; note: string | null; snapshot: unknown; createdAt: string }[];
  evidenceRefDetails?: ResolvedContributionArtifactRef[];
  createdAt: string; updatedAt: string;
  readOnly: boolean;
  viewerId: string;
  reviewActions: ("ACKNOWLEDGE" | "ACCEPT" | "NEEDS_CHANGES" | "DISPUTE")[];
  canManage: boolean;
}
export type ContributionPage = WorkspacePage<WorkContribution> & { currentActorId: string };
export type ActivityCategory = "PLAN" | "LITERATURE" | "SCREENING" | "EVIDENCE" | "GAP" | "TASK" | "DECISION" | "MANUSCRIPT";
export interface ContributionActivity {
  id: string; type: string; category: ActivityCategory; actor: WorkspacePerson; createdAt: string;
  artifactVersion: number | null; link: ContributionArtifactLink | null;
}
export interface ActivityResult {
  items: ContributionActivity[]; total: number; hasNext: boolean;
  days: { day: string; count: number }[]; members: WorkspacePerson[]; timeZone: string;
}
export interface AllocationRosterPerson extends WorkspacePerson { reasons: string[]; unavailable: boolean }
export interface AllocationPeriodView {
  id: string; title: string; description: string; scope: string; periodStart: string; periodEnd: string;
  policyVersion: string; roster: AllocationRosterPerson[]; historyIncomplete: boolean;
}
export interface AllocationShareInput { userId: string; basisPoints: number; rationale: string }

export interface ContributionMatrixShareInput {
  userId: string;
  basisPoints: number;
  rationale?: string;
}

export interface ContributionMatrixCategoryInput {
  category: ContributionCategoryKey;
  weightBasisPoints: number;
  zeroWeightReason?: string;
  evidenceIds?: string[];
  shares: ContributionMatrixShareInput[];
}

export interface ContributionMatrixMemberBreakdown {
  userId: string;
  basisPoints: number;
  percentage: string;
  exactPercentage: string;
  categoryShares: {
    category: ContributionCategoryKey;
    weightBasisPoints: number;
    shareBasisPoints: number;
    weightedBasisPoints: number;
    exactWeightedPercentage: string;
    rationale?: string;
  }[];
}

export interface ContributionMatrixView {
  formulaVersion: "CONTRIBUTION_MATRIX_V1";
  categories: {
    category: ContributionCategoryKey;
    weightBasisPoints: number;
    zeroWeightReason: string;
    evidenceIds: string[];
    shares: {
      userId: string;
      basisPoints: number;
      weightedBasisPoints: number;
      rationale: string;
    }[];
  }[];
  memberTotals: ContributionMatrixMemberBreakdown[];
}

export interface AllocationEvidenceSummaryItem {
  id: string;
  title: string;
  category?: ContributionCategoryKey;
  status: string;
  source?: "MANUAL" | "WORKSPACE";
  workDate?: string;
  evidence?: string;
  evidenceRefs?: ContributionArtifactLink[];
  evidenceRefDetails?: ResolvedContributionArtifactRef[];
  participants: string[];
}

export interface AllocationRevisionView {
  id: string; revision: number; draftVersion: number; status: "DRAFT" | "AWAITING_APPROVAL" | "DISPUTED" | "FINALIZED" | "SUPERSEDED";
  period: AllocationPeriodView; rationale: string; roster: AllocationRosterPerson[]; shares: AllocationShareInput[];
  matrix?: ContributionMatrixView | null;
  approvals: { userId: string; decision: "APPROVE" | "DISPUTE"; explanation: string; createdAt: string }[];
  evidenceSummary: AllocationEvidenceSummaryItem[];
  submittedAt: string | null; finalizedAt: string | null;
  finalizedBy?: WorkspacePerson | null;
  proposedBy?: WorkspacePerson | null;
  selfAcknowledged: boolean; canManage: boolean; canRespond: boolean;
  rosterChallenges: { userId: string; explanation: string; createdAt: string }[];
  canChallengeRoster: boolean;
  evaluationReference?: import("./contribution-evaluation.js").EvaluationAllocationReference | null;
}
export interface AllocationPeriodInput { title: string; description: string; scope: string; periodStart: string; periodEnd: string; clientKey: string }
export interface AllocationDraftInput {
  shares?: AllocationShareInput[];
  matrix?: { categories: ContributionMatrixCategoryInput[] } | null;
  rationale: string;
  clientKey: string;
  evaluationSnapshotId?: string | null;
}
