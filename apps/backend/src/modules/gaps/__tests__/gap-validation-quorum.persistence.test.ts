import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { env } from "../../../config/env.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { auditService } from "../../audit/audit.service.js";
import { gapValidationService } from "../gap-validation.service.js";

describe.sequential("gap expert validation quorum (PostgreSQL)", () => {
  const marker = crypto.randomUUID();
  const prisma = getPrisma();
  let ownerId = "";
  let expertOneId = "";
  let expertTwoId = "";
  let projectId = "";
  let gapId = "";

  const statusOf = async () => (await prisma.researchGap.findUniqueOrThrow({ where: { id: gapId } })).validationStatus;
  const decide = (expertId: string, action: "VALIDATE" | "CHALLENGE") =>
    gapValidationService.addValidation(gapId, expertId, { action, comment: `Quorum test decision ${action}` });

  beforeAll(async () => {
    vi.spyOn(auditService, "log").mockResolvedValue(undefined);
    const [owner, expertOne, expertTwo] = await Promise.all(
      ["owner", "expert-one", "expert-two"].map((name) =>
        prisma.user.create({ data: { fullName: `Quorum ${name}`, email: `gap-quorum-${name}-${marker}@example.test`, emailVerifiedAt: new Date() } }),
      ),
    );
    ownerId = owner!.id;
    expertOneId = expertOne!.id;
    expertTwoId = expertTwo!.id;
    await prisma.userCapability.createMany({
      data: [expertOneId, expertTwoId].map((userId) => ({ userId, capability: "GAP_VALIDATION", source: "test" })),
    });

    const project = await prisma.project.create({ data: { title: `Gap quorum ${marker.slice(0, 8)}`, ownerId } });
    projectId = project.id;
    const gap = await prisma.researchGap.create({
      data: {
        topic: `gap quorum ${marker}`,
        normalizedTopic: `gap quorum ${marker}`,
        title: "Gap quorum candidate",
        description: "Quorum test gap",
        rationale: "Quorum test rationale",
        source: "standalone",
        userId: ownerId,
        projectId,
        validationStatus: "UNDER_VALIDATION",
      },
    });
    gapId = gap.id;
  });

  afterAll(async () => {
    if (gapId) {
      await prisma.gapValidation.deleteMany({ where: { gapId } });
      await prisma.researchGapPaper.deleteMany({ where: { gapId } });
      await prisma.researchGap.deleteMany({ where: { id: gapId } });
    }
    if (projectId) {
      await prisma.projectActivity.deleteMany({ where: { projectId } });
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    const userIds = [ownerId, expertOneId, expertTwoId].filter(Boolean);
    await prisma.userCapability.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    vi.restoreAllMocks();
  });

  it("uses a quorum of two experts by default", () => {
    expect(env.GAP_VALIDATION_QUORUM).toBe(2);
  });

  it("keeps the gap under validation after the first expert validates, and validates it after the second", async () => {
    await decide(expertOneId, "VALIDATE");
    expect(await statusOf()).toBe("UNDER_VALIDATION");

    await decide(expertTwoId, "VALIDATE");
    expect(await statusOf()).toBe("VALIDATED");
  });

  it("records the status change in the project activity only when the status really changed", async () => {
    const activities = await prisma.projectActivity.findMany({ where: { projectId, type: "GAP_STATUS_CHANGED" }, orderBy: { createdAt: "asc" } });
    // The first decision left the status unchanged, so only the second one logs a change.
    expect(activities).toHaveLength(1);
    expect(activities[0]!.metadata).toMatchObject({ from: "UNDER_VALIDATION", to: "VALIDATED" });
  });

  it("refuses a late decision once the gap reached a final status", async () => {
    await expect(decide(expertOneId, "CHALLENGE")).rejects.toMatchObject({ statusCode: 409 });
    expect(await statusOf()).toBe("VALIDATED");
  });
});
