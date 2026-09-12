import type {
  PublicationTrend,
  RisingKeyword,
  TopItem,
  TopicComparisonItem,
  TrendExplanationResponse,
  TopicRelationshipResponse,
  TrendCompareResponse,
  TrendTopicCandidate,
  TrendTopicCandidatesResponse,
  TrendMetricTrace,
  TrendMetricTraceSource,
  TrendExplanationHistoryResponse,
  TrendEvidenceSignal,
  TrendingTopic,
  TrendFacets,
  TrendTaxonomyCoverage,
  TrendTopicTaxonomy,
  TrendsOverview,
  YearlyCitationMetric,
  YearlyCount,
  RecommendedTrendComparison,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { cache, hashKey } from "../../infrastructure/cache.js";
import { logger } from "../../infrastructure/logger.js";
import { cachedGenerateJSON } from "../llm/llm.run.js";
import { PaperModel } from "../papers/models/paper.model.js";
import {
  buildCitationMetric,
  citationBand,
  fillMissingCitationYears,
  fillMissingYearsFromCounts,
  toFacetBuckets,
  toTaxonomyFacetBuckets,
} from "./trend.intelligence.js";
import { computeMetrics, fillMissingYears, yoyGrowthPct, truncateToCompleteYears } from "./trend.formulas.js";
import { buildTrendMatchStage, buildUnwoundTopicMatch, describeAppliedTrendFilters } from "./trend.filters.js";
import type {
  TopicTrendQuery,
  TrendTopicCandidatesQuery,
  TrendCompareQuery,
  TrendExplainBody,
  TrendExplainHistoryQuery,
  TrendRelationshipQuery,
  TrendsOverviewQuery,
} from "./dto/trends.schema.js";
import { TrendExplanationModel } from "./models/trend-explanation.model.js";

/**
 * Trends — aggregates research_papers into "what's rising, what's fading".
 *
 * Strategy: compute on-demand with MongoDB aggregation (cheap at current
 * collection size — single-digit ms) and memoize in Redis for an hour. Trend
 * data only changes when a sync runs, so a 1h TTL is effectively fresh.
 * Bump CACHE_VERSION whenever shapes/formulas change to invalidate old keys.
 */
const CACHE_VERSION = "trends-v7";
const CACHE_TTL_SECONDS = 3600;

/** Default analysis window: the last 6 calendar years (5 complete + current). */
const DEFAULT_WINDOW_YEARS = 5;

/** A keyword only qualifies as "rising" if its previous complete year had at
 *  least this many papers — otherwise 1→9 papers posts a meaningless +800%
 *  and buries genuinely emerging directions. */
const MIN_RISING_PREV_BASE = 2;

interface GroupedSeries {
  /** topicName / keywordName */
  _id: string;
  total: number;
  years: YearlyCount[];
  taxonomy?: TrendTopicTaxonomy;
}

export const trendService = {
  /** GET /trends — top trending topics + rising keywords across the corpus. */
  async overview(query: TrendsOverviewQuery): Promise<TrendsOverview> {
    const startedAt = Date.now();
    const now = new Date();
    const yearTo = query.yearTo ?? now.getFullYear();
    const yearFrom = query.yearFrom ?? yearTo - DEFAULT_WINDOW_YEARS;
    const lastCompleteYear = Math.min(yearTo, now.getFullYear() - 1);
    const { limit, minPapers, sortBy } = query;
    const filtersApplied = describeAppliedTrendFilters({ ...query, yearFrom, yearTo });

    const cacheKey = `${CACHE_VERSION}:overview:${hashKey({ yearFrom, yearTo, limit, minPapers, sortBy, filtersApplied })}`;
    const cached = await cache.get<TrendsOverview>(cacheKey);
    if (cached) {
      logger.info(
        { cacheHit: true, durationMs: Date.now() - startedAt, yearFrom, yearTo, filtersApplied },
        "trend overview served",
      );
      return cached;
    }

    const filterInput = { ...query, yearFrom, yearTo };
    const matchStage = buildTrendMatchStage(filterInput);
    const unwoundTopicMatch = buildUnwoundTopicMatch(filterInput);

    const [
      topicGroups,
      keywordGroups,
      totalPapersInWindow,
      uniqueTopicsInScope,
      yearlyTotalPapers,
      citationTrend,
      facets,
      taxonomyCoverage,
    ] = await Promise.all([
      groupYearlyCounts("$topics.topicName", "$topics", matchStage, minPapers, topicTaxonomyProjection(), unwoundTopicMatch),
      groupYearlyCounts("$keywords.keywordName", "$keywords", matchStage, 3),
      PaperModel.countDocuments(matchStage),
      countUniqueTopics(matchStage, unwoundTopicMatch),
      getYearlyPaperCounts(matchStage, yearFrom, yearTo),
      getCitationTrend(matchStage, yearFrom, yearTo),
      getTrendFacets(matchStage, unwoundTopicMatch),
      getTaxonomyCoverage(matchStage),
    ]);

    const topics: TrendingTopic[] = topicGroups.map((g) => {
      const yearlyBreakdown = fillMissingYears(g.years, yearFrom, yearTo);
      return {
        topic: g._id,
        taxonomy: compactTaxonomy(g.taxonomy),
        totalPapers: g.total,
        yearlyBreakdown,
        ...computeMetrics(yearlyBreakdown, lastCompleteYear),
      };
    });

    topics.sort((a, b) => {
      if (sortBy === "growth") return b.growthRatePct - a.growthRatePct;
      if (sortBy === "total") return b.totalPapers - a.totalPapers;
      return b.momentum - a.momentum;
    });

    // Rising keyword = strong recent growth from a small base — the early
    // signal of a NEW research direction (exactly what a thesis hunter wants).
    // Gate on the previous-year base so a 1→9 fluke can't post +800% and
    // outrank a genuine 8→40 takeoff.
    const risingKeywords: RisingKeyword[] = keywordGroups
      .map((g) => {
        const yearlyBreakdown = fillMissingYears(g.years, yearFrom, yearTo);
        const complete = truncateToCompleteYears(yearlyBreakdown, lastCompleteYear);
        const prevBase = complete.length >= 2 ? complete[complete.length - 2]!.count : 0;
        return {
          keyword: g._id,
          totalPapers: g.total,
          growthRatePct: yoyGrowthPct(complete),
          yearlyBreakdown,
          prevBase,
        };
      })
      .filter((k) => k.growthRatePct > 0 && k.prevBase >= MIN_RISING_PREV_BASE)
      .sort((a, b) => b.growthRatePct - a.growthRatePct || a.totalPapers - b.totalPapers)
      .slice(0, 10)
      .map(({ prevBase: _internal, ...k }) => k);

    const result: TrendsOverview = {
      yearFrom,
      yearTo,
      lastCompleteYear,
      totalPapersInWindow,
      uniqueTopicsInScope,
      yearlyTotalPapers,
      citationTrend,
      facets,
      taxonomyCoverage,
      recommendedComparisons: buildRecommendedComparisons(topics),
      topics: topics.slice(0, limit),
      risingKeywords,
      computedAt: now.toISOString(),
    };

    await cache.set(cacheKey, result, CACHE_TTL_SECONDS);
    logger.info(
      {
        cacheHit: false,
        durationMs: Date.now() - startedAt,
        yearFrom,
        yearTo,
        filtersApplied,
        totalPapersInWindow,
        uniqueTopicsInScope,
        topics: result.topics.length,
        risingKeywords: result.risingKeywords.length,
      },
      "trend overview served",
    );
    return result;
  },

  /** GET /trends/compare — compare 2-5 topics on the same yearly/citation axes. */
  async compare(query: TrendCompareQuery): Promise<TrendCompareResponse> {
    const now = new Date();
    const yearTo = query.yearTo ?? now.getFullYear();
    const yearFrom = query.yearFrom ?? yearTo - DEFAULT_WINDOW_YEARS;
    const lastCompleteYear = Math.min(yearTo, now.getFullYear() - 1);
    const topics = [...new Set(query.topics)];
    const filtersApplied = describeAppliedTrendFilters({ ...query, yearFrom, yearTo });

    const cacheKey = `${CACHE_VERSION}:compare:${hashKey({ topics, yearFrom, yearTo, filtersApplied })}`;
    const cached = await cache.get<TrendCompareResponse>(cacheKey);
    if (cached) return cached;

    const baseMatch = buildTrendMatchStage({ ...query, yearFrom, yearTo });

    const items = await Promise.all(
      topics.map(async (topic) => {
        const matchStage = {
          ...baseMatch,
          "topics.topicName": topic,
        };
        const [yearGroups, citationTrend] = await Promise.all([
          PaperModel.aggregate<{ _id: number; count: number }>([
            { $match: matchStage },
            { $group: { _id: "$publicationYear", count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ]),
          getCitationTrend(matchStage, yearFrom, yearTo),
        ]);
        const taxonomy = await getTopicTaxonomy(matchStage, topic);
        const yearlyBreakdown = fillMissingYears(
          yearGroups.map((g) => ({ year: g._id, count: g.count })),
          yearFrom,
          yearTo,
        );
        return {
          topic,
          taxonomy: compactTaxonomy(taxonomy),
          totalPapers: yearlyBreakdown.reduce((sum, p) => sum + p.count, 0),
          yearlyBreakdown,
          citationTrend,
          ...computeMetrics(yearlyBreakdown, lastCompleteYear),
        } satisfies TopicComparisonItem;
      }),
    );

    const result: TrendCompareResponse = {
      yearFrom,
      yearTo,
      lastCompleteYear,
      topics: items,
      computedAt: now.toISOString(),
    };

    await cache.set(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  },

  /** GET /trends/topic-candidates — search comparable topics inside the current Data Scope. */
  async topicCandidates(query: TrendTopicCandidatesQuery): Promise<TrendTopicCandidatesResponse> {
    const startedAt = Date.now();
    const now = new Date();
    const yearTo = query.yearTo ?? now.getFullYear();
    const yearFrom = query.yearFrom ?? yearTo - DEFAULT_WINDOW_YEARS;
    const lastCompleteYear = Math.min(yearTo, now.getFullYear() - 1);
    const filtersApplied = describeAppliedTrendFilters({ ...query, yearFrom, yearTo });
    const searchText = query.q.trim();

    const cacheKey = `${CACHE_VERSION}:topic-candidates:${hashKey({
      q: searchText.toLowerCase(),
      yearFrom,
      yearTo,
      limit: query.limit,
      minPapers: query.minPapers,
      filtersApplied,
    })}`;
    const cached = await cache.get<TrendTopicCandidatesResponse>(cacheKey);
    if (cached) return cached;

    const filterInput = { ...query, yearFrom, yearTo };
    const matchStage = buildTrendMatchStage(filterInput);
    const unwoundTopicMatch = buildUnwoundTopicMatch(filterInput);
    const searchRegex = new RegExp(escapeRegExp(searchText), "i");
    const postUnwindMatch: Record<string, unknown> = {
      ...(Object.keys(unwoundTopicMatch).length > 0 ? unwoundTopicMatch : {}),
      $or: [
        { "topics.topicName": searchRegex },
        { "topics.domainName": searchRegex },
        { "topics.fieldName": searchRegex },
        { "topics.subfieldName": searchRegex },
      ],
    };

    const groups = await groupYearlyCounts(
      "$topics.topicName",
      "$topics",
      matchStage,
      query.minPapers,
      topicTaxonomyProjection(),
      postUnwindMatch,
    );

    const lowerQuery = searchText.toLowerCase();
    const candidates: TrendTopicCandidate[] = groups.map((g) => {
      const yearlyBreakdown = fillMissingYears(g.years, yearFrom, yearTo);
      const taxonomy = compactTaxonomy(g.taxonomy);
      return {
        topic: g._id,
        taxonomy,
        totalPapers: g.total,
        yearlyBreakdown,
        matchedBy: g._id.toLowerCase().includes(lowerQuery) ? "topic" : "taxonomy",
        ...computeMetrics(yearlyBreakdown, lastCompleteYear),
      };
    });

    candidates.sort((a, b) => {
      const rankA = candidateMatchRank(a, lowerQuery);
      const rankB = candidateMatchRank(b, lowerQuery);
      return rankA - rankB || b.momentum - a.momentum || b.totalPapers - a.totalPapers;
    });

    const result: TrendTopicCandidatesResponse = {
      query: searchText,
      yearFrom,
      yearTo,
      lastCompleteYear,
      totalCandidates: candidates.length,
      topics: candidates.slice(0, query.limit),
      computedAt: now.toISOString(),
    };

    await cache.set(cacheKey, result, CACHE_TTL_SECONDS);
    logger.info(
      {
        durationMs: Date.now() - startedAt,
        q: searchText,
        yearFrom,
        yearTo,
        filtersApplied,
        candidates: candidates.length,
      },
      "trend topic candidates served",
    );
    return result;
  },

  /** GET /trends/relationships — graph-ready topic co-occurrence for one topic. */
  async relationships(query: TrendRelationshipQuery): Promise<TopicRelationshipResponse> {
    const now = new Date();
    const yearTo = query.yearTo ?? now.getFullYear();
    const yearFrom = query.yearFrom ?? yearTo - DEFAULT_WINDOW_YEARS;
    const { topic, limit, ...filters } = query;
    const filtersApplied = describeAppliedTrendFilters({ ...filters, yearFrom, yearTo });

    const cacheKey = `${CACHE_VERSION}:relationships:${hashKey({ topic, yearFrom, yearTo, limit, filtersApplied })}`;
    const cached = await cache.get<TopicRelationshipResponse>(cacheKey);
    if (cached) return cached;

    const matchStage = {
      ...buildTrendMatchStage({ ...filters, yearFrom, yearTo }),
      "topics.topicName": topic,
    };

    const [sourceCount, related] = await Promise.all([
      PaperModel.countDocuments(matchStage),
      PaperModel.aggregate<{ _id: string; count: number }>([
        { $match: matchStage },
        { $unwind: "$topics" },
        { $match: { "topics.topicName": { $ne: topic, $nin: [null, ""] } } },
        { $group: { _id: "$topics.topicName", papers: { $addToSet: "$_id" } } },
        { $set: { count: { $size: "$papers" } } },
        { $sort: { count: -1 } },
        { $limit: limit },
        { $project: { count: 1 } },
      ]),
    ]);

    const nodes = [
      { id: topic, label: topic, count: sourceCount },
      ...related.map((r) => ({ id: r._id, label: r._id, count: r.count })),
    ];
    const edges = related.map((r) => ({ source: topic, target: r._id, count: r.count }));
    const result: TopicRelationshipResponse = { topic, yearFrom, yearTo, nodes, edges, computedAt: now.toISOString() };

    await cache.set(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  },

  /** POST /trends/explain — AI explanation grounded only in aggregate trend metrics. */
  async explain(input: TrendExplainBody, userId?: string): Promise<TrendExplanationResponse> {
    const now = new Date();
    const yearTo = input.yearTo ?? now.getFullYear();
    const yearFrom = input.yearFrom ?? yearTo - DEFAULT_WINDOW_YEARS;
    const { topic, language, ...filters } = input;
    const filtersApplied = describeAppliedTrendFilters({ ...filters, yearFrom, yearTo });
    const overview = await this.overview({ ...filters, yearFrom, yearTo, limit: 10, minPapers: 3, sortBy: "momentum" });
    const topicDetail = topic ? await this.topic(topic, { ...filters, yearFrom, yearTo }).catch(() => null) : null;
    const relationships = topic
      ? await this.relationships({ topic, ...filters, yearFrom, yearTo, limit: 8 }).catch(() => null)
      : null;

    const prompt = buildTrendExplainPrompt({
      topic: topic ?? null,
      language,
      overview,
      topicDetail,
      relationships,
    });

    const metricTrace = buildTrendMetricTrace(overview, topicDetail, relationships);
    const explanation = await cachedGenerateJSON<TrendExplanationResponse>({
      task: "trend",
      promptVersion: "trend-explain-v2",
      keyParts: {
        topic: topic ?? null,
        yearFrom,
        yearTo,
        language,
        filtersApplied,
        overviewComputedAt: overview.computedAt,
        topicComputedAt: topicDetail?.computedAt ?? null,
      },
      prompt,
      options: { temperature: 0.2, maxOutputTokens: 1000 },
      validate: (out) => validateTrendExplanation(out, topic ?? null, language, metricTrace),
    });

    if (userId) {
      await saveTrendExplanation({
        userId,
        explanation,
        yearFrom,
        yearTo,
        scopeFilters: filters,
        scopeHash: hashKey({ filtersApplied, yearFrom, yearTo }),
        scopeLabel: buildScopeLabel(filtersApplied),
      }).catch((err) => {
        logger.warn({ err, userId, topic: topic ?? null }, "failed to save trend explanation history");
      });
    }

    return explanation;
  },

  async explainHistory(userId: string, query: TrendExplainHistoryQuery): Promise<TrendExplanationHistoryResponse> {
    const filter: Record<string, unknown> = { userId };
    if (query.topic) filter.topic = query.topic;

    const docs = await TrendExplanationModel.find(filter).sort({ createdAt: -1 }).limit(query.limit).lean();
    return {
      items: docs.map((doc) => ({
        ...(doc.explanation as TrendExplanationResponse),
        id: String(doc._id),
        yearFrom: doc.yearFrom,
        yearTo: doc.yearTo,
        scopeHash: doc.scopeHash,
        scopeLabel: doc.scopeLabel,
        createdAt: doc.createdAt.toISOString(),
      })),
    };
  },

  /** GET /trends/:topic — yearly series + metrics + top journals/authors/keywords. */
  async topic(topicName: string, query: TopicTrendQuery): Promise<PublicationTrend> {
    const now = new Date();
    const yearTo = query.yearTo ?? now.getFullYear();
    const yearFrom = query.yearFrom ?? yearTo - DEFAULT_WINDOW_YEARS;
    const lastCompleteYear = Math.min(yearTo, now.getFullYear() - 1);
    const topicIds = query.topicId ? expandOpenAlexEntityId(query.topicId) : [];
    const topicCriteria = topicIds.length > 0 ? { "topics.openalexTopicId": { $in: topicIds } } : { "topics.topicName": topicName };
    const filtersApplied = describeAppliedTrendFilters({ ...query, yearFrom, yearTo });

    const cacheKey = `${CACHE_VERSION}:topic:${hashKey({ topicName, topicIds, yearFrom, yearTo, filtersApplied })}`;
    const cached = await cache.get<PublicationTrend>(cacheKey);
    if (cached) return cached;

    const baseMatchStage = buildTrendMatchStage({ ...query, yearFrom, yearTo });
    const matchStage = {
      ...baseMatchStage,
      ...topicCriteria,
    };
    const topicPostUnwindMatch = topicIds.length > 0 ? { "topics.openalexTopicId": { $in: topicIds } } : { "topics.topicName": topicName };

    const [yearGroups, citationTrend, facets, taxonomy, topJournals, topAuthors, topKeywords] = await Promise.all([
      PaperModel.aggregate<{ _id: number; count: number }>([
        { $match: matchStage },
        { $group: { _id: "$publicationYear", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      getCitationTrend(matchStage, yearFrom, yearTo),
      getTrendFacets(matchStage, topicPostUnwindMatch),
      getTopicTaxonomy(matchStage, topicName, topicIds),
      topByField(matchStage, "$journalName"),
      topByUnwound(matchStage, "$authors", "$authors.displayName"),
      topByUnwound(matchStage, "$keywords", "$keywords.keywordName"),
    ]);

    const totalPapers = yearGroups.reduce((s, g) => s + g.count, 0);
    if (totalPapers === 0) {
      throw AppError.notFound(`No papers found for topic "${topicName}" in ${yearFrom}-${yearTo}`);
    }

    const yearlyBreakdown = fillMissingYears(
      yearGroups.map((g) => ({ year: g._id, count: g.count })),
      yearFrom,
      yearTo,
    );

    const result: PublicationTrend = {
      topic: topicName,
      taxonomy: compactTaxonomy(taxonomy),
      totalPapers,
      yearlyBreakdown,
      citationTrend,
      facets,
      lastCompleteYear,
      ...computeMetrics(yearlyBreakdown, lastCompleteYear),
      topJournals,
      topAuthors,
      topKeywords,
      computedAt: now.toISOString(),
    };

    await cache.set(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  },
};

/**
 * Shared aggregation: unwind an embedded array, count DISTINCT papers per
 * (name, year), then regroup into one yearly series per name.
 *
 * $addToSet of the paper _id (instead of $sum: 1) makes one paper contribute
 * at most 1 even if its embedded array repeats the same name twice.
 */
async function groupYearlyCounts(
  nameField: string,
  unwindPath: string,
  matchStage: Record<string, unknown>,
  minTotal: number,
  metadataProjection?: Record<string, string>,
  postUnwindMatch?: Record<string, unknown>,
): Promise<GroupedSeries[]> {
  const metadataEntries = metadataProjection ? Object.entries(metadataProjection) : [];
  const firstGroupMetadata = Object.fromEntries(
    metadataEntries.map(([key, value]) => [`meta_${key}`, { $first: value }]),
  );
  const secondGroupTaxonomy = Object.fromEntries(
    metadataEntries.map(([key]) => [key, `$meta_${key}`]),
  );
  const postUnwindStages = postUnwindMatch && Object.keys(postUnwindMatch).length > 0 ? [{ $match: postUnwindMatch }] : [];

  return PaperModel.aggregate<GroupedSeries>([
    { $match: matchStage },
    { $unwind: unwindPath },
    ...postUnwindStages,
    {
      $group: {
        _id: { name: nameField, year: "$publicationYear" },
        papers: { $addToSet: "$_id" },
        ...firstGroupMetadata,
      },
    },
    { $set: { count: { $size: "$papers" } } },
    {
      $group: {
        _id: "$_id.name",
        total: { $sum: "$count" },
        years: { $push: { year: "$_id.year", count: "$count" } },
        ...(metadataEntries.length > 0 ? { taxonomy: { $first: secondGroupTaxonomy } } : {}),
      },
    },
    { $match: { total: { $gte: minTotal }, _id: { $ne: null } } },
    { $sort: { total: -1 } },
  ]);
}

/** Top-5 count of a scalar field (e.g. journalName) under a match. */
async function topByField(
  matchStage: Record<string, unknown>,
  field: string,
): Promise<TopItem[]> {
  const rows = await PaperModel.aggregate<{ _id: string; count: number }>([
    { $match: matchStage },
    { $match: { [field.slice(1)]: { $nin: [null, ""] } } },
    { $group: { _id: field, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);
  return rows.map((r) => ({ id: r._id, name: r._id, count: r.count }));
}

/** Top-5 DISTINCT-paper count of a name inside an embedded array
 *  (authors, keywords). $addToSet dedupes intra-paper repeats. */
async function topByUnwound(
  matchStage: Record<string, unknown>,
  unwindPath: string,
  nameField: string,
): Promise<TopItem[]> {
  const rows = await PaperModel.aggregate<{ _id: string; count: number }>([
    { $match: matchStage },
    { $unwind: unwindPath },
    { $group: { _id: nameField, papers: { $addToSet: "$_id" } } },
    { $match: { _id: { $ne: null } } },
    { $set: { count: { $size: "$papers" } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $project: { count: 1 } },
  ]);
  return rows.map((r) => ({ id: r._id, name: r._id, count: r.count }));
}

async function getYearlyPaperCounts(
  matchStage: Record<string, unknown>,
  yearFrom: number,
  yearTo: number,
): Promise<YearlyCount[]> {
  const rows = await PaperModel.aggregate<{ _id: number; count: number }>([
    { $match: matchStage },
    { $group: { _id: "$publicationYear", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return fillMissingYearsFromCounts(rows.map((r) => ({ year: r._id, count: r.count })), yearFrom, yearTo);
}

async function countUniqueTopics(
  matchStage: Record<string, unknown>,
  topicPostUnwindMatch?: Record<string, unknown>,
): Promise<number> {
  const postUnwindStages = topicPostUnwindMatch && Object.keys(topicPostUnwindMatch).length > 0 ? [{ $match: topicPostUnwindMatch }] : [];
  const rows = await PaperModel.aggregate<{ count: number }>([
    { $match: matchStage },
    { $unwind: "$topics" },
    ...postUnwindStages,
    { $match: { "topics.topicName": { $nin: [null, ""] } } },
    { $group: { _id: "$topics.topicName" } },
    { $count: "count" },
  ]);
  return rows[0]?.count ?? 0;
}

async function getCitationTrend(
  matchStage: Record<string, unknown>,
  yearFrom: number,
  yearTo: number,
): Promise<YearlyCitationMetric[]> {
  const rows = await PaperModel.aggregate<{ _id: number; count: number; totalCitations: number }>([
    { $match: matchStage },
    {
      $group: {
        _id: "$publicationYear",
        count: { $sum: 1 },
        totalCitations: { $sum: { $ifNull: ["$citationCount", 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return fillMissingCitationYears(
    rows.map((r) => buildCitationMetric(r._id, r.count, r.totalCitations)),
    yearFrom,
    yearTo,
  );
}

async function getTrendFacets(
  matchStage: Record<string, unknown>,
  topicPostUnwindMatch?: Record<string, unknown>,
): Promise<TrendFacets> {
  const [
    paperKinds,
    openAccessStatuses,
    providers,
    topSources,
    languages,
    domains,
    fields,
    subfields,
    topics,
    citationRows,
  ] = await Promise.all([
    facetByField(matchStage, "$paperKind", 10),
    facetByField(matchStage, "$openAccessStatus", 10),
    facetByField(matchStage, "$primaryProvider", 10),
    facetByField(matchStage, "$journalName", 10),
    facetByField(matchStage, "$language", 20),
    facetByUnwoundTaxonomy(matchStage, "$topics.domainId", "$topics.domainName", 10, topicPostUnwindMatch),
    facetByUnwoundTaxonomy(matchStage, "$topics.fieldId", "$topics.fieldName", 10, topicPostUnwindMatch),
    facetByUnwoundTaxonomy(matchStage, "$topics.subfieldId", "$topics.subfieldName", 10, topicPostUnwindMatch),
    facetByUnwoundTaxonomy(matchStage, "$topics.openalexTopicId", "$topics.topicName", 10, topicPostUnwindMatch),
    PaperModel.aggregate<{ _id: string; count: number }>([
      { $match: matchStage },
      {
        $project: {
          band: {
            $switch: {
              branches: [
                { case: { $gte: [{ $ifNull: ["$citationCount", 0] }, 1000] }, then: "1000+" },
                { case: { $gte: [{ $ifNull: ["$citationCount", 0] }, 500] }, then: "500-999" },
                { case: { $gte: [{ $ifNull: ["$citationCount", 0] }, 100] }, then: "100-499" },
                { case: { $gte: [{ $ifNull: ["$citationCount", 0] }, 50] }, then: "50-99" },
                { case: { $gte: [{ $ifNull: ["$citationCount", 0] }, 10] }, then: "10-49" },
              ],
              default: "0-9",
            },
          },
        },
      },
      { $group: { _id: "$band", count: { $sum: 1 } } },
    ]),
  ]);

  const citationOrder = ["0-9", "10-49", "50-99", "100-499", "500-999", "1000+"];
  const byBand = new Map(citationRows.map((r) => [r._id, r.count]));
  return {
    paperKinds,
    openAccessStatuses,
    providers,
    topSources,
    languages,
    domains,
    fields,
    subfields,
    topics,
    citationBands: citationOrder
      .map((band) => ({ id: band, name: band, count: byBand.get(band) ?? 0 }))
      .filter((b) => b.count > 0 || citationBand(Number.parseInt(b.id, 10) || 0) === b.id),
  };
}

async function facetByField(
  matchStage: Record<string, unknown>,
  field: string,
  limit: number,
): Promise<TopItem[]> {
  const rows = await PaperModel.aggregate<{ _id: string | null; count: number }>([
    { $match: matchStage },
    { $group: { _id: field, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);
  return toFacetBuckets(rows);
}

async function facetByUnwoundField(
  matchStage: Record<string, unknown>,
  unwindPath: string,
  field: string,
  limit: number,
): Promise<TopItem[]> {
  const rows = await PaperModel.aggregate<{ _id: string | null; count: number }>([
    { $match: matchStage },
    { $unwind: unwindPath },
    { $group: { _id: field, papers: { $addToSet: "$_id" } } },
    { $match: { _id: { $nin: [null, ""] } } },
    { $set: { count: { $size: "$papers" } } },
    { $sort: { count: -1 } },
    { $limit: limit },
    { $project: { count: 1 } },
  ]);
  return toFacetBuckets(rows);
}

async function facetByUnwoundTaxonomy(
  matchStage: Record<string, unknown>,
  idField: string,
  nameField: string,
  limit: number,
  postUnwindMatch?: Record<string, unknown>,
): Promise<TopItem[]> {
  const postUnwindStages = postUnwindMatch && Object.keys(postUnwindMatch).length > 0 ? [{ $match: postUnwindMatch }] : [];
  const rows = await PaperModel.aggregate<{ _id: { id?: string | null; name?: string | null } | null; count: number }>([
    { $match: matchStage },
    { $unwind: "$topics" },
    ...postUnwindStages,
    {
      $group: {
        _id: { id: idField, name: nameField },
        papers: { $addToSet: "$_id" },
      },
    },
    { $match: { "_id.name": { $nin: [null, ""] } } },
    { $set: { count: { $size: "$papers" } } },
    { $sort: { count: -1 } },
    { $limit: limit },
    { $project: { count: 1 } },
  ]);
  return toTaxonomyFacetBuckets(rows);
}

function topicTaxonomyProjection(): Record<keyof TrendTopicTaxonomy, string> {
  return {
    openalexTopicId: "$topics.openalexTopicId",
    domainId: "$topics.domainId",
    domainName: "$topics.domainName",
    fieldId: "$topics.fieldId",
    fieldName: "$topics.fieldName",
    subfieldId: "$topics.subfieldId",
    subfieldName: "$topics.subfieldName",
  };
}

function compactTaxonomy(taxonomy?: TrendTopicTaxonomy | null): TrendTopicTaxonomy | undefined {
  if (!taxonomy) return undefined;
  const compact = Object.fromEntries(
    Object.entries(taxonomy).filter(([, value]) => typeof value === "string" && value.trim().length > 0),
  ) as TrendTopicTaxonomy;
  return Object.keys(compact).length > 0 ? compact : undefined;
}

async function getTopicTaxonomy(
  matchStage: Record<string, unknown>,
  topicName: string,
  topicIds: string[] = [],
): Promise<TrendTopicTaxonomy | undefined> {
  const topicMatch = topicIds.length > 0
    ? { "topics.openalexTopicId": { $in: topicIds } }
    : { "topics.topicName": topicName };
  const rows = await PaperModel.aggregate<{ taxonomy: TrendTopicTaxonomy }>([
    { $match: matchStage },
    { $unwind: "$topics" },
    { $match: topicMatch },
    {
      $sort: {
        "topics.isPrimary": -1,
        "topics.confidence": -1,
        citationCount: -1,
      },
    },
    {
      $project: {
        taxonomy: {
          openalexTopicId: "$topics.openalexTopicId",
          domainId: "$topics.domainId",
          domainName: "$topics.domainName",
          fieldId: "$topics.fieldId",
          fieldName: "$topics.fieldName",
          subfieldId: "$topics.subfieldId",
          subfieldName: "$topics.subfieldName",
        },
      },
    },
    { $limit: 1 },
  ]);
  return compactTaxonomy(rows[0]?.taxonomy);
}

async function getTaxonomyCoverage(matchStage: Record<string, unknown>): Promise<TrendTaxonomyCoverage> {
  const [row] = await PaperModel.aggregate<{
    total: Array<{ count: number }>;
    withAnyTopic: Array<{ count: number }>;
    withPrimaryTopic: Array<{ count: number }>;
    withFullHierarchy: Array<{ count: number }>;
  }>([
    { $match: matchStage },
    {
      $facet: {
        total: [{ $count: "count" }],
        withAnyTopic: [{ $match: { "topics.0": { $exists: true } } }, { $count: "count" }],
        withPrimaryTopic: [{ $match: { topics: { $elemMatch: { isPrimary: true } } } }, { $count: "count" }],
        withFullHierarchy: [
          {
            $match: {
              topics: {
                $elemMatch: {
                  isPrimary: true,
                  openalexTopicId: { $nin: [null, ""] },
                  domainId: { $nin: [null, ""] },
                  domainName: { $nin: [null, ""] },
                  fieldId: { $nin: [null, ""] },
                  fieldName: { $nin: [null, ""] },
                  subfieldId: { $nin: [null, ""] },
                  subfieldName: { $nin: [null, ""] },
                },
              },
            },
          },
          { $count: "count" },
        ],
      },
    },
  ]);

  const totalPapers = row?.total[0]?.count ?? 0;
  const papersWithAnyTopic = row?.withAnyTopic[0]?.count ?? 0;
  const papersWithPrimaryTopic = row?.withPrimaryTopic[0]?.count ?? 0;
  const papersWithFullHierarchy = row?.withFullHierarchy[0]?.count ?? 0;

  return {
    totalPapers,
    papersWithAnyTopic,
    papersWithPrimaryTopic,
    papersWithFullHierarchy,
    anyTopicCoveragePct: percent(papersWithAnyTopic, totalPapers),
    primaryTopicCoveragePct: percent(papersWithPrimaryTopic, totalPapers),
    fullHierarchyCoveragePct: percent(papersWithFullHierarchy, totalPapers),
  };
}

function buildRecommendedComparisons(topics: TrendingTopic[]): RecommendedTrendComparison[] {
  const recommendations: RecommendedTrendComparison[] = [];
  const used = new Set<string>();

  const add = (items: TrendingTopic[], reason: string, sharedTaxonomy?: RecommendedTrendComparison["sharedTaxonomy"]) => {
    const unique = items.filter(Boolean).filter((topic, index, arr) => arr.findIndex((x) => x.topic === topic.topic) === index);
    if (unique.length < 2) return;
    const key = unique.map((t) => t.topic).sort().join("|");
    if (used.has(key)) return;
    used.add(key);
    recommendations.push({
      topics: unique.map((t) => t.topic),
      reason,
      ...(sharedTaxonomy ? { sharedTaxonomy } : {}),
      metrics: unique.map((t) => ({
        topic: t.topic,
        totalPapers: t.totalPapers,
        growthRatePct: t.growthRatePct,
        momentum: t.momentum,
      })),
    });
  };

  add(topics.slice(0, 3), "Top momentum topics in the current filtered corpus.");

  const bySubfield = new Map<string, TrendingTopic[]>();
  for (const topic of topics) {
    const subfield = topic.taxonomy?.subfieldName;
    if (!subfield) continue;
    bySubfield.set(subfield, [...(bySubfield.get(subfield) ?? []), topic]);
  }
  for (const [subfieldName, items] of bySubfield) {
    if (items.length >= 2) {
      add(items.slice(0, 3), `Compare closely related topics inside the ${subfieldName} subfield.`, {
        domainName: items[0]?.taxonomy?.domainName,
        fieldName: items[0]?.taxonomy?.fieldName,
        subfieldName,
      });
    }
    if (recommendations.length >= 5) break;
  }

  const fastest = [...topics].sort((a, b) => b.growthRatePct - a.growthRatePct)[0];
  const established = [...topics].sort((a, b) => b.totalPapers - a.totalPapers)[0];
  if (fastest && established && fastest.topic !== established.topic) {
    add([fastest, established], "Contrast the fastest-growing topic against the most established topic.");
  }

  return recommendations.slice(0, 5);
}

function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function candidateMatchRank(candidate: TrendTopicCandidate, query: string): number {
  const topic = candidate.topic.toLowerCase();
  if (topic === query) return 0;
  if (topic.startsWith(query)) return 1;
  if (topic.includes(query)) return 2;
  const taxonomyText = [
    candidate.taxonomy?.domainName,
    candidate.taxonomy?.fieldName,
    candidate.taxonomy?.subfieldName,
  ].filter(Boolean).join(" ").toLowerCase();
  if (taxonomyText.includes(query)) return 3;
  return 4;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTrendMetricTrace(
  overview: TrendsOverview,
  topicDetail: PublicationTrend | null,
  relationships: TopicRelationshipResponse | null,
): TrendMetricTrace[] {
  const traces: TrendMetricTrace[] = [
    {
      source: "yearlyTotalPapers",
      label: "Publication activity",
      value: `${formatNumber(overview.totalPapersInWindow)} papers, ${overview.yearFrom}-${overview.yearTo}`,
      explanation: "Counts active papers in the current year window and Data Scope.",
    },
    {
      source: "citationTrend",
      label: "Citation activity",
      value: `${formatNumber(sumBy(overview.citationTrend, (row) => row.totalCitations))} total citations`,
      explanation: "Aggregates OpenAlex citation counts by publication year for the same scoped papers.",
    },
    {
      source: "risingKeywords",
      label: "Early keyword signals",
      value: `${formatNumber(overview.risingKeywords.length)} rising keywords`,
      explanation: "Detects fast-growing paper keywords after small-base protection.",
    },
    {
      source: "facets",
      label: "Dataset facets",
      value: `${formatNumber(overview.facets.domains.length)} domains, ${formatNumber(overview.facets.topics.length)} top topic facets`,
      explanation: "Summarizes the selected corpus by OpenAlex taxonomy and publication metadata.",
    },
  ];

  if (topicDetail) {
    traces.push({
      source: "topicMetrics",
      label: "Focus topic metrics",
      value: `${formatNumber(topicDetail.totalPapers)} papers, ${formatSigned(topicDetail.momentum)} papers/year`,
      explanation: "Computes the selected topic's volume, growth, CAGR, and momentum inside the current Data Scope.",
    });
  }

  if (relationships) {
    traces.push({
      source: "relationships",
      label: "Topic co-occurrence",
      value: `${formatNumber(relationships.edges.length)} related topic links`,
      explanation: "Counts topics that appear together with the focus topic on the same scoped papers.",
    });
  }

  return traces;
}

async function saveTrendExplanation(args: {
  userId: string;
  explanation: TrendExplanationResponse;
  yearFrom: number;
  yearTo: number;
  scopeHash: string;
  scopeLabel: string;
  scopeFilters: Record<string, unknown>;
}) {
  await TrendExplanationModel.create({
    userId: args.userId,
    topic: args.explanation.topic,
    language: args.explanation.language,
    yearFrom: args.yearFrom,
    yearTo: args.yearTo,
    scopeHash: args.scopeHash,
    scopeLabel: args.scopeLabel,
    scopeFilters: args.scopeFilters,
    explanation: args.explanation,
  });
}

function buildScopeLabel(filtersApplied: Record<string, unknown>): string {
  const labels = Object.entries(filtersApplied)
    .flatMap(([key, value]) => Array.isArray(value) ? value.map((item) => `${key}: ${item}`) : [])
    .slice(0, 4);
  if (labels.length === 0) return "All OpenAlex domains";
  return labels.join(" · ");
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatSigned(value: number): string {
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${formatted}`;
}

function sumBy<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((sum, item) => sum + pick(item), 0);
}

function expandOpenAlexEntityId(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const expanded = new Set<string>([trimmed]);
  const lastSegment = trimmed.split("/").filter(Boolean).at(-1);
  if (lastSegment) {
    expanded.add(lastSegment);
    expanded.add(lastSegment.toUpperCase());
  }
  return Array.from(expanded);
}

function buildTrendExplainPrompt(args: {
  topic: string | null;
  language: "en" | "vi";
  overview: TrendsOverview;
  topicDetail: PublicationTrend | null;
  relationships: TopicRelationshipResponse | null;
}): string {
  const lang = args.language === "vi" ? "Vietnamese" : "English";
  return [
    `OUTPUT LANGUAGE: ${lang}.`,
    "Explain research trends ONLY from the aggregate metrics provided below.",
    "Do not invent paper titles, citations, institutions, authors, or claims not present in the data.",
    "If a signal is weak or from a small base, say so in cautions.",
    "",
    `Focus topic: ${args.topic ?? "overall corpus"}`,
    `Window: ${args.overview.yearFrom}-${args.overview.yearTo}; last complete year: ${args.overview.lastCompleteYear}`,
    "",
    "Overview JSON:",
    JSON.stringify(
      {
        totalPapersInWindow: args.overview.totalPapersInWindow,
        yearlyTotalPapers: args.overview.yearlyTotalPapers,
        citationTrend: args.overview.citationTrend,
        topTopics: args.overview.topics.slice(0, 8),
        risingKeywords: args.overview.risingKeywords.slice(0, 8),
        facets: args.overview.facets,
      },
      null,
      2,
    ),
    "",
    "Topic detail JSON:",
    JSON.stringify(args.topicDetail, null, 2),
    "",
    "Relationship graph JSON:",
    JSON.stringify(args.relationships, null, 2),
    "",
    "Return JSON with exactly this shape:",
    JSON.stringify(
      {
        topic: args.topic,
        language: args.language,
        summary: "one concise paragraph",
        whyItMatters: ["2-4 bullets"],
        evidenceSignals: [
          {
            text: "2-5 bullets grounded in counts, growth, momentum, citations, facets, or relationships",
            sources: ["yearlyTotalPapers", "citationTrend", "topicMetrics", "relationships"],
          },
        ],
        cautions: ["1-3 bullets about incomplete year, small base, missing data, or limits"],
        suggestedActions: ["2-4 user actions such as search papers, compare topics, generate report, inspect gaps"],
        metricTrace: [],
        generatedAt: "ISO timestamp",
      },
      null,
      2,
    ),
  ].join("\n");
}

export function validateTrendExplanation(
  out: TrendExplanationResponse,
  topic: string | null,
  language: "en" | "vi",
  metricTrace: TrendMetricTrace[],
): TrendExplanationResponse {
  const arrays = [out.whyItMatters, out.evidenceSignals, out.cautions, out.suggestedActions];
  if (
    typeof out.summary !== "string" ||
    out.summary.trim().length === 0 ||
    arrays.some((a) => !Array.isArray(a))
  ) {
    throw new Error("Invalid trend explanation shape");
  }
  return {
    topic,
    language,
    summary: out.summary.trim(),
    whyItMatters: out.whyItMatters.map(String).filter(Boolean).slice(0, 4),
    evidenceSignals: normalizeEvidenceSignals(out.evidenceSignals, metricTrace.map((trace) => trace.source)).slice(0, 5),
    cautions: out.cautions.map(String).filter(Boolean).slice(0, 3),
    suggestedActions: out.suggestedActions.map(String).filter(Boolean).slice(0, 4),
    metricTrace,
    generatedAt: new Date().toISOString(),
  };
}

function normalizeEvidenceSignals(
  rawSignals: unknown[],
  fallbackSources: TrendMetricTraceSource[],
): TrendEvidenceSignal[] {
  return rawSignals
    .map((item) => {
      if (typeof item === "string") {
        return { text: item.trim(), sources: fallbackSources };
      }
      if (item && typeof item === "object") {
        const candidate = item as { text?: unknown; sources?: unknown };
        const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
        const sources = Array.isArray(candidate.sources)
          ? candidate.sources.filter(isTrendMetricSource)
          : fallbackSources;
        return { text, sources: sources.length > 0 ? sources : fallbackSources };
      }
      return { text: "", sources: fallbackSources };
    })
    .filter((item) => item.text.length > 0);
}

function isTrendMetricSource(value: unknown): value is TrendMetricTraceSource {
  return [
    "yearlyTotalPapers",
    "citationTrend",
    "topicMetrics",
    "risingKeywords",
    "facets",
    "relationships",
  ].includes(String(value));
}
