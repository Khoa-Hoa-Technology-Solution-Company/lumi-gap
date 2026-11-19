import type {
  RisingKeyword,
  TrendFacetBucket,
  TrendTaxonomyCoverage,
  TrendingTopic,
  TrendsOverview,
  YearlyCitationMetric,
  YearlyCount,
} from "@trend/shared-types";
import type { TrendsOverviewQuery } from "./dto/trends.schema.js";
import { fillMissingYears } from "./trend.formulas.js";
import { keywordShifts, risingShifts, splitPeriods } from "./trend.keywords.js";
import { openAlexKeywordCounts } from "./trend.evidence.js";
import { openAlexGroupBy, openAlexYearCounts, type OpenAlexGroup } from "./trend.openalex-client.js";
import { buildOpenAlexScope, withScope, yearsClause, type OpenAlexScope } from "./trend.openalex-scope.js";
import { analyseCrossTopics } from "./trend.cross-topic.js";
import { buildScopeShareTopics, groupByMerged, runAll, yearPeriods } from "./trend.openalex-topics.js";
import { IT_SCOPE_VERSION, isItScopeSubfield, itScopeWorkClauses, widerThanItScope } from "./trend.scope.js";
import { FULL_WINDOW_YEARS, buildRecommendedComparisons, compareByTotal, countVerdicts, compareByTrend, pageTopics } from "./trend.verdict.js";

/**
 * GET /trends computed from OpenAlex aggregate counts (no work records are
 * downloaded). Same response shape as the local overview in trend.postgres.ts.
 * OpenAlex errors are not caught here: the caller falls back to the local
 * overview so the two sources are never mixed.
 *
 * The overview is always about the IT scope (trend.scope.ts): every topic of
 * the scope is tested against the yearly total of the scope, whatever the page
 * shows. A subfield or topic filter only narrows what is listed and counted in
 * the facets; domain and field filters are wider than the scope and are
 * reported as ignored.
 *
 * Cost of an uncached request: one yearly series per topic of the scope (331
 * for it-v1) plus about 40 facet, total and keyword requests. The topic and
 * population series do not depend on the window and are cached for 7 days;
 * the notification worker re-fetches them before they expire (TREND_WARM_CRON),
 * so a user request normally only pays for the facets of its own window.
 */

/** Keywords are ranked inside one filter clause; the core of the scope, the field Computer Science, stands in for the whole scope. */
export const KEYWORD_SCOPE_CLAUSE = "primary_topic.field.id:17";
const RISING_KEYWORDS_LIMIT = 10;

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

export async function getOpenAlexTrendsOverview(query: TrendsOverviewQuery): Promise<TrendsOverview> {
  const now = new Date();
  const yearTo = query.yearTo ?? now.getFullYear();
  const yearFrom = query.yearFrom ?? yearTo - FULL_WINDOW_YEARS;
  const lastCompleteYear = Math.min(yearTo, now.getFullYear() - 1);
  const scope = await buildOpenAlexScope(query);
  const years = yearsClause(yearFrom, yearTo);
  // A subfield or topic filter lists a part of the scope; otherwise the page covers the whole scope, queried in its OR chunks.
  const narrowed = scope.narrowestTaxonomy === "subfield" || scope.narrowestTaxonomy === "topic";
  const bases = narrowed ? [withScope(scope.filter, years)] : itScopeWorkClauses().map((clause) => withScope(scope.nonTaxonomyFilter, clause, years));
  const keywordFilter = narrowed ? scope.filter : withScope(scope.nonTaxonomyFilter, KEYWORD_SCOPE_CLAUSE);

  // Phase 1: every request that only depends on the base filters.
  const yearFilters = [undefined, "citation_normalized_percentile.is_in_top_10_percent:true", ...CITATION_BANDS.map((band) => band.filter)];
  const facetKeys = Object.keys(FACET_GROUP_BY) as Array<keyof typeof FACET_GROUP_BY>;
  const phase1 = await runAll<Map<number, number> | OpenAlexGroup[]>([
    ...yearFilters.map((suffix) => () => mergedYearCounts(bases.map((base) => withScope(base, suffix)))),
    ...facetKeys.map((facet) => () => groupByMerged(bases, FACET_GROUP_BY[facet])),
    // Keywords are tested inside keywordFilter, so their totals are the papers of that filter.
    () => (narrowed ? Promise.resolve(new Map<number, number>()) : openAlexYearCounts(withScope(keywordFilter, years))),
  ]);
  const keywordYears = phase1[phase1.length - 1] as Map<number, number>;
  const [baseYears, topCitedYears, ...bands] = phase1.slice(0, yearFilters.length) as [Map<number, number>, Map<number, number>, ...Array<Map<number, number>>];
  const groups = Object.fromEntries(facetKeys.map((facet, index) => [facet, phase1[yearFilters.length + index] as OpenAlexGroup[]])) as Record<
    keyof typeof FACET_GROUP_BY,
    OpenAlexGroup[]
  >;

  const yearlyTotalPapers = fillMissingYears(toSeries(baseYears), yearFrom, yearTo);
  const totalPapersInWindow = yearlyTotalPapers.reduce((sum, row) => sum + row.count, 0);
  const citationTrend: YearlyCitationMetric[] = yearlyTotalPapers.map(({ year, count }) => {
    const topCitedCount = topCitedYears.get(year) ?? 0;
    return { year, count, totalCitations: null, avgCitations: null, topCitedCount, ppTop10Pct: count > 0 ? (topCitedCount / count) * 100 : null };
  });

  const listed = narrowed ? new Set(groups.topics.map((group) => group.key.toUpperCase())) : null;
  const keywordTotals = narrowed ? yearlyTotalPapers : fillMissingYears(toSeries(keywordYears), yearFrom, yearTo);
  const [scopeTopics, risingKeywords] = await Promise.all([
    buildScopeTopics(scope, yearFrom, yearTo, lastCompleteYear),
    buildRisingKeywords(keywordFilter, withScope(keywordFilter, years), keywordTotals, yearFrom, yearTo, lastCompleteYear),
  ]);

  // Topics compared with each other over the whole scope, before any filter, so their labels do not depend on it.
  const cross = analyseCrossTopics(scopeTopics);
  const topics = listTopics(scopeTopics, query, listed, cross?.labelsOf);

  return {
    dataSource: "openalex",
    scopeVersion: IT_SCOPE_VERSION,
    scopeNotice: narrowed ? scope.notice : { ignoredFilters: [...scope.notice.ignoredFilters, ...widerThanItScope(query)] },
    yearFrom,
    yearTo,
    lastCompleteYear,
    totalPapersInWindow,
    uniqueTopicsInScope: topics.length,
    testedTopicCount: topics.length,
    candidateStrata: null,
    verdictCounts: countVerdicts(topics),
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
      // A layer-3 topic's subfield holds more than that topic: filtering by it would leave the scope, so only layer 1–2 subfields are offered.
      subfields: taxonomyBuckets(groups.subfields.filter((group) => isItScopeSubfield(group.key)), LIMITS.subfields),
      topics: taxonomyBuckets(groups.topics, LIMITS.topics),
    },
    taxonomyCoverage: taxonomyCoverage(totalPapersInWindow, groups.domains),
    recommendedComparisons: buildRecommendedComparisons(topics),
    ...pageTopics(topics, query),
    risingKeywords,
    crossTopic: cross?.analysis ?? null,
    computedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

type ScopeTopic = TrendingTopic & { id: string };

/** Every topic of the IT scope, tested against the scope (BH across all of them). */
async function buildScopeTopics(scope: OpenAlexScope, yearFrom: number, yearTo: number, lastCompleteYear: number): Promise<ScopeTopic[]> {
  const periods = yearPeriods(yearFrom, yearTo, lastCompleteYear);
  return (await buildScopeShareTopics(scope.nonTaxonomyFilter, periods)).map((row) => {
    const yearlyBreakdown = periods.map((period, index) => ({ year: Number(period.key), count: row.counts[index] ?? 0 }));
    return {
      id: row.id,
      topic: row.name,
      taxonomy: row.taxonomy,
      totalPapers: yearlyBreakdown.reduce((sum, item) => sum + item.count, 0),
      yearlyBreakdown,
      classification: row.classification,
    };
  });
}

/**
 * The topics the page lists: those of the subfield or topic filter (`listed`),
 * with at least `minPapers` papers in the window, in the requested size bands,
 * each with its cross-topic labels.
 */
function listTopics(
  scopeTopics: ScopeTopic[],
  query: TrendsOverviewQuery,
  listed: Set<string> | null,
  labelsOf: ((topic: TrendingTopic) => TrendingTopic["crossTopic"]) | undefined,
): TrendingTopic[] {
  const topics: TrendingTopic[] = scopeTopics
    .filter((row) => (!listed || listed.has(row.id)) && row.totalPapers >= query.minPapers)
    .map(({ id: _id, ...topic }) => (labelsOf ? { ...topic, crossTopic: labelsOf(topic) } : topic))
    .filter((topic) => !query.sizeBands?.length || (topic.crossTopic !== undefined && query.sizeBands.includes(topic.crossTopic.sizeBand)));
  topics.sort(query.sortBy === "total" ? compareByTotal : compareByTrend);
  return topics;
}

/** Year counts of several disjoint filters, added up. */
async function mergedYearCounts(filters: string[]): Promise<Map<number, number>> {
  const parts = await Promise.all(filters.map((filter) => openAlexYearCounts(filter)));
  if (parts.length === 1) return parts[0]!;
  const total = new Map<number, number>();
  for (const part of parts) for (const [year, count] of part) total.set(year, (total.get(year) ?? 0) + count);
  return total;
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
  const halves = splitPeriods(yearlyTotalPapers.filter((row) => row.year <= lastCompleteYear && row.count > 0).map((row) => row.year));
  if (!halves) return [];
  const { periodA, periodB } = halves;
  const totals = new Map(yearlyTotalPapers.map((row) => [row.year, row.count]));
  const totalA = periodA.reduce((sum, year) => sum + (totals.get(year) ?? 0), 0);
  const totalB = periodB.reduce((sum, year) => sum + (totals.get(year) ?? 0), 0);

  const rows = await openAlexKeywordCounts(scopeFilter, periodA, periodB);
  const keys = new Map(rows.map((row) => [row.term, row.key]));
  const rising = risingShifts(keywordShifts(rows, totalA, totalB), RISING_KEYWORDS_LIMIT);

  const series = await runAll(rising.map((shift) => () => openAlexYearCounts(withScope(base, `keywords.id:${keys.get(shift.term)}`))));
  const periods = {
    periodA: { yearFrom: periodA[0]!, yearTo: periodA.at(-1)! },
    periodB: { yearFrom: periodB[0]!, yearTo: periodB.at(-1)! },
  };
  return rising.map((shift, index) => {
    const yearlyBreakdown = fillMissingYears(toSeries(series[index]!), yearFrom, yearTo);
    return {
      keyword: shift.term,
      totalPapers: yearlyBreakdown.reduce((sum, row) => sum + row.count, 0),
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

function toSeries(counts: Map<number, number>): YearlyCount[] {
  return [...counts].map(([year, count]) => ({ year, count }));
}

function sumCounts(counts: Map<number, number>): number {
  let sum = 0;
  for (const count of counts.values()) sum += count;
  return sum;
}

function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}
