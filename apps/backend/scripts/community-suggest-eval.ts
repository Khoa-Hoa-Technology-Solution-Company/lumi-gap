/**
 * Print the nearest communities (and similarity) for sample queries, to pick COMMUNITY_SUGGEST_MIN_SIMILARITY.
 * Read-only. Needs a real GEMINI_API_KEY and communities that already have embeddings.
 *
 * Run: pnpm --filter backend eval:community-suggest "machine learning" "học máy"
 *      pnpm --filter backend eval:community-suggest --file queries.txt
 */
import { readFileSync } from "node:fs";
import { env } from "../src/config/env.js";
import { disconnectRedis } from "../src/infrastructure/redis.js";
import { connectPostgres, disconnectPostgres, getPrisma } from "../src/infrastructure/database/prisma.js";
import { nearestCommunityIds } from "../src/modules/communities/community-embedding.service.js";
import { getEmbeddingProvider } from "../src/modules/embeddings/embedding.factory.js";

function readQueries(argv: string[]): string[] {
  const fileIndex = argv.indexOf("--file");
  if (fileIndex === -1) return argv.map((query) => query.trim()).filter(Boolean);
  const path = argv[fileIndex + 1];
  if (!path) throw new Error("--file needs a path");
  return readFileSync(path, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  const log = console.log;
  const queries = readQueries(process.argv.slice(2));
  if (queries.length === 0) throw new Error('Pass queries as arguments or use --file queries.txt');

  await connectPostgres();
  const provider = getEmbeddingProvider();
  const threshold = env.COMMUNITY_SUGGEST_MIN_SIMILARITY;
  log(`threshold (COMMUNITY_SUGGEST_MIN_SIMILARITY) = ${threshold}\n`);
  log("query | community | similarity");

  const summary: Array<{ query: string; kept: number; total: number }> = [];
  for (const query of queries) {
    const vector = await provider.embed(query);
    const nearest = await nearestCommunityIds(vector, { limit: 5, minSimilarity: 0 });
    const rows = nearest.length
      ? await getPrisma().community.findMany({ where: { id: { in: nearest.map((row) => row.id) } }, select: { id: true, name: true } })
      : [];
    const names = new Map(rows.map((row) => [row.id, row.name]));
    for (const row of nearest) log(`${query} | ${names.get(row.id) ?? row.id} | ${row.similarity.toFixed(3)}`);
    if (nearest.length === 0) log(`${query} | (no embedded communities) | -`);
    summary.push({ query, kept: nearest.filter((row) => row.similarity >= threshold).length, total: nearest.length });
  }

  log("\nkept at current threshold (of top 5):");
  for (const row of summary) log(`  ${row.kept}/${row.total}  ${row.query}`);
  await closeConnections();
  // Importing the embedding service also creates BullMQ queues (their own Redis connections), which keep the process alive.
  process.exit(0);
}

// Embeddings go through the Redis-backed cache, which opens an ioredis connection that keeps the process alive.
async function closeConnections(): Promise<void> {
  await disconnectPostgres().catch(() => undefined);
  await disconnectRedis().catch(() => undefined);
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  await closeConnections();
  process.exit(1);
});
