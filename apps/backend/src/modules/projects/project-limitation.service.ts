import type { LimitationCategory, LimitationSource, LimitationStatus, ProjectLimitation, ProjectLimitationList } from "@trend/shared-types";
import type { z } from "zod";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import type { createLimitationSchema, limitationStatusSchema, promoteLimitationSchema, updateLimitationSchema } from "./dto/project-literature.schema.js";
import { evidenceEligibility } from "./evidence-eligibility.js";
import { feasibilitySummaries } from "./feasibility-summary.js";
import { distinctPaperCount, gapTypeForLimitation } from "./literature.rules.js";
import { evidenceItem } from "./project-evidence.service.js";
import { captureGapRevision, linkEvidenceInContext } from "./project-gap-research.service.js";
import { assertWorkspaceRetry, expectWorkspaceVersion, jsonSnapshot, withWorkspace, workspaceEvent, workspacePeople, workspacePerson, workspaceRevision, type WorkspaceContext } from "./workspace-access.js";

type LimitationRow = Awaited<ReturnType<WorkspaceContext["tx"]["projectLimitation"]["findFirstOrThrow"]>>;

async function limitation(context: WorkspaceContext, id: string): Promise<LimitationRow> {
  const parsed = parseDatabaseId(id);
  const row = parsed?.kind === "uuid" ? await context.tx.projectLimitation.findFirst({ where: { id: parsed.value, projectId: context.project.id } }) : null;
  if (!row) throw AppError.notFound("Limitation not found");
  return row;
}

/**
 * Every source must be a human-accepted extraction of a paper that is still included, and must state a limitation.
 * A limitation built on unreviewed AI text would turn a guess into a research gap.
 */
async function assertSources(context: WorkspaceContext, evidenceIds: string[]) {
  const rows = await context.tx.projectEvidenceItem.findMany({ where: { projectId: context.project.id, id: { in: evidenceIds } } });
  if (rows.length !== evidenceIds.length) throw AppError.badRequest("Choose extractions from this project");
  const eligibility = await evidenceEligibility(context.tx, context.project.id, rows.map((row) => row.paperId));
  for (const row of rows) {
    if (row.reviewState !== "ACCEPTED") throw AppError.badRequest("Only human-accepted extractions can support a limitation");
    if (!eligibility.get(row.paperId)?.eligible) throw AppError.badRequest("A selected extraction comes from a paper that is no longer included");
    if (!row.limitations.trim()) throw AppError.badRequest("A selected extraction does not record a limitation. Add it to the extraction first");
  }
  return rows;
}

async function replaceSources(context: WorkspaceContext, limitationId: string, evidenceIds: string[]) {
  const current = await context.tx.projectLimitationSource.findMany({ where: { limitationId } });
  const wanted = new Set(evidenceIds);
  const removed = current.filter((row) => !wanted.has(row.evidenceItemId)).map((row) => row.evidenceItemId);
  if (removed.length) await context.tx.projectLimitationSource.deleteMany({ where: { limitationId, evidenceItemId: { in: removed } } });
  const existing = new Set(current.map((row) => row.evidenceItemId));
  const added = evidenceIds.filter((id) => !existing.has(id));
  if (added.length) await context.tx.projectLimitationSource.createMany({ data: added.map((evidenceItemId) => ({ limitationId, projectId: context.project.id, evidenceItemId, addedById: context.actorId })) });
}

async function present(context: WorkspaceContext, rows: LimitationRow[]): Promise<ProjectLimitation[]> {
  const { tx, project } = context;
  const sources = await tx.projectLimitationSource.findMany({ where: { projectId: project.id, limitationId: { in: rows.map((row) => row.id) } }, orderBy: { createdAt: "asc" } });
  const items = await tx.projectEvidenceItem.findMany({ where: { projectId: project.id, id: { in: sources.map((row) => row.evidenceItemId) } } });
  const [papers, gaps, people, feasibility] = await Promise.all([
    tx.paper.findMany({ where: { id: { in: items.map((item) => item.paperId) } }, select: { id: true, title: true, publicationYear: true } }),
    tx.researchGap.findMany({ where: { id: { in: rows.flatMap((row) => (row.gapId ? [row.gapId] : [])) }, projectId: project.id }, select: { id: true, title: true } }),
    workspacePeople(tx, rows.map((row) => row.createdById)),
    feasibilitySummaries(tx, project.id, "LIMITATION", rows.map((row) => row.id)),
  ]);
  return rows.map((row) => {
    const own: LimitationSource[] = sources.filter((source) => source.limitationId === row.id).flatMap((source) => {
      const item = items.find((candidate) => candidate.id === source.evidenceItemId);
      if (!item) return [];
      const paper = papers.find((candidate) => candidate.id === item.paperId);
      return [{ evidenceId: item.id, evidenceVersion: item.version, paperId: item.paperId, paperTitle: paper?.title ?? "", publicationYear: paper?.publicationYear || null, limitations: item.limitations, claim: item.claim, reviewState: item.reviewState as LimitationSource["reviewState"], addedAt: source.createdAt.toISOString() }];
    });
    return {
      id: row.id, statement: row.statement, category: row.category as LimitationCategory, status: row.status as LimitationStatus,
      statusRationale: row.statusRationale, gapId: row.gapId, gapTitle: gaps.find((gap) => gap.id === row.gapId)?.title ?? null,
      version: row.version, createdById: row.createdById, createdByName: workspacePerson(people, row.createdById).name,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      sources: own, paperCount: distinctPaperCount(own), feasibility: feasibility.get(row.id)!,
    };
  });
}

async function presentOne(context: WorkspaceContext, row: LimitationRow): Promise<ProjectLimitation> {
  return (await present(context, [row]))[0]!;
}

async function record(context: WorkspaceContext, row: LimitationRow, type: string, extra: Record<string, unknown> = {}, creationInput?: unknown) {
  await workspaceRevision(context, "LIMITATION", { ...row, sourceIds: (await context.tx.projectLimitationSource.findMany({ where: { limitationId: row.id }, select: { evidenceItemId: true } })).map((source) => source.evidenceItemId) }, creationInput);
  await workspaceEvent(context, type, "LIMITATION", row.id, jsonSnapshot({ version: row.version, ...extra }));
}

export const projectLimitationService = {
  async list(projectId: string, actorId: string): Promise<ProjectLimitationList> {
    return withWorkspace(projectId, actorId, { mentor: true, mentorScope: "SHARED_RESOURCES" }, async (context) => {
      const { tx, project } = context;
      const rows = await tx.projectLimitation.findMany({ where: { projectId: project.id }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] });
      // Most widely reported first, so the strongest gap signals are on top; then open before closed.
      const items = (await present(context, rows)).sort((a, b) => Number(a.status !== "OPEN") - Number(b.status !== "OPEN") || b.paperCount - a.paperCount);
      const grouped = new Set((await tx.projectLimitationSource.findMany({ where: { projectId: project.id }, select: { evidenceItemId: true } })).map((row) => row.evidenceItemId));
      const accepted = await tx.projectEvidenceItem.findMany({ where: { projectId: project.id, reviewState: "ACCEPTED", NOT: { limitations: "" } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      const eligibility = await evidenceEligibility(tx, project.id, accepted.map((row) => row.paperId));
      const open = accepted.filter((row) => !grouped.has(row.id) && row.limitations.trim() && eligibility.get(row.paperId)?.eligible);
      const papers = await tx.paper.findMany({ where: { id: { in: open.map((row) => row.paperId) } }, select: { id: true, title: true, publicationYear: true } });
      return {
        items,
        ungrouped: open.map((row) => {
          const paper = papers.find((candidate) => candidate.id === row.paperId);
          return { evidenceId: row.id, evidenceVersion: row.version, paperId: row.paperId, paperTitle: paper?.title ?? "", publicationYear: paper?.publicationYear || null, limitations: row.limitations, claim: row.claim };
        }),
        canEdit: Boolean(context.role) && project.status !== "ARCHIVED",
      };
    });
  },

  async create(projectId: string, actorId: string, input: z.infer<typeof createLimitationSchema>): Promise<ProjectLimitation> {
    return withWorkspace(projectId, actorId, { write: true }, async (context) => {
      const prior = await context.tx.projectLimitation.findUnique({ where: { projectId_createdById_clientKey: { projectId: context.project.id, createdById: context.actorId, clientKey: input.clientKey } } });
      if (prior) { await assertWorkspaceRetry(context, "LIMITATION", prior.id, input); return presentOne(context, prior); }
      await assertSources(context, input.evidenceIds);
      const row = await context.tx.projectLimitation.create({ data: { projectId: context.project.id, statement: input.statement, category: input.category, createdById: context.actorId, clientKey: input.clientKey } });
      await replaceSources(context, row.id, input.evidenceIds);
      await record(context, row, "LIMITATION_IDENTIFIED", { sources: input.evidenceIds.length }, input);
      return presentOne(context, row);
    });
  },

  async update(projectId: string, actorId: string, id: string, input: z.infer<typeof updateLimitationSchema>): Promise<ProjectLimitation> {
    return withWorkspace(projectId, actorId, { write: true }, async (context) => {
      const row = await limitation(context, id);
      expectWorkspaceVersion(row.version, input.expectedVersion);
      if (row.status !== "OPEN") throw AppError.conflict(row.status === "PROMOTED" ? "This limitation already became a gap candidate. Edit the gap instead" : "Reopen the limitation before editing it");
      await assertSources(context, input.evidenceIds);
      await replaceSources(context, row.id, input.evidenceIds);
      const next = await context.tx.projectLimitation.update({ where: { id: row.id }, data: { statement: input.statement, category: input.category, version: { increment: 1 } } });
      await record(context, next, "LIMITATION_REVISED", { sources: input.evidenceIds.length });
      return presentOne(context, next);
    });
  },

  async setStatus(projectId: string, actorId: string, id: string, input: z.infer<typeof limitationStatusSchema>): Promise<ProjectLimitation> {
    return withWorkspace(projectId, actorId, { write: true }, async (context) => {
      const row = await limitation(context, id);
      expectWorkspaceVersion(row.version, input.expectedVersion);
      if (row.status === "PROMOTED") throw AppError.conflict("This limitation already became a gap candidate");
      if (row.status === input.status) return presentOne(context, row);
      const next = await context.tx.projectLimitation.update({ where: { id: row.id }, data: { status: input.status, statusRationale: input.status === "DISMISSED" ? input.rationale : "", version: { increment: 1 } } });
      await record(context, next, input.status === "DISMISSED" ? "LIMITATION_DISMISSED" : "LIMITATION_REOPENED", { rationale: input.rationale });
      return presentOne(context, next);
    });
  },

  /**
   * Turns an open limitation into a human-authored gap candidate of this project. Its sources become the gap's
   * supporting evidence (exact accepted revisions), and each member's limitation feasibility assessment is
   * carried over as their gap assessment, so the team does not score the same scope twice.
   * The candidate still goes through team assessment, closure check and expert validation.
   */
  async promote(projectId: string, actorId: string, id: string, input: z.infer<typeof promoteLimitationSchema>): Promise<ProjectLimitation> {
    return withWorkspace(projectId, actorId, { write: true }, async (context) => {
      const { tx, project } = context;
      const row = await limitation(context, id);
      expectWorkspaceVersion(row.version, input.expectedVersion);
      if (row.status !== "OPEN") throw AppError.conflict("Only an open limitation can become a gap candidate");
      const sources = await tx.projectLimitationSource.findMany({ where: { limitationId: row.id } });
      if (!sources.length) throw AppError.badRequest("Add at least one reviewed extraction before creating a gap candidate");
      await assertSources(context, sources.map((source) => source.evidenceItemId));
      const category = row.category as LimitationCategory;
      const gap = await tx.researchGap.create({ data: {
        topic: input.topic, normalizedTopic: input.topic.trim().toLocaleLowerCase(), title: input.title,
        description: row.statement, rationale: input.significance, observedLimitation: row.statement, significanceExplanation: input.significance,
        suggestedResearchQuestion: input.researchQuestion || undefined, gapType: gapTypeForLimitation(category),
        userId: context.actorId, projectId: project.id, source: "standalone", origin: "HUMAN", validationStatus: "CANDIDATE", confidence: 0,
      } });
      await tx.projectActivity.create({ data: { projectId: project.id, actorId: context.actorId, type: "GAP_CREATED", entityKind: "GAP", entityId: gap.id, metadata: { title: gap.title, status: "CANDIDATE", fromLimitationId: row.id } } });
      await captureGapRevision(context, gap.id);
      for (const source of sources) {
        const item = await evidenceItem(context, source.evidenceItemId);
        await linkEvidenceInContext(context, gap.id, item, "SUPPORTING", `Reports the limitation: ${row.statement}`.slice(0, 5000));
      }
      const assessments = await tx.projectFeasibilityAssessment.findMany({ where: { projectId: project.id, targetKind: "LIMITATION", targetId: row.id } });
      for (const assessment of assessments) {
        await tx.projectFeasibilityAssessment.create({ data: {
          projectId: project.id, targetKind: "GAP", targetId: gap.id, targetVersion: gap.version, assessorId: assessment.assessorId,
          dataAvailability: assessment.dataAvailability, expertise: assessment.expertise, resources: assessment.resources, timeline: assessment.timeline, risk: assessment.risk,
          notes: [assessment.notes, "(Carried over from the limitation assessment.)"].filter(Boolean).join("\n").slice(0, 4000),
        } });
      }
      await captureGapRevision(context, gap.id);
      const next = await tx.projectLimitation.update({ where: { id: row.id }, data: { status: "PROMOTED", gapId: gap.id, version: { increment: 1 } } });
      await record(context, next, "LIMITATION_PROMOTED", { gapId: gap.id });
      return presentOne(context, next);
    });
  },
};
