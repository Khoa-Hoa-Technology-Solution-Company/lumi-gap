/**
 * Fills forum_posts.topic_keys / derived_topic_keys / derived_topic_weights for every post that is not deleted.
 * Idempotent (only rows whose keys changed are written) and never deletes anything. It is the same function the
 * `recompute-forum-topics` queue job runs.
 *
 * Run: pnpm --filter backend personalization:backfill-topics
 */
import { disconnectRedis } from "../src/infrastructure/redis.js";
import { connectPostgres, disconnectPostgres } from "../src/infrastructure/database/prisma.js";
import { recomputeAllPostTopics } from "../src/modules/personalization/personalization-topics.service.js";

async function closeConnections(): Promise<void> {
  await disconnectPostgres().catch(() => undefined);
  await disconnectRedis().catch(() => undefined);
}

async function main(): Promise<void> {
  const log = console.log;
  await connectPostgres();
  const result = await recomputeAllPostTopics();
  log(`vocabulary terms : ${result.vocabularySize}`);
  log(`over-frequent    : ${result.droppedTerms}`);
  log(`posts scanned    : ${result.scanned}`);
  log(`posts updated    : ${result.updated}`);
  log(`posts unchanged  : ${result.unchanged}`);
  log(`posts with topics: ${result.withTopics}`);
  await closeConnections();
  // Importing the topic service creates a BullMQ queue (its own Redis connection), which keeps the process alive.
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await closeConnections();
  process.exit(1);
});
