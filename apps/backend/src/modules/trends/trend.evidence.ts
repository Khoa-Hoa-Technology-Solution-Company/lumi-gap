import type {
  TopicTrendStatistics,
  TrendDataSource,
  TrendTermShift,
  TrendTermShiftAnalysis,
} from "@trend/shared-types";
import { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { isOpenAlexBudgetAvailable, openAlexGroupBy, openAlexYearCounts, shortId } from "./trend.openalex-client.js";
import { DEFAULT_WORK_TYPES_CLAUSE, withScope } from "./trend.openalex-scope.js";
import {
  SIGNIFICANCE_LEVEL,
  benjaminiHochberg,
  logOddsRatio2x2,
  mannKendall,
  senSlope,
} from "./trend.statistics.js";
import { mapWithConcurrency, range } from "./trend.utils.js";
import { classifyTrend, shareTrendStatistics } from "./trend.verdict.js";

/** Most frequent keywords taken from each period before merging. */
const KEYWORD_CANDIDATES_PER_PERIOD = 50;
const TERMS_PER_DIRECTION = 10;
const LOOKUP_CONCURRENCY = 4;

type EvidencePaper = { id: string; publicationYear: number; citationNormalizedPercentile: unknown };

/** Papers per year and keyword counts per period, from one data source. */
interface EvidenceCounts {
  source: TrendDataSource;
  baseline: TopicTrendStatistics["baseline"];
  topic: Map<number, number>;
  population: Map<number, number>;
  topCited: Map<number, number>;
  /** Papers of each period carrying each candidate keyword. */
  keywords: (periodA: number[], periodB: number[]) => Promise<Array<{ term: string; papersA: number; papersB: number }>>;
}

/**
 * Statistical evidence for one topic. Counts come from OpenAlex aggregate
 * queries (whole population) when the topic has an OpenAlex id and the daily
 * budget allows it, otherwise from the local corpus. Both run the same tests.
 */
export async function computeTopicStatistics(input: {
  topic: string;
  topicId?: string;
  fieldId?: string;
  fieldName?: string;
  papers: EvidencePaper[];
  yearFrom: number;
  lastCompleteYear: number;
}): Promise<TopicTrendStatistics> {
  const openAlexTopic = input.topicId ? shortId(input.topicId) : undefined;
  let counts: EvidenceCounts | null = null;
  if (openAlexTopic && /^T\d+$/i.test(openAlexTopic) && isOpenAlexBudgetAvailable()) {
    try {
      counts = await openAlexCounts({ ...input, topicId: openAlexTopic.toUpperCase() });
    } catch (err) {
      logger.warn({ err, topic: input.topic }, "openalex trend counts unavailable; using local corpus");
    }
  }
  counts ??= await localCounts(input);
  return buildStatistics(counts, input.yearFrom, input.lastCompleteYear);
}

async function buildStatistics(counts: EvidenceCounts, yearFrom: number, lastCompleteYear: number): Promise<TopicTrendStatistics> {
  // Years without any paper of the population carry no information.
  const yearsUsed = range(yearFrom, lastCompleteYear).filter((year) => (counts.population.get(year) ?? 0) > 0);
  const shareSeries = yearsUsed.map((year) => {
    const count = counts.topic.get(year) ?? 0;
    const total = Math.max(counts.population.get(year) ?? 0, count);
    return { year, count, total, sharePct: (count / total) * 100 };
  });

  return {
    source: counts.source,
    significanceLevel: SIGNIFICANCE_LEVEL,
    totalPapers: shareSeries.reduce((sum, row) => sum + row.count, 0),
    yearsUsed,
    baseline: counts.baseline,
    shareSeries,
    mannKendall: mannKendall(shareSeries.map((row) => row.sharePct)),
    senSlopePctPoints: senSlope(shareSeries.map((row) => ({ x: row.year, y: row.sharePct }))),
    // One topic, one hypothesis: the verdict uses the Mann–Kendall p-value.
    classification: classifyTrend({ ...shareTrendStatistics(shareSeries), source: counts.source }),
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
    rising: shifts.filter((row) => row.z > 0).sort((a, b) => b.z - a.z).slice(0, TERMS_PER_DIRECTION),
    falling: shifts.filter((row) => row.z < 0).sort((a, b) => a.z - b.z).slice(0, TERMS_PER_DIRECTION),
  };
}

// ---------------------------------------------------------------------------
// OpenAlex (whole population, aggregate queries only)
// ---------------------------------------------------------------------------

async function openAlexCounts(input: {
  topicId: string;
  fieldId?: string;
  fieldName?: string;
  yearFrom: number;
  lastCompleteYear: number;
}): Promise<EvidenceCounts> {
  const years = `publication_year:${input.yearFrom}-${input.lastCompleteYear}`;
  const topicFilter = `${DEFAULT_WORK_TYPES_CLAUSE},primary_topic.id:${input.topicId}`;
  const fieldId = input.fieldId ? shortId(input.fieldId) : undefined;
  const [topic, population, topCited] = await Promise.all([
    openAlexYearCounts(`${topicFilter},${years}`),
    openAlexYearCounts(fieldId ? `${DEFAULT_WORK_TYPES_CLAUSE},primary_topic.field.id:${fieldId},${years}` : `${DEFAULT_WORK_TYPES_CLAUSE},${years}`),
    openAlexYearCounts(`${topicFilter},${years},citation_normalized_percentile.is_in_top_10_percent:true`),
  ]);
  return {
    source: "openalex",
    baseline: fieldId
      ? { level: "field", label: input.fieldName ?? fieldId }
      : { level: "corpus", label: "All OpenAlex works" },
    topic,
    population,
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
  topicId?: string;
  fieldId?: string;
  fieldName?: string;
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
  return {
    source: "local",
    baseline: input.fieldId
      ? { level: "field", label: input.fieldName ?? input.fieldId }
      : { level: "corpus", label: "All active papers" },
    topic,
    population: await localPopulation(input.fieldId, input.yearFrom, input.lastCompleteYear),
    topCited,
    keywords: (periodA, periodB) => localKeywordCounts(input.papers, periodA, periodB),
  };
}

async function localPopulation(fieldId: string | undefined, yearFrom: number, yearTo: number) {
  const rows = fieldId
    ? await getPrisma().$queryRaw<Array<{ year: number; count: number }>>(Prisma.sql`
        SELECT p.publication_year AS year, COUNT(DISTINCT p.id)::int AS count
        FROM papers p
        JOIN paper_topics pt ON pt.paper_id = p.id
        WHERE p.data_status = 'active'
          AND p.publication_year BETWEEN ${yearFrom} AND ${yearTo}
          AND pt.field_id = ${fieldId}
        GROUP BY p.publication_year
      `)
    : await getPrisma().$queryRaw<Array<{ year: number; count: number }>>(Prisma.sql`
        SELECT p.publication_year AS year, COUNT(*)::int AS count
        FROM papers p
        WHERE p.data_status = 'active' AND p.publication_year BETWEEN ${yearFrom} AND ${yearTo}
        GROUP BY p.publication_year
      `);
  return new Map(rows.map((row) => [Number(row.year), Number(row.count)]));
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
