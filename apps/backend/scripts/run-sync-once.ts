/**
 * Run one OpenAlex sync directly (no queue, no HTTP) — the fastest way to
 * verify the whole ingest pipeline against the live API + real Atlas.
 *
 * Run: pnpm --filter backend sync:once ["search text"] [maxPages]
 * e.g. pnpm --filter backend sync:once "large language model education" 1
 */
import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { runSync } from "../src/modules/api-sync/sync.service.js";
import { logger } from "../src/infrastructure/logger.js";

async function main() {
  await connectMongo();

  const searchText = process.argv[2] ?? "large language model education";
  const maxPages = Number(process.argv[3] ?? 1);

  const run = await runSync({ searchText, yearFrom: 2022, maxPages });

  logger.info(
    {
      runId: run._id.toString(),
      status: run.runStatus,
      fetched: run.totalFetched,
      inserted: run.totalInserted,
      updated: run.totalUpdated,
      duplicates: run.totalDuplicates,
    },
    "sync:once finished",
  );

  await disconnectMongo();
  process.exit(run.runStatus === "succeeded" ? 0 : 1);
}

main().catch((err) => {
  logger.fatal({ err }, "sync:once failed");
  process.exit(1);
});
