import type { TrendPeriodsOverview, TrendingPeriodTopic } from "@trend/shared-types";
import type { TrendPeriodsQuery } from "./dto/trends.schema.js";
import { openAlexGroupBy } from "./trend.openalex-client.js";
import { buildOpenAlexScope, datesClause, withScope } from "./trend.openalex-scope.js";
import { buildShareTopics, selectTopicCandidates, subYearPeriods, totalsByPeriod } from "./trend.openalex-topics.js";
import { compareByTotal, compareByTrend, countVerdicts, pageTopics } from "./trend.verdict.js";

/** Default length of a rolling window, in complete periods. */
export const DEFAULT_PERIODS = { month: 12, quarter: 8 } as const;

/**
 * GET /trends/periods from OpenAlex: the yearly method (share of the field,
 * Mann–Kendall, BH) on months or quarters, so a short or recent window still
 * has enough points. Shares, not raw counts, are tested on purpose: works
 * dated only by year carry 1 January, and the last months are still being
 * indexed, which inflates or deflates topic and field alike.
 *
 * Cost of an uncached default request (12 months, no taxonomy filter): about
 * 85 OpenAlex requests (3 window pages, one topic page per field, and per
 * period one total, one topic request per 100 candidates and one field
 * population request). Every response is cached for 7 days by the client.
 */
export async function getOpenAlexTrendPeriods(query: TrendPeriodsQuery): Promise<TrendPeriodsOverview> {
  const now = new Date();
  const periods = subYearPeriods(query.granularity, query.window, query.periods ?? DEFAULT_PERIODS[query.granularity], now);
  const scope = await buildOpenAlexScope(query);
  const base = withScope(scope.filter, datesClause(periods[0]!.from, periods.at(-1)!.to));

  const [topicPage, fieldPage, subfieldPage, totals] = await Promise.all([
    openAlexGroupBy(base, "primary_topic.id"),
    openAlexGroupBy(base, "primary_topic.field.id"),
    openAlexGroupBy(base, "primary_topic.subfield.id"),
    totalsByPeriod(scope.filter, periods),
  ]);
  const { candidates, strata } = await selectTopicCandidates({
    scope,
    base,
    topicGroups: topicPage.groups,
    fieldGroups: fieldPage.groups,
    subfieldGroups: subfieldPage.groups,
    minPapers: query.minPapers,
  });

  const topics: TrendingPeriodTopic[] = (await buildShareTopics(scope, periods, candidates)).map((row) => ({
    topic: row.name,
    taxonomy: row.taxonomy,
    totalPapers: row.counts.reduce((sum, count) => sum + count, 0),
    periodBreakdown: periods.map((period, index) => ({ period: period.key, count: row.counts[index] ?? 0 })),
    classification: row.classification,
  }));
  topics.sort(query.sortBy === "total" ? compareByTotal : compareByTrend);

  return {
    dataSource: "openalex",
    scopeNotice: scope.notice,
    granularity: query.granularity,
    window: query.window,
    periods: periods.map(({ key, from, to, complete }) => ({ key, from, to, complete })),
    periodTotalPapers: periods.map((period, index) => ({ period: period.key, count: totals[index] ?? 0 })),
    totalPapersInWindow: totals.reduce((sum, count) => sum + count, 0),
    testedTopicCount: topics.length,
    candidateStrata: strata,
    verdictCounts: countVerdicts(topics),
    ...pageTopics(topics, query),
    computedAt: now.toISOString(),
  };
}
