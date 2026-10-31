/**
 * Loads the OpenAlex taxonomy (domains, fields, subfields, topics) into research_topics, then links the
 * stored papers/keywords to it and refreshes the counts. Idempotent: re-run any time.
 *
 * Run: pnpm --filter backend taxonomy:sync
 *      pnpm --filter backend taxonomy:sync --levels domain,field
 *      pnpm --filter backend taxonomy:sync --skip-backfill
 */
import "../src/config/env.js";
import { disconnectRedis } from "../src/infrastructure/redis.js";
import { connectPostgres, disconnectPostgres } from "../src/infrastructure/database/prisma.js";
import { logger } from "../src/infrastructure/logger.js";
import { taxonomyBackfillService } from "../src/modules/taxonomy/taxonomy-backfill.service.js";
import { taxonomySyncService } from "../src/modules/taxonomy/taxonomy-sync.service.js";
import { TAXONOMY_LEVELS, type TaxonomyLevel } from "../src/modules/taxonomy/taxonomy.normalize.js";

function parseLevels(argv: string[]): TaxonomyLevel[] | undefined {
  const index = argv.indexOf("--levels");
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value) throw new Error("--levels needs a comma-separated list, e.g. --levels domain,field");
  const levels = value.split(",").map((level) => level.trim()).filter(Boolean);
  const invalid = levels.filter((level) => !(TAXONOMY_LEVELS as readonly string[]).includes(level));
  if (invalid.length > 0) throw new Error(`Unknown level(s): ${invalid.join(", ")}. Use ${TAXONOMY_LEVELS.join(", ")}`);
  return levels as TaxonomyLevel[];
}

async function closeConnections(): Promise<void> {
  await disconnectPostgres().catch(() => undefined);
  await disconnectRedis().catch(() => undefined);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const levels = parseLevels(argv);
  const skipBackfill = argv.includes("--skip-backfill");

  await connectPostgres();
  const synced = await taxonomySyncService.syncAll({ levels });
  console.table(synced);

  if (skipBackfill) {
    console.log("backfill skipped (--skip-backfill)");
  } else {
    const backfill = await taxonomyBackfillService.backfillAll();
    await taxonomyBackfillService.refreshCounts();
    console.table(backfill);
  }
  await closeConnections();
  process.exit(0);
}

main().catch(async (err) => {
  logger.error({ err }, "taxonomy sync failed");
  console.error(err instanceof Error ? err.message : err);
  await closeConnections();
  process.exit(1);
});
