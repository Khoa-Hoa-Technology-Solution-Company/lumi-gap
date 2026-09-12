/**
 * Read-only source/target migration verifier. MONGODB_URI is the target and
 * MIGRATION_SOURCE_MONGODB_URI is the old database. --exact performs exact
 * counts; --hash streams every document in _id order and compares a canonical
 * SHA-256 fingerprint, so it should be used during a planned maintenance window.
 *
 * Run: pnpm --filter backend mongo:migration-verify -- --exact
 *      pnpm --filter backend mongo:migration-verify -- --exact --hash
 */
import { env } from "../src/config/env.js";
import {
  closeMongoConnection,
  fingerprintCollection,
  inspectDatabase,
  openMongoConnection,
  type CollectionInventory,
} from "./lib/mongo-migration.js";

type CollectionVerification = {
  name: string;
  sourceCount: number;
  targetCount: number;
  countMatches: boolean;
  sourceIdRange: CollectionInventory["idRange"];
  targetIdRange: CollectionInventory["idRange"];
  idRangeMatches: boolean;
  sourceHash?: string;
  targetHash?: string;
  hashMatches?: boolean;
};

async function main(): Promise<void> {
  const sourceUri = env.MIGRATION_SOURCE_MONGODB_URI;
  if (!sourceUri) {
    throw new Error("MIGRATION_SOURCE_MONGODB_URI is required locally for migration verification.");
  }

  const exactCounts = process.argv.includes("--exact");
  const hashCollections = process.argv.includes("--hash");
  let sourceConnection: Awaited<ReturnType<typeof openMongoConnection>> | undefined;
  let targetConnection: Awaited<ReturnType<typeof openMongoConnection>> | undefined;

  try {
    [sourceConnection, targetConnection] = await Promise.all([
      openMongoConnection(sourceUri, env.MIGRATION_SOURCE_DATABASE),
      openMongoConnection(env.MONGODB_URI),
    ]);
    const [source, target] = await Promise.all([
      inspectDatabase(sourceConnection, { exactCounts }),
      inspectDatabase(targetConnection, { exactCounts }),
    ]);

    const sourceByName = new Map(source.collections.map((collection) => [collection.name, collection]));
    const targetByName = new Map(target.collections.map((collection) => [collection.name, collection]));
    const collectionNames = [...new Set([...sourceByName.keys(), ...targetByName.keys()])].sort((left, right) =>
      left.localeCompare(right),
    );
    const results: CollectionVerification[] = [];

    for (const name of collectionNames) {
      const sourceCollection = sourceByName.get(name);
      const targetCollection = targetByName.get(name);
      const sourceCount = sourceCollection?.exactCount ?? sourceCollection?.estimatedCount ?? 0;
      const targetCount = targetCollection?.exactCount ?? targetCollection?.estimatedCount ?? 0;
      const result: CollectionVerification = {
        name,
        sourceCount,
        targetCount,
        countMatches: Boolean(sourceCollection && targetCollection && sourceCount === targetCount),
        sourceIdRange: sourceCollection?.idRange ?? {},
        targetIdRange: targetCollection?.idRange ?? {},
        idRangeMatches: Boolean(
          sourceCollection &&
            targetCollection &&
            sourceCollection.idRange.first === targetCollection.idRange.first &&
            sourceCollection.idRange.last === targetCollection.idRange.last,
        ),
      };

      if (hashCollections && sourceCollection && targetCollection) {
        [result.sourceHash, result.targetHash] = await Promise.all([
          fingerprintCollection(sourceConnection, name),
          fingerprintCollection(targetConnection, name),
        ]);
        result.hashMatches = result.sourceHash === result.targetHash;
      }
      results.push(result);
    }

    const passed = results.every(
      (result) => result.countMatches && result.idRangeMatches && (result.hashMatches === undefined || result.hashMatches),
    );
    console.log(
      JSON.stringify(
        {
          sourceDatabase: source.database,
          targetDatabase: target.database,
          exactCounts,
          hashCollections,
          passed,
          collections: results,
        },
        null,
        2,
      ),
    );
    if (!passed) process.exitCode = 2;
  } finally {
    await Promise.all([closeMongoConnection(sourceConnection), closeMongoConnection(targetConnection)]);
  }
}

void main().catch((error: unknown) => {
  console.error("Mongo migration verification failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
