import type { ScreeningChoice, ScreeningClassification, ScreeningEvaluationStatus, ScreeningState } from "@trend/shared-types";

/** Presentation only. Keep colors independent of translated labels and viewer actions. */
export type ScreeningTone = "neutral" | "attention" | "warning" | "dispute" | "adjudication" | "success" | "excluded";
export const screeningStateTones = {
  CONSENSUS_REQUIRED: "dispute", CONSENSUS_IN_PROGRESS: "dispute",
  NOT_REVIEWED: "neutral", IN_REVIEW: "attention", WAITING_REVIEWER: "neutral",
  WAITING_FULLTEXT: "neutral", AWAITING_FINALIZATION: "neutral", BACKGROUND: "neutral",
  NEEDS_RESOLUTION: "dispute", CONFLICT: "dispute", NEEDS_MORE_INFO: "warning",
  ADJUDICATING: "adjudication", INCLUDED: "success", ADVANCE_TO_FULLTEXT: "success", EXCLUDED: "excluded",
  CLOSED_UNRESOLVED: "neutral",
} satisfies Record<ScreeningState | ScreeningEvaluationStatus, ScreeningTone>;

export const screeningClassificationTones = {
  AGREEMENT_INCLUDE: "success", AGREEMENT_EXCLUDE: "excluded", CONFLICT: "dispute",
  NEEDS_CLARIFICATION: "warning", NEEDS_MORE_INFORMATION: "warning", EXCLUSION_REASON_MISMATCH: "dispute",
} satisfies Record<ScreeningClassification, ScreeningTone>;

export const screeningClassificationLabels: Record<ScreeningClassification, string> = {
  CONFLICT: "Có bất đồng", NEEDS_CLARIFICATION: "Cần làm rõ", NEEDS_MORE_INFORMATION: "Cần đọc thêm",
  EXCLUSION_REASON_MISMATCH: "Cần thống nhất lý do loại", AGREEMENT_INCLUDE: "Phù hợp", AGREEMENT_EXCLUDE: "Không phù hợp",
};

const caseTones: Record<string, ScreeningTone> = {
  COLLECTING: "adjudication", WAITING_ASSIGNMENT: "adjudication", REQUESTED: "adjudication",
  INVITED: "adjudication", ASSIGNED: "adjudication", ACCEPTED: "adjudication", IN_PROGRESS: "adjudication",
  COI_REVIEW: "warning", NEEDS_MORE_INFO: "warning", COMPLETED: "neutral",
  CANCELLED_AS_RESOLVED: "neutral", CANCELLED_REOPENED: "neutral",
};

export function screeningChoiceTone(choice: ScreeningChoice): ScreeningTone {
  return choice === "INCLUDE" ? "success" : choice === "EXCLUDE" ? "excluded" : "warning";
}

export function screeningStatusTone({ status, classification, caseStatus, invalidated, legacyNeedsAudit }: {
  status?: string | null; classification?: ScreeningClassification | null; caseStatus?: string | null;
  invalidated?: boolean; legacyNeedsAudit?: boolean;
}): ScreeningTone {
  if (invalidated) return "neutral";
  if (legacyNeedsAudit) return "warning";
  // A recorded outcome takes precedence over the case that produced it.
  if (status === "INCLUDED" || status === "ADVANCE_TO_FULLTEXT") return "success";
  if (status === "EXCLUDED") return "excluded";
  if (caseStatus) return caseTones[caseStatus] ?? "neutral";
  if ((status === "NEEDS_RESOLUTION" || status === "NEEDS_MORE_INFO" || status === "CONFLICT") && classification)
    return screeningClassificationTones[classification];
  return screeningStateTones[status as keyof typeof screeningStateTones] ?? "neutral";
}
