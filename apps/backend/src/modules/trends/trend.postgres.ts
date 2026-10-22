import { DEFAULT_TREND_BASELINE, resolveTrendWindow } from "@trend/shared-types";
import type {
  RisingKeyword,
  TrendFacetBucket,
  TrendFacets,
  TrendTaxonomyCoverage,
  TrendTopicTaxonomy,
  TrendingTopic,
  TrendsOverview,
  YearlyCitationMetric,
  YearlyCount,
} from "@trend/shared-types";
import { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import {
  buildCitationMetric,
  fillMissingCitationYears,
  fillMissingYearsFromCounts,
} from "./trend.intelligence.js";
import { computeMetrics, fillMissingYears, truncateToCompleteYears, yoyGrowthPct } from "./trend.formulas.js";
import { benjaminiHochberg, logOddsRatio2x2 } from "./trend.statistics.js";
import { range } from "./trend.utils.js";
import { baselineKey, localBaselineYearCounts, resolveBaseline } from "./trend.baseline.js";
import type { TrendScopeFilters } from "./trend.openalex-scope.js";
import { computeGgt } from "./trend.ggt.js";
import { buildShareRows } from "./trend.series.js";
import { buildRecommendedComparisons, classifyTrend, compareByTotal, compareByTrend, rankKeywordShifts, shareTrendStatistics } from "./trend.verdict.js";
import type { TrendsOverviewQuery } from "./dto/trends.schema.js";

/** Keywords listed, as in the OpenAlex overview. */
const RISING_KEYWORDS_LIMIT = 10;

type CountRow = { id: string | null; name: string | null; count: number };
type YearRow = { year: number; count: number; totalCitations: number };
type TopicYearRow = TrendTopicTaxonomy & { topic: string; year: number; count: number };
type KeywordYearRow = { keyword: string; year: number; count: number };

export async function getPostgresTrendsOverview(query: TrendsOverviewQuery): Promise<TrendsOverview> {
  const prisma = getPrisma();
  const now = new Date();
  const { yearFrom, yearTo, lastCompleteYear } = resolveTrendWindow(query, now.getFullYear());
  const baseWhere = buildPaperWhere(query, yearFrom, yearTo);
  const topicWhere = buildTopicWhere(query, Prisma.sql`pt`);

  const [
    yearlyRows,
    topicRows,
    keywordRows,
    paperKinds,
    openAccessStatuses,
    providers,
    topSources,
    languages,
    citationBands,
    domains,
    fields,
    subfields,
    topicFacets,
    coverage,
  ] = await Promise.all([
    prisma.$queryRaw<YearRow[]>(Prisma.sql`
      SELECT
        p.publication_year AS year,
        COUNT(*)::int AS count,
        COALESCE(SUM(p.citation_count), 0)::double precision AS "totalCitations"
      FROM papers p
      WHERE ${baseWhere}
      GROUP BY p.publication_year
      ORDER BY p.publication_year
    `),
    prisma.$queryRaw<TopicYearRow[]>(Prisma.sql`
      SELECT
        pt.topic_name AS topic,
        pt.openalex_topic_id AS "openalexTopicId",
        pt.domain_id AS "domainId",
        pt.domain_name AS "domainName",
        pt.field_id AS "fieldId",
        pt.field_name AS "fieldName",
        pt.subfield_id AS "subfieldId",
        pt.subfield_name AS "subfieldName",
        p.publication_year AS year,
        COUNT(DISTINCT p.id)::int AS count
      FROM papers p
      JOIN paper_topics pt ON pt.paper_id = p.id
      -- One topic per paper (the primary one), as in OpenAlex primary_topic:
      -- counting every assigned topic would put a paper in up to 3+ topics.
      WHERE ${baseWhere} AND ${topicWhere} AND pt.is_primary = TRUE
      GROUP BY
        pt.topic_name, pt.openalex_topic_id, pt.domain_id, pt.domain_name,
        pt.field_id, pt.field_name, pt.subfield_id, pt.subfield_name,
        p.publication_year
      ORDER BY pt.topic_name, p.publication_year
    `),
    prisma.$queryRaw<KeywordYearRow[]>(Prisma.sql`
      SELECT pk.keyword_name AS keyword, p.publication_year AS year,
             COUNT(DISTINCT p.id)::int AS count
      FROM papers p
      JOIN paper_keywords pk ON pk.paper_id = p.id
      WHERE ${baseWhere}
      GROUP BY pk.keyword_name, p.publication_year
      ORDER BY pk.keyword_name, p.publication_year
    `),
    scalarFacet(baseWhere, "paperKind", 30),
    scalarFacet(baseWhere, "openAccessStatus", 30),
    scalarFacet(baseWhere, "provider", 30),
    scalarFacet(baseWhere, "source", 20),
    scalarFacet(baseWhere, "language", 30),
    citationBandFacets(baseWhere),
    taxonomyFacet(baseWhere, topicWhere, "domain", 50),
    taxonomyFacet(baseWhere, topicWhere, "field", 50),
    taxonomyFacet(baseWhere, topicWhere, "subfield", 50),
    taxonomyFacet(baseWhere, topicWhere, "topic", 100),
    taxonomyCoverage(baseWhere),
  ]);

  const yearlyTotalPapers = fillMissingYearsFromCounts(
    yearlyRows.map((row) => ({ year: row.year, count: Number(row.count) })),
    yearFrom,
    yearTo,
  );
  const citationTrend = fillMissingCitationYears(
    yearlyRows.map((row) => buildCitationMetric(row.year, Number(row.count), Number(row.totalCitations))),
    yearFrom,
    yearTo,
  );
  // N_t per topic: the same reference population as the local topic page
  // (trend.baseline.ts), not the whole filtered corpus.
  const groupedTopics = groupTopicRows(topicRows);
  const baselines = new Map([...groupedTopics].map(([topic, group]) => [topic, resolveBaseline(query.baseline, group.taxonomy)]));
  const populations = await localBaselineYearCounts(buildPaperWhere(query, yearFrom, yearTo, { taxonomy: false }), [...baselines.values()]);
  const topics = buildTopics(groupedTopics, (topic) => populations.get(baselineKey(baselines.get(topic)!)) ?? new Map(), yearFrom, yearTo, lastCompleteYear, query.minPapers, query.sortBy);
  const risingKeywords = buildRisingKeywords(keywordRows, yearlyRows, yearFrom, yearTo, lastCompleteYear);
  const totalPapersInWindow = yearlyRows.reduce((sum, row) => sum + Number(row.count), 0);

  const facets: TrendFacets = {
    paperKinds,
    openAccessStatuses,
    providers,
    topSources,
    languages,
    citationBands,
    domains,
    fields,
    subfields,
    topics: topicFacets,
  };

  return {
    baselineLevel: query.baseline ?? DEFAULT_TREND_BASELINE,
    yearFrom,
    yearTo,
    lastCompleteYear,
    totalPapersInWindow,
    uniqueTopicsInScope: new Set(topicRows.map((row) => row.topic)).size,
    yearlyTotalPapers,
    citationTrend,
    facets,
    taxonomyCoverage: coverage,
    recommendedComparisons: buildRecommendedComparisons(topics),
    topics: topics.slice(0, query.limit),
    risingKeywords,
    computedAt: now.toISOString(),
  };
}

/**
 * Paper predicate (alias `p`) of a Data Scope and year range. With
 * `taxonomy: false` the domain/field/subfield/topic clauses are left out: that
 * is the scope of the reference population N_t (trend.baseline.ts), shared by
 * the local overview and the local topic page.
 */
export function buildPaperWhere(query: TrendScopeFilters, yearFrom: number, yearTo: number, options: { taxonomy?: boolean } = {}): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`p.data_status = 'active'`,
    Prisma.sql`p.publication_year >= ${yearFrom}`,
    Prisma.sql`p.publication_year <= ${yearTo}`,
  ];
  addInCondition(conditions, Prisma.sql`p.paper_kind`, query.paperKinds);
  addInCondition(conditions, Prisma.sql`p.open_access_status`, query.openAccessStatuses);
  addInCondition(conditions, Prisma.sql`p.primary_provider`, query.providers);
  addInCondition(conditions, Prisma.sql`p.journal_name`, query.sources);
  addInCondition(conditions, Prisma.sql`LOWER(p.language)`, query.languages?.map((value) => value.toLowerCase()));

  if (query.citationBands?.length) {
    const bands = query.citationBands.map(citationBandCondition);
    conditions.push(Prisma.sql`(${Prisma.join(bands, " OR ")})`);
  }

  const topicConditions = options.taxonomy === false ? [] : buildTopicConditions(query, Prisma.sql`scope_pt`);
  if (topicConditions.length > 0) {
    conditions.push(Prisma.sql`
      EXISTS (
        SELECT 1 FROM paper_topics scope_pt
        WHERE scope_pt.paper_id = p.id AND ${Prisma.join(topicConditions, " AND ")}
      )
    `);
  }
  return Prisma.join(conditions, " AND ");
}

function buildTopicWhere(query: TrendScopeFilters, alias: Prisma.Sql): Prisma.Sql {
  const conditions = buildTopicConditions(query, alias);
  return conditions.length > 0 ? Prisma.join(conditions, " AND ") : Prisma.sql`TRUE`;
}

function buildTopicConditions(query: TrendScopeFilters, alias: Prisma.Sql): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [];
  addInCondition(conditions, Prisma.sql`${alias}.domain_name`, query.domains);
  addInCondition(conditions, Prisma.sql`${alias}.field_name`, query.fields);
  addInCondition(conditions, Prisma.sql`${alias}.subfield_name`, query.subfields);
  addInCondition(conditions, Prisma.sql`${alias}.topic_name`, query.topics);
  addInCondition(conditions, Prisma.sql`${alias}.domain_id`, expandOpenAlexIds(query.domainIds));
  addInCondition(conditions, Prisma.sql`${alias}.field_id`, expandOpenAlexIds(query.fieldIds));
  addInCondition(conditions, Prisma.sql`${alias}.subfield_id`, expandOpenAlexIds(query.subfieldIds));
  addInCondition(conditions, Prisma.sql`${alias}.openalex_topic_id`, expandOpenAlexIds(query.topicIds));
  return conditions;
}

function addInCondition(conditions: Prisma.Sql[], column: Prisma.Sql, values?: string[]): void {
  const normalized = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
  if (normalized.length > 0) conditions.push(Prisma.sql`${column} IN (${Prisma.join(normalized)})`);
}

function citationBandCondition(band: string): Prisma.Sql {
  if (band === "0-9") return Prisma.sql`p.citation_count BETWEEN 0 AND 9`;
  if (band === "10-49") return Prisma.sql`p.citation_count BETWEEN 10 AND 49`;
  if (band === "50-99") return Prisma.sql`p.citation_count BETWEEN 50 AND 99`;
  if (band === "100-499") return Prisma.sql`p.citation_count BETWEEN 100 AND 499`;
  if (band === "500-999") return Prisma.sql`p.citation_count BETWEEN 500 AND 999`;
  return Prisma.sql`p.citation_count >= 1000`;
}

async function scalarFacet(
  where: Prisma.Sql,
  field: "paperKind" | "openAccessStatus" | "provider" | "source" | "language",
  limit: number,
): Promise<TrendFacetBucket[]> {
  const column = field === "paperKind"
    ? Prisma.sql`p.paper_kind`
    : field === "openAccessStatus"
      ? Prisma.sql`p.open_access_status`
      : field === "provider"
        ? Prisma.sql`p.primary_provider`
        : field === "source"
          ? Prisma.sql`p.journal_name`
          : Prisma.sql`p.language`;
  const rows = await getPrisma().$queryRaw<CountRow[]>(Prisma.sql`
    SELECT COALESCE(NULLIF(${column}, ''), 'unknown') AS id,
           COALESCE(NULLIF(${column}, ''), 'unknown') AS name,
           COUNT(*)::int AS count
    FROM papers p
    WHERE ${where}
    GROUP BY COALESCE(NULLIF(${column}, ''), 'unknown')
    ORDER BY count DESC, name ASC
    LIMIT ${limit}
  `);
  return rows.map(toFacetBucket);
}

async function taxonomyFacet(
  where: Prisma.Sql,
  topicWhere: Prisma.Sql,
  field: "domain" | "field" | "subfield" | "topic",
  limit: number,
): Promise<TrendFacetBucket[]> {
  const idColumn = field === "domain"
    ? Prisma.sql`pt.domain_id`
    : field === "field"
      ? Prisma.sql`pt.field_id`
      : field === "subfield"
        ? Prisma.sql`pt.subfield_id`
        : Prisma.sql`pt.openalex_topic_id`;
  const nameColumn = field === "domain"
    ? Prisma.sql`pt.domain_name`
    : field === "field"
      ? Prisma.sql`pt.field_name`
      : field === "subfield"
        ? Prisma.sql`pt.subfield_name`
        : Prisma.sql`pt.topic_name`;
  const rows = await getPrisma().$queryRaw<CountRow[]>(Prisma.sql`
    SELECT ${idColumn} AS id, ${nameColumn} AS name, COUNT(DISTINCT p.id)::int AS count
    FROM papers p
    JOIN paper_topics pt ON pt.paper_id = p.id
    WHERE ${where} AND ${topicWhere} AND NULLIF(${nameColumn}, '') IS NOT NULL
    GROUP BY ${idColumn}, ${nameColumn}
    ORDER BY count DESC, name ASC
    LIMIT ${limit}
  `);
  return rows.map(toFacetBucket);
}

async function citationBandFacets(where: Prisma.Sql): Promise<TrendFacetBucket[]> {
  const rows = await getPrisma().$queryRaw<CountRow[]>(Prisma.sql`
    SELECT band AS id, band AS name, COUNT(*)::int AS count
    FROM (
      SELECT CASE
        WHEN p.citation_count >= 1000 THEN '1000+'
        WHEN p.citation_count >= 500 THEN '500-999'
        WHEN p.citation_count >= 100 THEN '100-499'
        WHEN p.citation_count >= 50 THEN '50-99'
        WHEN p.citation_count >= 10 THEN '10-49'
        ELSE '0-9'
      END AS band
      FROM papers p WHERE ${where}
    ) scoped
    GROUP BY band
  `);
  const counts = new Map(rows.map((row) => [row.id, Number(row.count)]));
  return ["0-9", "10-49", "50-99", "100-499", "500-999", "1000+"]
    .filter((band) => (counts.get(band) ?? 0) > 0)
    .map((band) => ({ id: band, name: band, count: counts.get(band) ?? 0 }));
}

async function taxonomyCoverage(where: Prisma.Sql): Promise<TrendTaxonomyCoverage> {
  const [row] = await getPrisma().$queryRaw<Array<{
    totalPapers: number;
    papersWithAnyTopic: number;
    papersWithPrimaryTopic: number;
    papersWithFullHierarchy: number;
  }>>(Prisma.sql`
    SELECT
      COUNT(*)::int AS "totalPapers",
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM paper_topics any_pt WHERE any_pt.paper_id = p.id
      ))::int AS "papersWithAnyTopic",
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM paper_topics primary_pt
        WHERE primary_pt.paper_id = p.id AND primary_pt.is_primary = TRUE
      ))::int AS "papersWithPrimaryTopic",
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM paper_topics full_pt
        WHERE full_pt.paper_id = p.id AND full_pt.is_primary = TRUE
          AND NULLIF(full_pt.openalex_topic_id, '') IS NOT NULL
          AND NULLIF(full_pt.domain_id, '') IS NOT NULL
          AND NULLIF(full_pt.domain_name, '') IS NOT NULL
          AND NULLIF(full_pt.field_id, '') IS NOT NULL
          AND NULLIF(full_pt.field_name, '') IS NOT NULL
          AND NULLIF(full_pt.subfield_id, '') IS NOT NULL
          AND NULLIF(full_pt.subfield_name, '') IS NOT NULL
      ))::int AS "papersWithFullHierarchy"
    FROM papers p
    WHERE ${where}
  `);
  const totalPapers = Number(row?.totalPapers ?? 0);
  const papersWithAnyTopic = Number(row?.papersWithAnyTopic ?? 0);
  const papersWithPrimaryTopic = Number(row?.papersWithPrimaryTopic ?? 0);
  const papersWithFullHierarchy = Number(row?.papersWithFullHierarchy ?? 0);
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

type TopicGroup = { taxonomy?: TrendTopicTaxonomy; years: Map<number, number> };

function groupTopicRows(rows: TopicYearRow[]): Map<string, TopicGroup> {
  const groups = new Map<string, TopicGroup>();
  for (const row of rows) {
    const group = groups.get(row.topic) ?? { taxonomy: compactTaxonomy(row), years: new Map<number, number>() };
    group.years.set(row.year, (group.years.get(row.year) ?? 0) + Number(row.count));
    groups.set(row.topic, group);
  }
  return groups;
}

/**
 * Topics of the local corpus with their share of the reference population
 * (same N_t as the local topic page). The local corpus is what has been synced,
 * not the literature, so the verdict is always insufficient (LOCAL_CORPUS); the
 * numbers are still filled and BH-adjusted across the tested topics.
 */
function buildTopics(
  groups: Map<string, TopicGroup>,
  populationOf: (topic: string) => Map<number, number>,
  yearFrom: number,
  yearTo: number,
  lastCompleteYear: number,
  minPapers: number,
  sortBy: TrendsOverviewQuery["sortBy"],
): TrendingTopic[] {
  const built = [];
  for (const [topic, group] of groups) {
    const yearlyBreakdown = fillMissingYears(
      [...group.years].map(([year, count]) => ({ year, count })),
      yearFrom,
      yearTo,
    );
    const totalPapers = yearlyBreakdown.reduce((sum, row) => sum + row.count, 0);
    if (totalPapers < minPapers) continue;
    const shareSeries = buildShareRows(group.years, populationOf(topic), yearFrom, lastCompleteYear);
    built.push({
      topic: {
        topic,
        ...(group.taxonomy ? { taxonomy: group.taxonomy } : {}),
        totalPapers,
        yearlyBreakdown,
        ...computeMetrics(yearlyBreakdown, lastCompleteYear),
      },
      stats: shareTrendStatistics(shareSeries),
      ggt: computeGgt(shareSeries),
    });
  }
  const pValues = built.map((row) => row.stats.mannKendall?.pValue ?? null);
  const qValues = benjaminiHochberg(pValues);
  const qFamilySize = pValues.filter((p) => p !== null).length;
  const topics: TrendingTopic[] = built.map((row, index) => ({
    ...row.topic,
    classification: classifyTrend({ ...row.stats, source: "local", qValue: qValues[index] ?? null, qFamilySize }),
    ggt: row.ggt,
  }));
  topics.sort(sortBy === "total" ? compareByTotal : compareByTrend);
  return topics;
}

/**
 * Same test as the OpenAlex overview (trend.openalex-overview.ts
 * buildRisingKeywords): the complete years with papers are split into an
 * earlier half A and a later half B, every keyword gets the 2×2 log odds ratio
 * against the papers of each period, Benjamini–Hochberg across the keywords,
 * ordered by rankKeywordShifts. Raw YoY growth is kept as a descriptive number
 * only; it no longer selects or orders keywords.
 */
function buildRisingKeywords(
  rows: KeywordYearRow[],
  yearlyRows: YearRow[],
  yearFrom: number,
  yearTo: number,
  lastCompleteYear: number,
): RisingKeyword[] {
  const totals = new Map(yearlyRows.map((row) => [Number(row.year), Number(row.count)]));
  const usable = range(yearFrom, lastCompleteYear).filter((year) => (totals.get(year) ?? 0) > 0);
  if (usable.length < 2) return [];
  const half = Math.floor(usable.length / 2);
  const periodA = usable.slice(0, half);
  const periodB = usable.slice(half);
  const sumYears = (counts: Map<number, number>, years: number[]) => years.reduce((sum, year) => sum + (counts.get(year) ?? 0), 0);
  const totalA = sumYears(totals, periodA);
  const totalB = sumYears(totals, periodB);

  const groups = new Map<string, Map<number, number>>();
  for (const row of rows) {
    const years = groups.get(row.keyword) ?? new Map<number, number>();
    years.set(Number(row.year), Number(row.count));
    groups.set(row.keyword, years);
  }
  const tested = [...groups].flatMap(([keyword, years]) => {
    const papersA = sumYears(years, periodA);
    const papersB = sumYears(years, periodB);
    const result = logOddsRatio2x2({ withB: papersB, totalB, withA: papersA, totalA });
    return result ? [{ keyword, years, papersA, papersB, result }] : [];
  });
  const qValues = benjaminiHochberg(tested.map((item) => item.result.pValue));
  const shifts = tested.map((item, index) => ({
    ...item,
    term: item.keyword,
    logOddsRatio: item.result.logOddsRatio,
    z: item.result.z,
    pValue: item.result.pValue,
    qValue: qValues[index] ?? 1,
  }));
  const periods = {
    periodA: { yearFrom: periodA[0]!, yearTo: periodA.at(-1)! },
    periodB: { yearFrom: periodB[0]!, yearTo: periodB.at(-1)! },
  };
  return rankKeywordShifts(shifts, "rising")
    .slice(0, RISING_KEYWORDS_LIMIT)
    .map((shift) => {
      const yearlyBreakdown = fillMissingYears([...shift.years].map(([year, count]) => ({ year, count })), yearFrom, yearTo);
      return {
        keyword: shift.keyword,
        totalPapers: yearlyBreakdown.reduce((sum, row) => sum + row.count, 0),
        growthRatePct: yoyGrowthPct(truncateToCompleteYears(yearlyBreakdown, lastCompleteYear)),
        yearlyBreakdown,
        shift: {
          term: shift.term,
          papersA: shift.papersA,
          papersB: shift.papersB,
          logOddsRatio: shift.logOddsRatio,
          z: shift.z,
          pValue: shift.pValue,
          qValue: shift.qValue,
          ...periods,
        },
      };
    });
}

function toFacetBucket(row: CountRow): TrendFacetBucket {
  const name = row.name || row.id || "unknown";
  return {
    id: name,
    name,
    count: Number(row.count),
    ...(row.id && row.id !== name ? { openalexId: row.id } : {}),
  };
}

function compactTaxonomy(row: TopicYearRow): TrendTopicTaxonomy | undefined {
  const taxonomy: TrendTopicTaxonomy = {};
  for (const key of [
    "openalexTopicId",
    "domainId",
    "domainName",
    "fieldId",
    "fieldName",
    "subfieldId",
    "subfieldName",
  ] as const) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) taxonomy[key] = value;
  }
  return Object.keys(taxonomy).length > 0 ? taxonomy : undefined;
}

function expandOpenAlexIds(values?: string[]): string[] {
  const expanded = new Set<string>();
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    expanded.add(trimmed);
    const last = trimmed.split("/").filter(Boolean).at(-1);
    if (last) {
      expanded.add(last);
      expanded.add(last.toUpperCase());
    }
  }
  return [...expanded];
}

function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}
