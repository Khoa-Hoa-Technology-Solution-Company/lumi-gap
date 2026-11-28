import { beforeEach, describe, expect, it, vi } from "vitest";

const withResearchContributions = vi.hoisted(() => vi.fn());

vi.mock("../research-contribution-projection.js", () => ({
  withResearchContributions,
}));

vi.mock("../../../infrastructure/database/prisma.js", () => ({
  getPrisma: vi.fn(),
}));

import { workContributionsService } from "../work-contributions.service.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MENTOR_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("workContributionsService.summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupTx({
    role = "MEMBER" as "OWNER" | "MEMBER" | null,
    actorId = USER_A,
    projectStatus = "ACTIVE",
    ownIds = [] as string[],
    proposals = [] as Array<{ id: string; status: string; version: number; source: string; proposedById: string }>,
    participants = [] as Array<{ proposalId: string; userId: string }>,
    reviews = [] as Array<{ proposalId: string; version: number; userId: string; decision: string }>,
  }) {
    const tx = {
      contributionParticipant: {
        findMany: vi.fn().mockImplementation(async (args: { where?: { userId?: string } }) => {
          if (args?.where?.userId) return ownIds.map(proposalId => ({ proposalId }));
          return participants;
        }),
      },
      projectContributionProposal: {
        findMany: vi.fn().mockResolvedValue(proposals),
      },
      contributionReview: {
        findMany: vi.fn().mockResolvedValue(reviews),
      },
    };
    withResearchContributions.mockImplementation(async (_p, _a, fn) =>
      fn({ tx, project: { id: PROJECT_ID, status: projectStatus, ownerId: OWNER_ID }, actorId, role }),
    );
    return tx;
  }

  it("distinguishes independently acknowledged records from self-recorded and pending records without double counting", async () => {
    const proposals = [
      // 1. Independently acknowledged by peer USER_B (outside named participant USER_A) at current version 2
      { id: "p1", status: "ACCEPTED", version: 2, source: "WORKSPACE", proposedById: OWNER_ID },
      // 2. Self-recorded (must NOT count as independentlyAcknowledged!)
      { id: "p2", status: "SELF_RECORDED", version: 1, source: "MANUAL", proposedById: OWNER_ID },
      // 3. Submitted, waiting on named participant USER_A (peer USER_B already accepted!)
      { id: "p3", status: "SUBMITTED", version: 1, source: "WORKSPACE", proposedById: OWNER_ID },
      // 4. Submitted, waiting on named participant USER_A (peer USER_B already accepted!)
      { id: "p4", status: "SUBMITTED", version: 1, source: "MANUAL", proposedById: OWNER_ID },
    ];
    const participants = [
      { proposalId: "p1", userId: USER_A },
      { proposalId: "p2", userId: OWNER_ID },
      { proposalId: "p3", userId: USER_A },
      { proposalId: "p4", userId: USER_A },
    ];
    const reviews = [
      { proposalId: "p1", version: 2, userId: USER_A, decision: "ACKNOWLEDGE" },
      { proposalId: "p1", version: 2, userId: USER_B, decision: "ACCEPT" },
      { proposalId: "p3", version: 1, userId: USER_B, decision: "ACCEPT" },
      { proposalId: "p4", version: 1, userId: USER_B, decision: "ACCEPT" },
    ];

    // User A sees 4 records, 1 independently verified, and 2 pending for A
    setupTx({ actorId: USER_A, role: "MEMBER", proposals, participants, reviews });
    const summaryA = await workContributionsService.summary(PROJECT_ID, USER_A);
    expect(summaryA).toEqual({
      totalRecords: 4,
      independentlyAcknowledged: 1,
      pendingForViewer: 2,
    });

    // User B (who already reviewed p3/p4 as independent peer) sees 0 pending for B
    setupTx({ actorId: USER_B, role: "MEMBER", proposals, participants, reviews });
    const summaryB = await workContributionsService.summary(PROJECT_ID, USER_B);
    expect(summaryB).toEqual({
      totalRecords: 4,
      independentlyAcknowledged: 1,
      pendingForViewer: 0,
    });

    // Owner (creator of p3/p4) sees 0 pending for Owner
    setupTx({ actorId: OWNER_ID, role: "OWNER", proposals, participants, reviews });
    const summaryOwner = await workContributionsService.summary(PROJECT_ID, OWNER_ID);
    expect(summaryOwner).toEqual({
      totalRecords: 4,
      independentlyAcknowledged: 1,
      pendingForViewer: 0,
    });
  });

  it("never asks mentors to peer-review unrelated team contributions and scopes to their own records", async () => {
    const mentorOwnProposal = {
      id: "p-mentor",
      status: "SUBMITTED",
      version: 1,
      source: "WORKSPACE",
      proposedById: OWNER_ID,
    };
    setupTx({
      actorId: MENTOR_ID,
      role: null,
      ownIds: ["p-mentor"],
      proposals: [mentorOwnProposal],
      participants: [{ proposalId: "p-mentor", userId: MENTOR_ID }],
      reviews: [],
    });

    const summary = await workContributionsService.summary(PROJECT_ID, MENTOR_ID);
    expect(summary).toEqual({
      totalRecords: 1,
      independentlyAcknowledged: 0,
      pendingForViewer: 1,
    });

    // Mentor who is NOT named on a team submitted proposal sees 0 pending
    setupTx({
      actorId: MENTOR_ID,
      role: null,
      ownIds: [],
      proposals: [],
      participants: [],
      reviews: [],
    });
    const emptyMentorSummary = await workContributionsService.summary(PROJECT_ID, MENTOR_ID);
    expect(emptyMentorSummary).toEqual({
      totalRecords: 0,
      independentlyAcknowledged: 0,
      pendingForViewer: 0,
    });
  });

  it("returns pendingForViewer = 0 for archived projects", async () => {
    setupTx({
      actorId: USER_A,
      role: "MEMBER",
      projectStatus: "ARCHIVED",
      proposals: [{ id: "p1", status: "SUBMITTED", version: 1, source: "WORKSPACE", proposedById: OWNER_ID }],
      participants: [{ proposalId: "p1", userId: USER_A }],
      reviews: [],
    });

    const summary = await workContributionsService.summary(PROJECT_ID, USER_A);
    expect(summary).toEqual({
      totalRecords: 1,
      independentlyAcknowledged: 0,
      pendingForViewer: 0,
    });
  });
});
