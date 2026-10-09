import { aiModel } from "../user-ai/user-ai.runtime.js";
import crypto from "node:crypto";
import type { GapDirections, GapEvidenceMode, GapProbe, GapSource, PreviewGapEvidenceResponse } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { gapsQueue } from "../../infrastructure/queue.js";
import { logger } from "../../infrastructure/logger.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { creditService } from "../credits/credit.service.js";
import { getAiActionCost } from "../credits/credit-policy.js";
import { acquireLock } from "../../infrastructure/cache.js";
import { getEmbeddingProvider } from "../embeddings/embedding.factory.js";
import { LlmContentError } from "../llm/gemini.client.js";
import { cachedGenerateJSON } from "../llm/llm.run.js";
import { retrieve } from "../retrieval/retriever.js";
import { Prisma } from "../../generated/prisma/client.js";
import { computeGapEvidence } from "./gap-evidence.js";
import { buildProbeTsQuery } from "./gap-probe-query.js";
import { fillMissingYears, truncateToCompleteYears, yoyGrowthPct } from "../trends/trend.formulas.js";
import { buildDirectionsPrompt, buildDirectionsEvidenceHash, sanitizeDirections, DIRECTIONS_PROMPT_VERSION, DIRECTIONS_SYSTEM_PROMPT, type DirectionsRaw } from "./gaps-directions.js";
import { buildGapsCacheKey, buildGapsPrompt, GAP_PROMPT_VERSION, GAPS_SYSTEM_PROMPT, type GapEvidencePaper, type GapsLlmOutput } from "./gaps.prompt.js";
import type { AnalyzeGapDto, ListGapsQuery, PatchGapDto, PreviewGapEvidenceDto } from "./dto/gaps.schema.js";
import { sortGapRows, toGapListItem, type GapListDoc } from "./gap-presenter.js";
import { projectService } from "../projects/project.service.js";
import { attachKnowledgeEvidence } from "../knowledge/knowledge.retrieval.js";
import { assertGapReferences } from "../knowledge/knowledge.grounding.js";

export interface GapJob { analysisId: string }
/** Job name on the gaps queue that copies a finished report's gaps into research_gaps. */
export const REPORT_GAP_FANOUT_JOB = "report-gap-fanout";
export interface ReportGapFanoutJob { reportId: string }
/** Shape of one entry in reports.research_gap_snapshots (written by the RAG pipeline). */
interface ReportGapSnapshot { title?: string; description?: string; rationale?: string; supportingPaperIds?: unknown[]; confidence?: unknown; probe?: GapProbe | null }
type GapEvidenceCandidate = GapEvidencePaper & { journalName?: string; citationCount?: number; authorNames: string[]; score: number; source: "selected" | "retrieved" };
interface CollectGapEvidenceInput { topic: string; queryVector?: number[]; selectedPaperIds?: string[]; evidenceMode: GapEvidenceMode; yearFrom?: number; yearTo?: number; projectPaperIds?: string[] }
interface CollectGapEvidenceResult { papers: GapEvidenceCandidate[]; selectedPaperIds: string[]; retrievedPaperIds: string[]; missingSelectedPaperIds: string[] }

const normalizeTopicStr = (value: string) => value.trim().toLowerCase();
const clamp01 = (value: unknown) => { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0.5; };
const GAP_WINDOW_YEARS = 5;
/** Upper bound of one directions LLM call; the lock expires on its own if the process dies. */
const DIRECTIONS_LOCK_TTL_SECONDS = 120;
function idWhere(value: string): { id?: string; legacyMongoId?: string } { const parsed = parseDatabaseId(value); if (!parsed) throw AppError.badRequest("Invalid database identifier"); return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }; }

async function resolveUser(value: string) { const user = await getPrisma().user.findFirst({ where: idWhere(value) }); if (!user || !user.isActive) throw AppError.unauthorized(); return user; }
async function resolvePaperIds(values: string[]) { if (!values.length) return []; const papers = await getPrisma().paper.findMany({ where: { OR: values.map(idWhere) }, select: { id: true, legacyMongoId: true } }); const map = new Map<string, string>(); for (const paper of papers) { map.set(paper.id, paper.id); if (paper.legacyMongoId) map.set(paper.legacyMongoId, paper.id); } return values.flatMap((value) => { const id = map.get(value); return id ? [id] : []; }); }
async function resolveProject(value?: string) { if (!value) return null; const project = await getPrisma().project.findFirst({ where: idWhere(value) }); if (!project) throw AppError.notFound("Project not found"); return project; }
/** The project's owner or an active member; anyone else gets a 404 so private projects stay hidden. */
async function resolveMemberProject(value: string, userId: string) { const project = await resolveProject(value); if (!project || (project.ownerId !== userId && !await getPrisma().projectMember.findFirst({ where: { projectId: project.id, userId, status: "ACTIVE" } }))) throw AppError.notFound("Project not found"); return project; }
async function resolveAnalysis(value: string) { return getPrisma().gapAnalysis.findFirst({ where: idWhere(value) }); }
async function resolveGap(value: string) { return getPrisma().researchGap.findFirst({ where: idWhere(value) }); }

interface ProbeScope { paperIds?: string[]; yearFrom?: number; yearTo?: number }

/** Every phrase must match title/abstract word-wise (see gap-probe-query.ts). Null when a phrase has no searchable words. */
function probeMatchSql(phrases: string[], scope: ProbeScope) {
  const queries = phrases.map(buildProbeTsQuery); if (queries.some((query) => query === null)) return null;
  const conditions = [Prisma.sql`"data_status" = 'active'`, ...queries.map((query) => Prisma.sql`"search_document" @@ to_tsquery('simple', ${query})`)];
  if (scope.paperIds) conditions.push(Prisma.sql`"id" = ANY(${scope.paperIds}::uuid[])`);
  if (scope.yearFrom !== undefined) conditions.push(Prisma.sql`"publication_year" >= ${scope.yearFrom}`);
  if (scope.yearTo !== undefined) conditions.push(Prisma.sql`"publication_year" <= ${scope.yearTo}`);
  return Prisma.join(conditions, " AND ");
}

async function countProbeMatches(phrases: string[], scope: ProbeScope) {
  const where = probeMatchSql(phrases, scope); if (!where) return 0;
  const [row] = await getPrisma().$queryRaw<Array<{ count: number }>>(Prisma.sql`SELECT count(*)::int AS count FROM "papers" WHERE ${where}`);
  return row?.count ?? 0;
}

async function conceptGrowthPct(phrase: string, scope: ProbeScope) {
  const now = new Date().getFullYear(), yearTo = scope.yearTo ?? now, yearFrom = scope.yearFrom ?? yearTo - GAP_WINDOW_YEARS;
  const where = probeMatchSql([phrase], { paperIds: scope.paperIds, yearFrom, yearTo }); if (!where) return 0;
  const rows = await getPrisma().$queryRaw<Array<{ year: number; count: number }>>(Prisma.sql`SELECT "publication_year" AS year, count(*)::int AS count FROM "papers" WHERE ${where} GROUP BY "publication_year" ORDER BY "publication_year"`);
  const series = fillMissingYears(rows, yearFrom, yearTo);
  return yoyGrowthPct(truncateToCompleteYears(series, Math.min(yearTo, now - 1)));
}

async function scoreGapEvidence(probe: GapProbe | undefined, paperIds?: string[]) {
  if (!probe?.topicA || !probe?.topicB) return null;
  const scope: ProbeScope = { paperIds: paperIds ? await resolvePaperIds(paperIds) : undefined, yearFrom: probe.yearFrom, yearTo: probe.yearTo };
  const [intersectionCount, aCount, bCount, growthA, growthB] = await Promise.all([
    countProbeMatches([probe.topicA, probe.topicB], scope),
    countProbeMatches([probe.topicA], scope),
    countProbeMatches([probe.topicB], scope),
    conceptGrowthPct(probe.topicA, scope),
    conceptGrowthPct(probe.topicB, scope),
  ]);
  const parentTrend = growthA >= growthB ? { topic: probe.topicA, growthRatePct: growthA } : { topic: probe.topicB, growthRatePct: growthB };
  const evidence = computeGapEvidence({ intersectionCount, parentCounts: { a: aCount, b: bCount }, parentRisingGrowthPct: parentTrend.growthRatePct }, { scarceAbs: env.GAP_SCARCE_ABS, scarcePct: env.GAP_SCARCE_PCT, parentRisingMin: env.GAP_PARENT_RISING_MIN, minParentPapers: env.GAP_MIN_PARENT_PAPERS });
  return { ...evidence, probe, parentTrend };
}

async function assertCanReadGap(userInput: string, gap: { userId: string; projectId: string | null }) {
  const user = await resolveUser(userInput); if (gap.userId === user.id) return user;
  if (gap.projectId) { const project = await getPrisma().project.findUnique({ where: { id: gap.projectId } }); if (project?.ownerId === user.id || await getPrisma().projectMember.findFirst({ where: { projectId: gap.projectId, userId: user.id, status: "ACTIVE" } })) return user; }
  throw AppError.notFound("Research gap not found");
}

async function analysisDto(analysis: NonNullable<Awaited<ReturnType<typeof resolveAnalysis>>>) {
  const [gaps, papers] = await Promise.all([getPrisma().researchGap.findMany({ where: { analysisId: analysis.id }, select: { id: true, legacyMongoId: true } }), getPrisma().gapAnalysisPaper.findMany({ where: { analysisId: analysis.id }, orderBy: { position: "asc" } })]);
  const paperRows = await getPrisma().paper.findMany({ where: { id: { in: papers.map((row) => row.paperId) } }, select: { id: true, legacyMongoId: true } }); const paperMap = new Map(paperRows.map((row) => [row.id, publicDatabaseId(row)]));
  return { id: publicDatabaseId(analysis), topic: analysis.topic, status: analysis.status, gapIds: gaps.map(publicDatabaseId), evidenceSnapshot: analysis.evidenceSnapshot as unknown as import("@trend/shared-types").PaperEvidenceSnapshot[], errorMessage: analysis.errorMessage ?? undefined, yearFrom: analysis.yearFrom ?? undefined, yearTo: analysis.yearTo ?? undefined, selectedPaperIds: papers.flatMap((row) => { const id = paperMap.get(row.paperId); return id ? [id] : []; }), evidenceMode: analysis.evidenceMode as GapEvidenceMode, createdAt: analysis.createdAt.toISOString(), updatedAt: analysis.updatedAt.toISOString() };
}

async function directionsDto(row: { id: string; gapId: string; model: string; updatedAt: Date }): Promise<GapDirections> {
  const items = await getPrisma().gapDirectionItem.findMany({ where: { directionsId: row.id }, orderBy: { position: "asc" } });
  const links = await getPrisma().gapDirectionPaper.findMany({ where: { directionId: { in: items.map((item) => item.id) } }, orderBy: { position: "asc" } });
  const papers = await getPrisma().paper.findMany({ where: { id: { in: links.map((link) => link.paperId) } }, select: { id: true, legacyMongoId: true } }); const paperMap = new Map(papers.map((paper) => [paper.id, publicDatabaseId(paper)]));
  return { gapId: row.gapId, directions: items.map((item) => ({ title: item.title, rationale: item.rationale, suggestedApproach: item.suggestedApproach, relatedPaperIds: links.filter((link) => link.directionId === item.id).flatMap((link) => { const id = paperMap.get(link.paperId); return id ? [id] : []; }) })), model: row.model, updatedAt: row.updatedAt.toISOString() };
}

export const gapsService = {
  async previewEvidence(userId: string, dto: PreviewGapEvidenceDto): Promise<PreviewGapEvidenceResponse> {
    const projectPaperIds = dto.projectId ? await projectService.getProjectPaperIdsForUser(dto.projectId, userId, "gap analysis") : undefined; const mode = dto.evidenceMode ?? "hybrid"; let queryVector: number[] | undefined, usedTextFallback = false;
    if (mode !== "selected") { try { queryVector = await getEmbeddingProvider().embed(dto.topic); } catch (error) { usedTextFallback = true; logger.warn({ err: error }, "gap evidence preview embedding failed; using text fallback"); } }
    const evidence = await collectGapEvidence({ topic: dto.topic, queryVector, selectedPaperIds: dto.selectedPaperIds, evidenceMode: mode, yearFrom: dto.yearFrom, yearTo: dto.yearTo, projectPaperIds });
    const warnings = evidence.missingSelectedPaperIds.map((id) => `Selected paper ${id} is unavailable in this evidence scope and was skipped.`); if (usedTextFallback) warnings.push("Semantic retrieval was unavailable, so keyword fallback was used."); if (evidence.papers.length < 3) warnings.push("Fewer than 3 evidence papers were found. Broaden the topic or year range.");
    return { papers: evidence.papers.map(toPreviewGapPaper), selectedPaperIds: evidence.selectedPaperIds, retrievedPaperIds: evidence.retrievedPaperIds, maxEvidencePapers: env.GAPS_TOP_K, warnings };
  },

  async enqueue(userInput: string, dto: AnalyzeGapDto): Promise<string> {
    if ((dto.selectedPaperIds?.length ?? 0) > env.GAPS_TOP_K) throw AppError.badRequest(`Gap evidence cannot exceed ${env.GAPS_TOP_K} papers.`);
    const user = await resolveUser(userInput), project = await resolveProject(dto.projectId); let projectPaperIds: string[] | undefined;
    if (dto.projectId) projectPaperIds = await projectService.getProjectPaperIdsForUser(dto.projectId, userInput, "gap analysis");
    if (dto.evidenceMode === "selected") { const evidence = await collectGapEvidence({ topic: dto.topic, selectedPaperIds: dto.selectedPaperIds, evidenceMode: "selected", yearFrom: dto.yearFrom, yearTo: dto.yearTo, projectPaperIds }); if (evidence.papers.length < 3 || evidence.missingSelectedPaperIds.length) throw AppError.badRequest("The reviewed evidence pack must contain at least 3 active papers in this scope.", { missingPaperIds: evidence.missingSelectedPaperIds }); }
    const analysisId = crypto.randomUUID(), cost = getAiActionCost("generate_gaps"); const tx = await creditService.chargeCreditsChecked({ userId: user.id, action: "generate_gaps", amount: cost, targetKind: "gap_analysis", targetId: analysisId, idempotencyKey: `gap_analysis:${analysisId}` });
    try {
      const selectedIds = await resolvePaperIds(dto.selectedPaperIds ?? []); const analysis = await getPrisma().$transaction(async (db) => { const row = await db.gapAnalysis.create({ data: { id: analysisId, userId: user.id, projectId: project?.id, topic: dto.topic, yearFrom: dto.yearFrom, yearTo: dto.yearTo, evidenceMode: dto.evidenceMode ?? "auto", status: "queued", creditTransactionId: tx?.id, creditCost: cost, creditAction: "generate_gaps" } }); if (selectedIds.length) await db.gapAnalysisPaper.createMany({ data: selectedIds.map((paperId, position) => ({ analysisId: row.id, paperId, position })) }); return row; });
      // jobId = analysis id lets the worker's startup sweep check whether this job still exists.
      await gapsQueue.add("gap-analysis", { analysisId: analysis.id }, { jobId: analysis.id }); return publicDatabaseId(analysis);
    } catch (error) { if (tx?.id) await creditService.refundCreditsOnce({ transactionId: tx.id, reason: "Failed to create gap analysis or enqueue job" }); throw error; }
  },

  async getAnalysis(userInput: string, analysisInput: string) { const user = await resolveUser(userInput); const row = await getPrisma().gapAnalysis.findFirst({ where: { ...idWhere(analysisInput), userId: user.id } }); if (!row) throw AppError.notFound("Gap analysis not found"); return analysisDto(row); },
  /** Latest queued/analyzing run in one scope: the given project, or the user's personal (project-less) runs. */
  async getActiveAnalysis(userInput: string, projectInput?: string) { const user = await resolveUser(userInput); const project = projectInput ? await resolveMemberProject(projectInput, user.id) : null; const row = await getPrisma().gapAnalysis.findFirst({ where: { userId: user.id, projectId: project?.id ?? null, status: { in: ["queued", "analyzing"] } }, orderBy: { createdAt: "desc" } }); return row ? analysisDto(row) : null; },
  async retryAnalysis(userInput: string, analysisInput: string) { const user = await resolveUser(userInput); const failed = await getPrisma().gapAnalysis.findFirst({ where: { ...idWhere(analysisInput), userId: user.id, status: "failed" } }); if (!failed) throw AppError.conflict("Only a failed gap analysis can be retried"); const dto = await analysisDto(failed); const project = failed.projectId ? await getPrisma().project.findUnique({ where: { id: failed.projectId } }) : null; return this.enqueue(userInput, { topic: failed.topic, projectId: project ? publicDatabaseId(project) : undefined, yearFrom: failed.yearFrom ?? undefined, yearTo: failed.yearTo ?? undefined, selectedPaperIds: dto.selectedPaperIds, evidenceMode: failed.evidenceMode as GapEvidenceMode }); },

  async runGapPipeline(job: GapJob): Promise<void> {
    const analysis = await resolveAnalysis(job.analysisId); if (!analysis) { logger.warn({ analysisId: job.analysisId }, "gap analysis vanished before processing"); return; }
    // Claim atomically: a run already ready, or failed and refunded by the startup sweep, must not run again.
    const claimed = await getPrisma().gapAnalysis.updateMany({ where: { id: analysis.id, status: { in: ["queued", "analyzing"] } }, data: { status: "analyzing" } });
    if (!claimed.count) { logger.info({ analysisId: job.analysisId, status: analysis.status }, "gap analysis no longer pending; skipping job"); return; }
    const evidenceMode = analysis.evidenceMode as GapEvidenceMode;
    let queryVector: number[] | undefined;
    {
      try { queryVector = await getEmbeddingProvider().embed(analysis.topic); }
      catch (error) { logger.warn({ err: error }, "Gap query embedding unavailable; using full-text retrieval"); }
    }
    const user = await getPrisma().user.findUniqueOrThrow({ where: { id: analysis.userId } }); const project = analysis.projectId ? await getPrisma().project.findUnique({ where: { id: analysis.projectId } }) : null;
    const projectPaperIds = project ? await projectService.getProjectPaperIdsForUser(publicDatabaseId(project), publicDatabaseId(user), "gap analysis") : undefined;
    const selectedLinks = await getPrisma().gapAnalysisPaper.findMany({ where: { analysisId: analysis.id }, orderBy: { position: "asc" } }); const selectedRows = await getPrisma().paper.findMany({ where: { id: { in: selectedLinks.map((row) => row.paperId) } }, select: { id: true, legacyMongoId: true } }); const selectedMap = new Map(selectedRows.map((row) => [row.id, publicDatabaseId(row)]));
    const evidence = await collectGapEvidence({ topic: analysis.topic, queryVector, selectedPaperIds: selectedLinks.flatMap((row) => { const id = selectedMap.get(row.paperId); return id ? [id] : []; }), evidenceMode, yearFrom: analysis.yearFrom ?? undefined, yearTo: analysis.yearTo ?? undefined, projectPaperIds }); const papers = evidence.papers;
    await getPrisma().gapAnalysis.update({ where: { id: analysis.id }, data: { evidenceSnapshot: papers as never } });
    if (!papers.length || (evidenceMode === "selected" && papers.length < 3)) { await this.markAnalysisFailed(job.analysisId, evidenceMode === "selected" ? "The reviewed evidence pack no longer contains at least 3 active papers." : "Not enough corpus data for this topic — try a broader question."); return; }
    const normalizedTopic = normalizeTopicStr(analysis.topic), model = aiModel("deep"); const cacheKey = buildGapsCacheKey({ normalizedTopic, yearFrom: analysis.yearFrom ?? undefined, yearTo: analysis.yearTo ?? undefined, model, retrievedPaperIds: papers.map((paper) => paper.id) }); let cacheHit = false;
    const output = await cachedGenerateJSON<GapsLlmOutput>({ task: "gap", promptVersion: GAP_PROMPT_VERSION, keyParts: { legacyCacheKey: cacheKey, normalizedTopic, yearFrom: analysis.yearFrom, yearTo: analysis.yearTo, retrievedPaperIds: papers.map((paper) => paper.id) }, model, prompt: buildGapsPrompt(analysis.topic, papers), onCacheHit: () => { cacheHit = true; }, validate: (candidate) => { if (!candidate || !Array.isArray(candidate.gaps) || !candidate.gaps.length) throw new LlmContentError("LLM returned empty gaps output"); assertGapReferences(candidate.gaps, papers); return candidate; }, options: { system: GAPS_SYSTEM_PROMPT, temperature: 0.2, maxOutputTokens: env.GAPS_MAX_OUTPUT_TOKENS } });
    // Probe counts are scored against the project's papers, or the whole corpus without a project — never the
    // handful of evidence papers, where any topic intersection would look scarce.
    const evidenceScopePaperIds = projectPaperIds; const paperRows = await getPrisma().paper.findMany({ where: { OR: papers.map((paper) => idWhere(paper.id)) }, select: { id: true, legacyMongoId: true } }); const paperMap = new Map<string, string>(); for (const row of paperRows) { paperMap.set(publicDatabaseId(row), row.id); paperMap.set(row.id, row.id); }
    const prepared = await Promise.all(output.gaps.slice(0, 5).map(async (gap) => ({ gap, evidence: await scoreGapEvidence(gap.probe, evidenceScopePaperIds) })));
    const gapRows = await getPrisma().$transaction(async (db) => {
      const old = await db.researchGap.findMany({ where: { analysisId: analysis.id }, select: { id: true } }); if (old.length) { await db.researchGapPaper.deleteMany({ where: { gapId: { in: old.map((row) => row.id) } } }); await db.researchGap.deleteMany({ where: { id: { in: old.map((row) => row.id) } } }); }
      const created = [];
      for (const item of prepared) { const gap = item.gap, scored = item.evidence; const row = await db.researchGap.create({ data: { topic: analysis.topic, normalizedTopic, analysisId: analysis.id, title: String(gap.title ?? "").slice(0, 200), description: String(gap.description ?? ""), rationale: String(gap.rationale ?? ""), confidence: clamp01(gap.confidence), probe: scored?.probe as never, intersectionCount: scored?.intersectionCount, parentCounts: scored?.parentCounts as never, parentTrend: (scored?.parentTrend ?? null) as never, evidenceConfidence: scored?.evidenceConfidence ?? clamp01(gap.confidence), source: "standalone", userId: analysis.userId, projectId: analysis.projectId } }); const evidenceIds = papers.flatMap((paper) => { const id = paperMap.get(paper.id); return id ? [id] : []; }); const supportingIds = (gap.supportingEvidence ?? []).filter((index) => Number.isInteger(index) && index >= 1 && index <= papers.length).flatMap((index) => { const paper = papers[index - 1]; const id = paper ? paperMap.get(paper.id) : undefined; return id ? [id] : []; }); await db.researchGapPaper.createMany({ data: [...new Set(evidenceIds)].map((paperId, position) => ({ gapId: row.id, paperId, kind: "evidence", position })).concat([...new Set(supportingIds)].map((paperId, position) => ({ gapId: row.id, paperId, kind: "supporting", position }))), skipDuplicates: true }); created.push(row); }
      await db.gapAnalysis.update({ where: { id: analysis.id }, data: { status: "ready", promptVersion: GAP_PROMPT_VERSION, modelVersion: model, ...(cacheHit ? { creditRefundedAt: new Date() } : {}) } }); if (analysis.projectId && created.length) await db.projectActivity.create({ data: { projectId: analysis.projectId, actorId: analysis.userId, type: "GAP_CREATED", entityKind: "GAP_ANALYSIS", entityId: publicDatabaseId(analysis), metadata: { count: created.length, origin: "AI_ASSISTED", status: "CANDIDATE" } } }); return created;
    });
    if (cacheHit && analysis.creditTransactionId) await creditService.refundCreditsOnce({ transactionId: analysis.creditTransactionId, reason: "Gap analysis cache hit" }); logger.info({ analysisId: job.analysisId, gaps: gapRows.length, cacheHit }, "gap analysis ready");
  },

  /** Queue the report's gap fan-out as its own retryable job; the job id makes repeat calls a no-op. */
  async enqueueReportGapFanout(reportId: string) { await gapsQueue.add(REPORT_GAP_FANOUT_JOB, { reportId } satisfies ReportGapFanoutJob, { jobId: `report-gap-fanout-${reportId}` }); },

  /** Copy a ready report's gap snapshots into research_gaps. Idempotent: a report is fanned out at most once, all or nothing. */
  async fanOutGapsFromReport(job: ReportGapFanoutJob) {
    const report = await getPrisma().report.findUnique({ where: { id: job.reportId } }); if (!report || report.status !== "ready") return;
    const snapshots = Array.isArray(report.researchGapSnapshots) ? report.researchGapSnapshots as unknown as ReportGapSnapshot[] : []; if (!snapshots.length) return;
    if (await getPrisma().researchGap.count({ where: { sourceReportId: report.id } })) return;
    const links = await getPrisma().reportPaper.findMany({ where: { reportId: report.id }, orderBy: { position: "asc" } });
    // A project report's selected papers are its project scope; the grounding papers are what the LLM read.
    const scopedPaperIds = report.projectId ? links.filter((link) => link.kind === "selected").map((link) => link.paperId) : undefined; const groundingIds = links.filter((link) => link.kind === "grounding").map((link) => link.paperId);
    const prepared = await Promise.all(snapshots.map(async (gap) => ({ gap, scored: await scoreGapEvidence(gap.probe ?? undefined, scopedPaperIds), supportIds: await resolvePaperIds((gap.supportingPaperIds ?? []).map(String)) })));
    const normalizedTopic = normalizeTopicStr(report.query);
    const created = await getPrisma().$transaction(async (db) => {
      if (await db.researchGap.count({ where: { sourceReportId: report.id } })) return 0;
      for (const { gap, scored, supportIds } of prepared) { const row = await db.researchGap.create({ data: { topic: report.query, normalizedTopic, title: String(gap.title ?? "").slice(0, 200), description: String(gap.description ?? ""), rationale: String(gap.rationale ?? ""), confidence: clamp01(gap.confidence), probe: scored?.probe as never, intersectionCount: scored?.intersectionCount, parentCounts: scored?.parentCounts as never, parentTrend: (scored?.parentTrend ?? null) as never, evidenceConfidence: scored?.evidenceConfidence ?? clamp01(gap.confidence), source: "report", sourceReportId: report.id, userId: report.userId, projectId: report.projectId } }); const evidenceIds = groundingIds.length ? groundingIds : supportIds; await db.researchGapPaper.createMany({ data: [...new Set(evidenceIds)].map((paperId, position) => ({ gapId: row.id, paperId, kind: "evidence", position })).concat([...new Set(supportIds)].map((paperId, position) => ({ gapId: row.id, paperId, kind: "supporting", position }))), skipDuplicates: true }); }
      if (report.projectId) await db.projectActivity.create({ data: { projectId: report.projectId, actorId: report.userId, type: "GAP_CREATED", entityKind: "REPORT", entityId: publicDatabaseId(report), metadata: { count: prepared.length, origin: "AI_ASSISTED", status: "CANDIDATE", source: "report" } } });
      return prepared.length;
    });
    logger.info({ reportId: report.id, gaps: created }, "report gaps fanned out");
  },

  async list(userInput: string, query: ListGapsQuery) {
    const user = await resolveUser(userInput); const project = query.projectId ? await resolveMemberProject(query.projectId, user.id) : null; const isProjectOwner = project?.ownerId === user.id;
    const filters: Prisma.ResearchGapWhereInput[] = [];
    if (query.search) filters.push({ OR: [{ title: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }, { topic: { contains: query.search, mode: "insensitive" } }] });
    // Same score the list ranks by: the corpus evidence score when present, else the AI's confidence.
    if (query.minConfidence !== undefined) filters.push({ OR: [{ evidenceConfidence: { gte: query.minConfidence } }, { evidenceConfidence: null, confidence: { gte: query.minConfidence } }] });
    const where: Prisma.ResearchGapWhereInput = { ...(project ? { projectId: project.id } : { userId: user.id }), status: query.status, ...(query.topic ? { normalizedTopic: { contains: normalizeTopicStr(query.topic), mode: "insensitive" } } : {}), ...(query.source ? { source: query.source } : {}), ...(filters.length ? { AND: filters } : {}) };
    // Rank on light columns only, then load full rows for the requested page.
    const candidates = await getPrisma().researchGap.findMany({ where, select: { id: true, confidence: true, evidenceConfidence: true, createdAt: true, source: true, probe: true, parentCounts: true } });
    const supportingCounts = candidates.length ? await getPrisma().researchGapPaper.groupBy({ by: ["gapId"], where: { gapId: { in: candidates.map((row) => row.id) }, kind: "supporting" }, _count: { _all: true } }) : []; const supportingCountByGap = new Map(supportingCounts.map((row) => [row.gapId, row._count._all]));
    const ranked = sortGapRows(candidates.map((row) => ({ ...row, source: row.source as GapSource, probe: row.probe as GapListDoc["probe"], parentCounts: row.parentCounts as GapListDoc["parentCounts"], supportingCount: supportingCountByGap.get(row.id) ?? 0 })), query.sortBy, env.GAP_MIN_PARENT_PAPERS);
    const total = ranked.length; const pageIds = ranked.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map((row) => row.id);
    const pageRowsById = new Map((await getPrisma().researchGap.findMany({ where: { id: { in: pageIds } } })).map((row) => [row.id, row])); const pageRows = pageIds.flatMap((id) => { const row = pageRowsById.get(id); return row ? [row] : []; });
    const selectedLinks = await getPrisma().researchGapPaper.findMany({ where: { gapId: { in: pageIds } }, orderBy: { position: "asc" } }); const papers = await getPrisma().paper.findMany({ where: { id: { in: selectedLinks.map((row) => row.paperId) } }, select: { id: true, legacyMongoId: true, title: true, publicationYear: true, journalName: true, citationCount: true } }); const publicPaper = new Map(papers.map((paper) => [paper.id, { id: publicDatabaseId(paper), title: paper.title, publicationYear: paper.publicationYear, journalName: paper.journalName ?? undefined, citationCount: paper.citationCount }])); const supportingPapersById = new Map([...publicPaper.values()].map((paper) => [paper.id, paper]));
    const gaps = pageRows.map((row) => { const evidenceIds = selectedLinks.filter((link) => link.gapId === row.id && link.kind === "evidence").flatMap((link) => { const paper = publicPaper.get(link.paperId); return paper ? [paper.id] : []; }); const supportingIds = selectedLinks.filter((link) => link.gapId === row.id && link.kind === "supporting").flatMap((link) => { const paper = publicPaper.get(link.paperId); return paper ? [paper.id] : []; }); const probe = row.probe as GapListDoc["probe"], parentCounts = row.parentCounts as GapListDoc["parentCounts"], parentTrend = row.parentTrend as GapListDoc["parentTrend"]; return toGapListItem({ _id: publicDatabaseId(row), topic: row.topic, normalizedTopic: row.normalizedTopic, title: row.title, description: row.description, rationale: row.rationale, evidencePaperIds: evidenceIds, supportingPaperIds: supportingIds, confidence: row.confidence, probe, intersectionCount: row.intersectionCount ?? undefined, parentCounts, parentTrend, evidenceConfidence: row.evidenceConfidence ?? undefined, source: row.source as "report" | "standalone", sourceReportId: row.sourceReportId, analysisId: row.analysisId, projectId: row.projectId, userId: row.userId, status: row.status as "active" | "resolved" | "dismissed", createdAt: row.createdAt, gapType: row.gapType as never, scope: row.scope ?? undefined, establishedKnowledge: row.establishedKnowledge ?? undefined, observedLimitation: row.observedLimitation ?? undefined, missingEvidence: row.missingEvidence ?? undefined, significanceExplanation: row.significanceExplanation ?? undefined, suggestedResearchQuestion: row.suggestedResearchQuestion ?? undefined, validationStatus: row.validationStatus as never, gapConfidence: row.gapConfidence as never, researchPriority: row.researchPriority as never, origin: row.origin as never }, supportingPapersById, { minParentPapers: env.GAP_MIN_PARENT_PAPERS, canManage: row.userId === user.id || isProjectOwner }); });
    return { gaps, total };
  },

  async patchStatus(userInput: string, gapInput: string, dto: PatchGapDto) { const user = await resolveUser(userInput), gap = await resolveGap(gapInput); if (!gap) throw AppError.notFound("Research gap not found"); if (gap.userId !== user.id) { const project = gap.projectId ? await getPrisma().project.findUnique({ where: { id: gap.projectId }, select: { ownerId: true } }) : null; if (project?.ownerId !== user.id) throw AppError.forbidden("Only the gap creator or the project owner can update gap status"); } const updated = await getPrisma().researchGap.update({ where: { id: gap.id }, data: { status: dto.status } }); return { id: publicDatabaseId(updated), status: updated.status }; },

  async generateDirections(userInput: string, gapInput: string, force?: boolean): Promise<GapDirections> {
    const gap = await resolveGap(gapInput); if (!gap) throw AppError.notFound("Research gap not found"); const user = await assertCanReadGap(userInput, gap); const links = await getPrisma().researchGapPaper.findMany({ where: { gapId: gap.id, kind: "supporting" }, orderBy: { position: "asc" } }); const papers = await getPrisma().paper.findMany({ where: { id: { in: links.map((row) => row.paperId) } }, select: { id: true, legacyMongoId: true, title: true, abstractText: true, aiAnalysis: true } }); const paperMap = new Map(papers.map((paper) => [paper.id, paper])); const directionPapers = links.flatMap((link) => { const paper = paperMap.get(link.paperId); return paper ? [{ id: publicDatabaseId(paper), title: paper.title, abstractText: paper.abstractText ?? undefined, aiAnalysis: paper.aiAnalysis as never }] : []; }); const allowedPaperIds = directionPapers.map((paper) => paper.id), evidenceHash = buildDirectionsEvidenceHash(directionPapers);
    // One generation per gap at a time: a double-click must not charge twice. Checking for saved directions
    // after taking the lock also covers a request that finished while this one waited.
    const release = await acquireLock(`lock:gap-directions:${gap.id}`, DIRECTIONS_LOCK_TTL_SECONDS); if (!release) throw AppError.conflict("Research directions are already being generated for this gap. Please wait a moment.");
    try {
    const existing = await getPrisma().gapDirections.findUnique({ where: { gapId: gap.id } }); if (existing && !force && existing.promptVersion === DIRECTIONS_PROMPT_VERSION && existing.evidenceHash === evidenceHash) return directionsDto(existing);
    const cost = getAiActionCost("generate_directions"); const tx = await creditService.chargeCreditsChecked({ userId: user.id, action: "generate_directions", amount: cost, targetKind: "gap_direction", targetId: gap.id, idempotencyKey: `directions:${gap.id}:${crypto.randomUUID()}` }); let txId = tx?.id, cacheHit = false; let raw: DirectionsRaw;
    try { raw = await cachedGenerateJSON<DirectionsRaw>({ task: "directions", promptVersion: DIRECTIONS_PROMPT_VERSION, keyParts: { gapId: gap.id, allowedPaperIds }, model: aiModel(), bypassCache: force, prompt: buildDirectionsPrompt({ topic: gap.topic, title: gap.title, description: gap.description, rationale: gap.rationale, intersectionCount: gap.intersectionCount ?? undefined, parentTrend: gap.parentTrend as never }, directionPapers), onCacheHit: () => { cacheHit = true; }, validate: (candidate) => { if (!sanitizeDirections(candidate, allowedPaperIds).length) throw new LlmContentError("LLM returned no valid research directions"); return candidate; }, options: { system: DIRECTIONS_SYSTEM_PROMPT, temperature: 0.4, maxOutputTokens: 1024 } }); } catch (error) { if (txId) await creditService.refundCreditsOnce({ transactionId: txId, reason: "Directions generation failed" }); logger.warn({ err: error, gapId: gap.id }, "gap directions generation failed"); throw AppError.serviceUnavailable("AI gợi ý tạm thời không khả dụng. Vui lòng thử lại."); }
    if (cacheHit && txId) { await creditService.refundCreditsOnce({ transactionId: txId, reason: "Directions cache hit" }); txId = undefined; } const directions = sanitizeDirections(raw, allowedPaperIds); if (!directions.length) { if (txId) await creditService.refundCreditsOnce({ transactionId: txId, reason: "Directions returned no valid items" }); throw AppError.serviceUnavailable("AI không trả về gợi ý hợp lệ. Vui lòng thử lại."); }
    let saved: Awaited<ReturnType<ReturnType<typeof getPrisma>["gapDirections"]["upsert"]>>;
    try { saved = await getPrisma().$transaction(async (db) => { const root = await db.gapDirections.upsert({ where: { gapId: gap.id }, create: { gapId: gap.id, model: aiModel(), promptVersion: DIRECTIONS_PROMPT_VERSION, evidenceHash, creditTransactionId: txId, creditCost: txId ? cost : 0 }, update: { model: aiModel(), promptVersion: DIRECTIONS_PROMPT_VERSION, evidenceHash, creditTransactionId: txId ?? null, creditCost: txId ? cost : 0 } }); const old = await db.gapDirectionItem.findMany({ where: { directionsId: root.id }, select: { id: true } }); if (old.length) { await db.gapDirectionPaper.deleteMany({ where: { directionId: { in: old.map((row) => row.id) } } }); await db.gapDirectionItem.deleteMany({ where: { directionsId: root.id } }); } for (const [position, direction] of directions.entries()) { const item = await db.gapDirectionItem.create({ data: { directionsId: root.id, title: direction.title, rationale: direction.rationale, suggestedApproach: direction.suggestedApproach, position } }); const related = await resolvePaperIds(direction.relatedPaperIds); if (related.length) await db.gapDirectionPaper.createMany({ data: related.map((paperId, paperPosition) => ({ directionId: item.id, paperId, position: paperPosition })), skipDuplicates: true }); } return root; }); } catch (error) { if (txId) await creditService.refundCreditsOnce({ transactionId: txId, reason: "Saving directions failed" }); throw error; }
    return directionsDto(saved);
    } finally { await release(); }
  },

  async getDirections(userInput: string, gapInput: string) { const gap = await resolveGap(gapInput); if (!gap) throw AppError.notFound("Research gap not found"); await assertCanReadGap(userInput, gap); const row = await getPrisma().gapDirections.findUnique({ where: { gapId: gap.id } }); return row ? directionsDto(row) : null; },

  async markAnalysisFailed(analysisInput: string, message: string) { const analysis = await resolveAnalysis(analysisInput); if (!analysis || analysis.status === "ready") return; const claimed = await getPrisma().gapAnalysis.updateMany({ where: { id: analysis.id, status: { not: "ready" }, creditRefundedAt: null }, data: { status: "failed", errorMessage: message.slice(0, 500), creditRefundedAt: new Date() } }); if (claimed.count && analysis.creditTransactionId) await creditService.refundCreditsOnce({ transactionId: analysis.creditTransactionId, reason: `Gap analysis failed: ${message.slice(0, 100)}` }); else if (!claimed.count) await getPrisma().gapAnalysis.updateMany({ where: { id: analysis.id, status: { not: "ready" } }, data: { status: "failed", errorMessage: message.slice(0, 500) } }); },
};

async function collectGapEvidence(input: CollectGapEvidenceInput): Promise<CollectGapEvidenceResult> {
  const selectedPaperIds = [...new Set(input.selectedPaperIds ?? [])]; const selected = input.evidenceMode === "auto" ? { papers: [] as GapEvidenceCandidate[], missingIds: [] as string[] } : await fetchSelectedGapEvidence(selectedPaperIds, input); let retrieved: GapEvidenceCandidate[] = [];
  if (input.evidenceMode !== "selected") {
    const filters = { yearFrom: input.yearFrom, yearTo: input.yearTo, paperIds: input.projectPaperIds };
    const candidates = await retrieve({ queryText: input.topic, queryVector: input.queryVector, topK: env.GAPS_TOP_K, filters, fullText: true });
    retrieved = candidates.map((paper) => ({ ...paper, source: "retrieved" }));
  }
  const seen = new Set<string>(), papers: GapEvidenceCandidate[] = []; for (const paper of [...selected.papers, ...retrieved]) { if (papers.length >= env.GAPS_TOP_K) break; if (!seen.has(paper.id)) { seen.add(paper.id); papers.push(paper); } }
  return { papers: await attachKnowledgeEvidence(papers, input.topic, input.queryVector), selectedPaperIds, retrievedPaperIds: retrieved.map((paper) => paper.id), missingSelectedPaperIds: selected.missingIds };
}

async function fetchSelectedGapEvidence(values: string[], input: Pick<CollectGapEvidenceInput, "yearFrom" | "yearTo" | "projectPaperIds">) {
  if (!values.length) return { papers: [] as GapEvidenceCandidate[], missingIds: [] as string[] }; const allowed = input.projectPaperIds ? new Set(input.projectPaperIds) : null; const eligible = allowed ? values.filter((id) => allowed.has(id)) : values; const prisma = getPrisma(); const docs = await prisma.paper.findMany({ where: { OR: eligible.map(idWhere), dataStatus: "active", ...((input.yearFrom !== undefined || input.yearTo !== undefined) ? { publicationYear: { ...(input.yearFrom !== undefined ? { gte: input.yearFrom } : {}), ...(input.yearTo !== undefined ? { lte: input.yearTo } : {}) } } : {}) }, select: { id: true, legacyMongoId: true, title: true, abstractText: true, aiAnalysis: true, publicationYear: true, journalName: true, citationCount: true } }); const authors = await prisma.paperAuthor.findMany({ where: { paperId: { in: docs.map((row) => row.id) } }, orderBy: { position: "asc" } }); const authorMap = new Map<string, string[]>(); for (const author of authors) { const list = authorMap.get(author.paperId) ?? []; list.push(author.displayName); authorMap.set(author.paperId, list); } const byId = new Map<string, typeof docs[number]>(); for (const doc of docs) { byId.set(doc.id, doc); if (doc.legacyMongoId) byId.set(doc.legacyMongoId, doc); }
  const papers: GapEvidenceCandidate[] = [], missingIds: string[] = []; for (const value of values) { const doc = byId.get(value); if (!doc) { missingIds.push(value); continue; } papers.push({ id: publicDatabaseId(doc), title: doc.title, abstractText: doc.abstractText ?? undefined, aiAnalysis: doc.aiAnalysis as never, publicationYear: doc.publicationYear, journalName: doc.journalName ?? undefined, citationCount: doc.citationCount, authorNames: authorMap.get(doc.id) ?? [], score: 1, source: "selected" }); } return { papers, missingIds };
}

function toPreviewGapPaper(paper: GapEvidenceCandidate) { return { id: paper.id, title: paper.title, abstractText: paper.abstractText, publicationYear: paper.publicationYear, journalName: paper.journalName, citationCount: paper.citationCount, authorNames: paper.authorNames, score: paper.score, source: paper.source }; }
