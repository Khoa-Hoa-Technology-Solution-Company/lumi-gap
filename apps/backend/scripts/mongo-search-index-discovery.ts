/**
 * Read-only discovery of MongoDB Search / Vector Search indexes visible to the
 * configured account across every database and collection.
 *
 * Run: pnpm --filter backend mongo:discover-search-indexes
 */
import { closeMongoConnection, openMongoConnection } from "./lib/mongo-migration.js";
import { env } from "../src/config/env.js";

type SearchIndex = {
  name?: string;
  type?: string;
  status?: string;
  latestDefinition?: { fields?: Array<{ type?: string; path?: string; numDimensions?: number; similarity?: string }> };
};

async function main(): Promise<void> {
  let connection: Awaited<ReturnType<typeof openMongoConnection>> | undefined;

  try {
    connection = await openMongoConnection(env.MONGODB_URI);
    const client = connection.getClient();
    const databases = await client.db("admin").admin().listDatabases({ nameOnly: true });
    const matches: Array<{ database: string; collection: string; indexes: unknown[] }> = [];
    const skipped: Array<{ database: string; collection: string; reason: string }> = [];

    for (const database of databases.databases) {
      if (database.name === "admin" || database.name === "config" || database.name === "local") continue;
      const db = client.db(database.name);
      const collections = await db.listCollections({}, { nameOnly: true }).toArray();

      for (const collection of collections) {
        try {
          const indexes = (await db.collection(collection.name).listSearchIndexes().toArray()) as SearchIndex[];
          if (indexes.length) {
            matches.push({
              database: database.name,
              collection: collection.name,
              indexes: indexes.map((index) => ({
                name: index.name ?? null,
                type: index.type ?? null,
                status: index.status ?? null,
                fields: index.latestDefinition?.fields ?? [],
              })),
            });
          }
        } catch (error) {
          skipped.push({
            database: database.name,
            collection: collection.name,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    console.log(JSON.stringify({ matches, scannedDatabaseCount: databases.databases.length, skipped }, null, 2));
  } finally {
    await closeMongoConnection(connection);
  }
}

void main().catch((error: unknown) => {
  console.error("Mongo Search index discovery failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
