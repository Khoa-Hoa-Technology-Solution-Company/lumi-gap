import type { TrendCandidateStrata, TrendClassification, TrendGranularity, TrendPeriodWindow, TrendTopicTaxonomy } from "@trend/shared-types";
import { openAlexGet, openAlexGroupBy, shortId, type OpenAlexGroup } from "./trend.openalex-client.js";
import { datesClause, withScope, type OpenAlexScope } from "./trend.openalex-scope.js";
import { isItScopeSubfield, itScopeApplicationChunks, itScopeTopics, itScopeWorkClauses, itScopeYearCounts, scopeLayerOf, topicYearCounts } from "./trend.scope.js";
import { benjaminiHochberg } from "./trend.statistics.js";
import { mapWithConcurrency, range } from "./trend.utils.js";
import { MIN_PAPERS, classifyTrend, shareTrendStatistics } from "./trend.verdict.js";

/**
 * Topic candidates and their share series over analysis periods (years,
 * quarters or months), shared by the yearly overview and the period overview.
 * Every count is an OpenAlex `group_by` aggregate; no work record is read.
 */

const CONCURRENCY = 6;
/** OpenAlex accepts up to 100 OR values per filter (used for /topics lookups). */
const MAX_OR_VALUES = 100;
/** On /works, OR lists of more than 10 primary_topic.id values are limited to
 *  1 request per second per client (OpenAlex 429 "wide_or_filter"). */
const MAX_WORKS_TOPIC_OR_VALUES = 10;
/** Largest topics taken from every stratum (field or subfield). */
export const PER_STRATUM = 3;
/** Strata queried at most (OpenAlex has 26 fields; a field has < 60 subfields). */
const MAX_STRATA = 60;
export const MAX_CANDIDATES = 200;
/** Largest topics of the whole scope always tested. Fixed, not derived from
 *  the page size: paging must not change which topics are tested. */
export const GLOBAL_CANDIDATES = 30;

/** One analysis period. `clause` is its OpenAlex filter clause. */
export interface AnalysisPeriod {
  /** "2024", "2026-Q3" or "2026-09". */
  key: string;
  /** Inclusive dates, YYYY-MM-DD. */
  from: string;
  to: string;
  /** False for the period still running (or not started): never tested. */
  complete: boolean;
  clause: string;
}

export interface ShareTopic {
  id: string;
  name: string;
  taxonomy: TrendTopicTaxonomy;
  /** Topic papers per period, in the order of the periods. */
  counts: number[];
  classification: TrendClassification;
}

type TopicEntity = {
  id: string;
  display_name?: string;
  domain?: { id: string; display_name: string };
  field?: { id: string; display_name: string };
  subfield?: { id: string; display_name: string };
};

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export function yearPeriods(yearFrom: number, yearTo: number, lastCompleteYear: number): AnalysisPeriod[] {
  return range(yearFrom, yearTo).map((year) => ({
    key: String(year),
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    complete: year <= lastCompleteYear,
    clause: `publication_year:${year}`,
  }));
}

/**
 * Months or quarters (UTC) ending with the one that contains `now`, which is
 * returned as incomplete. "rolling": the `count` complete periods before it.
 * "year-to-date": the complete periods of the current year (none in its first
 * month or quarter).
 */
export function subYearPeriods(granularity: TrendGranularity, window: TrendPeriodWindow, count: number, now: Date): AnalysisPeriod[] {
  const months = granularity === "month" ? 1 : 3;
  const year = now.getUTCFullYear();
  const currentStart = Math.floor(now.getUTCMonth() / months) * months;
  const complete = window === "year-to-date" ? currentStart / months : count;
  return range(-complete, 0).map((offset) => {
    const start = new Date(Date.UTC(year, currentStart + offset * months, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 0));
    const from = isoDate(start);
    const to = isoDate(end);
    const key = granularity === "month"
      ? from.slice(0, 7)
      : `${start.getUTCFullYear()}-Q${Math.floor(start.getUTCMonth() / 3) + 1}`;
    return { key, from, to, complete: offset < 0, clause: datesClause(from, to) };
  });
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

/**
 * Topics to test. The first `group_by` page lists only the 200 largest topics
 * of the scope, so taking candidates from it alone leaves out every topic of
 * the smaller fields. Candidates are therefore the GLOBAL_CANDIDATES largest topics
 * of the scope plus the PER_STRATUM largest of every field (of every subfield
 * when the scope is one field). A subfield or topic scope fits in one page.
 * Stratum topics need MIN_PAPERS papers: smaller ones could only be insufficient.
 */
export async function selectTopicCandidates(input: {
  scope: OpenAlexScope;
  /** Scope and window filter. */
  base: string;
  topicGroups: OpenAlexGroup[];
  fieldGroups: OpenAlexGroup[];
  subfieldGroups: OpenAlexGroup[];
  minPapers: number;
}): Promise<{ candidates: OpenAlexGroup[]; strata: TrendCandidateStrata | null }> {
  const valid = (groups: OpenAlexGroup[], min: number) =>
    groups.filter((group) => /^T\d+$/i.test(group.key) && group.count >= min).map((group) => ({ ...group, key: group.key.toUpperCase() }));

  const selected = new Map(valid(input.topicGroups, input.minPapers).slice(0, GLOBAL_CANDIDATES).map((group) => [group.key, group]));

  const narrowest = input.scope.narrowestTaxonomy;
  const level = narrowest === null || narrowest === "domain" ? "field" : narrowest === "field" ? "subfield" : null;
  if (!level) return { candidates: [...selected.values()], strata: null };

  const filterKey = level === "field" ? "primary_topic.field.id" : "primary_topic.subfield.id";
  const strata = (level === "field" ? input.fieldGroups : input.subfieldGroups).filter((group) => group.count >= MIN_PAPERS).slice(0, MAX_STRATA);
  const pages = await runAll(strata.map((stratum) => () => openAlexGroupBy(withScope(input.base, `${filterKey}:${stratum.key}`), "primary_topic.id")));
  const stratumMin = Math.max(input.minPapers, MIN_PAPERS);
  for (const page of pages) {
    for (const group of valid(page.groups, stratumMin).slice(0, PER_STRATUM)) {
      if (selected.size >= MAX_CANDIDATES) break;
      if (!selected.has(group.key)) selected.set(group.key, group);
    }
  }
  return { candidates: [...selected.values()], strata: { level, strata: strata.length, perStratum: PER_STRATUM } };
}

/**
 * Candidates of a period window over the whole IT scope: the GLOBAL_CANDIDATES
 * largest topics of the window plus the PER_STRATUM largest of every subfield of
 * the scope and of the layer-3 topics (one stratum per OR chunk), so the small
 * subfields are tested too. Used where every topic of
 * the scope cannot be afforded (months and quarters: counts depend on the window).
 */
export async function selectScopeCandidates(input: {
  /** Non-taxonomy part of the Data Scope. */
  plainFilter: string;
  /** Date clause of the whole window. */
  window: string;
  minPapers: number;
}): Promise<{ candidates: OpenAlexGroup[]; strata: TrendCandidateStrata }> {
  const valid = (groups: OpenAlexGroup[], min: number) =>
    groups.filter((group) => /^T\d+$/i.test(group.key) && group.count >= min).map((group) => ({ ...group, key: group.key.toUpperCase() }));
  const bases = itScopeWorkClauses().map((clause) => withScope(input.plainFilter, clause, input.window));
  const [topicGroups, subfieldGroups] = await Promise.all([groupByMerged(bases, "primary_topic.id"), groupByMerged(bases, "primary_topic.subfield.id")]);

  const selected = new Map(valid(topicGroups, input.minPapers).slice(0, GLOBAL_CANDIDATES).map((group) => [group.key, group]));
  const strata = [
    ...subfieldGroups.filter((group) => isItScopeSubfield(group.key) && group.count >= MIN_PAPERS).map((group) => `primary_topic.subfield.id:${group.key}`),
    ...itScopeApplicationChunks().map((ids) => `primary_topic.id:${ids.join("|")}`),
  ];
  const pages = await runAll(strata.map((clause) => () => openAlexGroupBy(withScope(input.plainFilter, clause, input.window), "primary_topic.id")));
  const stratumMin = Math.max(input.minPapers, MIN_PAPERS);
  for (const page of pages) {
    for (const group of valid(page.groups, stratumMin).slice(0, PER_STRATUM)) {
      if (selected.size >= MAX_CANDIDATES) break;
      if (!selected.has(group.key)) selected.set(group.key, group);
    }
  }
  return { candidates: [...selected.values()], strata: { level: "subfield", strata: strata.length, perStratum: PER_STRATUM } };
}

/** First group_by page of several disjoint filters, added up by key, largest first. */
export async function groupByMerged(filters: string[], groupBy: string): Promise<OpenAlexGroup[]> {
  const pages = await Promise.all(filters.map((filter) => openAlexGroupBy(filter, groupBy)));
  if (pages.length === 1) return pages[0]!.groups;
  const byKey = new Map<string, OpenAlexGroup>();
  for (const page of pages) {
    for (const group of page.groups) {
      const seen = byKey.get(group.key);
      byKey.set(group.key, seen ? { ...seen, count: seen.count + group.count } : group);
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Share series and verdicts
// ---------------------------------------------------------------------------

/**
 * Counts per period of every group of `groupBy`, one request per period (and
 * per OR chunk when `orChunks` restricts the groups). Keys are upper-cased.
 */
export async function countsByPeriod(filter: string, periods: AnalysisPeriod[], groupBy: string, orChunks: Array<string | undefined> = [undefined]): Promise<Map<string, number[]>> {
  const tasks = periods.flatMap((period, index) => orChunks.map((chunk) => ({ index, filter: withScope(filter, chunk, period.clause) })));
  const pages = await runAll(tasks.map((task) => () => openAlexGroupBy(task.filter, groupBy)));
  const counts = new Map<string, number[]>();
  pages.forEach((page, taskIndex) => {
    const periodIndex = tasks[taskIndex]!.index;
    for (const group of page.groups) {
      const key = group.key.toUpperCase();
      const row = counts.get(key) ?? new Array<number>(periods.length).fill(0);
      row[periodIndex] = (row[periodIndex] ?? 0) + group.count;
      counts.set(key, row);
    }
  });
  return counts;
}

/** N_t of a period window: papers of the whole IT scope per period, one request per period and subfield chunk of the scope. */
export async function scopeTotalsByPeriod(plainFilter: string, periods: AnalysisPeriod[]): Promise<number[]> {
  const byType = await countsByPeriod(plainFilter, periods, "type", itScopeWorkClauses());
  return periods.map((_period, index) => [...byType.values()].reduce((sum, row) => sum + (row[index] ?? 0), 0));
}

/** Papers per period of the whole filter (each work has exactly one type). */
export async function totalsByPeriod(filter: string, periods: AnalysisPeriod[]): Promise<number[]> {
  const byType = await countsByPeriod(filter, periods, "type");
  return periods.map((_period, index) => [...byType.values()].reduce((sum, row) => sum + (row[index] ?? 0), 0));
}

/**
 * Each candidate's share of the IT scope per period, s_t = n_t / N_t · 100
 * (`population` = N_t, see scopeTotalsByPeriod), tested with Mann–Kendall over
 * the complete periods with N_t > 0 and BH-adjusted across the candidates.
 * Requests: per period one for each OR chunk of ≤ 10 topics, plus one per 100
 * topic entities. `plainFilter` is the non-taxonomy part of the Data Scope.
 */
export async function buildShareTopics(plainFilter: string, periods: AnalysisPeriod[], candidates: OpenAlexGroup[], population: number[]): Promise<ShareTopic[]> {
  if (candidates.length === 0) return [];
  const ids = candidates.map((candidate) => candidate.key);
  const [topicCounts, entities] = await Promise.all([
    countsByPeriod(plainFilter, periods, "primary_topic.id", chunk(ids, MAX_WORKS_TOPIC_OR_VALUES).map((group) => `primary_topic.id:${group.join("|")}`)),
    topicEntities(ids),
  ]);

  const built = candidates.map((candidate) => {
    const counts = topicCounts.get(candidate.key) ?? new Array<number>(periods.length).fill(0);
    // The ordinal stands in for the year: Sen's slope is then per period.
    const series = periods.flatMap((period, index) => {
      const total = population[index] ?? 0;
      if (!period.complete || total <= 0) return [];
      const count = counts[index] ?? 0;
      return [{ year: index, count, sharePct: (count / Math.max(total, count)) * 100 }];
    });
    return { candidate, taxonomy: topicTaxonomy(candidate.key, entities.get(candidate.key)), counts, stats: shareTrendStatistics(series) };
  });
  const qValues = benjaminiHochberg(built.map((row) => row.stats.mannKendall?.pValue ?? null));
  return built.map((row, index) => ({
    id: row.candidate.key,
    name: row.candidate.name,
    taxonomy: row.taxonomy,
    counts: row.counts,
    classification: classifyTrend({ ...row.stats, source: "openalex", qValue: qValues[index] ?? null }),
  }));
}

/**
 * Every topic of the IT scope (trend.scope.ts) with its yearly share of the
 * whole scope, s_t = n_t / N_t · 100, tested with Mann–Kendall over the complete
 * years with N_t > 0 and BH-adjusted across all of them. No topic is selected
 * by size, so a small topic that rises fast is tested like a large one. Topics
 * without a paper in the window are left out: there is nothing to test.
 *
 * `plainFilter` is the non-taxonomy part of the Data Scope (work types, ...).
 * Requests: one yearly series per topic and one per subfield chunk of the scope,
 * over a fixed span, so the cached series serve every window.
 */
export async function buildScopeShareTopics(plainFilter: string, periods: AnalysisPeriod[]): Promise<ShareTopic[]> {
  const topics = await itScopeTopics();
  const [population, series] = await Promise.all([itScopeYearCounts(plainFilter), topicYearCounts(topics.map((topic) => topic.id), plainFilter)]);
  const totals = periods.map((period) => population.get(Number(period.key)) ?? 0);

  const built = topics.flatMap((topic, topicIndex) => {
    const counts = periods.map((period) => series[topicIndex]!.get(Number(period.key)) ?? 0);
    if (counts.every((count) => count === 0)) return [];
    const shares = periods.flatMap((period, index) => {
      const total = totals[index] ?? 0;
      if (!period.complete || total <= 0) return [];
      const count = counts[index] ?? 0;
      return [{ year: Number(period.key), count, sharePct: (count / Math.max(total, count)) * 100 }];
    });
    return [{ topic, counts, stats: shareTrendStatistics(shares) }];
  });
  const qValues = benjaminiHochberg(built.map((row) => row.stats.mannKendall?.pValue ?? null));
  return built.map((row, index) => ({
    id: row.topic.id,
    name: row.topic.name,
    taxonomy: row.topic.taxonomy,
    counts: row.counts,
    classification: classifyTrend({ ...row.stats, source: "openalex", qValue: qValues[index] ?? null }),
  }));
}

async function topicEntities(ids: string[]): Promise<Map<string, TopicEntity>> {
  const lists = await runAll(chunk(ids, MAX_OR_VALUES).map((group) => () => fetchTopicEntities(group)));
  return new Map(lists.flat().map((entity) => [shortId(entity.id).toUpperCase(), entity]));
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
  const layer = scopeLayerOf(entity?.subfield?.id, topicId);
  return {
    openalexTopicId: topicId,
    ...(entity?.domain ? { domainId: shortId(entity.domain.id), domainName: entity.domain.display_name } : {}),
    ...(entity?.field ? { fieldId: shortId(entity.field.id), fieldName: entity.field.display_name } : {}),
    ...(entity?.subfield ? { subfieldId: shortId(entity.subfield.id), subfieldName: entity.subfield.display_name } : {}),
    ...(layer ? { scopeLayer: layer } : {}),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function runAll<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
  return mapWithConcurrency(tasks, CONCURRENCY, (task) => task());
}

export function chunk<T>(items: T[], size: number): T[][] {
  return range(0, Math.ceil(items.length / size) - 1).map((index) => items.slice(index * size, (index + 1) * size));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
