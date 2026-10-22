import type {
  TopicTrendStatistics,
  TrendDataSource,
  TrendTermShift,
  TrendTermShiftAnalysis,
} from "@trend/shared-types";
import { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import type { TrendBaseline, TrendBaselineLevel } from "@trend/shared-types";
import { baselineKey, localBaselineYearCounts, localClassifiedSplit, openAlexBaselineFilter, resolveBaseline, unclassifiedSharePct } from "./trend.baseline.js";
import { openAlexGroupBy, openAlexYearCounts, shortId } from "./trend.openalex-client.js";
import { computeGgt } from "./trend.ggt.js";
import { buildShareRows } from "./trend.series.js";
import { withScope, yearsClause } from "./trend.openalex-scope.js";
import {
  SIGNIFICANCE_LEVEL,
  benjaminiHochberg,
  logOddsRatio2x2,
  mannKendall,
  senSlope,
} from "./trend.statistics.js";
import { mapWithConcurrency } from "./trend.utils.js";
import { classifyTrend, rankKeywordShifts, shareTrendStatistics } from "./trend.verdict.js";

/** Most frequent keywords taken from each period before merging. */
const KEYWORD_CANDIDATES_PER_PERIOD = 50;
const TERMS_PER_DIRECTION = 10;
const LOOKUP_CONCURRENCY = 4;

type EvidencePaper = { id: string; publicationYear: number; citationNormalizedPercentile: unknown };
/** Taxonomy ids/names of the topic, used to pick its baseline unit. */
type BaselineTaxonomy = { domainId?: string | null; domainName?: string | null; fieldId?: string | null; fieldName?: string | null; subfieldId?: string | null; subfieldName?: string | null };

/** Papers per year and keyword counts per period, from one data source. */
interface EvidenceCounts {
  source: TrendDataSource;
  baseline: TrendBaseline;
  topic: Map<number, number>;
  population: Map<number, number>;
  /** Global baseline only: works of the scope with / without a primary topic. */
  classifiedSplit?: { classified: Map<number, number>; unclassified: Map<number, number> };
  topCited: Map<number, number>;
  /** Papers of each period carrying each candidate keyword. */
  keywords: (periodA: number[], periodB: number[]) => Promise<Array<{ term: string; papersA: number; papersB: number }>>;
}

/** OpenAlex filter clauses of the request's Data Scope (trend.openalex-scope.ts),
 *  without any `primary_topic.id` clause and without publication_year. */
export interface EvidenceScope {
  filter: string;
  nonTaxonomyFilter: string;
}

/**
 * Statistical evidence for one topic from OpenAlex aggregate counts, with the
 * same Data Scope and the same filter strings as the topic chart and the
 * overview list, so all three test the same share series. Errors are not
 * caught: the caller falls back to the local corpus for the whole response, so
 * a response never mixes the two sources.
 */
export async function computeOpenAlexTopicStatistics(input: {
  topicId: string;
  taxonomy?: BaselineTaxonomy;
  baseline?: TrendBaselineLevel;
  scope: EvidenceScope;
  yearFrom: number;
  yearTo: number;
  lastCompleteYear: number;
}): Promise<TopicTrendStatistics> {
  const counts = await openAlexCounts({ ...input, topicId: shortId(input.topicId).toUpperCase() });
  return buildStatistics(counts, input.yearFrom, input.lastCompleteYear);
}

/** Statistical evidence for one topic from the local corpus (the verdict is
 *  always insufficient: LOCAL_CORPUS). `papers` are the topic's papers in the
 *  Data Scope; `scopeWhere` is the scope WITHOUT taxonomy clauses (alias `p`,
 *  years included), the same predicate the local overview uses for N_t. */
export async function computeLocalTopicStatistics(input: {
  taxonomy?: BaselineTaxonomy;
  baseline?: TrendBaselineLevel;
  scopeWhere: Prisma.Sql;
  papers: EvidencePaper[];
  yearFrom: number;
  lastCompleteYear: number;
}): Promise<TopicTrendStatistics> {
  return buildStatistics(await localCounts(input), input.yearFrom, input.lastCompleteYear);
}

async function buildStatistics(counts: EvidenceCounts, yearFrom: number, lastCompleteYear: number): Promise<TopicTrendStatistics> {
  // Years without any paper of the population carry no information.
  const shareSeries = buildShareRows(counts.topic, counts.population, yearFrom, lastCompleteYear);
  const yearsUsed = shareSeries.map((row) => row.year);
  const baseline: TrendBaseline = counts.classifiedSplit
    ? { ...counts.baseline, unclassifiedSharePct: unclassifiedSharePct(counts.classifiedSplit.classified, counts.classifiedSplit.unclassified, yearsUsed) }
    : counts.baseline;

  return {
    source: counts.source,
    significanceLevel: SIGNIFICANCE_LEVEL,
    totalPapers: shareSeries.reduce((sum, row) => sum + row.count, 0),
    yearsUsed,
    baseline,
    shareSeries,
    mannKendall: mannKendall(shareSeries.map((row) => row.sharePct)),
    senSlopePctPoints: senSlope(shareSeries.map((row) => ({ x: row.year, y: row.sharePct }))),
    // One topic, one hypothesis: the verdict uses the Mann–Kendall p-value.
    classification: classifyTrend({ ...shareTrendStatistics(shareSeries), source: counts.source }),
    ggt: computeGgt(shareSeries),
    impact: yearsUsed.map((year) => {
      const papers = counts.topic.get(year) ?? 0;
      const topPapers = counts.topCited.get(year) ?? 0;
      return { year, papers, topPapers, ppTop10Pct: papers > 0 ? (topPapers / papers) * 100 : null };
    }),
    termShift: await termShift(counts, yearsUsed),
  };
}

/**
 * Splits the used years into an earlier and a later half and tests, for each
 * frequent keyword, whether the share of papers carrying it changed (2×2 log
 * odds ratio), then adjusts the p-values with Benjamini–Hochberg.
 */
async function termShift(counts: EvidenceCounts, yearsUsed: number[]): Promise<TrendTermShiftAnalysis | null> {
  if (yearsUsed.length < 4) return null;
  const half = Math.floor(yearsUsed.length / 2);
  const periodA = yearsUsed.slice(0, half);
  const periodB = yearsUsed.slice(half);
  const totalA = periodA.reduce((sum, year) => sum + (counts.topic.get(year) ?? 0), 0);
  const totalB = periodB.reduce((sum, year) => sum + (counts.topic.get(year) ?? 0), 0);
  if (totalA === 0 || totalB === 0) return null;

  const rows = await counts.keywords(periodA, periodB);
  const tested = rows
    .map((row) => ({ row, result: logOddsRatio2x2({ withB: row.papersB, totalB, withA: row.papersA, totalA }) }))
    .filter((item): item is { row: (typeof rows)[number]; result: NonNullable<ReturnType<typeof logOddsRatio2x2>> } => item.result !== null);
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

  return {
    periodA: { yearFrom: periodA[0]!, yearTo: periodA.at(-1)!, papers: totalA },
    periodB: { yearFrom: periodB[0]!, yearTo: periodB.at(-1)!, papers: totalB },
    termsTested: shifts.length,
    rising: rankKeywordShifts(shifts, "rising").slice(0, TERMS_PER_DIRECTION),
    falling: rankKeywordShifts(shifts, "falling").slice(0, TERMS_PER_DIRECTION),
  };
}

// ---------------------------------------------------------------------------
// OpenAlex (whole population, aggregate queries only)
// ---------------------------------------------------------------------------

async function openAlexCounts(input: {
  topicId: string;
  taxonomy?: BaselineTaxonomy;
  baseline?: TrendBaselineLevel;
  scope: EvidenceScope;
  yearFrom: number;
  yearTo: number;
}): Promise<EvidenceCounts> {
  // Built exactly like the overview (trend.openalex-overview.ts buildTopics)
  // and the topic chart (trend.openalex-detail.ts topicBase), so the cached
  // responses are shared and the numbers cannot differ.
  const years = yearsClause(input.yearFrom, input.yearTo);
  const topicFilter = withScope(input.scope.filter, `primary_topic.id:${input.topicId}`);
  const baseline = resolveBaseline(input.baseline, input.taxonomy);
  const global = baseline.level === "global";
  const [topic, population, topCited, unclassified] = await Promise.all([
    openAlexYearCounts(withScope(topicFilter, years)),
    openAlexYearCounts(openAlexBaselineFilter(input.scope.nonTaxonomyFilter, baseline, years)),
    openAlexYearCounts(withScope(topicFilter, years, "citation_normalized_percentile.is_in_top_10_percent:true")),
    global ? openAlexYearCounts(withScope(input.scope.nonTaxonomyFilter, "primary_topic.id:null", years)) : Promise.resolve(null),
  ]);
  return {
    source: "openalex",
    baseline,
    topic,
    population,
    ...(unclassified ? { classifiedSplit: { classified: population, unclassified } } : {}),
    topCited,
    keywords: (periodA, periodB) => openAlexKeywordCounts(topicFilter, periodA, periodB),
  };
}

/**
 * Paper counts of each period for the most frequent keywords of either period
 * (top KEYWORD_CANDIDATES_PER_PERIOD each), for any OpenAlex base filter
 * without publication_year. Feed the result to logOddsRatio2x2.
 */
export async function openAlexKeywordCounts(baseFilter: string, periodA: number[], periodB: number[]) {
  const filterA = withScope(baseFilter, `publication_year:${periodA[0]}-${periodA.at(-1)}`);
  const filterB = withScope(baseFilter, `publication_year:${periodB[0]}-${periodB.at(-1)}`);
  const [rankedA, rankedB] = await Promise.all([keywordRanking(filterA), keywordRanking(filterB)]);

  const names = new Map<string, string>();
  for (const ranked of [rankedA, rankedB]) {
    for (const group of ranked.slice(0, KEYWORD_CANDIDATES_PER_PERIOD)) names.set(group.key, group.name);
  }
  const countsA = new Map(rankedA.map((group) => [group.key, group.count]));
  const countsB = new Map(rankedB.map((group) => [group.key, group.count]));

  // A candidate outside the other period's ranking (e.g. a new keyword) gets
  // an exact count from its own query, so emerging keywords are not dropped.
  const missing = [...names.keys()].filter((key) => !countsA.has(key) || !countsB.has(key));
  const allYears = withScope(baseFilter, `publication_year:${periodA[0]}-${periodB.at(-1)}`);
  const inA = new Set(periodA);
  await mapWithConcurrency(missing, LOOKUP_CONCURRENCY, async (key) => {
    const byYear = await openAlexYearCounts(`${allYears},keywords.id:${key}`);
    let a = 0;
    let b = 0;
    for (const [year, count] of byYear) {
      if (inA.has(year)) a += count;
      else b += count;
    }
    countsA.set(key, a);
    countsB.set(key, b);
  });

  return [...names.keys()].map((key) => ({ key, term: names.get(key)!, papersA: countsA.get(key)!, papersB: countsB.get(key)! }));
}

/**
 * The period's 200 most frequent keywords with exact paper counts. Only the
 * first group_by page is ordered by count; cursor pages are ordered by key.
 */
async function keywordRanking(periodFilter: string) {
  return (await openAlexGroupBy(periodFilter, "keywords.id")).groups;
}

// ---------------------------------------------------------------------------
// Local corpus fallback
// ---------------------------------------------------------------------------

async function localCounts(input: {
  taxonomy?: BaselineTaxonomy;
  baseline?: TrendBaselineLevel;
  scopeWhere: Prisma.Sql;
  papers: EvidencePaper[];
  yearFrom: number;
  lastCompleteYear: number;
}): Promise<EvidenceCounts> {
  const topic = new Map<number, number>();
  const topCited = new Map<number, number>();
  for (const paper of input.papers) {
    topic.set(paper.publicationYear, (topic.get(paper.publicationYear) ?? 0) + 1);
    if (isTopTenPercent(paper.citationNormalizedPercentile)) {
      topCited.set(paper.publicationYear, (topCited.get(paper.publicationYear) ?? 0) + 1);
    }
  }
  const baseline = resolveBaseline(input.baseline, input.taxonomy);
  const population = (await localBaselineYearCounts(input.scopeWhere, [baseline])).get(baselineKey(baseline)) ?? new Map<number, number>();
  return {
    source: "local",
    baseline,
    topic,
    population,
    ...(baseline.level === "global" ? { classifiedSplit: await localClassifiedSplit(input.scopeWhere) } : {}),
    topCited,
    keywords: (periodA, periodB) => localKeywordCounts(input.papers, periodA, periodB),
  };
}

async function localKeywordCounts(papers: EvidencePaper[], periodA: number[], periodB: number[]) {
  const inA = new Set(periodA);
  const inB = new Set(periodB);
  const periodOf = new Map<string, "A" | "B">();
  for (const paper of papers) {
    if (inA.has(paper.publicationYear)) periodOf.set(paper.id, "A");
    else if (inB.has(paper.publicationYear)) periodOf.set(paper.id, "B");
  }
  if (periodOf.size === 0) return [];

  const rows = await getPrisma().paperKeyword.findMany({
    where: { paperId: { in: [...periodOf.keys()] } },
    select: { paperId: true, keywordName: true },
  });
  const seen = new Set<string>();
  const counts = new Map<string, { papersA: number; papersB: number }>();
  for (const row of rows) {
    const term = row.keywordName.trim().toLowerCase();
    const key = `${row.paperId}\u0000${term}`;
    if (!term || seen.has(key)) continue;
    seen.add(key);
    const entry = counts.get(term) ?? { papersA: 0, papersB: 0 };
    if (periodOf.get(row.paperId) === "A") entry.papersA++;
    else entry.papersB++;
    counts.set(term, entry);
  }
  const top = (period: "papersA" | "papersB") =>
    [...counts].sort((a, b) => b[1][period] - a[1][period]).slice(0, KEYWORD_CANDIDATES_PER_PERIOD).map(([term]) => term);
  const candidates = new Set([...top("papersA"), ...top("papersB")]);
  return [...candidates].map((term) => ({ term, ...counts.get(term)! }));
}

function isTopTenPercent(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { isInTop10Percent?: unknown }).isInTop10Percent === true;
}
