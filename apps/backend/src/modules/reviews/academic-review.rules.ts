import type {
  AcademicReviewMode,
  FeedbackItemPriority,
  OverallAcademicAssessment,
  ParticipantScope,
  ReviewRequestStatus,
  ReviewTemplateCriterionInput,
} from "@trend/shared-types";

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

const GENERIC_ARTIFACT_TYPES = new Set(["MANUSCRIPT", "GENERAL_REPORT"]);

/**
 * Generic templates (unspecified, MANUSCRIPT, GENERAL_REPORT) work across document types.
 * Specific templates match their target document type (or submissions without a declared type).
 */
export function isArtifactTypeCompatible(
  templateArtifactType: string | null | undefined,
  submissionType: string | null | undefined,
): boolean {
  if (!templateArtifactType || GENERIC_ARTIFACT_TYPES.has(templateArtifactType)) return true;
  if (!submissionType) return true;
  return templateArtifactType === submissionType;
}

/**
 * Determine whether a selected rubric score counts as a low rating requiring actionable feedback.
 * Preserves the established <= 2 rule for standard 4/5-point scales while generalizing safely
 * to binary (1-2) and wider custom scales (e.g. 0-10 or 0-100).
 */
export function isLowRubricScore(score: number, levelScores: readonly number[]): boolean {
  const valid = levelScores.filter(s => typeof s === "number" && Number.isFinite(s));
  if (!valid.length) return score <= 2;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (max <= min) return false;
  if (min >= 1 && max >= 4 && max <= 5) return score <= 2;
  if (valid.length <= 2) return score <= min;
  return score <= min + (max - min) * 0.4;
}

/**
 * Validate template criterion definitions consistently on creation, draft updates, and publication.
 * Relative weights are preserved without arbitrarily forcing a sum of 100.
 */
export function validateTemplateCriteriaConfig(
  reviewMode: AcademicReviewMode,
  criteria: readonly ReviewTemplateCriterionInput[],
): string | null {
  if (!criteria.length) return "A template requires at least one criterion";
  if (criteria.length > 60) return "A template can contain at most 60 criteria";
  for (let i = 0; i < criteria.length; i += 1) {
    const c = criteria[i]!;
    if (!c.title?.trim() || c.title.trim().length < 2) {
      return `Criterion ${i + 1} requires a clear title`;
    }
    if (c.weight !== undefined && (!Number.isFinite(c.weight) || c.weight <= 0 || c.weight > 100)) {
      return `Criterion "${c.title.trim()}" has an invalid weight`;
    }
    if (reviewMode === "RUBRIC_ASSESSMENT") {
      if (!c.levels || c.levels.length < 2) {
        return `Rubric criterion "${c.title.trim()}" requires at least 2 performance levels`;
      }
      if (c.levels.length > 10) {
        return `Rubric criterion "${c.title.trim()}" can have at most 10 performance levels`;
      }
      const seenScores = new Set<number>();
      for (const level of c.levels) {
        if (!level.label?.trim()) {
          return `Every performance level in "${c.title.trim()}" requires a label`;
        }
        if (!Number.isInteger(level.score) || level.score < 0 || level.score > 100) {
          return `Performance level "${level.label.trim()}" must use an integer score between 0 and 100`;
        }
        if (seenScores.has(level.score)) {
          return `Rubric criterion "${c.title.trim()}" cannot have duplicate level scores (${level.score})`;
        }
        seenScores.add(level.score);
      }
    }
  }
  return null;
}

export interface DraftResponseForMigration {
  id: string;
  criterionKey: string;
  comment: string;
  evidence: string | null;
  assessment: string | null;
  performanceLevelId: string | null;
  score: number | null;
  notApplicable: boolean;
}

/**
 * Classify draft criterion responses when switching a review to a different template version.
 * Compatible keys retain narrative comments/evidence (and valid ratings only if same mode & level/assessment);
 * keys absent from the target template are removed without touching overall comments, integrity checks, or revisions.
 */
export function planDraftResponseMigration(
  existingResponses: readonly DraftResponseForMigration[],
  newCriteria: ReadonlyArray<{ key: string; allowNotApplicable: boolean; levels: ReadonlyArray<{ id: string; score: number }> }>,
  newReviewMode: AcademicReviewMode,
) {
  const criteriaByKey = new Map(newCriteria.map(c => [c.key, c]));
  const deleteIds: string[] = [];
  const updates: Array<{
    id: string;
    performanceLevelId: string | null;
    score: number | null;
    assessment: string | null;
    notApplicable: boolean;
  }> = [];
  let incompatibleCount = 0;

  for (const resp of existingResponses) {
    const target = criteriaByKey.get(resp.criterionKey);
    if (!target) {
      deleteIds.push(resp.id);
      incompatibleCount += 1;
      continue;
    }
    const keepNA = resp.notApplicable && target.allowNotApplicable;
    let nextLevelId: string | null = null;
    let nextScore: number | null = null;
    let nextAssessment: string | null = null;

    if (!keepNA) {
      if (newReviewMode === "RUBRIC_ASSESSMENT" && resp.performanceLevelId) {
        const matched = target.levels.find(l => l.id === resp.performanceLevelId);
        if (matched) {
          nextLevelId = matched.id;
          nextScore = matched.score;
        } else {
          incompatibleCount += 1;
        }
      } else if (newReviewMode === "STRUCTURED_REVIEW" && resp.assessment) {
        if (resp.assessment === "NOT_APPLICABLE" && !target.allowNotApplicable) {
          incompatibleCount += 1;
        } else {
          nextAssessment = resp.assessment;
        }
      } else if (resp.performanceLevelId || resp.assessment) {
        incompatibleCount += 1;
      }
    }

    if (
      nextLevelId !== resp.performanceLevelId ||
      nextScore !== resp.score ||
      nextAssessment !== resp.assessment ||
      keepNA !== resp.notApplicable
    ) {
      updates.push({
        id: resp.id,
        performanceLevelId: nextLevelId,
        score: nextScore,
        assessment: nextAssessment,
        notApplicable: keepNA,
      });
    }
  }

  return { deleteIds, updates, incompatibleCount };
}
