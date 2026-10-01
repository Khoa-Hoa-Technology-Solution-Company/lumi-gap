import type { UserRole } from "@trend/shared-types";
import { cache, hashKey } from "../../infrastructure/cache.js";
import { publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { loadViewableCommunity } from "./community.service.js";

const CACHE_TTL_SECONDS = 3600;
const MAX_TOPICS = 10;
const RESULT_LIMIT = 5;

export interface RelatedPaper {
  id: string;
  title: string;
  publicationYear: number;
  citationCount: number;
  doi?: string;
}

export interface RelatedGap {
  id: string;
  title: string;
  topic: string;
  description: string;
  gapType: string;
  validationStatus: string;
}

/** Topics used to match research data; falls back to the field and name for communities without topics. */
function matchingTopics(community: { researchTopics: string[]; researchField: string | null; name: string }): string[] {
  const topics = community.researchTopics.length ? community.researchTopics : [community.researchField ?? "", community.name];
  return [...new Set(topics.map((topic) => topic.trim()).filter(Boolean))].slice(0, MAX_TOPICS);
}

/** Research data linked to a community's topics. Pure PostgreSQL full-text search, never an LLM call. */
export const communityRelatedService = {
  async papers(idOrSlug: string, userId?: string, role?: UserRole): Promise<RelatedPaper[]> {
    const { community } = await loadViewableCommunity(idOrSlug, userId, role);
    const topics = matchingTopics(community);
    if (topics.length === 0) return [];
    const key = `community:related-papers:v1:${community.id}:${hashKey(topics)}`;
    const cached = await cache.get<RelatedPaper[]>(key);
    if (cached) return cached;

    const tsquery = Prisma.sql`(${Prisma.join(topics.map((topic) => Prisma.sql`websearch_to_tsquery('simple', ${topic}::text)`), " || ")})`;
    const rows = await getPrisma().$queryRaw<Array<{ id: string; legacy_mongo_id: string | null; title: string; publication_year: number; citation_count: number; doi: string | null }>>(Prisma.sql`
      SELECT "id", "legacy_mongo_id", "title", "publication_year", "citation_count", "doi"
      FROM "papers"
      WHERE "data_status" = 'active' AND "search_document" @@ ${tsquery}
      ORDER BY ts_rank("search_document", ${tsquery}) * ln(2 + "citation_count") DESC, "publication_year" DESC
      LIMIT ${RESULT_LIMIT}`);
    const papers = rows.map((row) => ({
      id: publicDatabaseId({ id: row.id, legacyMongoId: row.legacy_mongo_id }),
      title: row.title,
      publicationYear: Number(row.publication_year),
      citationCount: Number(row.citation_count),
      doi: row.doi ?? undefined,
    }));
    await cache.set(key, papers, CACHE_TTL_SECONDS);
    return papers;
  },

  async gaps(idOrSlug: string, userId?: string, role?: UserRole): Promise<RelatedGap[]> {
    const { community } = await loadViewableCommunity(idOrSlug, userId, role);
    const topics = matchingTopics(community);
    if (topics.length === 0) return [];
    const key = `community:related-gaps:v1:${community.id}:${hashKey(topics)}`;
    const cached = await cache.get<RelatedGap[]>(key);
    if (cached) return cached;

    const rows = await getPrisma().researchGap.findMany({
      where: {
        status: "active",
        forumShareable: true,
        OR: topics.flatMap((topic) => [
          { normalizedTopic: { contains: topic.toLowerCase() } },
          { title: { contains: topic, mode: "insensitive" as const } },
        ]),
      },
      orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
      take: RESULT_LIMIT,
    });
    const gaps = rows.map((row) => ({
      id: publicDatabaseId(row),
      title: row.title,
      topic: row.topic,
      description: row.description.slice(0, 240),
      gapType: row.gapType,
      validationStatus: row.validationStatus,
    }));
    await cache.set(key, gaps, CACHE_TTL_SECONDS);
    return gaps;
  },
};
