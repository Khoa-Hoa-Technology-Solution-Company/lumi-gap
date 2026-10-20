/**
 * Read-only report to pick the two embedding thresholds of the gap pipeline:
 *   GAP_PROBE_SEMANTIC_MIN_SIMILARITY  (semantic probe matching; 0 = off)
 *   GAP_COUNTER_MIN_SIMILARITY         (possible counter-evidence)
 * For each phrase (a probe topic, or a gap's title + description) it prints how many active papers match its words,
 * how many more a cosine threshold would add, and the nearest papers with their similarity. Read the titles around
 * each threshold: pick the lowest value where they are still about the phrase.
 * Needs a real GEMINI_API_KEY and papers that already have embeddings.
 *
 * Run: pnpm --filter backend eval:gaps "federated learning" "học liên kết"
 *      pnpm --filter backend eval:gaps --file phrases.txt
 */
import { readFileSync } from "node:fs";
import { env } from "../src/config/env.js";
import { Prisma } from "../src/generated/prisma/client.js";
import { disconnectRedis } from "../src/infrastructure/redis.js";
import { connectPostgres, disconnectPostgres, getPrisma } from "../src/infrastructure/database/prisma.js";
import { vectorParameter } from "../src/infrastructure/database/postgres-paper-search.js";
import { getEmbeddingProvider } from "../src/modules/embeddings/embedding.factory.js";
import { buildProbeTsQuery } from "../src/modules/gaps/gap-probe-query.js";

const THRESHOLDS = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85];

function readPhrases(argv: string[]): string[] {
  const fileIndex = argv.indexOf("--file");
  if (fileIndex === -1) return argv.map((phrase) => phrase.trim()).filter(Boolean);
  const path = argv[fileIndex + 1];
  if (!path) throw new Error("--file needs a path");
  return readFileSync(path, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const log = console.log;
  const phrases = readPhrases(process.argv.slice(2));
  if (phrases.length === 0) throw new Error("Pass phrases as arguments or use --file phrases.txt");

  await connectPostgres();
  const prisma = getPrisma();
  const vectors = await getEmbeddingProvider().embedBatch(phrases);
  log(`current GAP_PROBE_SEMANTIC_MIN_SIMILARITY = ${env.GAP_PROBE_SEMANTIC_MIN_SIMILARITY}, GAP_COUNTER_MIN_SIMILARITY = ${env.GAP_COUNTER_MIN_SIMILARITY}\n`);

  for (const [index, phrase] of phrases.entries()) {
    const vector = vectorParameter(vectors[index]!);
    const tsquery = buildProbeTsQuery(phrase);
    const lexical = tsquery ? Prisma.sql`"search_document" @@ to_tsquery('simple', ${tsquery})` : Prisma.sql`false`;
    const [counts] = await prisma.$queryRaw<Array<Record<string, number>>>(Prisma.sql`
      SELECT count(*) FILTER (WHERE ${lexical})::int AS lexical,
        ${Prisma.join(THRESHOLDS.map((t) => Prisma.sql`count(*) FILTER (WHERE NOT (${lexical}) AND "embedding" IS NOT NULL AND 1 - ("embedding" <=> ${vector}::vector) >= ${t})::int AS ${Prisma.raw(`"added_${Math.round(t * 100)}"`)}`), ", ")}
      FROM "papers" WHERE "data_status" = 'active'`);
    const nearest = await prisma.$queryRaw<Array<{ title: string; similarity: number; lexical: boolean }>>(Prisma.sql`
      SELECT title, (1 - ("embedding" <=> ${vector}::vector))::double precision AS similarity, (${lexical}) AS lexical
      FROM "papers" WHERE "data_status" = 'active' AND "embedding" IS NOT NULL
      ORDER BY "embedding" <=> ${vector}::vector LIMIT 10`);

    log(`=== ${phrase}`);
    log(`  word matches: ${counts?.lexical ?? 0}`);
    log(`  added by cosine >= t (papers without the words): ${THRESHOLDS.map((t) => `${t}: ${counts?.[`added_${Math.round(t * 100)}`] ?? 0}`).join(", ")}`);
    log("  nearest papers (similarity, * = also a word match):");
    for (const row of nearest) log(`    ${row.similarity.toFixed(3)} ${row.lexical ? "*" : " "} ${row.title.slice(0, 110)}`);
    log("");
  }
  await closeConnections();
  process.exit(0);
}

// Embeddings go through the Redis-backed cache, which opens an ioredis connection that keeps the process alive.
async function closeConnections(): Promise<void> {
  await disconnectPostgres().catch(() => undefined);
  await disconnectRedis().catch(() => undefined);
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await closeConnections();
  process.exit(1);
});
