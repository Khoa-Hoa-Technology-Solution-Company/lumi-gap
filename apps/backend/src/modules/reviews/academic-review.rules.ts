import type { OverallAcademicAssessment, ParticipantScope, ReviewRequestStatus } from "@trend/shared-types";

export function reviewOutcome(overall: OverallAcademicAssessment | undefined, requiredRevisionCount: number) {
  const needsRevision = overall === "MINOR_REVISION" || overall === "MAJOR_REVISION" || requiredRevisionCount > 0;
  return {
    requestStatus: (needsRevision ? "REVISION_REQUESTED" : "COMPLETED") as ReviewRequestStatus,
    submissionStatus: needsRevision ? "revision_requested" : "completed",
    assignmentStatus: needsRevision ? "accepted" : "completed",
  } as const;
}

export function canCancelReviewRequest(status: ReviewRequestStatus): boolean {
  return status === "REQUESTED" || status === "ACCEPTED";
}

export function canResubmitReviewRequest(status: ReviewRequestStatus): boolean {
  return status === "REVISION_REQUESTED";
}

export function canViewReviewRequest(input: { actorId: string; requesterId: string; reviewerId: string }): boolean {
  return input.actorId === input.requesterId || input.actorId === input.reviewerId;
}

export function canUseOpenReviewOpportunities(participantScope: ParticipantScope): boolean {
  return participantScope !== "EXTERNAL";
}

export function weightedRubricScore(items: Array<{ score: number; weight: number }>): number | undefined {
  if (!items.length) return undefined;
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return undefined;
  return items.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight;
}

export function nextTemplateVersionNumber(versions: Array<{ versionNumber: number; status: string }>): number {
  return versions.reduce((maximum, item) => Math.max(maximum, item.versionNumber), 0) + 1;
}
