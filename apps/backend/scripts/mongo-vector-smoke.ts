/**
 * Read-only Vector Search readiness check for the configured Mongo database.
 * It never creates or alters an index. A configured index is required before
 * the query probe can run.
 *
 * Run: pnpm --filter backend mongo:vector-smoke
 */
import { closeMongoConnection, openMongoConnection } from "./lib/mongo-migration.js";
import { env } from "../src/config/env.js";
import {
  FILTERED_PAPER_VECTOR_INDEX,
  PAPER_VECTOR_FILTER_PATHS,
} from "../src/modules/retrieval/paper-vector-index.js";

type SearchIndex = {
  name?: string;
  type?: string;
  status?: string;
  latestDefinition?: {
    fields?: Array<{
      type?: string;
      path?: string;
      numDimensions?: number;
      similarity?: string;
    }>;
  };
};

async function main(): Promise<void> {
  let connection: Awaited<ReturnType<typeof openMongoConnection>> | undefined;

  try {
    connection = await openMongoConnection(env.MONGODB_URI);
    const db = connection.db;
    if (!db) throw new Error("Mongo connection has no database handle");

    const indexes = (await db.collection("research_papers").listSearchIndexes().toArray()) as SearchIndex[];
    const vectorIndexes = indexes.filter((index) => index.type === "vectorSearch" || index.latestDefinition?.fields?.some((field) => field.type === "vector"));
    const summary = vectorIndexes.map((index) => ({
      name: index.name ?? null,
      type: index.type ?? null,
      status: index.status ?? null,
      vectorFields: (index.latestDefinition?.fields ?? [])
        .filter((field) => field.type === "vector")
        .map((field) => ({ path: field.path ?? null, dimensions: field.numDimensions ?? null, similarity: field.similarity ?? null })),
    }));

    const configured = vectorIndexes.find((index) => index.name === env.MONGODB_VECTOR_INDEX_NAME);
    const configuredSummary = summary.find((index) => index.name === env.MONGODB_VECTOR_INDEX_NAME);
    if (!configured || configuredSummary?.status !== "READY") {
      console.log(JSON.stringify({
        ready: false,
        configuredIndex: env.MONGODB_VECTOR_INDEX_NAME,
        indexes: summary,
        message: "The configured research_papers vector index is not READY.",
      }, null, 2));
      process.exitCode = 2;
      return;
    }

    const vector = configuredSummary.vectorFields.find((field) => field.path === "embedding");
    if (vector?.dimensions !== 768 || vector.similarity !== "cosine") {
      console.log(JSON.stringify({ ready: false, indexes: summary, message: "READY index does not match embedding: 768 dimensions, cosine." }, null, 2));
      process.exitCode = 2;
      return;
    }

    if (env.MONGODB_VECTOR_INDEX_NAME === FILTERED_PAPER_VECTOR_INDEX) {
      const filterPaths = new Set(
        (configured.latestDefinition?.fields ?? [])
          .filter((field) => field.type === "filter")
          .map((field) => field.path),
      );
      const missing = PAPER_VECTOR_FILTER_PATHS.filter((path) => !filterPaths.has(path));
      if (missing.length > 0) {
        console.log(JSON.stringify({
          ready: false,
          configuredIndex: env.MONGODB_VECTOR_INDEX_NAME,
          indexes: summary,
          message: `Configured index is missing filters: ${missing.join(", ")}`,
        }, null, 2));
        process.exitCode = 2;
        return;
      }
    }

    const probe = await db.collection("research_papers").aggregate([
      {
        $vectorSearch: {
          index: env.MONGODB_VECTOR_INDEX_NAME,
          path: "embedding",
          queryVector: Array.from({ length: 768 }, () => 0.001),
          numCandidates: 20,
          limit: 1,
          filter: { dataStatus: "active" },
        },
      },
      { $project: { _id: 1 } },
    ]).toArray();

    console.log(JSON.stringify({
      ready: true,
      configuredIndex: env.MONGODB_VECTOR_INDEX_NAME,
      indexes: summary,
      queryProbeReturned: probe.length,
    }, null, 2));
  } finally {
    await closeMongoConnection(connection);
  }
}

void main().catch((error: unknown) => {
  console.error("Mongo vector smoke check failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
