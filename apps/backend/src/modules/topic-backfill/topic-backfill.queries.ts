import type { TopicBackfillTargetKind } from "@trend/shared-types";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { openAlexSearchText } from "../api-sync/providers/openalex.client.js";

type PrismaClientLike = ReturnType<typeof getPrisma>;

/** One OpenAlex works request: a filter, optionally a search phrase and a sort. */
export interface BackfillQuery {
  filterExpression: string;
  searchText?: string;
  sort?: string;
}

export interface BackfillTarget {
  kind: TopicBackfillTargetKind;
  id: string;
  name: string;
  /** Local papers under the entry, as last counted. */
  paperCount: number;
  /** Empty when OpenAlex cannot be asked about this entry (no OpenAlex id, a tag with no usable include rule). */
  queries: BackfillQuery[];
}

/** Same eligibility as the campaign planner, so every imported paper has an abstract and becomes active. */
const ELIGIBILITY_FILTER = "has_abstract:true";
const MOST_CITED = "cited_by_count:desc";
/** A tag expands to at most this many OR-ed ids per request, so no URL grows without bound. */
export const TAG_FILTER_VALUES_PER_QUERY = 50;
/** A tag with many keyword rules is sampled, not crawled: each keyword is a separate phrase query. */
export const MAX_TAG_KEYWORD_QUERIES = 5;

/** OpenAlex filter attribute per taxonomy level. */
const LEVEL_FILTER = {
  topic: "topics.id",
  subfield: "topics.subfield.id",
  field: "topics.field.id",
  domain: "topics.domain.id",
} as const;
type NodeLevel = keyof typeof LEVEL_FILTER;
const LEVEL_ORDER: readonly NodeLevel[] = ["topic", "subfield", "field", "domain"];

/** Ids go into a comma/pipe separated filter, so anything but a short alphanumeric id is dropped. */
const SAFE_OPENALEX_ID = /^[A-Za-z0-9]{1,32}$/;

export interface BackfillNode { level: string; openalexId: string | null }

/** Filter query for a topic or subfield: the most cited works the corpus may be missing come first. */
export function nodeQuery(level: NodeLevel, openalexId: string | null): BackfillQuery | null {
  if (!openalexId || !SAFE_OPENALEX_ID.test(openalexId)) return null;
  return { filterExpression: `${LEVEL_FILTER[level]}:${openalexId},${ELIGIBILITY_FILTER}`, sort: MOST_CITED };
}

/** Phrase search for a keyword, in relevance order. Null when nothing searchable is left of the name. */
export function keywordQuery(name: string): BackfillQuery | null {
  const phrase = openAlexSearchText(name).replace(/"/g, "").replace(/\s+/g, " ").trim();
  if (phrase.length < 3 || phrase.length > 160) return null;
  return { searchText: `"${phrase}"`, filterExpression: ELIGIBILITY_FILTER };
}

/**
 * Queries for a tag from its INCLUDE rules: the taxonomy nodes grouped by level (ids OR-ed with "|", chunked), then
 * one phrase query per keyword rule, at most MAX_TAG_KEYWORD_QUERIES.
 * Exclude rules are NOT translated: OpenAlex cannot express "not in this topic" across levels, and the re-tagging
 * step that follows a run applies them, so an excluded work may be imported but is never tagged.
 */
export function buildTagQueries(nodes: readonly BackfillNode[], keywordNames: readonly string[]): BackfillQuery[] {
  const queries: BackfillQuery[] = [];
  for (const level of LEVEL_ORDER) {
    const ids = [...new Set(nodes
      .filter((node) => node.level === level && node.openalexId && SAFE_OPENALEX_ID.test(node.openalexId))
      .map((node) => node.openalexId as string))];
    for (let i = 0; i < ids.length; i += TAG_FILTER_VALUES_PER_QUERY) {
      const values = ids.slice(i, i + TAG_FILTER_VALUES_PER_QUERY).join("|");
      queries.push({ filterExpression: `${LEVEL_FILTER[level]}:${values},${ELIGIBILITY_FILTER}`, sort: MOST_CITED });
    }
  }
  const phrases = new Set<string>();
  for (const name of keywordNames) {
    const query = keywordQuery(name);
    if (query && !phrases.has(query.searchText!)) {
      phrases.add(query.searchText!);
      queries.push(query);
    }
    if (phrases.size >= MAX_TAG_KEYWORD_QUERIES) break;
  }
  return queries;
}

/**
 * Loads the entry a run is about and the queries that fetch its works. Null when it does not exist or is not
 * active (archived tag, hidden keyword or node, merged keyword).
 */
export async function loadBackfillTarget(
  kind: TopicBackfillTargetKind,
  id: string,
  prisma: PrismaClientLike = getPrisma(),
): Promise<BackfillTarget | null> {
  if (kind === "topic" || kind === "subfield") {
    // The level must equal the kind: a subfield id sent as a topic would otherwise build a topics.id filter from it.
    const node = await prisma.researchTopic.findFirst({
      where: { id, level: kind, status: "active" },
      select: { topicName: true, paperCount: true, openalexId: true },
    });
    if (!node) return null;
    const query = nodeQuery(kind, node.openalexId);
    return { kind, id, name: node.topicName, paperCount: node.paperCount, queries: query ? [query] : [] };
  }

  if (kind === "keyword") {
    const keyword = await prisma.keyword.findFirst({
      where: { id, status: "active" },
      select: { keywordName: true, paperCount: true },
    });
    if (!keyword) return null;
    const query = keywordQuery(keyword.keywordName);
    return { kind, id, name: keyword.keywordName, paperCount: keyword.paperCount, queries: query ? [query] : [] };
  }

  const tag = await prisma.tag.findFirst({ where: { id, status: "active" }, select: { name: true, paperCount: true } });
  if (!tag) return null;
  const rules = await prisma.tagRule.findMany({ where: { tagId: id, effect: "include" }, orderBy: { createdAt: "asc" } });
  const nodeIds = [...new Set(rules.flatMap((rule) => (rule.researchTopicId ? [rule.researchTopicId] : [])))];
  const keywordIds = [...new Set(rules.flatMap((rule) => (rule.keywordId ? [rule.keywordId] : [])))];
  const [nodes, keywords] = await Promise.all([
    nodeIds.length
      ? prisma.researchTopic.findMany({
        where: { id: { in: nodeIds }, status: "active" }, select: { level: true, openalexId: true },
      })
      : [],
    keywordIds.length
      ? prisma.keyword.findMany({
        where: { id: { in: keywordIds }, status: "active" }, select: { keywordName: true }, orderBy: { keywordName: "asc" },
      })
      : [],
  ]);
  return {
    kind, id, name: tag.name, paperCount: tag.paperCount,
    queries: buildTagQueries(nodes, keywords.map((keyword) => keyword.keywordName)),
  };
}
