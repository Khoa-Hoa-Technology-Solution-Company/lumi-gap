import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { auditService } from "../../audit/audit.service.js";
import { gapValidationService } from "../gap-validation.service.js";

describe.sequential("gap evidence and validation visibility (PostgreSQL)", () => {
  const marker = crypto.randomUUID();
  const prisma = getPrisma();
  let ownerId = "";
  let memberId = "";
  let strangerId = "";
  let projectId = "";
  let gapId = "";

  beforeAll(async () => {
    vi.spyOn(auditService, "log").mockResolvedValue(undefined);
    const [owner, member, stranger] = await Promise.all(
      ["owner", "member", "stranger"].map((name) =>
        prisma.user.create({ data: { fullName: `Gap access ${name}`, email: `gap-access-${name}-${marker}@example.test` } }),
      ),
    );
    ownerId = owner!.id;
    memberId = member!.id;
    strangerId = stranger!.id;

    const project = await prisma.project.create({ data: { title: `Gap access ${marker.slice(0, 8)}`, ownerId } });
    projectId = project.id;
    await prisma.projectMember.create({ data: { projectId, userId: memberId, status: "ACTIVE" } });

    const gap = await prisma.researchGap.create({
      data: {
        topic: `gap access ${marker}`,
        normalizedTopic: `gap access ${marker}`,
        title: "Gap visibility candidate",
        description: "Visibility test gap",
        rationale: "Visibility test rationale",
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
      await prisma.gapEvidenceRecord.deleteMany({ where: { gapId } });
      await prisma.gapValidation.deleteMany({ where: { gapId } });
      await prisma.researchGapPaper.deleteMany({ where: { gapId } });
      await prisma.researchGap.deleteMany({ where: { id: gapId } });
    }
    if (projectId) {
      await prisma.projectActivity.deleteMany({ where: { projectId } });
      await prisma.projectMember.deleteMany({ where: { projectId } });
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId, strangerId].filter(Boolean) } } });
    vi.restoreAllMocks();
  });

  it("hides the evidence of an UNDER_VALIDATION gap from a logged-in stranger", async () => {
    await expect(gapValidationService.getEvidence(gapId, strangerId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("hides the validations of an UNDER_VALIDATION gap from a logged-in stranger", async () => {
    await expect(gapValidationService.getValidations(gapId, strangerId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("shows the evidence and validations to the gap creator", async () => {
    await expect(gapValidationService.getEvidence(gapId, ownerId)).resolves.toEqual(expect.any(Array));
    await expect(gapValidationService.getValidations(gapId, ownerId)).resolves.toEqual(expect.any(Array));
  });

  it("shows the evidence and validations to an active project member", async () => {
    await expect(gapValidationService.getEvidence(gapId, memberId)).resolves.toEqual(expect.any(Array));
    await expect(gapValidationService.getValidations(gapId, memberId)).resolves.toEqual(expect.any(Array));
  });
});
