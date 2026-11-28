import {
  requiresScientificIntegrity,
  scientificIntegrityChecks,
  type AcademicReviewInput,
  type FeedbackItemPriority,
  type OverallAcademicAssessment,
  type ScientificIntegrityCheckKey,
  type StructuredAssessment,
} from "@trend/shared-types";

export type CriterionResponseDraft = {
  comment: string;
  evidence: string;
  assessment?: StructuredAssessment;
  performanceLevelId?: string;
  notApplicable: boolean;
};

export type RevisionItemDraft = {
  priority: FeedbackItemPriority;
  description: string;
  locator?: string;
  criterionKey?: string;
  quotation?: string;
};

export type ReadinessCriterion = {
  key: string;
  title: string;
  required: boolean;
  allowNotApplicable: boolean;
  levels: Array<{ id: string; score: number }>;
};

export type ReadinessSection = "criteria" | "integrity" | "revisions" | "summary" | "previous";

export type ReadinessIssue = {
  id: string;
  category:
    | "criterion"
    | "low_score_comment"
    | "summary"
    | "decision"
    | "revisions"
    | "integrity"
    | "previous_round";
  targetSection: ReadinessSection;
  criterionKey?: string;
  integrityCheckKey?: ScientificIntegrityCheckKey;
  focusElementId?: string;
  labelKey: string;
  labelValues?: Record<string, string | number>;
};

export type RubricReadinessResult = {
  missingRequiredCriteria: ReadinessCriterion[];
  lowScoreMissingCommentCriteria: ReadinessCriterion[];
  allCriteriaScored: boolean;
  requiredFieldsCompleted: boolean;
  isReadyToSubmit: boolean;
  issues: ReadinessIssue[];
  integrityRequired: boolean;
  integrityAnsweredCount: number;
  integrityCompleteCount: number;
  integrityTotalCount: number;
  integrityUncheckedCount: number;
  integrityCheckedCount: number;
  integrityConcernCount: number;
  integrityNotApplicableCount: number;
  integrityConcernMissingNoteKeys: ScientificIntegrityCheckKey[];
  integrityUncheckedKeys: ScientificIntegrityCheckKey[];
  integrityConcernKeys: ScientificIntegrityCheckKey[];
  hasIntegrityConcern: boolean;
  unresolvedPreviousCount: number;
  addressedPreviousCount: number;
  mandatoryRevisionCount: number;
  suggestionCount: number;
};

export function isLowRubricRating(score: number, levelScores: readonly number[]): boolean {
  const valid = levelScores.filter(s => typeof s === "number" && Number.isFinite(s));
  if (!valid.length) return score <= 2;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (max <= min) return false;
  if (min >= 1 && max >= 4 && max <= 5) return score <= 2;
  if (valid.length <= 2) return score <= min;
  return score <= min + (max - min) * 0.4;
}

export function criterionNeedsLowScoreComment(
  criterion: ReadinessCriterion,
  response: CriterionResponseDraft | undefined,
  reviewMode: string,
): boolean {
  if (!response || response.notApplicable) return false;
  if (response.comment.trim().length > 0) return false;
  if (reviewMode === "RUBRIC_ASSESSMENT" && response.performanceLevelId) {
    const level = criterion.levels.find(item => item.id === response.performanceLevelId);
    return Boolean(level && isLowRubricRating(level.score, criterion.levels.map(item => item.score)));
  }
  if (reviewMode === "STRUCTURED_REVIEW" && response.assessment) {
    return response.assessment === "MAJOR_ISSUES" || response.assessment === "NEEDS_IMPROVEMENT";
  }
  return false;
}

export function isCriterionAssessed(
  criterion: ReadinessCriterion,
  response: CriterionResponseDraft | undefined,
  reviewMode: string,
): boolean {
  if (!response) return false;
  if (response.notApplicable) return criterion.allowNotApplicable;
  if (reviewMode === "RUBRIC_ASSESSMENT") return Boolean(response.performanceLevelId);
  if (reviewMode === "STRUCTURED_REVIEW") return Boolean(response.assessment);
  return Boolean(response.comment.trim());
}

export function computeRubricReadiness(params: {
  criteria: ReadinessCriterion[];
  getCriterionTitle?: (criterion: ReadinessCriterion) => string;
  responses: Record<string, CriterionResponseDraft>;
  reviewMode: string;
  commentOnly: boolean;
  overallAssessment: OverallAcademicAssessment | "";
  overallComment: string;
  requiredRevisions: RevisionItemDraft[];
  integrityChecks: NonNullable<AcademicReviewInput["integrityChecks"]>;
  guidelines: string[];
  origin?: string;
  previousRevisionItems: Array<{ status: string; priority?: FeedbackItemPriority }>;
}): RubricReadinessResult {
  const {
    criteria,
    getCriterionTitle,
    responses,
    reviewMode,
    commentOnly,
    overallAssessment,
    overallComment,
    requiredRevisions,
    integrityChecks,
    guidelines,
    origin,
    previousRevisionItems,
  } = params;

  const issues: ReadinessIssue[] = [];
  const validRevisions = requiredRevisions.filter(item => item.description.trim().length > 0);
  const mandatoryRevisionCount = validRevisions.filter(item => item.priority !== "SUGGESTION").length;
  const suggestionCount = validRevisions.filter(item => item.priority === "SUGGESTION").length;
  const mandatoryPreviousItems = previousRevisionItems.filter(item => item.priority !== "SUGGESTION");
  const unresolvedPreviousCount = mandatoryPreviousItems.filter(item => item.status !== "ACCEPTED").length;
  const addressedPreviousCount = mandatoryPreviousItems.filter(item => item.status === "ADDRESSED").length;

  const missingRequiredCriteria = criteria.filter(
    criterion => criterion.required && !isCriterionAssessed(criterion, responses[criterion.key], reviewMode),
  );
  const lowScoreMissingCommentCriteria = criteria.filter(criterion =>
    criterionNeedsLowScoreComment(criterion, responses[criterion.key], reviewMode),
  );

  const integrityRequired = requiresScientificIntegrity(guidelines, origin);
  let integrityAnsweredCount = 0;
  let integrityCompleteCount = 0;
  let integrityCheckedCount = 0;
  let integrityConcernCount = 0;
  let integrityNotApplicableCount = 0;
  const integrityConcernMissingNoteKeys: ScientificIntegrityCheckKey[] = [];
  const integrityUncheckedKeys: ScientificIntegrityCheckKey[] = [];
  const integrityConcernKeys: ScientificIntegrityCheckKey[] = [];
  let hasIntegrityConcern = false;

  for (const check of scientificIntegrityChecks) {
    const item = integrityChecks[check.key];
    if (!item?.status) {
      integrityUncheckedKeys.push(check.key);
      continue;
    }
    if (item.status === "NOT_APPLICABLE" && !check.allowNotApplicable) {
      integrityUncheckedKeys.push(check.key);
      continue;
    }
    integrityAnsweredCount += 1;
    if (item.status === "CHECKED") {
      integrityCheckedCount += 1;
      integrityCompleteCount += 1;
    } else if (item.status === "NOT_APPLICABLE") {
      integrityNotApplicableCount += 1;
      integrityCompleteCount += 1;
    } else if (item.status === "CONCERN") {
      hasIntegrityConcern = true;
      integrityConcernCount += 1;
      integrityConcernKeys.push(check.key);
      if ((item.note?.trim().length ?? 0) < 10) {
        integrityConcernMissingNoteKeys.push(check.key);
        continue;
      }
      integrityCompleteCount += 1;
    }
  }
  const integrityUncheckedCount = integrityUncheckedKeys.length;

  // Previous round author responses needing verification always block submission
  if (addressedPreviousCount > 0) {
    issues.push({
      id: "previous-addressed",
      category: "previous_round",
      targetSection: "previous",
      labelKey: "reviewWorkspace.readiness.verifyPreviousAddressed",
      labelValues: { count: addressedPreviousCount },
    });
  }

  if (commentOnly) {
    if (unresolvedPreviousCount > 0 && addressedPreviousCount === 0) {
      issues.push({
        id: "previous-unresolved-comment-only",
        category: "previous_round",
        targetSection: "previous",
        labelKey: "reviewWorkspace.readiness.resolvePreviousForCommentOnly",
        labelValues: { count: unresolvedPreviousCount },
      });
    }
    if (!overallComment.trim()) {
      issues.push({
        id: "overall-comment",
        category: "summary",
        targetSection: "summary",
        focusElementId: "review-overall-comment",
        labelKey: "reviewWorkspace.readiness.missingOverallComment",
      });
    }
  } else {
    for (const criterion of missingRequiredCriteria) {
      issues.push({
        id: `criterion-${criterion.key}`,
        category: "criterion",
        targetSection: "criteria",
        criterionKey: criterion.key,
        labelKey: "reviewWorkspace.readiness.missingCriterion",
        labelValues: { title: getCriterionTitle ? getCriterionTitle(criterion) : criterion.title },
      });
    }

    for (const criterion of lowScoreMissingCommentCriteria) {
      if (missingRequiredCriteria.some(m => m.key === criterion.key)) continue;
      issues.push({
        id: `low-score-${criterion.key}`,
        category: "low_score_comment",
        targetSection: "criteria",
        criterionKey: criterion.key,
        labelKey: "reviewWorkspace.readiness.lowScoreNeedsComment",
        labelValues: { title: getCriterionTitle ? getCriterionTitle(criterion) : criterion.title },
      });
    }

    if (!overallAssessment) {
      issues.push({
        id: "overall-assessment",
        category: "decision",
        targetSection: "summary",
        focusElementId: "review-decision-section",
        labelKey: "reviewWorkspace.readiness.missingDecision",
      });
    }

    if (!overallComment.trim()) {
      issues.push({
        id: "overall-comment",
        category: "summary",
        targetSection: "summary",
        focusElementId: "review-overall-comment",
        labelKey: "reviewWorkspace.readiness.missingOverallComment",
      });
    }

    if (integrityRequired) {
      if (integrityUncheckedCount > 0) {
        issues.push({
          id: "integrity-unchecked",
          category: "integrity",
          targetSection: "integrity",
          integrityCheckKey: integrityUncheckedKeys[0],
          focusElementId: integrityUncheckedKeys[0] ? `integrity-row-${integrityUncheckedKeys[0]}` : "review-integrity",
          labelKey: "reviewWorkspace.readiness.integrityIncomplete",
          labelValues: { count: integrityUncheckedCount },
        });
      }
      if (integrityConcernMissingNoteKeys.length > 0) {
        issues.push({
          id: "integrity-concern-note",
          category: "integrity",
          targetSection: "integrity",
          integrityCheckKey: integrityConcernMissingNoteKeys[0],
          focusElementId: `integrity-note-${integrityConcernMissingNoteKeys[0]}`,
          labelKey: "reviewWorkspace.readiness.integrityConcernNote",
          labelValues: { count: integrityConcernMissingNoteKeys.length },
        });
      }
      if (overallAssessment === "STRONG" && hasIntegrityConcern) {
        issues.push({
          id: "integrity-blocks-approval",
          category: "integrity",
          targetSection: "integrity",
          integrityCheckKey: integrityConcernKeys[0],
          focusElementId: integrityConcernKeys[0] ? `integrity-row-${integrityConcernKeys[0]}` : "review-integrity",
          labelKey: "reviewWorkspace.readiness.integrityBlocksApproval",
        });
      }
    }

    const isRevisionDecision =
      overallAssessment === "MINOR_REVISION" ||
      overallAssessment === "MAJOR_REVISION" ||
      overallAssessment === "NOT_READY";
    if (isRevisionDecision && mandatoryRevisionCount === 0 && unresolvedPreviousCount === 0) {
      issues.push({
        id: "revision-item-required",
        category: "revisions",
        targetSection: "revisions",
        labelKey: "reviewWorkspace.readiness.revisionItemRequired",
      });
    }

    if (overallAssessment === "STRONG" && (mandatoryRevisionCount > 0 || unresolvedPreviousCount > 0)) {
      issues.push({
        id: "approval-has-revisions",
        category: "revisions",
        targetSection: mandatoryRevisionCount > 0 ? "revisions" : "previous",
        labelKey: "reviewWorkspace.readiness.approvalBlockedByRevisions",
        labelValues: { count: mandatoryRevisionCount + unresolvedPreviousCount },
      });
    }
  }

  const allCriteriaScored =
    missingRequiredCriteria.length === 0 && lowScoreMissingCommentCriteria.length === 0;
  const requiredFieldsCompleted = issues.every(
    issue => issue.category === "criterion" || issue.category === "low_score_comment",
  );

  return {
    missingRequiredCriteria,
    lowScoreMissingCommentCriteria,
    allCriteriaScored,
    requiredFieldsCompleted,
    isReadyToSubmit: issues.length === 0,
    issues,
    integrityRequired,
    integrityAnsweredCount,
    integrityCompleteCount,
    integrityTotalCount: scientificIntegrityChecks.length,
    integrityUncheckedCount,
    integrityCheckedCount,
    integrityConcernCount,
    integrityNotApplicableCount,
    integrityConcernMissingNoteKeys,
    integrityUncheckedKeys,
    integrityConcernKeys,
    hasIntegrityConcern,
    unresolvedPreviousCount,
    addressedPreviousCount,
    mandatoryRevisionCount,
    suggestionCount,
  };
}
