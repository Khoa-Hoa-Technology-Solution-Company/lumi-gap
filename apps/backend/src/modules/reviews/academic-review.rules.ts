import type { FeedbackItemPriority, OverallAcademicAssessment, ParticipantScope, ReviewRequestStatus } from "@trend/shared-types";

const SUGGESTION_KEY = "__suggestion__";
const SUGGESTION_SUFFIX = ":suggestion";

export function encodeFeedbackPriority(priority: FeedbackItemPriority, criterionKey?: string | null): { priority: "MAJOR" | "MINOR"; criterionKey?: string } {
  if (priority === "SUGGESTION") {
    return {
      priority: "MINOR",
      criterionKey: criterionKey ? `${criterionKey}${SUGGESTION_SUFFIX}`.slice(0, 80) : SUGGESTION_KEY,
    };
  }
  return { priority, criterionKey: criterionKey ?? undefined };
}

export function decodeFeedbackItem<T extends { priority: string; criterionKey?: string | null }>(item: T): Omit<T, "priority" | "criterionKey"> & { priority: FeedbackItemPriority; criterionKey?: string } {
  if (item.criterionKey === SUGGESTION_KEY) {
    return { ...item, priority: "SUGGESTION", criterionKey: undefined };
  }
  if (item.criterionKey?.endsWith(SUGGESTION_SUFFIX)) {
    return { ...item, priority: "SUGGESTION", criterionKey: item.criterionKey.slice(0, -SUGGESTION_SUFFIX.length) };
  }
  return { ...item, priority: (item.priority === "MAJOR" ? "MAJOR" : "MINOR") as FeedbackItemPriority, criterionKey: item.criterionKey ?? undefined };
}

export function isSuggestionRevisionItem(item: { criterionKey?: string | null }): boolean {
  return item.criterionKey === SUGGESTION_KEY || Boolean(item.criterionKey?.endsWith(SUGGESTION_SUFFIX));
}

export function reviewOutcome(overall: OverallAcademicAssessment | undefined, requiredRevisionCount: number) {
  const needsRevision = overall === "NOT_READY" || overall === "MINOR_REVISION" || overall === "MAJOR_REVISION" || requiredRevisionCount > 0;
  return {
    requestStatus: (needsRevision ? "REVISION_REQUESTED" : "COMPLETED") as ReviewRequestStatus,
    submissionStatus: needsRevision ? "revision_requested" : "completed",
    assignmentStatus: needsRevision ? "accepted" : "completed",
  } as const;
}

/** Requests without a due date get this window before an accepted review counts as overdue. */
export const DEFAULT_REVIEW_WINDOW_DAYS = 30;

export function reviewDeadline(request: { dueAt?: Date | null; createdAt: Date }): Date {
  return request.dueAt ?? new Date(request.createdAt.getTime() + DEFAULT_REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * The requester may cancel until the reviewer accepts. Once accepted, the reviewer has committed
 * time, so cancelling is only allowed when the review is overdue (otherwise the artifact would be stuck).
 */
export function canCancelReviewRequest(request: { status: ReviewRequestStatus; dueAt?: Date | null; createdAt: Date }, now = new Date()): boolean {
  if (request.status === "REQUESTED") return true;
  return (request.status === "ACCEPTED" || request.status === "IN_REVIEW") && reviewDeadline(request) < now;
}

/** A reviewer can decline a pending request, or withdraw after accepting as long as no round was submitted. */
export function canReviewerDeclineRequest(status: ReviewRequestStatus, submittedReviewCount: number): boolean {
  if (status === "REQUESTED") return true;
  return (status === "ACCEPTED" || status === "IN_REVIEW") && submittedReviewCount === 0;
}

export function canResubmitReviewRequest(status: ReviewRequestStatus): boolean {
  return status === "REVISION_REQUESTED";
}

export function canViewReviewRequest(input: { actorId: string; requesterId: string; reviewerId: string }): boolean {
  return input.actorId === input.requesterId || input.actorId === input.reviewerId;
}

export function canUseOpenReviewOpportunities(participantScope: ParticipantScope): boolean {
  return ["INTERNAL", "EXTERNAL", "PENDING"].includes(participantScope);
}

export function eligiblePeerReviewer(role: string | null | undefined, verification: string | null | undefined): boolean {
  return role === "LECTURER" && verification === "VERIFIED";
}

export function submissionReviewStatus(assignments: Array<{ status: string; requestStatus?: string | null; decision?: string | null }>): string {
  const active = assignments.filter((item) => !["declined", "cancelled"].includes(item.status));
  if (active.some((item) => ["REQUESTED", "ACCEPTED", "IN_REVIEW", "RESUBMITTED"].includes(item.requestStatus ?? "")
    || (!item.requestStatus && ["assigned", "accepted"].includes(item.status)))) return "under_review";
  if (active.some((item) => item.requestStatus === "REVISION_REQUESTED")) return "revision_requested";
  return active.length && active.every((item) => item.status === "completed") ? "completed" : "ready_for_review";
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
