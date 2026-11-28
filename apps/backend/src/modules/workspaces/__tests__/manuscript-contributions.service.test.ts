import { beforeEach, describe, expect, it, vi } from "vitest";

const withWorkspace = vi.hoisted(() => vi.fn());
const workspacePeople = vi.hoisted(() => vi.fn());
const workContributionsSave = vi.hoisted(() => vi.fn());
const presentWorkContribution = vi.hoisted(() => vi.fn());
const readManuscriptAttribution = vi.hoisted(() => vi.fn());

vi.mock("../../projects/workspace-access.js", () => ({
  withWorkspace,
  jsonSnapshot: (v: unknown) => v,
  workspacePeople,
  workspacePerson: (map: Map<string, { id: string; name: string }>, id: string) =>
    map.get(id) ?? { id, name: `User ${id}` },
}));

vi.mock("../../projects/work-contributions.service.js", () => ({
  workContributionsService: { save: workContributionsSave },
  presentWorkContribution,
}));

vi.mock("../manuscript-attribution.service.js", () => ({
  readManuscriptAttribution,
}));

vi.mock("../../../infrastructure/queue/queue.js", () => ({
  getQueue: vi.fn(),
}));

import { manuscriptWritingService } from "../manuscript-writing.service.js";
import { manuscriptContributionsService } from "../manuscript-contributions.service.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const MANUSCRIPT_ID = "22222222-2222-4222-8222-222222222222";
const SNAPSHOT_ID = "33333333-3333-4333-8333-333333333333";
const REPORT_ID = "44444444-4444-4444-8444-444444444444";
const ALICE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAROL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FILE_MAIN_ID = "55555555-5555-4555-8555-555555555555";
const FILE_METHOD_ID = "66666666-6666-4666-8666-666666666666";

describe("manuscriptWritingService.contributionDraft (Phase 1 integrity fixes)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupWritingTx(overrides?: { existingDrafts?: unknown[]; sameReportDraft?: unknown }) {
    const tx = {
      draftWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: MANUSCRIPT_ID,
          projectId: PROJECT_ID,
          name: "Paper A",
          version: 4,
          archivedAt: null,
        }),
      },
      manuscriptWritingReport: {
        findFirst: vi.fn().mockResolvedValue({
          id: REPORT_ID,
          projectId: PROJECT_ID,
          workspaceId: MANUSCRIPT_ID,
          snapshotId: SNAPSHOT_ID,
          status: "COMPLETED",
          inputHash: "h".repeat(64),
          result: {
            algorithmVersion: "RETAINED_WRITING_V1",
            totalWords: 120,
            attributedWordUnits: 100000,
            unknownWordUnits: 20000,
            coverageBasisPoints: 8333,
            members: [
              { userId: ALICE_ID, name: "Alice", retainedWordUnits: 70000, overallBasisPoints: 5833, suggestedBasisPoints: 7000 },
              { userId: BOB_ID, name: "Bob", retainedWordUnits: 30000, overallBasisPoints: 2500, suggestedBasisPoints: 3000 },
            ],
            files: [],
          },
        }),
      },
      manuscriptSnapshot: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: SNAPSHOT_ID,
          sourceVersion: 3,
          label: "Snapshot v3",
          createdAt: new Date("2026-11-20T00:00:00Z"),
          manifest: { title: "Paper A", files: [] },
        }),
        findMany: vi.fn().mockResolvedValue([{ id: SNAPSHOT_ID }]),
      },
      projectContributionProposal: {
        findFirst: vi.fn().mockResolvedValue(overrides?.sameReportDraft ?? null),
        findMany: vi.fn().mockResolvedValue(overrides?.existingDrafts ?? []),
      },
    };
    withWorkspace.mockImplementation(async (_p, _a, _opts, fn) =>
      fn({ tx, project: { id: PROJECT_ID, status: "ACTIVE", ownerId: ALICE_ID }, actorId: ALICE_ID, role: "OWNER" }),
    );
    return tx;
  }

  it("never auto-assigns WRITING_ORIGINAL_DRAFT when creating a draft from a writing report", async () => {
    setupWritingTx();
    workContributionsSave.mockResolvedValue({ id: "draft-1", status: "DRAFT" });

    await manuscriptWritingService.contributionDraft(PROJECT_ID, ALICE_ID, MANUSCRIPT_ID, REPORT_ID);

    expect(workContributionsSave).toHaveBeenCalledOnce();
    const payload = workContributionsSave.mock.calls[0]![2];
    expect(payload.clientKey).toBe(REPORT_ID);
    expect(payload.participants).toEqual([
      { userId: ALICE_ID, roles: [] },
      { userId: BOB_ID, roles: [] },
    ]);
    expect(payload.evidenceRefs).toEqual([
      { kind: "MANUSCRIPT", id: MANUSCRIPT_ID },
      { kind: "MANUSCRIPT_SNAPSHOT", id: SNAPSHOT_ID },
    ]);
  });

  it("uses explicitly reviewed CRediT roles when supplied by the user", async () => {
    setupWritingTx();
    workContributionsSave.mockResolvedValue({ id: "draft-2", status: "DRAFT" });

    await manuscriptWritingService.contributionDraft(PROJECT_ID, ALICE_ID, MANUSCRIPT_ID, REPORT_ID, {
      participants: [
        { userId: ALICE_ID, roles: ["WRITING_REVIEW_EDITING", "METHODOLOGY"] },
        { userId: BOB_ID, roles: ["FORMAL_ANALYSIS"] },
      ],
    });

    const payload = workContributionsSave.mock.calls[0]![2];
    expect(payload.participants).toEqual([
      { userId: ALICE_ID, roles: ["WRITING_REVIEW_EDITING", "METHODOLOGY"] },
      { userId: BOB_ID, roles: ["FORMAL_ANALYSIS"] },
    ]);
  });

  it("prevents duplicate writing drafts across snapshots of the same manuscript unless confirmed", async () => {
    setupWritingTx({
      existingDrafts: [
        {
          id: "existing-draft",
          clientKey: "99999999-9999-4999-8999-999999999999",
          evidenceRefs: [{ kind: "MANUSCRIPT_SNAPSHOT", id: SNAPSHOT_ID }],
        },
      ],
    });

    await expect(
      manuscriptWritingService.contributionDraft(PROJECT_ID, ALICE_ID, MANUSCRIPT_ID, REPORT_ID),
    ).rejects.toThrow(/already exists/i);
    expect(workContributionsSave).not.toHaveBeenCalled();

    // Confirmed duplicate succeeds
    workContributionsSave.mockResolvedValue({ id: "draft-confirmed" });
    await manuscriptWritingService.contributionDraft(PROJECT_ID, ALICE_ID, MANUSCRIPT_ID, REPORT_ID, {
      confirmDuplicate: true,
    });
    expect(workContributionsSave).toHaveBeenCalledOnce();
  });

  it("preserves idempotency when called repeatedly with the same reportId", async () => {
    setupWritingTx({ sameReportDraft: { id: "same-draft" } });
    workContributionsSave.mockResolvedValue({ id: "same-draft" });

    const res = await manuscriptWritingService.contributionDraft(PROJECT_ID, ALICE_ID, MANUSCRIPT_ID, REPORT_ID);
    expect(res).toEqual({ id: "same-draft" });
    expect(workContributionsSave).toHaveBeenCalledOnce();
  });
});

describe("manuscriptContributionsService.summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes strictly to the manuscript, separates proposer vs resolver, keeps AI separate, sorts alphabetically, and surfaces actionable items", async () => {
    const people = new Map([
      [ALICE_ID, { id: ALICE_ID, name: "Alice Nguyen" }],
      [BOB_ID, { id: BOB_ID, name: "Bob Tran" }],
      [CAROL_ID, { id: CAROL_ID, name: "Carol Le" }],
    ]);
    workspacePeople.mockResolvedValue(people);

    const scopedProposal = {
      id: "prop-manuscript",
      projectId: PROJECT_ID,
      proposedById: BOB_ID,
      title: "Statistical validation & methodology",
      description: "Ran ablation experiments and verified statistical bounds for Section 4.",
      status: "SUBMITTED",
      version: 1,
      evidence: "Experiment notebook v2",
      evidenceRefs: [{ kind: "MANUSCRIPT", id: MANUSCRIPT_ID }],
      workDate: new Date("2026-11-21T00:00:00Z"),
      createdAt: new Date("2026-11-21T00:00:00Z"),
      updatedAt: new Date("2026-11-21T00:00:00Z"),
    };
    const unrelatedProposal = {
      id: "prop-other-manuscript",
      projectId: PROJECT_ID,
      proposedById: BOB_ID,
      title: "Unrelated paper work",
      description: "Belongs to another manuscript",
      status: "ACCEPTED",
      version: 1,
      evidence: "",
      evidenceRefs: [{ kind: "MANUSCRIPT", id: "99999999-9999-4999-8999-999999999999" }],
      workDate: new Date("2026-11-21T00:00:00Z"),
      createdAt: new Date("2026-11-21T00:00:00Z"),
      updatedAt: new Date("2026-11-21T00:00:00Z"),
    };

    presentWorkContribution.mockResolvedValue({
      id: scopedProposal.id,
      projectId: PROJECT_ID,
      title: scopedProposal.title,
      description: scopedProposal.description,
      category: "EXECUTION_VALIDATION",
      source: "MANUAL",
      workDate: "2026-11-21T00:00:00.000Z",
      version: 1,
      status: "SUBMITTED",
      createdBy: { id: BOB_ID, name: "Bob Tran" },
      participants: [
        { userId: CAROL_ID, name: "Carol Le", roles: ["FORMAL_ANALYSIS", "METHODOLOGY"] },
        { userId: ALICE_ID, name: "Alice Nguyen", roles: ["WRITING_REVIEW_EDITING"] },
      ],
      evidence: "Experiment notebook v2",
      evidenceRefs: [{ kind: "MANUSCRIPT", id: MANUSCRIPT_ID }],
      reviews: [],
      history: [],
      viewerId: ALICE_ID,
      reviewActions: ["ACKNOWLEDGE", "NEEDS_CHANGES", "DISPUTE", "INSUFFICIENT_INFORMATION"],
      canManage: false,
      readOnly: false,
      createdAt: "2026-11-21T00:00:00.000Z",
      updatedAt: "2026-11-21T00:00:00.000Z",
    });

    readManuscriptAttribution.mockResolvedValue({
      checkId: "check-1",
      status: "PENDING_CONFIRMATION",
      readyForInternalSubmission: false,
      viewerCanDecide: true,
      proposedAuthors: [{ userId: ALICE_ID, confirmed: false }],
      decisions: [],
    });

    const tx = {
      draftWorkspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: MANUSCRIPT_ID,
          projectId: PROJECT_ID,
          name: "Evidence Paper",
          version: 5,
          mainFileId: FILE_MAIN_ID,
          archivedAt: null,
        }),
      },
      manuscriptFile: {
        findMany: vi.fn().mockResolvedValue([
          { id: FILE_MAIN_ID, path: "main.tex", kind: "TEXT", createdById: ALICE_ID, createdAt: new Date("2026-11-18T00:00:00Z") },
          { id: FILE_METHOD_ID, path: "sections/method.tex", kind: "TEXT", createdById: BOB_ID, createdAt: new Date("2026-11-19T00:00:00Z") },
        ]),
      },
      manuscriptSnapshot: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: SNAPSHOT_ID,
            label: "v3 milestone",
            sourceVersion: 3,
            createdById: ALICE_ID,
            createdAt: new Date("2026-11-20T00:00:00Z"),
            manifest: { title: "Evidence Paper", files: [] },
          },
        ]),
      },
      projectMember: {
        findMany: vi.fn().mockResolvedValue([
          { userId: BOB_ID, status: "ACTIVE" },
          { userId: CAROL_ID, status: "REMOVED" }, // former member preserved!
        ]),
      },
      mentorRelationship: { findMany: vi.fn().mockResolvedValue([]) },
      manuscriptWritingReport: {
        findFirst: vi.fn().mockResolvedValue({
          id: REPORT_ID,
          workspaceId: MANUSCRIPT_ID,
          snapshotId: SNAPSHOT_ID,
          status: "COMPLETED",
          createdAt: new Date("2026-11-20T01:00:00Z"),
          calculatedAt: new Date("2026-11-20T01:01:00Z"),
          inputHash: "a".repeat(64),
          result: {
            algorithmVersion: "RETAINED_WRITING_V1",
            totalWords: 500,
            attributedWordUnits: 450000,
            unknownWordUnits: 50000,
            coverageBasisPoints: 9000,
            // Bob has MORE words than Alice — alphabetical order must still put Alice first!
            members: [
              { userId: BOB_ID, name: "Bob Tran", retainedWordUnits: 400000, overallBasisPoints: 8000, suggestedBasisPoints: 8889 },
              { userId: ALICE_ID, name: "Alice Nguyen", retainedWordUnits: 50000, overallBasisPoints: 1000, suggestedBasisPoints: 1111 },
            ],
            files: [{ id: FILE_MAIN_ID, path: "main.tex", totalWords: 500, unknownWordUnits: 50000 }],
          },
        }),
      },
      manuscriptSuggestion: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "sug-1",
            fileId: FILE_METHOD_ID,
            authorId: BOB_ID, // proposer
            resolvedById: ALICE_ID, // acceptor/reviewer
            status: "ACCEPTED",
            createdAt: new Date("2026-11-21T02:00:00Z"),
            resolvedAt: new Date("2026-11-21T03:00:00Z"),
          },
        ]),
      },
      aiRun: { count: vi.fn().mockResolvedValue(4) },
      manuscriptAiAcceptance: {
        findMany: vi.fn().mockResolvedValue([
          { id: "ai-acc-1", fileId: FILE_MAIN_ID, acceptedById: ALICE_ID, createdAt: new Date("2026-11-21T04:00:00Z") },
        ]),
      },
      projectActivity: { count: vi.fn().mockResolvedValue(1) },
      projectContributionProposal: {
        findMany: vi.fn().mockResolvedValue([scopedProposal, unrelatedProposal]),
      },
      manuscriptUpdate: {
        groupBy: vi.fn().mockResolvedValue([
          { fileId: FILE_MAIN_ID, actorId: BOB_ID, _count: { id: 12 }, _max: { createdAt: new Date("2026-11-21T05:00:00Z") } },
        ]),
      },
      projectDiscussion: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "disc-1",
            authorId: ALICE_ID,
            status: "OPEN",
            context: { fileId: FILE_METHOD_ID },
            mentorRelationshipId: null,
            createdAt: new Date("2026-11-21T06:00:00Z"),
          },
        ]),
      },
      submissionRevision: { findMany: vi.fn().mockResolvedValue([]) },
      contributionParticipant: { findMany: vi.fn().mockResolvedValue([]) },
      contributionReview: { findMany: vi.fn().mockResolvedValue([]) },
    };

    withWorkspace.mockImplementation(async (_p, _a, _opts, fn) =>
      fn({ tx, project: { id: PROJECT_ID, status: "ACTIVE", ownerId: ALICE_ID }, actorId: ALICE_ID, role: "OWNER" }),
    );

    const summary = await manuscriptContributionsService.summary(PROJECT_ID, ALICE_ID, MANUSCRIPT_ID);

    // 1. Strict scoping: unrelated manuscript proposal excluded
    expect(summary.declarations).toHaveLength(1);
    expect(summary.declarations[0]!.id).toBe("prop-manuscript");

    // 2. Stale version detection (draft v5 vs snapshot v3)
    expect(summary.latestSnapshot?.isStale).toBe(true);
    expect(summary.latestWritingReport?.isStale).toBe(true);

    // 3. Alphabetical order (Alice, Bob, Carol — NOT sorted by word count where Bob > Alice)
    expect(summary.contributors.map(c => c.name)).toEqual(["Alice Nguyen", "Bob Tran", "Carol Le"]);

    // 4. Former member with scientific non-writing contribution (0 edits) preserved
    const carol = summary.contributors.find(c => c.userId === CAROL_ID)!;
    expect(carol.membershipStatus).toBe("FORMER");
    expect(carol.declaredRoles).toEqual(["FORMAL_ANALYSIS", "METHODOLOGY"]);
    expect(carol.activity.fileEditsCount).toBe(0);

    // 5. Track Changes proposer (Bob) vs reviewer/acceptor (Alice) distinguished
    const bob = summary.contributors.find(c => c.userId === BOB_ID)!;
    const alice = summary.contributors.find(c => c.userId === ALICE_ID)!;
    expect(bob.activity.suggestionsProposed).toBe(1);
    expect(bob.activity.suggestionsAcceptedAsAuthor).toBe(1);
    expect(bob.activity.suggestionsResolvedAsReviewer).toBe(0);
    expect(alice.activity.suggestionsProposed).toBe(0);
    expect(alice.activity.suggestionsResolvedAsReviewer).toBe(1);

    // 6. File-level evidence distinguishes proposer vs resolver & AI acceptance count
    const methodFile = summary.files.find(f => f.fileId === FILE_METHOD_ID)!;
    expect(methodFile.granularity).toBe("FILE_LEVEL");
    expect(methodFile.suggestions.proposers.map(p => p.id)).toEqual([BOB_ID]);
    expect(methodFile.suggestions.resolvers.map(p => p.id)).toEqual([ALICE_ID]);
    expect(methodFile.comments.open).toBe(1);

    // 7. AI receipts tracked separately, AI never appears in human contributors
    expect(summary.aiReceipts.totalRuns).toBe(4);
    expect(summary.aiReceipts.acceptedEditsCount).toBe(1);
    expect(summary.aiReceipts.externalDeclarationsCount).toBe(1);
    expect(summary.contributors.some(c => c.name.toLowerCase().includes("ai"))).toBe(false);

    // 8. Actionable viewer declarations surfaced
    expect(summary.viewerActionableDeclarations).toHaveLength(1);
    expect(summary.attributionCheck?.viewerCanDecide).toBe(true);
  });

  it("rejects access when the manuscript does not exist in the project", async () => {
    const tx = {
      draftWorkspace: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    withWorkspace.mockImplementation(async (_p, _a, _opts, fn) =>
      fn({ tx, project: { id: PROJECT_ID, status: "ACTIVE", ownerId: ALICE_ID }, actorId: ALICE_ID, role: "OWNER" }),
    );

    await expect(
      manuscriptContributionsService.summary(PROJECT_ID, ALICE_ID, MANUSCRIPT_ID),
    ).rejects.toThrow(/Manuscript not found/i);
  });
});
