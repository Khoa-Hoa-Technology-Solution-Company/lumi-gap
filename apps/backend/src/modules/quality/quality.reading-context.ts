import type { PaperReadingContext } from "@trend/shared-types";
import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { cache, hashKey } from "../../infrastructure/cache.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { findPaperEmbeddingNeighbours } from "../../infrastructure/database/postgres-paper-search.js";
import { logger } from "../../infrastructure/logger.js";
import { trendService } from "../trends/trend.service.js";
import type { TopicTrendQuery } from "../trends/dto/trends.schema.js";
import type { ReadingContextQueryInput } from "./dto/quality.schema.js";

export const READING_CONTEXT_TTL_SECONDS = 6 * 3600;
// v3: related papers follow a requested topic; CAGR guard; partialYear.
const READING_CONTEXT_VERSION = "v3";
/** Below this many papers in the base year a 3-year CAGR is noise (e.g. 1 → 9 papers = +108%/year). */
export const MIN_CAGR_BASE_COUNT = 5;
const MAX_RELATED = 5;
const NEIGHBOUR_POOL = 30;
const FALLBACK_TOPICS = 3;
const MIN_PARTIAL_TOPIC_CHARS = 3;

type Related = PaperReadingContext["related"][number];
type Candidate = Omit<Related, "reason">;

const normalizeTopic = (value: string) => value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();

/**
 * Pick at most five papers to read next: newer work on the same topic, the most cited work on the same
 * topic, then the closest semantic neighbours. Deterministic for a given neighbour list.
 */
export function pickRelatedPapers(paperYear: number | null, candidates: Candidate[]): Related[] {
  const bySimilarity = (a: Candidate, b: Candidate) => b.similarity - a.similarity || a.id.localeCompare(b.id);
  const sameTopic = candidates.filter((item) => item.sharedTopics.length).sort(bySimilarity);
  const picked = new Set<string>();
  const take = (items: Candidate[], count: number, reason: Related["reason"]) => items.filter((item) => !picked.has(item.id)).slice(0, count).map((item) => { picked.add(item.id); return { ...item, reason }; });
  const newer = paperYear === null ? [] : take(sameTopic.filter((item) => item.publicationYear !== null && item.publicationYear > paperYear), 2, "same_topic_newer");
  const mostCited = take([...sameTopic].sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0) || bySimilarity(a, b)), 2, "same_topic_most_cited");
  const neighbours = take([...candidates].sort(bySimilarity), MAX_RELATED - newer.length - mostCited.length, "semantic_neighbor");
  return [...newer, ...mostCited, ...neighbours].slice(0, MAX_RELATED);
}

type TopicPaperRow = { id: string; legacyMongoId: string | null; title: string; publicationYear: number | null; citationCount: number | null; topics: string[]; newerRank: bigint | number | null; citedRank: bigint | number };

/**
 * Papers sharing the paper's top topics, ranked by citations: the best few published after the paper and
 * the best few overall. One query over the indexed paper_topics.topic_name; no embedding needed.
 */
async function topicFallback(paper: { id: string; publicationYear: number | null }, topics: string[], limit: number): Promise<{ newer: Candidate[]; mostCited: Candidate[] }> {
  if (!topics.length) return { newer: [], mostCited: [] };
  const rows = await getPrisma().$queryRaw<TopicPaperRow[]>(Prisma.sql`
    WITH shared AS (
      SELECT pt.paper_id, array_agg(DISTINCT pt.topic_name ORDER BY pt.topic_name) AS topics
      FROM paper_topics pt
      WHERE pt.topic_name = ANY(${topics}::text[]) AND pt.paper_id <> ${paper.id}::uuid
      GROUP BY pt.paper_id
    ), ranked AS (
      SELECT p.id, p.legacy_mongo_id AS "legacyMongoId", p.title, p.publication_year AS "publicationYear",
        p.citation_count AS "citationCount", s.topics,
        CASE WHEN ${paper.publicationYear}::int IS NOT NULL AND p.publication_year > ${paper.publicationYear}::int
          THEN row_number() OVER (PARTITION BY p.publication_year > ${paper.publicationYear}::int ORDER BY p.citation_count DESC, p.id) END AS "newerRank",
        row_number() OVER (ORDER BY p.citation_count DESC, p.id) AS "citedRank"
      FROM shared s JOIN papers p ON p.id = s.paper_id
      WHERE p.data_status = 'active'
    )
    SELECT * FROM ranked WHERE "newerRank" <= ${limit} OR "citedRank" <= ${limit}
  `);
  const own = new Map(topics.map((name) => [normalizeTopic(name), name]));
  const candidate = (row: TopicPaperRow): Candidate => ({
    id: publicDatabaseId(row), title: row.title, publicationYear: row.publicationYear ?? null, citationCount: row.citationCount ?? null, similarity: 0,
    sharedTopics: [...new Set(row.topics.flatMap((name) => own.get(normalizeTopic(name)) ?? []))].sort(),
  });
  const rank = (value: bigint | number | null) => (value === null ? Infinity : Number(value));
  return {
    newer: rows.filter((row) => rank(row.newerRank) <= limit).sort((a, b) => rank(a.newerRank) - rank(b.newerRank)).map(candidate),
    mostCited: rows.filter((row) => rank(row.citedRank) <= limit).sort((a, b) => rank(a.citedRank) - rank(b.citedRank)).map(candidate),
  };
}

/** Fill the remaining slots from topic peers: newer work first (up to two newer in total), then the most cited. */
export function fillFromTopicPeers(picked: Related[], fallback: { newer: Candidate[]; mostCited: Candidate[] }): Related[] {
  const result = [...picked];
  const seen = new Set(result.map((item) => item.id));
  const add = (items: Candidate[], reason: Related["reason"], until: () => boolean) => {
    for (const item of items) {
      if (result.length >= MAX_RELATED || until()) return;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      result.push({ ...item, reason });
    }
  };
  const newerCount = () => result.filter((item) => item.reason === "same_topic_newer").length;
  add(fallback.newer, "same_topic_newer", () => newerCount() >= 2);
  add(fallback.mostCited, "same_topic_most_cited", () => false);
  add(fallback.newer, "same_topic_newer", () => false);
  return result;
}

async function relatedPapers(paper: { id: string; publicationYear: number | null }, ownTopics: string[]): Promise<Related[]> {
  const rows = await findPaperEmbeddingNeighbours(paper.id, NEIGHBOUR_POOL);
  let picked: Related[] = [];
  if (rows.length) {
    const topicRows = await getPrisma().paperTopic.findMany({ where: { paperId: { in: rows.map((row) => row.id) } }, select: { paperId: true, topicName: true } });
    const own = new Map(ownTopics.map((name) => [normalizeTopic(name), name]));
    const shared = new Map<string, Set<string>>();
    for (const row of topicRows) {
      const name = own.get(normalizeTopic(row.topicName));
      if (name) shared.set(row.paperId, (shared.get(row.paperId) ?? new Set()).add(name));
    }
    picked = pickRelatedPapers(paper.publicationYear, rows.map((row) => ({
      id: publicDatabaseId(row), title: row.title, publicationYear: row.publicationYear ?? null, citationCount: row.citationCount ?? null,
      similarity: Math.round(Math.min(1, Math.max(0, Number(row.similarity))) * 1000) / 1000,
      sharedTopics: [...(shared.get(row.id) ?? [])].sort(),
    })));
  }
  if (picked.length >= MAX_RELATED) return picked;
  // Most papers have no embedding yet; topic peers still give a useful reading list.
  return fillFromTopicPeers(picked, await topicFallback(paper, ownTopics.slice(0, FALLBACK_TOPICS), MAX_RELATED));
}

/** Exact known topic (case-insensitive) first; otherwise one of this paper's own topics containing the text. */
async function matchRequestedTopic(requested: string, ownTopics: string[]): Promise<string | null> {
  const known = await getPrisma().paperTopic.findFirst({ where: { topicName: { equals: requested, mode: "insensitive" } }, select: { topicName: true } });
  if (known) return known.topicName;
  const wanted = normalizeTopic(requested);
  if (wanted.length < MIN_PARTIAL_TOPIC_CHARS) return null;
  return ownTopics.find((name) => normalizeTopic(name).includes(wanted)) ?? null;
}

/** CAGR over complete years only, withheld when its base year is too small; flags the running year. */
export function trendFigures(yearlyBreakdown: { year: number; count: number }[], cagr3yPct: number | null | undefined, currentYear = new Date().getFullYear()) {
  const complete = yearlyBreakdown.filter((point) => point.year < currentYear);
  const base = complete.slice(-4)[0];
  return {
    cagr3yPct: cagr3yPct === null || cagr3yPct === undefined || !base || base.count < MIN_CAGR_BASE_COUNT ? null : cagr3yPct,
    partialYear: yearlyBreakdown.some((point) => point.year === currentYear) ? currentYear : null,
  };
}

async function trendFor(topic: { name: string; source: "requested" | "paper_topic" } | null, paperYear: number | null): Promise<PaperReadingContext["trend"]> {
  if (!topic) return null;
  try {
    // Local PostgreSQL computation only: the reading context never spends OpenAlex budget.
    const detail = await trendService.topicDetailOnly(topic.name, {} as TopicTrendQuery);
    return {
      topic: topic.name, source: topic.source, totalPapers: detail.totalPapers,
      growthRatePct: detail.growthRatePct ?? null, momentum: detail.momentum ?? null,
      ...trendFigures(detail.yearlyBreakdown, detail.cagr3yPct),
      yearlyBreakdown: detail.yearlyBreakdown.map(({ year, count }) => ({ year, count })), paperYear,
    };
  } catch (err) {
    if (!(err instanceof AppError && err.statusCode === 404)) logger.warn({ err, topic: topic.name }, "reading context trend unavailable");
    return null;
  }
}

/** Where a paper sits in a trend and what to read next. Deterministic, no LLM call. */
export async function getPaperReadingContext(paperIdInput: string, request: ReadingContextQueryInput): Promise<PaperReadingContext> {
  const parsed = parseDatabaseId(paperIdInput);
  if (!parsed) throw AppError.badRequest("Invalid identifier");
  const paper = await getPrisma().paper.findUnique({
    where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
    select: { id: true, legacyMongoId: true, publicationYear: true, dataStatus: true },
  });
  if (!paper || paper.dataStatus !== "active") throw AppError.notFound("Paper not found");
  const requestedTopic = request.topic?.trim() || request.query?.trim() || null;
  const key = `quality:reading-context:${READING_CONTEXT_VERSION}:${hashKey({ paperId: paper.id, topic: requestedTopic ? normalizeTopic(requestedTopic) : null })}`;
  const cached = await cache.get<PaperReadingContext>(key);
  if (cached) return cached;

  const paperTopics = await getPrisma().paperTopic.findMany({
    where: { paperId: paper.id },
    orderBy: [{ isPrimary: "desc" }, { confidence: { sort: "desc", nulls: "last" } }, { position: "asc" }],
    select: { topicName: true },
  });
  const ownTopics = [...new Set(paperTopics.map((row) => row.topicName))];
  let topic: { name: string; source: "requested" | "paper_topic" } | null = null;
  if (requestedTopic) {
    const matched = await matchRequestedTopic(requestedTopic, ownTopics);
    if (matched) topic = { name: matched, source: "requested" };
  }
  if (!topic && ownTopics[0]) topic = { name: ownTopics[0], source: "paper_topic" };
  const paperYear = paper.publicationYear ?? null;
  // A topic the reader arrived with also drives "read next", so the list matches the trend shown above it.
  const relatedTopics = topic?.source === "requested" ? [topic.name] : ownTopics;
  const [trend, related] = await Promise.all([trendFor(topic, paperYear), relatedPapers({ id: paper.id, publicationYear: paperYear }, relatedTopics)]);
  const result: PaperReadingContext = { paperId: publicDatabaseId(paper), requestedTopic, trend, related, computedAt: new Date().toISOString() };
  await cache.set(key, result, READING_CONTEXT_TTL_SECONDS);
  return result;
}
