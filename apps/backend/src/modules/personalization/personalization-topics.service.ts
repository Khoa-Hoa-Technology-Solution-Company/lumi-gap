import { Prisma } from "../../generated/prisma/client.js";
import { cache } from "../../infrastructure/cache.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { taggingQueue } from "../../infrastructure/queue.js";
import {
  buildVocabulary, extractPostTopics, overfrequentTerms, topicsChanged,
  type ExtractedTopics, type PostTopicInput, type Vocabulary, type VocabularySource,
} from "./personalization.topics.js";
import { PERSONALIZATION } from "./personalization.constants.js";

export const RECOMPUTE_FORUM_TOPICS_JOB = "recompute-forum-topics";
const RECOMPUTE_BATCH_SIZE = 200;
const OVERFREQUENT_CACHE_KEY = "personalization:overfrequent:v1";
const OVERFREQUENT_CACHE_TTL_SECONDS = 3600;

type Db = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

export interface TopicContext {
  vocab: Vocabulary;
  /** Terms skipped for title/body matching because too many posts contain them. */
  dropped: Set<string>;
}

export interface RecomputeResult {
  vocabularySize: number;
  droppedTerms: number;
  scanned: number;
  updated: number;
  unchanged: number;
  withTopics: number;
  /** Posts edited between the read and the write: left alone, the edit path already recomputed them. */
  skippedConcurrent: number;
}

interface PostRow {
  id: string;
  tags: string[];
  title: string;
  body: string;
  paper_keywords: string[];
  topic_keys: string[];
  derived_topic_keys: string[];
  derived_topic_weights: number[];
  /** Full-precision text of updated_at: a JS Date would drop microseconds and break the equality guard. */
  updated_at_text: string;
}

/** Raw rows of the vocabulary V: community topics, keyword catalogue, and every user's multi-word terms. */
export async function loadVocabularySource(db: Db = getPrisma()): Promise<VocabularySource> {
  const [topics, keywords, userTerms] = await Promise.all([
    db.$queryRaw<Array<{ term: string }>>(Prisma.sql`
      SELECT DISTINCT unnest("research_topics") AS term FROM "communities"
      WHERE "is_forum_category" = false AND "status" = 'ACTIVE'`),
    db.$queryRaw<Array<{ id: string; keyword_name: string; normalized_name: string; aliases: string[]; status: string; merged_into_id: string | null }>>(Prisma.sql`
      SELECT "id", "keyword_name", "normalized_name", "aliases", "status", "merged_into_id" FROM "keywords"
      WHERE "status" IN ('active', 'merged')`),
    db.$queryRaw<Array<{ term: string }>>(Prisma.sql`
      SELECT unnest("research_interests") AS term FROM "users"
      UNION SELECT "label" AS term FROM "user_topic_follows"`),
  ]);
  return {
    communityTopics: topics.map((row) => row.term),
    keywords: keywords.map((row) => ({ id: row.id, keywordName: row.keyword_name, normalizedName: row.normalized_name, aliases: row.aliases, status: row.status, mergedIntoId: row.merged_into_id })),
    userTerms: userTerms.map((row) => row.term),
  };
}

export async function loadVocabulary(db: Db = getPrisma()): Promise<Vocabulary> {
  return buildVocabulary(await loadVocabularySource(db));
}

/** Active posts, title and the scanned part of the body only: enough to measure how common a term is. */
async function loadCorpus(db: Db): Promise<PostTopicInput[]> {
  const rows = await db.$queryRaw<Array<{ tags: string[]; title: string; body: string }>>(Prisma.sql`
    SELECT "tags", "title", left("body", ${PERSONALIZATION.BODY_SCAN_CHARS}::int) AS body FROM "forum_posts"
    WHERE "status" IN ('active', 'locked') AND "visibility_status" = 'ACTIVE'`);
  return rows.map((row) => ({ tags: row.tags, title: row.title, body: row.body, paperKeywordNames: [] }));
}

async function computeDropped(vocab: Vocabulary, db: Db): Promise<Set<string>> {
  // The rule is off below OVERFREQUENT_MIN_CORPUS posts: count first so small corpora are never loaded.
  const [counted] = await db.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
    SELECT count(*) AS total FROM "forum_posts" WHERE "status" IN ('active', 'locked') AND "visibility_status" = 'ACTIVE'`);
  if (Number(counted?.total ?? 0) < PERSONALIZATION.OVERFREQUENT_MIN_CORPUS) {
    await cache.set(OVERFREQUENT_CACHE_KEY, [], OVERFREQUENT_CACHE_TTL_SECONDS);
    return new Set();
  }
  const dropped = overfrequentTerms(await loadCorpus(db), vocab);
  await cache.set(OVERFREQUENT_CACHE_KEY, [...dropped], OVERFREQUENT_CACHE_TTL_SECONDS);
  return dropped;
}

/** Vocabulary plus the over-frequent filter. `fresh` skips the cached filter (used by the recompute job). */
export async function loadTopicContext(options: { fresh?: boolean; db?: Db } = {}): Promise<TopicContext> {
  const db = options.db ?? getPrisma();
  const vocab = await loadVocabulary(db);
  const cached = options.fresh ? null : await cache.get<string[]>(OVERFREQUENT_CACHE_KEY);
  return { vocab, dropped: cached ? new Set(cached) : await computeDropped(vocab, db) };
}

/** Same as `loadTopicContext` but never throws: a failure only means the topic keys are filled in by the next recompute. */
export async function tryLoadTopicContext(): Promise<TopicContext | null> {
  try {
    return await loadTopicContext();
  } catch (error) {
    logger.warn({ err: error }, "personalization topic context unavailable; post topics will be filled by the next recompute");
    return null;
  }
}

async function loadPostRows(db: Db, ids: readonly string[]): Promise<PostRow[]> {
  if (ids.length === 0) return [];
  return db.$queryRaw<PostRow[]>(Prisma.sql`
    SELECT p."id", p."tags", p."title", left(p."body", ${PERSONALIZATION.BODY_SCAN_CHARS}::int) AS body,
      p."topic_keys", p."derived_topic_keys", p."derived_topic_weights", p."updated_at"::text AS updated_at_text,
      COALESCE(ARRAY(
        SELECT DISTINCT COALESCE(k."keyword_name", pk."keyword_name")
        FROM "paper_keywords" pk LEFT JOIN "keywords" k ON k."id" = pk."keyword_id"
        WHERE pk."paper_id" = p."linked_paper_id"
           OR pk."paper_id" IN (SELECT fpp."paper_id" FROM "forum_post_papers" fpp WHERE fpp."post_id" = p."id")
      ), '{}') AS paper_keywords
    FROM "forum_posts" p WHERE p."id" = ANY(${ids as string[]}::uuid[])`);
}

const inputOf = (row: PostRow): PostTopicInput => ({ tags: row.tags, title: row.title, body: row.body, paperKeywordNames: row.paper_keywords });

/**
 * Raw UPDATE so `updated_at` is never touched. With `expectedUpdatedAt` the write only happens if the post has not
 * been edited since it was read (optimistic check); the result is the number of rows written (0 = edited meanwhile).
 */
async function writeTopics(db: Db, id: string, topics: ExtractedTopics, expectedUpdatedAt?: string): Promise<number> {
  const guard = expectedUpdatedAt === undefined ? Prisma.empty : Prisma.sql`AND "updated_at" = ${expectedUpdatedAt}::timestamptz`;
  return db.$executeRaw(Prisma.sql`
    UPDATE "forum_posts" SET "topic_keys" = ${topics.topicKeys}::text[], "derived_topic_keys" = ${topics.derivedKeys}::text[],
      "derived_topic_weights" = ${topics.derivedWeights}::real[] WHERE "id" = ${id}::uuid ${guard}`);
}

/** Recomputes and stores the topic keys of one post. Call it inside the create/edit transaction. */
export async function refreshPostTopics(db: Db, postId: string, context: TopicContext | null): Promise<void> {
  if (!context) return;
  const [row] = await loadPostRows(db, [postId]);
  if (!row) return;
  await writeTopics(db, postId, extractPostTopics(inputOf(row), context.vocab, context.dropped));
}

/**
 * Recomputes every post that is not deleted, in batches. Idempotent: rows whose keys and weights do not change are
 * not written, and nothing is ever deleted. The queue job and the CLI backfill both call this.
 */
export async function recomputeAllPostTopics(options: { db?: Db; batchSize?: number; onlyIds?: readonly string[] } = {}): Promise<RecomputeResult> {
  const db = options.db ?? getPrisma();
  const batchSize = options.batchSize ?? RECOMPUTE_BATCH_SIZE;
  const context = await loadTopicContext({ fresh: true, db });
  const result: RecomputeResult = { vocabularySize: context.vocab.size, droppedTerms: context.dropped.size, scanned: 0, updated: 0, unchanged: 0, withTopics: 0, skippedConcurrent: 0 };

  // `onlyIds` narrows a run to specific posts (targeted backfills and tests); without it every post is recomputed.
  const onlyIds = options.onlyIds ? Prisma.sql`AND "id" = ANY(${options.onlyIds as string[]}::uuid[])` : Prisma.empty;
  let cursor = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const ids = (await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "forum_posts" WHERE "status" <> 'deleted' AND "id" > ${cursor}::uuid ${onlyIds}
      ORDER BY "id" LIMIT ${batchSize}::int`)).map((row) => row.id);
    if (ids.length === 0) break;
    cursor = ids[ids.length - 1]!;
    for (const row of await loadPostRows(db, ids)) {
      const next = extractPostTopics(inputOf(row), context.vocab, context.dropped);
      result.scanned += 1;
      if (next.topicKeys.length + next.derivedKeys.length > 0) result.withTopics += 1;
      if (topicsChanged({ topicKeys: row.topic_keys, derivedTopicKeys: row.derived_topic_keys, derivedTopicWeights: row.derived_topic_weights }, next)) {
        // A post edited after we read it keeps the topics its own edit computed: do not overwrite them with stale data.
        if ((await writeTopics(db, row.id, next, row.updated_at_text)) === 0) result.skippedConcurrent += 1;
        else result.updated += 1;
      } else result.unchanged += 1;
    }
  }
  return result;
}

/** Bumped by every change that can alter the vocabulary; the recompute job re-runs while it keeps moving. */
export const VOCAB_VERSION_KEY = "personalization:vocab-version";
export const MAX_RECOMPUTE_PASSES = 3;

export interface VersionedRecomputeResult {
  result: RecomputeResult;
  passes: number;
  /** The version the last pass ran against (null when Redis was unavailable). */
  settledVersion: number | null;
  /** Stopped at the pass cap while the version was still moving: the caller must queue another job. */
  capped: boolean;
}

/**
 * Runs the recompute and repeats it while the vocabulary version changed during the pass, at most MAX_RECOMPUTE_PASSES
 * times. A change made while the job runs is therefore never lost. Without Redis: one pass and a warning.
 */
export async function runVersionedRecompute(deps: {
  recompute?: () => Promise<RecomputeResult>;
  readVersion?: () => Promise<number | null>;
  maxPasses?: number;
} = {}): Promise<VersionedRecomputeResult> {
  const recompute = deps.recompute ?? (() => recomputeAllPostTopics());
  const readVersion = deps.readVersion ?? (() => cache.getInt(VOCAB_VERSION_KEY));
  const maxPasses = deps.maxPasses ?? MAX_RECOMPUTE_PASSES;
  let version = await readVersion();
  let passes = 0;
  for (;;) {
    const result = await recompute();
    passes += 1;
    if (version === null) {
      logger.warn("vocabulary version unavailable (Redis); ran a single forum topic recompute pass");
      return { result, passes, settledVersion: null, capped: false };
    }
    const after = await readVersion();
    if (after === null) {
      logger.warn("vocabulary version unreadable after a recompute pass; not repeating");
      return { result, passes, settledVersion: null, capped: false };
    }
    if (after === version) return { result, passes, settledVersion: version, capped: false };
    if (passes >= maxPasses) {
      logger.warn({ passes, version, after }, "vocabulary kept changing during the forum topic recompute; stopped at the pass cap");
      return { result, passes, settledVersion: version, capped: true };
    }
    version = after;
  }
}

/**
 * Fire-and-forget (pattern of `enqueueCommunityEmbedding`): the returned promise never rejects, so a request is never
 * failed. It bumps the vocabulary version first (so a running job repeats), then adds the job with a fixed id (a burst
 * collapses into one waiting job). Finished jobs are removed at once, otherwise BullMQ would ignore the next add.
 * An INCR failure is logged and the job is still queued.
 */
export async function enqueueRecomputeForumTopics(options: { bump?: boolean } = {}): Promise<void> {
  try {
    if (options.bump !== false) {
      const version = await cache.incr(VOCAB_VERSION_KEY);
      if (version === null) logger.warn("could not bump the vocabulary version; a running recompute may miss this change");
    }
  } catch (err) {
    logger.warn({ err }, "could not bump the vocabulary version");
  }
  try {
    await taggingQueue.add(RECOMPUTE_FORUM_TOPICS_JOB, {}, { jobId: RECOMPUTE_FORUM_TOPICS_JOB, removeOnComplete: true, removeOnFail: true });
  } catch (err) {
    logger.warn({ err }, "failed to enqueue forum topic recompute");
  }
}

/**
 * Called when a recompute job finished. A change that arrived while the job was still active (its add was ignored by
 * the fixed job id) or after the pass cap leaves the version ahead of what the job settled on: queue one more job.
 */
export async function requeueIfVersionAdvanced(outcome: Pick<VersionedRecomputeResult, "settledVersion" | "capped">): Promise<void> {
  if (outcome.capped) { await enqueueRecomputeForumTopics({ bump: false }); return; }
  if (outcome.settledVersion === null) return;
  const current = await cache.getInt(VOCAB_VERSION_KEY);
  if (current !== null && current > outcome.settledVersion) await enqueueRecomputeForumTopics({ bump: false });
}
