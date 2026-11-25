import type { EmergingKeyword, TrendEmergingResponse, YearlyCount } from "@trend/shared-types";
import type { TrendEmergingQuery } from "./dto/trends.schema.js";
import { EMERGING_CANDIDATES, EMERGING_THRESHOLDS, emergingPeriods, selectEmerging } from "./trend.emerging.js";
import { openAlexKeywordCounts } from "./trend.evidence.js";
import { fillMissingYears } from "./trend.formulas.js";
import { openAlexYearCounts } from "./trend.openalex-client.js";
import { KEYWORD_SCOPE_CLAUSE } from "./trend.openalex-overview.js";
import { buildOpenAlexScope, withScope, yearsClause } from "./trend.openalex-scope.js";
import { runAll } from "./trend.openalex-topics.js";
import { IT_SCOPE_VERSION, widerThanItScope } from "./trend.scope.js";

/**
 * GET /trends/emerging from OpenAlex aggregate counts (trend.emerging.ts for
 * the criteria). Keywords are counted in the same clause as the rising
 * keywords of the overview: the field Computer Science for the whole scope, or
 * the subfield / topic filter when there is one. OpenAlex errors are not caught
 * here: the caller falls back to the local corpus.
 *
 * Candidates are the EMERGING_CANDIDATES most frequent keywords of the recent
 * period R. Cost of an uncached request: 1 yearly total, 2 keyword rankings,
 * one exact count per candidate missing from E's ranking (a few dozen: new
 * keywords are exactly those), and one yearly series per keyword returned.
 * Everything is cached for 7 days.
 */
export async function getOpenAlexEmerging(query: TrendEmergingQuery): Promise<TrendEmergingResponse> {
  const now = new Date();
  const lastCompleteYear = now.getFullYear() - 1;
  const { earlier, recent } = emergingPeriods(lastCompleteYear);
  const scope = await buildOpenAlexScope(query);
  const narrowed = scope.narrowestTaxonomy === "subfield" || scope.narrowestTaxonomy === "topic";
  const keywordFilter = narrowed ? scope.filter : withScope(scope.nonTaxonomyFilter, KEYWORD_SCOPE_CLAUSE);
  // The window plus the running year, so the keyword charts show where the current year stands.
  const base = withScope(keywordFilter, yearsClause(earlier[0]!, now.getFullYear()));

  const [totals, rows] = await Promise.all([openAlexYearCounts(base), openAlexKeywordCounts(keywordFilter, earlier, recent, { a: 0, b: EMERGING_CANDIDATES })]);
  const sum = (years: number[]) => years.reduce((total, year) => total + (totals.get(year) ?? 0), 0);
  const totalEarlier = sum(earlier);
  const totalRecent = sum(recent);
  const { termsTested, keywords: matched } = selectEmerging(rows, totalEarlier, totalRecent);

  const shown = matched.slice(0, query.limit);
  const keys = new Map(rows.map((row) => [row.term, row.key]));
  const series = await runAll(shown.map((shift) => () => openAlexYearCounts(withScope(base, `keywords.id:${keys.get(shift.term)}`))));
  const keywords: EmergingKeyword[] = shown.map(({ noveltyShare, ...shift }, index) => ({
    keyword: shift.term,
    earlierPapers: shift.papersA,
    recentPapers: shift.papersB,
    noveltyShare,
    shift,
    yearlyBreakdown: fillMissingYears(toSeries(series[index]!), earlier[0]!, now.getFullYear()),
  }));

  return {
    dataSource: "openalex",
    scopeVersion: IT_SCOPE_VERSION,
    scopeNotice: narrowed ? scope.notice : { ignoredFilters: [...scope.notice.ignoredFilters, ...widerThanItScope(query)] },
    earlierPeriod: { yearFrom: earlier[0]!, yearTo: earlier.at(-1)!, papers: totalEarlier },
    recentPeriod: { yearFrom: recent[0]!, yearTo: recent.at(-1)!, papers: totalRecent },
    lastCompleteYear,
    criteria: { ...EMERGING_THRESHOLDS },
    termsTested,
    matchedCount: matched.length,
    keywords,
    computedAt: now.toISOString(),
  };
}

/** Local corpus fallback: keyword signals need OpenAlex keyword counts, so the list is empty. */
export function emptyEmerging(): TrendEmergingResponse {
  const now = new Date();
  const lastCompleteYear = now.getFullYear() - 1;
  const { earlier, recent } = emergingPeriods(lastCompleteYear);
  return {
    earlierPeriod: { yearFrom: earlier[0]!, yearTo: earlier.at(-1)!, papers: 0 },
    recentPeriod: { yearFrom: recent[0]!, yearTo: recent.at(-1)!, papers: 0 },
    lastCompleteYear,
    criteria: { ...EMERGING_THRESHOLDS },
    termsTested: 0,
    matchedCount: 0,
    keywords: [],
    computedAt: now.toISOString(),
  };
}

function toSeries(counts: Map<number, number>): YearlyCount[] {
  return [...counts].map(([year, count]) => ({ year, count }));
}
