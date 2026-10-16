import type { TrendCompareQuery, TrendExplainBody, TrendExplainHistoryQuery, TrendRelationshipQuery, TrendTopicCandidatesQuery, TopicTrendQuery, TrendsOverviewQuery } from "./dto/trends.schema.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import type { TrendExplanationResponse, TrendPossibleDriver } from "@trend/shared-types";
import { hashKey } from "../../infrastructure/cache.js";
import { LlmContentError } from "../llm/gemini.client.js";
import { cachedGenerateJSON } from "../llm/llm.run.js";
import { aiModel } from "../user-ai/user-ai.runtime.js";
import { buildAllowedTrendNumbers, buildTrendExplainPrompt, buildTrendMetricTrace, generateTrendExplanationWithRetry, pickRepresentativePapers, TREND_EXPLAIN_PROMPT_VERSION, TREND_EXPLAIN_SYSTEM_PROMPT, validateTrendExplanation } from "./trend-explain.prompt.js";
import { computeMetrics, fillMissingYears } from "./trend.formulas.js";
import { logger } from "../../infrastructure/logger.js";
import { computeTopicStatistics } from "./trend.evidence.js";
import { isOpenAlexBudgetAvailable } from "./trend.openalex-client.js";
import { getOpenAlexCompare, getOpenAlexRelationships, getOpenAlexTopicCandidates, getOpenAlexTopicDetail } from "./trend.openalex-detail.js";
import { getOpenAlexTrendsOverview } from "./trend.openalex-overview.js";
import { getPostgresTrendsOverview } from "./trend.postgres.js";

const WINDOW = 10;
const EMPTY_FACETS = { paperKinds: [], openAccessStatuses: [], providers: [], topSources: [], languages: [], citationBands: [], domains: [], fields: [], subfields: [], topics: [] };
function years(input: { yearFrom?: number; yearTo?: number }) { const yearTo = input.yearTo ?? new Date().getFullYear(); return { yearTo, yearFrom: input.yearFrom ?? yearTo - WINDOW, lastCompleteYear: Math.min(yearTo, new Date().getFullYear() - 1) }; }
async function topicRows(topic: string, input: { yearFrom?: number; yearTo?: number; topicId?: string }) { const span = years(input); const topics = await getPrisma().paperTopic.findMany({ where: input.topicId ? { openalexTopicId: { contains: input.topicId, mode: "insensitive" } } : { topicName: { equals: topic, mode: "insensitive" } } }); const ids = [...new Set(topics.map((row) => row.paperId))]; const papers = await getPrisma().paper.findMany({ where: { id: { in: ids }, dataStatus: "active", publicationYear: { gte: span.yearFrom, lte: span.yearTo } } }); return { span, papers, topics }; }
function series(papers: Array<{ publicationYear: number }>, yearFrom: number, yearTo: number) { const counts = new Map<number, number>(); for (const paper of papers) counts.set(paper.publicationYear, (counts.get(paper.publicationYear) ?? 0) + 1); return fillMissingYears([...counts].map(([year, count]) => ({ year, count })), yearFrom, yearTo); }
function citationSeries(papers: Array<{ publicationYear: number; citationCount: number }>, yearFrom: number, yearTo: number) { const groups = new Map<number, { count: number; citations: number }>(); for (const paper of papers) { const row = groups.get(paper.publicationYear) ?? { count: 0, citations: 0 }; row.count++; row.citations += paper.citationCount; groups.set(paper.publicationYear, row); } return Array.from({ length: yearTo - yearFrom + 1 }, (_, index) => { const year = yearFrom + index; const row = groups.get(year) ?? { count: 0, citations: 0 }; return { year, count: row.count, totalCitations: row.citations, avgCitations: row.count ? Math.round((row.citations / row.count) * 10) / 10 : 0 }; }); }
async function topAuthors(paperIds: string[]) { const rows = await getPrisma().paperAuthor.groupBy({ by: ["displayName"], where: { paperId: { in: paperIds } }, _count: { _all: true }, orderBy: { _count: { displayName: "desc" } }, take: 5 }); return rows.map((row) => ({ id: row.displayName, name: row.displayName, count: row._count._all })); }
async function topKeywords(paperIds: string[]) { const rows = await getPrisma().paperKeyword.groupBy({ by: ["keywordName"], where: { paperId: { in: paperIds } }, _count: { _all: true }, orderBy: { _count: { keywordName: "desc" } }, take: 5 }); return rows.map((row) => ({ id: row.keywordName, name: row.keywordName, count: row._count._all })); }
function taxonomy(rows: Array<{ topicName: string; openalexTopicId: string | null; domainId: string | null; domainName: string | null; fieldId: string | null; fieldName: string | null; subfieldId: string | null; subfieldName: string | null }>) { const row = rows[0]; return row ? { topicId: row.openalexTopicId ?? undefined, topicName: row.topicName, domainId: row.domainId ?? undefined, domainName: row.domainName ?? undefined, fieldId: row.fieldId ?? undefined, fieldName: row.fieldName ?? undefined, subfieldId: row.subfieldId ?? undefined, subfieldName: row.subfieldName ?? undefined } : undefined; }

async function topicDetail(topic: string, input: TopicTrendQuery) { const { span, papers, topics } = await topicRows(topic, input); if (!papers.length) throw AppError.notFound(`No papers found for topic "${topic}" in ${span.yearFrom}-${span.yearTo}`); const yearlyBreakdown = series(papers, span.yearFrom, span.yearTo); const journals = new Map<string, number>(); for (const paper of papers) if (paper.journalName) journals.set(paper.journalName, (journals.get(paper.journalName) ?? 0) + 1); const detail = { topic, taxonomy: taxonomy(topics), totalPapers: papers.length, yearlyBreakdown, citationTrend: citationSeries(papers, span.yearFrom, span.yearTo), facets: EMPTY_FACETS, lastCompleteYear: span.lastCompleteYear, ...computeMetrics(yearlyBreakdown, span.lastCompleteYear), topJournals: [...journals].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ id: name, name, count })), topAuthors: await topAuthors(papers.map((row) => row.id)), topKeywords: await topKeywords(papers.map((row) => row.id)), computedAt: new Date().toISOString() }; return { detail, span, papers, topics }; }

/**
 * Counts come from OpenAlex (whole database, aggregate queries). The local
 * corpus is used only when OpenAlex fails, the daily budget is reserved for
 * sync, or the topic has no OpenAlex id; the response then says so.
 */
async function preferOpenAlex<T extends object>(label: string, openAlex: () => Promise<T | null>, local: () => Promise<T>): Promise<T & { dataSource: "openalex" | "local" }> {
  if (isOpenAlexBudgetAvailable()) {
    try {
      const result = await openAlex();
      if (result) return { ...result, dataSource: "openalex" };
    } catch (err) {
      logger.warn({ err, label }, "openalex trends unavailable; using local corpus");
    }
  }
  return { ...(await local()), dataSource: "local" };
}

export const trendService = {
  overview(query: TrendsOverviewQuery) { return preferOpenAlex("overview", () => getOpenAlexTrendsOverview(query), () => getPostgresTrendsOverview(query)); },
  async topic(topic: string, query: TopicTrendQuery) {
    const span = years(query);
    const local = await topicRows(topic, query);
    const detail = await preferOpenAlex("topic", () => getOpenAlexTopicDetail(topic, query), async () => (await topicDetail(topic, query)).detail);
    const scope = (detail.taxonomy ?? taxonomy(local.topics)) as { topicId?: string; openalexTopicId?: string; fieldId?: string; fieldName?: string } | undefined;
    const statistics = await computeTopicStatistics({ topic, topicId: scope?.topicId ?? scope?.openalexTopicId ?? query.topicId, fieldId: scope?.fieldId, fieldName: scope?.fieldName, papers: local.papers, yearFrom: span.yearFrom, lastCompleteYear: span.lastCompleteYear });
    return { ...detail, statistics };
  },
  async topicDetailOnly(topic: string, query: TopicTrendQuery) { return (await topicDetail(topic, query)).detail; },
  compare(query: TrendCompareQuery) { return preferOpenAlex("compare", () => getOpenAlexCompare(query), () => this.localCompare(query)); },
  async localCompare(query: TrendCompareQuery) { const span = years(query); const topics = await Promise.all([...new Set(query.topics)].map(async (topic) => { const detail = await this.topicDetailOnly(topic, query); return { topic, taxonomy: detail.taxonomy, totalPapers: detail.totalPapers, yearlyBreakdown: detail.yearlyBreakdown, citationTrend: detail.citationTrend, momentum: detail.momentum, growthRatePct: detail.growthRatePct, cagr3yPct: detail.cagr3yPct }; })); return { ...span, topics, computedAt: new Date().toISOString() }; },
  topicCandidates(query: TrendTopicCandidatesQuery) { return preferOpenAlex("topic-candidates", () => getOpenAlexTopicCandidates(query), () => this.localTopicCandidates(query)); },
  async localTopicCandidates(query: TrendTopicCandidatesQuery) { const span = years(query); const rows = await getPrisma().paperTopic.groupBy({ by: ["topicName"], where: { topicName: { contains: query.q.trim(), mode: "insensitive" } }, _count: { _all: true }, orderBy: { _count: { topicName: "desc" } }, take: query.limit }); const topics = (await Promise.all(rows.filter((row) => row._count._all >= query.minPapers).map(async (row) => { const detail = await this.topicDetailOnly(row.topicName, span); return { topic: row.topicName, taxonomy: detail.taxonomy, totalPapers: detail.totalPapers, yearlyBreakdown: detail.yearlyBreakdown, matchedBy: "topic" as const, momentum: detail.momentum, growthRatePct: detail.growthRatePct, cagr3yPct: detail.cagr3yPct }; }))).slice(0, query.limit); return { query: query.q.trim(), ...span, totalCandidates: topics.length, topics, computedAt: new Date().toISOString() }; },
  relationships(query: TrendRelationshipQuery) { return preferOpenAlex("relationships", () => getOpenAlexRelationships(query), () => this.localRelationships(query)); },
  async localRelationships(query: TrendRelationshipQuery) { const { span, papers } = await topicRows(query.topic, query); const sourceIds = new Set(papers.map((paper) => paper.id)); const rows = await getPrisma().paperTopic.findMany({ where: { paperId: { in: [...sourceIds] }, topicName: { not: query.topic } } }); const grouped = new Map<string, Set<string>>(); for (const row of rows) { const ids = grouped.get(row.topicName) ?? new Set(); ids.add(row.paperId); grouped.set(row.topicName, ids); } const related = [...grouped].map(([name, ids]) => ({ name, count: ids.size })).sort((a, b) => b.count - a.count).slice(0, query.limit); return { topic: query.topic, yearFrom: span.yearFrom, yearTo: span.yearTo, nodes: [{ id: query.topic, label: query.topic, count: papers.length }, ...related.map((row) => ({ id: row.name, label: row.name, count: row.count }))], edges: related.map((row) => ({ source: query.topic, target: row.name, count: row.count })), computedAt: new Date().toISOString() }; },
  async explain(input: TrendExplainBody, userId?: string): Promise<TrendExplanationResponse> {
    const span = years(input), { topic, language, ...filters } = input, window = { yearFrom: span.yearFrom, yearTo: span.yearTo };
    const overview = await this.overview({ ...filters, ...window, limit: 10, minPapers: 3, sortBy: "trend" });
    const topicDetail = topic ? await this.topic(topic, window).catch(() => null) : null;
    const relationships = topic ? await this.relationships({ topic, ...window, limit: 8 }).catch(() => null) : null;
    // Representative papers are context for "possible drivers" only; they never supply figures.
    const papers = topic && topicDetail ? pickRepresentativePapers((await topicRows(topic, window)).papers, topicDetail.yearlyBreakdown).map((paper) => ({ id: publicDatabaseId(paper), title: paper.title, abstractText: paper.abstractText, publicationYear: paper.publicationYear, citationCount: paper.citationCount })) : [];
    const data = { overview, topicDetail, relationships };
    const metricTrace = buildTrendMetricTrace(data), allowedNumbers = buildAllowedTrendNumbers(data), allowedPaperIds = new Set(papers.map((paper) => paper.id));
    let explanation: TrendExplanationResponse;
    try {
      const keyParts = { topic: topic ?? null, yearFrom: window.yearFrom, yearTo: window.yearTo, language, filters, paperIds: [...allowedPaperIds] };
      explanation = await generateTrendExplanationWithRetry((prompt, { bypassCache }) => cachedGenerateJSON<TrendExplanationResponse>({ task: "trend", promptVersion: TREND_EXPLAIN_PROMPT_VERSION, keyParts, model: aiModel(), prompt, bypassCache, options: { system: TREND_EXPLAIN_SYSTEM_PROMPT, temperature: 0.2, maxOutputTokens: 1200 }, validate: (out) => validateTrendExplanation(out as never, { topic: topic ?? null, language, metricTrace, allowedNumbers, allowedPaperIds }) }), buildTrendExplainPrompt({ ...data, topic: topic ?? null, language, papers }));
    } catch (error) {
      if (error instanceof LlmContentError) { logger.warn({ err: error, topic: topic ?? null }, "trend explanation rejected by validation"); throw AppError.serviceUnavailable("AI không giải thích được xu hướng với số liệu hiện có. Vui lòng thử lại."); }
      throw error;
    }
    // Cached output may predate the drivers' titles; attach them from the papers shown in this request.
    const byId = new Map(papers.map((paper) => [paper.id, paper]));
    explanation = { ...explanation, possibleDrivers: (explanation.possibleDrivers ?? []).map((driver): TrendPossibleDriver => ({ ...driver, papers: driver.paperIds.flatMap((id) => { const paper = byId.get(id); return paper ? [{ id, title: paper.title, publicationYear: paper.publicationYear }] : []; }) })) };
    if (userId) {
      try { const owner = await getPrisma().user.findUnique({ where: whereId(userId) }); if (owner) await getPrisma().trendExplanation.create({ data: { userId: owner.id, topic, language, yearFrom: window.yearFrom, yearTo: window.yearTo, scopeHash: hashKey({ filters, ...window }), scopeLabel: overview.dataSource === "openalex" ? "OpenAlex (whole database)" : "PostgreSQL corpus", scopeFilters: input as never, explanation: explanation as never } }); }
      catch (err) { logger.warn({ err, userId, topic: topic ?? null }, "failed to save trend explanation history"); }
    }
    return explanation;
  },
  async explainHistory(userId: string, query: TrendExplainHistoryQuery) { const owner = await getPrisma().user.findUnique({ where: whereId(userId) }); if (!owner) return { items: [] }; const rows = await getPrisma().trendExplanation.findMany({ where: { userId: owner.id, ...(query.topic ? { topic: query.topic } : {}) }, orderBy: { createdAt: "desc" }, take: query.limit }); return { items: rows.map((row) => ({ ...(row.explanation as object), id: publicDatabaseId(row), yearFrom: row.yearFrom, yearTo: row.yearTo, scopeHash: row.scopeHash, scopeLabel: row.scopeLabel, createdAt: row.createdAt.toISOString() })) }; },
};

function whereId(value: string) { const parsed = parseDatabaseId(value); if (!parsed) throw AppError.badRequest("Invalid identifier"); return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }; }
