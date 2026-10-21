import type { ProjectResearchQuestion, ProjectSynthesis, SaveSynthesis, SynthesisContent, SynthesisSource } from "@trend/shared-types";
import { isDeepStrictEqual } from "node:util";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { gapsQueue, hasLiveJob } from "../../infrastructure/queue.js";
import { logger } from "../../infrastructure/logger.js";
import { creditService } from "../credits/credit.service.js";
import { getAiActionCost } from "../credits/credit-policy.js";
import { cachedGenerateJSON } from "../llm/llm.run.js";
import { aiModel } from "../user-ai/user-ai.runtime.js";
import { synthesisContentSchema } from "./dto/project-research.schema.js";
import { expectWorkspaceVersion, jsonSnapshot, withWorkspace, type WorkspaceContext, type WorkspaceDb } from "./workspace-access.js";
import { assertSynthesisCitations, buildSynthesisPrompt, SYNTHESIS_JOB, SYNTHESIS_PROMPT_VERSION, SYNTHESIS_SYSTEM, synthesisJobId, type SynthesisJob } from "./research-synthesis.js";

interface StoredSynthesis extends SynthesisContent {
  status: ProjectSynthesis["status"]; sources: SynthesisSource[]; rationale: string; origin: ProjectSynthesis["origin"];
  creditTransactionId?: string; errorMessage?: string;
}
const emptyContent: SynthesisContent = { commonFindings: "", contradictions: "", openQuestions: "" };
const latest = (tx: WorkspaceDb, projectId: string) => tx.projectWorkspaceRevision.findFirst({ where: { projectId, entityKind: "SYNTHESIS", entityId: projectId }, orderBy: { version: "desc" } });
type Revision = NonNullable<Awaited<ReturnType<typeof latest>>>;
const stored = (row: Revision) => row.snapshot as unknown as StoredSynthesis;

/** Every source is pinned to an accepted extraction revision and an included project paper. */
export async function synthesisSources(context: { tx: WorkspaceDb; project: { id: string } }, selection: Array<{ id: string; version: number }>): Promise<SynthesisSource[]> {
  if (selection.length < 3 || selection.length > 30 || new Set(selection.map(item => item.id)).size !== selection.length) throw AppError.badRequest("Choose 3 to 30 distinct accepted extractions");
  const { tx, project } = context;
  const rows = await tx.projectEvidenceItem.findMany({ where: { projectId: project.id, id: { in: selection.map(item => item.id) } } });
  const [papers, links, revisions] = await Promise.all([
    tx.paper.findMany({ where: { id: { in: rows.map(row => row.paperId) }, dataStatus: "active" }, select: { id: true, title: true, updatedAt: true } }),
    tx.projectPaper.findMany({ where: { projectId: project.id, paperId: { in: rows.map(row => row.paperId) }, screeningStatus: "INCLUDED" } }),
    tx.projectWorkspaceRevision.findMany({ where: { projectId: project.id, entityKind: "EXTRACTION", entityId: { in: rows.map(row => row.id) } } }),
  ]);
  const sources = selection.map(selected => {
    const row = rows.find(item => item.id === selected.id);
    const paper = papers.find(item => item.id === row?.paperId), link = links.find(item => item.paperId === row?.paperId);
    const revision = revisions.find(item => item.entityId === row?.id && item.version === selected.version);
    if (!row || row.version !== selected.version || row.reviewState !== "ACCEPTED" || !paper || !link || !revision) {
      throw AppError.conflict("Evidence changed or is no longer accepted. Review the current included sources");
    }
    return { id: row.id, version: row.version, revisionId: revision.id, paperId: row.paperId, projectPaperId: link.id,
      sourceTitle: paper.title, sourceUpdatedAt: link.updatedAt.toISOString(), paperUpdatedAt: paper.updatedAt.toISOString(),
      claim: row.claim, quotation: row.quotation, locator: row.locator, context: row.context, methodology: row.methodology,
      population: row.population, results: row.results, limitations: row.limitations, themes: row.themes };
  });
  if (JSON.stringify(sources).length > 120000) throw AppError.badRequest("The evidence pack is too large. Choose fewer or shorter extractions");
  const paperCount = new Set(sources.map(item => item.paperId)).size;
  if (paperCount < 3 || paperCount > 10) throw AppError.badRequest("Choose accepted evidence from 3 to 10 distinct papers");
  return sources;
}

export async function assertCurrentSynthesis(tx: WorkspaceDb, projectId: string, value: StoredSynthesis) {
  const current = await synthesisSources({ tx, project: { id: projectId } }, value.sources);
  if (!isDeepStrictEqual(current, value.sources)) throw AppError.conflict("Synthesis sources changed. Refresh the evidence and review the synthesis again");
}

async function append(context: WorkspaceContext, value: StoredSynthesis, expectedVersion: number) {
  const current = await latest(context.tx, context.project.id);
  expectWorkspaceVersion(current?.version ?? 0, expectedVersion);
  return context.tx.projectWorkspaceRevision.create({ data: { projectId: context.project.id, entityKind: "SYNTHESIS", entityId: context.project.id,
    version: expectedVersion + 1, actorId: context.actorId, snapshot: jsonSnapshot(value) } });
}

async function present(tx: WorkspaceDb, row: Revision): Promise<ProjectSynthesis> {
  const value = stored(row);
  let stale = false;
  try { await assertCurrentSynthesis(tx, row.projectId, value); } catch (error) {
    if (!(error instanceof AppError) || ![400, 409].includes(error.statusCode)) throw error;
    stale = true;
  }
  const { commonFindings, contradictions, openQuestions, status, sources, rationale, origin, errorMessage } = value;
  return { id: row.entityId, revisionId: row.id, version: row.version, updatedAt: row.createdAt.toISOString(), actorId: row.actorId,
    commonFindings, contradictions, openQuestions, status, sources, rationale, origin, stale, errorMessage };
}

/** Called inside the enqueue/publish project lock. Analysis records retain an immutable input packet. */
export async function reviewedSynthesis(context: Pick<WorkspaceContext, "tx" | "project">, revisionId: string) {
  const row = await latest(context.tx, context.project.id);
  if (!row || row.id !== revisionId || stored(row).status !== "ACCEPTED") throw AppError.conflict("Review and accept the latest synthesis before finding gaps");
  await assertCurrentSynthesis(context.tx, context.project.id, stored(row));
  return { ...stored(row), revisionId: row.id, version: row.version };
}

export const projectSynthesisService = {
  async history(projectId: string, actorId: string) {
    return withWorkspace(projectId, actorId, {}, async context => {
      const rows = await context.tx.projectWorkspaceRevision.findMany({ where: { projectId: context.project.id, entityKind: "SYNTHESIS" }, orderBy: { version: "desc" }, take: 20 });
      return rows.map(row => { const value = stored(row); return { version: row.version, status: value.status, createdAt: row.createdAt.toISOString(), sourceCount: value.sources.length,
        commonFindings: value.commonFindings, contradictions: value.contradictions, openQuestions: value.openQuestions }; });
    });
  },
  async get(projectId: string, actorId: string) {
    return withWorkspace(projectId, actorId, {}, async context => { const row = await latest(context.tx, context.project.id); return row ? present(context.tx, row) : null; });
  },
  async save(projectId: string, actorId: string, input: SaveSynthesis) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const current = await latest(context.tx, context.project.id);
      if (current && stored(current).status === "QUEUED") throw AppError.conflict("Wait for the synthesis draft to finish");
      const sources = await synthesisSources(context, input.evidence);
      const { commonFindings, contradictions, openQuestions } = input;
      assertSynthesisCitations({ commonFindings, contradictions, openQuestions }, sources.length);
      const row = await append(context, { commonFindings, contradictions, openQuestions, sources, status: "DRAFT", rationale: "", origin: current ? stored(current).origin : "HUMAN" }, input.expectedVersion);
      return present(context.tx, row);
    });
  },
  async accept(projectId: string, actorId: string, input: { expectedVersion: number; rationale: string }) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const row = await latest(context.tx, context.project.id);
      if (!row || stored(row).status !== "DRAFT") throw AppError.conflict("Save a synthesis draft before reviewing it");
      const value = stored(row);
      await assertCurrentSynthesis(context.tx, context.project.id, value);
      assertSynthesisCitations(value, value.sources.length);
      return present(context.tx, await append(context, { ...value, status: "ACCEPTED", rationale: input.rationale }, input.expectedVersion));
    });
  },
  async generate(projectId: string, actorId: string, input: Pick<SaveSynthesis, "expectedVersion" | "evidence">) {
    const row = await withWorkspace(projectId, actorId, { write: true }, async context => {
      const current = await latest(context.tx, context.project.id);
      expectWorkspaceVersion(current?.version ?? 0, input.expectedVersion);
      if (current && stored(current).status === "QUEUED") throw AppError.conflict("A synthesis is already queued");
      const sources = await synthesisSources(context, input.evidence);
      return append(context, { ...emptyContent, sources, status: "QUEUED", origin: "AI_SUGGESTED", rationale: "" }, input.expectedVersion);
    });
    let transactionId: string | undefined;
    try {
      const charge = await creditService.chargeCreditsChecked({ userId: row.actorId, action: "fast_report", amount: getAiActionCost("fast_report"),
        targetKind: "project_synthesis", targetId: row.id, idempotencyKey: `synthesis:${row.id}` });
      transactionId = charge?.id;
      // The queue record is immutable; keep the ledger receipt in a separate input packet.
      await getPrisma().projectWorkspaceRevision.create({ data: { projectId: row.projectId, entityKind: "GAP_ANALYSIS_INPUT", entityId: row.id,
        version: 1, actorId: row.actorId, snapshot: jsonSnapshot({ kind: "SYNTHESIS_CHARGE", transactionId }) } });
      await gapsQueue.add(SYNTHESIS_JOB, { projectId: row.projectId, userId: row.actorId, version: row.version } satisfies SynthesisJob,
        { jobId: synthesisJobId(row.projectId, row.version) });
      return { version: row.version };
    } catch (error) {
      if (transactionId) await creditService.refundCreditsOnce({ transactionId, reason: "Synthesis could not be queued" });
      await this.fail({ projectId: row.projectId, userId: row.actorId, version: row.version });
      throw error;
    }
  },
  async run(job: SynthesisJob) {
    const input = await withWorkspace(job.projectId, job.userId, { write: true }, async context => {
      const row = await latest(context.tx, context.project.id);
      if (!row || row.version !== job.version || stored(row).status !== "QUEUED") return null;
      await assertCurrentSynthesis(context.tx, context.project.id, stored(row));
      return { row, title: context.project.title, value: stored(row) };
    });
    if (!input) return;
    let cacheHit = false;
    const content = await cachedGenerateJSON<SynthesisContent>({ task: "extract", promptVersion: SYNTHESIS_PROMPT_VERSION,
      model: aiModel(), keyParts: { projectId: job.projectId, sources: input.value.sources },
      prompt: buildSynthesisPrompt(input.title, input.value.sources),
      validate: raw => { const parsed = synthesisContentSchema.parse(raw); assertSynthesisCitations(parsed, input.value.sources.length); return parsed; },
      options: { system: SYNTHESIS_SYSTEM, temperature: 0, maxOutputTokens: 4096 }, onCacheHit: () => { cacheHit = true; } });
    await withWorkspace(job.projectId, job.userId, { write: true }, async context => {
      const live = await latest(context.tx, context.project.id);
      // Duplicate delivery must not overwrite a human revision.
      if (!live || live.version !== job.version || stored(live).status !== "QUEUED") return;
      await assertCurrentSynthesis(context.tx, context.project.id, input.value);
      await append(context, { ...input.value, ...content, status: "DRAFT" }, job.version);
    });
    if (cacheHit) await this.refund(input.row, "Synthesis cache hit");
  },
  async refund(row: Revision, reason: string) {
    const receipt = await getPrisma().projectWorkspaceRevision.findFirst({ where: { projectId: row.projectId, entityKind: "GAP_ANALYSIS_INPUT", entityId: row.id, version: 1 } });
    const id = (receipt?.snapshot as { transactionId?: string } | undefined)?.transactionId;
    if (id) await creditService.refundCreditsOnce({ transactionId: id, reason });
  },
  async fail(job: SynthesisJob) {
    // Failure cleanup must work after the requesting member leaves or the project is archived.
    const row = await getPrisma().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id=${job.projectId}::uuid FOR UPDATE`;
      const queued = await tx.projectWorkspaceRevision.findFirst({ where: { projectId: job.projectId, entityKind: "SYNTHESIS", version: job.version } });
      if (!queued || stored(queued).status !== "QUEUED") return null;
      const current = await latest(tx, job.projectId);
      if (current?.version === queued.version + 1 && stored(current).status === "DRAFT") return null;
      if (current?.id === queued.id) await tx.projectWorkspaceRevision.create({ data: { projectId: queued.projectId, entityKind: "SYNTHESIS", entityId: queued.entityId,
        version: queued.version + 1, actorId: queued.actorId, snapshot: jsonSnapshot({ ...stored(queued), status: "FAILED", errorMessage: "Synthesis could not finish. Review the sources and try again." }) } });
      return queued;
    });
    if (row) await this.refund(row, "Synthesis failed or sources changed");
  },
  async sweep() {
    const queued = await getPrisma().projectWorkspaceRevision.findMany({ where: { entityKind: "SYNTHESIS", createdAt: { lt: new Date(Date.now() - 30 * 60_000) }, snapshot: { path: ["status"], equals: "QUEUED" } } });
    for (const row of queued) {
      const current = await latest(getPrisma(), row.projectId);
      if (current?.id !== row.id || await hasLiveJob(gapsQueue, synthesisJobId(row.projectId, row.version))) continue;
      await this.fail({ projectId: row.projectId, userId: row.actorId, version: row.version });
      logger.warn({ revisionId: row.id }, "Recovered interrupted research synthesis");
    }
  },
  async questions(projectId: string, actorId: string): Promise<ProjectResearchQuestion[]> {
    return withWorkspace(projectId, actorId, {}, async context => {
      const plan = await context.tx.researchPlan.findUnique({ where: { projectId: context.project.id } });
      const questions = (Array.isArray(plan?.questions) ? plan.questions : []) as unknown as Array<{ id: string; text: string; sourceGapId?: string; sourceGapVersion?: number; sourceEvidenceRevisionIds?: string[] }>;
      const gaps = await context.tx.researchGap.findMany({ where: { projectId: context.project.id, id: { in: questions.flatMap(item => item.sourceGapId ? [item.sourceGapId] : []) } }, select: { id: true, title: true, version: true, assessmentStatus: true } });
      return questions.map(item => { const gap = gaps.find(g => g.id === item.sourceGapId); return { id: item.id, text: item.text, sourceGapId: item.sourceGapId,
        sourceGapVersion: item.sourceGapVersion, sourceGapTitle: gap?.title, evidenceCount: item.sourceEvidenceRevisionIds?.length ?? 0,
        needsReview: Boolean(item.sourceGapId && (!gap || gap.version !== item.sourceGapVersion || gap.assessmentStatus !== "TEAM_SUPPORTED")) }; });
    });
  },
};
