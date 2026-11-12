import type { LiteratureMatrix, LiteratureMatrixRow, MatrixCriterion, PlanQuestion } from "@trend/shared-types";
import { MAX_MATRIX_CRITERIA } from "@trend/shared-types";
import type { z } from "zod";
import { AppError } from "../../common/exceptions/app-error.js";
import type { createCriterionSchema, matrixQuerySchema, reorderCriteriaSchema, updateCriterionSchema } from "./dto/project-literature.schema.js";
import { evidenceEligibility } from "./evidence-eligibility.js";
import { evidenceScope, evidenceSourceChanged, evidenceStatus, extractionQuestions } from "./evidence-presentation.js";
import { MATRIX_ROW_CAP, sanitizeCriteriaValues, storedCriteriaValues } from "./literature.rules.js";
import { expectWorkspaceVersion, withWorkspace, workspaceEvent, workspaceRevision, type WorkspaceContext, type WorkspaceDb } from "./workspace-access.js";

type CriterionRow = Awaited<ReturnType<WorkspaceDb["projectMatrixCriterion"]["findFirstOrThrow"]>>;

function presentCriterion(row: CriterionRow): MatrixCriterion {
  return { id: row.id, label: row.label, description: row.description, position: row.position, version: row.version, createdById: row.createdById, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

async function activeCriteria(tx: WorkspaceDb, projectId: string) {
  return tx.projectMatrixCriterion.findMany({ where: { projectId, archivedAt: null }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
}

async function criterion(context: WorkspaceContext, id: string) {
  const row = await context.tx.projectMatrixCriterion.findFirst({ where: { id, projectId: context.project.id, archivedAt: null } });
  if (!row) throw AppError.notFound("Matrix column not found");
  return row;
}

async function assertUniqueLabel(context: WorkspaceContext, label: string, exceptId?: string) {
  const clash = await context.tx.projectMatrixCriterion.findFirst({ where: { projectId: context.project.id, archivedAt: null, label: { equals: label, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (clash) throw AppError.conflict("A matrix column with this name already exists");
}

/**
 * Values to store on an extraction. Values of active columns come from the request; values of archived
 * columns already stored on the extraction are kept, so archiving a column never deletes data.
 */
export async function matrixCriteriaValues(context: WorkspaceContext, values: Record<string, string> | undefined, stored: unknown = {}): Promise<Record<string, string>> {
  const all = await context.tx.projectMatrixCriterion.findMany({ where: { projectId: context.project.id }, select: { id: true, archivedAt: true } });
  const active = new Set(all.filter((row) => !row.archivedAt).map((row) => row.id));
  const archived = new Set(all.filter((row) => row.archivedAt).map((row) => row.id));
  const kept = Object.fromEntries(Object.entries(storedCriteriaValues(stored)).filter(([key]) => archived.has(key)));
  const incoming = Object.fromEntries(Object.entries(values ?? {}).filter(([key]) => !archived.has(key)));
  return { ...kept, ...sanitizeCriteriaValues(incoming, active) };
}

export const projectMatrixService = {
  async criteria(projectId: string, actorId: string): Promise<MatrixCriterion[]> {
    return withWorkspace(projectId, actorId, {}, async ({ tx, project }) => (await activeCriteria(tx, project.id)).map(presentCriterion));
  },

  async createCriterion(projectId: string, actorId: string, input: z.infer<typeof createCriterionSchema>): Promise<MatrixCriterion> {
    return withWorkspace(projectId, actorId, { write: true }, async (context) => {
      const current = await activeCriteria(context.tx, context.project.id);
      if (current.length >= MAX_MATRIX_CRITERIA) throw AppError.badRequest(`A matrix can have at most ${MAX_MATRIX_CRITERIA} custom columns`);
      await assertUniqueLabel(context, input.label);
      const position = current.reduce((max, row) => Math.max(max, row.position + 1), 0);
      const row = await context.tx.projectMatrixCriterion.create({ data: { projectId: context.project.id, label: input.label, description: input.description, position, createdById: context.actorId } });
      await workspaceRevision(context, "MATRIX_CRITERION", row);
      await workspaceEvent(context, "MATRIX_CRITERION_ADDED", "MATRIX_CRITERION", row.id, { version: row.version, label: row.label });
      return presentCriterion(row);
    });
  },

  async updateCriterion(projectId: string, actorId: string, id: string, input: z.infer<typeof updateCriterionSchema>): Promise<MatrixCriterion> {
    return withWorkspace(projectId, actorId, { write: true }, async (context) => {
      const row = await criterion(context, id);
      expectWorkspaceVersion(row.version, input.expectedVersion);
      await assertUniqueLabel(context, input.label, row.id);
      const next = await context.tx.projectMatrixCriterion.update({ where: { id: row.id }, data: { label: input.label, description: input.description, version: { increment: 1 } } });
      await workspaceRevision(context, "MATRIX_CRITERION", next);
      await workspaceEvent(context, "MATRIX_CRITERION_RENAMED", "MATRIX_CRITERION", row.id, { version: next.version, label: next.label });
      return presentCriterion(next);
    });
  },

  /** Archiving hides the column; values already recorded stay on the extractions and in their history. */
  async archiveCriterion(projectId: string, actorId: string, id: string, input: { expectedVersion: number }): Promise<{ id: string }> {
    return withWorkspace(projectId, actorId, { write: true }, async (context) => {
      const row = await criterion(context, id);
      expectWorkspaceVersion(row.version, input.expectedVersion);
      const next = await context.tx.projectMatrixCriterion.update({ where: { id: row.id }, data: { archivedAt: new Date(), version: { increment: 1 } } });
      await workspaceRevision(context, "MATRIX_CRITERION", next);
      await workspaceEvent(context, "MATRIX_CRITERION_ARCHIVED", "MATRIX_CRITERION", row.id, { version: next.version });
      return { id: row.id };
    });
  },

  async reorderCriteria(projectId: string, actorId: string, input: z.infer<typeof reorderCriteriaSchema>): Promise<MatrixCriterion[]> {
    return withWorkspace(projectId, actorId, { write: true }, async (context) => {
      const current = await activeCriteria(context.tx, context.project.id);
      const ids = new Set(current.map((row) => row.id));
      if (input.order.length !== current.length || input.order.some((id) => !ids.has(id))) throw AppError.conflict("The matrix columns changed. Reload before reordering");
      for (const [position, id] of input.order.entries()) {
        const row = current.find((item) => item.id === id)!;
        if (row.position !== position) await context.tx.projectMatrixCriterion.update({ where: { id }, data: { position } });
      }
      return (await activeCriteria(context.tx, context.project.id)).map(presentCriterion);
    });
  },

  /**
   * One row per extraction of an included paper, built-in columns plus the active custom columns.
   * Default view: verified extractions only, because only human-accepted evidence may support a conclusion.
   */
  async matrix(projectId: string, actorId: string, query: z.infer<typeof matrixQuerySchema>): Promise<LiteratureMatrix> {
    return withWorkspace(projectId, actorId, {}, async ({ tx, project, role }) => {
      const [criteria, eligibility, links, items, plan] = await Promise.all([
        activeCriteria(tx, project.id),
        evidenceEligibility(tx, project.id),
        tx.projectPaper.findMany({ where: { projectId: project.id }, select: { paperId: true, tags: true } }),
        tx.projectEvidenceItem.findMany({ where: { projectId: project.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
        tx.researchPlan.findUnique({ where: { projectId: project.id }, select: { questions: true } }),
      ]);
      const questions = (Array.isArray(plan?.questions) ? plan.questions : []) as unknown as PlanQuestion[];
      const eligibleItems = items.filter((item) => eligibility.get(item.paperId)?.eligible);
      const paperIds = [...new Set(eligibleItems.map((item) => item.paperId))];
      const [papers, documents, revisions, sources] = await Promise.all([
        tx.paper.findMany({ where: { id: { in: paperIds } }, select: { id: true, title: true, doi: true, publicationYear: true, abstractText: true, pdfPath: true, openAccessUrl: true, uploadedAt: true } }),
        tx.paperDocument.findMany({ where: { paperId: { in: paperIds } }, select: { paperId: true, status: true, contentHash: true, sourceHash: true } }),
        tx.projectWorkspaceRevision.findMany({ where: { projectId: project.id, entityKind: "EXTRACTION", entityId: { in: eligibleItems.map((item) => item.id) } }, select: { id: true, entityId: true } }),
        tx.projectLimitationSource.findMany({ where: { projectId: project.id, evidenceItemId: { in: eligibleItems.map((item) => item.id) } }, select: { evidenceItemId: true, limitationId: true } }),
      ]);
      const paperById = new Map(papers.map((paper) => [paper.id, paper]));
      const documentByPaper = new Map(documents.map((document) => [document.paperId, document]));
      const tagsByPaper = new Map(links.map((link) => [link.paperId, link.tags]));
      const activeIds = new Set(criteria.map((row) => row.id));
      const needle = query.q.toLocaleLowerCase();
      const rows: LiteratureMatrixRow[] = [];
      for (const item of eligibleItems) {
        const paper = paperById.get(item.paperId);
        if (!paper) continue;
        const snapshot = item.sourceSnapshot as Record<string, unknown>;
        const verificationStatus = evidenceStatus(item, evidenceSourceChanged(snapshot, paper, documentByPaper.get(item.paperId)));
        if (query.status === "VERIFIED" && verificationStatus !== "VERIFIED") continue;
        if (query.status === "ALL" && item.reviewState === "REJECTED") continue;
        const related = extractionQuestions(snapshot, questions, new Set(revisions.filter((revision) => revision.entityId === item.id).map((revision) => revision.id)));
        if (query.questionId && !related.some((question) => question.id === query.questionId)) continue;
        const themes = [...new Set([...(tagsByPaper.get(item.paperId) ?? []), ...item.themes])];
        if (query.theme && !themes.includes(query.theme)) continue;
        const criteriaValues = Object.fromEntries(Object.entries(storedCriteriaValues(item.criteriaValues)).filter(([key]) => activeIds.has(key)));
        if (needle && ![paper.title, item.claim, item.methodology, item.population, item.results, item.limitations, ...themes, ...Object.values(criteriaValues)].some((value) => value.toLocaleLowerCase().includes(needle))) continue;
        rows.push({
          evidenceId: item.id, evidenceVersion: item.version, paperId: paper.id, paperTitle: paper.title, doi: paper.doi, publicationYear: paper.publicationYear || null,
          methodology: item.methodology, population: item.population, claim: item.claim, results: item.results, limitations: item.limitations,
          themes, criteriaValues, reviewState: item.reviewState as LiteratureMatrixRow["reviewState"], verificationStatus, sourceScope: evidenceScope(snapshot),
          origin: item.origin as LiteratureMatrixRow["origin"], limitationIds: sources.filter((source) => source.evidenceItemId === item.id).map((source) => source.limitationId),
        });
      }
      rows.sort((a, b) => a.paperTitle.localeCompare(b.paperTitle) || a.evidenceId.localeCompare(b.evidenceId));
      const themes = [...new Set([...links.flatMap((link) => link.tags), ...items.flatMap((item) => item.themes)])].sort();
      return {
        criteria: criteria.map(presentCriterion), rows: rows.slice(0, MATRIX_ROW_CAP), total: rows.length, truncated: rows.length > MATRIX_ROW_CAP,
        questions: questions.map(({ id, text }) => ({ id, text })), themes, canEdit: Boolean(role) && project.status !== "ARCHIVED",
      };
    });
  },
};
