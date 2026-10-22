import { resolveTrendWindow } from "@trend/shared-types";
import type {
  PublicationTrend,
  TopItem,
  TopicComparisonItem,
  TopicRelationshipResponse,
  TrendCompareResponse,
  TrendFacetBucket,
  TrendFacets,
  TrendTopicCandidate,
  TrendTopicCandidatesResponse,
  TrendTopicTaxonomy,
  YearlyCitationMetric,
  YearlyCount,
} from "@trend/shared-types";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import type { TopicTrendQuery, TrendCompareQuery, TrendRelationshipQuery, TrendTopicCandidatesQuery } from "./dto/trends.schema.js";
import { computeMetrics, fillMissingYears } from "./trend.formulas.js";
import { openAlexGet, openAlexGroupBy, openAlexYearCounts, shortId } from "./trend.openalex-client.js";
import { buildOpenAlexScope, withScope, yearsClause, type TrendScopeFilters } from "./trend.openalex-scope.js";
import { mapWithConcurrency } from "./trend.utils.js";

/**
 * OpenAlex-backed versions of the topic detail, compare, candidates and
 * relationships endpoints. They return the same shapes as the local
 * implementations in trend.service.ts, computed from OpenAlex aggregate counts
 * over the whole OpenAlex database (group_by only, no work records).
 *
 * Errors from OpenAlex are not caught here: the service falls back to the local
 * corpus as a whole, so one response never mixes the two sources. `null` means
 * "this topic is not an OpenAlex topic", which triggers the same fallback.
 */

const CONCURRENCY = 5;
const BREAKDOWN_CONCURRENCY = 6;
const TOP_LIST_SIZE = 5;
const FACET_SIZE = 10;
const NAME_SEARCH_PAGE_SIZE = 25;
const TOPIC_SELECT = "id,display_name,works_count,domain,field,subfield";

/** Same bands as the Data Scope citation filter, mapped to OpenAlex ranges. */
const CITATION_BANDS: Array<{ id: string; range: string }> = [
  { id: "0-9", range: "0-9" },
  { id: "10-49", range: "10-49" },
  { id: "50-99", range: "50-99" },
  { id: "100-499", range: "100-499" },
  { id: "500-999", range: "500-999" },
  { id: "1000+", range: ">999" },
];

export interface ResolvedOpenAlexTopic {
  /** Short id, e.g. "T10028". */
  id: string;
  name: string;
  taxonomy: {
    topicId: string;
    topicName: string;
    domainId?: string;
    domainName?: string;
    fieldId?: string;
    fieldName?: string;
    subfieldId?: string;
    subfieldName?: string;
  };
}

interface OpenAlexTopicEntity {
  id: string;
  display_name: string;
  works_count?: number;
  domain?: { id: string; display_name: string } | null;
  field?: { id: string; display_name: string } | null;
  subfield?: { id: string; display_name: string } | null;
}

interface OpenAlexTopicList {
  results?: OpenAlexTopicEntity[];
}

/** Taxonomy as returned to clients: `openalexTopicId` is the shared type's
 *  field; `topicId`/`topicName` match what the local implementation emits. */
type ResponseTaxonomy = TrendTopicTaxonomy & { topicId: string; topicName: string };

type Span = { yearFrom: number; yearTo: number; lastCompleteYear: number };

function resolveSpan(input: { yearFrom?: number; yearTo?: number }): Span {
  return resolveTrendWindow(input);
}

/**
 * Data Scope clauses for a request about ONE topic. Taxonomy filters on the
 * topic itself (`primary_topic.id`) are dropped: the requested topic defines
 * that dimension and keeping both would intersect to an empty set.
 */
async function scopeFilter(query: TrendScopeFilters): Promise<string> {
  return (await topicScope(query)).filter;
}

/** The Data Scope of a one-topic request in both forms the statistics need:
 *  `filter` (taxonomy clauses kept, primary_topic.id dropped) for the topic
 *  series and `nonTaxonomyFilter` for the reference population. */
export async function topicScope(query: TrendScopeFilters): Promise<{ filter: string; nonTaxonomyFilter: string }> {
  const scope = await buildOpenAlexScope(query);
  return {
    filter: scope.filter
      .split(",")
      .filter((clause) => clause && !clause.startsWith("primary_topic.id:"))
      .join(","),
    nonTaxonomyFilter: scope.nonTaxonomyFilter,
  };
}

// --------------------------------------------------------------------------
// Topic resolution

function toResolved(entity: OpenAlexTopicEntity): ResolvedOpenAlexTopic {
  const id = shortId(entity.id).toUpperCase();
  const pick = (ref?: { id: string; display_name: string } | null) => ({
    id: ref?.id ? shortId(ref.id) : undefined,
    name: ref?.display_name || undefined,
  });
  const domain = pick(entity.domain);
  const field = pick(entity.field);
  const subfield = pick(entity.subfield);
  return {
    id,
    name: entity.display_name,
    taxonomy: {
      topicId: id,
      topicName: entity.display_name,
      ...(domain.id ? { domainId: domain.id } : {}),
      ...(domain.name ? { domainName: domain.name } : {}),
      ...(field.id ? { fieldId: field.id } : {}),
      ...(field.name ? { fieldName: field.name } : {}),
      ...(subfield.id ? { subfieldId: subfield.id } : {}),
      ...(subfield.name ? { subfieldName: subfield.name } : {}),
    },
  };
}

function toResponseTaxonomy(topic: ResolvedOpenAlexTopic): ResponseTaxonomy {
  return { ...topic.taxonomy, openalexTopicId: topic.id };
}

function normalizeTopicId(value: string): string | null {
  const id = shortId(value).toUpperCase();
  return /^T\d+$/.test(id) ? id : null;
}

async function fetchTopicEntity(id: string): Promise<OpenAlexTopicEntity | null> {
  try {
    return await openAlexGet<OpenAlexTopicEntity>(`topics/${id}`, { select: TOPIC_SELECT });
  } catch (err) {
    // A topic id OpenAlex does not know is "unresolved"; every other failure is real.
    if (err instanceof Error && err.message === "OpenAlex 404") return null;
    throw err;
  }
}

/** Removes characters that are filter syntax in OpenAlex (`,` `|` `:`) and collapses spaces. */
function cleanSearchText(value: string): string {
  return value.replace(/[,|:]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * OpenAlex topics whose display name matches the text. `filter=display_name.search`
 * is used instead of `search=`, which ranks unrelated topics next to the match
 * (searching "Topic Modeling" returned Geological and Geochemical Analysis).
 */
async function searchTopicsByName(text: string, perPage: number, byWorksCount: boolean): Promise<OpenAlexTopicEntity[]> {
  const clean = cleanSearchText(text);
  if (!clean) return [];
  const params: Record<string, string> = {
    filter: `display_name.search:${clean}`,
    per_page: String(perPage),
    select: TOPIC_SELECT,
  };
  if (byWorksCount) params.sort = "works_count:desc";
  const json = await openAlexGet<OpenAlexTopicList>("topics", params);
  return json.results ?? [];
}

async function localTopicIdByName(name: string): Promise<string | null> {
  try {
    const row = await getPrisma().paperTopic.findFirst({
      where: { topicName: { equals: name, mode: "insensitive" }, openalexTopicId: { not: null } },
      select: { openalexTopicId: true },
    });
    return row?.openalexTopicId ? normalizeTopicId(row.openalexTopicId) : null;
  } catch (err) {
    // The taxonomy table is only a shortcut; the OpenAlex name lookup still works without it.
    logger.warn({ err }, "local taxonomy lookup failed while resolving an OpenAlex topic");
    return null;
  }
}

function sameName(a: string, b: string): boolean {
  return a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Finds the OpenAlex topic behind a topic name or id:
 * 1. an explicit topicId (short id or URL) is fetched directly;
 * 2. else the local taxonomy table maps the name to an id (a lookup only);
 * 3. else OpenAlex topics are searched by name and only an exact
 *    (case-insensitive) name match is accepted.
 * Returns null when nothing matches.
 */
export async function resolveOpenAlexTopic(topic: string, topicId?: string): Promise<ResolvedOpenAlexTopic | null> {
  const explicitId = topicId ? normalizeTopicId(topicId) : null;
  if (explicitId) {
    const entity = await fetchTopicEntity(explicitId);
    return entity ? toResolved(entity) : null;
  }

  const localId = await localTopicIdByName(topic);
  if (localId) {
    const entity = await fetchTopicEntity(localId);
    if (entity) return toResolved(entity);
  }

  const candidates = await searchTopicsByName(topic, NAME_SEARCH_PAGE_SIZE, true);
  const match = candidates.find((candidate) => sameName(candidate.display_name, topic));
  return match ? toResolved(match) : null;
}

// --------------------------------------------------------------------------
// Series helpers

function toSeries(counts: Map<number, number>, span: Span): YearlyCount[] {
  return fillMissingYears([...counts].map(([year, count]) => ({ year, count })), span.yearFrom, span.yearTo);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Citation impact per year. Citation totals are never invented: OpenAlex
 *  aggregate queries only count works, so they stay null. PP(top 10%) follows
 *  Waltman & Schreiber (2013). */
function toCitationTrend(yearly: YearlyCount[], topCounts: Map<number, number>): YearlyCitationMetric[] {
  return yearly.map(({ year, count }) => {
    const topCitedCount = topCounts.get(year) ?? 0;
    return {
      year,
      count,
      totalCitations: null,
      avgCitations: null,
      topCitedCount,
      ppTop10Pct: count > 0 ? round1((topCitedCount / count) * 100) : null,
    };
  });
}

const TOP_10_CLAUSE = "citation_normalized_percentile.is_in_top_10_percent:true";

function topicBase(scope: string, topic: ResolvedOpenAlexTopic, span: Span): string {
  return withScope(scope, `primary_topic.id:${topic.id}`, yearsClause(span.yearFrom, span.yearTo));
}

/** Yearly counts and top-10% counts of one topic: 2 requests. */
async function topicSeries(scope: string, topic: ResolvedOpenAlexTopic, span: Span) {
  const base = topicBase(scope, topic, span);
  const [counts, topCounts] = await Promise.all([
    openAlexYearCounts(base),
    openAlexYearCounts(withScope(base, TOP_10_CLAUSE)),
  ]);
  const yearlyBreakdown = toSeries(counts, span);
  return {
    yearlyBreakdown,
    totalPapers: yearlyBreakdown.reduce((sum, point) => sum + point.count, 0),
    citationTrend: toCitationTrend(yearlyBreakdown, topCounts),
    ...computeMetrics(yearlyBreakdown, span.lastCompleteYear),
  };
}

function isKnown(key: string): boolean {
  return key !== "unknown" && key !== "null" && key !== "";
}

async function topGroups(filter: string, groupBy: string, size: number, keepUnknown = false) {
  const page = await openAlexGroupBy(filter, groupBy);
  return page.groups.filter((group) => keepUnknown || isKnown(group.key)).slice(0, size);
}

function topItems(groups: Array<{ key: string; name: string; count: number }>): TopItem[] {
  return groups.map((group) => ({ id: group.key, name: group.name, count: group.count }));
}

function buckets(groups: Array<{ key: string; name: string; count: number }>, openalex = false): TrendFacetBucket[] {
  return groups.map((group) => ({
    id: group.key,
    name: group.name,
    count: group.count,
    ...(openalex ? { openalexId: group.key } : {}),
  }));
}

function emptyFacets(): TrendFacets {
  return {
    paperKinds: [],
    openAccessStatuses: [],
    providers: [],
    topSources: [],
    languages: [],
    citationBands: [],
    domains: [],
    fields: [],
    subfields: [],
    topics: [],
  };
}

// --------------------------------------------------------------------------
// Endpoints

/**
 * Deep dive into one topic (about 15 requests: resolve 1-2, years 1, top-10% 1,
 * sources/authors/keywords 3, type/OA/language 3, citation bands 6; the
 * top-source list doubles as the journal list). Returns null when the topic is
 * not an OpenAlex topic. The caller attaches `statistics`.
 */
export async function getOpenAlexTopicDetail(topic: string, query: TopicTrendQuery): Promise<Omit<PublicationTrend, "statistics"> | null> {
  const resolved = await resolveOpenAlexTopic(topic, query.topicId);
  if (!resolved) return null;

  const span = resolveSpan(query);
  const scope = await scopeFilter(query);
  const base = topicBase(scope, resolved, span);
  const series = await topicSeries(scope, resolved, span);

  const common = {
    dataSource: "openalex" as const,
    topic,
    taxonomy: toResponseTaxonomy(resolved),
    totalPapers: series.totalPapers,
    yearlyBreakdown: series.yearlyBreakdown,
    citationTrend: series.citationTrend,
    lastCompleteYear: span.lastCompleteYear,
    growthRatePct: series.growthRatePct,
    cagr3yPct: series.cagr3yPct,
    momentum: series.momentum,
  };

  // No work in the window: nothing to break down, skip the remaining requests.
  if (series.totalPapers === 0) {
    return { ...common, facets: emptyFacets(), topJournals: [], topAuthors: [], topKeywords: [], computedAt: new Date().toISOString() };
  }

  // One pool for every independent breakdown request (6 group_by + 6 citation bands).
  type Task = { kind: "list"; by: string; size: number } | { kind: "band"; id: string; range: string };
  const tasks: Task[] = [
    { kind: "list", by: "primary_location.source.id", size: FACET_SIZE },
    { kind: "list", by: "authorships.author.id", size: TOP_LIST_SIZE },
    { kind: "list", by: "keywords.id", size: TOP_LIST_SIZE },
    { kind: "list", by: "type", size: FACET_SIZE },
    { kind: "list", by: "open_access.oa_status", size: FACET_SIZE },
    { kind: "list", by: "language", size: FACET_SIZE },
    ...CITATION_BANDS.map((band): Task => ({ kind: "band", id: band.id, range: band.range })),
  ];
  const results = await mapWithConcurrency(tasks, BREAKDOWN_CONCURRENCY, async (task) => {
    if (task.kind === "list") return { groups: await topGroups(base, task.by, task.size) };
    const counts = await openAlexYearCounts(withScope(base, `cited_by_count:${task.range}`));
    return { band: { id: task.id, name: task.id, count: [...counts.values()].reduce((sum, count) => sum + count, 0) } };
  });
  const groupsAt = (index: number) => results[index]?.groups ?? [];
  const sources = groupsAt(0);
  const authors = groupsAt(1);
  const keywords = groupsAt(2);
  const kinds = groupsAt(3);
  const oaStatuses = groupsAt(4);
  const languages = groupsAt(5);
  const bandCounts = results.flatMap((result) => (result.band ? [result.band] : []));

  return {
    ...common,
    facets: {
      ...emptyFacets(),
      paperKinds: buckets(kinds),
      openAccessStatuses: buckets(oaStatuses),
      languages: buckets(languages),
      topSources: buckets(sources, true),
      citationBands: bandCounts,
    },
    topJournals: topItems(sources.slice(0, TOP_LIST_SIZE)),
    topAuthors: topItems(authors),
    topKeywords: topItems(keywords),
    computedAt: new Date().toISOString(),
  };
}

/**
 * Side-by-side comparison (2 + resolve requests per topic). Null when any topic
 * is not an OpenAlex topic, so a comparison never mixes OpenAlex and local counts.
 */
export async function getOpenAlexCompare(query: TrendCompareQuery): Promise<TrendCompareResponse | null> {
  const span = resolveSpan(query);
  // `topics` is the list being compared here, not a taxonomy filter.
  const scope = await scopeFilter({ ...query, topics: undefined });
  const names = [...new Set(query.topics)];

  const resolved = await mapWithConcurrency(names, CONCURRENCY, (name) => resolveOpenAlexTopic(name));
  if (resolved.some((entry) => !entry)) return null;

  const pairs = names.map((name, index) => ({ name, entry: resolved[index] as ResolvedOpenAlexTopic }));
  const topics = await mapWithConcurrency(
    pairs,
    CONCURRENCY,
    async ({ name, entry }): Promise<TopicComparisonItem> => {
      const series = await topicSeries(scope, entry, span);
      return {
        topic: name,
        taxonomy: toResponseTaxonomy(entry),
        totalPapers: series.totalPapers,
        yearlyBreakdown: series.yearlyBreakdown,
        citationTrend: series.citationTrend,
        momentum: series.momentum,
        growthRatePct: series.growthRatePct,
        cagr3yPct: series.cagr3yPct,
      };
    },
  );

  return { dataSource: "openalex", ...span, topics, computedAt: new Date().toISOString() };
}

/**
 * Topics whose OpenAlex name matches the search text, each with its yearly
 * counts (1 search request + 1 per topic). Always answers from OpenAlex: an
 * empty list means no OpenAlex topic matched.
 */
export async function getOpenAlexTopicCandidates(query: TrendTopicCandidatesQuery): Promise<TrendTopicCandidatesResponse> {
  const span = resolveSpan(query);
  const scope = await scopeFilter(query);
  const text = query.q.trim();

  const found = await searchTopicsByName(text, query.limit, true);

  const measured = await mapWithConcurrency(found, CONCURRENCY, async (entity): Promise<TrendTopicCandidate> => {
    const resolved = toResolved(entity);
    const counts = await openAlexYearCounts(topicBase(scope, resolved, span));
    const yearlyBreakdown = toSeries(counts, span);
    return {
      topic: resolved.name,
      taxonomy: toResponseTaxonomy(resolved),
      totalPapers: yearlyBreakdown.reduce((sum, point) => sum + point.count, 0),
      yearlyBreakdown,
      matchedBy: "topic",
      ...computeMetrics(yearlyBreakdown, span.lastCompleteYear),
    };
  });

  const topics = measured
    .filter((candidate) => candidate.totalPapers >= query.minPapers)
    .sort((a, b) => b.totalPapers - a.totalPapers)
    .slice(0, query.limit);

  return {
    dataSource: "openalex",
    query: text,
    ...span,
    totalCandidates: topics.length,
    topics,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Topics co-assigned (OpenAlex `topics` list) to the papers whose primary topic
 * is the requested one. One group_by request after resolution; ids are topic
 * names, like the local implementation. Null when the topic is not an OpenAlex topic.
 */
export async function getOpenAlexRelationships(query: TrendRelationshipQuery): Promise<TopicRelationshipResponse | null> {
  const resolved = await resolveOpenAlexTopic(query.topic, query.topicId);
  if (!resolved) return null;

  const span = resolveSpan(query);
  const scope = await scopeFilter(query);
  const base = topicBase(scope, resolved, span);

  const page = await openAlexGroupBy(base, "topics.id");
  const self = page.groups.find((group) => shortId(group.key).toUpperCase() === resolved.id);
  const totalPapers = self
    ? self.count
    : [...(await openAlexYearCounts(base)).values()].reduce((sum, count) => sum + count, 0);

  const related = page.groups
    .filter((group) => shortId(group.key).toUpperCase() !== resolved.id && isKnown(group.key))
    .slice(0, query.limit);

  return {
    dataSource: "openalex",
    topic: query.topic,
    yearFrom: span.yearFrom,
    yearTo: span.yearTo,
    nodes: [
      { id: query.topic, label: query.topic, count: totalPapers },
      ...related.map((group) => ({ id: group.name, label: group.name, count: group.count })),
    ],
    edges: related.map((group) => ({ source: query.topic, target: group.name, count: group.count })),
    computedAt: new Date().toISOString(),
  };
}
