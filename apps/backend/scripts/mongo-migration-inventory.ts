/**
 * Read-only inventory of the old database used before a migration rehearsal.
 * Requires MIGRATION_SOURCE_MONGODB_URI in the local .env. The running API does
 * not use that variable.
 *
 * Run: pnpm --filter backend mongo:migration-inventory
 *      pnpm --filter backend mongo:migration-inventory -- --exact
 */
import { env } from "../src/config/env.js";
import { closeMongoConnection, inspectDatabase, openMongoConnection } from "./lib/mongo-migration.js";

async function main(): Promise<void> {
  const sourceUri = env.MIGRATION_SOURCE_MONGODB_URI;
  if (!sourceUri) {
    throw new Error("MIGRATION_SOURCE_MONGODB_URI is required locally for inventory; it is intentionally not used by the API.");
  }

  let connection: Awaited<ReturnType<typeof openMongoConnection>> | undefined;
  try {
    connection = await openMongoConnection(sourceUri, env.MIGRATION_SOURCE_DATABASE);
    const inventory = await inspectDatabase(connection, { exactCounts: process.argv.includes("--exact") });
    console.log(JSON.stringify(inventory, null, 2));
  } finally {
    await closeMongoConnection(connection);
  }
}

void main().catch((error: unknown) => {
  console.error("Mongo migration inventory failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
