import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "../../../infrastructure/database/prisma.js";
import { createProjectFixture } from "../../../test-utils/project-fixture.js";
import { auditService } from "../../audit/audit.service.js";
import { gapValidationService } from "../gap-validation.service.js";

describe.sequential("gap evidence kinds (PostgreSQL)", () => {
  const marker = crypto.randomUUID();
  const prisma = getPrisma();
  const paperIds: string[] = [];
  let ownerId = "";
  let projectId = "";
  let corpusId = "";
  let gapId = "";

  const linkKinds = async (paperId: string) =>
    (await prisma.researchGapPaper.findMany({ where: { gapId, paperId } })).map((link) => link.kind).sort();

  async function includedPaperWithEvidence(title: string) {
    const paper = await prisma.paper.create({ data: { title: `${title} ${marker}`, abstractText: "abstract", publicationYear: 2024, primaryProvider: "user", dataStatus: "active" } });
    paperIds.push(paper.id);
    await prisma.projectPaper.create({ data: { projectId, paperId: paper.id, screeningStatus: "INCLUDED", addedById: ownerId } });
    await prisma.corpusPaper.create({ data: { corpusId, paperId: paper.id, included: true, addedById: ownerId, evidence: { limitations: "Only one institution was studied." } } });
    return paper.id;
  }

  const add = (paperId: string, evidenceKind: "SUPPORTING" | "COUNTER") =>
    gapValidationService.addEvidence(gapId, ownerId, { paperId, evidenceKind, evidenceType: "LIMITATION", excerpt: "Only one institution was studied.", explanation: "Linked in a test." });

  beforeAll(async () => {
    vi.spyOn(auditService, "log").mockResolvedValue(undefined);
    const owner = await prisma.user.create({ data: { fullName: "Evidence owner", email: `gap-evidence-kind-${marker}@example.test`, emailVerifiedAt: new Date() } });
    ownerId = owner.id;
    const project = await createProjectFixture({ data: { title: `Gap evidence ${marker.slice(0, 8)}`, ownerId } });
    projectId = project.id;
    const corpus = await prisma.literatureCorpus.create({ data: { ownerId, projectId, name: `Gap evidence corpus ${marker.slice(0, 8)}`, topic: "Gap evidence" } });
    corpusId = corpus.id;
    const gap = await prisma.researchGap.create({
      data: { topic: `gap evidence ${marker}`, normalizedTopic: `gap evidence ${marker}`, title: "Gap evidence candidate", description: "d", rationale: "r", source: "standalone", userId: ownerId, projectId, validationStatus: "CANDIDATE" },
    });
    gapId = gap.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (gapId) {
      await prisma.gapEvidenceRecord.deleteMany({ where: { gapId } });
      await prisma.researchGapPaper.deleteMany({ where: { gapId } });
      await prisma.researchGap.deleteMany({ where: { id: gapId } });
    }
    if (corpusId) {
      await prisma.corpusPaper.deleteMany({ where: { corpusId } });
      await prisma.literatureCorpus.deleteMany({ where: { id: corpusId } });
    }
    if (projectId) {
      await prisma.projectWorkspaceRevision.deleteMany({ where: { projectId } });
      await prisma.projectActivity.deleteMany({ where: { projectId } });
      await prisma.projectPaper.deleteMany({ where: { projectId } });
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    await prisma.paper.deleteMany({ where: { id: { in: paperIds } } });
    if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
  });

  it("stores counter-evidence with kind 'counter', not 'evidence'", async () => {
    const paperId = await includedPaperWithEvidence("Counter paper");

    await add(paperId, "COUNTER");

    expect(await linkKinds(paperId)).toEqual(["counter"]);
  });

  it("stores supporting evidence with kind 'supporting'", async () => {
    const paperId = await includedPaperWithEvidence("Supporting paper");

    await add(paperId, "SUPPORTING");

    expect(await linkKinds(paperId)).toEqual(["supporting"]);
  });
});
