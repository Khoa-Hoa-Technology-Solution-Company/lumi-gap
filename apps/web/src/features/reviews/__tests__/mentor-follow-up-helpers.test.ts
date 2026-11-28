import { describe, expect, it } from "vitest";
import type { ReviewRequestDetail } from "../api/reviews.api";
import {
  buildRoundScoreComparison,
  buildVerifiedTimeline,
  collectTrackedRevisionItems,
  computeRevisionProgress,
  deriveCurrentRoundNumber,
  hasOfficialRubricScore,
  isRevisionItemVerifiable,
  selectRevisionResponses,
  summarizeIntegrityChecks,
} from "../mentor-follow-up-helpers";

const TEMPLATE_V1 = {
  id: "tpl-v1",
  status: "PUBLISHED" as const,
  versionNumber: 1,
  reviewMode: "RUBRIC_ASSESSMENT" as const,
  guidelines: [],
  criteria: [
    { id: "c1", key: "problem", title: "Problem", order: 1, required: true, allowNotApplicable: false, weight: 50, levels: [{ id: "l5", label: "Strong", score: 5, position: 1 }] },
    { id: "c2", key: "methods", title: "Methods", order: 2, required: true, allowNotApplicable: false, weight: 50, levels: [{ id: "l5b", label: "Strong", score: 5, position: 1 }] },
  ],
};

function makeDetail(overrides: Partial<ReviewRequestDetail> = {}): ReviewRequestDetail {
  return {
    id: "req-1",
    origin: "MENTOR_GUIDANCE",
    status: "RESUBMITTED",
    createdAt: "2026-11-18T09:00:00Z",
    updatedAt: "2026-11-25T10:00:00Z",
    respondedAt: "2026-11-19T08:00:00Z",
    requester: { id: "u-req", fullName: "Owner" },
    reviewer: { id: "u-rev", fullName: "Mentor" },
    assignment: { id: "assign-1", status: "accepted" },
    artifact: { submissionId: "sub-1", title: "Paper", type: "RESEARCH_PAPER", projectId: "p-1", projectTitle: "Paper", revisionId: "v2", revisionNumber: 2, contentType: "MARKDOWN" },
    templateVersion: TEMPLATE_V1,
    reviews: [],
    ...overrides,
  } as unknown as ReviewRequestDetail;
}

describe("mentor-follow-up-helpers", () => {
  it("derives current round accurately without artificially incrementing on completed or already-reviewed revisions", () => {
    const waiting = makeDetail({
      status: "REVISION_REQUESTED",
      artifact: { submissionId: "sub-1", title: "Paper", projectId: "p-1", revisionId: "v1", revisionNumber: 1, contentType: "MARKDOWN" },
      reviews: [{ id: "r1", revisionId: "v1", roundNumber: 1, status: "SUBMITTED", responses: [], requiredRevisions: [] }],
    });
    expect(deriveCurrentRoundNumber(waiting)).toBe(1);

    const resubmitted = makeDetail({
      status: "RESUBMITTED",
      artifact: { submissionId: "sub-1", title: "Paper", projectId: "p-1", revisionId: "v4", revisionNumber: 4, contentType: "MARKDOWN" },
      reviews: [{ id: "r1", revisionId: "v1", roundNumber: 1, status: "SUBMITTED", responses: [], requiredRevisions: [] }],
    });
    expect(deriveCurrentRoundNumber(resubmitted)).toBe(2);

    const completed = makeDetail({
      status: "COMPLETED",
      reviews: [{ id: "r1", revisionId: "v1", roundNumber: 1, status: "SUBMITTED", responses: [], requiredRevisions: [] }],
    });
    expect(deriveCurrentRoundNumber(completed)).toBe(1);
  });

  it("deduplicates revision items strictly by revisionItemId and selects responses for the current revision while hiding DRAFTs", () => {
    const reviews: ReviewRequestDetail["reviews"] = [
      {
        id: "r1",
        revisionId: "v1",
        roundNumber: 1,
        status: "SUBMITTED",
        responses: [],
        requiredRevisions: [
          {
            id: "item-1",
            priority: "MAJOR",
            description: "Clarify baseline",
            status: "ADDRESSED",
            responses: [
              { submissionRevisionId: "v2", responseText: "Old v2 response", status: "SUBMITTED" },
              { submissionRevisionId: "v3", responseText: "Private author draft", status: "DRAFT" },
            ],
          },
          {
            id: "item-2",
            priority: "SUGGESTION",
            description: "Optional diagram",
            status: "OPEN",
            responses: [],
          },
        ],
      },
      {
        id: "r2",
        revisionId: "v2",
        roundNumber: 2,
        status: "SUBMITTED",
        responses: [],
        requiredRevisions: [
          // Same revisionItemId should dedupe; distinct id with identical description must NOT dedupe!
          { id: "item-1", priority: "MAJOR", description: "Clarify baseline", status: "ADDRESSED", responses: [] },
          { id: "item-3", priority: "MINOR", description: "Clarify baseline", status: "OPEN", responses: [] },
        ],
      },
    ];

    const versions = [
      { _id: "v1", revisionNumber: 1 },
      { _id: "v2", revisionNumber: 2 },
      { _id: "v3", revisionNumber: 3 },
    ];
    const items = collectTrackedRevisionItems(reviews, versions);
    expect(items.map(i => i.id).sort()).toEqual(["item-1", "item-2", "item-3"]);

    // For current revision v3: DRAFT must NEVER be exposed, and v2 response stays historical (never mislabeled as v3!)
    const selected = selectRevisionResponses(items.find(i => i.id === "item-1")!, "v3", versions);
    expect(selected.currentResponse).toBeUndefined();
    expect(selected.historicalResponses).toHaveLength(1);
    expect(selected.historicalResponses[0]?.submissionRevisionId).toBe("v2");

    // Progress separates mandatory (2) from optional suggestion (1)
    const progress = computeRevisionProgress(items, "v2", versions);
    expect(progress.mandatoryTotal).toBe(2);
    expect(progress.suggestionTotal).toBe(1);
    expect(progress.awaitingMentorCount).toBe(1);
    expect(progress.awaitingTeamCount).toBe(1);
  });

  it("enforces exact verification eligibility and summarizes integrity checks independently from rubric scores", () => {
    expect(isRevisionItemVerifiable({ canReview: true, requestStatus: "RESUBMITTED", itemStatus: "ADDRESSED", hasCurrentResponse: true })).toBe(true);
    expect(isRevisionItemVerifiable({ canReview: true, requestStatus: "RESUBMITTED", itemStatus: "OPEN", hasCurrentResponse: false })).toBe(false);
    expect(isRevisionItemVerifiable({ canReview: true, requestStatus: "COMPLETED", itemStatus: "ADDRESSED", hasCurrentResponse: true })).toBe(false);

    const summary = summarizeIntegrityChecks(
      {
        authorship: { status: "CHECKED" },
        data: { status: "CONCERN", note: "Missing sample provenance" },
        ethics: { status: "NOT_APPLICABLE" },
      },
      "vi",
    );
    expect(summary).toMatchObject({ total: 3, checked: 1, concern: 1, notApplicable: 1 });
    expect(summary?.concerns[0]?.title).toBe("Tính trung thực dữ liệu");
    expect(summary?.concerns[0]?.note).toBe("Missing sample provenance");

    const summaryEn = summarizeIntegrityChecks({ data: { status: "CONCERN" } }, "en");
    expect(summaryEn?.concerns[0]?.title).toBe("Data fabrication or falsification concerns");
  });

  it("compares compatible official rubric rounds and builds only verified timeline events", () => {
    const r1: ReviewRequestDetail["reviews"][number] = {
      id: "r1",
      revisionId: "v1",
      roundNumber: 1,
      status: "SUBMITTED",
      submittedAt: "2026-11-20T10:00:00Z",
      weightedScore: 3.0,
      templateVersionId: "tpl-v1",
      templateVersion: TEMPLATE_V1,
      responses: [
        { criterionKey: "problem", score: 3, comment: "", notApplicable: false },
        { criterionKey: "methods", score: 3, comment: "", notApplicable: false },
      ],
      requiredRevisions: [],
    };
    const r2: ReviewRequestDetail["reviews"][number] = {
      id: "r2",
      revisionId: "v2",
      roundNumber: 2,
      status: "SUBMITTED",
      submittedAt: "2026-11-24T10:00:00Z",
      weightedScore: 4.5,
      templateVersionId: "tpl-v1",
      templateVersion: TEMPLATE_V1,
      responses: [
        { criterionKey: "problem", score: 5, comment: "", notApplicable: false },
        { criterionKey: "methods", score: 4, comment: "", notApplicable: false },
      ],
      requiredRevisions: [],
    };
    expect(hasOfficialRubricScore(r1)).toBe(true);
    const cmp = buildRoundScoreComparison([r2, r1], "u-rev");
    expect(cmp?.weightedDelta).toBe(1.5);
    expect(cmp?.rows.find(r => r.criterionKey === "problem")?.delta).toBe(2);

    const detail = makeDetail({ status: "RESUBMITTED", reviews: [r1] });
    const timeline = buildVerifiedTimeline(detail, [r1], [{ _id: "v2", revisionNumber: 2 }]);
    // Must not fabricate a resubmitted event from detail.updatedAt when v2 has no createdAt!
    expect(timeline.some(e => e.kind === "resubmitted")).toBe(false);
    const timelineWithRealRevDate = buildVerifiedTimeline(detail, [r1], [{ _id: "v2", revisionNumber: 2, createdAt: "2026-11-22T12:00:00Z" }]);
    expect(timelineWithRealRevDate.some(e => e.kind === "resubmitted")).toBe(true);
  });
});
