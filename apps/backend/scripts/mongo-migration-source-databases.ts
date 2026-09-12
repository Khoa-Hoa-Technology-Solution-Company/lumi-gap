/**
 * Lists database names visible to the migration source account. Read-only; use
 * this when a copied connection string defaults to `test` rather than the old
 * application database.
 */
import { env } from "../src/config/env.js";
import { closeMongoConnection, openMongoConnection } from "./lib/mongo-migration.js";

async function main(): Promise<void> {
  if (!env.MIGRATION_SOURCE_MONGODB_URI) {
    throw new Error("MIGRATION_SOURCE_MONGODB_URI is required locally");
  }

  let connection: Awaited<ReturnType<typeof openMongoConnection>> | undefined;
  try {
    connection = await openMongoConnection(env.MIGRATION_SOURCE_MONGODB_URI, env.MIGRATION_SOURCE_DATABASE);
    const result = await connection.getClient().db("admin").admin().listDatabases({ nameOnly: false });
    console.log(
      JSON.stringify(
        result.databases
          .map((database) => ({ name: database.name, sizeOnDiskBytes: database.sizeOnDisk, empty: database.empty }))
          .sort((left, right) => left.name.localeCompare(right.name)),
        null,
        2,
      ),
    );
  } finally {
    await closeMongoConnection(connection);
  }
}

void main().catch((error: unknown) => {
  console.error("Mongo source database discovery failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
