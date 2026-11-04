import type { UserRole } from "@trend/shared-types";
import { cache, hashKey } from "../../infrastructure/cache.js";
import { publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { loadViewableCommunity } from "./community.service.js";
import { searchPapersByTopics, type RelatedPaper } from "./related-papers.query.js";

const CACHE_TTL_SECONDS = 3600;
const MAX_TOPICS = 10;
const RESULT_LIMIT = 5;

export type { RelatedPaper };

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

    const papers = await searchPapersByTopics(topics, RESULT_LIMIT);
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
