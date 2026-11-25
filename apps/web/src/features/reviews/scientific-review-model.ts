import type { ReviewTemplateVersionDetail, ReviewCriterionResponseInput } from "@trend/shared-types";

export function rubricCoverage(
  criteria: ReviewTemplateVersionDetail["criteria"],
  responses: Record<string, Omit<ReviewCriterionResponseInput, "criterionKey">>,
) {
  let applicable = 0;
  let assessed = 0;
  let total = 0;
  let count = 0;
  for (const criterion of criteria) {
    const response = responses[criterion.key];
    if (response?.notApplicable && criterion.allowNotApplicable) continue;
    const weight = criterion.weight ?? 1;
    applicable += weight;
    const level = criterion.levels.find(level => level.id === response?.performanceLevelId);
    if (level) {
      assessed += weight;
      total += level.score * weight;
      count++;
    }
  }
  return {
    score: assessed ? total / assessed : null,
    coverage: applicable ? Math.round((assessed / applicable) * 100) : 0,
    count,
  };
}

export function rubricDetailedMetrics(
  criteria: ReviewTemplateVersionDetail["criteria"],
  responses: Record<string, Omit<ReviewCriterionResponseInput, "criterionKey">>,
) {
  const base = rubricCoverage(criteria, responses);
  let applicableCount = 0;
  let notApplicableCount = 0;
  for (const criterion of criteria) {
    const response = responses[criterion.key];
    if (response?.notApplicable && criterion.allowNotApplicable) {
      notApplicableCount += 1;
    } else {
      applicableCount += 1;
    }
  }
  const countCoveragePct = applicableCount > 0 ? Math.round((base.count / applicableCount) * 1000) / 10 : 0;
  const isComplete = applicableCount > 0 && base.count === applicableCount;
  const isProvisional = base.count > 0 && !isComplete;
  return {
    score: base.score,
    weightCoveragePct: base.coverage,
    countCoveragePct,
    assessedCount: base.count,
    applicableCount,
    notApplicableCount,
    isComplete,
    isProvisional,
  };
}

export const internalAssessmentLabel = (
  assessment?: string | null,
  reviewStatus?: string,
  recommendation?: string | null,
) => {
  if (!assessment && recommendation === "SELF_REVISION") return "Needs self-revision";
  if (!assessment && (reviewStatus === "SUBMITTED" || recommendation === "COMMENT_ONLY")) return "Comment only";
  if (assessment === "STRONG" || assessment === "READY_TO_ADVANCE") return "Ready to advance internally";
  if (assessment === "NOT_READY") return "Not ready";
  if (assessment === "MAJOR_REVISION") return "Major revision";
  if (assessment === "MINOR_REVISION") return "Minor revision";
  return assessment ?? "";
};
