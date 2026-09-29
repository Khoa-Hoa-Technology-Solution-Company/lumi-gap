import type { AddCorpusPaperRequest, CreateLiteratureCorpusRequest, EvidenceMapBucket } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";

function whereId(value: string) {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.badRequest("Invalid identifier");
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}
async function resolveUser(value: string) { const row = await getPrisma().user.findUnique({ where: whereId(value), select: { id: true } }); if (!row) throw AppError.notFound("User not found"); return row.id; }
async function resolveProject(value: string) { const row = await getPrisma().project.findUnique({ where: whereId(value) }); if (!row) throw AppError.notFound("Project not found"); return row; }
async function resolvePaper(value: string) { const row = await getPrisma().paper.findUnique({ where: whereId(value) }); if (!row) throw AppError.notFound("Paper not found in the LumiGap corpus"); return row; }

async function canAccessProject(projectId: string, userId: string) {
  const project = await getPrisma().project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  if (project.ownerId === userId) return true;
  const membership = await getPrisma().projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  return membership?.status === "ACTIVE";
}

async function accessibleCorpus(corpusId: string, userIdInput: string) {
  const [userId, corpus] = await Promise.all([resolveUser(userIdInput), getPrisma().literatureCorpus.findUnique({ where: whereId(corpusId) })]);
  if (!corpus) throw AppError.notFound("Literature corpus not found");
  if (corpus.ownerId === userId || (corpus.projectId && await canAccessProject(corpus.projectId, userId))) return { corpus, userId };
  throw AppError.forbidden("Access denied to this literature corpus");
}

function bucket(values: Array<string | number | undefined>): EvidenceMapBucket[] {
  const counts = new Map<string, number>();
  for (const raw of values) { const value = String(raw ?? "").trim(); if (value) counts.set(value, (counts.get(value) ?? 0) + 1); }
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function present<T extends { id: string; legacyMongoId?: string | null }>(row: T) { return { ...row, id: publicDatabaseId(row), _id: publicDatabaseId(row) }; }

export const literatureService = {
  async list(userIdInput: string) {
    const userId = await resolveUser(userIdInput);
    const memberships = await getPrisma().projectMember.findMany({ where: { userId, status: "ACTIVE" }, select: { projectId: true } });
    const ownedProjects = await getPrisma().project.findMany({ where: { ownerId: userId }, select: { id: true } });
    const projectIds = [...new Set([...memberships.map((row) => row.projectId), ...ownedProjects.map((row) => row.id)])];
    const corpora = await getPrisma().literatureCorpus.findMany({ where: { OR: [{ ownerId: userId }, { projectId: { in: projectIds } }] }, orderBy: { updatedAt: "desc" } });
    const counts = await getPrisma().corpusPaper.groupBy({ by: ["corpusId"], where: { corpusId: { in: corpora.map((row) => row.id) } }, _count: { _all: true } });
    const byCorpus = new Map(counts.map((row) => [row.corpusId, row._count._all]));
    return corpora.map((corpus) => ({ ...present(corpus), paperCount: byCorpus.get(corpus.id) ?? 0 }));
  },

  async create(userIdInput: string, input: CreateLiteratureCorpusRequest) {
    const userId = await resolveUser(userIdInput);
    let projectId: string | undefined;
    if (input.projectId) {
      const project = await resolveProject(input.projectId);
      if (!await canAccessProject(project.id, userId)) throw AppError.forbidden("Project membership is required");
      projectId = project.id;
    }
    const corpus = await getPrisma().literatureCorpus.create({ data: {
      ownerId: userId, projectId, name: input.name, topic: input.topic, researchGoal: input.researchGoal,
      domain: input.domain, keywords: input.keywords ?? [], picoc: (input.picoc ?? {}) as never,
      searchStrategy: input.searchStrategy,
    } });
    await auditService.log("literature.corpus.created", { userId: userIdInput, targetTableName: "literature_corpora", targetRecordId: corpus.id, details: { projectId: input.projectId, topic: input.topic } });
    return present(corpus);
  },

  async detail(corpusId: string, userId: string) {
    const { corpus } = await accessibleCorpus(corpusId, userId);
    const rows = await getPrisma().corpusPaper.findMany({ where: { corpusId: corpus.id }, orderBy: { createdAt: "desc" } });
    const papers = await getPrisma().paper.findMany({ where: { id: { in: rows.map((row) => row.paperId) } }, select: { id: true, legacyMongoId: true, title: true, publicationYear: true, journalName: true, doi: true } });
    const byId = new Map(papers.map((paper) => [paper.id, present(paper)]));
    return { corpus: present(corpus), papers: rows.map((row) => ({ ...present(row), paperId: byId.get(row.paperId) })) };
  },

  async addPaper(corpusId: string, userIdInput: string, input: AddCorpusPaperRequest) {
    const [{ corpus, userId }, paper] = await Promise.all([accessibleCorpus(corpusId, userIdInput), resolvePaper(input.paperId)]);
    if (paper.dataStatus !== "active") throw AppError.notFound("Paper not found in the LumiGap corpus");
    try {
      const record = await getPrisma().$transaction(async (tx) => {
        const created = await tx.corpusPaper.create({ data: { corpusId: corpus.id, paperId: paper.id, addedById: userId, included: input.included, exclusionReason: input.exclusionReason, evidence: (input.evidence ?? {}) as never } });
        await tx.literatureCorpus.update({ where: { id: corpus.id }, data: { status: "ACTIVE" } });
        return created;
      });
      await auditService.log("literature.paper.added", { userId: userIdInput, targetTableName: "corpus_papers", targetRecordId: record.id, details: { corpusId, paperId: input.paperId, included: input.included } });
      return present(record);
    } catch (error) { if ((error as { code?: string }).code === "P2002") throw AppError.conflict("This paper is already in the literature corpus"); throw error; }
  },

  async removePaper(corpusId: string, paperIdInput: string, userId: string) {
    const [{ corpus }, paper] = await Promise.all([accessibleCorpus(corpusId, userId), resolvePaper(paperIdInput)]);
    const result = await getPrisma().corpusPaper.deleteMany({ where: { corpusId: corpus.id, paperId: paper.id } });
    if (!result.count) throw AppError.notFound("Corpus paper not found");
    await auditService.log("literature.paper.removed", { userId, targetTableName: "corpus_papers", targetRecordId: paperIdInput, details: { corpusId } });
  },

  async evidenceMap(corpusId: string, userId: string) {
    const { corpus } = await accessibleCorpus(corpusId, userId);
    const rows = await getPrisma().corpusPaper.findMany({ where: { corpusId: corpus.id, included: true } });
    const papers = await getPrisma().paper.findMany({ where: { id: { in: rows.map((row) => row.paperId) } }, select: { id: true, publicationYear: true } });
    const years = new Map(papers.map((paper) => [paper.id, paper.publicationYear]));
    const evidence = rows.map((row) => (row.evidence && typeof row.evidence === "object" ? row.evidence as Record<string, string> : {}));
    return { corpusId: publicDatabaseId(corpus), includedPaperCount: rows.length, dimensions: {
      methodology: bucket(evidence.map((item) => item.methodology)), context: bucket(evidence.map((item) => item.context)),
      outcome: bucket(evidence.map((item) => item.outcome)), researchType: bucket(evidence.map((item) => item.researchType)),
      year: bucket(rows.map((row) => years.get(row.paperId))),
    } };
  },
};
