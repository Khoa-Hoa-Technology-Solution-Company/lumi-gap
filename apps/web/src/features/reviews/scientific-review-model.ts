import type { ReviewTemplateVersionDetail, ReviewCriterionResponseInput } from "@trend/shared-types";
export function rubricCoverage(criteria: ReviewTemplateVersionDetail["criteria"], responses: Record<string, Omit<ReviewCriterionResponseInput, "criterionKey">>) {
  let applicable = 0, assessed = 0, total = 0, count = 0;
  for (const criterion of criteria) {
    const response = responses[criterion.key];
    if (response?.notApplicable && criterion.allowNotApplicable) continue;
    const weight = criterion.weight ?? 1; applicable += weight;
    const level = criterion.levels.find(level => level.id === response?.performanceLevelId);
    if (level) { assessed += weight; total += level.score * weight; count++; }
  }
  return { score: assessed ? total / assessed : null, coverage: applicable ? Math.round(assessed / applicable * 100) : 0, count };
}
export const internalAssessmentLabel = (assessment?: string | null, reviewStatus?: string) => !assessment && reviewStatus === "SUBMITTED" ? "Comment only" : assessment === "STRONG" || assessment === "READY_TO_ADVANCE" ? "Ready to advance internally" : assessment === "NOT_READY" ? "Not ready" : assessment === "MAJOR_REVISION" ? "Major revision" : assessment === "MINOR_REVISION" ? "Minor revision" : assessment ?? "";
