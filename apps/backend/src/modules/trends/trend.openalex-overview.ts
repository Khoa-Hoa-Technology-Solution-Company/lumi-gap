import type {
  RisingKeyword,
  TrendFacetBucket,
  TrendTaxonomyCoverage,
  TrendTermShift,
  TrendTopicTaxonomy,
  TrendingTopic,
  TrendsOverview,
  YearlyCitationMetric,
  YearlyCount,
} from "@trend/shared-types";
import type { TrendsOverviewQuery } from "./dto/trends.schema.js";
import { computeMetrics, truncateToCompleteYears, yoyGrowthPct } from "./trend.formulas.js";
import { fillMissingYearsFromCounts } from "./trend.intelligence.js";
import { openAlexKeywordCounts } from "./trend.evidence.js";
import { openAlexGet, openAlexGroupBy, openAlexYearCounts, shortId, type OpenAlexGroup } from "./trend.openalex-client.js";
import { buildOpenAlexScope, withScope, yearsClause } from "./trend.openalex-scope.js";
import { benjaminiHochberg, logOddsRatio2x2 } from "./trend.statistics.js";
import { mapWithConcurrency, range } from "./trend.utils.js";
import { buildRecommendedComparisons, classifyTrend, compareByTotal, compareByTrend, shareTrendStatistics, type ShareTrendStatistics } from "./trend.verdict.js";

/**
 * GET /trends computed from OpenAlex aggregate counts over the whole OpenAlex
 * database (no work records are downloaded). Same response shape as the local
 * overview in trend.postgres.ts. OpenAlex errors are not caught here: the
 * caller falls back to the local overview so the two sources are never mixed.
 *
 * Cost of an uncached default request (limit 10): about 80 OpenAlex requests
 * (15 facet/series requests, 30 topic series, 1 topic entity lookup, one
 * population series per distinct field, keyword rankings plus their lookups
 * and 10 keyword series). Every response is cached for 7 days by the client.
 */

const DEFAULT_WINDOW_YEARS = 10;
const CONCURRENCY = 6;
const RISING_KEYWORDS_LIMIT = 10;
/** OpenAlex accepts up to 100 OR values per filter. */
const MAX_OR_VALUES = 100;

const CITATION_BANDS = [
  { band: "0-9", filter: "cited_by_count:0-9" },
  { band: "10-49", filter: "cited_by_count:10-49" },
  { band: "50-99", filter: "cited_by_count:50-99" },
  { band: "100-499", filter: "cited_by_count:100-499" },
  { band: "500-999", filter: "cited_by_count:500-999" },
  { band: "1000+", filter: "cited_by_count:>999" },
] as const;

/** group_by key of each facet (the topics facet doubles as the topic candidates). */
const FACET_GROUP_BY = {
  paperKinds: "type",
  openAccessStatuses: "open_access.oa_status",
  languages: "language",
  topSources: "primary_location.source.id",
  domains: "primary_topic.domain.id",
  fields: "primary_topic.field.id",
  subfields: "primary_topic.subfield.id",
  topics: "primary_topic.id",
} as const;

/** Facet limits, the same as the local overview. */
const LIMITS = { paperKinds: 30, openAccessStatuses: 30, topSources: 20, languages: 30, domains: 50, fields: 50, subfields: 50, topics: 100 };

type TopicEntity = {
  id: string;
  display_name?: string;
  domain?: { id: string; display_name: string };
  field?: { id: string; display_name: string };
  subfield?: { id: string; display_name: string };
};

export async function getOpenAlexTrendsOverview(query: TrendsOverviewQuery): Promise<TrendsOverview> {
  const now = new Date();
  const yearTo = query.yearTo ?? now.getFullYear();
  const yearFrom = query.yearFrom ?? yearTo - DEFAULT_WINDOW_YEARS;
  const lastCompleteYear = Math.min(yearTo, now.getFullYear() - 1);
  const scope = await buildOpenAlexScope(query);
  const years = yearsClause(yearFrom, yearTo);
  const base = withScope(scope.filter, years);

  // Phase 1: every request that only depends on the base filter.
  const yearFilters = [
    base,
    withScope(base, "citation_normalized_percentile.is_in_top_10_percent:true"),
    ...CITATION_BANDS.map((band) => withScope(base, band.filter)),
  ];
  const facetKeys = Object.keys(FACET_GROUP_BY) as Array<keyof typeof FACET_GROUP_BY>;
  const phase1 = await runAll<Map<number, number> | OpenAlexGroup[]>([
    ...yearFilters.map((filter) => () => openAlexYearCounts(filter)),
    ...facetKeys.map((facet) => () => openAlexGroupBy(base, FACET_GROUP_BY[facet]).then((page) => page.groups)),
  ]);
  const [baseYears, topCitedYears, ...bands] = phase1.slice(0, yearFilters.length) as [Map<number, number>, Map<number, number>, ...Array<Map<number, number>>];
  const groups = Object.fromEntries(facetKeys.map((facet, index) => [facet, phase1[yearFilters.length + index] as OpenAlexGroup[]])) as Record<
    keyof typeof FACET_GROUP_BY,
    OpenAlexGroup[]
  >;

  const yearlyTotalPapers = fillMissingYearsFromCounts(toSeries(baseYears), yearFrom, yearTo);
  const totalPapersInWindow = yearlyTotalPapers.reduce((sum, row) => sum + row.count, 0);
  const citationTrend: YearlyCitationMetric[] = yearlyTotalPapers.map(({ year, count }) => {
    const topCitedCount = topCitedYears.get(year) ?? 0;
    return { year, count, totalCitations: null, avgCitations: null, topCitedCount, ppTop10Pct: count > 0 ? (topCitedCount / count) * 100 : null };
  });

  const [topics, risingKeywords] = await Promise.all([
    buildTopics(query, groups.topics, scope, years, yearFrom, yearTo, lastCompleteYear),
    buildRisingKeywords(scope.filter, base, yearlyTotalPapers, yearFrom, yearTo, lastCompleteYear),
  ]);

  return {
    dataSource: "openalex",
    scopeNotice: scope.notice,
    yearFrom,
    yearTo,
    lastCompleteYear,
    totalPapersInWindow,
    // Candidate groups on the first (count-ordered) group_by page. OpenAlex
    // returns at most 200 groups per page, so 200 means "at least 200".
    uniqueTopicsInScope: groups.topics.length,
    yearlyTotalPapers,
    citationTrend,
    facets: {
      paperKinds: scalarBuckets(groups.paperKinds, LIMITS.paperKinds),
      openAccessStatuses: scalarBuckets(groups.openAccessStatuses, LIMITS.openAccessStatuses),
      providers: [], // Provider is a property of the local corpus, not of OpenAlex works.
      topSources: sourceBuckets(groups.topSources, LIMITS.topSources),
      languages: scalarBuckets(groups.languages, LIMITS.languages),
      citationBands: CITATION_BANDS.map(({ band }, index) => ({ id: band, name: band, count: sumCounts(bands[index] ?? new Map()) })).filter((row) => row.count > 0),
      domains: taxonomyBuckets(groups.domains, LIMITS.domains),
      fields: taxonomyBuckets(groups.fields, LIMITS.fields),
      subfields: taxonomyBuckets(groups.subfields, LIMITS.subfields),
      topics: taxonomyBuckets(groups.topics, LIMITS.topics),
    },
    taxonomyCoverage: taxonomyCoverage(totalPapersInWindow, groups.domains),
    recommendedComparisons: buildRecommendedComparisons(topics),
    topics: topics.slice(0, query.limit),
    risingKeywords,
    computedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

async function buildTopics(
  query: TrendsOverviewQuery,
  topicGroups: OpenAlexGroup[],
  scope: { filter: string; nonTaxonomyFilter: string },
  years: string,
  yearFrom: number,
  yearTo: number,
  lastCompleteYear: number,
): Promise<TrendingTopic[]> {
  // The first group_by page is ordered by count, so these are the largest
  // topics of the scope. Cursor pages are ordered by key and never used here.
  const candidateLimit = Math.min(200, Math.max(30, query.limit * 3));
  const candidates = topicGroups
    .filter((group) => /^T\d+$/i.test(group.key) && group.count >= query.minPapers)
    .slice(0, candidateLimit)
    .map((group) => ({ ...group, key: group.key.toUpperCase() }));
  if (candidates.length === 0) return [];

  const idChunks = chunk(candidates.map((candidate) => candidate.key), MAX_OR_VALUES);
  const results = await runAll<unknown>([
    ...candidates.map((candidate) => () => openAlexYearCounts(withScope(scope.filter, `primary_topic.id:${candidate.key}`, years))),
    ...idChunks.map((ids) => () => fetchTopicEntities(ids)),
  ]);
  const topicYears = results.slice(0, candidates.length) as Array<Map<number, number>>;
  const entities = new Map((results.slice(candidates.length) as TopicEntity[][]).flat().map((entity) => [shortId(entity.id).toUpperCase(), entity]));

  const taxonomies = candidates.map((candidate) => topicTaxonomy(candidate.key, entities.get(candidate.key)));
  const fieldIds = [...new Set(taxonomies.map((taxonomy) => taxonomy.fieldId).filter((id): id is string => Boolean(id)))];
  const populations = new Map(
    (await runAll(fieldIds.map((fieldId) => () => openAlexYearCounts(withScope(scope.nonTaxonomyFilter, `primary_topic.field.id:${fieldId}`, years)))))
      .map((counts, index) => [fieldIds[index]!, counts]),
  );

  // Share of the topic's field: n_t = topic papers, N_t = field papers of the
  // same scope (without the taxonomy clauses), complete years with N_t > 0.
  const shareStats: ShareTrendStatistics[] = candidates.map((_candidate, index) => {
    const fieldId = taxonomies[index]!.fieldId;
    const population = fieldId ? populations.get(fieldId) : undefined;
    const counts = topicYears[index]!;
    return shareTrendStatistics(
      population
        ? range(yearFrom, lastCompleteYear)
            .filter((year) => (population.get(year) ?? 0) > 0)
            .map((year) => {
              const count = counts.get(year) ?? 0;
              return { year, count, sharePct: (count / Math.max(population.get(year) ?? 0, count)) * 100 };
            })
        : [],
    );
  });
  // Benjamini–Hochberg across every listed candidate tested in this request.
  const qValues = benjaminiHochberg(shareStats.map((stats) => stats.mannKendall?.pValue ?? null));

  const topics: TrendingTopic[] = candidates.map((candidate, index) => {
    const yearlyBreakdown = fillMissingYearsFromCounts(toSeries(topicYears[index]!), yearFrom, yearTo);
    return {
      topic: candidate.name,
      taxonomy: taxonomies[index]!,
      totalPapers: yearlyBreakdown.reduce((sum, row) => sum + row.count, 0),
      yearlyBreakdown,
      ...computeMetrics(yearlyBreakdown, lastCompleteYear),
      classification: classifyTrend({ ...shareStats[index]!, source: "openalex", qValue: qValues[index] ?? null }),
    };
  });

  topics.sort(query.sortBy === "total" ? compareByTotal : compareByTrend);
  return topics;
}

async function fetchTopicEntities(ids: string[]): Promise<TopicEntity[]> {
  const json = await openAlexGet<{ results?: TopicEntity[] }>("topics", {
    filter: `id:${ids.join("|")}`,
    per_page: "200",
    select: "id,display_name,domain,field,subfield",
  });
  return json.results ?? [];
}

function topicTaxonomy(topicId: string, entity: TopicEntity | undefined): TrendTopicTaxonomy {
  return {
    openalexTopicId: topicId,
    ...(entity?.domain ? { domainId: shortId(entity.domain.id), domainName: entity.domain.display_name } : {}),
    ...(entity?.field ? { fieldId: shortId(entity.field.id), fieldName: entity.field.display_name } : {}),
    ...(entity?.subfield ? { subfieldId: shortId(entity.subfield.id), subfieldName: entity.subfield.display_name } : {}),
  };
}

// ---------------------------------------------------------------------------
// Rising keywords
// ---------------------------------------------------------------------------

/**
 * Splits the complete years that have papers into an earlier half A and a
 * later half B, tests every frequent keyword with the 2×2 log odds ratio
 * (totals = scope papers of each period), adjusts with Benjamini–Hochberg and
 * keeps the keywords that rose (z > 0), strongest first.
 */
async function buildRisingKeywords(
  scopeFilter: string,
  base: string,
  yearlyTotalPapers: YearlyCount[],
  yearFrom: number,
  yearTo: number,
  lastCompleteYear: number,
): Promise<RisingKeyword[]> {
  const usable = yearlyTotalPapers.filter((row) => row.year <= lastCompleteYear && row.count > 0).map((row) => row.year);
  if (usable.length < 2) return [];
  const half = Math.floor(usable.length / 2);
  const periodA = usable.slice(0, half);
  const periodB = usable.slice(half);
  const totals = new Map(yearlyTotalPapers.map((row) => [row.year, row.count]));
  const totalA = periodA.reduce((sum, year) => sum + (totals.get(year) ?? 0), 0);
  const totalB = periodB.reduce((sum, year) => sum + (totals.get(year) ?? 0), 0);

  const rows = await openAlexKeywordCounts(scopeFilter, periodA, periodB);
  const keys = new Map(rows.map((row) => [row.term, row.key]));

  const tested = rows.flatMap((row) => {
    const result = logOddsRatio2x2({ withB: row.papersB, totalB, withA: row.papersA, totalA });
    return result ? [{ row, result }] : [];
  });
  const qValues = benjaminiHochberg(tested.map((item) => item.result.pValue));
  const shifts: TrendTermShift[] = tested.map(({ row, result }, index) => ({
    term: row.term,
    papersA: row.papersA,
    papersB: row.papersB,
    logOddsRatio: result.logOddsRatio,
    z: result.z,
    pValue: result.pValue,
    qValue: qValues[index] ?? 1,
  }));
  const rising = shifts
    .filter((shift) => shift.z > 0 && keys.has(shift.term))
    .sort((a, b) => b.z - a.z)
    .slice(0, RISING_KEYWORDS_LIMIT);

  const series = await runAll(rising.map((shift) => () => openAlexYearCounts(withScope(base, `keywords.id:${keys.get(shift.term)}`))));
  const periods = {
    periodA: { yearFrom: periodA[0]!, yearTo: periodA.at(-1)! },
    periodB: { yearFrom: periodB[0]!, yearTo: periodB.at(-1)! },
  };
  return rising.map((shift, index) => {
    const yearlyBreakdown = fillMissingYearsFromCounts(toSeries(series[index]!), yearFrom, yearTo);
    return {
      keyword: shift.term,
      totalPapers: yearlyBreakdown.reduce((sum, row) => sum + row.count, 0),
      growthRatePct: yoyGrowthPct(truncateToCompleteYears(yearlyBreakdown, lastCompleteYear)),
      yearlyBreakdown,
      shift: { ...shift, ...periods },
    };
  });
}

// ---------------------------------------------------------------------------
// Facets and coverage
// ---------------------------------------------------------------------------

/** type / oa_status / language: the key is the filter value ("article", "en"). */
function scalarBuckets(groups: OpenAlexGroup[], limit: number): TrendFacetBucket[] {
  return groups.filter((group) => group.count > 0).slice(0, limit).map((group) => ({ id: group.key, name: group.name, count: group.count }));
}

/** Sources are keyed by their S-id so a click filters by id, not by name. */
function sourceBuckets(groups: OpenAlexGroup[], limit: number): TrendFacetBucket[] {
  return groups
    .filter((group) => group.count > 0 && /^S\d+$/i.test(group.key))
    .slice(0, limit)
    .map((group) => ({ id: group.key, name: group.name, count: group.count, openalexId: group.key }));
}

/** Taxonomy buckets are keyed by name with the OpenAlex id alongside, like
 *  toTaxonomyFacetBuckets in trend.intelligence.ts (the web filters by both). */
function taxonomyBuckets(groups: OpenAlexGroup[], limit: number): TrendFacetBucket[] {
  return groups
    .filter((group) => group.count > 0)
    .slice(0, limit)
    .map((group) => ({ id: group.name, name: group.name, count: group.count, openalexId: group.key }));
}

/**
 * Coverage of the OpenAlex taxonomy in the scope. A work has a topic exactly
 * when it has a primary topic (the primary topic is its highest-scoring one),
 * and every OpenAlex topic carries its subfield, field and domain, so the three
 * coverage figures are equal. Works with a primary topic = the sum of the
 * domain groups (each work has one primary domain; there are only 4 domains,
 * so the first group_by page is complete), which costs no extra request.
 */
function taxonomyCoverage(totalPapers: number, domainGroups: OpenAlexGroup[]): TrendTaxonomyCoverage {
  const withTopic = Math.min(totalPapers, domainGroups.reduce((sum, group) => sum + group.count, 0));
  const pct = percent(withTopic, totalPapers);
  return {
    totalPapers,
    papersWithAnyTopic: withTopic,
    papersWithPrimaryTopic: withTopic,
    papersWithFullHierarchy: withTopic,
    anyTopicCoveragePct: pct,
    primaryTopicCoveragePct: pct,
    fullHierarchyCoveragePct: pct,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runAll<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
  return mapWithConcurrency(tasks, CONCURRENCY, (task) => task());
}

function toSeries(counts: Map<number, number>): YearlyCount[] {
  return [...counts].map(([year, count]) => ({ year, count }));
}

function sumCounts(counts: Map<number, number>): number {
  let sum = 0;
  for (const count of counts.values()) sum += count;
  return sum;
}

function chunk<T>(items: T[], size: number): T[][] {
  return range(0, Math.ceil(items.length / size) - 1).map((index) => items.slice(index * size, (index + 1) * size));
}

function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}
