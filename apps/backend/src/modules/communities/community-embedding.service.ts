import { env } from "../../config/env.js";
import { Prisma } from "../../generated/prisma/client.js";
import { vectorParameter } from "../../infrastructure/database/postgres-paper-search.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { embeddingQueue } from "../../infrastructure/queue.js";
import { getEmbeddingProvider } from "../embeddings/embedding.factory.js";
import { buildEmbeddingProvenance } from "../embeddings/embedding.service.js";

export const COMMUNITY_EMBEDDING_JOB = "community-embedding";
const MAX_EMBEDDING_TEXT_LENGTH = 2000;
/** Safety cap so a run can never loop forever on rows that keep failing to update. */
const MAX_COMMUNITIES_PER_RUN = 1000;

export function communityEmbeddingText(community: {
  name: string;
  researchField?: string | null;
  researchTopics?: string[] | null;
  description?: string | null;
}): string {
  return [
    community.name,
    community.researchField,
    (community.researchTopics ?? []).join(", "),
    community.description,
  ]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_EMBEDDING_TEXT_LENGTH);
}

export interface CommunityEmbeddingRunResult {
  totalEmbedded: number;
}

/**
 * Embeds ACTIVE communities whose vector is missing or stale for the configured provider.
 * `ids` restricts the run to specific communities (used by tests and targeted backfills).
 */
export async function runCommunityEmbedding(options: { ids?: string[] } = {}): Promise<CommunityEmbeddingRunResult> {
  const provider = getEmbeddingProvider();
  const batchSize = env.EMBED_BATCH_SIZE;
  let totalEmbedded = 0;
  let seen = 0;

  while (seen < MAX_COMMUNITIES_PER_RUN) {
    const candidates = await getPrisma().$queryRaw<Array<{
      id: string;
      name: string;
      researchField: string | null;
      researchTopics: string[];
      description: string;
      updatedAtText: string;
    }>>(Prisma.sql`
      SELECT id, name, research_field AS "researchField", research_topics AS "researchTopics",
             description, updated_at::text AS "updatedAtText"
      FROM communities
      WHERE status = 'ACTIVE'
        AND is_forum_category = false
        ${options.ids?.length ? Prisma.sql`AND id = ANY(${[...options.ids]}::uuid[])` : Prisma.empty}
        AND (
          embedding IS NULL
          OR embedding_model IS DISTINCT FROM ${provider.modelName}
          OR embedding_version IS DISTINCT FROM ${provider.modelVersion}
          OR embedding_dimensions IS DISTINCT FROM ${provider.dimensions}
        )
      ORDER BY member_count DESC, id
      LIMIT ${batchSize}
    `);
    if (candidates.length === 0) break;
    seen += candidates.length;

    // Rethrow on failure so the BullMQ job fails and retries with backoff.
    const vectors = await provider.embedBatch(candidates.map(communityEmbeddingText));
    if (
      vectors.length !== candidates.length
      || vectors.some((vector) => vector.length !== provider.dimensions)
    ) {
      throw new Error(
        `Community embedding batch shape mismatch: expected ${candidates.length} vectors of ${provider.dimensions} dimensions`,
      );
    }

    const provenance = buildEmbeddingProvenance(provider);
    const results = await Promise.all(candidates.map((community, index) => getPrisma().$executeRaw(Prisma.sql`
      UPDATE communities
      SET embedding = CAST(${vectorParameter(vectors[index]!)} AS vector),
          embedding_model = ${provenance.embeddingModel},
          embedding_version = ${provenance.embeddingVersion},
          embedding_dimensions = ${provenance.embeddingDimensions},
          embedding_updated_at = ${provenance.embeddingUpdatedAt}
      WHERE id = CAST(${community.id} AS uuid)
        AND status = 'ACTIVE'
        AND updated_at = CAST(${community.updatedAtText} AS timestamptz)
    `)));
    // updated_at is deliberately left untouched, and the predicate above skips
    // rows edited since they were read so a stale vector is never written. A row
    // touched mid-run (e.g. join/leave bumps updated_at) is picked up by the next
    // run or the daily EMBED_CRON.
    const written = results.reduce((sum, count) => sum + count, 0);
    totalEmbedded += written;
    if (written === 0) break;
  }

  logger.info({ totalEmbedded }, "community embedding run completed");
  return { totalEmbedded };
}

/** Fire-and-forget: never blocks or fails the request that changed a community. */
export function enqueueCommunityEmbedding(): void {
  embeddingQueue.add(COMMUNITY_EMBEDDING_JOB, {}).catch((err) => {
    logger.warn({ err }, "failed to enqueue community embedding");
  });
}

export interface NearestCommunity {
  id: string;
  similarity: number;
}

/**
 * Nearest ACTIVE communities by embedding similarity.
 * Visibility must be applied in SQL before LIMIT; post-filtering shrinks the
 * result set (same bug fixed in the retriever, issue #14).
 */
export async function nearestCommunityIds(
  embedding: readonly number[],
  options: {
    limit: number;
    excludeIds?: string[];
    /** Only public communities (recommendations for someone who has not joined). */
    publicOnly?: boolean;
    /** Restrict to what this viewer may see: public, plus the communities they belong to. Admins see all. */
    viewer?: { isAdmin: boolean; memberCommunityIds: string[] };
    /** Defaults to env.COMMUNITY_SUGGEST_MIN_SIMILARITY. */
    minSimilarity?: number;
  },
): Promise<NearestCommunity[]> {
  const vector = Prisma.sql`CAST(${vectorParameter(embedding)} AS vector)`;
  const minSimilarity = options.minSimilarity ?? env.COMMUNITY_SUGGEST_MIN_SIMILARITY;
  const exclude = options.excludeIds?.length
    ? Prisma.sql`AND id <> ALL(${[...options.excludeIds]}::uuid[])`
    : Prisma.empty;
  const viewer = options.viewer;
  const visibility = options.publicOnly
    ? Prisma.sql`AND visibility = 'public'`
    : viewer && !viewer.isAdmin
      ? viewer.memberCommunityIds.length
        ? Prisma.sql`AND (visibility = 'public' OR id = ANY(${[...viewer.memberCommunityIds]}::uuid[]))`
        : Prisma.sql`AND visibility = 'public'`
      : Prisma.empty;
  return getPrisma().$queryRaw<NearestCommunity[]>(Prisma.sql`
    SELECT id, (1 - (embedding <=> ${vector}) / 2.0)::double precision AS similarity
    FROM communities
    WHERE embedding IS NOT NULL
      AND status = 'ACTIVE'
      -- Forum categories live in this table but are not joinable communities; exclude them before LIMIT.
      AND is_forum_category = false
      ${visibility}
      ${exclude}
      AND (1 - (embedding <=> ${vector}) / 2.0) >= ${minSimilarity}
    ORDER BY embedding <=> ${vector}, id
    LIMIT ${options.limit}
  `);
}
