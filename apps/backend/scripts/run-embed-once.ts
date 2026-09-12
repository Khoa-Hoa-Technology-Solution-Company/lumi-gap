/**
 * Run one embedding pass directly (no queue/worker) — the fastest way to
 * vectorise the corpus and verify the pipeline end-to-end against live Gemini.
 * Run: pnpm --filter backend embed:once
 */
import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { logger } from "../src/infrastructure/logger.js";
import { runEmbedding } from "../src/modules/embeddings/embedding.service.js";

async function main() {
  await connectMongo();
  const result = await runEmbedding({});
  logger.info(result, "embed:once finished");
  await disconnectMongo();
  process.exit(0);
}

main().catch((err) => {
  logger.fatal({ err }, "embed:once failed");
  process.exit(1);
});
