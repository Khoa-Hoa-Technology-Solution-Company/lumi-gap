import type { ActivityCategory, CreditRole } from "@trend/shared-types";

// Administrative actions, invitation acceptance, views and autosaves are deliberately absent.
export const meaningfulActivity: Record<ActivityCategory, string[]> = {
  PLAN: ["PLAN_UPDATED", "PLAN_SNAPSHOT_CREATED"],
  LITERATURE: ["PAPER_ADDED", "PAPER_IMPORTED", "PRIVATE_SOURCE_UPLOADED", "SYNTHESIS_WRITTEN", "SYNTHESIS_REVIEWED"],
  SCREENING: ["SCREENING_PARTICIPATION", "PAPER_SCREENED", "SCREENING_DECIDED", "SCREENING_RESOLVED", "SCREENING_VOTE_RECORDED", "SCREENING_CONFLICT_RESOLVED"],
  EVIDENCE: ["EVIDENCE_EXTRACTED", "EVIDENCE_REVISED", "EVIDENCE_REVIEWED"],
  GAP: ["GAP_CREATED", "GAP_REVISED", "GAP_EVIDENCE_CHANGED", "EVIDENCE_ADDED", "EVIDENCE_LINKED", "GAP_ASSESSED", "QUESTION_DERIVED"],
  TASK: ["TASK_CREATED", "TASK_COMPLETED", "TASK_ARTIFACT_LINKED"],
  DECISION: ["DECISION_RECORDED", "DECISION_REVISED"],
  MANUSCRIPT: ["MANUSCRIPT_REVISION_SAVED", "MANUSCRIPT_CREATED", "MANUSCRIPT_WRITING_SESSION", "MANUSCRIPT_SNAPSHOT_CREATED", "MANUSCRIPT_FEEDBACK_PROVIDED", "MANUSCRIPT_VERSION_SUBMITTED", "MENTOR_REVIEW_SUBMITTED", "MENTOR_FEEDBACK_RECORDED"],
};
export const activityCategory = (type: string): ActivityCategory => (Object.keys(meaningfulActivity) as ActivityCategory[]).find(key => meaningfulActivity[key].includes(type)) ?? "DECISION";

/** Suggestions are evidence pointers, never assigned/confirmed roles or quality assessments. */
export function suggestedCreditRoles(type: string): CreditRole[] {
  if (type === "MENTOR_REVIEW_SUBMITTED" || type === "MANUSCRIPT_FEEDBACK_PROVIDED") return ["WRITING_REVIEW_EDITING"];
  if (type === "EVIDENCE_EXTRACTED" || type === "EVIDENCE_REVISED") return ["DATA_CURATION"];
  // Saving a snapshot, being assigned a task or accepting mentorship proves no CRediT role.
  return [];
}
