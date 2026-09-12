/**
 * Controlled Mongo-to-Mongo migration runner.
 *
 * Default mode is read-only dry-run. Copying requires all explicit safeguards:
 *   pnpm --filter backend mongo:migration-copy -- --execute \
 *     --confirm-database=<target-db-name> --backup-reference=<verified-backup-id>
 *
 * MONGODB_URI is the target. MIGRATION_SOURCE_MONGODB_URI is the old database.
 * The runner never drops target collections. It preserves _id values and uses
 * idempotent replaceOne upserts, so a failed copy can be resumed with --resume.
 */
import type { IndexDescription, IndexDescriptionInfo } from "mongodb";

import { env } from "../src/config/env.js";
import { closeMongoConnection, fingerprintCollection, inspectDatabase, openMongoConnection } from "./lib/mongo-migration.js";

const COPY_BATCH_SIZE = 500;

type Arguments = {
  execute: boolean;
  resume: boolean;
  confirmDatabase?: string;
  backupReference?: string;
};

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const sourceUri = env.MIGRATION_SOURCE_MONGODB_URI;
  if (!sourceUri) {
    throw new Error("MIGRATION_SOURCE_MONGODB_URI is required locally; the API never reads it at runtime.");
  }
  if (sameMongoTarget(sourceUri, env.MONGODB_URI)) {
    throw new Error("Source and target MongoDB URIs resolve to the same database. Refusing to self-migrate.");
  }

  let sourceConnection: Awaited<ReturnType<typeof openMongoConnection>> | undefined;
  let targetConnection: Awaited<ReturnType<typeof openMongoConnection>> | undefined;

  try {
    [sourceConnection, targetConnection] = await Promise.all([
      openMongoConnection(sourceUri, env.MIGRATION_SOURCE_DATABASE),
      openMongoConnection(env.MONGODB_URI),
    ]);
    const sourceDb = sourceConnection.db;
    const targetDb = targetConnection.db;
    if (!sourceDb || !targetDb) throw new Error("Source or target Mongo connection has no database handle");

    const [sourceInventory, targetInventory] = await Promise.all([
      inspectDatabase(sourceConnection, { exactCounts: true }),
      inspectDatabase(targetConnection, { exactCounts: true }),
    ]);
    const plan = buildPlan(sourceInventory, targetInventory, args);

    if (!args.execute) {
      console.log(JSON.stringify({ mode: "dry-run", ...plan }, null, 2));
      return;
    }

    assertExecutionGuards(args, targetDb.databaseName, plan);
    for (const collection of plan.collections) {
      await copyCollection(sourceConnection, targetConnection, collection.name);
    }

    const verification = await verifyCopiedData(sourceConnection, targetConnection, plan.collections.map((collection) => collection.name));
    console.log(JSON.stringify({ mode: "execute", backupReference: args.backupReference, plan, verification }, null, 2));
    if (!verification.passed) process.exitCode = 2;
  } finally {
    await Promise.all([closeMongoConnection(sourceConnection), closeMongoConnection(targetConnection)]);
  }
}

function parseArguments(args: string[]): Arguments {
  const value = (prefix: string) => args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  return {
    execute: args.includes("--execute"),
    resume: args.includes("--resume"),
    confirmDatabase: value("--confirm-database="),
    backupReference: value("--backup-reference="),
  };
}

function buildPlan(
  source: Awaited<ReturnType<typeof inspectDatabase>>,
  target: Awaited<ReturnType<typeof inspectDatabase>>,
  args: Arguments,
) {
  const targetByName = new Map(target.collections.map((collection) => [collection.name, collection]));
  return {
    sourceDatabase: source.database,
    targetDatabase: target.database,
    sourceDocuments: source.totalEstimatedDocuments,
    targetDocumentsBeforeCopy: target.totalEstimatedDocuments,
    collections: source.collections.map((sourceCollection) => {
      const targetCollection = targetByName.get(sourceCollection.name);
      return {
        name: sourceCollection.name,
        sourceCount: sourceCollection.exactCount ?? sourceCollection.estimatedCount,
        targetCountBeforeCopy: targetCollection?.exactCount ?? targetCollection?.estimatedCount ?? 0,
        requiresResume: Boolean((targetCollection?.exactCount ?? targetCollection?.estimatedCount ?? 0) > 0),
      };
    }),
    mode: args.execute ? "execute" : "dry-run",
  };
}

function assertExecutionGuards(
  args: Arguments,
  targetDatabase: string,
  plan: ReturnType<typeof buildPlan>,
): void {
  if (args.confirmDatabase !== targetDatabase) {
    throw new Error(`Refusing copy: pass --confirm-database=${targetDatabase} to confirm the target database.`);
  }
  if (!args.backupReference || args.backupReference.trim().length < 3) {
    throw new Error("Refusing copy: pass --backup-reference=<verified-backup-id-or-location> after a restore-tested backup.");
  }
  if (!args.resume && plan.collections.some((collection) => collection.requiresResume)) {
    throw new Error("Target contains documents. Refusing to mix data; verify it, empty it through an approved runbook, or rerun with --resume.");
  }
}

async function copyCollection(
  sourceConnection: Awaited<ReturnType<typeof openMongoConnection>>,
  targetConnection: Awaited<ReturnType<typeof openMongoConnection>>,
  collectionName: string,
): Promise<void> {
  const sourceDb = sourceConnection.db;
  const targetDb = targetConnection.db;
  if (!sourceDb || !targetDb) throw new Error("Source or target Mongo connection has no database handle");

  const sourceCollection = sourceDb.collection(collectionName);
  const targetCollection = targetDb.collection(collectionName);
  await ensureTargetCollection(targetDb, collectionName);
  await copyIndexes(collectionName, sourceCollection, targetCollection);

  let batch: Record<string, unknown>[] = [];
  const cursor = sourceCollection.find({}).sort({ _id: 1 }).batchSize(COPY_BATCH_SIZE);
  for await (const document of cursor) {
    batch.push(document);
    if (batch.length >= COPY_BATCH_SIZE) {
      await writeBatch(targetCollection, batch);
      batch = [];
    }
  }
  if (batch.length > 0) await writeBatch(targetCollection, batch);
}

async function ensureTargetCollection(
  database: NonNullable<Awaited<ReturnType<typeof openMongoConnection>>["db"]>,
  collectionName: string,
): Promise<void> {
  const existing = await database.listCollections({ name: collectionName }, { nameOnly: true }).hasNext();
  if (!existing) await database.createCollection(collectionName);
}

async function copyIndexes(
  collectionName: string,
  sourceCollection: ReturnType<NonNullable<Awaited<ReturnType<typeof openMongoConnection>>["db"]>["collection"]>,
  targetCollection: ReturnType<NonNullable<Awaited<ReturnType<typeof openMongoConnection>>["db"]>["collection"]>,
): Promise<void> {
  const [sourceIndexes, targetIndexes] = await Promise.all([
    sourceCollection.indexInformation({ full: true }),
    targetCollection.indexInformation({ full: true }),
  ]);
  const targetByName = new Map(targetIndexes.map((index) => [index.name, index]));
  const definitions = sourceIndexes
    .filter((index) => index.name !== "_id_")
    // The target installs paper_search_text explicitly with language_override
    // set to textSearchLanguage. Copying the legacy title_text index would
    // reintroduce OpenAlex ISO language codes that Mongo text search rejects.
    .filter((index) => !(collectionName === "research_papers" && isTextIndex(index)))
    .map(toIndexDefinition)
    .filter((definition): definition is IndexDescription => definition !== undefined)
    .filter((definition) => {
      const existing = targetByName.get(definition.name);
      if (!existing) return true;
      if (canonicalIndexKey(existing) !== canonicalIndexKey(definition)) {
        throw new Error(`Index ${definition.name} exists on the target with a different key. Resolve this schema drift before copying.`);
      }

      // A target index can be intentionally stricter (for example `unique`)
      // than an old source index. Never weaken it during a data migration.
      if (Boolean(existing.unique) !== Boolean(definition.unique)) {
        console.warn(`Keeping existing target index ${definition.name}; unique option differs from source.`);
      }
      return false;
    });
  if (definitions.length > 0) await targetCollection.createIndexes(definitions);
}

function canonicalIndexKey(index: Pick<IndexDescriptionInfo, "key" | "weights"> | IndexDescription): string {
  const key = index.key;
  const weights = "weights" in index && index.weights && typeof index.weights === "object" ? index.weights : undefined;
  if (key && Object.prototype.hasOwnProperty.call(key, "_fts") && weights) {
    return JSON.stringify(Object.keys(weights).sort().map((field) => [field, "text"]));
  }
  return JSON.stringify(Object.entries(key ?? {}).sort(([left], [right]) => left.localeCompare(right)));
}

function isTextIndex(index: Pick<IndexDescriptionInfo, "key">): boolean {
  return Boolean(index.key && Object.prototype.hasOwnProperty.call(index.key, "_fts"));
}

function toIndexDefinition(index: IndexDescriptionInfo): IndexDescription | undefined {
  if (!index.key || !index.name) return undefined;
  // listIndexes() on older/self-managed Mongo versions may return optional
  // booleans as `null`. createIndexes() rejects null, so preserve only values
  // that are explicitly supported by the target driver/server contract.
  const isTextIndex = Object.prototype.hasOwnProperty.call(index.key, "_fts");
  const textWeights = isTextIndex && index.weights && typeof index.weights === "object" ? index.weights : undefined;
  if (isTextIndex && (!textWeights || Object.keys(textWeights).length === 0)) {
    throw new Error(`Cannot reconstruct text index ${index.name}: source metadata has no text field weights.`);
  }

  const definition: IndexDescription = {
    // MongoDB exposes an existing text index internally as {_fts, _ftsx}.
    // createIndexes requires the original fields, reconstructed from weights.
    key: isTextIndex
      ? Object.fromEntries(Object.keys(textWeights!).map((field) => [field, "text"]))
      : index.key,
    name: index.name,
  };
  if (index.background === true) definition.background = true;
  if (index.unique === true) definition.unique = true;
  if (index.sparse === true) definition.sparse = true;
  if (typeof index.expireAfterSeconds === "number") definition.expireAfterSeconds = index.expireAfterSeconds;
  if (index.partialFilterExpression) definition.partialFilterExpression = index.partialFilterExpression;
  if (index.collation) definition.collation = index.collation;
  if (index.hidden === true) definition.hidden = true;
  if (isTextIndex) {
    const textOptions = definition as IndexDescription & {
      weights?: Record<string, number>;
      default_language?: string;
      language_override?: string;
      textIndexVersion?: number;
    };
    textOptions.weights = textWeights as Record<string, number>;
    if (typeof index.default_language === "string") textOptions.default_language = index.default_language;
    if (typeof index.language_override === "string") textOptions.language_override = index.language_override;
    if (typeof index.textIndexVersion === "number") textOptions.textIndexVersion = index.textIndexVersion;
  }
  return definition;
}

async function writeBatch(
  targetCollection: ReturnType<NonNullable<Awaited<ReturnType<typeof openMongoConnection>>["db"]>["collection"]>,
  documents: Record<string, unknown>[],
): Promise<void> {
  await targetCollection.bulkWrite(
    documents.map((document) => ({
      replaceOne: {
        filter: { _id: document._id },
        replacement: document,
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

async function verifyCopiedData(
  sourceConnection: Awaited<ReturnType<typeof openMongoConnection>>,
  targetConnection: Awaited<ReturnType<typeof openMongoConnection>>,
  collectionNames: string[],
): Promise<{
  passed: boolean;
  collections: Array<{
    name: string;
    sourceCount: number;
    targetCount: number;
    countMatches: boolean;
    sourceHash: string;
    targetHash: string;
    hashMatches: boolean;
  }>;
}> {
  const sourceDb = sourceConnection.db;
  const targetDb = targetConnection.db;
  if (!sourceDb || !targetDb) throw new Error("Source or target Mongo connection has no database handle");

  const collections = await Promise.all(
    collectionNames.map(async (name) => {
      const [sourceCount, targetCount, sourceHash, targetHash] = await Promise.all([
        sourceDb.collection(name).countDocuments({}),
        targetDb.collection(name).countDocuments({}),
        fingerprintCollection(sourceConnection, name),
        fingerprintCollection(targetConnection, name),
      ]);
      return {
        name,
        sourceCount,
        targetCount,
        countMatches: sourceCount === targetCount,
        sourceHash,
        targetHash,
        hashMatches: sourceHash === targetHash,
      };
    }),
  );
  return {
    passed: collections.every((collection) => collection.countMatches && collection.hashMatches),
    collections,
  };
}

function sameMongoTarget(sourceUri: string, targetUri: string): boolean {
  return normalizeMongoUri(sourceUri) === normalizeMongoUri(targetUri);
}

function normalizeMongoUri(uri: string): string {
  return uri.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@").replace(/\/?$/, "");
}

void main().catch((error: unknown) => {
  console.error("Mongo migration copy failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
