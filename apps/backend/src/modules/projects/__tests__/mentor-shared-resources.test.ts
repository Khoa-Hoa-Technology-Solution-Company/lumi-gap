import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  aggregateAndDeduplicateResources,
  canonicalResourceKey,
  classifyResourceCategory,
  filterSortAndPaginateResources,
  type InboxExplicitShareRow,
  type InboxReviewGrantRow,
} from "../mentor-shared-resources.js";
import { mentorResourceInboxSchema } from "../dto/mentor-access.schema.js";

const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "22222222-2222-4222-8222-222222222222";
const ACCESS_A = "33333333-3333-4333-8333-333333333333";
const ACCESS_B = "44444444-4444-4444-8444-444444444444";
const USER_OWNER = "55555555-5555-4555-8555-555555555555";

const projects = new Map([
  [PROJECT_A, { id: PROJECT_A, title: "AI in Medical Imaging", status: "ACTIVE" }],
  [PROJECT_B, { id: PROJECT_B, title: "Clinical Decision Support", status: "ACTIVE" }],
]);
const peopleNames = new Map([[USER_OWNER, "Nguyễn Đình Thành"]]);

function makeShare(overrides: Partial<InboxExplicitShareRow>): InboxExplicitShareRow {
  return {
    id: randomUUID(),
    projectId: PROJECT_A,
    accessId: ACCESS_A,
    sharedById: USER_OWNER,
    kind: "PAPER",
    resourceId: randomUUID(),
    sectionKey: "",
    title: "Reference paper",
    message: null,
    accessMode: "VIEW",
    hasPdf: false,
    createdAt: new Date("2026-11-20T10:00:00Z"),
    revokedAt: null,
    canComment: false,
    ...overrides,
  };
}

function makeReviewGrant(overrides: Partial<InboxReviewGrantRow>): InboxReviewGrantRow {
  const revId = randomUUID();
  return {
    assignmentId: randomUUID(),
    requestId: randomUUID(),
    projectId: PROJECT_A,
    accessId: ACCESS_A,
    submissionId: randomUUID(),
    submissionTitle: "Draft manuscript",
    submissionType: "RESEARCH_PAPER",
    requestStatus: "IN_REVIEW",
    requestMessage: null,
    requesterName: "Nguyễn Đình Thành",
    createdAt: new Date("2026-11-22T10:00:00Z"),
    revisions: [
      {
        revisionId: revId,
        revisionNumber: 1,
        originalFileName: "manuscript_v1.pdf",
        contentType: "PDF",
        createdAt: "2026-11-22T09:50:00Z",
        reviewRequestId: null,
        reviewId: null,
        reviewStatus: "IN_REVIEW",
      },
    ],
    ...overrides,
  };
}

describe("mentor-shared-resources aggregation, canonical deduplication & filtering", () => {
  it("classifies categories accurately and excludes tasks, milestones, contributions, overview and screening packets", () => {
    expect(classifyResourceCategory("PAPER")).toBe("REFERENCE_PAPER");
    expect(classifyResourceCategory("GAP")).toBe("RESEARCH_GAP");
    expect(classifyResourceCategory("SUBMISSION", "RESEARCH_PLAN")).toBe("RESEARCH_PLAN");
    expect(classifyResourceCategory("SUBMISSION", "RESEARCH_PAPER")).toBe("MANUSCRIPT_REPORT");
    expect(classifyResourceCategory("SUBMISSION", "RESEARCH_PROPOSAL")).toBe("MANUSCRIPT_REPORT");
    expect(classifyResourceCategory("MANUSCRIPT")).toBe("MANUSCRIPT_REPORT");

    const paperId = randomUUID();
    const gapId = randomUUID();
    const draftId = randomUUID();
    const items = aggregateAndDeduplicateResources({
      projects,
      peopleNames,
      paperMetadata: new Map([[paperId, { authors: ["Le Van A"], publicationYear: 2025, doi: "10.1000/test", source: "IEEE", originalUrl: null }]]),
      submissionMeta: new Map(),
      explicitShares: [
        makeShare({ kind: "PAPER", resourceId: paperId, title: "Transformer Survey" }),
        makeShare({ kind: "PAPER", resourceId: randomUUID(), sectionKey: `screening:${randomUUID()}`, title: "Screening packet" }),
        makeShare({ kind: "GAP", resourceId: gapId, title: "Lack of multi-center validation" }),
        makeShare({ kind: "MANUSCRIPT", resourceId: draftId, sectionKey: "methodology", title: "Approved Methodology" }),
        makeShare({ kind: "TASK", resourceId: randomUUID(), title: "Internal task" }),
        makeShare({ kind: "MILESTONE", resourceId: randomUUID(), title: "Milestone 1" }),
        makeShare({ kind: "CONTRIBUTION", resourceId: randomUUID(), title: "Credit claim" }),
        makeShare({ kind: "OVERVIEW", resourceId: PROJECT_A, title: "Project overview" }),
      ],
      reviewGrants: [],
    });

    expect(items).toHaveLength(3);
    expect(items.map(i => i.category).sort()).toEqual(["MANUSCRIPT_REPORT", "REFERENCE_PAPER", "RESEARCH_GAP"]);
    expect(items.some(i => i.resource.title === "Internal task")).toBe(false);
    expect(items.some(i => i.resource.title === "Screening packet")).toBe(false);
  });

  it("never deduplicates by title or filename and never merges identical resources across different projects", () => {
    const sharedPaperId = randomUUID();
    const subA = randomUUID();
    const subB = randomUUID();

    const items = aggregateAndDeduplicateResources({
      projects,
      peopleNames,
      paperMetadata: new Map(),
      submissionMeta: new Map(),
      explicitShares: [
        makeShare({ projectId: PROJECT_A, accessId: ACCESS_A, kind: "PAPER", resourceId: sharedPaperId, title: "Same Paper Title" }),
        makeShare({ projectId: PROJECT_B, accessId: ACCESS_B, kind: "PAPER", resourceId: sharedPaperId, title: "Same Paper Title" }),
      ],
      reviewGrants: [
        makeReviewGrant({
          projectId: PROJECT_A,
          accessId: ACCESS_A,
          submissionId: subA,
          submissionTitle: "Identical Draft Title",
          revisions: [{ revisionId: randomUUID(), revisionNumber: 1, originalFileName: "draft.pdf", contentType: "PDF", createdAt: "2026-11-20T00:00:00Z" }],
        }),
        makeReviewGrant({
          projectId: PROJECT_A,
          accessId: ACCESS_A,
          submissionId: subB,
          submissionTitle: "Identical Draft Title",
          revisions: [{ revisionId: randomUUID(), revisionNumber: 1, originalFileName: "draft.pdf", contentType: "PDF", createdAt: "2026-11-21T00:00:00Z" }],
        }),
      ],
    });

    expect(items).toHaveLength(4);
    expect(new Set(items.map(i => i.canonicalKey)).size).toBe(4);
    expect(canonicalResourceKey("PAPER", PROJECT_A, sharedPaperId)).not.toBe(canonicalResourceKey("PAPER", PROJECT_B, sharedPaperId));
  });

  it("groups multiple authorized versions of a submission, preserves multiple review requests, and merges explicit + review provenance without dropping independent grants", () => {
    const subId = randomUUID();
    const rev1 = randomUUID();
    const rev2 = randomUUID();
    const req1 = randomUUID();
    const req2 = randomUUID();

    const items = aggregateAndDeduplicateResources({
      projects,
      peopleNames,
      paperMetadata: new Map(),
      submissionMeta: new Map([[subId, { id: subId, projectId: PROJECT_A, title: "LumiGap Core Manuscript", submissionType: "RESEARCH_PAPER" }]]),
      explicitShares: [
        makeShare({
          id: "share-sub-1",
          kind: "SUBMISSION",
          resourceId: subId,
          title: "LumiGap Core Manuscript",
          createdAt: new Date("2026-11-18T10:00:00Z"),
        }),
      ],
      reviewGrants: [
        makeReviewGrant({
          requestId: req1,
          submissionId: subId,
          submissionTitle: "LumiGap Core Manuscript",
          requestStatus: "COMPLETED",
          createdAt: new Date("2026-11-19T10:00:00Z"),
          revisions: [
            { revisionId: rev1, revisionNumber: 1, originalFileName: "lumigap_v1.pdf", contentType: "PDF", createdAt: "2026-11-19T09:00:00Z", reviewRequestId: req1, reviewId: "hr-1", reviewStatus: "COMPLETED" },
          ],
        }),
        makeReviewGrant({
          requestId: req2,
          submissionId: subId,
          submissionTitle: "LumiGap Core Manuscript",
          requestStatus: "RESUBMITTED",
          createdAt: new Date("2026-11-24T10:00:00Z"),
          revisions: [
            { revisionId: rev1, revisionNumber: 1, originalFileName: "lumigap_v1.pdf", contentType: "PDF", createdAt: "2026-11-19T09:00:00Z", reviewRequestId: req2, reviewId: "hr-1", reviewStatus: "RESUBMITTED" },
            { revisionId: rev2, revisionNumber: 2, originalFileName: "lumigap_v2_revised.pdf", contentType: "PDF", createdAt: "2026-11-24T09:00:00Z", reviewRequestId: req2, reviewId: null, reviewStatus: "RESUBMITTED" },
          ],
        }),
      ],
    });

    expect(items).toHaveLength(1);
    const merged = items[0]!;
    expect(merged.sourceKinds).toEqual(["EXPLICIT_SHARE", "REVIEW_REQUEST"]);
    expect(merged.permissionMode).toBe("REVIEW_ASSIGNED");
    expect(merged.latestRevisionNumber).toBe(2);
    expect(merged.latestRevisionId).toBe(rev2);
    expect(merged.sharedVersionCount).toBe(2);
    expect(merged.versions?.map(v => v.revisionNumber)).toEqual([2, 1]);
    expect(merged.reviewRequests?.map(r => r.requestId)).toEqual([req2, req1]);
    expect(merged.originalFileName).toBe("lumigap_v2_revised.pdf");
  });

  it("filters by query (title, project, filename, author, DOI, doc type), computes pre-pagination category counts, sorts deterministically, and paginates", () => {
    const paperId = randomUUID();
    const planSubId = randomUUID();
    const proposalSubId = randomUUID();

    const aggregated = aggregateAndDeduplicateResources({
      projects,
      peopleNames,
      paperMetadata: new Map([
        [paperId, { authors: ["Tran Minh Khoa"], publicationYear: 2024, doi: "10.9999/clinical-ai", source: "Nature Digital Medicine", originalUrl: "https://doi.org/10.9999/clinical-ai" }],
      ]),
      submissionMeta: new Map(),
      explicitShares: [
        makeShare({ id: "p1", projectId: PROJECT_B, accessId: ACCESS_B, kind: "PAPER", resourceId: paperId, title: "Clinical Benchmark Paper", createdAt: new Date("2026-11-20T00:00:00Z") }),
        makeShare({ id: "g1", projectId: PROJECT_A, accessId: ACCESS_A, kind: "GAP", resourceId: randomUUID(), title: "Alpha Gap Opportunity", createdAt: new Date("2026-11-18T00:00:00Z") }),
      ],
      reviewGrants: [
        makeReviewGrant({
          projectId: PROJECT_A,
          accessId: ACCESS_A,
          submissionId: planSubId,
          submissionTitle: "Zeta Study Plan",
          submissionType: "RESEARCH_PLAN",
          createdAt: new Date("2026-11-25T00:00:00Z"),
          revisions: [{ revisionId: randomUUID(), revisionNumber: 1, originalFileName: "plan_2026.pdf", contentType: "PDF", createdAt: "2026-11-25T00:00:00Z" }],
        }),
        makeReviewGrant({
          projectId: PROJECT_A,
          accessId: ACCESS_A,
          submissionId: proposalSubId,
          submissionTitle: "Beta Proposal",
          submissionType: "RESEARCH_PROPOSAL",
          createdAt: new Date("2026-11-23T00:00:00Z"),
          revisions: [{ revisionId: randomUUID(), revisionNumber: 2, originalFileName: "proposal_v2_final.pdf", contentType: "PDF", createdAt: "2026-11-23T00:00:00Z" }],
        }),
      ],
    });

    // Category counts & unfilteredTotal before pagination
    const page1 = filterSortAndPaginateResources(aggregated, 1, { pageSize: 2, sort: "newest" });
    expect(page1.unfilteredTotal).toBe(4);
    expect(page1.total).toBe(4);
    expect(page1.hasNext).toBe(true);
    expect(page1.items.map(i => i.resource.title)).toEqual(["Zeta Study Plan", "Beta Proposal"]);
    expect(page1.categoryCounts).toEqual({
      ALL: 4,
      MANUSCRIPT_REPORT: 1,
      REFERENCE_PAPER: 1,
      RESEARCH_PLAN: 1,
      RESEARCH_GAP: 1,
    });
    expect(page1.projects.map(p => p.id)).toEqual([PROJECT_A, PROJECT_B]);

    // Oldest sort
    const oldest = filterSortAndPaginateResources(aggregated, 1, { sort: "oldest" });
    expect(oldest.items[0]?.resource.title).toBe("Alpha Gap Opportunity");

    // Title A-Z sort
    const byTitle = filterSortAndPaginateResources(aggregated, 1, { sort: "title" });
    expect(byTitle.items.map(i => i.resource.title)).toEqual([
      "Alpha Gap Opportunity",
      "Beta Proposal",
      "Clinical Benchmark Paper",
      "Zeta Study Plan",
    ]);

    // Search by filename, author, DOI, project, and Vietnamese doc type
    expect(filterSortAndPaginateResources(aggregated, 1, { q: "proposal_v2_final" }).items).toHaveLength(1);
    expect(filterSortAndPaginateResources(aggregated, 1, { q: "Tran Minh Khoa" }).items).toHaveLength(1);
    expect(filterSortAndPaginateResources(aggregated, 1, { q: "10.9999/clinical-ai" }).items).toHaveLength(1);
    expect(filterSortAndPaginateResources(aggregated, 1, { q: "Clinical Decision" }).items).toHaveLength(1);
    expect(filterSortAndPaginateResources(aggregated, 1, { q: "kế hoạch" }).items[0]?.category).toBe("RESEARCH_PLAN");
    expect(filterSortAndPaginateResources(aggregated, 1, { q: "%" }).total).toBe(0);

    // Category filter keeps categoryCounts for current project/q scope intact
    const onlyPlans = filterSortAndPaginateResources(aggregated, 1, { category: "RESEARCH_PLAN" });
    expect(onlyPlans.total).toBe(1);
    expect(onlyPlans.categoryCounts?.ALL).toBe(4);
    expect(onlyPlans.categoryCounts?.RESEARCH_PLAN).toBe(1);
  });

  it("validates inbox query schema strictly and rejects invalid params", () => {
    expect(mentorResourceInboxSchema.parse({ category: "MANUSCRIPT_REPORT", sort: "title" })).toMatchObject({
      page: 1,
      pageSize: 20,
      category: "MANUSCRIPT_REPORT",
      sort: "title",
    });
    expect(mentorResourceInboxSchema.safeParse({ category: "PRIVATE_TASKS" }).success).toBe(false);
    expect(mentorResourceInboxSchema.safeParse({ sort: "hacker" }).success).toBe(false);
    expect(mentorResourceInboxSchema.safeParse({ projectId: "not-a-uuid" }).success).toBe(false);
    expect(mentorResourceInboxSchema.safeParse({ actorId: randomUUID() }).success).toBe(false);
  });
});
