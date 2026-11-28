import {
  scientificIntegrityChecks,
  type AcademicReviewInput,
  type ReviewTemplateVersionDetail,
} from "@trend/shared-types";
import type { ReviewRequestDetail } from "./api/reviews.api";
import { compareCriterionScore, compareReviewScores, type ReviewScoreInput } from "@/features/submissions/score-comparison";
import { localizeIntegrityTitle } from "./system-rubric-i18n";

export type SubmittedRoundReview = ReviewRequestDetail["reviews"][number];
export type RevisionItemRecord = SubmittedRoundReview["requiredRevisions"][number];
export type RevisionResponseRecord = NonNullable<RevisionItemRecord["responses"]>[number];

export interface TrackedRevisionItem extends RevisionItemRecord {
  roundNumber: number;
  reviewId: string;
  sourceRevisionId: string;
  sourceRevisionNumber?: number;
  displayOrder: number;
}

export interface SelectedRevisionResponses {
  currentResponse?: RevisionResponseRecord;
  latestSubmittedResponse?: RevisionResponseRecord;
  historicalResponses: RevisionResponseRecord[];
}

export interface RevisionProgressStats {
  total: number;
  mandatoryTotal: number;
  suggestionTotal: number;
  verifiedCount: number;
  awaitingMentorCount: number;
  awaitingTeamCount: number;
  reopenedCount: number;
  respondedCurrentCount: number;
  reviewedCurrentCount: number;
}

export interface IntegritySummaryStats {
  total: number;
  checked: number;
  concern: number;
  notApplicable: number;
  concerns: Array<{ key: string; title: string; note?: string }>;
}

export interface LifecycleTimelineEvent {
  id: string;
  at: string;
  kind: "requested" | "accepted" | "submitted" | "resubmitted" | "completed";
  roundNumber?: number;
  versionNumber?: number;
  assessment?: string | null;
  recommendation?: string | null;
  status?: string;
}

export interface SubmissionVersionLike {
  _id?: string;
  id?: string;
  revisionNumber: number;
  createdAt?: string;
}

/**
 * Derive the authoritative current review round without artificially incrementing
 * when a round for the current revision is already submitted or the request is closed.
 */
export function deriveCurrentRoundNumber(detail: ReviewRequestDetail): number {
  const allReviews = detail.reviews ?? [];
  const exactDraft = allReviews.find(r => r.status === "DRAFT" && r.revisionId === detail.artifact.revisionId);
  if (exactDraft) return exactDraft.roundNumber;

  const exactSubmitted = allReviews
    .filter(r => r.status === "SUBMITTED" && r.revisionId === detail.artifact.revisionId)
    .sort((a, b) => b.roundNumber - a.roundNumber)[0];
  if (exactSubmitted) return exactSubmitted.roundNumber;

  const maxSubmittedRound = allReviews
    .filter(r => r.status === "SUBMITTED")
    .reduce((max, r) => Math.max(max, r.roundNumber), 0);

  if (["COMPLETED", "DECLINED", "CANCELLED", "EXPIRED"].includes(detail.status)) {
    return Math.max(1, maxSubmittedRound);
  }
  return maxSubmittedRound + 1;
}

/**
 * Deduplicate tracked revision items strictly by authoritative revisionItemId
 * (never by description), preserving origin round and stable display order.
 */
export function collectTrackedRevisionItems(
  submittedReviews: SubmittedRoundReview[],
  versions?: SubmissionVersionLike[],
): TrackedRevisionItem[] {
  const byId = new Map<string, TrackedRevisionItem>();
  const chronological = [...submittedReviews].sort((a, b) => a.roundNumber - b.roundNumber);
  let order = 0;

  for (const review of chronological) {
    const revNum =
      review.artifactRevision?.revisionNumber ??
      versions?.find(v => v._id === review.revisionId || v.id === review.revisionId)?.revisionNumber;
    for (const item of review.requiredRevisions ?? []) {
      if (byId.has(item.id)) continue;
      order += 1;
      byId.set(item.id, {
        ...item,
        roundNumber: review.roundNumber,
        reviewId: review.id,
        sourceRevisionId: review.revisionId,
        sourceRevisionNumber: revNum,
        displayOrder: order,
      });
    }
  }

  // Sort actionable items first (REOPENED/ADDRESSED/OPEN before ACCEPTED), then newest round, then display order
  return [...byId.values()].sort(
    (a, b) =>
      Number(a.status === "ACCEPTED") - Number(b.status === "ACCEPTED") ||
      b.roundNumber - a.roundNumber ||
      a.displayOrder - b.displayOrder,
  );
}

/**
 * Select author responses strictly excluding DRAFTs. Distinguishes the response
 * targeting the currently assigned manuscript revision from earlier historical responses.
 */
export function selectRevisionResponses(
  item: Pick<RevisionItemRecord, "responses">,
  currentRevisionId: string,
  versions?: SubmissionVersionLike[],
): SelectedRevisionResponses {
  const nonDraft = (item.responses ?? []).filter(r => r.status !== "DRAFT");
  if (!nonDraft.length) {
    return { historicalResponses: [] };
  }

  const versionNum = (revId: string) =>
    versions?.find(v => v._id === revId || v.id === revId)?.revisionNumber ?? -1;

  const currentMatches = nonDraft.filter(r => r.submissionRevisionId === currentRevisionId);
  const currentResponse = currentMatches.at(-1);

  const historicalResponses = nonDraft
    .filter(r => r.submissionRevisionId !== currentRevisionId)
    .sort((a, b) => versionNum(b.submissionRevisionId) - versionNum(a.submissionRevisionId));

  const latestSubmittedResponse =
    currentResponse ??
    [...nonDraft].sort((a, b) => versionNum(b.submissionRevisionId) - versionNum(a.submissionRevisionId))[0];

  return { currentResponse, latestSubmittedResponse, historicalResponses };
}

/**
 * Compute revision tracking progress counts strictly separating mandatory items
 * from optional SUGGESTION items and separating author response from mentor verification.
 */
export function computeRevisionProgress(
  items: TrackedRevisionItem[],
  currentRevisionId: string,
  versions?: SubmissionVersionLike[],
): RevisionProgressStats {
  let mandatoryTotal = 0;
  let suggestionTotal = 0;
  let verifiedCount = 0;
  let awaitingMentorCount = 0;
  let awaitingTeamCount = 0;
  let reopenedCount = 0;
  let respondedCurrentCount = 0;
  let reviewedCurrentCount = 0;

  for (const item of items) {
    if (item.priority === "SUGGESTION") {
      suggestionTotal += 1;
      continue;
    }
    mandatoryTotal += 1;
    const { currentResponse } = selectRevisionResponses(item, currentRevisionId, versions);
    if (currentResponse) respondedCurrentCount += 1;

    if (item.status === "ACCEPTED") {
      verifiedCount += 1;
      if (currentResponse) reviewedCurrentCount += 1;
    } else if (item.status === "REOPENED") {
      reopenedCount += 1;
      if (currentResponse) reviewedCurrentCount += 1;
    } else if (item.status === "ADDRESSED" && currentResponse) {
      awaitingMentorCount += 1;
    } else {
      awaitingTeamCount += 1;
    }
  }

  return {
    total: items.length,
    mandatoryTotal,
    suggestionTotal,
    verifiedCount,
    awaitingMentorCount,
    awaitingTeamCount,
    reopenedCount,
    respondedCurrentCount,
    reviewedCurrentCount,
  };
}

/**
 * Mirrors backend resolveRevisionItem eligibility in review-request.service.ts:
 * - Assigned reviewer with accepted assignment
 * - Request is RESUBMITTED or IN_REVIEW
 * - Non-DRAFT response exists for current assigned revision
 * - Item status is ADDRESSED, ACCEPTED, or REOPENED
 */
export function isRevisionItemVerifiable(input: {
  canReview: boolean;
  requestStatus: string;
  itemStatus: string;
  hasCurrentResponse: boolean;
}): boolean {
  return (
    input.canReview &&
    ["RESUBMITTED", "IN_REVIEW"].includes(input.requestStatus) &&
    input.hasCurrentResponse &&
    ["ADDRESSED", "ACCEPTED", "REOPENED"].includes(input.itemStatus)
  );
}

/**
 * Summarize integrity checks strictly from the keys actually present on the historical
 * review snapshot (never hardcoding 8 checks or blending into rubric scores).
 */
export function summarizeIntegrityChecks(
  checks: AcademicReviewInput["integrityChecks"] | undefined,
  language: string,
): IntegritySummaryStats | null {
  if (!checks) return null;
  const entries = Object.entries(checks).filter(([, entry]) => entry && typeof entry === "object" && "status" in entry);
  if (!entries.length) return null;

  let checked = 0;
  let concern = 0;
  let notApplicable = 0;
  const concerns: Array<{ key: string; title: string; note?: string }> = [];

  for (const [key, entry] of entries) {
    if (!entry) continue;
    if (entry.status === "CHECKED") checked += 1;
    else if (entry.status === "NOT_APPLICABLE") notApplicable += 1;
    else if (entry.status === "CONCERN") {
      concern += 1;
      const spec = scientificIntegrityChecks.find(item => item.key === key);
      const rawTitle = spec?.title ?? humanizeCriterionFallback(key);
      concerns.push({
        key,
        title: localizeIntegrityTitle(rawTitle, language),
        note: entry.note?.trim() || undefined,
      });
    }
  }

  return {
    total: entries.length,
    checked,
    concern,
    notApplicable,
    concerns,
  };
}

export function criterionMaxScore(
  criterion?: ReviewTemplateVersionDetail["criteria"][number],
): number | null {
  if (!criterion?.levels?.length) return null;
  const scores = criterion.levels.map(l => l.score).filter(s => typeof s === "number" && Number.isFinite(s));
  return scores.length ? Math.max(...scores) : null;
}

export function rubricMaxScale(templateVersion?: ReviewTemplateVersionDetail): number {
  const maxes = (templateVersion?.criteria ?? [])
    .map(c => criterionMaxScore(c))
    .filter((n): n is number => n !== null);
  return maxes.length ? Math.max(...maxes) : 5;
}

export function hasOfficialRubricScore(review: SubmittedRoundReview): boolean {
  return Boolean(
    review.templateVersion?.reviewMode === "RUBRIC_ASSESSMENT" &&
    review.weightedScore != null &&
    review.responses.some(r => !r.notApplicable && r.score != null),
  );
}

export function humanizeCriterionFallback(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, c => c.toUpperCase());
}

/**
 * Build verified lifecycle timeline events strictly from real persisted timestamps.
 * Never fabricates resubmission dates from detail.updatedAt.
 */
export function buildVerifiedTimeline(
  detail: ReviewRequestDetail,
  submittedReviews: SubmittedRoundReview[],
  versions?: SubmissionVersionLike[],
): LifecycleTimelineEvent[] {
  const events: LifecycleTimelineEvent[] = [];
  if (detail.createdAt) {
    events.push({ id: "requested", at: detail.createdAt, kind: "requested" });
  }
  if (detail.respondedAt) {
    events.push({ id: "accepted", at: detail.respondedAt, kind: "accepted" });
  }

  const chronological = [...submittedReviews].sort((a, b) => a.roundNumber - b.roundNumber);
  for (const review of chronological) {
    if (!review.submittedAt) continue;
    const revNum =
      review.artifactRevision?.revisionNumber ??
      versions?.find(v => v._id === review.revisionId || v.id === review.revisionId)?.revisionNumber;
    events.push({
      id: `submitted-${review.id}`,
      at: review.submittedAt,
      kind: "submitted",
      roundNumber: review.roundNumber,
      versionNumber: revNum,
      assessment: review.overallAssessment,
      recommendation: review.recommendation,
      status: review.status,
    });
  }

  // Only include a verified resubmission event when the current artifact revision
  // has a real createdAt timestamp strictly after the latest submitted review
  const latestSubmitted = chronological.at(-1);
  if (latestSubmitted && detail.artifact.revisionId !== latestSubmitted.revisionId) {
    const currentRev = versions?.find(v => v._id === detail.artifact.revisionId || v.id === detail.artifact.revisionId);
    if (currentRev?.createdAt) {
      events.push({
        id: `resubmitted-${detail.artifact.revisionId}`,
        at: currentRev.createdAt,
        kind: "resubmitted",
        versionNumber: detail.artifact.revisionNumber,
      });
    }
  }

  if (detail.status === "COMPLETED" && detail.completedAt) {
    events.push({ id: "completed", at: detail.completedAt, kind: "completed" });
  }

  return events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

function toSubmittedVersionReview(review: SubmittedRoundReview, reviewerId: string): ReviewScoreInput {
  return {
    reviewerId,
    templateVersionId: review.templateVersionId ?? review.templateVersion?.id ?? null,
    weightedScore: review.weightedScore ?? null,
    responses: review.responses.map(r => ({
      criterionKey: r.criterionKey,
      score: r.score ?? null,
      notApplicable: Boolean(r.notApplicable),
    })),
  };
}

export interface RoundScoreComparisonRow {
  criterionKey: string;
  beforeScore: number | null;
  afterScore: number | null;
  beforeNa: boolean;
  afterNa: boolean;
  delta?: number;
}

export interface RoundScoreComparisonResult {
  beforeRound: SubmittedRoundReview;
  afterRound: SubmittedRoundReview;
  weightedDelta?: number;
  weightedReason?: string;
  rows: RoundScoreComparisonRow[];
}

/**
 * Reuses score-comparison.ts strictly on two officially submitted rubric rounds
 * sharing the same reviewer and compatible template version.
 */
export function buildRoundScoreComparison(
  submittedReviews: SubmittedRoundReview[],
  reviewerId: string,
): RoundScoreComparisonResult | null {
  const scored = submittedReviews
    .filter(r => hasOfficialRubricScore(r))
    .sort((a, b) => a.roundNumber - b.roundNumber);
  if (scored.length < 2) return null;

  const afterRound = scored.at(-1)!;
  const afterTplId = afterRound.templateVersionId ?? afterRound.templateVersion?.id;
  if (!afterTplId) return null;

  // Find the most recent compatible prior round with the same rubric template version
  const beforeRound = [...scored.slice(0, -1)]
    .reverse()
    .find(r => (r.templateVersionId ?? r.templateVersion?.id) === afterTplId);
  if (!beforeRound) return null;

  const left = toSubmittedVersionReview(beforeRound, reviewerId);
  const right = toSubmittedVersionReview(afterRound, reviewerId);
  const overall = compareReviewScores(left, right);

  const orderedKeys = (afterRound.templateVersion?.criteria ?? []).map(c => c.key);
  const allKeys = [...new Set([...orderedKeys, ...beforeRound.responses.map(r => r.criterionKey), ...afterRound.responses.map(r => r.criterionKey)])];

  const rows: RoundScoreComparisonRow[] = allKeys.map(key => {
    const bResp = beforeRound.responses.find(r => r.criterionKey === key);
    const aResp = afterRound.responses.find(r => r.criterionKey === key);
    return {
      criterionKey: key,
      beforeScore: bResp?.score ?? null,
      afterScore: aResp?.score ?? null,
      beforeNa: Boolean(bResp?.notApplicable),
      afterNa: Boolean(aResp?.notApplicable),
      delta: compareCriterionScore(left, right, key),
    };
  });

  return {
    beforeRound,
    afterRound,
    weightedDelta: "delta" in overall ? overall.delta : undefined,
    weightedReason: "reason" in overall ? overall.reason : undefined,
    rows,
  };
}
