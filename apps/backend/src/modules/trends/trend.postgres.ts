import type {
  RecommendedTrendComparison,
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
import type { TrendsOverviewQuery } from "./dto/trends.schema.js";

const DEFAULT_WINDOW_YEARS = 5;
const MIN_RISING_PREV_BASE = 2;

type CountRow = { id: string | null; name: string | null; count: number };
type YearRow = { year: number; count: number; totalCitations: number };
type TopicYearRow = TrendTopicTaxonomy & { topic: string; year: number; count: number };
type KeywordYearRow = { keyword: string; year: number; count: number };

export async function getPostgresTrendsOverview(query: TrendsOverviewQuery): Promise<TrendsOverview> {
  const prisma = getPrisma();
  const now = new Date();
  const yearTo = query.yearTo ?? now.getFullYear();
  const yearFrom = query.yearFrom ?? yearTo - DEFAULT_WINDOW_YEARS;
  const lastCompleteYear = Math.min(yearTo, now.getFullYear() - 1);
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
      WHERE ${baseWhere} AND ${topicWhere}
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
  const topics = buildTopics(topicRows, yearFrom, yearTo, lastCompleteYear, query.minPapers, query.sortBy);
  const risingKeywords = buildRisingKeywords(keywordRows, yearFrom, yearTo, lastCompleteYear);
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

function buildPaperWhere(query: TrendsOverviewQuery, yearFrom: number, yearTo: number): Prisma.Sql {
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

  const topicConditions = buildTopicConditions(query, Prisma.sql`scope_pt`);
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

function buildTopicWhere(query: TrendsOverviewQuery, alias: Prisma.Sql): Prisma.Sql {
  const conditions = buildTopicConditions(query, alias);
  return conditions.length > 0 ? Prisma.join(conditions, " AND ") : Prisma.sql`TRUE`;
}

function buildTopicConditions(query: TrendsOverviewQuery, alias: Prisma.Sql): Prisma.Sql[] {
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

function buildTopics(
  rows: TopicYearRow[],
  yearFrom: number,
  yearTo: number,
  lastCompleteYear: number,
  minPapers: number,
  sortBy: TrendsOverviewQuery["sortBy"],
): TrendingTopic[] {
  const groups = new Map<string, { taxonomy?: TrendTopicTaxonomy; years: Map<number, number> }>();
  for (const row of rows) {
    const group = groups.get(row.topic) ?? { taxonomy: compactTaxonomy(row), years: new Map<number, number>() };
    group.years.set(row.year, (group.years.get(row.year) ?? 0) + Number(row.count));
    groups.set(row.topic, group);
  }
  const topics: TrendingTopic[] = [];
  for (const [topic, group] of groups) {
    const yearlyBreakdown = fillMissingYears(
      [...group.years].map(([year, count]) => ({ year, count })),
      yearFrom,
      yearTo,
    );
    const totalPapers = yearlyBreakdown.reduce((sum, row) => sum + row.count, 0);
    if (totalPapers < minPapers) continue;
    topics.push({
      topic,
      ...(group.taxonomy ? { taxonomy: group.taxonomy } : {}),
      totalPapers,
      yearlyBreakdown,
      ...computeMetrics(yearlyBreakdown, lastCompleteYear),
    });
  }
  topics.sort((a, b) => {
    if (sortBy === "growth") return b.growthRatePct - a.growthRatePct;
    if (sortBy === "total") return b.totalPapers - a.totalPapers;
    return b.momentum - a.momentum;
  });
  return topics;
}

function buildRisingKeywords(
  rows: KeywordYearRow[],
  yearFrom: number,
  yearTo: number,
  lastCompleteYear: number,
): RisingKeyword[] {
  const groups = new Map<string, Map<number, number>>();
  for (const row of rows) {
    const years = groups.get(row.keyword) ?? new Map<number, number>();
    years.set(row.year, Number(row.count));
    groups.set(row.keyword, years);
  }
  return [...groups]
    .map(([keyword, years]) => {
      const yearlyBreakdown = fillMissingYears(
        [...years].map(([year, count]) => ({ year, count })),
        yearFrom,
        yearTo,
      );
      const complete = truncateToCompleteYears(yearlyBreakdown, lastCompleteYear);
      const prevBase = complete.length >= 2 ? complete.at(-2)?.count ?? 0 : 0;
      return {
        keyword,
        totalPapers: yearlyBreakdown.reduce((sum, row) => sum + row.count, 0),
        growthRatePct: yoyGrowthPct(complete),
        yearlyBreakdown,
        prevBase,
      };
    })
    .filter((row) => row.growthRatePct > 0 && row.prevBase >= MIN_RISING_PREV_BASE)
    .sort((a, b) => b.growthRatePct - a.growthRatePct || a.totalPapers - b.totalPapers)
    .slice(0, 10)
    .map(({ prevBase: _internal, ...row }) => row);
}

function buildRecommendedComparisons(topics: TrendingTopic[]): RecommendedTrendComparison[] {
  const recommendations: RecommendedTrendComparison[] = [];
  const top = topics.slice(0, 3);
  if (top.length >= 2) {
    recommendations.push({
      topics: top.map((topic) => topic.topic),
      reason: "Top momentum topics in the current filtered corpus.",
      metrics: top.map(({ topic, totalPapers, growthRatePct, momentum }) => ({ topic, totalPapers, growthRatePct, momentum })),
    });
  }
  return recommendations;
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
