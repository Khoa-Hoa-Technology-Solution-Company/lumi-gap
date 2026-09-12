/**
 * Read-only operational preflight for the database configured as MONGODB_URI.
 * It never creates collections, indexes, users, backups, or data.
 *
 * Run: pnpm --filter backend mongo:preflight
 *      pnpm --filter backend mongo:preflight -- --require-replica-set --require-tls
 */
import mongoose from "mongoose";

import { env } from "../src/config/env.js";
import { closeMongoConnection, inspectDatabase, openMongoConnection } from "./lib/mongo-migration.js";

type HelloResponse = {
  setName?: unknown;
  isWritablePrimary?: unknown;
  logicalSessionTimeoutMinutes?: unknown;
  msg?: unknown;
  maxWireVersion?: unknown;
};

async function main(): Promise<void> {
  const requireReplicaSet = process.argv.includes("--require-replica-set");
  const requireTls = process.argv.includes("--require-tls");
  let connection: mongoose.Connection | undefined;

  try {
    connection = await openMongoConnection(env.MONGODB_URI);
    const db = connection.db;
    if (!db) throw new Error("Mongo connection has no database handle");

    const [hello, buildInfo, inventory] = await Promise.all([
      db.admin().command({ hello: 1 }) as Promise<HelloResponse>,
      db.admin().command({ buildInfo: 1 }) as Promise<{ version?: unknown }>,
      inspectDatabase(connection, { exactCounts: false }),
    ]);

    const tlsRequested = isTlsRequested(env.MONGODB_URI);
    const replicaSetName = stringValue(hello.setName);
    const transactionCapable = Boolean(replicaSetName && hello.logicalSessionTimeoutMinutes !== undefined);
    const vectorCapability = await inspectVectorCapability(db);
    const findings = [
      ...(tlsRequested ? [] : ["TLS is not requested by MONGODB_URI. Production cutover must use TLS."]),
      ...(replicaSetName ? [] : ["No replica set reported. Transactions and high availability are not confirmed."]),
      ...(vectorCapability.status === "supported" ? [] : [vectorCapability.message]),
      ...(inventory.expectedCollectionsMissing.length
        ? [`Expected runtime collections missing: ${inventory.expectedCollectionsMissing.join(", ")}`]
        : []),
    ];

    const report = {
      database: inventory.database,
      mongoVersion: stringValue(buildInfo.version) ?? "unknown",
      topology: {
        replicaSetName: replicaSetName ?? null,
        writablePrimary: Boolean(hello.isWritablePrimary),
        transactionCapable,
        router: hello.msg === "isdbgrid",
      },
      transport: { tlsRequested },
      vectorCapability,
      inventory: {
        collectionCount: inventory.collections.length,
        totalEstimatedDocuments: inventory.totalEstimatedDocuments,
        expectedCollectionsMissing: inventory.expectedCollectionsMissing,
      },
      findings,
    };

    console.log(JSON.stringify(report, null, 2));

    if ((requireReplicaSet && !replicaSetName) || (requireTls && !tlsRequested)) {
      process.exitCode = 2;
    }
  } finally {
    await closeMongoConnection(connection);
  }
}

async function inspectVectorCapability(db: NonNullable<mongoose.Connection["db"]>): Promise<{
  status: "supported" | "not-confirmed";
  message: string;
}> {
  try {
    await db.collection("research_papers").listSearchIndexes().toArray();
    return { status: "supported", message: "Search-index listing is supported; create/query validation is still required." };
  } catch {
    return {
      status: "not-confirmed",
      message: "Atlas/search-index capability is not available to this connection. Keep semantic retrieval gated until a vector path is validated.",
    };
  }
}

function isTlsRequested(uri: string): boolean {
  if (uri.startsWith("mongodb+srv://")) return true;
  try {
    const parsed = new URL(uri);
    return parsed.searchParams.get("tls") === "true" || parsed.searchParams.get("ssl") === "true";
  } catch {
    return false;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

void main().catch((error: unknown) => {
  console.error("Mongo preflight failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
