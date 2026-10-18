import { lockProjectAccounts, assertActiveProjectAccount } from "../projects/project-transaction.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { env } from "../../config/env.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import type { GapValidationQueueItem, QuestionFacets } from "@trend/shared-types";
import { auditService } from "../audit/audit.service.js";
import { capabilityService } from "../authorization/capability.service.js";
import { structuredEvidenceItems } from "./structured-evidence.js";
import { findGapCorpusPaper } from "./gap-corpus.js";
import { canViewGapValidation, gapValidationConflict, OPEN_FOR_VALIDATION, resolveValidationStatus, type GapValidationViewer } from "./gap-validation.rules.js";
import type { Prisma, ResearchGap } from "../../generated/prisma/client.js";
import { requireCurrentProjectMembership } from "../authorization/project-membership.js";
import { withWorkspace } from "../projects/workspace-access.js";
import { recordGapPacket } from "../projects/gap-revision.js";

type GapCandidateInput = { topic: string; projectId?: string; corpusId?: string; title: string; gapType: string; scope?: string; establishedKnowledge: string; observedLimitation: string; missingEvidence: string; significanceExplanation: string; suggestedResearchQuestion?: string; questionFacets?: QuestionFacets; gapConfidence: "LOW" | "MODERATE" | "HIGH"; researchPriority: "LOW" | "MODERATE" | "HIGH" };
function whereId(value: string) { const parsed = parseDatabaseId(value); if (!parsed) throw AppError.badRequest("Invalid identifier"); return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }; }
function present<T extends { id: string; legacyMongoId?: string | null }>(row: T) { return { ...row, id: publicDatabaseId(row), _id: publicDatabaseId(row) }; }
async function user(value: string) { const row = await getPrisma().user.findUnique({ where: whereId(value) }); if (!row) throw AppError.notFound("User not found"); return row; }
async function gap(value: string) { const row = await getPrisma().researchGap.findUnique({ where: whereId(value) }); if (!row) throw AppError.notFound("Research gap candidate not found"); return row; }
async function project(value: string) { const row = await getPrisma().project.findUnique({ where: whereId(value) }); if (!row) throw AppError.notFound("Project not found"); return row; }
async function corpus(value: string) { const row = await getPrisma().literatureCorpus.findUnique({ where: whereId(value) }); if (!row) throw AppError.notFound("Literature corpus not found"); return row; }
async function paper(value: string) { const row = await getPrisma().paper.findUnique({ where: whereId(value) }); if (!row) throw AppError.badRequest("Evidence paper does not exist in the LumiGap corpus"); return row; }
async function accessProject(projectId: string, userId: string, options: { allowArchived?: boolean } = {}) { const row = await getPrisma().project.findUnique({ where: { id: projectId } }); if (!row || (row.status === "ARCHIVED" && !options.allowArchived)) return false; if (row.ownerId === userId) return true; const member = await getPrisma().projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } }); return member?.status === "ACTIVE"; }
async function ownedGap(gapId: string, userIdInput: string) {
  const [row, owner] = await Promise.all([gap(gapId), user(userIdInput)]);
  if (row.projectId) await requireCurrentProjectMembership(row.projectId, owner.id, true);
  else if (row.userId !== owner.id) throw AppError.notFound("Research gap candidate not found");
  return { row, owner };
}
async function gapWrite<T>(row: ResearchGap, actorId: string, run: (tx: Prisma.TransactionClient) => Promise<T>) {
  const locked = async (tx: Prisma.TransactionClient) => { await tx.$queryRaw`SELECT id FROM research_gaps WHERE id=${row.id}::uuid FOR UPDATE`; return run(tx); };
  return row.projectId ? withWorkspace(row.projectId, actorId, { write: true }, context => locked(context.tx)) : getPrisma().$transaction(locked);
}
/** Who the viewer is relative to a gap: its creator, a member of its project, and/or a verified expert. */
async function validationViewer(row: { userId: string; projectId: string | null }, viewerId: string): Promise<GapValidationViewer> {
  const [projectMember, viewer, capabilities] = await Promise.all([
    row.projectId ? accessProject(row.projectId, viewerId, { allowArchived: true }) : Promise.resolve(false),
    getPrisma().user.findUnique({ where: { id: viewerId }, select: { accountStatus: true } }),
    capabilityService.list(viewerId),
  ]);
  return { isCreator: row.userId === viewerId && (!row.projectId || projectMember), isProjectMember: projectMember, isExpert: viewer?.accountStatus === "ACTIVE" && capabilities.includes("GAP_VALIDATION") };
}
async function assertExpert(userIdInput: string) { const owner = await user(userIdInput); const [profile, capabilities] = await Promise.all([getPrisma().academicProfile.findUnique({ where: { userId: owner.id } }), capabilityService.list(owner.id)]); if (owner.accountStatus !== "ACTIVE" || !capabilities.includes("GAP_VALIDATION")) throw AppError.forbidden("Verified academic identity and GAP_VALIDATION capability are required"); return { owner, profile }; }

export const gapValidationService = {
  /**
   * Gaps waiting for an expert decision. Excludes the expert's own gaps and gaps of projects they belong to
   * (conflict of interest); never exposes the project itself.
   */
  async listValidationQueue(userIdInput: string, query: { page: number; pageSize: number }): Promise<{ items: GapValidationQueueItem[]; total: number }> {
    const { owner } = await assertExpert(userIdInput); const prisma = getPrisma();
    const [owned, memberships] = await Promise.all([prisma.project.findMany({ where: { ownerId: owner.id }, select: { id: true } }), prisma.projectMember.findMany({ where: { userId: owner.id, status: "ACTIVE" }, select: { projectId: true } })]);
    const ownProjectIds = [...new Set([...owned.map((row) => row.id), ...memberships.map((row) => row.projectId)])];
    const where = { validationStatus: { in: [...OPEN_FOR_VALIDATION] }, status: "active", userId: { not: owner.id }, OR: [{ projectId: null }, { projectId: { notIn: ownProjectIds } }] };
    const [rows, total] = await Promise.all([prisma.researchGap.findMany({ where, orderBy: { updatedAt: "asc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.researchGap.count({ where })]);
    const ids = rows.map((row) => row.id);
    const [evidenceCounts, validationCounts, mine] = await Promise.all([
      prisma.gapEvidenceRecord.groupBy({ by: ["gapId"], where: { gapId: { in: ids } }, _count: { _all: true } }),
      prisma.gapValidation.groupBy({ by: ["gapId", "gapVersion"], where: { gapId: { in: ids } }, _count: { _all: true } }),
      prisma.gapValidation.findMany({ where: { gapId: { in: ids }, reviewerId: owner.id }, select: { gapId: true, gapVersion: true } }),
    ]);
    const evidenceBy = new Map(evidenceCounts.map((row) => [row.gapId, row._count._all])), validationsBy = new Map(validationCounts.map((row) => [`${row.gapId}:${row.gapVersion}`, row._count._all])), reviewed = new Set(mine.map((row) => `${row.gapId}:${row.gapVersion}`));
    return { total, items: rows.map((row) => ({ id: publicDatabaseId(row), version: row.version, topic: row.topic, title: row.title, description: row.description, gapType: row.gapType ?? undefined, scope: row.scope ?? undefined, establishedKnowledge: row.establishedKnowledge ?? undefined, observedLimitation: row.observedLimitation ?? undefined, missingEvidence: row.missingEvidence ?? undefined, significanceExplanation: row.significanceExplanation ?? undefined, suggestedResearchQuestion: row.suggestedResearchQuestion ?? undefined, validationStatus: row.validationStatus, gapConfidence: row.gapConfidence, researchPriority: row.researchPriority, origin: row.origin, evidenceCount: evidenceBy.get(row.id) ?? 0, validationCount: validationsBy.get(`${row.id}:${row.version}`) ?? 0, reviewedByMe: reviewed.has(`${row.id}:${row.version}`), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }) as GapValidationQueueItem) };
  },

  async createCandidate(userIdInput: string, input: GapCandidateInput) {
    const owner = await user(userIdInput); let projectId: string | undefined; let corpusId: string | undefined;
    if (input.projectId) { const row = await project(input.projectId); if (!await accessProject(row.id, owner.id)) throw AppError.forbidden("Project membership is required"); projectId = row.id; }
    if (input.corpusId) { const row = await corpus(input.corpusId); if (row.projectId ? !await accessProject(row.projectId, owner.id) : row.ownerId !== owner.id) throw AppError.forbidden("Access denied to this literature corpus"); if (projectId && row.projectId !== projectId) throw AppError.badRequest("The literature corpus does not belong to the selected project"); projectId ??= row.projectId ?? undefined; corpusId = row.id; }
    // Legacy numeric field is not a scientific confidence estimate for human proposals.
    const numericConfidence = 0;
    const create = async (tx: Prisma.TransactionClient) => {
      const row = await tx.researchGap.create({ data: { topic: input.topic, normalizedTopic: input.topic.trim().toLocaleLowerCase(), title: input.title, description: input.observedLimitation, rationale: input.significanceExplanation, userId: owner.id, projectId, corpusId, source: "standalone", origin: "HUMAN", gapType: input.gapType, scope: input.scope, establishedKnowledge: input.establishedKnowledge, observedLimitation: input.observedLimitation, missingEvidence: input.missingEvidence, significanceExplanation: input.significanceExplanation, suggestedResearchQuestion: input.suggestedResearchQuestion, questionFacets: input.questionFacets && Object.keys(input.questionFacets).length ? input.questionFacets as never : undefined, validationStatus: "CANDIDATE", gapConfidence: input.gapConfidence, researchPriority: input.researchPriority, confidence: numericConfidence } });
      if (projectId) await tx.projectActivity.create({ data: { projectId, actorId: owner.id, type: "GAP_CREATED", entityKind: "GAP", entityId: publicDatabaseId(row), metadata: { title: row.title, status: "CANDIDATE" } } });
      return row;
    };
    const created = projectId ? await withWorkspace(projectId, owner.id, { write: true }, context => create(context.tx)) : await getPrisma().$transaction(create);
    await auditService.log("research_gap.candidate.created", { userId: userIdInput, targetTableName: "research_gaps", targetRecordId: created.id, details: { gapType: input.gapType, origin: "HUMAN" } }); return present(created);
  },
  async requestValidation(gapId: string, userIdInput: string) {
    const { row, owner } = await ownedGap(gapId, userIdInput);
    const updated = await gapWrite(row, owner.id, async tx => {
      if (row.projectId) {
        const p = await tx.project.findUniqueOrThrow({ where: { id: row.projectId } });
        if (p.ownerId !== owner.id) throw AppError.forbidden("Only the project owner can share private gap evidence with external experts");
      }
      await recordGapPacket(tx, row.id, owner.id);
      const changed = await tx.researchGap.updateMany({ where: { id: row.id, validationStatus: { in: ["DRAFT", "CANDIDATE", "REFINED"] } }, data: { validationStatus: "UNDER_VALIDATION" } });
      if (!changed.count) throw AppError.conflict("This gap cannot be submitted for validation");
      return tx.researchGap.findUniqueOrThrow({ where: { id: row.id } });
    });
    await auditService.log("research_gap.validation.requested", { userId: userIdInput, targetTableName: "research_gaps", targetRecordId: row.id }); return present(updated);
  },
  async addEvidence(gapId: string, userIdInput: string, input: { paperId: string; evidenceKind: "SUPPORTING" | "COUNTER"; evidenceType: string; excerpt: string; explanation: string }) {
    const [{ row, owner }, sourcePaper] = await Promise.all([ownedGap(gapId, userIdInput), paper(input.paperId)]);
    if (!row.projectId) throw AppError.badRequest("Attach this candidate gap to a project before linking evidence: evidence comes from the project's screened literature");
    // AI-generated gaps have no corpus of their own; findGapCorpusPaper searches the project's corpora.
    try {
      const evidence = await gapWrite(row, owner.id, async (tx) => {
        const [projectPaper, corpusPaper] = await Promise.all([
          tx.projectPaper.findUnique({ where: { projectId_paperId: { projectId: row.projectId!, paperId: sourcePaper.id } } }),
          findGapCorpusPaper(row, sourcePaper.id, tx),
        ]);
        if (!projectPaper || projectPaper.screeningStatus !== "INCLUDED") throw AppError.badRequest("The paper must be screened as INCLUDED before it can provide gap evidence");
        const selected = structuredEvidenceItems(corpusPaper?.evidence).find(item => item.evidenceType === input.evidenceType && item.excerpt === input.excerpt.trim());
        if (!corpusPaper?.included || !selected) throw AppError.badRequest("Select a structured extracted evidence item from this paper before linking it to the candidate gap");
        await recordGapPacket(tx, row.id, owner.id);
        const created = await tx.gapEvidenceRecord.create({ data: {
          gapId: row.id, paperId: sourcePaper.id, addedById: owner.id, evidenceKind: input.evidenceKind,
          evidenceType: selected.evidenceType, excerpt: selected.excerpt, sourceLocation: selected.sourceLocation,
          projectPaperId: projectPaper.id, corpusPaperId: corpusPaper.id, explanation: input.explanation,
        } });
        await tx.researchGap.update({ where: { id: row.id }, data: { version: { increment: 1 }, validationStatus: "CANDIDATE", assessmentStatus: "PROPOSED", assessmentRationale: "" } });
        await recordGapPacket(tx, row.id, owner.id);
        await tx.researchGapPaper.upsert({ where: { gapId_paperId_kind: { gapId: row.id, paperId: sourcePaper.id, kind: input.evidenceKind === "SUPPORTING" ? "supporting" : "counter" } }, create: { gapId: row.id, paperId: sourcePaper.id, kind: input.evidenceKind === "SUPPORTING" ? "supporting" : "counter", position: 0 }, update: {} });
        if (row.projectId) await tx.projectActivity.create({ data: { projectId: row.projectId, actorId: owner.id, type: "EVIDENCE_ADDED", entityKind: "GAP", entityId: publicDatabaseId(row), metadata: { title: row.title, evidenceKind: input.evidenceKind, evidenceType: selected.evidenceType, paperId: publicDatabaseId(sourcePaper) } } });
        return created;
      });
      await auditService.log("research_gap.evidence.added", { userId: userIdInput, targetTableName: "gap_evidence_records", targetRecordId: evidence.id, details: { gapId, evidenceKind: input.evidenceKind, evidenceType: evidence.evidenceType, paperId: input.paperId } });
      return present(evidence);
    } catch (error) { if ((error as { code?: string }).code === "P2002") throw AppError.conflict("This evidence item is already linked with the same evidence relation"); throw error; }
  },
  async getEvidence(gapId: string, userIdInput: string) { const [row, viewer] = await Promise.all([gap(gapId), user(userIdInput)]); if (!canViewGapValidation(await validationViewer(row, viewer.id), row.validationStatus)) throw AppError.notFound("Research gap candidate not found"); const records = await getPrisma().gapEvidenceRecord.findMany({ where: { gapId: row.id }, orderBy: [{ evidenceKind: "asc" }, { createdAt: "asc" }] }); const papers = await getPrisma().paper.findMany({ where: { id: { in: records.map((item) => item.paperId) } }, select: { id: true, legacyMongoId: true, title: true, publicationYear: true, journalName: true, doi: true } }); const byId = new Map(papers.map((item) => [item.id, present(item)])); return records.map((item) => ({ ...present(item), paperId: byId.get(item.paperId) })); },
  async addValidation(gapId: string, reviewerIdInput: string, input: { action: "VALIDATE" | "CHALLENGE" | "REQUEST_EVIDENCE" | "SUGGEST_EVIDENCE" | "REFINE_SCOPE" | "REJECT"; comment: string; suggestedChanges?: string; expectedVersion?: number }) { const [{ owner: reviewer }, row] = await Promise.all([assertExpert(reviewerIdInput), gap(gapId)]); const conflict = gapValidationConflict(await validationViewer(row, reviewer.id)); if (conflict) throw AppError.conflict(conflict); if (!(OPEN_FOR_VALIDATION as readonly string[]).includes(row.validationStatus)) throw AppError.conflict("This gap is not open for expert validation"); const validation = await getPrisma().$transaction(async (tx) => {
      await lockProjectAccounts(tx, [reviewer.id], row.projectId ?? undefined);
      await assertActiveProjectAccount(tx, reviewer.id);
      const capability = await tx.userCapability.findFirst({ where: { userId: reviewer.id, capability: "GAP_VALIDATION", status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
      if (!capability) throw AppError.forbidden("GAP_VALIDATION capability is no longer active");
      if (row.userId === reviewer.id) throw AppError.conflict("You cannot validate your own candidate");
      if (row.projectId) {
        const p = await tx.project.findUniqueOrThrow({ where: { id: row.projectId } });
        const membership = await tx.projectMember.findUnique({ where: { projectId_userId: { projectId: p.id, userId: reviewer.id } } });
        if (p.ownerId === reviewer.id || membership?.status === "ACTIVE") throw AppError.conflict("Project members cannot provide external validation");
        if (p.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
      }
      // Serialize experts on this gap so two simultaneous decisions both see each other's vote.
      const [locked] = await tx.$queryRaw<Array<{ status: string }>>`SELECT validation_status AS status FROM research_gaps WHERE id = ${row.id}::uuid FOR UPDATE`;
      if (!locked || !(OPEN_FOR_VALIDATION as readonly string[]).includes(locked.status)) throw AppError.conflict("This gap is not open for expert validation");
      const current = await tx.researchGap.findUniqueOrThrow({ where: { id: row.id } });
      if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) throw AppError.conflict("This gap packet changed. Read the latest revision before evaluating it");
      if (current.status !== "active") throw AppError.conflict("This gap candidate is no longer active");
      if (current.projectId) {
        const project = await tx.project.findUniqueOrThrow({ where: { id: current.projectId } });
        if (project.status === "ARCHIVED") throw AppError.conflict("Archived projects are read-only");
      }
      const created = await tx.gapValidation.create({ data: { gapId: row.id, gapVersion: current.version, reviewerId: reviewer.id, action: input.action, comment: input.comment, suggestedChanges: input.suggestedChanges } });
      const status = resolveValidationStatus(await tx.gapValidation.findMany({ where: { gapId: row.id, gapVersion: current.version }, select: { reviewerId: true, action: true, createdAt: true } }), input.action, env.GAP_VALIDATION_QUORUM);
      await tx.researchGap.update({ where: { id: row.id }, data: { validationStatus: status } });
      if (row.projectId && status !== locked.status) await tx.projectActivity.create({ data: { projectId: row.projectId, actorId: reviewer.id, type: "GAP_STATUS_CHANGED", entityKind: "GAP", entityId: publicDatabaseId(row), metadata: { title: row.title, from: locked.status, to: status } } });
      return created;
    }); await auditService.log("research_gap.validation.recorded", { userId: reviewerIdInput, targetTableName: "gap_validations", targetRecordId: validation.id, details: { gapId, action: input.action } }); return present(validation); },
  async getValidations(gapId: string, userIdInput: string) { const [row, viewer] = await Promise.all([gap(gapId), user(userIdInput)]); if (!canViewGapValidation(await validationViewer(row, viewer.id), row.validationStatus)) throw AppError.notFound("Research gap candidate not found"); const validations = await getPrisma().gapValidation.findMany({ where: { gapId: row.id }, orderBy: { createdAt: "asc" } }); const reviewers = await getPrisma().user.findMany({ where: { id: { in: validations.map((item) => item.reviewerId) } }, select: { id: true, legacyMongoId: true, fullName: true, avatarUrl: true, institution: true, academicProfileType: true } }); const byId = new Map(reviewers.map((item) => [item.id, present(item)])); return validations.map((item) => ({ ...present(item), reviewerId: byId.get(item.reviewerId) })); },
};
