import type { WorkspaceLink, WorkspacePage, WorkspacePerson } from "./project-workspace.js";

export const creditRoles = ["CONCEPTUALIZATION", "DATA_CURATION", "FORMAL_ANALYSIS", "FUNDING_ACQUISITION", "INVESTIGATION", "METHODOLOGY", "PROJECT_ADMINISTRATION", "RESOURCES", "SOFTWARE", "SUPERVISION", "VALIDATION", "VISUALIZATION", "WRITING_ORIGINAL_DRAFT", "WRITING_REVIEW_EDITING"] as const;
export type CreditRole = typeof creditRoles[number];
export type ContributionArtifactLink = WorkspaceLink | { kind: "TASK"; id: string };
export type ContributionStatus = "DRAFT" | "SUBMITTED" | "ACCEPTED" | "NEEDS_CHANGES" | "DISPUTED" | "SELF_RECORDED";
export interface ContributionInput {
  title: string; description: string; source: "MANUAL" | "WORKSPACE"; workDate: string;
  participants: { userId: string; roles: CreditRole[] }[]; evidence: string; evidenceRefs: ContributionArtifactLink[];
}
export interface WorkContribution extends Omit<ContributionInput, "participants"> {
  id: string; projectId: string; version: number; status: string; createdBy: WorkspacePerson;
  participants: { userId: string; name: string; roles: CreditRole[] }[];
  reviews: { userId: string; name: string; version: number; decision: string; note: string; createdAt: string }[];
  history: { id: string; action: string; version: number; actorId: string; note: string | null; snapshot: unknown; createdAt: string }[];
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
export interface AllocationRevisionView {
  id: string; revision: number; draftVersion: number; status: "DRAFT" | "AWAITING_APPROVAL" | "DISPUTED" | "FINALIZED" | "SUPERSEDED";
  period: AllocationPeriodView; rationale: string; roster: AllocationRosterPerson[]; shares: AllocationShareInput[];
  approvals: { userId: string; decision: "APPROVE" | "DISPUTE"; explanation: string; createdAt: string }[];
  evidenceSummary: { id: string; title: string; status: string; participants: string[] }[];
  submittedAt: string | null; finalizedAt: string | null; selfAcknowledged: boolean; canManage: boolean; canRespond: boolean;
  rosterChallenges: { userId: string; explanation: string; createdAt: string }[];
  canChallengeRoster: boolean;
}
export interface AllocationPeriodInput { title: string; description: string; scope: string; periodStart: string; periodEnd: string; clientKey: string }
export interface AllocationDraftInput { shares: AllocationShareInput[]; rationale: string; clientKey: string }
