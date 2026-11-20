import type { TrendPeriodsOverview, TrendingPeriodTopic } from "@trend/shared-types";
import type { TrendPeriodsQuery } from "./dto/trends.schema.js";
import { openAlexGroupBy } from "./trend.openalex-client.js";
import { buildOpenAlexScope, datesClause, withScope } from "./trend.openalex-scope.js";
import { buildShareTopics, scopeTotalsByPeriod, selectScopeCandidates, selectTopicCandidates, subYearPeriods, totalsByPeriod } from "./trend.openalex-topics.js";
import { IT_SCOPE_VERSION, widerThanItScope } from "./trend.scope.js";
import { compareByTotal, compareByTrend, countVerdicts, pageTopics } from "./trend.verdict.js";

/** Default length of a rolling window, in complete periods. */
export const DEFAULT_PERIODS = { month: 12, quarter: 8 } as const;

/**
 * GET /trends/periods from OpenAlex: the yearly method (share of the IT scope,
 * Mann–Kendall, BH) on months or quarters, so a short or recent window still
 * has enough points. Shares, not raw counts, are tested on purpose: works
 * dated only by year carry 1 January, and the last months are still being
 * indexed, which inflates or deflates topic and scope alike.
 *
 * Unlike the yearly overview, not every topic of the scope is tested: period
 * counts cannot be cached across windows, so the candidates are the largest
 * topics of the window plus the largest of every subfield of the scope (at most
 * about 80). A subfield or topic filter lists that part of the scope; domain
 * and field filters are wider than the scope and are reported as ignored.
 *
 * Cost of an uncached default request (12 months, no taxonomy filter): about
 * 150 OpenAlex requests (4 window pages, one topic page per subfield of the
 * scope, and per period 2 scope totals and one topic request per 10
 * candidates). Every response is cached for 7 days by the client.
 */
export async function getOpenAlexTrendPeriods(query: TrendPeriodsQuery): Promise<TrendPeriodsOverview> {
  const now = new Date();
  const periods = subYearPeriods(query.granularity, query.window, query.periods ?? DEFAULT_PERIODS[query.granularity], now);
  const scope = await buildOpenAlexScope(query);
  const window = datesClause(periods[0]!.from, periods.at(-1)!.to);
  const plain = scope.nonTaxonomyFilter;
  const narrowed = scope.narrowestTaxonomy === "subfield" || scope.narrowestTaxonomy === "topic";

  // N_t of every topic: the papers of the whole scope in each period, whatever part of it is listed.
  const scopeTotals = scopeTotalsByPeriod(plain, periods);
  const [{ candidates, strata }, population, totals] = await Promise.all([
    narrowed ? narrowedCandidates(scope, withScope(scope.filter, window), query.minPapers) : selectScopeCandidates({ plainFilter: plain, window, minPapers: query.minPapers }),
    scopeTotals,
    narrowed ? totalsByPeriod(scope.filter, periods) : scopeTotals,
  ]);

  const topics: TrendingPeriodTopic[] = (await buildShareTopics(plain, periods, candidates, population)).map((row) => ({
    topic: row.name,
    taxonomy: row.taxonomy,
    totalPapers: row.counts.reduce((sum, count) => sum + count, 0),
    periodBreakdown: periods.map((period, index) => ({ period: period.key, count: row.counts[index] ?? 0 })),
    classification: row.classification,
  }));
  topics.sort(query.sortBy === "total" ? compareByTotal : compareByTrend);

  return {
    dataSource: "openalex",
    scopeVersion: IT_SCOPE_VERSION,
    scopeNotice: narrowed ? scope.notice : { ignoredFilters: [...scope.notice.ignoredFilters, ...widerThanItScope(query)] },
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

/** A subfield or topic filter fits in one page: its largest topics are the candidates. */
async function narrowedCandidates(scope: Awaited<ReturnType<typeof buildOpenAlexScope>>, base: string, minPapers: number) {
  const topicPage = await openAlexGroupBy(base, "primary_topic.id");
  return selectTopicCandidates({ scope, base, topicGroups: topicPage.groups, fieldGroups: [], subfieldGroups: [], minPapers });
}
