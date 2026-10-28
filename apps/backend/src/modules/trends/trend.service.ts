import type { TrendExplanationResponse, TrendPossibleDriver } from "@trend/shared-types";
import type { TrendCompareQuery, TrendExplainBody, TrendExplainHistoryQuery, TrendPeriodsQuery, TrendRelationshipQuery, TrendTopicCandidatesQuery, TopicTrendQuery, TrendsOverviewQuery } from "./dto/trends.schema.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { hashKey } from "../../infrastructure/cache.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { LlmContentError } from "../llm/gemini.client.js";
import { cachedGenerateJSON } from "../llm/llm.run.js";
import { aiModel } from "../user-ai/user-ai.runtime.js";
import { buildAllowedTrendNumbers, buildTrendExplainPrompt, buildTrendMetricTrace, generateTrendExplanationWithRetry, pickRepresentativePapers, TREND_EXPLAIN_PROMPT_VERSION, TREND_EXPLAIN_SYSTEM_PROMPT, validateTrendExplanation } from "./trend-explain.prompt.js";
import { computeTopicStatistics } from "./trend.evidence.js";
import { computeMetrics, fillMissingYears } from "./trend.formulas.js";
import { isOpenAlexBudgetAvailable, shortId } from "./trend.openalex-client.js";
import { getOpenAlexCompare, getOpenAlexRelationships, getOpenAlexTopicCandidates, getOpenAlexTopicDetail } from "./trend.openalex-detail.js";
import { getOpenAlexTrendsOverview } from "./trend.openalex-overview.js";
import { getOpenAlexTrendPeriods } from "./trend.openalex-periods.js";
import { getPostgresTrendPeriods, getPostgresTrendsOverview } from "./trend.postgres.js";

const WINDOW = 10;
/** Papers listed on the topic detail page so the reader can go from the trend to its literature. */
const TOP_PAPERS = 6;
/** Overview scope the AI explanation is grounded on when the client does not send its own. */
const EXPLAIN_OVERVIEW = { limit: 10, minPapers: 3 };
const EMPTY_FACETS = { paperKinds: [], openAccessStatuses: [], providers: [], topSources: [], languages: [], citationBands: [], domains: [], fields: [], subfields: [], topics: [] };

/** Only the columns the trend computations read; abstracts and raw metadata stay in the database. */
const PAPER_SELECT = { id: true, legacyMongoId: true, title: true, publicationYear: true, citationCount: true, journalName: true, citationNormalizedPercentile: true } as const;

type TopicRows = Awaited<ReturnType<typeof topicRows>>;
type TopicRow = TopicRows["topics"][number];

function years(input: { yearFrom?: number; yearTo?: number }) {
  const yearTo = input.yearTo ?? new Date().getFullYear();
  return { yearTo, yearFrom: input.yearFrom ?? yearTo - WINDOW, lastCompleteYear: Math.min(yearTo, new Date().getFullYear() - 1) };
}

/** Papers of one topic in the window. Topic ids are stored short ("T10028"): a URL id is shortened and matched exactly. */
async function topicRows(topic: string, input: { yearFrom?: number; yearTo?: number; topicId?: string }) {
  const span = years(input);
  const topicId = input.topicId ? shortId(input.topicId) : undefined;
  const topics = await getPrisma().paperTopic.findMany({
    where: topicId ? { openalexTopicId: { equals: topicId, mode: "insensitive" } } : { topicName: { equals: topic, mode: "insensitive" } },
  });
  const papers = await getPrisma().paper.findMany({
    where: { id: { in: [...new Set(topics.map((row) => row.paperId))] }, dataStatus: "active", publicationYear: { gte: span.yearFrom, lte: span.yearTo } },
    select: PAPER_SELECT,
  });
  return { span, papers, topics };
}

function series(papers: Array<{ publicationYear: number }>, yearFrom: number, yearTo: number) {
  const counts = new Map<number, number>();
  for (const paper of papers) counts.set(paper.publicationYear, (counts.get(paper.publicationYear) ?? 0) + 1);
  return fillMissingYears([...counts].map(([year, count]) => ({ year, count })), yearFrom, yearTo);
}

function citationSeries(papers: Array<{ publicationYear: number; citationCount: number }>, yearFrom: number, yearTo: number) {
  const groups = new Map<number, { count: number; citations: number }>();
  for (const paper of papers) {
    const row = groups.get(paper.publicationYear) ?? { count: 0, citations: 0 };
    row.count++;
    row.citations += paper.citationCount;
    groups.set(paper.publicationYear, row);
  }
  return Array.from({ length: yearTo - yearFrom + 1 }, (_, index) => {
    const year = yearFrom + index;
    const row = groups.get(year) ?? { count: 0, citations: 0 };
    return { year, count: row.count, totalCitations: row.citations, avgCitations: row.count ? Math.round((row.citations / row.count) * 10) / 10 : 0 };
  });
}

async function topAuthors(paperIds: string[]) {
  const rows = await getPrisma().paperAuthor.groupBy({ by: ["displayName"], where: { paperId: { in: paperIds } }, _count: { _all: true }, orderBy: { _count: { displayName: "desc" } }, take: 5 });
  return rows.map((row) => ({ id: row.displayName, name: row.displayName, count: row._count._all }));
}

async function topKeywords(paperIds: string[]) {
  const rows = await getPrisma().paperKeyword.groupBy({ by: ["keywordName"], where: { paperId: { in: paperIds } }, _count: { _all: true }, orderBy: { _count: { keywordName: "desc" } }, take: 5 });
  return rows.map((row) => ({ id: row.keywordName, name: row.keywordName, count: row._count._all }));
}

function taxonomy(rows: TopicRow[]) {
  const row = rows[0];
  if (!row) return undefined;
  return {
    openalexTopicId: row.openalexTopicId ?? undefined,
    topicName: row.topicName,
    domainId: row.domainId ?? undefined,
    domainName: row.domainName ?? undefined,
    fieldId: row.fieldId ?? undefined,
    fieldName: row.fieldName ?? undefined,
    subfieldId: row.subfieldId ?? undefined,
    subfieldName: row.subfieldName ?? undefined,
  };
}

/** Topic detail computed from the local corpus, from rows already loaded by `topicRows`. */
async function topicDetail(topic: string, { span, papers, topics }: TopicRows) {
  if (!papers.length) throw AppError.notFound(`No papers found for topic "${topic}" in ${span.yearFrom}-${span.yearTo}`);
  const yearlyBreakdown = series(papers, span.yearFrom, span.yearTo);
  const journals = new Map<string, number>();
  for (const paper of papers) if (paper.journalName) journals.set(paper.journalName, (journals.get(paper.journalName) ?? 0) + 1);
  const paperIds = papers.map((row) => row.id);
  const [authors, keywords] = await Promise.all([topAuthors(paperIds), topKeywords(paperIds)]);
  return {
    topic,
    taxonomy: taxonomy(topics),
    totalPapers: papers.length,
    yearlyBreakdown,
    citationTrend: citationSeries(papers, span.yearFrom, span.yearTo),
    facets: EMPTY_FACETS,
    lastCompleteYear: span.lastCompleteYear,
    ...computeMetrics(yearlyBreakdown, span.lastCompleteYear),
    topJournals: [...journals].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ id: name, name, count })),
    topAuthors: authors,
    topKeywords: keywords,
    computedAt: new Date().toISOString(),
  };
}

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

/** Topic detail with statistics and top papers, plus the local rows it was computed from (reused by explain). */
async function topicWithRows(topic: string, query: TopicTrendQuery) {
  const span = years(query);
  const local = await topicRows(topic, query);
  const detail = await preferOpenAlex("topic", () => getOpenAlexTopicDetail(topic, query), () => topicDetail(topic, local));
  const scope = detail.taxonomy ?? taxonomy(local.topics);
  const statistics = await computeTopicStatistics({ topic, topicId: scope?.openalexTopicId ?? query.topicId, fieldId: scope?.fieldId, fieldName: scope?.fieldName, papers: local.papers, yearFrom: span.yearFrom, lastCompleteYear: span.lastCompleteYear });
  const topPapers = [...local.papers]
    .sort((a, b) => b.citationCount - a.citationCount)
    .slice(0, TOP_PAPERS)
    .map((paper) => ({ id: publicDatabaseId(paper), title: paper.title, publicationYear: paper.publicationYear, citationCount: paper.citationCount }));
  return { detail: { ...detail, statistics, topPapers }, papers: local.papers };
}

/** Internal user id of a token subject (UUID or migrated legacy id), or null when there is no such user. */
export async function findUserId(subject: string): Promise<string | null> {
  const parsed = parseDatabaseId(subject);
  if (!parsed) return null;
  const row = await getPrisma().user.findUnique({ where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }, select: { id: true } });
  return row?.id ?? null;
}

export const trendService = {
  overview(query: TrendsOverviewQuery) {
    return preferOpenAlex("overview", () => getOpenAlexTrendsOverview(query), () => getPostgresTrendsOverview(query));
  },

  periods(query: TrendPeriodsQuery) {
    return preferOpenAlex("periods", () => getOpenAlexTrendPeriods(query), () => getPostgresTrendPeriods(query));
  },

  async topic(topic: string, query: TopicTrendQuery) {
    return (await topicWithRows(topic, query)).detail;
  },

  /** Local PostgreSQL computation only: never spends OpenAlex budget. */
  async topicDetailOnly(topic: string, query: TopicTrendQuery) {
    return topicDetail(topic, await topicRows(topic, query));
  },

  compare(query: TrendCompareQuery) {
    return preferOpenAlex("compare", () => getOpenAlexCompare(query), () => this.localCompare(query));
  },

  async localCompare(query: TrendCompareQuery) {
    const span = years(query);
    const topics = await Promise.all(
      [...new Set(query.topics)].map(async (topic) => {
        const detail = await this.topicDetailOnly(topic, query);
        return { topic, taxonomy: detail.taxonomy, totalPapers: detail.totalPapers, yearlyBreakdown: detail.yearlyBreakdown, citationTrend: detail.citationTrend, momentum: detail.momentum, growthRatePct: detail.growthRatePct, cagr3yPct: detail.cagr3yPct };
      }),
    );
    return { ...span, topics, computedAt: new Date().toISOString() };
  },

  topicCandidates(query: TrendTopicCandidatesQuery) {
    return preferOpenAlex("topic-candidates", () => getOpenAlexTopicCandidates(query), () => this.localTopicCandidates(query));
  },

  async localTopicCandidates(query: TrendTopicCandidatesQuery) {
    const span = years(query);
    const rows = await getPrisma().paperTopic.groupBy({ by: ["topicName"], where: { topicName: { contains: query.q.trim(), mode: "insensitive" } }, _count: { _all: true }, orderBy: { _count: { topicName: "desc" } }, take: query.limit });
    const topics = await Promise.all(
      rows
        .filter((row) => row._count._all >= query.minPapers)
        .map(async (row) => {
          const detail = await this.topicDetailOnly(row.topicName, span);
          return { topic: row.topicName, taxonomy: detail.taxonomy, totalPapers: detail.totalPapers, yearlyBreakdown: detail.yearlyBreakdown, matchedBy: "topic" as const, momentum: detail.momentum, growthRatePct: detail.growthRatePct, cagr3yPct: detail.cagr3yPct };
        }),
    );
    return { query: query.q.trim(), ...span, totalCandidates: topics.length, topics, computedAt: new Date().toISOString() };
  },

  relationships(query: TrendRelationshipQuery) {
    return preferOpenAlex("relationships", () => getOpenAlexRelationships(query), () => this.localRelationships(query));
  },

  async localRelationships(query: TrendRelationshipQuery) {
    const { span, papers } = await topicRows(query.topic, query);
    const rows = await getPrisma().paperTopic.findMany({ where: { paperId: { in: papers.map((paper) => paper.id) }, topicName: { not: query.topic } }, select: { paperId: true, topicName: true } });
    const grouped = new Map<string, Set<string>>();
    for (const row of rows) grouped.set(row.topicName, (grouped.get(row.topicName) ?? new Set()).add(row.paperId));
    const related = [...grouped].map(([name, ids]) => ({ name, count: ids.size })).sort((a, b) => b.count - a.count).slice(0, query.limit);
    return {
      topic: query.topic,
      yearFrom: span.yearFrom,
      yearTo: span.yearTo,
      nodes: [{ id: query.topic, label: query.topic, count: papers.length }, ...related.map((row) => ({ id: row.name, label: row.name, count: row.count }))],
      edges: related.map((row) => ({ source: query.topic, target: row.name, count: row.count })),
      computedAt: new Date().toISOString(),
    };
  },

  async explain(input: TrendExplainBody, userId?: string): Promise<TrendExplanationResponse> {
    const span = years(input);
    const { topic, language, minPapers, ...filters } = input;
    const window = { yearFrom: span.yearFrom, yearTo: span.yearTo };
    // The three lookups are independent; a failing topic lookup only drops the topic part of the explanation.
    const [overview, topicResult, relationships] = await Promise.all([
      this.overview({ ...filters, ...window, ...EXPLAIN_OVERVIEW, minPapers: minPapers ?? EXPLAIN_OVERVIEW.minPapers, sortBy: "trend", offset: 0 }),
      topic ? topicWithRows(topic, window).catch(() => null) : null,
      topic ? this.relationships({ topic, ...window, limit: 8 }).catch(() => null) : null,
    ]);
    const topicDetail = topicResult?.detail ?? null;
    // Representative papers are context for "possible drivers" only; they never supply figures.
    const picked = topicResult ? pickRepresentativePapers(topicResult.papers, topicResult.detail.yearlyBreakdown) : [];
    const abstracts = picked.length ? new Map((await getPrisma().paper.findMany({ where: { id: { in: picked.map((paper) => paper.id) } }, select: { id: true, abstractText: true } })).map((row) => [row.id, row.abstractText])) : new Map<string, string | null>();
    const papers = picked.map((paper) => ({ id: publicDatabaseId(paper), title: paper.title, abstractText: abstracts.get(paper.id) ?? null, publicationYear: paper.publicationYear, citationCount: paper.citationCount }));

    const data = { overview, topicDetail, relationships };
    const metricTrace = buildTrendMetricTrace(data);
    const allowedNumbers = buildAllowedTrendNumbers(data);
    const allowedPaperIds = new Set(papers.map((paper) => paper.id));
    let explanation: TrendExplanationResponse;
    try {
      const keyParts = { topic: topic ?? null, yearFrom: window.yearFrom, yearTo: window.yearTo, language, ...(minPapers !== undefined ? { minPapers } : {}), filters, paperIds: [...allowedPaperIds] };
      explanation = await generateTrendExplanationWithRetry(
        (prompt, { bypassCache }) =>
          cachedGenerateJSON<TrendExplanationResponse>({
            task: "trend",
            promptVersion: TREND_EXPLAIN_PROMPT_VERSION,
            keyParts,
            model: aiModel(),
            prompt,
            bypassCache,
            options: { system: TREND_EXPLAIN_SYSTEM_PROMPT, temperature: 0.2, maxOutputTokens: 1200 },
            validate: (out) => validateTrendExplanation(out as never, { topic: topic ?? null, language, metricTrace, allowedNumbers, allowedPaperIds }),
          }),
        buildTrendExplainPrompt({ ...data, topic: topic ?? null, language, papers }),
      );
    } catch (error) {
      if (error instanceof LlmContentError) {
        logger.warn({ err: error, topic: topic ?? null }, "trend explanation rejected by validation");
        throw AppError.serviceUnavailable("AI không giải thích được xu hướng với số liệu hiện có. Vui lòng thử lại.");
      }
      throw error;
    }

    // Cached output may predate the drivers' titles; attach them from the papers shown in this request.
    const byId = new Map(papers.map((paper) => [paper.id, paper]));
    explanation = {
      ...explanation,
      possibleDrivers: (explanation.possibleDrivers ?? []).map((driver): TrendPossibleDriver => ({
        ...driver,
        papers: driver.paperIds.flatMap((id) => {
          const paper = byId.get(id);
          return paper ? [{ id, title: paper.title, publicationYear: paper.publicationYear }] : [];
        }),
      })),
    };

    if (userId) {
      try {
        const ownerId = await findUserId(userId);
        if (ownerId) {
          await getPrisma().trendExplanation.create({
            data: { userId: ownerId, topic, language, yearFrom: window.yearFrom, yearTo: window.yearTo, scopeHash: hashKey({ filters, ...window }), scopeLabel: overview.dataSource === "openalex" ? "OpenAlex (whole database)" : "PostgreSQL corpus", scopeFilters: input as never, explanation: explanation as never },
          });
        }
      } catch (err) {
        logger.warn({ err, userId, topic: topic ?? null }, "failed to save trend explanation history");
      }
    }
    return explanation;
  },

  async explainHistory(userId: string, query: TrendExplainHistoryQuery) {
    const ownerId = await findUserId(userId);
    if (!ownerId) return { items: [] };
    const rows = await getPrisma().trendExplanation.findMany({ where: { userId: ownerId, ...(query.topic ? { topic: query.topic } : {}) }, orderBy: { createdAt: "desc" }, take: query.limit });
    return {
      items: rows.map((row) => ({ ...(row.explanation as object), id: publicDatabaseId(row), yearFrom: row.yearFrom, yearTo: row.yearTo, scopeHash: row.scopeHash, scopeLabel: row.scopeLabel, createdAt: row.createdAt.toISOString() })),
    };
  },
};
