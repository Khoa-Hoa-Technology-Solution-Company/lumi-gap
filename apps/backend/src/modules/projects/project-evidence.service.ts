import { invalidateSourceAssessments } from "./gap-revision.js";
import type { EvidenceContent, ExtractionSuggestion, PaperAiAnalysis, PlanQuestion, ProjectEvidence, SaveProjectEvidence } from "@trend/shared-types";
import { createHash } from "node:crypto";
import { RAG_INDEX_VERSION, sourceFingerprint } from "../knowledge/knowledge.text.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace, workspaceRevision, workspaceEvent, expectWorkspaceVersion, assertWorkspaceRetry, jsonSnapshot, type WorkspaceContext } from "./workspace-access.js";

export async function researchPaper(context: WorkspaceContext, paperId: string) {
  const link = await context.tx.projectPaper.findUnique({ where: { projectId_paperId: { projectId: context.project.id, paperId } } });
  if (!link) throw AppError.notFound("Project source not found");
  return link;
}
export async function evidenceItem(context: WorkspaceContext, id: string) {
  const row = await context.tx.projectEvidenceItem.findFirst({ where: { id, projectId: context.project.id } });
  if (!row) throw AppError.notFound("Evidence item not found");
  return row;
}
export async function discoveryEvidenceIsCurrent(context: WorkspaceContext, row: { paperId: string; sourceSnapshot: unknown }) {
  const snapshot = row.sourceSnapshot as { analysisId?: string; sourceFingerprint?: string; contentHash?: string };
  if (!snapshot.analysisId) return true;
  await context.tx.$queryRaw`SELECT id FROM papers WHERE id = ${row.paperId}::uuid FOR SHARE`;
  await context.tx.$queryRaw`SELECT id FROM paper_documents WHERE paper_id = ${row.paperId}::uuid FOR SHARE`;
  const [paper, document] = await Promise.all([
    context.tx.paper.findUnique({ where: { id: row.paperId } }),
    context.tx.paperDocument.findUnique({ where: { paperId: row.paperId } }),
  ]);
  return Boolean(paper?.dataStatus === "active" && document?.status === "ready" && snapshot.sourceFingerprint === sourceFingerprint(paper) && document.sourceHash === snapshot.sourceFingerprint && document.contentHash === snapshot.contentHash);
}
export async function reviewEvidenceInContext(context: WorkspaceContext, id: string, input: { expectedVersion: number; state: "ACCEPTED" | "REJECTED"; rationale: string }) {
  const row = await evidenceItem(context, id); expectWorkspaceVersion(row.version, input.expectedVersion);
  const link = await researchPaper(context, row.paperId);
  if (input.state === "ACCEPTED" && link.screeningStatus !== "INCLUDED") throw AppError.conflict("The source is no longer included in this project's synthesis");
  if (input.state === "ACCEPTED" && !await discoveryEvidenceIsCurrent(context, row)) throw AppError.conflict("The analyzed source changed. Run a new analysis before accepting this extraction");
  await invalidateSourceAssessments(context.tx, context.project.id, context.actorId, { evidenceItemId: id });
  const next = await context.tx.projectEvidenceItem.update({ where: { id }, data: { reviewState: input.state, reviewRationale: input.rationale, reviewedById: context.actorId, reviewedAt: new Date(), version: { increment: 1 } } });
  await workspaceRevision(context, "EXTRACTION", next); await workspaceEvent(context, "EVIDENCE_REVIEWED", "EXTRACTION", id, { state: input.state }); return next;
}
export const projectEvidenceService = {
  async suggestions(projectId: string, actorId: string, paperId: string) {
    return withWorkspace(projectId, actorId, {}, async context => {
      await researchPaper(context, paperId);
      const corpora = await context.tx.literatureCorpus.findMany({ where: { projectId: context.project.id }, select: { id: true } });
      const rows = await context.tx.corpusPaper.findMany({ where: { paperId, included: true, corpusId: { in: corpora.map(row => row.id) } }, orderBy: { id: "asc" }, take: 20 });
      const suggestions: ExtractionSuggestion[] = rows.flatMap(row => {
        const raw = row.evidence as Record<string, unknown> | null;
        const field = (key: string) => typeof raw?.[key] === "string" ? raw[key].slice(0, 5000) : "";
        if (!field("findings")) return [];
        return [{ corpusPaperId: row.id, paperId, content: { claim: field("findings"), quotation: "", locator: "", context: field("context"), methodology: field("methodology"), population: field("population") || field("dataset"), results: field("outcome"), limitations: field("limitations"), themes: [] }, provenance: "CORPUS_EXTRACTION_UNREVIEWED" as const }];
      });
      const paper = await context.tx.paper.findUniqueOrThrow({ where: { id: paperId } });
      const document = await context.tx.paperDocument.findUnique({ where: { paperId } });
      const analysis = paper.aiAnalysis as unknown as PaperAiAnalysis | null;
      if (analysis && Array.isArray(analysis.findings) && document?.status === "ready" && document.indexVersion === RAG_INDEX_VERSION && document.sourceHash === sourceFingerprint(paper)) {
        const analysisHash = createHash("sha256").update(JSON.stringify(paper.aiAnalysis)).digest("hex");
        for (const claim of analysis.findings.slice(0, 8)) if (typeof claim === "string") suggestions.push({ paperId, analysisHash, provenance: "PAPER_ANALYSIS_UNREVIEWED",
          content: { claim: claim.slice(0, 5000), quotation: "", locator: "", context: "", methodology: analysis.methods ?? "", population: analysis.dataset ?? "", results: claim.slice(0, 5000), limitations: (analysis.limitations ?? []).join("\n"), themes: (analysis.keyTerms ?? []).slice(0, 12) } });
      }
      return suggestions;
    });
  },
  async list(projectId: string, actorId: string, query: { page: number; pageSize: number; q: string; state?: string; itemId?: string }) {
    return withWorkspace(projectId, actorId, {}, async ({ tx, project }) => {
      let itemId = query.itemId;
      if (itemId && !await tx.projectEvidenceItem.findFirst({ where: { id: itemId, projectId: project.id }, select: { id: true } })) {
        const legacy = await tx.gapEvidenceRecord.findUnique({ where: { id: itemId } });
        if (!legacy || !await tx.researchGap.findFirst({ where: { id: legacy.gapId, projectId: project.id }, select: { id: true } })) throw AppError.notFound("Evidence item not found");
        if (!legacy.evidenceItemId) return { items: [], total: 0, page: 1, pageSize: query.pageSize, hasNext: false, legacyGapId: legacy.gapId };
        itemId = legacy.evidenceItemId;
      }
      const where = { projectId: project.id, ...(itemId ? { id: itemId } : {}), ...(query.state ? { reviewState: query.state } : {}), ...(query.q ? { OR: [{ claim: { contains: query.q, mode: "insensitive" as const } }, { methodology: { contains: query.q, mode: "insensitive" as const } }, { context: { contains: query.q, mode: "insensitive" as const } }, { themes: { has: query.q } }] } : {}) };
      const [rows, total] = await Promise.all([tx.projectEvidenceItem.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), tx.projectEvidenceItem.count({ where })]);
      const papers = await tx.paper.findMany({ where: { id: { in: rows.map(row => row.paperId) } }, select: { id: true, title: true } });
      const plan = await tx.researchPlan.findUnique({ where: { projectId: project.id }, select: { questions: true } });
      const questions = (Array.isArray(plan?.questions) ? plan.questions : []) as unknown as PlanQuestion[];
      const revisions = await tx.projectWorkspaceRevision.findMany({ where: { projectId: project.id, entityKind: "EXTRACTION", entityId: { in: rows.map(row => row.id) } }, select: { id: true, entityId: true } });
      const gapLinks = await tx.gapEvidenceRecord.findMany({ where: { evidenceItemId: { in: rows.map(row => row.id) } }, select: { evidenceItemId: true, gapId: true } });
      const gaps = await tx.researchGap.findMany({ where: { id: { in: gapLinks.map(link => link.gapId) }, projectId: project.id }, select: { id: true, title: true } });
      return { items: rows.map(row => ({ ...row, relatedGaps: gaps.filter(gap => gapLinks.some(link => link.evidenceItemId === row.id && link.gapId === gap.id)), relatedQuestions: questions.filter(question => question.sourceEvidenceRevisionIds?.some(id => revisions.some(revision => revision.id === id && revision.entityId === row.id))).map(question => ({ id: question.id, text: question.text })), sourceTitle: papers.find(paper => paper.id === row.paperId)?.title ?? "" } as unknown as ProjectEvidence)), total, page: query.page, pageSize: query.pageSize, hasNext: query.page * query.pageSize < total };
    });
  },
  async create(projectId: string, actorId: string, input: SaveProjectEvidence) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const { tx, project } = context;
      const prior = await tx.projectEvidenceItem.findUnique({ where: { projectId_extractedById_clientKey: { projectId: project.id, extractedById: context.actorId, clientKey: input.clientKey } } });
      if (prior) { await assertWorkspaceRetry(context, "EXTRACTION", prior.id, input); return prior; }
      const link = await researchPaper(context, input.paperId);
      if (link.screeningStatus !== "INCLUDED") throw AppError.badRequest("Include the paper before extracting synthesis evidence");
      const paper = await tx.paper.findUniqueOrThrow({ where: { id: input.paperId } });
      const source: Record<string, unknown> = { paperId: paper.id, title: paper.title, doi: paper.doi, publicationYear: paper.publicationYear, screeningStatus: link.screeningStatus, screenedAt: link.screenedAt?.toISOString() ?? null, quoteCheckedAgainstIndexedSource: false };
      if (input.sourceChunkId) {
        const chunk = await tx.paperChunk.findUnique({ where: { id: input.sourceChunkId }, include: { document: true } });
        if (!chunk || chunk.document.paperId !== paper.id || !input.quotation || !chunk.text.includes(input.quotation)) throw AppError.badRequest("The quotation must match the selected source chunk");
        Object.assign(source, { chunkId: chunk.id, chunkHash: chunk.contentHash, sourceText: chunk.text, documentHash: chunk.document.contentHash, pageNumber: chunk.pageNumber, quoteCheckedAgainstIndexedSource: true });
      } else if (input.quotation && paper.abstractText?.includes(input.quotation)) {
        Object.assign(source, { sourceKind: "ABSTRACT", sourceText: paper.abstractText, contentHash: createHash("sha256").update(paper.abstractText).digest("hex"), quoteCheckedAgainstIndexedSource: true });
      }
      if (input.origin === "AI_SUGGESTED" && !input.corpusPaperId && !input.analysisHash) throw AppError.badRequest("Choose an existing project extraction suggestion");
      if (input.analysisHash) {
        const document = await tx.paperDocument.findUnique({ where: { paperId: paper.id } });
        if (input.origin !== "AI_SUGGESTED" || !paper.aiAnalysis || createHash("sha256").update(JSON.stringify(paper.aiAnalysis)).digest("hex") !== input.analysisHash || document?.status !== "ready" || document.indexVersion !== RAG_INDEX_VERSION || document.sourceHash !== sourceFingerprint(paper)) throw AppError.conflict("Paper analysis changed. Reload the suggestion before saving");
        Object.assign(source, { analysisHash: input.analysisHash, originalSuggestion: paper.aiAnalysis });
      }
      if (input.corpusPaperId) {
        const corpusPaper = await tx.corpusPaper.findUnique({ where: { id: input.corpusPaperId } });
        const corpus = corpusPaper ? await tx.literatureCorpus.findUnique({ where: { id: corpusPaper.corpusId } }) : null;
        if (!corpusPaper || corpus?.projectId !== project.id || corpusPaper.paperId !== input.paperId || input.origin !== "AI_SUGGESTED") throw AppError.badRequest("Choose an extraction suggestion from this project source");
        Object.assign(source, { corpusPaperId: corpusPaper.id, originalSuggestion: corpusPaper.evidence });
      }
      const { clientKey, paperId, origin, sourceChunkId: _chunk, corpusPaperId: _corpus, analysisHash: _analysis, ...content } = input;
      const row = await tx.projectEvidenceItem.create({ data: { ...content, projectId: project.id, paperId, origin, clientKey, extractedById: context.actorId, sourceSnapshot: jsonSnapshot(source) } });
      await workspaceRevision(context, "EXTRACTION", row, input);
      await workspaceEvent(context, "EVIDENCE_EXTRACTED", "EXTRACTION", row.id);
      return row;
    });
  },
  async update(projectId: string, actorId: string, id: string, input: EvidenceContent & { expectedVersion: number }) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const row = await evidenceItem(context, id); expectWorkspaceVersion(row.version, input.expectedVersion);
      const { expectedVersion: _version, ...content } = input;
      // The original source snapshot and origin are immutable even when the interpretation is corrected.
      const source = row.sourceSnapshot as Record<string, unknown>;
      await invalidateSourceAssessments(context.tx, context.project.id, context.actorId, { evidenceItemId: id });
      const next = await context.tx.projectEvidenceItem.update({ where: { id }, data: { ...content, sourceSnapshot: jsonSnapshot({ ...source, quoteCheckedAgainstIndexedSource: Boolean(content.quotation && typeof source.sourceText === "string" && source.sourceText.includes(content.quotation)) }), reviewState: "PENDING", reviewRationale: "", reviewedById: null, reviewedAt: null, version: { increment: 1 } } });
      await workspaceRevision(context, "EXTRACTION", next); await workspaceEvent(context, "EVIDENCE_REVISED", "EXTRACTION", id);
      return next;
    });
  },
  async review(projectId: string, actorId: string, id: string, input: { expectedVersion: number; state: "ACCEPTED" | "REJECTED"; rationale: string }) {
    return withWorkspace(projectId, actorId, { write: true }, context => reviewEvidenceInContext(context, id, input));
  },
  async history(projectId: string, actorId: string, id: string) {
    return withWorkspace(projectId, actorId, {}, async context => { await evidenceItem(context, id); return context.tx.projectWorkspaceRevision.findMany({ where: { projectId: context.project.id, entityKind: "EXTRACTION", entityId: id }, orderBy: { version: "desc" }, take: 100 }); });
  },
};
