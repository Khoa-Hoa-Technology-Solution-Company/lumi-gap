import { withWorkspace } from "../projects/workspace-access.js";
import { currentProjectIds, requireCurrentProjectMembership } from "../authorization/project-membership.js";
import { aiModel } from "../user-ai/user-ai.runtime.js";
import crypto from "node:crypto";
import type { EnrichGapCorpusStatus, QuestionFacets, GapDirections, GapEvidenceMode, GapProbe, GapProjectEvidence, GapSource, PreviewGapEvidenceResponse } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { gapsQueue } from "../../infrastructure/queue.js";
import { logger } from "../../infrastructure/logger.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { creditService } from "../credits/credit.service.js";
import { getAiActionCost } from "../credits/credit-policy.js";
import { acquireLock, hashKey } from "../../infrastructure/cache.js";
import { getEmbeddingProvider } from "../embeddings/embedding.factory.js";
import { LlmContentError } from "../llm/gemini.client.js";
import { cachedGenerateJSON } from "../llm/llm.run.js";
import { retrieve } from "../retrieval/retriever.js";
import { Prisma } from "../../generated/prisma/client.js";
import { vectorParameter } from "../../infrastructure/database/postgres-paper-search.js";
import { computeGapEvidence, parentGrowth, resolveProbeYears, type YearRange } from "./gap-evidence.js";
import { buildProbeTsQuery, verifyProbe } from "./gap-probe-query.js";
import { countOpenAlexIntersection } from "./gap-global-evidence.js";
import { fillMissingYears, truncateToCompleteYears } from "../trends/trend.formulas.js";
import { buildDirectionsPrompt, buildDirectionsEvidenceHash, sanitizeDirections, DIRECTIONS_PROMPT_VERSION, DIRECTIONS_SYSTEM_PROMPT, type DirectionsRaw } from "./gaps-directions.js";
import { buildGapsCacheKey, buildGapsPrompt, GAP_PROMPT_VERSION, GAPS_SYSTEM_PROMPT, type GapEvidencePaper, type GapsLlmOutput } from "./gaps.prompt.js";
import type { AnalyzeGapDto, ListGapsQuery, PatchGapDto, PreviewGapEvidenceDto } from "./dto/gaps.schema.js";
import { selectByMmr } from "./gap-mmr.js";
import { applyRefinement, buildRefinePrompt, GAP_REFINE_PROMPT_VERSION, GAP_REFINE_SYSTEM_PROMPT, type RefineGapInput, type RefineLlmOutput, type RefineResult } from "./gap-refine.js";
import { expandTopicQueries, fuseByRrf } from "./gap-query-expansion.js";
import { findPossibleCounterPapers, loadPaperEmbeddings } from "./gap-vector-queries.js";
import { enrichCorpusForTopic, findOpenAlexCounterPapers, measureTopicCoverage } from "./gap-literature.js";
import { gapRankingScore, sortGapRows, toGapClosureSummary, toGapListItem, type GapListDoc } from "./gap-presenter.js";
import { projectService } from "../projects/project.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { attachKnowledgeEvidence } from "../knowledge/knowledge.retrieval.js";
import { assertGapReferences } from "../knowledge/knowledge.grounding.js";

export interface GapJob { analysisId: string }
/** Job name on the gaps queue that copies a finished report's gaps into research_gaps. */
export const REPORT_GAP_FANOUT_JOB = "report-gap-fanout";
export interface ReportGapFanoutJob { reportId: string }
/** Job name on the gaps queue that ingests a topic's missing OpenAlex works (see gap-literature.ts). */
export const GAP_CORPUS_ENRICH_JOB = "gap-corpus-enrich";
export interface GapCorpusEnrichJob { topic: string }
/** Shown to the report owner when its gaps cannot be copied because project sources were excluded since the report ran. */
export const REPORT_SOURCES_EXCLUDED_MESSAGE = "Report sources are no longer included. Review the current project literature before proposing gaps";
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

/** A probe topic, with its embedding when semantic matching is on (GAP_PROBE_SEMANTIC_MIN_SIMILARITY > 0). */
interface ProbePhrase { phrase: string; vector?: number[] }

/**
 * Every phrase must match: its words in title/abstract (see gap-probe-query.ts) OR, with a vector, a paper embedding at
 * least GAP_PROBE_SEMANTIC_MIN_SIMILARITY close to it, so synonyms count too. Null when a phrase cannot match at all.
 */
function phraseMatchSql({ phrase, vector }: ProbePhrase) {
  const query = buildProbeTsQuery(phrase);
  const lexical = query === null ? null : Prisma.sql`"search_document" @@ to_tsquery('simple', ${query})`;
  if (!vector) return lexical;
  const semantic = Prisma.sql`("embedding" IS NOT NULL AND 1 - ("embedding" <=> ${vectorParameter(vector)}::vector) >= ${env.GAP_PROBE_SEMANTIC_MIN_SIMILARITY})`;
  return lexical ? Prisma.sql`(${lexical} OR ${semantic})` : semantic;
}

function probeMatchSql(phrases: ProbePhrase[], scope: ProbeScope) {
  const matches = phrases.map(phraseMatchSql); if (matches.some((match) => match === null)) return null;
  const conditions = [Prisma.sql`"data_status" = 'active'`, ...(matches as Prisma.Sql[])];
  if (scope.paperIds) conditions.push(Prisma.sql`"id" = ANY(${scope.paperIds}::uuid[])`);
  if (scope.yearFrom !== undefined) conditions.push(Prisma.sql`"publication_year" >= ${scope.yearFrom}`);
  if (scope.yearTo !== undefined) conditions.push(Prisma.sql`"publication_year" <= ${scope.yearTo}`);
  return Prisma.join(conditions, " AND ");
}

async function countProbeMatches(phrases: ProbePhrase[], scope: ProbeScope) {
  const where = probeMatchSql(phrases, scope); if (!where) return 0;
  const [row] = await getPrisma().$queryRaw<Array<{ count: number }>>(Prisma.sql`SELECT count(*)::int AS count FROM "papers" WHERE ${where}`);
  return row?.count ?? 0;
}

async function conceptGrowth(phrase: ProbePhrase, scope: ProbeScope) {
  const now = new Date().getFullYear(), yearTo = scope.yearTo ?? now, yearFrom = scope.yearFrom ?? yearTo - GAP_WINDOW_YEARS;
  const where = probeMatchSql([phrase], { paperIds: scope.paperIds, yearFrom, yearTo }); if (!where) return parentGrowth([], env.GAP_PARENT_RISING_MIN);
  const rows = await getPrisma().$queryRaw<Array<{ year: number; count: number }>>(Prisma.sql`SELECT "publication_year" AS year, count(*)::int AS count FROM "papers" WHERE ${where} GROUP BY "publication_year" ORDER BY "publication_year"`);
  const series = fillMissingYears(rows, yearFrom, yearTo);
  return parentGrowth(truncateToCompleteYears(series, Math.min(yearTo, now - 1)), env.GAP_PARENT_RISING_MIN);
}

/** Embeddings of a probe's two topics for semantic matching; none when it is off or embedding fails (keyword-only). */
async function embedProbe(probe: GapProbe | undefined): Promise<{ a?: number[]; b?: number[] }> {
  if (!(env.GAP_PROBE_SEMANTIC_MIN_SIMILARITY > 0) || !probe?.topicA || !probe?.topicB) return {};
  try { const [a, b] = await getEmbeddingProvider().embedBatch([probe.topicA, probe.topicB]); return { a, b }; }
  catch (error) { logger.warn({ err: error, probe }, "probe embedding failed; counting probe words only"); return {}; }
}

/** Title + abstract of each paper: the text a probe topic has to appear in. */
const probeTexts = (papers: Array<{ title: string; abstractText?: string | null }>) => papers.map((paper) => `${paper.title} ${paper.abstractText ?? ""}`);

/** Drops a probe whose topics do not occur in the evidence the gap was derived from (the LLM may invent them). */
function groundProbe(probe: GapProbe | undefined, texts: string[], context: { title?: string; analysisId?: string; reportId?: string }) {
  const verified = verifyProbe(probe, texts);
  if (probe && !verified) logger.warn({ ...context, title: context.title, probe }, "gap probe topics not found in its evidence; dropping probe");
  return verified;
}

interface CounterSearchItem { text: string; question: string; probe?: GapProbe }

/**
 * Possible counter-evidence for each gap, from two places (best-effort; the gaps are saved without it on failure):
 *  - the corpus: papers close to the gap's own text (findPossibleCounterPapers) that, when the gap has a probe,
 *    mention both probe topics, so a generic survey of the field does not count;
 *  - OpenAlex: works found with the gap's research question that mention both probe topics, ingested on the way
 *    (findOpenAlexCounterPapers), because a thin corpus is exactly where a gap looks open by mistake.
 * Corpus matches come first; at most GAP_COUNTER_PER_GAP + GAP_COUNTER_OPENALEX_PER_GAP per gap, no duplicates.
 */
async function searchPossibleCounters(items: CounterSearchItem[], excludeIds: string[], context: { analysisId?: string; reportId?: string }): Promise<string[][]> {
  const local = async (): Promise<string[][]> => {
    if (!env.GAP_COUNTER_PER_GAP || !items.length) return items.map(() => []);
    try {
      const vectors = await getEmbeddingProvider().embedBatch(items.map((item) => item.text));
      return await Promise.all(vectors.map(async (vector, index) => {
        const probe = items[index]!.probe;
        const near = await findPossibleCounterPapers(vector, excludeIds);
        return near.filter((row) => !probe || verifyProbe(probe, probeTexts([row])) !== undefined).slice(0, env.GAP_COUNTER_PER_GAP).map((row) => row.paperId);
      }));
    } catch (error) {
      logger.warn({ err: error, ...context }, "corpus counter-evidence search unavailable; continuing without it");
      return items.map(() => []);
    }
  };
  const [corpus, openAlex] = await Promise.all([local(), Promise.all(items.map((item) => findOpenAlexCounterPapers(item.question, item.probe, excludeIds)))]);
  return items.map((_, index) => [...new Set([...(corpus[index] ?? []), ...(openAlex[index] ?? [])])]);
}

/**
 * Self-check (gap-refine.ts): every gap with possible counter-evidence is sent back to the model with those papers'
 * abstracts, to be kept, narrowed to what they leave open, or dropped with a verbatim quote. One call for the whole run.
 * Best-effort: if the call fails, the gaps are saved as proposed, without a refinement.
 */
async function refineGaps(items: Array<{ gap: { title?: unknown; description?: unknown; rationale?: unknown; suggestedResearchQuestion?: unknown }; counterIds: string[] }>, context: { analysisId?: string }): Promise<Array<RefineResult | undefined>> {
  const checked = items.map((item, index) => ({ item, index })).filter(({ item }) => item.counterIds.length > 0);
  if (!checked.length) return items.map(() => undefined);
  const ids = [...new Set(checked.flatMap(({ item }) => item.counterIds))];
  const rows = await getPrisma().paper.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, abstractText: true, publicationYear: true } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const inputs: RefineGapInput[] = checked.map(({ item }) => ({
    title: String(item.gap.title ?? ""), description: String(item.gap.description ?? ""), rationale: String(item.gap.rationale ?? ""),
    suggestedResearchQuestion: typeof item.gap.suggestedResearchQuestion === "string" ? item.gap.suggestedResearchQuestion : undefined,
    counters: item.counterIds.flatMap((id, position) => { const row = byId.get(id); return row ? [{ ref: `C${position + 1}`, paperId: row.id, title: row.title, abstractText: row.abstractText, publicationYear: row.publicationYear }] : []; }),
  }));
  try {
    const output = await cachedGenerateJSON<RefineLlmOutput>({
      task: "gap-refine", promptVersion: GAP_REFINE_PROMPT_VERSION, model: aiModel("deep"),
      keyParts: { gaps: inputs.map((input) => [input.title, input.description, input.suggestedResearchQuestion ?? ""]), counters: inputs.map((input) => input.counters.map((paper) => paper.paperId)) },
      prompt: buildRefinePrompt(inputs),
      options: { system: GAP_REFINE_SYSTEM_PROMPT, temperature: 0.1, maxOutputTokens: env.GAPS_MAX_OUTPUT_TOKENS },
    });
    const results = applyRefinement(inputs, output);
    const out: Array<RefineResult | undefined> = items.map(() => undefined);
    checked.forEach(({ index }, position) => { out[index] = results[position]; });
    logger.info({ ...context, checked: checked.length, actions: results.map((result) => result.refinement.action) }, "gap self-check done");
    return out;
  } catch (error) {
    logger.warn({ err: error, ...context }, "gap self-check failed; saving gaps as proposed");
    return items.map(() => undefined);
  }
}

/** The question a counter-evidence search asks: the gap's own research question, else its probe topics, else its title. */
const counterQuestion = (gap: { title?: unknown; suggestedResearchQuestion?: unknown }, probe?: GapProbe) =>
  (typeof gap.suggestedResearchQuestion === "string" && gap.suggestedResearchQuestion.trim()) || (probe ? `${probe.topicA} ${probe.topicB}` : String(gap.title ?? ""));

/** PICOC facets from the LLM, trimmed to short strings; undefined when none is usable. */
function cleanFacets(value: unknown): QuestionFacets | undefined {
  if (!value || typeof value !== "object") return undefined;
  const facets: QuestionFacets = {};
  for (const key of ["population", "intervention", "comparison", "outcome", "context"] as const) {
    const text = (value as Record<string, unknown>)[key];
    if (typeof text === "string" && text.trim()) facets[key] = text.trim().slice(0, 300);
  }
  return Object.keys(facets).length ? facets : undefined;
}

const gapText = (gap: { title?: unknown; description?: unknown }) => [gap.title, gap.description].map((part) => String(part ?? "")).join("\n").trim();

/**
 * Counts one probe and computes the under-explored ranking signal (not proof that a gap is open; see gap-closure-protocol.md).
 * userYears is the window the user chose for the analysis/report; it narrows whatever window the LLM put in the probe.
 * paperIds are already-resolved internal ids of a project scope (undefined = whole corpus).
 * scopeSize returns N, the active papers of a scope; it is asked for the same window the counts use, so E = nA * nB / N
 * compares like with like. probeCount is k, the probes tested together (Bonferroni).
 */
async function scoreGapEvidence(probe: GapProbe | undefined, paperIds: string[] | undefined, userYears: YearRange, scopeSize: (scope: ProbeScope) => Promise<number>, probeCount: number, vectors: { a?: number[]; b?: number[] } = {}) {
  if (!probe?.topicA || !probe?.topicB) return null;
  const topicA: ProbePhrase = { phrase: probe.topicA, vector: vectors.a }, topicB: ProbePhrase = { phrase: probe.topicB, vector: vectors.b };
  const years = resolveProbeYears(userYears, probe); if (years.conflict) logger.warn({ userYears, probeYears: { yearFrom: probe.yearFrom, yearTo: probe.yearTo } }, "probe year window does not overlap the chosen window; using the chosen window");
  const scope: ProbeScope = { paperIds, yearFrom: years.yearFrom, yearTo: years.yearTo };
  // OpenAlex covers the whole literature, so it is asked once per probe (corpus scope only), never per project scope.
  const [evidenceScopeSize, intersectionCount, aCount, bCount, growthA, growthB, globalEvidence] = await Promise.all([
    scopeSize(scope),
    countProbeMatches([topicA, topicB], scope),
    countProbeMatches([topicA], scope),
    countProbeMatches([topicB], scope),
    conceptGrowth(topicA, scope),
    conceptGrowth(topicB, scope),
    paperIds ? null : countOpenAlexIntersection(probe.topicA, probe.topicB, years),
  ]);
  const chosen = growthA.growthRatePct >= growthB.growthRatePct ? { topic: probe.topicA, growth: growthA } : { topic: probe.topicB, growth: growthB };
  const parentTrend = { topic: chosen.topic, growthRatePct: chosen.growth.growthRatePct, cagrPct: chosen.growth.cagrPct, slope: chosen.growth.slope };
  // Parent growth is context only (parentTrend); it no longer decides the signal.
  const evidence = computeGapEvidence({ evidenceScopeSize, intersectionCount, parentCounts: { a: aCount, b: bCount }, probeCount, globalEvidence }, { minParentPapers: env.GAP_MIN_PARENT_PAPERS, maxRatio: env.GAP_UNDEREXPLORED_MAX_RATIO, alpha: env.GAP_UNDEREXPLORED_ALPHA });
  // Record the threshold with the probe, so a reader knows the counts include semantic matches.
  const recordedProbe: GapProbe = vectors.a && vectors.b ? { ...probe, semanticMinSimilarity: env.GAP_PROBE_SEMANTIC_MIN_SIMILARITY } : probe;
  return { ...evidence, evidenceScopeSize, probe: recordedProbe, parentTrend, globalEvidence };
}

/** k for the Bonferroni correction: how many of a run's gaps carry a scorable probe. Count after grounding, so dropped probes do not tighten the test. */
const countProbes = (gaps: Array<{ probe?: GapProbe | null }>) => Math.max(1, gaps.filter((gap) => gap.probe?.topicA && gap.probe?.topicB).length);

/** Active papers inside a scope: the sample size behind a probe count. */
async function countScopePapers(scope: ProbeScope) {
  const conditions = [Prisma.sql`"data_status" = 'active'`];
  if (scope.paperIds) conditions.push(Prisma.sql`"id" = ANY(${scope.paperIds}::uuid[])`);
  if (scope.yearFrom !== undefined) conditions.push(Prisma.sql`"publication_year" >= ${scope.yearFrom}`);
  if (scope.yearTo !== undefined) conditions.push(Prisma.sql`"publication_year" <= ${scope.yearTo}`);
  const [row] = await getPrisma().$queryRaw<Array<{ count: number }>>(Prisma.sql`SELECT count(*)::int AS count FROM "papers" WHERE ${Prisma.join(conditions, " AND ")}`);
  return row?.count ?? 0;
}

/**
 * Scores probes over two scopes: the whole corpus decides the under-explored signal; a project's INCLUDED papers are only
 * reported alongside as "how much does this project's literature say about it". Sample sizes are counted once per
 * scope and year window (a probe may narrow the chosen window). `probeCount` is k, the probes tested together.
 */
async function createGapScopeScorer(years: YearRange, projectPaperIds: string[] | undefined, probeCount: number) {
  const projectIds = projectPaperIds ? await resolvePaperIds(projectPaperIds) : undefined;
  const sizes = new Map<string, Promise<number>>();
  const scopeSize = (scope: ProbeScope) => {
    const key = JSON.stringify([scope.paperIds ? "project" : "corpus", scope.yearFrom ?? null, scope.yearTo ?? null]);
    let size = sizes.get(key); if (!size) { size = countScopePapers(scope); sizes.set(key, size); }
    return size;
  };
  return async (probe: GapProbe | undefined) => {
    const vectors = await embedProbe(probe); // once per probe, shared by both scopes
    const corpus = await scoreGapEvidence(probe, undefined, years, scopeSize, probeCount, vectors); if (!corpus) return null;
    let projectEvidence: GapProjectEvidence | undefined;
    if (projectIds) { const inProject = await scoreGapEvidence(probe, projectIds, years, scopeSize, probeCount, vectors); if (inProject) projectEvidence = { intersectionCount: inProject.intersectionCount, parentCounts: inProject.parentCounts, scopePaperCount: inProject.evidenceScopeSize, evidenceConfidence: inProject.evidenceConfidence }; }
    return { ...corpus, projectEvidence };
  };
}

async function assertCanReadGap(userInput: string, gap: { userId: string; projectId: string | null }) {
  const user = await resolveUser(userInput); if (gap.projectId) { await requireCurrentProjectMembership(gap.projectId, user.id); return user; } if (gap.userId === user.id) return user;
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
    // A project analyses its own literature, so corpus coverage only matters for corpus-wide analyses.
    const coverage = dto.projectId ? null : await measureTopicCoverage(dto.topic);
    return { papers: evidence.papers.map(toPreviewGapPaper), selectedPaperIds: evidence.selectedPaperIds, retrievedPaperIds: evidence.retrievedPaperIds, maxEvidencePapers: env.GAPS_TOP_K, warnings, ...(coverage ? { coverage } : {}) };
  },

  /** Queues ingestion of the topic's missing OpenAlex works. One job per topic and hour, so repeated clicks share it. */
  async enqueueCorpusEnrichment(topic: string): Promise<{ jobId: string }> {
    const jobId = `gap-enrich-${hashKey({ topic: normalizeTopicStr(topic) })}-${Math.floor(Date.now() / 3_600_000)}`;
    await gapsQueue.add(GAP_CORPUS_ENRICH_JOB, { topic } satisfies GapCorpusEnrichJob, { jobId, attempts: 2 });
    return { jobId };
  },

  async corpusEnrichmentStatus(jobId: string): Promise<EnrichGapCorpusStatus> {
    const job = await gapsQueue.getJob(jobId);
    if (!job || job.name !== GAP_CORPUS_ENRICH_JOB) throw AppError.notFound("Corpus enrichment job not found");
    const state = await job.getState();
    if (state === "completed") { const result = job.returnvalue as { added?: number; checked?: number } | undefined; return { state: "done", added: result?.added ?? 0, checked: result?.checked ?? 0 }; }
    if (state === "failed") return { state: "failed" };
    return { state: state === "active" ? "running" : "queued" };
  },

  /** Worker side of GAP_CORPUS_ENRICH_JOB. */
  async runCorpusEnrichment(job: GapCorpusEnrichJob) {
    return enrichCorpusForTopic(job.topic);
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

  async getAnalysis(userInput: string, analysisInput: string) { const user = await resolveUser(userInput); const row = await getPrisma().gapAnalysis.findFirst({ where: { ...idWhere(analysisInput), userId: user.id } }); if (!row) throw AppError.notFound("Gap analysis not found"); if (row.projectId) await requireCurrentProjectMembership(row.projectId, user.id); return analysisDto(row); },
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
    const sourceVersions = project ? await withWorkspace(project.id, user.id, { write: true }, context => context.tx.projectPaper.findMany({ where: { projectId: project.id, screeningStatus: "INCLUDED" }, orderBy: { paperId: "asc" }, select: { paperId: true, updatedAt: true } })) : [];
    const projectPaperIds = project ? sourceVersions.map(source => source.paperId) : undefined;
    const selectedLinks = await getPrisma().gapAnalysisPaper.findMany({ where: { analysisId: analysis.id }, orderBy: { position: "asc" } }); const selectedRows = await getPrisma().paper.findMany({ where: { id: { in: selectedLinks.map((row) => row.paperId) } }, select: { id: true, legacyMongoId: true } }); const selectedMap = new Map(selectedRows.map((row) => [row.id, publicDatabaseId(row)]));
    const evidence = await collectGapEvidence({ topic: analysis.topic, queryVector, selectedPaperIds: selectedLinks.flatMap((row) => { const id = selectedMap.get(row.paperId); return id ? [id] : []; }), evidenceMode, yearFrom: analysis.yearFrom ?? undefined, yearTo: analysis.yearTo ?? undefined, projectPaperIds }); const papers = evidence.papers;
    await getPrisma().gapAnalysis.update({ where: { id: analysis.id }, data: { evidenceSnapshot: papers as never } });
    if (!papers.length || (evidenceMode === "selected" && papers.length < 3)) { await this.markAnalysisFailed(job.analysisId, evidenceMode === "selected" ? "The reviewed evidence pack no longer contains at least 3 active papers." : "Not enough corpus data for this topic — try a broader question."); return; }
    const normalizedTopic = normalizeTopicStr(analysis.topic), model = aiModel("deep"); const cacheKey = buildGapsCacheKey({ normalizedTopic, yearFrom: analysis.yearFrom ?? undefined, yearTo: analysis.yearTo ?? undefined, model, retrievedPaperIds: papers.map((paper) => paper.id) }); let cacheHit = false;
    const output = await cachedGenerateJSON<GapsLlmOutput>({ task: "gap", promptVersion: GAP_PROMPT_VERSION, keyParts: { legacyCacheKey: cacheKey, normalizedTopic, yearFrom: analysis.yearFrom, yearTo: analysis.yearTo, retrievedPaperIds: papers.map((paper) => paper.id) }, model, prompt: buildGapsPrompt(analysis.topic, papers), onCacheHit: () => { cacheHit = true; }, validate: (candidate) => { if (!candidate || !Array.isArray(candidate.gaps) || !candidate.gaps.length) throw new LlmContentError("LLM returned empty gaps output"); assertGapReferences(candidate.gaps, papers); return candidate; }, options: { system: GAPS_SYSTEM_PROMPT, temperature: 0.2, maxOutputTokens: env.GAPS_MAX_OUTPUT_TOKENS } });
    // Probe counts always run over the whole corpus (inside the chosen years) — never the handful of evidence papers,
    // where any topic intersection would look scarce. A project's papers are scored separately as context.
    // Probe terms must be grounded in the evidence the model read before corpus counts are persisted.
    const grounded = output.gaps.slice(0, 5).map((gap) => ({ gap, probe: groundProbe(gap.probe, probeTexts(papers), { analysisId: analysis.id, title: gap.title }) }));
    const scoreScopes = await createGapScopeScorer({ yearFrom: analysis.yearFrom ?? undefined, yearTo: analysis.yearTo ?? undefined }, projectPaperIds, countProbes(grounded));
    const paperRows = await getPrisma().paper.findMany({ where: { OR: papers.map((paper) => idWhere(paper.id)) }, select: { id: true, legacyMongoId: true } });
    const paperMap = new Map<string, string>();
    for (const row of paperRows) { paperMap.set(publicDatabaseId(row), row.id); paperMap.set(row.id, row.id); }
    // Search the corpus with each gap's own text for papers that may already answer it; the LLM only saw the pack.
    const possibleCounters = await searchPossibleCounters(grounded.map(({ gap, probe }) => ({ text: gapText(gap), question: counterQuestion(gap, probe), probe })), [...new Set(paperMap.values())], { analysisId: analysis.id });
    const scoredGaps = await Promise.all(grounded.map(async ({ gap, probe }, index) => ({ gap, evidence: await scoreScopes(probe), possibleCounterIds: possibleCounters[index] ?? [] })));
    // Before anything is saved: drop gaps a paper already answers, narrow the ones papers partly cover.
    const refinements = await refineGaps(scoredGaps.map((item) => ({ gap: item.gap, counterIds: item.possibleCounterIds })), { analysisId: analysis.id });
    const prepared = scoredGaps.map((item, index) => ({ ...item, refine: refinements[index] }));
    const persist = async (db: Prisma.TransactionClient) => {
      if (project) {
        const currentSources = await db.projectPaper.findMany({ where: { projectId: project.id, screeningStatus: "INCLUDED" }, orderBy: { paperId: "asc" }, select: { paperId: true, updatedAt: true } });
        if (JSON.stringify(currentSources) !== JSON.stringify(sourceVersions)) throw AppError.conflict("Project sources changed during AI analysis. Review the evidence pack and run it again");
      }
      const old = await db.researchGap.findMany({ where: { analysisId: analysis.id } });
      if (old.length) return old;
      const created = [];
      for (const item of prepared) {
        const scored = item.evidence, possibleCounterIds = item.possibleCounterIds, refine = item.refine;
        // A narrowed gap is saved in its rewritten form; the first version stays in refinement.original.
        const gap = refine?.narrowed ? { ...item.gap, ...refine.narrowed } : item.gap;
        const row = await db.researchGap.create({ data: { topic: analysis.topic, normalizedTopic, analysisId: analysis.id, title: String(gap.title ?? "").slice(0, 200), description: String(gap.description ?? ""), rationale: String(gap.rationale ?? ""), confidence: analysis.projectId ? 0 : clamp01(gap.confidence), assumptions: typeof gap.assumptions === "string" ? gap.assumptions.slice(0, 5000) : "", suggestedResearchQuestion: typeof gap.suggestedResearchQuestion === "string" && gap.suggestedResearchQuestion.trim() ? gap.suggestedResearchQuestion.trim().slice(0, 5000) : undefined, questionFacets: cleanFacets(gap.questionFacets) as never, probe: scored?.probe as never, intersectionCount: scored?.intersectionCount, parentCounts: scored?.parentCounts as never, parentTrend: (scored?.parentTrend ?? null) as never, globalEvidence: (scored?.globalEvidence ?? Prisma.DbNull) as never, evidenceConfidence: analysis.projectId ? 0 : scored?.evidenceConfidence ?? null, evidenceScopeSize: scored?.evidenceScopeSize, projectEvidence: scored?.projectEvidence as never, source: "standalone", userId: analysis.userId, projectId: analysis.projectId, ...(refine ? { refinement: refine.refinement as never } : {}), ...(refine?.refinement.action === "drop" ? { status: "dismissed" } : {}) } });
        const evidenceIds = papers.flatMap((paper) => { const id = paperMap.get(paper.id); return id ? [id] : []; });
        const supportingIds = (gap.supportingEvidence ?? []).filter((index) => Number.isInteger(index) && index >= 1 && index <= papers.length).flatMap((index) => { const paper = papers[index - 1]; const id = paper ? paperMap.get(paper.id) : undefined; return id ? [id] : []; });
        await db.researchGapPaper.createMany({ data: [...new Set(evidenceIds)].map((paperId, position) => ({ gapId: row.id, paperId, kind: "evidence", position })).concat([...new Set(supportingIds)].map((paperId, position) => ({ gapId: row.id, paperId, kind: "supporting", position }))).concat(possibleCounterIds.map((paperId, position) => ({ gapId: row.id, paperId, kind: "possible_counter", position }))), skipDuplicates: true });
        created.push(row);
      }
      await db.gapAnalysis.update({ where: { id: analysis.id }, data: { status: "ready", promptVersion: GAP_PROMPT_VERSION, modelVersion: model, ...(cacheHit ? { creditRefundedAt: new Date() } : {}) } });
      if (analysis.projectId && created.length) await db.projectActivity.create({ data: { projectId: analysis.projectId, actorId: analysis.userId, type: "GAP_CREATED", entityKind: "GAP_ANALYSIS", entityId: publicDatabaseId(analysis), metadata: { count: created.length, origin: "AI_ASSISTED", status: "CANDIDATE" } } });
      return created;
    };
    const gapRows = project ? await withWorkspace(project.id, user.id, { write: true }, context => persist(context.tx)) : await getPrisma().$transaction(persist);
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
    const resolved = await Promise.all(snapshots.map(async (gap) => ({ gap, supportIds: await resolvePaperIds((gap.supportingPaperIds ?? []).map(String)) })));
    const textRows = await getPrisma().paper.findMany({ where: { id: { in: [...new Set([...groundingIds, ...resolved.flatMap((row) => row.supportIds)])] } }, select: { id: true, title: true, abstractText: true } });
    const textById = new Map(textRows.map((row) => [row.id, row]));
    const grounded = resolved.map(({ gap, supportIds }) => {
      const source = [...new Set([...groundingIds, ...supportIds])].flatMap((id) => { const row = textById.get(id); return row ? [row] : []; });
      return { gap, supportIds, probe: groundProbe(gap.probe ?? undefined, probeTexts(source), { reportId: report.id, title: gap.title }) };
    });
    const scoreScopes = await createGapScopeScorer({ yearFrom: report.yearFrom ?? undefined, yearTo: report.yearTo ?? undefined }, scopedPaperIds, countProbes(grounded));
    const possibleCounters = await searchPossibleCounters(grounded.map(({ gap, probe }) => ({ text: gapText(gap), question: counterQuestion(gap, probe), probe })), [...new Set([...groundingIds, ...resolved.flatMap((row) => row.supportIds)])], { reportId: report.id });
    const prepared = await Promise.all(grounded.map(async ({ gap, supportIds, probe }, index) => ({ gap, scored: await scoreScopes(probe), supportIds, possibleCounterIds: possibleCounters[index] ?? [] })));
    const normalizedTopic = normalizeTopicStr(report.query);
    const persistReportGaps = async (db: Prisma.TransactionClient) => {
      if (await db.researchGap.count({ where: { sourceReportId: report.id } })) return 0;
      if (report.projectId) {
        const included = new Set((await db.projectPaper.findMany({ where: { projectId: report.projectId, screeningStatus: "INCLUDED" }, select: { paperId: true } })).map(row => row.paperId));
        if ([...groundingIds, ...prepared.flatMap(row => row.supportIds)].some(id => !included.has(id))) throw Object.assign(AppError.conflict(REPORT_SOURCES_EXCLUDED_MESSAGE), { nonRetryable: true });
      }
      for (const { gap, scored, supportIds, possibleCounterIds } of prepared) { const row = await db.researchGap.create({ data: { topic: report.query, normalizedTopic, title: String(gap.title ?? "").slice(0, 200), description: String(gap.description ?? ""), rationale: String(gap.rationale ?? ""), confidence: report.projectId ? 0 : clamp01(gap.confidence), probe: scored?.probe as never, intersectionCount: scored?.intersectionCount, parentCounts: scored?.parentCounts as never, parentTrend: (scored?.parentTrend ?? null) as never, globalEvidence: (scored?.globalEvidence ?? Prisma.DbNull) as never, evidenceConfidence: report.projectId ? 0 : scored?.evidenceConfidence ?? null, evidenceScopeSize: scored?.evidenceScopeSize, projectEvidence: scored?.projectEvidence as never, source: "report", sourceReportId: report.id, userId: report.userId, projectId: report.projectId } }); const evidenceIds = groundingIds.length ? groundingIds : supportIds; await db.researchGapPaper.createMany({ data: [...new Set(evidenceIds)].map((paperId, position) => ({ gapId: row.id, paperId, kind: "evidence", position })).concat([...new Set(supportIds)].map((paperId, position) => ({ gapId: row.id, paperId, kind: "supporting", position }))).concat(possibleCounterIds.map((paperId, position) => ({ gapId: row.id, paperId, kind: "possible_counter", position }))), skipDuplicates: true }); }
      if (report.projectId) await db.projectActivity.create({ data: { projectId: report.projectId, actorId: report.userId, type: "GAP_CREATED", entityKind: "REPORT", entityId: publicDatabaseId(report), metadata: { count: prepared.length, origin: "AI_ASSISTED", status: "CANDIDATE", source: "report" } } });
      return prepared.length;
    };
    const created = report.projectId ? await withWorkspace(report.projectId, report.userId, { write: true }, context => persistReportGaps(context.tx)) : await getPrisma().$transaction(persistReportGaps);
    logger.info({ reportId: report.id, gaps: created }, "report gaps fanned out");
  },

  /** Tells the report owner that its gaps were not created; once per report (the event key makes repeats a no-op). */
  async notifyReportGapFanoutFailed(reportId: string, message: string) {
    const report = await getPrisma().report.findUnique({ where: { id: reportId }, select: { id: true, userId: true } }); if (!report) return;
    await notificationService.create({ userId: report.userId, title: "Research gaps from your report were not created", message, type: "report_gaps_failed", targetKind: "report", targetId: report.id, eventKey: `report-gap-fanout-failed:${report.id}` });
  },

  async list(userInput: string, query: ListGapsQuery) {
    const user = await resolveUser(userInput); const project = query.projectId ? await resolveMemberProject(query.projectId, user.id) : null; const isProjectOwner = project?.ownerId === user.id;
    const filters: Prisma.ResearchGapWhereInput[] = project ? [] : [{ OR: [{ projectId: null }, { projectId: { in: await currentProjectIds(user.id) } }] }];
    if (query.search) filters.push({ OR: [{ title: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }, { topic: { contains: query.search, mode: "insensitive" } }] });
    const where: Prisma.ResearchGapWhereInput = { ...(project ? { projectId: project.id } : { userId: user.id }), status: query.status, ...(query.assessmentStatus ? { assessmentStatus: query.assessmentStatus } : {}), ...(query.topic ? { normalizedTopic: { contains: normalizeTopicStr(query.topic), mode: "insensitive" } } : {}), ...(query.source ? { source: query.source } : {}), ...(filters.length ? { AND: filters } : {}) };
    // Rank on light columns only, then load full rows for the requested page.
    const candidates = await getPrisma().researchGap.findMany({ where, select: { id: true, confidence: true, evidenceConfidence: true, evidenceScopeSize: true, intersectionCount: true, createdAt: true, source: true, probe: true, parentCounts: true, globalEvidence: true, refinement: true } });
    const linkCounts = candidates.length ? await getPrisma().researchGapPaper.groupBy({ by: ["gapId", "kind"], where: { gapId: { in: candidates.map((row) => row.id) }, kind: { in: ["supporting", "counter", "possible_counter"] } }, _count: { _all: true } }) : [];
    const linkCount = (gapId: string, kinds: string[]) => linkCounts.filter((row) => row.gapId === gapId && kinds.includes(row.kind)).reduce((sum, row) => sum + row._count._all, 0);
    const signalConfig = { minParentPapers: env.GAP_MIN_PARENT_PAPERS, maxRatio: env.GAP_UNDEREXPLORED_MAX_RATIO, alpha: env.GAP_UNDEREXPLORED_ALPHA };
    const sortRows = candidates.map((row) => ({ ...row, source: row.source as GapSource, probe: row.probe as GapListDoc["probe"], parentCounts: row.parentCounts as GapListDoc["parentCounts"], globalEvidence: row.globalEvidence as GapListDoc["globalEvidence"], refinement: row.refinement as GapListDoc["refinement"], supportingCount: linkCount(row.id, ["supporting"]), counterCount: linkCount(row.id, ["counter", "possible_counter"]) }));
    // Filter on the same score the list ranks by (recomputed from the stored counts), not the LLM's placeholder confidence.
    const filtered = !project && query.minConfidence ? sortRows.filter((row) => gapRankingScore(row, signalConfig) >= query.minConfidence!) : sortRows;
    const ranked = sortGapRows(filtered, project ? "newest" : query.sortBy, signalConfig.minParentPapers, { maxRatio: signalConfig.maxRatio, alpha: signalConfig.alpha });
    const total = ranked.length;
    const pageIds = ranked.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map((row) => row.id);
    const pageRowsById = new Map((await getPrisma().researchGap.findMany({ where: { id: { in: pageIds } } })).map((row) => [row.id, row]));
    const pageRows = pageIds.flatMap((id) => { const row = pageRowsById.get(id); return row ? [row] : []; });
    const selectedLinks = await getPrisma().researchGapPaper.findMany({ where: { gapId: { in: pageIds } }, orderBy: { position: "asc" } });
    const papers = await getPrisma().paper.findMany({ where: { id: { in: selectedLinks.map((row) => row.paperId) } }, select: { id: true, legacyMongoId: true, title: true, publicationYear: true, journalName: true, citationCount: true } });
    const publicPaper = new Map(papers.map((paper) => [paper.id, { id: publicDatabaseId(paper), title: paper.title, publicationYear: paper.publicationYear, journalName: paper.journalName ?? undefined, citationCount: paper.citationCount }]));
    const supportingPapersById = new Map([...publicPaper.values()].map((paper) => [paper.id, paper]));
    const closureChecks = new Map((await getPrisma().gapClosureCheck.findMany({ where: { id: { in: pageRows.flatMap((row) => row.latestClosureCheckId ? [row.latestClosureCheckId] : []) } }, select: { id: true, status: true, decision: true, bound: true, judgeKind: true, decidedAt: true } })).map((check) => [check.id, toGapClosureSummary(check)]));
    const gaps = pageRows.map((row) => {
      const evidenceIds = selectedLinks.filter((link) => link.gapId === row.id && link.kind === "evidence").flatMap((link) => { const paper = publicPaper.get(link.paperId); return paper ? [paper.id] : []; });
      const supportingIds = selectedLinks.filter((link) => link.gapId === row.id && link.kind === "supporting").flatMap((link) => { const paper = publicPaper.get(link.paperId); return paper ? [paper.id] : []; });
      const counterIds = selectedLinks.filter((link) => link.gapId === row.id && link.kind === "counter").flatMap((link) => { const paper = publicPaper.get(link.paperId); return paper ? [paper.id] : []; });
      const possibleCounterIds = selectedLinks.filter((link) => link.gapId === row.id && link.kind === "possible_counter").flatMap((link) => { const paper = publicPaper.get(link.paperId); return paper ? [paper.id] : []; });
      const probe = row.probe as GapListDoc["probe"], parentCounts = row.parentCounts as GapListDoc["parentCounts"], parentTrend = row.parentTrend as GapListDoc["parentTrend"];
      return toGapListItem({ version: row.version, assessmentStatus: row.assessmentStatus as GapListDoc["assessmentStatus"], _id: publicDatabaseId(row), topic: row.topic, normalizedTopic: row.normalizedTopic, title: row.title, description: row.description, rationale: row.rationale, evidencePaperIds: evidenceIds, supportingPaperIds: supportingIds, counterPaperIds: counterIds, possibleCounterPaperIds: possibleCounterIds, globalEvidence: row.globalEvidence as GapListDoc["globalEvidence"], confidence: row.confidence, probe, intersectionCount: row.intersectionCount ?? undefined, parentCounts, parentTrend, evidenceConfidence: row.evidenceConfidence ?? undefined, evidenceScopeSize: row.evidenceScopeSize ?? undefined, projectEvidence: (row.projectEvidence ?? undefined) as GapListDoc["projectEvidence"], source: row.source as "report" | "standalone", sourceReportId: row.sourceReportId, analysisId: row.analysisId, projectId: row.projectId, userId: row.userId, status: row.status as "active" | "resolved" | "dismissed", createdAt: row.createdAt, gapType: row.gapType as never, scope: row.scope ?? undefined, establishedKnowledge: row.establishedKnowledge ?? undefined, observedLimitation: row.observedLimitation ?? undefined, missingEvidence: row.missingEvidence ?? undefined, significanceExplanation: row.significanceExplanation ?? undefined, suggestedResearchQuestion: row.suggestedResearchQuestion ?? undefined, validationStatus: row.validationStatus as never, gapConfidence: row.gapConfidence as never, researchPriority: row.researchPriority as never, origin: row.origin as never, closureStatus: row.closureStatus as never, questionFacets: (row.questionFacets ?? undefined) as GapListDoc["questionFacets"], refinement: row.refinement as GapListDoc["refinement"], latestClosureCheck: row.latestClosureCheckId ? closureChecks.get(row.latestClosureCheckId) : undefined }, supportingPapersById, { minParentPapers: env.GAP_MIN_PARENT_PAPERS, maxRatio: env.GAP_UNDEREXPLORED_MAX_RATIO, alpha: env.GAP_UNDEREXPLORED_ALPHA, validationQuorum: env.GAP_VALIDATION_QUORUM, canManage: row.userId === user.id || isProjectOwner });
    });
    return { gaps, total };
  },

  async patchStatus(userInput: string, gapInput: string, dto: PatchGapDto) { const user = await resolveUser(userInput), gap = await resolveGap(gapInput); if (!gap) throw AppError.notFound("Research gap not found"); if (gap.projectId) await requireCurrentProjectMembership(gap.projectId, user.id, true); if (gap.userId !== user.id) { const project = gap.projectId ? await getPrisma().project.findUnique({ where: { id: gap.projectId }, select: { ownerId: true } }) : null; if (project?.ownerId !== user.id) throw AppError.forbidden("Only the gap creator or the project owner can update gap status"); } const updated = await getPrisma().researchGap.update({ where: { id: gap.id }, data: { status: dto.status } }); return { id: publicDatabaseId(updated), status: updated.status }; },

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
    // Retrieve a wider pool, then let MMR keep the pack on topic but spread across it (see gap-mmr.ts).
    const pool = await retrieveExpanded(input.topic, input.queryVector, filters, env.GAPS_TOP_K * EVIDENCE_POOL_FACTOR);
    const pinned = selected.papers.map((paper) => paper.id), slots = Math.max(0, env.GAPS_TOP_K - pinned.length);
    retrieved = (await diversifyEvidence(pool.filter((paper) => !pinned.includes(paper.id)), pinned, slots)).map((paper) => ({ ...paper, source: "retrieved" }));
  }
  const seen = new Set<string>(), papers: GapEvidenceCandidate[] = []; for (const paper of [...selected.papers, ...retrieved]) { if (papers.length >= env.GAPS_TOP_K) break; if (!seen.has(paper.id)) { seen.add(paper.id); papers.push(paper); } }
  return { papers: await attachKnowledgeEvidence(papers, input.topic, input.queryVector), selectedPaperIds, retrievedPaperIds: retrieved.map((paper) => paper.id), missingSelectedPaperIds: selected.missingIds };
}

/** Candidates retrieved per evidence slot before MMR picks the pack. */
const EVIDENCE_POOL_FACTOR = 3;

/**
 * Retrieves the full topic and its leave-one-out sub-queries (gap-query-expansion.ts) and fuses them by RRF.
 * Sub-queries are embedded in one batch; without embeddings they run keyword-only. The full topic behaves as before.
 */
async function retrieveExpanded(topic: string, queryVector: number[] | undefined, filters: NonNullable<Parameters<typeof retrieve>[0]["filters"]>, limit: number) {
  const [full, ...subQueries] = expandTopicQueries(topic);
  let subVectors: number[][] | undefined;
  if (subQueries.length && queryVector) {
    try { subVectors = await getEmbeddingProvider().embedBatch(subQueries); }
    catch (error) { logger.warn({ err: error }, "gap sub-query embedding failed; sub-queries run keyword-only"); }
  }
  const lists = await Promise.all([
    retrieve({ queryText: full!, queryVector, topK: limit, filters, fullText: true }),
    ...subQueries.map((query, index) => retrieve({ queryText: query, queryVector: subVectors?.[index], keywordOnly: !subVectors, topK: limit, filters, fullText: true })),
  ]);
  return lists.length > 1 ? fuseByRrf(lists, limit) : lists[0]!;
}

/** MMR over the retrieved pool; falls back to retrieval order when MMR is off or too few papers have embeddings. */
async function diversifyEvidence<T extends { id: string; score: number }>(pool: T[], pinned: string[], slots: number): Promise<T[]> {
  if (env.GAPS_EVIDENCE_MMR_LAMBDA >= 1 || pool.length <= slots) return pool.slice(0, slots);
  const vectors = await loadPaperEmbeddings([...pinned, ...pool.map((paper) => paper.id)]);
  if (pool.filter((paper) => vectors.has(paper.id)).length < 2) return pool.slice(0, slots);
  const picked = selectByMmr(pool.map((paper) => ({ id: paper.id, relevance: paper.score, paper })), vectors, slots, env.GAPS_EVIDENCE_MMR_LAMBDA, pinned);
  return picked.map((candidate) => candidate.paper);
}

async function fetchSelectedGapEvidence(values: string[], input: Pick<CollectGapEvidenceInput, "yearFrom" | "yearTo" | "projectPaperIds">) {
  if (!values.length) return { papers: [] as GapEvidenceCandidate[], missingIds: [] as string[] }; const allowed = input.projectPaperIds ? new Set(input.projectPaperIds) : null; const eligible = allowed ? values.filter((id) => allowed.has(id)) : values; const prisma = getPrisma(); const docs = await prisma.paper.findMany({ where: { OR: eligible.map(idWhere), dataStatus: "active", ...((input.yearFrom !== undefined || input.yearTo !== undefined) ? { publicationYear: { ...(input.yearFrom !== undefined ? { gte: input.yearFrom } : {}), ...(input.yearTo !== undefined ? { lte: input.yearTo } : {}) } } : {}) }, select: { id: true, legacyMongoId: true, title: true, abstractText: true, aiAnalysis: true, publicationYear: true, journalName: true, citationCount: true } }); const authors = await prisma.paperAuthor.findMany({ where: { paperId: { in: docs.map((row) => row.id) } }, orderBy: { position: "asc" } }); const authorMap = new Map<string, string[]>(); for (const author of authors) { const list = authorMap.get(author.paperId) ?? []; list.push(author.displayName); authorMap.set(author.paperId, list); } const byId = new Map<string, typeof docs[number]>(); for (const doc of docs) { byId.set(doc.id, doc); if (doc.legacyMongoId) byId.set(doc.legacyMongoId, doc); }
  const papers: GapEvidenceCandidate[] = [], missingIds: string[] = []; for (const value of values) { const doc = byId.get(value); if (!doc) { missingIds.push(value); continue; } papers.push({ id: publicDatabaseId(doc), title: doc.title, abstractText: doc.abstractText ?? undefined, aiAnalysis: doc.aiAnalysis as never, publicationYear: doc.publicationYear, journalName: doc.journalName ?? undefined, citationCount: doc.citationCount, authorNames: authorMap.get(doc.id) ?? [], score: 1, source: "selected" }); } return { papers, missingIds };
}

function toPreviewGapPaper(paper: GapEvidenceCandidate) { return { id: paper.id, title: paper.title, abstractText: paper.abstractText, publicationYear: paper.publicationYear, journalName: paper.journalName, citationCount: paper.citationCount, authorNames: paper.authorNames, score: paper.score, source: paper.source }; }
