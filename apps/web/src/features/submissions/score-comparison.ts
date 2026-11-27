import type { SubmittedVersionReview } from "@trend/shared-types";

export type ReviewScoreInput = Pick<SubmittedVersionReview, "reviewerId" | "templateVersionId" | "weightedScore"> & {
  responses: Array<Pick<SubmittedVersionReview["responses"][number], "criterionKey" | "score" | "notApplicable">>;
};

export function compareReviewScores(before?: ReviewScoreInput, after?: ReviewScoreInput) {
  if (!before || !after) return { reason: "Cần review ở cả hai phiên bản của cùng reviewer và rubric." };
  if (before.reviewerId !== after.reviewerId) return { reason: "Hai phiên bản có reviewer khác nhau." };
  if (!before.templateVersionId || before.templateVersionId !== after.templateVersionId) return { reason: "Rubric khác phiên bản hoặc không có thông tin rubric." };
  const applicable = (review: ReviewScoreInput) => review.responses.filter((item) => !item.notApplicable && item.score !== null).map((item) => item.criterionKey).sort().join("|");
  if (applicable(before) !== applicable(after)) return { reason: "Tập tiêu chí có điểm thay đổi; xem từng tiêu chí để đối chiếu." };
  if (before.weightedScore === null || after.weightedScore === null) return { reason: "Review này không có điểm rubric." };
  return { delta: after.weightedScore - before.weightedScore };
}

export function latestReviewsByReviewerAndRubric(reviews: SubmittedVersionReview[]) {
  const result = new Map<string, SubmittedVersionReview>();
  for (const review of reviews) {
    const key = `${review.reviewerId}:${review.templateVersionId ?? "legacy"}`;
    const previous = result.get(key);
    if (!previous || (review.submittedAt ?? "") > (previous.submittedAt ?? "") || (review.submittedAt === previous.submittedAt && review.roundNumber > previous.roundNumber)) result.set(key, review);
  }
  return result;
}

export function compareCriterionScore(before: ReviewScoreInput, after: ReviewScoreInput, key: string) {
  if (before.reviewerId !== after.reviewerId || !before.templateVersionId || before.templateVersionId !== after.templateVersionId) return undefined;
  const left = before.responses.find((item) => item.criterionKey === key), right = after.responses.find((item) => item.criterionKey === key);
  return left && right && !left.notApplicable && !right.notApplicable && left.score !== null && right.score !== null ? right.score - left.score : undefined;
}
