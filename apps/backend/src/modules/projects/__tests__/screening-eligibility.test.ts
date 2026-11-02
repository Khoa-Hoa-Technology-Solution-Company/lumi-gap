import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { checkProposerEligibility } from "../screening-slots.js";
import type { WorkspaceContext } from "../workspace-access.js";

describe("checkProposerEligibility — Proposer-Aware Reviewer Eligibility", () => {
  const paperId = randomUUID();
  const ownerId = randomUUID();
  const proposerId = randomUUID();
  const reviewerB = randomUUID();
  const reviewerC = randomUUID();
  const mentorId = randomUUID();

  function mockContext(auditException: Record<string, unknown> | null = null): WorkspaceContext {
    return {
      actorId: proposerId,
      role: "MEMBER",
      project: {
        id: randomUUID(),
        ownerId,
        status: "ACTIVE",
        title: "Test Project",
      },
      tx: {
        screeningAudit: {
          findFirst: vi.fn().mockResolvedValue(
            auditException
              ? {
                  id: randomUUID(),
                  type: "PROPOSER_EXCEPTION_GRANTED",
                  details: auditException,
                  createdAt: new Date(),
                }
              : null
          ),
        },
        projectPaper: {
          findUnique: vi.fn().mockResolvedValue({ addedById: proposerId }),
        },
      },
    } as unknown as WorkspaceContext;
  }

  it("non-proposers are always eligible regardless of team size", async () => {
    const c = mockContext();
    const people = [
      { id: proposerId, name: "Proposer A" },
      { id: reviewerB, name: "Member B" },
      { id: reviewerC, name: "Member C" },
    ];

    const result = await checkProposerEligibility(c, paperId, reviewerB, "round-1", people, proposerId);
    expect(result.eligible).toBe(true);
    expect(result.isProposer).toBe(false);
    expect(result.proposerExcluded).toBe(false);
    expect(result.otherEligibleCount).toBe(2);
  });

  it("proposer is excluded in a team of 3 or more eligible reviewers", async () => {
    const c = mockContext();
    const people = [
      { id: proposerId, name: "Proposer A" },
      { id: reviewerB, name: "Member B" },
      { id: reviewerC, name: "Member C" },
    ];

    const result = await checkProposerEligibility(c, paperId, proposerId, "round-1", people, proposerId);
    expect(result.eligible).toBe(false);
    expect(result.isProposer).toBe(true);
    expect(result.proposerExcluded).toBe(true);
    expect(result.smallTeam).toBe(false);
    expect(result.otherEligibleCount).toBe(2);
    expect(result.reason).toContain("Nhóm có từ 3 thành viên đủ điều kiện trở lên");
  });

  it("project owner is NOT exempt from proposer exclusion when other eligible count >= 2", async () => {
    const c = mockContext();
    // Owner is the proposer
    const people = [
      { id: ownerId, name: "Owner" },
      { id: reviewerB, name: "Member B" },
      { id: reviewerC, name: "Member C" },
    ];

    const result = await checkProposerEligibility(c, paperId, ownerId, "round-1", people, ownerId);
    expect(result.eligible).toBe(false);
    expect(result.isProposer).toBe(true);
    expect(result.proposerExcluded).toBe(true);
  });

  it("proposer remains eligible in a 2-member small team (proposer + 1 member)", async () => {
    const c = mockContext();
    const people = [
      { id: proposerId, name: "Proposer A" },
      { id: reviewerB, name: "Member B" },
    ];

    const result = await checkProposerEligibility(c, paperId, proposerId, "round-1", people, proposerId);
    expect(result.eligible).toBe(true);
    expect(result.isProposer).toBe(true);
    expect(result.proposerExcluded).toBe(false);
    expect(result.smallTeam).toBe(true);
    expect(result.otherEligibleCount).toBe(1);
  });

  it("proposer remains eligible in a solo project (1 eligible member)", async () => {
    const c = mockContext();
    const people = [{ id: proposerId, name: "Solo Researcher" }];

    const result = await checkProposerEligibility(c, paperId, proposerId, "round-1", people, proposerId);
    expect(result.eligible).toBe(true);
    expect(result.isProposer).toBe(true);
    expect(result.proposerExcluded).toBe(false);
    expect(result.smallTeam).toBe(true);
    expect(result.otherEligibleCount).toBe(0);
  });

  it("allows proposer to review when a documented exception is granted", async () => {
    const exceptionDetails = {
      proposerId,
      reason: "Thành viên B nghỉ ốm, chủ nhiệm phê duyệt ngoại lệ.",
      authorizerId: ownerId,
      authorizerName: "Chủ đề tài",
      grantedAt: new Date().toISOString(),
    };
    const c = mockContext(exceptionDetails);
    const people = [
      { id: proposerId, name: "Proposer A" },
      { id: reviewerB, name: "Member B" },
      { id: reviewerC, name: "Member C" },
    ];

    const result = await checkProposerEligibility(c, paperId, proposerId, "round-1", people, proposerId);
    expect(result.eligible).toBe(true);
    expect(result.isProposer).toBe(true);
    expect(result.proposerExcluded).toBe(false);
    expect(result.hasException).toBe(true);
    expect(result.exceptionDetails).toMatchObject(exceptionDetails);
  });
});
