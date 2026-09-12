import crypto from "node:crypto";
import mongoose, { type Connection } from "mongoose";

export const EXPECTED_RUNTIME_COLLECTIONS = [
  "api_providers",
  "api_sync_configs",
  "api_sync_runs",
  "audit_logs",
  "authors",
  "bookmarks",
  "credit_transactions",
  "device_tokens",
  "gap_analyses",
  "gap_research_directions",
  "journals",
  "keywords",
  "llm_analysis_reports",
  "mcp_tool_runs",
  "notifications",
  "paper_downloads",
  "paper_quality_checks",
  "paper_source_records",
  "project_chat_messages",
  "project_team_messages",
  "quality_evaluations",
  "rag_queries",
  "refreshtokens",
  "research_gaps",
  "research_papers",
  "research_projects",
  "research_topics",
  "search_logs",
  "trend_explanations",
  "user_ratings",
  "users",
] as const;

export type CollectionInventory = {
  name: string;
  exactCount?: number;
  estimatedCount: number;
  dataSizeBytes?: number;
  storageSizeBytes?: number;
  indexSizeBytes?: number;
  indexCount: number;
  idRange: { first?: string; last?: string };
};

export type MongoInventory = {
  database: string;
  collections: CollectionInventory[];
  expectedCollectionsMissing: string[];
  totalEstimatedDocuments: number;
};

export async function openMongoConnection(uri: string, databaseName?: string): Promise<Connection> {
  const connection = mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 5,
    ...(databaseName ? { dbName: databaseName } : {}),
  });
  await connection.asPromise();
  if (!connection.db) {
    await connection.close();
    throw new Error("Mongo connection did not expose a database handle");
  }
  return connection;
}

export async function closeMongoConnection(connection: Connection | undefined): Promise<void> {
  if (connection) await connection.close();
}

export async function inspectDatabase(connection: Connection, options: { exactCounts: boolean }): Promise<MongoInventory> {
  const db = connection.db;
  if (!db) throw new Error("Mongo connection has no database handle");

  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const inventory = await Promise.all(
    collections
      .map((collection) => collection.name)
      .sort((left, right) => left.localeCompare(right))
      .map((name) => inspectCollection(connection, name, { exactCounts: options.exactCounts })),
  );

  const names = new Set(inventory.map((collection) => collection.name));
  return {
    database: db.databaseName,
    collections: inventory,
    expectedCollectionsMissing: EXPECTED_RUNTIME_COLLECTIONS.filter((name) => !names.has(name)),
    totalEstimatedDocuments: inventory.reduce((total, collection) => total + collection.estimatedCount, 0),
  };
}

async function inspectCollection(
  connection: Connection,
  name: string,
  options: { exactCounts: boolean },
): Promise<CollectionInventory> {
  const db = connection.db;
  if (!db) throw new Error("Mongo connection has no database handle");

  const collection = db.collection(name);
  const [estimatedCount, exactCount, indexes, first, last, stats] = await Promise.all([
    collection.estimatedDocumentCount(),
    options.exactCounts ? collection.countDocuments({}) : Promise.resolve(undefined),
    collection.listIndexes().toArray(),
    collection.find({}, { projection: { _id: 1 } }).sort({ _id: 1 }).limit(1).next(),
    collection.find({}, { projection: { _id: 1 } }).sort({ _id: -1 }).limit(1).next(),
    collectionStats(db, name),
  ]);

  return {
    name,
    estimatedCount,
    exactCount,
    indexCount: indexes.length,
    idRange: { first: printableId(first?._id), last: printableId(last?._id) },
    dataSizeBytes: stats?.dataSize,
    storageSizeBytes: stats?.storageSize,
    indexSizeBytes: stats?.totalIndexSize,
  };
}

async function collectionStats(
  db: NonNullable<Connection["db"]>,
  name: string,
): Promise<{ dataSize?: number; storageSize?: number; totalIndexSize?: number } | undefined> {
  try {
    const result = await db.command({ collStats: name, scale: 1 });
    return {
      dataSize: numberValue(result.dataSize),
      storageSize: numberValue(result.storageSize),
      totalIndexSize: numberValue(result.totalIndexSize),
    };
  } catch {
    // Application credentials may intentionally lack collStats. Inventory still
    // reports count/index information and makes the missing capacity signal visible.
    return undefined;
  }
}

export async function fingerprintCollection(connection: Connection, collectionName: string): Promise<string> {
  const db = connection.db;
  if (!db) throw new Error("Mongo connection has no database handle");

  const hash = crypto.createHash("sha256");
  const cursor = db.collection(collectionName).find({}).sort({ _id: 1 }).batchSize(500);
  for await (const document of cursor) {
    hash.update(JSON.stringify(canonicalize(document)));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Buffer.isBuffer(value)) return { $binary: value.toString("base64") };
  if (Array.isArray(value)) return value.map(canonicalize);

  const maybeObjectId = value as { toHexString?: () => string };
  if (typeof maybeObjectId.toHexString === "function") return { $oid: maybeObjectId.toHexString() };

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, canonicalize(nestedValue)]),
  );
}

function printableId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const maybeObjectId = value as { toHexString?: () => string };
  return typeof maybeObjectId.toHexString === "function" ? maybeObjectId.toHexString() : String(value);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
