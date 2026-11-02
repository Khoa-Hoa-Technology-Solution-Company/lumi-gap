import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { classifyScreeningPair, screeningConsensus } from "../screening.calculator.js";
import { rankedCandidates } from "../screening-case-context.js";
import type { WorkspaceContext } from "../workspace-access.js";
import type { ScreeningRound, ScreeningAdjudicationCase } from "../../../generated/prisma/client.js";

const caseRow = { id: randomUUID() } as ScreeningAdjudicationCase;
async function singleCandidate(c: WorkspaceContext, row: ScreeningRound) {
  const candidates = await rankedCandidates(c, row, caseRow);
  return candidates.length === 1 ? candidates[0] : null;
}

describe("Scientific Paper Disagreement Resolution & Adjudication Policy", () => {
  const projectId = randomUUID();
  const paperId = randomUUID();
  const ownerId = randomUUID();
  const reviewerA = randomUUID();
  const reviewerB = randomUUID();
  const mentorId = randomUUID();
  const memberC = randomUUID();

  describe("Disagreement Detection & Consensus Rules", () => {
    it("two opposing reviews (INCLUDE vs EXCLUDE) create a CONFLICT", () => {
      const reviews = [
        { roundId: "r1", reviewerId: reviewerA, decision: "INCLUDE" as const, exclusionReason: "" },
        { roundId: "r1", reviewerId: reviewerB, decision: "EXCLUDE" as const, exclusionReason: "Out of scope" },
      ];
      const classification = classifyScreeningPair(reviews, "TITLE_ABSTRACT", true);
      expect(classification).toBe("CONFLICT");

      const consensus = screeningConsensus(["INCLUDE", "EXCLUDE"], 2, 2, "UNANIMOUS");
      expect(consensus).toBe("NEEDS_RESOLUTION");
    });

    it("INCLUDE vs UNSURE creates NEEDS_CLARIFICATION", () => {
      const reviews = [
        { roundId: "r1", reviewerId: reviewerA, decision: "INCLUDE" as const, exclusionReason: "" },
        { roundId: "r1", reviewerId: reviewerB, decision: "UNSURE" as const, exclusionReason: "" },
      ];
      const classification = classifyScreeningPair(reviews, "TITLE_ABSTRACT", true);
      expect(classification).toBe("NEEDS_CLARIFICATION");

      const consensus = screeningConsensus(["INCLUDE", "UNSURE"], 2, 2, "UNANIMOUS");
      expect(consensus).toBe("NEEDS_RESOLUTION");
    });

    it("two matching reviews (INCLUDE vs INCLUDE) resolve automatically as consensus", () => {
      const reviews = [
        { roundId: "r1", reviewerId: reviewerA, decision: "INCLUDE" as const, exclusionReason: "" },
        { roundId: "r1", reviewerId: reviewerB, decision: "INCLUDE" as const, exclusionReason: "" },
      ];
      const classification = classifyScreeningPair(reviews, "TITLE_ABSTRACT", true);
      expect(classification).toBe("AGREEMENT_INCLUDE");

      const consensus = screeningConsensus(["INCLUDE", "INCLUDE"], 2, 2, "UNANIMOUS");
      expect(consensus).toBe("INCLUDED");
    });

    it("two matching reviews (EXCLUDE vs EXCLUDE) resolve as EXCLUDED", () => {
      const reviews = [
        { roundId: "r1", reviewerId: reviewerA, decision: "EXCLUDE" as const, exclusionReason: "Not peer reviewed" },
        { roundId: "r1", reviewerId: reviewerB, decision: "EXCLUDE" as const, exclusionReason: "Not peer reviewed" },
      ];
      const classification = classifyScreeningPair(reviews, "TITLE_ABSTRACT", true);
      expect(classification).toBe("AGREEMENT_EXCLUDE");

      const consensus = screeningConsensus(["EXCLUDE", "EXCLUDE"], 2, 2, "UNANIMOUS");
      expect(consensus).toBe("EXCLUDED");
    });

    it("post-discussion reassessment: changing EXCLUDE to INCLUDE converts CONFLICT into AGREEMENT_INCLUDE", () => {
      // Initially in conflict: Reviewer A is INCLUDE, Reviewer B is EXCLUDE
      const initialReviews = [
        { roundId: "r1", reviewerId: reviewerA, decision: "INCLUDE" as const, exclusionReason: "" },
        { roundId: "r1", reviewerId: reviewerB, decision: "EXCLUDE" as const, exclusionReason: "Lý do cũ" },
      ];
      expect(classifyScreeningPair(initialReviews, "TITLE_ABSTRACT", true)).toBe("CONFLICT");

      // Reviewer B discusses and reassesses to INCLUDE
      const revisedReviews = [
        { roundId: "r1", reviewerId: reviewerA, decision: "INCLUDE" as const, exclusionReason: "" },
        { roundId: "r1", reviewerId: reviewerB, decision: "INCLUDE" as const, exclusionReason: "" },
      ];
      expect(classifyScreeningPair(revisedReviews, "TITLE_ABSTRACT", true)).toBe("AGREEMENT_INCLUDE");
      expect(screeningConsensus(["INCLUDE", "INCLUDE"], 2, 2, "UNANIMOUS")).toBe("INCLUDED");
    });

    it("post-discussion reassessment: changing INCLUDE to EXCLUDE converts CONFLICT into AGREEMENT_EXCLUDE", () => {
      // Reviewer A reassesses to EXCLUDE with same exclusion reason
      const revisedReviews = [
        { roundId: "r1", reviewerId: reviewerA, decision: "EXCLUDE" as const, exclusionReason: "Not peer reviewed" },
        { roundId: "r1", reviewerId: reviewerB, decision: "EXCLUDE" as const, exclusionReason: "Not peer reviewed" },
      ];
      expect(classifyScreeningPair(revisedReviews, "TITLE_ABSTRACT", true)).toBe("AGREEMENT_EXCLUDE");
      expect(screeningConsensus(["EXCLUDE", "EXCLUDE"], 2, 2, "UNANIMOUS")).toBe("EXCLUDED");
    });
  });

  describe("Deterministic Adjudicator Selection Policy", () => {
    function mockAdjudicationContext(
      poolUsers: Array<{ id: string; fullName: string }>,
      mentors: string[],
      activeReviewers: string[],
      proposerId: string,
      authorizedIds: string[] = []
    ): { c: WorkspaceContext; row: ScreeningRound } {
      const row = {
        id: "round-1",
        projectId,
        paperId,
        phase: "TITLE_ABSTRACT",
        status: "NEEDS_RESOLUTION",
        settings: {
          authorizedAdjudicatorIds: authorizedIds,
          requiredReviewers: 2,
        },
      } as unknown as ScreeningRound;

      const c = {
        actorId: reviewerA,
        role: "MEMBER",
        project: { id: projectId, ownerId, status: "ACTIVE" },
        tx: {
          screeningAdjudicationInvitation: { findMany: vi.fn().mockResolvedValue([]) },
          mentorshipRequest: { findMany: vi.fn().mockResolvedValue(mentors.map(id => ({ id: `request-${id}`, mentorRole: "PRIMARY" }))) },
          projectMember: {
            findMany: vi.fn().mockResolvedValue(
              poolUsers.filter(u => u.id !== ownerId && !mentors.includes(u.id)).map(u => ({ userId: u.id }))
            ),
          },
          mentorAccess: {
            findMany: vi.fn().mockResolvedValue(
              mentors.map(mId => ({ id: `access-${mId}`, requestId: `request-${mId}`, mentorUserId: mId, revokedAt: null, permissions: ["PAPERS_VIEW", "PAPERS_COMMENT"] }))
            ),
          },
          user: {
            findMany: vi.fn().mockResolvedValue(
              poolUsers.map(u => ({ id: u.id, fullName: u.fullName, isActive: true, accountStatus: "ACTIVE", emailVerifiedAt: new Date() }))
            ),
          },
          screeningAssignment: {
            findMany: vi.fn().mockResolvedValue(activeReviewers.map(rId => ({ reviewerId: rId }))),
          },
          projectPaper: {
            findUniqueOrThrow: vi.fn().mockResolvedValue({ addedById: proposerId }),
          },
        },
      } as unknown as WorkspaceContext;

      return { c, row };
    }

    it("priority 1: selects qualified accepted mentor over project members and owner", async () => {
      const { c, row } = mockAdjudicationContext(
        [
          { id: ownerId, fullName: "Project Owner" },
          { id: reviewerA, fullName: "Reviewer A" },
          { id: reviewerB, fullName: "Reviewer B" },
          { id: memberC, fullName: "Independent Member C" },
          { id: mentorId, fullName: "Mentor Dr. Nguyen" },
        ],
        [mentorId],
        [reviewerA, reviewerB],
        reviewerA
      );

      const adjudicator = await singleCandidate(c, row);
      expect(adjudicator).not.toBeNull();
      expect(adjudicator?.id).toBe(mentorId);
      expect(adjudicator?.mentor).toBe(true);
    });

    it("priority 2: selects independent project member when no mentor is available", async () => {
      const { c, row } = mockAdjudicationContext(
        [
          { id: ownerId, fullName: "Project Owner" },
          { id: reviewerA, fullName: "Reviewer A" },
          { id: reviewerB, fullName: "Reviewer B" },
          { id: memberC, fullName: "Independent Member C" },
        ],
        [],
        [reviewerA, reviewerB],
        reviewerA
      );

      const adjudicator = await singleCandidate(c, row);
      expect(adjudicator).not.toBeNull();
      expect(adjudicator?.id).toBe(memberC);
      expect(adjudicator?.mentor).toBe(false);
      expect(adjudicator?.proposer).toBe(false);
    });

    it("priority 3: selects owner if owner is not one of the two disputing reviewers", async () => {
      const { c, row } = mockAdjudicationContext(
        [
          { id: ownerId, fullName: "Project Owner" },
          { id: reviewerA, fullName: "Reviewer A" },
          { id: reviewerB, fullName: "Reviewer B" },
        ],
        [],
        [reviewerA, reviewerB],
        reviewerA
      );

      const adjudicator = await singleCandidate(c, row);
      expect(adjudicator).not.toBeNull();
      expect(adjudicator?.id).toBe(ownerId);
    });

    it("original reviewers can never serve as independent adjudicator for their own conflict", async () => {
      const { c, row } = mockAdjudicationContext(
        [
          { id: ownerId, fullName: "Project Owner (Reviewer A)" },
          { id: reviewerB, fullName: "Reviewer B" },
        ],
        [],
        [ownerId, reviewerB],
        reviewerB
      );

      const adjudicator = await singleCandidate(c, row);
      expect(adjudicator).toBeNull();
    });

    it("respects project policy authorizedAdjudicatorIds whitelist when configured", async () => {
      const { c, row } = mockAdjudicationContext(
        [
          { id: ownerId, fullName: "Project Owner" },
          { id: reviewerA, fullName: "Reviewer A" },
          { id: reviewerB, fullName: "Reviewer B" },
          { id: memberC, fullName: "Independent Member C" },
          { id: mentorId, fullName: "Mentor Dr. Nguyen" },
        ],
        [mentorId],
        [reviewerA, reviewerB],
        reviewerA,
        [memberC] // Only memberC is authorized
      );

      const adjudicator = await singleCandidate(c, row);
      expect(adjudicator).not.toBeNull();
      expect(adjudicator?.id).toBe(memberC);
    });
  });
});
